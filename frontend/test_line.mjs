import { parseDocumentText } from './src/utils/ocrParser.js';

const text = `
DOX TABLET 10GRM[ISR/STR/9510 | Pcs | 400.000 400 | 1,000.00 | Pcs 0.00 | 4
`;

const lines = ["Sr. No Description", "DOX TABLET 10GRM[ISR/STR/9510 | Pcs | 400.000 400 | 1,000.00 | Pcs 0.00 | 4", "Total"];
const fullText = lines.join('\n');
console.log(JSON.stringify(parseDocumentText(fullText), null, 2));

