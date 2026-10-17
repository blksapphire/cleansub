import test from 'node:test';
import assert from 'node:assert/strict';
import { detectRecurring, normalizeMerchant, parseTransactionsDetailed } from './parser.js';

test('normalizes negative amounts and flags (not drops) exact duplicate rows', () => {
  const rows = [
    { Date: '2026-01-10', Description: 'Netflix', Amount: '-15.99' },
    { Date: '2026-01-10', Description: 'Netflix', Amount: '-15.99' },
    { Date: '2026-02-10', Description: 'Netflix', Amount: '-15.99' },
    { Date: '2026-03-10', Description: 'Netflix', Amount: '-15.99' }
  ];

  const { transactions, summary } = parseTransactionsDetailed(rows);
  assert.equal(summary.duplicateRows, 1);
  assert.equal(transactions.length, 4);
  assert.equal(transactions.filter((t) => t.possibleDuplicate).length, 1);
  assert.equal(transactions[0].amount, 15.99);
  assert.equal(transactions[0].signedAmount, -15.99);
  assert.equal(transactions[0].direction, 'outflow');

  const found = detectRecurring(transactions);
  assert.equal(found.length, 1);
  assert.equal(found[0].frequency, 'Monthly');
  assert.equal(found[0].confidence, 'High');
});

test('uses explicit Debit and Credit columns and excludes inflows', () => {
  const rows = [
    { Date: '2026-01-10', Description: 'Netflix', Debit: '15.99', Credit: '' },
    { Date: '2026-02-10', Description: 'Netflix', Debit: '15.99', Credit: '' },
    { Date: '2026-03-10', Description: 'Netflix', Debit: '15.99', Credit: '' },
    { Date: '2026-01-15', Description: 'Salary', Debit: '', Credit: '200000' },
    { Date: '2026-02-15', Description: 'Salary', Debit: '', Credit: '200000' },
    { Date: '2026-03-15', Description: 'Salary', Debit: '', Credit: '200000' }
  ];

  const { transactions } = parseTransactionsDetailed(rows);
  assert.equal(transactions.find((row) => row.payee === 'Netflix').direction, 'outflow');
  assert.equal(transactions.find((row) => row.payee === 'Salary').direction, 'inflow');

  const found = detectRecurring(transactions);
  assert.deepEqual(found.map((item) => item.payee), ['Netflix']);
});

test('parses European decimal/thousands formatting and day-first dates', () => {
  const { transactions, summary } = parseTransactionsDetailed([
    { Date: '16/10/2026', Description: 'Cloud Storage', Amount: '(1.234,50)' },
    { Date: '17/10/2026', Description: 'Coffee', Amount: '12,50' }
  ]);

  assert.equal(summary.dateOrderUsed, 'DMY');
  assert.equal(transactions[0].date, '2026-10-16');
  assert.equal(transactions[0].signedAmount, -1234.5);
  assert.equal(transactions[1].amount, 12.5);
});

test('unknown direction can never receive high confidence', () => {
  const { transactions } = parseTransactionsDetailed([
    { Date: '2026-01-10', Description: 'Streaming Service', Amount: '15.99' },
    { Date: '2026-02-10', Description: 'Streaming Service', Amount: '15.99' },
    { Date: '2026-03-10', Description: 'Streaming Service', Amount: '15.99' }
  ]);

  assert.ok(transactions.every((row) => row.direction === 'unknown'));
  const found = detectRecurring(transactions);
  assert.equal(found.length, 1);
  assert.equal(found[0].confidence, 'Low');
  assert.equal(found[0].directionConfirmed, false);
});

test('detects quarterly recurrence and estimates the monthly equivalent', () => {
  const { transactions } = parseTransactionsDetailed([
    { Date: '2025-01-01', Description: 'Domain Renewal', Amount: '-90.00' },
    { Date: '2025-04-02', Description: 'Domain Renewal', Amount: '-90.00' },
    { Date: '2025-07-02', Description: 'Domain Renewal', Amount: '-90.00' },
    { Date: '2025-10-01', Description: 'Domain Renewal', Amount: '-90.00' }
  ]);

  const found = detectRecurring(transactions);
  assert.equal(found.length, 1);
  assert.equal(found[0].frequency, 'Quarterly');
  assert.ok(Math.abs(found[0].estimatedMonthly - 30) < 1);
});

test('flags ambiguous numeric dates when the file provides no date-order evidence', () => {
  const { transactions } = parseTransactionsDetailed([
    { Date: '01/02/2026', Description: 'Cloud Plan', Amount: '-10.00' },
    { Date: '01/03/2026', Description: 'Cloud Plan', Amount: '-10.00' },
    { Date: '01/04/2026', Description: 'Cloud Plan', Amount: '-10.00' }
  ]);

  assert.ok(transactions.every((row) => row.dateAmbiguous));
  const found = detectRecurring(transactions);
  assert.equal(found.length, 1);
  assert.equal(found[0].confidence, 'Low');
  assert.ok(found[0].reasons.some((reason) => reason.includes('assumed day/month order')));
});

test('normalizes card boilerplate and reference codes out of merchant labels', () => {
  assert.equal(normalizeMerchant('POS CARD PURCHASE Netflix.com REF: 123456789'), 'netflix');
});

test('does not merge distinct same-day charges with different source references', () => {
  const { transactions, summary } = parseTransactionsDetailed([
    { Date: '2026-01-10', Description: 'Coffee Shop', Amount: '-5.00', Reference: 'ABC001' },
    { Date: '2026-01-10', Description: 'Coffee Shop', Amount: '-5.00', Reference: 'ABC002' }
  ]);

  assert.equal(summary.duplicateRows, 0);
  assert.equal(transactions.length, 2);
});
