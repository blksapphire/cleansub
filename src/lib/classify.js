// Classifies a detected recurring stream from its narration so subscriptions are not
// confused with money sent to people or with bank charges. Patterns are grounded in
// Nigerian bank exports (Moniepoint, OPay, PalmPay, Momo PSB, Monnify), where a
// person-to-person transfer reads "TRANSFER TO <NAME> <BANK> *****123/TRF" or
// "<ACCOUNT HOLDER> TO <NAME> <BANK> *****123/TRF".

const BANK_FEE = /\b(?:value added tax|vat|levy|stamp duty|commission|service charge|sms (?:alert )?charge|alert charge|maintenance fee|bank charge)\b/i;
const SAVINGS = /\b(?:flexible savings?|savings?|mmf|money market)\b/i;
const TRANSFER = /\b(?:transfer to|pos transfer|transfer from|sent to|mobile transfer|p2p|mob\/uto|trf)\b/i;
const ACCOUNT_TO_ACCOUNT = /^[a-z][a-z .'-]+\s+to\s+[a-z]/i;
const BANK_MARKER = /(?:\*{3,}\d+|opay|palmpay|momo|moniepoint|mfb|psb|kuda|monnify|paystack|flutterwave)/i;
const OTHER = /\b(?:airtime|data bundle|cash withdrawal|cash advance|top[- ]?up|reversal|refund|rewards?|cash ?back|cash ?out|miscellaneous)\b/i;

export const KIND_LABELS = {
  subscription: 'Subscription',
  transfer: 'Transfer',
  fee: 'Bank fee',
  other: 'Other recurring'
};

export function classifyRecurring(result) {
  const narration = String(result?.payee || '');
  const merchant = String(result?.normalized || '');
  const text = narration + ' ' + merchant;
  if (!text.trim()) return 'subscription';
  if (BANK_FEE.test(text)) return 'fee';
  if (SAVINGS.test(text)) return 'other';
  if (TRANSFER.test(text)) return 'transfer';
  if (ACCOUNT_TO_ACCOUNT.test(narration) && BANK_MARKER.test(text)) return 'transfer';
  if (OTHER.test(text)) return 'other';
  return 'subscription';
}
