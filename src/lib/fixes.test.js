import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRecurring, normalizeMerchant, parseTransactionsDetailed, matrixToRows, decodeBuffer } from './parser.js';

const row = (Date, Description, Amount, extra = {}) => ({ Date, Description, Amount, ...extra });
const run = (rows, options) => {
  const { transactions, summary } = parseTransactionsDetailed(rows, options);
  return { transactions, summary, found: detectRecurring(transactions) };
};
const monthly = (desc, amount, months = [1, 2, 3, 4], day = 10) =>
  months.map((m) => row(`2026-${String(m).padStart(2, '0')}-${day}`, desc, amount));

test('monthly estimate equals the charge, not a skewed interval ratio', () => {
  const { found } = run(monthly('Netflix', '-15.99'));
  assert.equal(found[0].estimatedMonthly.toFixed(2), '15.99');
});

test('a Type column of "Credit Card" does not turn spending into inflow', () => {
  const { found, transactions } = run(monthly('Netflix', '-15.99', [1, 2, 3]).map((r) => ({ ...r, Type: 'Credit Card' })));
  assert.equal(transactions[0].direction, 'outflow');
  assert.equal(found.length, 1);
});

test('"Interest charge" is not classified as an inflow', () => {
  const { transactions } = run([row('2026-01-10', 'Interest charge', '-4.20'), row('2026-02-10', 'Interest charge', '-4.50')]);
  assert.ok(transactions.every((t) => t.direction === 'outflow'));
});

test('all-positive files need a sign choice; the choice is honoured', () => {
  const rows = monthly('Netflix', '15.99', [1, 2, 3]);
  const auto = run(rows);
  assert.equal(auto.summary.needsSignChoice, true);
  assert.equal(auto.found[0].confidence, 'Low');
  const chosen = run(rows, { signConvention: 'positive-spending' });
  assert.equal(chosen.summary.needsSignChoice, false);
  assert.equal(chosen.found[0].confidence, 'High');
  const income = run(rows, { signConvention: 'positive-income' });
  assert.equal(income.found.length, 0);
});

test('card-style exports (charges positive, payments negative) are inferred, capped at Medium', () => {
  const rows = [...monthly('Netflix', '15.99', [1, 2, 3]), row('2026-02-25', 'Card payment thank you', '-300')];
  const { found, summary } = run(rows);
  assert.equal(summary.signConvention, 'positive-spending');
  assert.equal(found[0].confidence, 'Medium');
  assert.equal(found[0].directionInferred, true);
});

test('bank export with more incoming than outgoing rows is not flipped', () => {
  const rows = [
    ...monthly('Netflix', '-15.99', [1, 2, 3]),
    row('2026-01-12', 'Client A', '900'), row('2026-01-20', 'Client B', '700'),
    row('2026-02-12', 'Client A', '900'), row('2026-02-20', 'Client B', '700'), row('2026-03-12', 'Client A', '900')
  ];
  const { summary, found } = run(rows);
  assert.equal(summary.signConvention, 'negative-spending');
  assert.equal(found[0].confidence, 'High');
});

test('currency symbols do not hide the sign and set the detected currency', () => {
  const { summary, found } = run(monthly('Netflix', '₦-8,000.00', [1, 2, 3]));
  assert.equal(summary.detectedCurrency, 'NGN');
  assert.equal(found[0].confidence, 'High');
  assert.equal(found[0].currency, 'NGN');
});

test('trailing-minus amounts are negative', () => {
  const { transactions } = run([row('2026-01-10', 'Netflix', '15.99-')]);
  assert.equal(transactions[0].direction, 'outflow');
});

test('mixed currencies are kept apart', () => {
  const rows = [
    ...monthly('Netflix', '-15.99', [1, 2, 3]).map((r) => ({ ...r, Currency: 'USD' })),
    ...monthly('Netflix', '-8000', [1, 2, 3]).map((r) => ({ ...r, Currency: 'NGN' }))
  ];
  const { summary, found } = run(rows);
  assert.equal(summary.mixedCurrencies, true);
  assert.deepEqual(found.map((f) => f.currency).sort(), ['NGN', 'USD']);
});

test('one missed billing cycle does not break detection', () => {
  const { found } = run(monthly('Gym', '-20', [1, 2, 4, 5]));
  assert.equal(found.length, 1);
  assert.equal(found[0].frequency, 'Monthly');
  assert.equal(found[0].skippedCycles, 1);
  assert.notEqual(found[0].confidence, 'High');
});

test('one merchant billing two plans yields two streams', () => {
  const rows = [];
  for (const m of [1, 2, 3]) {
    rows.push(row(`2026-0${m}-03`, 'Apple.com/bill', '-0.99'), row(`2026-0${m}-20`, 'Apple.com/bill', '-9.99'));
  }
  const { found } = run(rows);
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((f) => f.streamAmount).sort((a, b) => a - b), [0.99, 9.99]);
  assert.ok(found.every((f) => !f.trial));
  assert.notEqual(found[0].streamKey, found[1].streamKey);
});

test('per-transaction reference codes and processor prefixes do not split a merchant', () => {
  const { found } = run([
    row('2026-01-10', 'SPOTIFY P1A2B3C4D5', '-10.99'),
    row('2026-02-10', 'PAYPAL *SPOTIFY', '-10.99'),
    row('2026-03-10', 'PP*SPOTIFY 4029', '-10.99')
  ]);
  assert.equal(found.length, 1);
  assert.equal(normalizeMerchant('1Password'), '1password');
  assert.equal(normalizeMerchant('Office365'), 'office365');
});

test('dd.mm.yyyy and two-digit years parse', () => {
  assert.equal(run(monthly('Netflix', '-15.99', [1, 2, 3]).map((r, i) => ({ ...r, Date: `16.0${i + 1}.2026` }))).found.length, 1);
  const { transactions, summary } = parseTransactionsDetailed([row('15/01/26', 'Netflix', '-15.99')]);
  assert.equal(transactions[0].date, '2026-01-15');
  assert.equal(summary.invalidDateRows, 0);
});

test('identical same-day rows are flagged, never double-counted in detection', () => {
  const rows = [...monthly('Netflix', '-15.99', [1, 2, 3]), row('2026-02-10', 'Netflix', '-15.99')];
  const { found, summary } = run(rows);
  assert.equal(summary.duplicateRows, 1);
  assert.equal(found[0].estimatedMonthly.toFixed(2), '15.99');
});

test('two identical charges a year apart are only a Possible match', () => {
  const { found } = run([row('2025-02-01', 'Domain', '-90'), row('2026-02-02', 'Domain', '-90')]);
  assert.equal(found[0].confidence, 'Possible');
  assert.equal(found[0].frequency, 'Yearly');
  assert.equal(found[0].estimatedMonthly.toFixed(2), '7.50');
});

test('amounts that bounce around are not called drift', () => {
  const { found } = run([row('2026-01-10', 'Interest charge', '-4.20'), row('2026-02-10', 'Interest charge', '-4.50'), row('2026-03-10', 'Interest charge', '-4.10')]);
  assert.equal(found[0].confidence, 'Low');
  assert.equal(found[0].amountDrifting, false);
});

test('header row is found below an account-info preamble', () => {
  const matrix = [['Statement for Jane'], ['Account', '1234'], [], ['Date', 'Description', 'Amount'], ['2026-01-10', 'Netflix', '-15.99']];
  const rows = matrixToRows(matrix);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Description, 'Netflix');
});

test('Windows-1252 and BOM-prefixed bytes decode', () => {
  assert.equal(decodeBuffer(Buffer.from([0xef, 0xbb, 0xbf, 0x44, 0x61])), 'Da');
  assert.equal(decodeBuffer(Buffer.from([0x43, 0x61, 0x66, 0xe9])), 'Café');
});
