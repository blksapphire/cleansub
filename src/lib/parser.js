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

const INFLOW_RE = /\b(credit(?:ed)?|deposit(?:ed)?|refund(?:ed)?|reversal|cashback|cash back|salary|payroll|income|received|interest|dividend|inward transfer|transfer from|cr)\b/i;
const OUTFLOW_RE = /\b(debit(?:ed)?|withdraw(?:al|n)?|purchase|pos|card payment|bill payment|payment to|subscription charge|autopay|direct debit|fee|charge|spent|paid to|dr)\b/i;
const MERCHANT_NOISE = new Set([
  'the', 'and', 'online', 'internet', 'payment', 'payments', 'purchase',
  'purchases', 'transaction', 'transactions', 'debit', 'credit', 'card',
  'visa', 'mastercard', 'pos', 'web', 'mobile', 'recurring', 'subscription',
  'monthly', 'autopay', 'bill', 'bank', 'transfer', 'approved', 'auth',
  'authorization', 'terminal'
]);

function normalizeHeader(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeDescription(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Group descriptions that usually refer to the same merchant while removing
 * obvious references and payment-rail boilerplate. Kept conservative so
 * similar but unrelated merchants are less likely to be merged.
 */
export function normalizeMerchant(value) {
  let text = normalizeDescription(value);
  if (!text) return '';

  text = text
    .replace(/\b(?:reference|ref|rrn|stan|auth|approval|terminal|trace|txn|transaction)\s*[:#-]?\s*[a-z0-9-]{4,}\b/gi, ' ')
    .replace(/\b(?:\d[ -]?){7,}\b/g, ' ')
    .replace(/\b(?:pos|web|card|online|purchase|payment|debit|dr|visa|mastercard)\b/gi, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const tokens = text.split(' ').filter((token) => token && !MERCHANT_NOISE.has(token));
  return tokens.join(' ').trim();
}

function findHeader(headers, aliases) {
  const lookup = new Map(headers.map((header) => [normalizeHeader(header), header]));
  for (const alias of aliases) {
    if (lookup.has(normalizeHeader(alias))) return lookup.get(normalizeHeader(alias));
  }
  return null;
}

function valueAt(row, header) {
  if (!header) return '';
  const actualKey = Object.keys(row).find((key) => normalizeHeader(key) === normalizeHeader(header));
  return actualKey === undefined ? '' : row[actualKey];
}

function asText(value) {
  return value === null || value === undefined ? '' : String(value).trim();
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

  const isParenthesizedNegative = /^\s*\(.*\)\s*$/.test(text);
  text = text.replace(/[()]/g, '').replace(/[\s\u00a0']/g, '');
  const explicitNegative = isParenthesizedNegative || /^\s*-/.test(text);
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

function classifyDirection(value) {
  const text = normalizeDescription(value);
  if (!text) return null;

  if (/^(?:cr|credit|credited|deposit|refund|reversal|cashback|cash back|salary|payroll|income|interest|dividend)$/.test(text) || INFLOW_RE.test(text)) {
    return 'inflow';
  }
  if (/^(?:dr|debit|debited|withdrawal|purchase|payment|charge|fee)$/.test(text) || OUTFLOW_RE.test(text)) {
    return 'outflow';
  }
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

function inferDateOrder(values) {
  let dmy = 0;
  let mdy = 0;
  for (const value of values) {
    const match = asText(value).match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/);
    if (!match) continue;
    const first = Number(match[1]);
    const second = Number(match[2]);
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

  match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s.*)?$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const ambiguous = first <= 12 && second <= 12 && !dateOrderCertain;
    const order = first > 12 ? 'DMY' : second > 12 ? 'MDY' : dateOrder;
    const month = order === 'MDY' ? first : second;
    const day = order === 'MDY' ? second : first;
    return { date: validIsoDate(match[3], month, day), ambiguous };
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
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))));
}

/**
 * Normalizes CSV rows to a consistent transaction shape. amount is always a
 * positive magnitude; signedAmount is negative for spending and positive for
 * incoming money. Unknown direction is preserved rather than guessed.
 */
export function parseTransactionsDetailed(rows, options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No transaction rows were found in this CSV.');
  }

  const nonBlankRows = rows.filter((row) => row && Object.values(row).some((value) => asText(value) !== ''));
  if (!nonBlankRows.length) {
    throw new Error('No non-empty transaction rows were found in this CSV.');
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

  const rawDates = nonBlankRows.map((row) => valueAt(row, columns.date));
  const requestedOrder = String(options.dateOrder || 'auto').toUpperCase();
  const explicitDateOrder = requestedOrder === 'MDY' || requestedOrder === 'DMY';
  const dateOrderInfo = explicitDateOrder
    ? { order: requestedOrder, confident: true }
    : inferDateOrder(rawDates);
  const inferredOrder = dateOrderInfo.order;

  const transactions = [];
  let missingPayeeRows = 0;
  let invalidAmountRows = 0;
  let zeroAmountRows = 0;
  let invalidDateRows = 0;
  let ambiguousDateRows = 0;
  let unknownDirectionRows = 0;

  for (const row of nonBlankRows) {
    const payee = asText(valueAt(row, columns.payee));
    if (!payee) {
      missingPayeeRows += 1;
      continue;
    }

    const dateRaw = asText(valueAt(row, columns.date));
    const parsedDate = parseDate(dateRaw, inferredOrder, dateOrderInfo.confident);
    if (!parsedDate.date) invalidDateRows += 1;
    if (parsedDate.ambiguous) ambiguousDateRows += 1;

    let amount = null;
    let direction = null;
    let directionSource = 'unknown';
    let amountSource = 'amount';

    const debitRaw = columns.debit ? parseMoney(valueAt(row, columns.debit)) : null;
    const creditRaw = columns.credit ? parseMoney(valueAt(row, columns.credit)) : null;
    const debitMagnitude = debitRaw ? debitRaw.magnitude : 0;
    const creditMagnitude = creditRaw ? creditRaw.magnitude : 0;

    if ((columns.debit || columns.credit) && (debitMagnitude > 0 || creditMagnitude > 0)) {
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
    } else {
      const rawAmount = columns.amount ? parseMoney(valueAt(row, columns.amount)) : null;
      if (rawAmount) {
        amount = rawAmount.magnitude;
        amountSource = columns.amount || 'debit-credit-columns';

        const typeHint = classifyDirection(valueAt(row, columns.direction));
        const descriptionHint = classifyDirection(payee);
        if (rawAmount.suffixDirection) {
          direction = rawAmount.suffixDirection;
          directionSource = 'amount-suffix';
        } else if (typeHint) {
          direction = typeHint;
          directionSource = 'transaction-type';
        } else if (descriptionHint === 'inflow') {
          direction = 'inflow';
          directionSource = 'description-hint';
        } else if (descriptionHint === 'outflow') {
          direction = 'outflow';
          directionSource = 'description-hint';
        } else if (rawAmount.signed < 0) {
          direction = 'outflow';
          directionSource = 'amount-sign';
        } else {
          direction = 'unknown';
          directionSource = 'not-provided';
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

    const originalMoney = columns.amount ? parseMoney(valueAt(row, columns.amount)) : null;
    const signedAmount = direction === 'outflow'
      ? -amount
      : direction === 'inflow'
        ? amount
        : (originalMoney?.signed ?? amount);
    const currency = columns.currency ? asText(valueAt(row, columns.currency)).toUpperCase() : '';

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
      currency
    });
  }

  const seen = new Set();
  let duplicateRows = 0;
  const deduplicated = transactions.filter((transaction) => {
    const dateKey = transaction.date || normalizeDescription(transaction.dateRaw);
    const key = [
      dateKey,
      normalizeDescription(transaction.payee),
      transaction.amount.toFixed(2),
      transaction.direction,
      transaction.signedAmount.toFixed(2)
    ].join('|');
    if (seen.has(key)) {
      duplicateRows += 1;
      return false;
    }
    seen.add(key);
    return true;
  });

  if (!deduplicated.length) {
    throw new Error('No usable transactions were found. Check that your CSV contains dates, merchant descriptions, and non-zero amounts.');
  }

  return {
    transactions: deduplicated,
    summary: {
      inputRows: nonBlankRows.length,
      importedRows: deduplicated.length,
      duplicateRows,
      missingPayeeRows,
      invalidAmountRows,
      zeroAmountRows,
      invalidDateRows,
      ambiguousDateRows,
      unknownDirectionRows,
      dateOrderUsed: inferredOrder,
      dateOrderInferred: !explicitDateOrder && dateOrderInfo.confident
    }
  };
}

/** Backwards-compatible array API for existing consumers. */
export function parseTransactions(rows, options = {}) {
  return parseTransactionsDetailed(rows, options).transactions;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function classifyFrequency(days) {
  if (days >= 6 && days <= 8) return { key: 'weekly', label: 'Weekly', target: 7 };
  if (days >= 12 && days <= 16) return { key: 'fortnightly', label: 'Every 2 weeks', target: 14 };
  if (days >= 25 && days <= 35) return { key: 'monthly', label: 'Monthly', target: 30.4375 };
  if (days >= 55 && days <= 65) return { key: 'every-two-months', label: 'Every 2 months', target: 60.875 };
  if (days >= 80 && days <= 100) return { key: 'quarterly', label: 'Quarterly', target: 91.3125 };
  if (days >= 165 && days <= 195) return { key: 'twice-yearly', label: 'Every 6 months', target: 182.625 };
  if (days >= 350 && days <= 380) return { key: 'yearly', label: 'Yearly', target: 365.25 };
  return null;
}

function intervalDeviation(intervals, typicalInterval) {
  if (!intervals.length || typicalInterval <= 0) return Infinity;
  return intervals.reduce((sum, value) => sum + Math.abs(value - typicalInterval), 0) / intervals.length / typicalInterval;
}

function stableAmounts(amounts) {
  if (amounts.length < 2) return false;
  const typical = median(amounts);
  if (typical <= 0) return false;
  return amounts.every((amount) => Math.abs(amount - typical) <= Math.max(1, typical * 0.05));
}

/**
 * Detects plausible recurring outflows. Incoming credits/refunds are ignored.
 * Unknown-direction rows may be shown as low-confidence candidates, but
 * cannot receive a high-confidence label without explicit outflow evidence.
 */
export function detectRecurring(transactions) {
  if (!Array.isArray(transactions) || !transactions.length) return [];

  const groups = new Map();
  for (const transaction of transactions) {
    if (!transaction || !transaction.payee || !transaction.date) continue;
    if (!Number.isFinite(Number(transaction.amount)) || Number(transaction.amount) <= 0) continue;
    if (transaction.direction === 'inflow') continue;

    const merchant = normalizeMerchant(transaction.normalized || transaction.payee);
    if (!merchant) continue;
    if (!groups.has(merchant)) groups.set(merchant, []);
    groups.get(merchant).push({
      ...transaction,
      normalized: merchant,
      amount: Math.abs(Number(transaction.amount)),
      direction: transaction.direction === 'outflow' ? 'outflow' : 'unknown'
    });
  }

  const results = [];
  for (const [merchantKey, group] of groups.entries()) {
    const sorted = group.slice().sort((a, b) => a.date.localeCompare(b.date));
    const byDate = new Map();
    for (const transaction of sorted) {
      if (!byDate.has(transaction.date)) {
        byDate.set(transaction.date, {
          date: transaction.date,
          amount: transaction.amount,
          directions: [transaction.direction],
          ambiguousDate: Boolean(transaction.dateAmbiguous)
        });
      } else {
        const occurrence = byDate.get(transaction.date);
        occurrence.amount += transaction.amount;
        occurrence.directions.push(transaction.direction);
        occurrence.ambiguousDate = occurrence.ambiguousDate || Boolean(transaction.dateAmbiguous);
      }
    }

    const occurrences = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    if (occurrences.length < 3) continue;

    const intervals = [];
    for (let index = 1; index < occurrences.length; index += 1) {
      const earlier = new Date(occurrences[index - 1].date + 'T00:00:00');
      const later = new Date(occurrences[index].date + 'T00:00:00');
      const days = Math.round((later - earlier) / 86400000);
      if (days > 0) intervals.push(days);
    }
    if (intervals.length < 2) continue;

    const typicalInterval = median(intervals);
    const frequency = classifyFrequency(typicalInterval);
    if (!frequency) continue;

    const deviation = intervalDeviation(intervals, frequency.target);
    if (deviation > 0.22) continue;

    const amounts = occurrences.map((occurrence) => occurrence.amount);
    const typicalAmount = median(amounts);
    const amountStable = stableAmounts(amounts);
    const allOutflowsConfirmed = occurrences.every((occurrence) => occurrence.directions.every((direction) => direction === 'outflow'));
    const hasAmbiguousDates = occurrences.some((occurrence) => occurrence.ambiguousDate);
    const confidence = allOutflowsConfirmed && amountStable && deviation <= 0.12 && !hasAmbiguousDates
      ? 'High'
      : allOutflowsConfirmed && (amountStable || occurrences.length >= 4) && deviation <= 0.18 && !hasAmbiguousDates
        ? 'Medium'
        : 'Low';

    const estimatedMonthly = typicalAmount * (30.4375 / typicalInterval);
    const reasons = [
      'Appeared on ' + occurrences.length + ' separate dates',
      frequency.label + ' pattern (median interval ' + typicalInterval + ' days)',
      amountStable ? 'Amounts are relatively consistent' : 'Amounts vary between occurrences',
      allOutflowsConfirmed ? 'Outgoing payment direction identified' : 'Transaction direction is unclear from the source file'
    ];
    if (hasAmbiguousDates) reasons.push('Some dates used an assumed day/month order');

    results.push({
      payee: sorted[0].payee,
      normalized: merchantKey,
      count: occurrences.length,
      intervals,
      medianIntervalDays: typicalInterval,
      frequency: frequency.label,
      frequencyKey: frequency.key,
      estimatedMonthly,
      confidence,
      reasons,
      amountStable,
      directionConfirmed: allOutflowsConfirmed,
      intervalDeviation: deviation
    });
  }

  const confidenceRank = { High: 0, Medium: 1, Low: 2 };
  results.sort((a, b) => confidenceRank[a.confidence] - confidenceRank[b.confidence] || b.estimatedMonthly - a.estimatedMonthly);
  return results;
}
