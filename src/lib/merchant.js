// Merchant-name normalisation. Kept separate so parser, detector and catalog share one definition.

const NOISE = new Set([
  'the', 'and', 'online', 'internet', 'payment', 'payments', 'purchase',
  'purchases', 'transaction', 'transactions', 'debit', 'credit', 'card',
  'visa', 'mastercard', 'pos', 'web', 'mobile', 'recurring', 'subscription',
  'monthly', 'autopay', 'bill', 'bank', 'transfer', 'approved', 'auth',
  'authorization', 'terminal', 'com', 'net', 'org', 'www', 'io', 'pymt', 'svc'
]);

// Payment-processor prefixes ("PAYPAL *SPOTIFY") that hide the real merchant.
const PROCESSOR_PREFIX = /^(?:paypal|pp|sq|square|sp|tst|stripe|paddle|fsp)\s*\*\s*/;

export function normalizeDescription(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Tokens such as "p1a2b3c4d5" are per-transaction reference codes, not merchant names.
function looksLikeReferenceCode(token) {
  if (token.length < 6) return false;
  const digits = (token.match(/\d/g) || []).length;
  const letters = (token.match(/\p{L}/gu) || []).length;
  return digits >= 3 && letters >= 1;
}

/**
 * Group descriptions that usually refer to the same merchant while removing
 * references and payment-rail boilerplate. Conservative on purpose: similar but
 * unrelated merchants should not merge.
 */
const cache = new Map();

export function normalizeMerchant(value) {
  const key = String(value ?? '');
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const result = computeMerchant(key);
  if (cache.size > 20000) cache.clear();
  cache.set(key, result);
  return result;
}

function computeMerchant(value) {
  let text = normalizeDescription(value);
  if (!text) return '';

  text = text.replace(PROCESSOR_PREFIX, '');
  text = text
    .replace(/\b(?:reference|ref|rrn|stan|auth|approval|terminal|trace|txn|transaction)\s*[:#-]?\s*[a-z0-9-]{4,}\b/gi, ' ')
    .replace(/\b(?:\d[ -]?){7,}\b/g, ' ')
    .replace(/\b(?:pos|web|card|online|purchase|payment|debit|dr|visa|mastercard)\b/gi, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const tokens = text.split(' ').filter((token) => token && !NOISE.has(token));
  const withoutCodes = tokens.filter((token) => !looksLikeReferenceCode(token));
  // If stripping codes would erase the whole name (e.g. "office365"), keep it.
  return (withoutCodes.length ? withoutCodes : tokens).join(' ').trim();
}
