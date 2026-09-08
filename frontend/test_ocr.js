import fs from 'fs';
import { parseDocumentText, fuzzyMatch } from './src/utils/ocrParser.js';

const rawText = `
SALE INVOICE
Invoice No: DSL/SA/1234
Date: 07/09/2026
Buyer Details:
RAYAS VETERINARY PHARMACY
JOS JOS
Contact No: 08033233231

Sr.No | Description | Unit | Qty(Kg) | Qty(Bag) | Rate | Rate/Unit | Disc(%) | Amount
1 WYLDOX TABLET 10GRM[JSR/STR/9510] (15/10/2025) Pcs 400.000 400
1,000.00 Pcs 0.00 400,000.00
`;

console.log(JSON.stringify(parseDocumentText(rawText), null, 2));
