import { createWorker } from 'tesseract.js';
import fs from 'fs';
import path from 'path';

// Import parseDocumentText function logic or run tesseract directly
async function debugImage() {
  const imagePath = '/home/abimbola/Desktop/Diversay_bootstrapped/an example of the ocr_image.jpg';
  console.log('--- Testing image:', imagePath);
  console.log('--- Exists:', fs.existsSync(imagePath));

  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
  });

  const { data } = await worker.recognize(imagePath);
  console.log('\n================ RAW OCR TEXT ================');
  console.log(data.text);
  console.log('==============================================\n');

  await worker.terminate();
}

debugImage().catch(err => {
  console.error('OCR Debug Error:', err);
});
