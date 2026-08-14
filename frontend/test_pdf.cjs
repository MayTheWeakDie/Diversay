const { PDFDocument, rgb, pushGraphicsState, popGraphicsState, moveTo, lineTo, clip, endPath } = require('pdf-lib');
const fs = require('fs');

async function test() {
  const templateBytes = fs.readFileSync('/home/abimbola/Desktop/Diversay_bootstrapped/frontend/public/delivery_acknowledgment_template.pdf');
  const pdfDoc = await PDFDocument.create();
  const templatePdf = await PDFDocument.load(templateBytes);
  const [embeddedTemplate] = await pdfDoc.embedPdf(templatePdf);
  
  const page = pdfDoc.addPage([embeddedTemplate.width, embeddedTemplate.height]);
  
  const shiftDown = 20;
  const splitY = 595; // Y coordinate below customer address to split the page
  
  // 1. Draw the TOP half UN-shifted, using a clipping path.
  // Push graphics state
  page.pushOperators(
    pushGraphicsState(),
    moveTo(0, splitY),
    lineTo(embeddedTemplate.width, splitY),
    lineTo(embeddedTemplate.width, embeddedTemplate.height),
    lineTo(0, embeddedTemplate.height),
    clip(),
    endPath()
  );
  
  // Draw the full page (it will be clipped to only show the top half)
  page.drawPage(embeddedTemplate, { x: 0, y: 0 });
  
  // Restore graphics state
  page.pushOperators(popGraphicsState());
  
  // 2. Draw the BOTTOM half SHIFTED down, using a clipping path.
  page.pushOperators(
    pushGraphicsState(),
    moveTo(0, 0),
    lineTo(embeddedTemplate.width, 0),
    lineTo(embeddedTemplate.width, splitY - shiftDown),
    lineTo(0, splitY - shiftDown),
    clip(),
    endPath()
  );
  
  // Draw the full page shifted down (it will be clipped to only show the bottom half)
  page.drawPage(embeddedTemplate, { x: 0, y: -shiftDown });
  
  // Restore graphics state
  page.pushOperators(popGraphicsState());
  
  fs.writeFileSync('output.pdf', await pdfDoc.save());
  console.log('Saved output.pdf');
}
test().catch(console.error);
