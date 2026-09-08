import { createWorker } from 'tesseract.js';
import fs from 'fs';
import { parseDocumentText, fuzzyMatch } from '../src/utils/ocrParser.js';

async function runEndToEndOCRTest() {
  const imagePath = '/home/abimbola/Desktop/Diversay_bootstrapped/an example of the ocr_image.jpg';
  console.log('=== END-TO-END OCR SCAN TEST ===');
  console.log('1. Loading image file:', imagePath);
  
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Test image file not found at ${imagePath}`);
  }

  // Step 1: Run Tesseract OCR on sample image
  console.log('2. Running Tesseract OCR...');
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
  });

  const { data } = await worker.recognize(imagePath);
  await worker.terminate();

  console.log('\n--- RAW OCR TEXT EXTRACTED ---');
  console.log(data.text);
  console.log('-------------------------------\n');

  // Step 2: Parse raw text
  console.log('3. Parsing raw text with parseDocumentText...');
  const parsed = parseDocumentText(data.text);
  console.log('Parsed Document Data:', JSON.stringify(parsed, null, 2));

  // Assertions on parsed OCR data
  if (parsed.invoice_number !== 'DSL/SA/436') {
    throw new Error(`Expected invoice_number DSL/SA/436, got "${parsed.invoice_number}"`);
  }
  if (parsed.waybill_number !== 'DSL/DLN/438') {
    throw new Error(`Expected waybill_number DSL/DLN/438, got "${parsed.waybill_number}"`);
  }
  if (parsed.customer_name !== 'RAYIAS VETERINARY PHARMACY') {
    throw new Error(`Expected customer_name RAYIAS VETERINARY PHARMACY, got "${parsed.customer_name}"`);
  }
  if (!parsed.products || parsed.products.length === 0) {
    throw new Error('Expected at least 1 parsed product row');
  }

  const prod = parsed.products[0];
  console.log('\nParsed product row:', prod);
  if (!prod.name.includes('DOX TABLET 10GRM')) {
    throw new Error(`Expected product name containing DOX TABLET 10GRM, got "${prod.name}"`);
  }
  if (prod.unit !== 'Pieces') {
    throw new Error(`Expected unit "Pieces", got "${prod.unit}"`);
  }
  if (prod.quantity !== 400) {
    throw new Error(`Expected quantity 400, got "${prod.quantity}"`);
  }

  console.log('✓ OCR text extraction and document parsing passed!');

  // Step 3: Simulate applyScanDataToForm in CreateOrderModal
  console.log('\n4. Simulating frontend applyScanDataToForm logic...');

  const mockCustomers = [
    { id: 501, name: 'RAYIAS VETERINARY PHARMACY', state: 'JOS' }
  ];
  const mockProducts = [
    { id: 101, name: 'WYLDOX TABLET 10GRM' },
    { id: 102, name: 'QUINCIN TABLET' }
  ];

  const rawCustomerName = (parsed.customer_name || '').trim();
  const customerRes = fuzzyMatch(rawCustomerName, mockCustomers.map(c => ({ id: c.id, name: c.name })));
  let customerId = '';
  let customerSearchQuery = rawCustomerName;
  if (customerRes.match) {
    const foundC = mockCustomers.find(c => c.id === customerRes.match.id);
    if (foundC) {
      customerId = foundC.id.toString();
      customerSearchQuery = foundC.name;
    }
  }

  let rawInv = (parsed.invoice_number || '').replace(/^DSL\/SA\//i, '').replace(/^DSLP\/SA\//i, '').trim();
  let rawWb = (parsed.waybill_number || '').replace(/^DSL\/DLN\//i, '').replace(/^DSLP\/DLN\//i, '').trim();

  const lineItems = (parsed.products || []).map(sp => {
    const rawProdName = (sp.name || '').trim();
    const cleanName = rawProdName.split('[')[0].replace(/[|;:\&]/g, '').trim();
    const pRes = fuzzyMatch(cleanName, mockProducts.map(p => ({ id: p.id, name: p.name })));
    const matchedP = pRes.match ? mockProducts.find(p => p.id === pRes.match.id) : null;
    return {
      product_id: matchedP ? matchedP.id.toString() : '',
      quantity: sp.quantity || 1,
      unit: 'Pieces',
      searchQuery: matchedP ? matchedP.name : cleanName
    };
  });

  const autofillResult = {
    customerId,
    customerSearchQuery,
    invoiceNumber: rawInv,
    waybillNumber: rawWb,
    lineItems
  };

  console.log('\n=== FINAL FRONTEND AUTOFILL OUTPUT ===');
  console.log(JSON.stringify(autofillResult, null, 2));
  console.log('======================================\n');

  // Verify final autofill fields
  if (autofillResult.customerId !== '501') {
    throw new Error(`Expected customerId "501", got "${autofillResult.customerId}"`);
  }
  if (autofillResult.invoiceNumber !== '436') {
    throw new Error(`Expected invoiceNumber "436", got "${autofillResult.invoiceNumber}"`);
  }
  if (autofillResult.waybillNumber !== '438') {
    throw new Error(`Expected waybillNumber "438", got "${autofillResult.waybillNumber}"`);
  }
  if (autofillResult.lineItems[0].product_id !== '101') {
    throw new Error(`Expected line item product_id "101", got "${autofillResult.lineItems[0].product_id}"`);
  }
  if (autofillResult.lineItems[0].unit !== 'Pieces') {
    throw new Error(`Expected line item unit "Pieces", got "${autofillResult.lineItems[0].unit}"`);
  }
  if (autofillResult.lineItems[0].quantity !== 400) {
    throw new Error(`Expected line item quantity 400, got "${autofillResult.lineItems[0].quantity}"`);
  }

  console.log('🎉 ALL END-TO-END OCR AUTOFILL TESTS PASSED SUCCESSFULLY!');
}

runEndToEndOCRTest().catch(err => {
  console.error('\n❌ E2E OCR TEST FAILED:', err);
  process.exit(1);
});
