const { createWorker } = require('tesseract.js');
const fs = require('fs');

async function testOCR() {
  console.log("Starting OCR...");
  const worker = await createWorker('eng');
  
  const imageBuffer = fs.readFileSync('an example of the ocr_image.jpg');
  
  const { data: { text } } = await worker.recognize(imageBuffer);
  console.log("=== RAW OCR TEXT ===");
  console.log(text);
  console.log("====================");
  
  await worker.terminate();
}

testOCR().catch(console.error);
