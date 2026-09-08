import { createWorker } from 'tesseract.js';
import fs from 'fs';
import { parseDocumentText, fuzzyMatch } from './utils/ocrParser.js';

async function testFullPipeline() {
  const imagePath = '/home/abimbola/Desktop/Diversay_bootstrapped/an example of the ocr_image.jpg';
  console.log('Testing full OCR pipeline on:', imagePath);

  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: '6',
  });

  const { data } = await worker.recognize(imagePath);
  await worker.terminate();

  const parsed = parseDocumentText(data.text);
  console.log('\n--- Parsed OCR Data ---');
  console.log(JSON.stringify(parsed, null, 2));

  // Simulate mock database
  const mockProducts = [
    { id: 101, name: 'WYLDOX TABLET 10GRM' },
    { id: 102, name: 'DIVERSAY 50G' }
  ];

  const mockCustomers = [
    { id: 501, name: 'RAYIAS VETERINARY PHARMACY', state: 'JOS' }
  ];

  // Simulate applyScanDataToForm logic
  const rawCustomerName = (parsed.customer_name || '').trim();
  const customerRes = fuzzyMatch(rawCustomerName, mockCustomers.map(c => ({ id: c.id, name: c.name })));

  let customerId = '';
  let customerSearchQuery = rawCustomerName;
  if (customerRes.match) {
    const found = mockCustomers.find(c => c.id === customerRes.match.id);
    if (found) {
      customerId = found.id.toString();
      customerSearchQuery = found.name;
    }
  }

  let rawInv = (parsed.invoice_number || '').replace(/^DSL\/SA\//i, '').replace(/^DSLP\/SA\//i, '').trim();
  let rawWb = (parsed.waybill_number || '').replace(/^DSL\/DLN\//i, '').replace(/^DSLP\/DLN\//i, '').trim();

  const lineItems = (parsed.products || []).map(sp => {
    let cleanName = (sp.name || '').split('[')[0].replace(/[|;:\&]/g, '').trim();
    const pRes = fuzzyMatch(cleanName, mockProducts.map(p => ({ id: p.id, name: p.name })));
    const matchedP = pRes.match ? mockProducts.find(p => p.id === pRes.match.id) : null;
    return {
      product_id: matchedP ? matchedP.id.toString() : '',
      quantity: sp.quantity || 1,
      unit: sp.unit || 'Pieces',
      searchQuery: matchedP ? matchedP.name : cleanName
    };
  });

  console.log('\n================ SIMULATED AUTO-FILL OUTPUT ================');
  console.log({
    customerId,
    customerSearchQuery,
    invoiceNumber: rawInv,
    waybillNumber: rawWb,
    lineItems
  });
  console.log('============================================================\n');
}

testFullPipeline().catch(err => console.error(err));
