import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// Helper to draw a white rectangle to cover existing text on the template
const drawWhiteBox = (page, x, y, width, height) => {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  })
}

// Format date as DD/MM/YYYY
const formatDateDDMMYYYY = (dateStr) => {
  const parseDate = (s) => {
    if (!s) return new Date()
    let str = s
    if (typeof str === 'string' && !str.includes('Z') && !/\+\d{2}:\d{2}$/.test(str) && !/-\d{2}:\d{2}$/.test(str)) {
      str = str + 'Z'
    }
    const d = new Date(str)
    return isNaN(d.getTime()) ? new Date() : d
  }

  const d = parseDate(dateStr)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export const generateDeliveryAcknowledgment = async (order, customAddress = null) => {
  try {
    // 1. Fetch the template PDF
    const response = await fetch('/delivery_acknowledgment_template.pdf')
    const templateBytes = await response.arrayBuffer()

    // 2. Load the PDF document
    const pdfDoc = await PDFDocument.load(templateBytes)
    const page = pdfDoc.getPages()[0]

    // Embed Helvetica-Bold font for crisp bold values matching the original template
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Determine reference numbers
    const hasRefCards = order.reference_cards && order.reference_cards.length > 0;

    let invoiceNo = 'N/A';
    let waybillNo = 'N/A';

    if (hasRefCards) {
      invoiceNo = order.reference_cards.map(c => c.invoice_number).filter(Boolean).join(', ') || 'N/A';
      waybillNo = order.reference_cards.map(c => c.waybill_number).filter(Boolean).join(', ') || 'N/A';
    } else {
      invoiceNo = order.invoice_number || 'N/A';
      waybillNo = order.waybill_number || 'N/A';
    }

    const customerName = order.customer_name || 'N/A';
    const customerAddress = customAddress !== null && customAddress !== undefined && String(customAddress).trim() !== ''
      ? String(customAddress).trim()
      : (order.customer_address || order.customer?.address || 'N/A');
    const formattedDate = formatDateDDMMYYYY(order.dispatch_time || order.created_at);

    const fontSize = 10.5;

    // 3. Erase dummy values on the template and draw exact bold values aligned with template keys

    // DATE : 10/08/2026 (shifted y up to 716.5)
    drawWhiteBox(page, 107, 711, 150, 16)
    page.drawText(formattedDate, {
      x: 108.5,
      y: 716.5,
      size: fontSize,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    })

    // Customer Name: ERIDARA (shifted y up to 655.5)
    drawWhiteBox(page, 162, 650, 420, 16)
    page.drawText(customerName, {
      x: 163.5,
      y: 655.5,
      size: fontSize,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    })

    // Invoice No: DSLP/SA/532, DSL/SA/374 (shifted y up to 640.5)
    drawWhiteBox(page, 131, 635, 450, 16)
    page.drawText(invoiceNo, {
      x: 132.5,
      y: 640.5,
      size: fontSize,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    })

    // Delivery Note No: DSLP/DLN/532, DSL/DLN/376 (shifted y up to 626.0)
    drawWhiteBox(page, 164, 620, 420, 16)
    page.drawText(waybillNo, {
      x: 165.0,
      y: 626.0,
      size: fontSize,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    })

    // Customer Address: OGBOMOSHO (shifted y up to 611.5)
    drawWhiteBox(page, 173, 605, 410, 16)
    page.drawText(customerAddress, {
      x: 174.2,
      y: 611.5,
      size: fontSize,
      font: helveticaBold,
      color: rgb(0, 0, 0),
    })

    // 4. Serialize the modified PDF
    const pdfBytes = await pdfDoc.save()

    // 5. Trigger client download
    const blob = new Blob([pdfBytes], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `Delivery_Acknowledgment_${order.order_number || order.id}.pdf`
    document.body.appendChild(a)
    a.click()

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)

  } catch (err) {
    console.error('Failed to generate PDF:', err)
    throw err
  }
}
