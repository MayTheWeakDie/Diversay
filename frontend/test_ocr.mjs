import { createWorker } from 'tesseract.js';
import fs from 'fs';
import { parseDocumentText } from './src/utils/ocrParser.js';

async function testOCR() {
  console.log("Starting OCR...");
  const worker = await createWorker('eng');
  
  const imageBuffer = fs.readFileSync('../an example of the ocr_image.jpg');
  
  const { data: { text } } = await worker.recognize(imageBuffer);
  console.log("=== RAW OCR TEXT ===");
  console.log(text);
  console.log("====================");
  
  console.log("\nParsing results:");
  const parsed = parseDocumentText(text);
  console.log(JSON.stringify(parsed, null, 2));
  
  await worker.terminate();
}

testOCR().catch(console.error);
