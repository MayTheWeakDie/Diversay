const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');

async function test() {
  const templateBytes = fs.readFileSync('/home/abimbola/Desktop/Diversay_bootstrapped/frontend/public/delivery_acknowledgment_template.pdf');
  const pdfDoc = await PDFDocument.create();
  const templatePdf = await PDFDocument.load(templateBytes);
  const [embeddedTemplate] = await pdfDoc.embedPdf(templatePdf);
  
  const page = pdfDoc.addPage([embeddedTemplate.width, embeddedTemplate.height]);
  
  // 1. Draw shifted page (bottom half will be used)
  page.drawPage(embeddedTemplate, { x: 0, y: -20 });
  
  // 2. Erase the top half of the shifted page
  page.drawRectangle({ x: 0, y: 600 - 20, width: embeddedTemplate.width, height: embeddedTemplate.height, color: rgb(1,1,1) });
  
  // 3. To draw the unshifted top half WITHOUT its bottom half overwriting our shifted bottom half,
  // we would need to draw it... wait, we can't!
  // Unless we can use a clipping path for drawPage.
}
test().catch(console.error);
