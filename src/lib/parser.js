import { normalizeDescription, normalizeMerchant, cleanPayee } from './merchant.js';
import { INFERRED_SOURCES } from './direction.js';

export { normalizeMerchant } from './merchant.js';
export { detectRecurring } from './detect.js';

const HEADER_ALIASES = {
  date: [
    'date', 'transactiondate', 'transactiondatetime', 'transactiontimestamp',
    'posteddate', 'postingdate', 'valuedate', 'effectivedate', 'bookingdate',
    'transdate', 'processeddate'
  ],
  payee: [
    'description', 'transactiondescription', 'narration', 'details',
    'transactiondetails', 'memo', 'payee', 'merchant', 'merchantname',
    'beneficiary', 'particulars', 'transactionreference', 'reference', 'name'
  ],
  amount: ['amount', 'transactionamount', 'value', 'netamount', 'localamount'],
  debit: [
    'debit', 'debitamount', 'debits', 'withdrawal', 'withdrawals',
    'withdrawalamount', 'moneyout', 'paidout', 'charges', 'paymentamount'
  ],
  credit: [
    'credit', 'creditamount', 'credits', 'deposit', 'deposits',
    'depositamount', 'moneyin', 'paidin'
  ],
  direction: [
    'type', 'transactiontype', 'entrytype', 'drcr', 'debitcredit',
    'debitcreditindicator', 'transactionindicator', 'direction', 'transactionkind'
  ],
  currency: ['currency', 'currencycode', 'ccy']
};

// The Type column must match a whole value. Substring matching misread
// "Credit Card" as an inflow, so only unambiguous full values are accepted.
const INFLOW_TYPES = new Set([
  'cr', 'credit', 'credited', 'deposit', 'refund', 'reversal', 'cashback',
  'cash back', 'salary', 'payroll', 'income', 'inflow', 'money in'
]);
const OUTFLOW_TYPES = new Set([
  'dr', 'debit', 'debited', 'withdrawal', 'purchase', 'sale', 'charge', 'fee',
  'pos', 'direct debit', 'card payment', 'bill payment', 'standing order',
  'outflow', 'money out'
]);

// Description hints are only consulted when the amount itself says nothing reliable.
const STRONG_INFLOW_DESC = /\b(refund(?:ed)?|reversal|cashback|cash back|salary|payroll|transfer from|received from|inward transfer|deposit(?:ed)?)\b/i;
const OUTFLOW_DESC = /\b(direct debit|card payment|bill payment|payment to|paid to|autopay|standing order|subscription charge|withdrawal)\b/i;
const PAYMENT_LIKE_DESC = /\b(payment|thank you|autopay|refund|reversal|cashback|credit|adjustment)\b/i;

export function normalizeHeader(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

/* ------------------------------------------------------------------ */
/* Raw input helpers: decoding, matrix → rows, header-row detection    */
/* ------------------------------------------------------------------ */

/** Decode file bytes as UTF-8, falling back to Windows-1252 (common for bank exports). */
export function decodeBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Spreadsheet cells may be Date objects; turn them into ISO dates, others into plain values. */
export function cellToValue(cell) {
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return '';
    const utcMidnight = cell.getUTCHours() === 0 && cell.getUTCMinutes() === 0 && cell.getUTCSeconds() === 0;
    const y = utcMidnight ? cell.getUTCFullYear() : cell.getFullYear();
    const m = (utcMidnight ? cell.getUTCMonth() : cell.getMonth()) + 1;
    const d = utcMidnight ? cell.getUTCDate() : cell.getDate();
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number' || typeof cell === 'string') return cell;
  return String(cell);
}

function rowHeaderScore(cells) {
  const normalized = new Set(cells.map((cell) => normalizeHeader(cell)).filter(Boolean));
  const has = (aliases) => aliases.some((alias) => normalized.has(alias));
  const hasDate = has(HEADER_ALIASES.date);
  const hasPayee = has(HEADER_ALIASES.payee);
  const hasMoney = has(HEADER_ALIASES.amount) || has(HEADER_ALIASES.debit) || has(HEADER_ALIASES.credit);
  return (hasDate ? 1 : 0) + (hasPayee ? 1 : 0) + (hasMoney ? 1 : 0);
}

/** Bank exports often start with account-info lines. Find the first row that looks like a header. */
export function findHeaderRow(matrix, scanLimit = 60) {
  let best = { index: 0, score: -1 };
  const limit = Math.min(matrix.length, scanLimit);
  for (let index = 0; index < limit; index += 1) {
    const cells = (matrix[index] || []).map(cellToValue);
    const score = rowHeaderScore(cells);
    if (score === 3) return index;
    if (score > best.score) best = { index, score };
  }
  return best.score >= 2 ? best.index : 0;
}

/** Convert an array-of-arrays (CSV / XLSX / PDF) into header-keyed row objects. */
export function matrixToRows(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return [];
  const headerIndex = findHeaderRow(matrix);
  const used = new Map();
  const headers = (matrix[headerIndex] || []).map((cell, column) => {
    let name = asText(cellToValue(cell)) || `column${column + 1}`;
    const count = used.get(name) || 0;
    used.set(name, count + 1);
    if (count > 0) name = `${name}_${count + 1}`;
    return name;
  });
  const rows = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const cells = matrix[index] || [];
    if (!cells.some((cell) => asText(cellToValue(cell)) !== '')) continue;
    const row = {};
    headers.forEach((header, column) => { row[header] = cellToValue(cells[column]); });
    rows.push(row);
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* Money, dates, direction                                             */
/* ------------------------------------------------------------------ */

function detectCurrencyInText(value) {
  if (typeof value !== 'string') return '';
  const text = value;
  if (/\b(?:US\$|USD)\b|US\$/i.test(text)) return 'USD';
  if (/\bC\$|\bCA\$|\bCAD\b/i.test(text)) return 'CAD';
  if (/₦|\bNGN\b/i.test(text)) return 'NGN';
  if (/£|\bGBP\b/i.test(text)) return 'GBP';
  if (/€|\bEUR\b/i.test(text)) return 'EUR';
  if (/\$/.test(text)) return 'USD';
  return '';
}

function parseMoney(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { signed: value, magnitude: Math.abs(value), suffixDirection: null } : null;
  }

  let text = asText(value).replace(/\u2212/g, '-');
  if (!text || /^[-—–\s]+$/.test(text)) return null;

  let suffixDirection = null;
  const suffix = text.match(/\b(DR|CR)\s*$/i);
  if (suffix) {
    suffixDirection = suffix[1].toUpperCase() === 'DR' ? 'outflow' : 'inflow';
    text = text.slice(0, suffix.index).trim();
  }

  // Currency symbols and codes ("₦-8,000.00", "NGN 1,200") must not hide the sign.
  text = text.replace(/[^\d.,()+\-\s\u00a0']/g, '');
  const isParenthesizedNegative = /^\s*\(.*\)\s*$/.test(text);
  text = text.replace(/[()]/g, '').replace(/[\s\u00a0']/g, '');
  const trailingMinus = /\d-$/.test(text);
  if (trailingMinus) text = text.slice(0, -1);
  const explicitNegative = isParenthesizedNegative || trailingMinus || /^-/.test(text);
  const explicitPositive = /^\s*\+/.test(text);
  text = text.replace(/^[+-]/, '');

  text = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const digitsAfter = text.length - lastComma - 1;
    if (digitsAfter > 0 && digitsAfter <= 2) {
      text = text.replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if ((text.match(/\./g) || []).length > 1) {
    const parts = text.split('.');
    const finalPart = parts.pop();
    text = parts.join('') + (finalPart.length > 0 && finalPart.length <= 2 ? '.' + finalPart : finalPart);
  } else if (lastDot !== -1 && text.length - lastDot - 1 === 3) {
    // Three trailing digits are far more commonly a thousands group than currency precision.
    text = text.replace(/\./g, '');
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  const magnitude = Math.abs(parsed);
  return {
    signed: explicitNegative ? -magnitude : explicitPositive ? magnitude : parsed,
    magnitude,
    suffixDirection
  };
}

function directionFromTypeColumn(value) {
  const text = normalizeDescription(value);
  if (!text) return null;
  if (INFLOW_TYPES.has(text)) return 'inflow';
  if (OUTFLOW_TYPES.has(text)) return 'outflow';
  return null;
}

function validIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
  return [
    String(y).padStart(4, '0'),
    String(m).padStart(2, '0'),
    String(d).padStart(2, '0')
  ].join('-');
}

function expandYear(text) {
  if (text.length === 4) return Number(text);
  const yy = Number(text);
  return yy <= 69 ? 2000 + yy : 1900 + yy;
}

// d/m/y with "/" or "-" is the ambiguous case; "." is DMY everywhere it is used.
const NUMERIC_DATE = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})(?:[\sT].*)?$/;

function inferDateOrder(values) {
  let dmy = 0;
  let mdy = 0;
  for (const value of values) {
    const match = asText(value).match(NUMERIC_DATE);
    if (!match || match[2] === '.') continue;
    const first = Number(match[1]);
    const second = Number(match[3]);
    if (first > 12 && second <= 12) dmy += 1;
    if (second > 12 && first <= 12) mdy += 1;
  }
  if (dmy > mdy) return { order: 'DMY', confident: true };
  if (mdy > dmy) return { order: 'MDY', confident: true };
  // Day-first is the default where the file offers no evidence. Ambiguous rows
  // remain marked so confidence is not overstated.
  return { order: 'DMY', confident: false };
}

function parseDate(value, dateOrder, dateOrderCertain) {
  const raw = asText(value);
  if (!raw) return { date: '', ambiguous: false };

  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (match) return { date: validIsoDate(match[1], match[2], match[3]), ambiguous: false };

  match = raw.match(NUMERIC_DATE);
  if (match) {
    const separator = match[2];
    const first = Number(match[1]);
    const second = Number(match[3]);
    const year = expandYear(match[4]);
    if (separator === '.') {
      return { date: validIsoDate(year, second, first), ambiguous: false };
    }
    const ambiguous = first <= 12 && second <= 12 && !dateOrderCertain;
    const order = first > 12 ? 'DMY' : second > 12 ? 'MDY' : dateOrder;
    const month = order === 'MDY' ? first : second;
    const day = order === 'MDY' ? second : first;
    return { date: validIsoDate(year, month, day), ambiguous };
  }

  match = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) return { date: validIsoDate(match[1], match[2], match[3]), ambiguous: false };

  const namedDate = new Date(raw);
  if (!Number.isNaN(namedDate.getTime())) {
    return {
      date: validIsoDate(namedDate.getFullYear(), namedDate.getMonth() + 1, namedDate.getDate()),
      ambiguous: false
    };
  }
  return { date: '', ambiguous: false };
}

function availableHeaders(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!row) continue;
    for (const key of Object.keys(row)) seen.add(key);
  }
  return Array.from(seen);
}

function findHeader(headers, aliases) {
  const lookup = new Map();
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (!lookup.has(key)) lookup.set(key, header);
  }
  for (const alias of aliases) {
    if (lookup.has(alias)) return lookup.get(alias);
  }
  return null;
}

/**
 * Decide how single-column amounts map to money in/out.
 *  - user choice always wins
 *  - all-negative or mixed files: negatives are spending (bank style), except when the
 *    negatives overwhelmingly look like card payments/refunds (Amex-style exports)
 *  - all-positive files are genuinely ambiguous and are reported as such
 */
function decideSignConvention(stats, requested) {
  if (requested === 'positive-spending') return { convention: 'positive-spending', source: 'user' };
  if (requested === 'positive-income') return { convention: 'negative-spending', source: 'user' };
  const { negatives, positives, negativeLooksLikePayment } = stats;
  if (negatives === 0 && positives === 0) return { convention: 'negative-spending', source: 'default' };
  if (negatives === 0) return { convention: 'ambiguous', source: 'default' };
  if (positives === 0) return { convention: 'negative-spending', source: 'inferred' };
  if (positives / (positives + negatives) >= 0.75 && negativeLooksLikePayment / negatives >= 0.6) {
    return { convention: 'positive-spending', source: 'inferred' };
  }
  return { convention: 'negative-spending', source: 'inferred' };
}

/**
 * Normalizes row objects to a consistent transaction shape. amount is always a
 * positive magnitude; signedAmount is negative for spending and positive for
 * incoming money. Unknown direction is preserved rather than guessed.
 *
 * options.dateOrder:      'auto' | 'DMY' | 'MDY'
 * options.signConvention: 'auto' | 'positive-spending' | 'positive-income'
 */
export function parseTransactionsDetailed(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No transaction rows were found in this file.');
  }

  const nonBlankRows = rows.filter((row) => row && Object.values(row).some((value) => asText(value) !== ''));
  if (!nonBlankRows.length) {
    throw new Error('No non-empty transaction rows were found in this file.');
  }

  const headers = availableHeaders(nonBlankRows);
  const columns = {};
  for (const [name, aliases] of Object.entries(HEADER_ALIASES)) {
    columns[name] = findHeader(headers, aliases);
  }

  if (!columns.date) {
    throw new Error('Could not find a transaction date column. Expected Date, Transaction Date, Posted Date, or Value Date.');
  }
  if (!columns.payee) {
    throw new Error('Could not find a merchant/description column. Expected Description, Narration, Details, Memo, or Payee.');
  }
  if (!columns.amount && !columns.debit && !columns.credit) {
    throw new Error('Could not find an amount column. Expected Amount, Debit/Credit, Withdrawal, Deposit, Money Out, or Money In.');
  }

  const rawDates = nonBlankRows.map((row) => row[columns.date]);
  const requestedOrder = String(options.dateOrder || 'auto').toUpperCase();
  const explicitDateOrder = requestedOrder === 'MDY' || requestedOrder === 'DMY';
  const dateOrderInfo = explicitDateOrder
    ? { order: requestedOrder, confident: true }
    : inferDateOrder(rawDates);
  // Some exports state the currency only in a preamble ("Currency: NGN"); the caller
  // forwards it here so charges are not rendered in the wrong currency.
  const fallbackCurrency = /^[A-Z]{3}$/.test(String(options.defaultCurrency || '').toUpperCase())
    ? String(options.defaultCurrency).toUpperCase()
    : '';

  // ---- pass 1: parse every row once and collect sign statistics ----
  const prepared = [];
  const signStats = { negatives: 0, positives: 0, negativeLooksLikePayment: 0 };
  let missingPayeeRows = 0;

  for (const row of nonBlankRows) {
    const rawPayee = asText(row[columns.payee]);
    const payee = cleanPayee(rawPayee) || rawPayee;
    if (!payee) {
      missingPayeeRows += 1;
      continue;
    }
    const debitCell = columns.debit ? row[columns.debit] : null;
    const creditCell = columns.credit ? row[columns.credit] : null;
    const amountCell = columns.amount ? row[columns.amount] : null;
    const debitMoney = columns.debit ? parseMoney(debitCell) : null;
    const creditMoney = columns.credit ? parseMoney(creditCell) : null;
    const amountMoney = columns.amount ? parseMoney(amountCell) : null;
    const usesSplitColumns = (columns.debit || columns.credit)
      && ((debitMoney?.magnitude || 0) > 0 || (creditMoney?.magnitude || 0) > 0);
    const typeDirection = columns.direction ? directionFromTypeColumn(row[columns.direction]) : null;

    const entry = { row, payee, debitMoney, creditMoney, amountMoney, usesSplitColumns, typeDirection, amountCell, debitCell, creditCell };
    if (!usesSplitColumns && amountMoney && amountMoney.magnitude > 0 && !amountMoney.suffixDirection && !typeDirection) {
      if (amountMoney.signed < 0) {
        signStats.negatives += 1;
        if (PAYMENT_LIKE_DESC.test(payee)) signStats.negativeLooksLikePayment += 1;
      } else {
        signStats.positives += 1;
      }
    }
    prepared.push(entry);
  }

  const signDecision = decideSignConvention(signStats, options.signConvention);
  const signatureKeys = headers
    .map((key) => [key, normalizeHeader(key)])
    .sort((left, right) => left[1].localeCompare(right[1]));

  // ---- pass 2: classify direction and build transactions ----
  const transactions = [];
  let invalidAmountRows = 0;
  let zeroAmountRows = 0;
  let invalidDateRows = 0;
  let ambiguousDateRows = 0;
  let unknownDirectionRows = 0;
  const currencies = new Map();

  for (const entry of prepared) {
    const { row, payee, debitMoney, creditMoney, amountMoney, usesSplitColumns, typeDirection } = entry;
    const dateRaw = asText(row[columns.date]);
    const parsedDate = parseDate(dateRaw, dateOrderInfo.order, dateOrderInfo.confident);
    if (!parsedDate.date) invalidDateRows += 1;
    if (parsedDate.ambiguous) ambiguousDateRows += 1;

    let amount = null;
    let direction = null;
    let directionSource = 'unknown';
    let amountSource = 'amount';
    let signedFromSource = null;

    if (usesSplitColumns) {
      const debitMagnitude = debitMoney ? debitMoney.magnitude : 0;
      const creditMagnitude = creditMoney ? creditMoney.magnitude : 0;
      amountSource = 'debit-credit-columns';
      if (debitMagnitude > 0 && creditMagnitude === 0) {
        amount = debitMagnitude;
        direction = 'outflow';
        directionSource = 'debit-column';
      } else if (creditMagnitude > 0 && debitMagnitude === 0) {
        amount = creditMagnitude;
        direction = 'inflow';
        directionSource = 'credit-column';
      } else {
        amount = Math.abs(debitMagnitude - creditMagnitude);
        direction = 'unknown';
        directionSource = 'conflicting-debit-credit-columns';
      }
    } else if (amountMoney) {
      amount = amountMoney.magnitude;
      amountSource = columns.amount;
      signedFromSource = amountMoney.signed;

      if (amountMoney.suffixDirection) {
        direction = amountMoney.suffixDirection;
        directionSource = 'amount-suffix';
      } else if (typeDirection) {
        direction = typeDirection;
        directionSource = 'transaction-type';
      } else {
        const negative = amountMoney.signed < 0;
        const { convention, source } = signDecision;
        if (convention === 'positive-spending') {
          direction = negative ? 'inflow' : 'outflow';
          directionSource = source === 'user' ? 'user-sign-choice' : 'file-sign-pattern';
        } else if (convention === 'negative-spending') {
          if (negative) {
            direction = 'outflow';
            directionSource = 'amount-sign';
          } else if (source === 'user') {
            direction = 'inflow';
            directionSource = 'user-sign-choice';
          } else if (source === 'inferred') {
            direction = 'inflow';
            directionSource = 'file-sign-pattern';
          } else {
            direction = 'unknown';
            directionSource = 'not-provided';
          }
        } else {
          direction = 'unknown';
          directionSource = 'not-provided';
        }

        // Words like "refund" outrank an inferred direction, never an explicit one.
        if (INFERRED_SOURCES.has(directionSource) || direction === 'unknown') {
          if (STRONG_INFLOW_DESC.test(payee)) {
            direction = 'inflow';
            directionSource = 'description-hint';
          } else if (direction === 'unknown' && OUTFLOW_DESC.test(payee)) {
            direction = 'outflow';
            directionSource = 'description-hint';
          }
        }
      }
    }

    if (amount === null || !Number.isFinite(amount)) {
      invalidAmountRows += 1;
      continue;
    }
    if (amount <= 0) {
      zeroAmountRows += 1;
      continue;
    }
    if (!direction) {
      direction = 'unknown';
      directionSource = 'unknown';
    }
    if (direction === 'unknown') unknownDirectionRows += 1;

    const signedAmount = direction === 'outflow'
      ? -amount
      : direction === 'inflow'
        ? amount
        : (signedFromSource ?? amount);

    const currencyColumn = columns.currency ? asText(row[columns.currency]).toUpperCase() : '';
    const currency = /^[A-Z]{3}$/.test(currencyColumn)
      ? currencyColumn
      : (detectCurrencyInText(entry.amountCell) || detectCurrencyInText(entry.debitCell) || detectCurrencyInText(entry.creditCell) || fallbackCurrency);
    if (currency) currencies.set(currency, (currencies.get(currency) || 0) + 1);

    const sourceSignature = signatureKeys
      .map(([key, label]) => label + '=' + asText(row[key]))
      .join(String.fromCharCode(31));

    transactions.push({
      date: parsedDate.date,
      dateRaw,
      dateAmbiguous: parsedDate.ambiguous,
      payee,
      normalized: normalizeMerchant(payee),
      amount,
      signedAmount,
      direction,
      directionSource,
      amountSource,
      currency,
      possibleDuplicate: false,
      sourceSignature
    });
  }

  // Identical rows are flagged, not dropped: two genuine same-day purchases can look identical.
  // The recurrence detector counts a flagged row once, so exports with doubled rows are still safe.
  const seen = new Set();
  let duplicateRows = 0;
  for (const transaction of transactions) {
    if (seen.has(transaction.sourceSignature)) {
      transaction.possibleDuplicate = true;
      duplicateRows += 1;
    } else {
      seen.add(transaction.sourceSignature);
    }
    delete transaction.sourceSignature;
  }

  if (!transactions.length) {
    throw new Error('No usable transactions were found. Check that the file contains dates, merchant descriptions, and non-zero amounts.');
  }

  const currencyList = Array.from(currencies.keys()).sort();
  const sorted = Array.from(currencies.entries()).sort((a, b) => b[1] - a[1]);

  return {
    transactions,
    summary: {
      inputRows: nonBlankRows.length,
      importedRows: transactions.length,
      duplicateRows,
      missingPayeeRows,
      invalidAmountRows,
      zeroAmountRows,
      invalidDateRows,
      ambiguousDateRows,
      unknownDirectionRows,
      dateOrderUsed: dateOrderInfo.order,
      dateOrderInferred: !explicitDateOrder && dateOrderInfo.confident,
      signConvention: signDecision.convention,
      signConventionSource: signDecision.source,
      needsSignChoice: signDecision.convention === 'ambiguous',
      currencies: currencyList,
      detectedCurrency: sorted.length ? sorted[0][0] : '',
      mixedCurrencies: currencyList.length > 1
    }
  };
}

/** Backwards-compatible array API for existing consumers. */
export function parseTransactions(rows, options = {}) {
  return parseTransactionsDetailed(rows, options).transactions;
}
