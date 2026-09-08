/**
 * ocrParser.js — Client-side OCR pipeline for Diversay invoice documents.
 * 
 * Pipeline: Image → Canvas preprocessing → Tesseract.js → Raw text → Structured parser → JSON
 * 
 * Tuned for the Diversay Solutions Limited "SALE INVOICE" layout:
 *   - Invoice No: DSL/SA/XXX
 *   - Delivery Note: DSL/DLN/XXX
 *   - Date: dd/mm/yyyy
 *   - Buyer Details block
 *   - Product table: Sr.No | Description | Unit | Qty(Kg) | Qty(Bag) | Rate | Rate/Unit | Disc(%) | Amount
 */
import { createWorker } from 'tesseract.js'

// ─── Persistent Worker ──────────────────────────────────────────────────────
let worker = null

async function getWorker() {
  if (!worker) {
    worker = await createWorker('eng', 1, {
      // Suppress verbose logging in production
      logger: () => { }
    })
    // Optimize for printed text: whitelist common characters
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Assume a single uniform block of text
    })
  }
  return worker
}

/**
 * Terminate the persistent worker to free memory.
 * Call this when the scan page unmounts.
 */
export async function terminateWorker() {
  if (worker) {
    await worker.terminate()
    worker = null
  }
}


// ─── Image Preprocessing ────────────────────────────────────────────────────
/**
 * Converts an image to high-contrast black & white using adaptive thresholding.
 * This dramatically improves OCR accuracy on photos of printed paper
 * (handles shadows, uneven lighting, skewed angles).
 * 
 * @param {HTMLImageElement} imageElement - The loaded image element
 * @returns {HTMLCanvasElement} - Preprocessed canvas ready for OCR
 */
export function preprocessImage(imageElement) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // Cap resolution to prevent memory issues on mobile
  const MAX_DIM = 2500
  let w = imageElement.naturalWidth || imageElement.width
  let h = imageElement.naturalHeight || imageElement.height

  if (w > MAX_DIM || h > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  canvas.width = w
  canvas.height = h
  ctx.drawImage(imageElement, 0, 0, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const data = imageData.data

  // Convert to grayscale and apply Otsu-like threshold
  // Use luminosity formula: 0.299R + 0.587G + 0.114B
  const histogram = new Array(256).fill(0)
  const grayscale = new Uint8Array(w * h)

  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114)
    grayscale[j] = gray
    histogram[gray]++
  }

  // Otsu's method for optimal threshold
  const totalPixels = w * h
  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i]

  let sumBg = 0, weightBg = 0
  let maxVariance = 0, threshold = 128

  for (let t = 0; t < 256; t++) {
    weightBg += histogram[t]
    if (weightBg === 0) continue
    const weightFg = totalPixels - weightBg
    if (weightFg === 0) break

    sumBg += t * histogram[t]
    const meanBg = sumBg / weightBg
    const meanFg = (sumAll - sumBg) / weightFg
    const variance = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg)

    if (variance > maxVariance) {
      maxVariance = variance
      threshold = t
    }
  }

  // Apply threshold to produce clean black & white
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const val = grayscale[j] > threshold ? 255 : 0
    data[i] = data[i + 1] = data[i + 2] = val
    // Keep alpha at 255
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}


// ─── OCR Extraction ─────────────────────────────────────────────────────────
/**
 * Run Tesseract.js OCR on an image source.
 * Handles preprocessing automatically.
 * 
 * @param {string|HTMLImageElement|HTMLCanvasElement|Blob|File} imageSource
 * @param {function} onProgress - Optional progress callback (0-1)
 * @returns {Promise<string>} - Extracted raw text
 */
export async function extractTextFromImage(imageSource, onProgress) {
  const ocrWorker = await getWorker()

  // If it's a File/Blob, load it as an image first for preprocessing
  let processedSource = imageSource

  if (typeof File !== 'undefined' && imageSource instanceof File) {
    const img = await loadImageFromBlob(imageSource)
    const canvas = preprocessImage(img)
    processedSource = canvas
  } else if (typeof Blob !== 'undefined' && imageSource instanceof Blob) {
    const img = await loadImageFromBlob(imageSource)
    const canvas = preprocessImage(img)
    processedSource = canvas
  } else if (typeof HTMLImageElement !== 'undefined' && imageSource instanceof HTMLImageElement) {
    const canvas = preprocessImage(imageSource)
    processedSource = canvas
  }

  const result = await ocrWorker.recognize(processedSource)
  return result.data.text
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (err) => {
      URL.revokeObjectURL(url)
      reject(err)
    }
    img.src = url
  })
}


// ─── Text Parsing (Diversay Invoice Format) ─────────────────────────────────
/**
 * Parse raw OCR text from a Diversay SALE INVOICE into structured data.
 * 
 * The invoice layout:
 *   Header: "SALE INVOICE"
 *   Right box: Invoice No (DSL/SA/XXX), Delivery Note (DSL/DLN/XXX), Date
 *   Buyer Details: Customer name, code, location, contact
 *   Table: product rows with description, unit, qty, rate, amount
 * 
 * @param {string} rawText - Raw OCR output
 * @returns {object} - Structured data object
 */
export function parseDocumentText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = lines.join('\n')

  const result = {
    invoice_number: '',
    waybill_number: '',
    date: '',
    customer_name: '',
    customer_code: '',
    customer_location: '',
    customer_contact: '',
    brand: 'DSL',
    products: [],
    raw_text: rawText
  }

  // ── Extract Invoice Number ──
  // Pattern: "DSL/SA/XXX" or "DSLP/SA/XXX" or "Invoice No" followed by a colon and value
  const invoicePatterns = [
    /(?:DSL[P]?\/SA\/\d+)/gi,
    /Invoice\s*No\.?\s*[:;]\s*([\w\/\-]+)/gi,
    /Inv(?:oice)?\s*#?\s*[:;]?\s*(DSL[P]?\/SA\/\d+)/gi,
  ]

  for (const pattern of invoicePatterns) {
    const match = fullText.match(pattern)
    if (match) {
      let val = match[0]
      // Clean up if it matched with a label prefix
      if (val.includes(':') || val.includes(';')) {
        val = val.split(/[:;]/).pop().trim()
      }
      // Normalize: ensure it looks like DSL/SA/XXX or DSLP/SA/XXX
      const saMatch = val.match(/(DSL[P]?\/SA\/\d+)/i)
      if (saMatch) {
        result.invoice_number = saMatch[1].toUpperCase()
      } else {
        result.invoice_number = val.trim()
      }
      break
    }
  }

  // ── Extract Delivery Note (Waybill) Number ──
  // Pattern: "DSL/DLN/XXX" or "DSLP/DLN/XXX" or "Delivery Note" followed by value
  const waybillPatterns = [
    /(?:DSL[P]?\/DLN\/\d+)/gi,
    /Delivery\s*Note\s*[:;]\s*([\w\/\-]+)/gi,
    /Waybill\s*(?:No\.?)?\s*[:;]?\s*([\w\/\-]+)/gi,
    /DLN\s*[:;]?\s*([\w\/\-]+)/gi,
  ]

  for (const pattern of waybillPatterns) {
    const match = fullText.match(pattern)
    if (match) {
      let val = match[0]
      if (val.includes(':') || val.includes(';')) {
        val = val.split(/[:;]/).pop().trim()
      }
      const dlnMatch = val.match(/(DSL[P]?\/DLN\/\d+)/i)
      if (dlnMatch) {
        result.waybill_number = dlnMatch[1].toUpperCase()
      } else {
        result.waybill_number = val.trim()
      }
      break
    }
  }

  // ── Determine brand from invoice/waybill prefix ──
  if (result.invoice_number.startsWith('DSLP') || result.waybill_number.startsWith('DSLP')) {
    result.brand = 'DSLP'
  }

  // ── Extract Date ──
  // Patterns: dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
  const datePatterns = [
    /Date\s*[:;]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
  ]

  for (const pattern of datePatterns) {
    const match = fullText.match(pattern)
    if (match) {
      result.date = match[1].trim()
      break
    }
  }

  // ── Extract Customer / Buyer Details ──
  // Look for "Buyer Details:" block, then the next bold/capitalized line is the customer name
  const buyerIdx = lines.findIndex(l => /buyer\s*details/i.test(l))
  if (buyerIdx >= 0) {
    // Customer name is usually the next line after "Buyer Details:"
    for (let i = buyerIdx + 1; i < Math.min(buyerIdx + 6, lines.length); i++) {
      const line = lines[i]

      // Customer name — typically ALL CAPS or Title Case, not starting with labels
      if (!result.customer_name && !line.match(/^(Customer|Contact|Reverse|PAN|FSSAI|D\.?L)/i)) {
        // It's the customer name if it's mostly uppercase or substantial text
        if (line.length > 2 && !line.match(/^\d+$/)) {
          result.customer_name = line.replace(/[^\w\s\-&'.]/g, '').trim()
        }
      }

      // Customer Code
      const codeMatch = line.match(/Customer\s*Code\s*[:;]?\s*([\d\w]+)/i)
      if (codeMatch) {
        result.customer_code = codeMatch[1].trim()
      }

      // Location: look for state/city patterns (e.g., "JOS JOS" or "LAGOS, LAGOS")
      if (!result.customer_location && !line.match(/^(Customer|Contact|Reverse|PAN|FSSAI|D\.?L|Buyer)/i)) {
        const locMatch = line.match(/^([A-Z][A-Z\s,]+)(?:,?\s*Contact)/i)
        if (locMatch) {
          result.customer_location = locMatch[1].trim()
        }
      }

      // Contact number
      const contactMatch = line.match(/Contact\s*No\.?\s*[:;]?\s*([\d\+\-\s]+)/i)
      if (contactMatch) {
        result.customer_contact = contactMatch[1].replace(/\s/g, '').trim()
      }
    }

    // Fallback: if location not found from the labeled line, check for standalone city lines
    if (!result.customer_location) {
      for (let i = buyerIdx + 1; i < Math.min(buyerIdx + 6, lines.length); i++) {
        const line = lines[i]
        // Pattern like "JOS JOS" or "LAGOS LAGOS" (city followed by state)
        if (line.match(/^[A-Z]{2,}\s+[A-Z]{2,}/) && !line.match(/Customer|Contact|Reverse|PAN|FSSAI|Buyer|Charge/i)) {
          // Extract just the location part (before any "Contact" text)
          const locPart = line.split(/,?\s*Contact/i)[0].trim()
          if (locPart.length > 2) {
            result.customer_location = locPart
          }
        }
      }
    }
  }

  // ── Extract Product Table Rows ──
  const productLines = []
  let inTable = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect table header (flexible check across split header lines)
    if (!inTable && (/Description/i.test(line) || (/Sr\.?\s*No/i.test(line) || /Qty/i.test(line) || /Rate/i.test(line)))) {
      inTable = true
      continue
    }

    if (/^\s*(Total|Grand\s*Total|Sub\s*Total|Net\s*Amount|DIVERSAY|Checked|Authorized|CHECKED)/i.test(line)) {
      if (inTable && productLines.length > 0) break
    }

    const hasUnit = /\b(Pcs|Bag|Bags|Kg|Kgs|Carton|Cartons|Ctns?|Bott|Bottle|Bottles|Litr|Ltr|Ltrs|Lit|Pack|Pks?|Packs?|Units?)\b/i.test(line)
    const hasNumbers = /\d+[,.]?\d*/.test(line)

    if (hasUnit && hasNumbers) {
      const parsed = parseProductLine(line)
      if (parsed) {
        productLines.push(parsed)
      } else if (productLines.length > 0) {
        const merged = parseNumericSuffix(line, productLines[productLines.length - 1])
        if (merged) {
          productLines[productLines.length - 1] = merged
        }
      }
    } else if (!hasUnit && hasNumbers && inTable && productLines.length > 0) {
      const merged = parseNumericSuffix(line, productLines[productLines.length - 1])
      if (merged) {
        productLines[productLines.length - 1] = merged
      }
    }
  }

  // Fallback: if table header wasn't detected cleanly, scan all lines for product rows
  if (productLines.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/Buyer\s*Details/i.test(line) || /Sale\s*Invoice/i.test(line)) continue
      const hasUnit = /\b(Pcs|Bag|Bags|Kg|Kgs|Carton|Cartons|Ctns?|Bott|Bottle|Bottles|Litr|Ltr|Ltrs|Lit|Pack|Pks?|Packs?|Units?)\b/i.test(line)
      const hasNumbers = /\d+[,.]?\d*/.test(line)
      if (hasUnit && hasNumbers) {
        const parsed = parseProductLine(line)
        if (parsed) {
          productLines.push(parsed)
        } else if (productLines.length > 0) {
          const merged = parseNumericSuffix(line, productLines[productLines.length - 1])
          if (merged) {
            productLines[productLines.length - 1] = merged
          }
        }
      } else if (!hasUnit && hasNumbers && productLines.length > 0) {
        const merged = parseNumericSuffix(line, productLines[productLines.length - 1])
        if (merged) {
          productLines[productLines.length - 1] = merged
        }
      }
    }
  }

  result.products = productLines

  return result
}


/**
 * Parse a single product line from the invoice table.
 * 
 * @param {string} line - A line from the product table
 * @returns {object|null} - { name, unit, quantity, rate, amount } or null
 */
function parseProductLine(line) {
  // Remove leading serial number (e.g., "1 ", "2 ", "1 | ", "2 | ")
  let cleaned = line.replace(/^\s*\d+\s*[|]?\s*/, '')

  const unitMatch = cleaned.match(/\b(Pcs|Bag|Bags|Kg|Kgs|Carton|Cartons|Ctns?|Bott|Bottle|Bottles|Litr|Ltr|Ltrs|Lit|Pack|Pks?|Packs?|Units?)\b/i)
  if (!unitMatch) return null

  const unitIdx = cleaned.indexOf(unitMatch[0])
  let productName = cleaned.substring(0, unitIdx).trim()
  const afterUnit = cleaned.substring(unitIdx)

  // Clean up product name — strip batch codes like [JSR/STR/9510 (with or without closing bracket) and pipes/separators
  productName = productName.split('[')[0].replace(/[|;:\&]/g, '').trim()
  // Remove trailing parenthetical dates like (15/10/2025)
  productName = productName.replace(/\(.*?\)/g, '').trim()

  if (!productName || productName.length < 2) return null

  // Ignore header rows mistakenly matched
  if (/^(Description|Item|Product|Sr|No|Unit|Qty|Rate|Amount)$/i.test(productName)) return null

  // A valid product name must contain at least one letter (a-z) to avoid capturing fragmented numeric lines
  if (!/[a-zA-Z]/.test(productName)) return null

  // Extract all numbers from the remainder
  const numbers = afterUnit.match(/[\d,]+\.?\d*/g) || []
  const parsedNumbers = numbers.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n))

  // Map unit — backend architecture requires all unit types to be saved as Pieces
  const unit = 'Pieces'

  // Determine quantity — typically the Qty(Bag) or Qty(Kg) column
  let quantity = 1
  let rate = 0
  let amount = 0

  if (parsedNumbers.length >= 3) {
    quantity = parsedNumbers[1] || parsedNumbers[0] || 1
    rate = parsedNumbers[2] || 0
    amount = parsedNumbers[parsedNumbers.length - 1] || 0
  } else if (parsedNumbers.length === 2) {
    quantity = parsedNumbers[0] || 1
    amount = parsedNumbers[1] || 0
  } else if (parsedNumbers.length === 1) {
    quantity = parsedNumbers[0] || 1
  }

  return {
    name: productName,
    unit,
    quantity: Math.max(1, Math.round(quantity)),
    rate,
    amount
  }
}


/**
 * Handle numeric suffix on a continuation line (when OCR splits a product row).
 */
function parseNumericSuffix(line, existingProduct) {
  if (!existingProduct) return null
  const numbers = line.match(/[\d,]+\.?\d*/g) || []
  const parsedNumbers = numbers.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n))

  if (parsedNumbers.length >= 2) {
    return {
      ...existingProduct,
      quantity: existingProduct.quantity || parsedNumbers[0],
      amount: parsedNumbers[parsedNumbers.length - 1]
    }
  }
  return null
}


// ─── Fuzzy Entity Matching ──────────────────────────────────────────────────
/**
 * Fuzzy-match an OCR-extracted name against a list of known entities.
 * Uses Levenshtein distance + substring matching for robustness against OCR errors.
 * 
 * @param {string} ocrName - The name extracted by OCR (potentially misspelled)
 * @param {Array} entities - Array of { id, name } objects from the database
 * @param {number} minScore - Minimum similarity score (0-1) to consider a match
 * @returns {{ match: object|null, score: number, confidence: string }}
 */
export function fuzzyMatch(ocrName, entities, minScore = 0.45) {
  if (!ocrName || !entities || entities.length === 0) {
    return { match: null, score: 0, confidence: 'none' }
  }

  const normalizedOcr = ocrName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()

  let bestMatch = null
  let bestScore = 0

  for (const entity of entities) {
    const normalizedEntity = entity.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()

    // Exact match
    if (normalizedOcr === normalizedEntity) {
      return { match: entity, score: 1.0, confidence: 'exact' }
    }

    // Calculate similarity score using multiple methods
    let score = 0

    // 1. Substring containment (either direction)
    if (normalizedOcr.includes(normalizedEntity) || normalizedEntity.includes(normalizedOcr)) {
      const shorter = Math.min(normalizedOcr.length, normalizedEntity.length)
      const longer = Math.max(normalizedOcr.length, normalizedEntity.length)
      score = Math.max(score, shorter / longer)
    }

    // 2. Word overlap (Jaccard similarity on words)
    const ocrWords = normalizedOcr.split(/\s+/)
    const entityWords = normalizedEntity.split(/\s+/)
    const allWords = new Set([...ocrWords, ...entityWords])
    const commonWords = ocrWords.filter(w => entityWords.some(ew =>
      ew === w || ew.includes(w) || w.includes(ew) || levenshteinSimilarity(w, ew) > 0.7
    ))
    const jaccardScore = commonWords.length / allWords.size
    score = Math.max(score, jaccardScore)

    // 3. Levenshtein similarity on full strings
    const levSim = levenshteinSimilarity(normalizedOcr, normalizedEntity)
    score = Math.max(score, levSim)

    // 4. First-word match bonus (important for product names like "WYLDOX TABLET" matching "Wyldox tablet")
    if (ocrWords[0] && entityWords[0]) {
      const firstWordSim = levenshteinSimilarity(ocrWords[0], entityWords[0])
      if (firstWordSim > 0.8) {
        score = Math.max(score, 0.6 + firstWordSim * 0.3)
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = entity
    }
  }

  if (bestScore >= minScore) {
    const confidence = bestScore >= 0.85 ? 'high' : bestScore >= 0.65 ? 'medium' : 'low'
    return { match: bestMatch, score: bestScore, confidence }
  }

  return { match: null, score: bestScore, confidence: 'none' }
}


/**
 * Levenshtein distance-based similarity (0 to 1).
 */
function levenshteinSimilarity(a, b) {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1

  const dist = levenshteinDistance(a, b)
  return 1 - dist / maxLen
}

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }

  return dp[m][n]
}


// ─── Full Pipeline ──────────────────────────────────────────────────────────
/**
 * Complete OCR pipeline: image → text → parsed data → matched entities.
 * 
 * @param {File|Blob} imageFile - The uploaded document image
 * @param {Array} customersList - Array of customer objects from the database
 * @param {Array} productsList - Array of product objects from the database
 * @param {function} onStatusChange - Callback for status updates
 * @returns {Promise<object>} - Final structured and matched order data
 */
export async function processDocumentImage(imageFile, customersList = [], productsList = [], onStatusChange) {
  const status = (msg) => onStatusChange && onStatusChange(msg)

  // Step 1: OCR
  status('Extracting text from image...')
  const rawText = await extractTextFromImage(imageFile)

  // Step 2: Parse
  status('Parsing document structure...')
  const parsed = parseDocumentText(rawText)

  // Step 3: Match entities
  status('Matching customers and products...')

  // Match customer
  let customerMatch = null
  if (parsed.customer_name && customersList.length > 0) {
    const result = fuzzyMatch(parsed.customer_name, customersList.map(c => ({ id: c.id, name: c.name })))
    if (result.match) {
      customerMatch = {
        ...result.match,
        confidence: result.confidence,
        score: result.score,
        ocr_name: parsed.customer_name
      }
    }
  }

  // Match products
  const matchedProducts = parsed.products.map(p => {
    const result = fuzzyMatch(p.name, productsList.map(pr => ({ id: pr.id, name: pr.name })))
    return {
      ...p,
      matched_product: result.match,
      match_confidence: result.confidence,
      match_score: result.score,
      ocr_name: p.name
    }
  })

  // Extract just the numeric suffix from invoice/waybill numbers
  // e.g., "DSL/SA/436" → "436", "DSL/DLN/438" → "438"
  let invoiceSuffix = parsed.invoice_number
  let waybillSuffix = parsed.waybill_number

  const invSuffixMatch = parsed.invoice_number.match(/\/(\d+)$/)
  if (invSuffixMatch) invoiceSuffix = invSuffixMatch[1]

  const wbSuffixMatch = parsed.waybill_number.match(/\/(\d+)$/)
  if (wbSuffixMatch) waybillSuffix = wbSuffixMatch[1]

  status('Complete!')

  return {
    // Raw parsed data
    raw_text: rawText,
    parsed,

    // Matched and form-ready data
    customer: customerMatch,
    brand: parsed.brand,
    invoice_number: invoiceSuffix,
    waybill_number: waybillSuffix,
    invoice_number_full: parsed.invoice_number,
    waybill_number_full: parsed.waybill_number,
    date: parsed.date,
    products: matchedProducts,

    // Metadata
    customer_location: parsed.customer_location,
    customer_contact: parsed.customer_contact
  }
}
