// Browser-side file readers. pdf.js is pinned to 4.x and its legacy build is used on purpose:
// 5.x/6.x need Promise.withResolvers (Node 22+, Chrome 119+, Safari 17.4+), which breaks PDF
// import on older phones and on Node 20.
// Heavy libraries (xlsx, pdf.js) are loaded on demand so the
// first page load stays small. Everything happens on the user's device.
import { pdfPagesToMatrix } from './pdfLayout.js';
import { findHeaderRow, cellToValue, normalizeHeader } from './parser.js';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function fileKind(file) {
  const name = (file?.name || '').toLowerCase();
  if (name.endsWith('.csv') || file?.type === 'text/csv') return 'csv';
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return 'xlsx';
  if (name.endsWith('.pdf') || file?.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.xls')) return 'xls';
  return 'unknown';
}

function sheetScore(data) {
  const index = findHeaderRow(data);
  const cells = (data[index] || []).map(cellToValue).map(normalizeHeader);
  return ['date', 'description', 'narration', 'details', 'amount', 'debit', 'credit', 'withdrawal', 'deposit']
    .filter((name) => cells.some((cell) => cell.includes(name))).length;
}

/** Read the most transaction-like sheet of an .xlsx workbook as an array of rows. */
export async function readXlsxMatrix(blobOrBuffer) {
  const { default: readExcelFile } = await import('read-excel-file/universal');
  const sheets = await readExcelFile(blobOrBuffer);
  if (!sheets.length) throw new Error('This workbook has no sheets.');
  let best = sheets[0];
  let bestScore = -1;
  for (const sheet of sheets) {
    const score = sheetScore(sheet.data || []);
    if (score > bestScore) { best = sheet; bestScore = score; }
  }
  return best.data || [];
}

/** Extract positioned text with pdf.js and rebuild transaction rows from the layout. */
export async function readPdfMatrix(buffer, pdfjs) {
  let lib = pdfjs;
  if (!lib) {
    lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    lib.GlobalWorkerOptions.workerSrc = worker.default;
  }
  let doc;
  try {
    doc = await lib.getDocument({ data: new Uint8Array(buffer.slice(0)), isEvalSupported: false, verbosity: 0 }).promise;
  } catch (error) {
    if (error && error.name === 'PasswordException') throw new Error('This PDF is password-protected. Remove the password and try again.');
    throw new Error('This PDF could not be opened. It may be damaged.');
  }
  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items
      .filter((item) => typeof item.str === 'string')
      .map((item) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        h: item.height || Math.hypot(item.transform[2], item.transform[3])
      })));
  }
  const textLength = pages.flat().reduce((sum, item) => sum + item.str.trim().length, 0);
  if (textLength < 20) {
    throw new Error('This PDF has no selectable text (it looks scanned). CleanSub cannot read scanned statements yet - download the CSV or Excel export from your bank instead.');
  }
  const result = pdfPagesToMatrix(pages);
  if (!result.rowCount) {
    throw new Error('No transaction rows could be recognised in this PDF. Try the CSV or Excel export from your bank.');
  }
  return result;
}
