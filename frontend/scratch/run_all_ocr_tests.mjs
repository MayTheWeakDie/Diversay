import { createWorker } from 'tesseract.js';
import fs from 'fs';
import { parseDocumentText } from '../src/utils/ocrParser.js';

const imageFiles = [
  '/home/abimbola/Desktop/Diversay_bootstrapped/IMG_20260901_123455.jpg',
  '/home/abimbola/Desktop/Diversay_bootstrapped/IMG_20260901_123504.jpg',
  '/home/abimbola/Desktop/Diversay_bootstrapped/IMG_20260901_123513.jpg',
  '/home/abimbola/Desktop/Diversay_bootstrapped/IMG_20260901_123523.jpg',
  '/home/abimbola/Desktop/Diversay_bootstrapped/IMG_20260908_110932.jpg',
  '/home/abimbola/Desktop/Diversay_bootstrapped/IMG_20260908_145632.jpg',
  '/home/abimbola/Desktop/Diversay_bootstrapped/IMG_20260908_145640.jpg',
  '/home/abimbola/Desktop/Diversay_bootstrapped/IMG_20260908_145645.jpg',
  '/home/abimbola/Desktop/Diversay_bootstrapped/an example of the ocr_image.jpg'
];

async function runAll() {
  console.log('Starting OCR recognition across all image files...\n');
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
  });

  for (const imgPath of imageFiles) {
    console.log('======================================================================');
    console.log(`FILE: ${imgPath}`);
    console.log('======================================================================');
    if (!fs.existsSync(imgPath)) {
      console.log('FILE DOES NOT EXIST!\n');
      continue;
    }

    try {
      const { data } = await worker.recognize(imgPath);
      console.log('--- RAW OCR TEXT ---');
      console.log(data.text);
      console.log('--- PARSED STRUCTURED OUTPUT ---');
      const parsed = parseDocumentText(data.text);
      console.log(JSON.stringify(parsed, null, 2));
      console.log('\n');
    } catch (err) {
      console.error(`Error processing ${imgPath}:`, err.message);
    }
  }

  await worker.terminate();
  console.log('Done running all OCR tests!');
}

runAll().catch(console.error);
