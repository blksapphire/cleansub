const supportedCache = new Map();

export function isValidCurrency(code) {
  if (!/^[A-Z]{3}$/.test(code || '')) return false;
  if (supportedCache.has(code)) return supportedCache.get(code);
  let ok = true;
  try { new Intl.NumberFormat('en-US', { style: 'currency', currency: code }); } catch { ok = false; }
  supportedCache.set(code, ok);
  return ok;
}

export function formatCurrency(amount, currency) {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(value);
  } catch {
    return (currency ? currency + ' ' : '') + value.toFixed(2);
  }
}

/** [{currency, amount}] -> "₦45,000.00 + $32.00". Never adds across currencies. */
export function formatTotals(totals, fallbackCurrency) {
  if (!totals.length) return formatCurrency(0, fallbackCurrency);
  return totals.map(({ currency, amount }) => formatCurrency(amount, currency || fallbackCurrency)).join(' + ');
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatPct(value) {
  const pct = Math.round(Math.abs(value) * 100);
  return (value >= 0 ? '+' : '-') + pct + '%';
}
