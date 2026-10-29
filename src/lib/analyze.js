import Papa from 'papaparse';
import { decodeBuffer, matrixToRows, parseTransactionsDetailed, findHeaderRow, cellToValue, normalizeHeader } from './parser.js';
import { detectRecurring } from './detect.js';
import { enrichResults, buildInsights } from './insights.js';

const DELIMITERS = [undefined, ',', ';', '\t', '|'];

function headerStrength(matrix) {
  const index = findHeaderRow(matrix);
  const cells = (matrix[index] || []).map(cellToValue).map(normalizeHeader);
  const hits = ['date', 'description', 'narration', 'details', 'amount', 'debit', 'credit', 'withdrawal', 'deposit', 'balance']
    .filter((name) => cells.some((cell) => cell.includes(name))).length;
  return { hits, columns: cells.length };
}

/** Parse CSV text, trying other delimiters if the auto-detected one yields a poor header. */
export function parseCsvText(text) {
  let best = null;
  const warnings = [];
  for (const delimiter of DELIMITERS) {
    const parsed = Papa.parse(text, { skipEmptyLines: 'greedy', ...(delimiter ? { delimiter } : {}) });
    const matrix = parsed.data;
    if (!matrix.length) continue;
    const strength = headerStrength(matrix);
    if (!best || strength.hits > best.strength.hits
      || (strength.hits === best.strength.hits && strength.columns > best.strength.columns && strength.hits > 0)) {
      best = { matrix, strength, errors: parsed.errors };
    }
    if (delimiter === undefined && strength.hits >= 3) break; // auto-detect already looks right
  }
  if (!best) throw new Error('No transaction rows were found in this CSV.');
  const quoteErrors = best.errors.filter((error) => error.type === 'Quotes');
  if (quoteErrors.length) {
    warnings.push(`${quoteErrors.length} row(s) had unbalanced quotes; their text may be merged or truncated.`);
  }
  return { matrix: best.matrix, warnings };
}

/** Read a "Currency: NGN" style preamble that sits above the header row. */
function currencyFromPreamble(matrix) {
  const headerIndex = findHeaderRow(matrix);
  for (let index = 0; index < headerIndex; index += 1) {
    const cells = (matrix[index] || []).map((cell) => String(cellToValue(cell)).trim());
    for (let column = 0; column < cells.length; column += 1) {
      if (!/^currency\b/i.test(cells[column])) continue;
      const inline = cells[column].match(/\b([A-Z]{3})\b/);
      if (inline) return inline[1];
      for (let next = column + 1; next < cells.length; next += 1) {
        if (/^[A-Za-z]{3}$/.test(cells[next])) return cells[next].toUpperCase();
      }
    }
  }
  return '';
}

function finish(matrix, options, warnings = [], source = 'csv') {
  const rows = matrixToRows(matrix);
  const mergedOptions = { ...options };
  if (!mergedOptions.defaultCurrency) {
    const preambleCurrency = currencyFromPreamble(matrix);
    if (preambleCurrency) mergedOptions.defaultCurrency = preambleCurrency;
  }
  const parsed = parseTransactionsDetailed(rows, mergedOptions);
  const detected = enrichResults(detectRecurring(parsed.transactions));
  return {
    source,
    subscriptions: detected,
    insights: buildInsights(detected, parsed.transactions),
    summary: parsed.summary,
    transactionCount: parsed.transactions.length,
    preview: parsed.transactions.slice(0, 4),
    warnings
  };
}

/** CSV bytes -> analysis. Runs in the worker so large files do not freeze the page. */
export function analyzeCsvBuffer(buffer, options = {}) {
  const { matrix, warnings } = parseCsvText(decodeBuffer(buffer));
  return finish(matrix, options, warnings, 'csv');
}

/** Array-of-arrays (from XLSX or PDF extraction) -> analysis. */
export function analyzeMatrix(matrix, options = {}, source = 'matrix') {
  return finish(matrix, options, [], source);
}
