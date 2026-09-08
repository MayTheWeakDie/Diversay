import { createWorker } from 'tesseract.js';
import fs from 'fs';
import { processDocumentImage, fuzzyMatch } from '../src/utils/ocrParser.js';

const BACKEND_URL = 'http://localhost:8000';
const imagePath = '/home/abimbola/Desktop/Diversay_bootstrapped/an example of the ocr_image.jpg';

async function testFullStackAutofill() {
  console.log('======================================================================');
  console.log('STARTING FULL STACK OCR SCAN & FRONTEND AUTOFILL INTEGRATION TEST');
  console.log('======================================================================\n');

  // Step 1: PC creates scan session via Backend API
  console.log('Step 1: PC browser creates scan session (POST /scan-sessions/)...');
  const createRes = await fetch(`${BACKEND_URL}/scan-sessions/`, { method: 'POST' });
  if (!createRes.ok) {
    throw new Error(`Failed to create scan session: ${createRes.statusText}`);
  }
  const session = await createRes.json();
  console.log('Scan session created successfully:', session);
  const { session_id, session_secret } = session;

  // Step 2: Simulate Mobile Device running OCR on sample image
  console.log('\nStep 2: Mobile device uploads document & runs client-side OCR...');
  const imageBuffer = fs.readFileSync(imagePath);
  
  // Run OCR pipeline
  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  const { data: ocrData } = await worker.recognize(imagePath);
  await worker.terminate();

  const ocrResult = await processDocumentImage(imagePath, [], []);
  console.log('Mobile OCR extracted data summary:', {
    invoice_number: ocrResult.invoice_number,
    waybill_number: ocrResult.waybill_number,
    customer_name: ocrResult.parsed.customer_name,
    products_count: ocrResult.products.length,
    first_product: ocrResult.products[0]?.name
  });

  // Step 3: Mobile submits OCR results to Backend
  console.log('\nStep 3: Mobile device posts extracted data to Backend (POST /scan-sessions/:id/result)...');
  const submitPayload = {
    session_secret,
    extracted_data: {
      raw_text: ocrResult.raw_text,
      invoice_number: ocrResult.invoice_number,
      waybill_number: ocrResult.waybill_number,
      invoice_number_full: ocrResult.invoice_number_full,
      waybill_number_full: ocrResult.waybill_number_full,
      brand: ocrResult.brand,
      date: ocrResult.date,
      customer_name: ocrResult.parsed?.customer_name || '',
      customer_location: ocrResult.customer_location || '',
      customer_contact: ocrResult.customer_contact || '',
      products: ocrResult.products || []
    }
  };

  const submitRes = await fetch(`${BACKEND_URL}/scan-sessions/${session_id}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submitPayload)
  });
  if (!submitRes.ok) {
    throw new Error(`Failed to submit scan result: ${submitRes.statusText}`);
  }
  console.log('Mobile submission successful:', await submitRes.json());

  // Step 4: PC Frontend polls Backend for results
  console.log('\nStep 4: PC Frontend polls Backend for completed session (GET /scan-sessions/:id/result)...');
  const pollRes = await fetch(`${BACKEND_URL}/scan-sessions/${session_id}/result`);
  if (!pollRes.ok) {
    throw new Error(`Failed to poll scan result: ${pollRes.statusText}`);
  }
  const pollData = await pollRes.json();
  console.log('PC Frontend received session status:', pollData.status);
  if (pollData.status !== 'completed' || !pollData.data) {
    throw new Error(`Expected completed status, got ${pollData.status}`);
  }

  // Step 5: Simulate applyScanDataToForm on PC Frontend
  console.log('\nStep 5: Executing applyScanDataToForm logic on PC Frontend with Database Entities...');
  const receivedData = pollData.data;

  // Mock DB fetched products and customers in CreateOrderModal
  const dbCustomers = [
    { id: 501, name: 'RAYIAS VETERINARY PHARMACY', state: 'JOS' }
  ];
  const dbProducts = [
    { id: 101, name: 'WYLDOX TABLET 10GRM' },
    { id: 102, name: 'QUINCIN TABLET' }
  ];

  let initialBatchOrder = {
    id: 'order_1',
    customerId: '',
    customerSearchQuery: '',
    waybills: [
      { id: 'wb_1', brand: 'DSL', waybillNumber: '', invoiceNumber: '', lineItems: [] }
    ]
  };

  // Run applyScanDataToForm logic
  const rawCustomerName = (receivedData.customer_name || '').trim();
  let customerId = '';
  let customerSearchQuery = rawCustomerName;
  if (rawCustomerName && dbCustomers.length > 0) {
    const cRes = fuzzyMatch(rawCustomerName, dbCustomers.map(c => ({ id: c.id, name: c.name })));
    if (cRes.match) {
      const matchedC = dbCustomers.find(c => c.id === cRes.match.id);
      if (matchedC) {
        customerId = matchedC.id.toString();
        customerSearchQuery = matchedC.name;
      }
    }
  }

  let rawInv = (receivedData.invoice_number || '').replace(/^DSL\/SA\//i, '').replace(/^DSLP\/SA\//i, '').trim();
  let rawWb = (receivedData.waybill_number || '').replace(/^DSL\/DLN\//i, '').replace(/^DSLP\/DLN\//i, '').trim();

  const scannedProds = receivedData.products || [];
  const matchedLineItems = scannedProds.map(sp => {
    const rawProdName = (sp.name || '').trim();
    const cleanName = rawProdName.split('[')[0].replace(/[|;:\&]/g, '').trim();
    let matchedProd = null;
    if (cleanName && dbProducts.length > 0) {
      const pRes = fuzzyMatch(cleanName, dbProducts.map(p => ({ id: p.id, name: p.name })));
      if (pRes.match) {
        matchedProd = dbProducts.find(p => p.id === pRes.match.id);
      }
    }

    return {
      product_id: matchedProd ? matchedProd.id.toString() : '',
      quantity: Math.max(1, Math.round(parseFloat(sp.quantity) || 1)),
      unit: 'Pieces',
      searchQuery: matchedProd ? matchedProd.name : cleanName
    };
  });

  const autofilledOrder = {
    ...initialBatchOrder,
    customerId,
    customerSearchQuery,
    waybills: [
      {
        ...initialBatchOrder.waybills[0],
        brand: receivedData.brand || 'DSL',
        invoiceNumber: rawInv,
        waybillNumber: rawWb,
        lineItems: matchedLineItems
      }
    ]
  };

  console.log('\n======================================================================');
  console.log('VERIFYING FRONTEND AUTOFILLED ORDER FORM STATE');
  console.log('======================================================================');
  console.log(JSON.stringify(autofilledOrder, null, 2));

  // Assertions
  if (autofilledOrder.customerId !== '501') throw new Error(`Customer ID failed: got "${autofilledOrder.customerId}"`);
  if (autofilledOrder.customerSearchQuery !== 'RAYIAS VETERINARY PHARMACY') throw new Error('Customer query failed');
  if (autofilledOrder.waybills[0].invoiceNumber !== '436') throw new Error('Invoice number failed');
  if (autofilledOrder.waybills[0].waybillNumber !== '438') throw new Error('Waybill number failed');
  if (autofilledOrder.waybills[0].lineItems[0].product_id !== '101') throw new Error('Product ID failed');
  if (autofilledOrder.waybills[0].lineItems[0].unit !== 'Pieces') throw new Error('Unit failed');
  if (autofilledOrder.waybills[0].lineItems[0].quantity !== 400) throw new Error('Quantity failed');

  console.log('\n✅ SUCCESS: Full Stack Integration Test Passed! Backend endpoint created session, received mobile POST, served polling request, and PC frontend successfully autofilled all form fields!');
}

testFullStackAutofill().catch(err => {
  console.error('\n❌ FULL STACK INTEGRATION TEST FAILED:', err);
  process.exit(1);
});
