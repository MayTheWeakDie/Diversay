import { fuzzyMatch } from '../src/utils/ocrParser.js';

// Real sample payload returned from backend scan session for RAYIAS VETERINARY PHARMACY
const scanData = {
  raw_text: "...",
  invoice_number: "436",
  waybill_number: "438",
  invoice_number_full: "DSL/SA/436",
  waybill_number_full: "DSL/DLN/438",
  brand: "DSL",
  date: "07/09/2026",
  customer_name: "RAYIAS VETERINARY PHARMACY",
  customer_location: "RAYIAS VETERINARY PHARMACY",
  customer_contact: "08033233231",
  products: [
    {
      name: "DOX TABLET 10GRM",
      unit: "Pieces",
      quantity: 400,
      rate: 1000,
      amount: 4
    }
  ]
};

// Simulate current products in DB
const currentProducts = [
  { id: 1, name: "Wyldox tablet 10grm", brand: "DSL" },
  { id: 2, name: "Enrol 1Ltr", brand: "DSLP" },
  { id: 3, name: "Vetodine 1Ltr", brand: "DSLP" }
];

const currentCustomers = [
  { id: 101, name: "RAYIAS VETERINARY PHARMACY", state: "Plateau", city: "Jos" }
];

// Initial order state as created by createInitialOrderObject
let order = {
  id: "test_order_1",
  customerId: '',
  customerSearchQuery: '',
  customerState: '',
  customerCity: '',
  waybills: [
    {
      id: "wb_1",
      brand: 'DSL',
      waybillNumber: '',
      invoiceNumber: '',
      lineItems: [
        { product_id: '', quantity: 1, unit: 'Pieces', searchQuery: '' }
      ]
    }
  ]
};

const actualData = scanData.extracted_data || scanData.data || scanData;

// 1. Customer Name
const rawCustomerName = (
  actualData.customer_name ||
  actualData.customer?.name ||
  actualData.customer ||
  actualData.parsed?.customer_name ||
  ''
).trim();

if (rawCustomerName) {
  order.customerSearchQuery = rawCustomerName;
  if (currentCustomers.length > 0) {
    const customerResult = fuzzyMatch(
      rawCustomerName,
      currentCustomers.map(c => ({ id: c.id, name: c.name }))
    );
    if (customerResult.match) {
      const matchedCustomer = currentCustomers.find(c => c.id === customerResult.match.id);
      if (matchedCustomer) {
        order.customerId = matchedCustomer.id.toString();
        order.customerSearchQuery = matchedCustomer.name;
        order.customerState = matchedCustomer.state || '';
        order.customerCity = matchedCustomer.city || '';
      }
    }
  }
}

// 3. Invoice & Waybill Reference Cards
const brand = actualData.brand || actualData.parsed?.brand || 'DSL';
if (order.waybills && order.waybills.length > 0) {
  const wb = { ...order.waybills[0] };
  wb.brand = brand;

  let rawInv = (
    actualData.invoice_number ||
    actualData.invoice_number_full ||
    actualData.invoice_no ||
    actualData.parsed?.invoice_number ||
    ''
  ).toString().trim();
  rawInv = rawInv.replace(/^DSL\/SA\//i, '').replace(/^DSLP\/SA\//i, '').trim();
  if (rawInv) wb.invoiceNumber = rawInv;

  let rawWb = (
    actualData.waybill_number ||
    actualData.waybill_number_full ||
    actualData.waybill_no ||
    actualData.parsed?.waybill_number ||
    ''
  ).toString().trim();
  rawWb = rawWb.replace(/^DSL\/DLN\//i, '').replace(/^DSLP\/DLN\//i, '').trim();
  if (rawWb) wb.waybillNumber = rawWb;

  // 4. Products / Line Items
  const scannedProducts = actualData.products || actualData.line_items || actualData.parsed?.products || [];
  if (Array.isArray(scannedProducts) && scannedProducts.length > 0) {
    const matchedLineItems = scannedProducts.map(sp => {
      const rawProdName = (sp.name || sp.description || sp.product_name || sp.ocr_name || '').trim();
      const prodName = rawProdName.split('[')[0].replace(/^[^a-zA-Z0-9]+/, '').replace(/[|;:\&]/g, '').trim();
      let matchedProd = null;
      if (prodName && currentProducts.length > 0) {
        const pRes = fuzzyMatch(prodName, currentProducts.map(p => ({ id: p.id, name: p.name })));
        if (pRes.match) {
          matchedProd = currentProducts.find(p => p.id === pRes.match.id);
        }
      }

      const rawQty = sp.quantity || sp.qty || sp.qty_bags || sp.qty_kg || 1;
      const unitStr = 'Pieces';

      return {
        id: Math.random().toString(36).substr(2, 9),
        product_id: matchedProd ? matchedProd.id.toString() : '',
        quantity: parseInt(rawQty) || 1,
        unit: unitStr,
        searchQuery: matchedProd ? matchedProd.name : prodName
      };
    });

    if (matchedLineItems.length > 0) {
      wb.lineItems = matchedLineItems;
    }
  }

  order.waybills = [wb, ...order.waybills.slice(1)];
}

console.log("FINAL PROCESSED ORDER STATE:");
console.log(JSON.stringify(order, null, 2));
