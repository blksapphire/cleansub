import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTransactionsDetailed, detectRecurring } from './parser.js';
import { detectTrialConversions, analyzePriceChange } from './detect.js';
import { nextCharge, upcomingCharges, buildIcs, addMonths } from './schedule.js';
import { lookupMerchant } from '../data/catalog.js';
import { enrichResults, findOverlaps, totalsByCurrency, isLikely } from './insights.js';
import { analyzeMatrix } from './analyze.js';
import { normalizeMerchant, cleanPayee } from './merchant.js';

const row = (Date, Description, Amount) => ({ Date, Description, Amount });
const detect = (rows) => detectRecurring(parseTransactionsDetailed(rows).transactions);
const parsed = (rows) => parseTransactionsDetailed(rows).transactions;

/* ---- price changes ---- */
test('a single price rise is a step with the right numbers', () => {
  const [r] = detect([row('2026-01-10', 'Netflix', '-10'), row('2026-02-10', 'Netflix', '-10'), row('2026-03-10', 'Netflix', '-12'), row('2026-04-10', 'Netflix', '-12')]);
  assert.equal(r.priceChange.kind, 'step');
  assert.equal(r.priceChange.direction, 'increase');
  assert.equal(r.priceChange.from, 10);
  assert.equal(r.priceChange.to, 12);
  assert.equal(r.priceChange.changeDate, '2026-03-10');
});
test('gradual same-direction movement is drift; erratic or tiny change is nothing', () => {
  const drift = analyzePriceChange([8000, 8650, 9350, 10100].map((amount, i) => ({ date: `2026-0${i + 1}-10`, amount })));
  assert.equal(drift.kind, 'drift');
  assert.equal(analyzePriceChange([10, 12, 9, 13].map((amount, i) => ({ date: `2026-0${i + 1}-10`, amount }))), null);
  assert.equal(analyzePriceChange([10, 10.1, 10].map((amount, i) => ({ date: `2026-0${i + 1}-10`, amount }))), null);
});
test('price decreases are reported as decreases', () => {
  const [r] = detect([row('2026-01-10', 'Gym', '-30'), row('2026-02-10', 'Gym', '-30'), row('2026-03-10', 'Gym', '-25'), row('2026-04-10', 'Gym', '-25')]);
  assert.equal(r.priceChange.direction, 'decrease');
});
test('a sustained 19% rise keeps one stream: 2 old + 4 new (Netflix)', () => {
  const found = detect([
    row('2026-01-10', 'Netflix', '-15.99'), row('2026-02-10', 'Netflix', '-15.99'),
    row('2026-03-10', 'Netflix', '-18.99'), row('2026-04-10', 'Netflix', '-18.99'),
    row('2026-05-10', 'Netflix', '-18.99'), row('2026-06-10', 'Netflix', '-18.99')
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].count, 6);
  assert.equal(found[0].priceChange.kind, 'step');
  assert.equal(found[0].priceChange.from, 15.99);
  assert.equal(found[0].priceChange.to, 18.99);
  assert.equal(found[0].priceChange.changeDate, '2026-03-10');
  assert.equal(found[0].estimatedMonthly.toFixed(2), '18.99');
  assert.equal(found[0].streamAmount, undefined);
});
test('a sustained rise with equal halves does not become two subscriptions: 3 old + 3 new', () => {
  const found = detect([
    row('2026-01-10', 'Netflix', '-15.99'), row('2026-02-10', 'Netflix', '-15.99'), row('2026-03-10', 'Netflix', '-15.99'),
    row('2026-04-10', 'Netflix', '-18.99'), row('2026-05-10', 'Netflix', '-18.99'), row('2026-06-10', 'Netflix', '-18.99')
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].count, 6);
  assert.equal(found[0].priceChange.kind, 'step');
  assert.equal(found[0].estimatedMonthly.toFixed(2), '18.99');
});
test('parallel plans billed by one merchant still split into streams', () => {
  const rows = [];
  for (const month of [1, 2, 3, 4]) {
    rows.push(row(`2026-0${month}-05`, 'Apple', '-10.99'), row(`2026-0${month}-20`, 'Apple', '-24.99'));
  }
  const found = detect(rows);
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((r) => r.streamAmount).sort((a, b) => a - b), [10.99, 24.99]);
  for (const result of found) {
    assert.equal(result.count, 4);
    assert.equal(result.priceChange, null);
  }
});

/* ---- trial conversions ---- */
test('a small first charge before a steady larger one marks a trial conversion', () => {
  const rows = [row('2026-01-05', 'Notion', '-1.00'), row('2026-01-19', 'Notion', '-12'), row('2026-02-19', 'Notion', '-12'), row('2026-03-19', 'Notion', '-12')];
  const found = detect(rows);
  assert.equal(found.length, 1);
  assert.equal(found[0].trial.trialAmount, 1);
  assert.equal(found[0].estimatedMonthly.toFixed(2), '12.00');
  const alerts = detectTrialConversions(parsed(rows), found);
  assert.equal(alerts[0].kind, 'recurring');
});
test('a just-converted trial with one paid charge is a possible alert; an old one is not', () => {
  const recent = parsed([row('2026-09-01', 'Canva', '-1.00'), row('2026-09-15', 'Canva', '-13'), row('2026-10-01', 'Other', '-5')]);
  assert.equal(detectTrialConversions(recent, [])[0].kind, 'possible');
  const old = parsed([row('2026-01-01', 'Canva', '-1.00'), row('2026-01-15', 'Canva', '-13'), row('2026-10-01', 'Other', '-5')]);
  assert.equal(detectTrialConversions(old, []).length, 0);
});
test('ordinary shopping is not a trial', () => {
  const t = parsed([row('2026-01-05', 'Grocer', '-3'), row('2026-01-19', 'Grocer', '-80'), row('2026-02-02', 'Grocer', '-44'), row('2026-03-01', 'Grocer', '-12')]);
  assert.equal(detectTrialConversions(t, detectRecurring(t)).length, 0);
});

/* ---- schedule + ics ---- */
test('month-end billing days are preserved and clamped', () => {
  assert.equal(addMonths('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(addMonths('2026-02-28', 1, 31), '2026-03-31');
  assert.equal(addMonths('2026-11-15', 3, 15), '2027-02-15');
});
test('next charge rolls forward from an old statement and flags it', () => {
  const [r] = detect([row('2026-01-10', 'Netflix', '-15.99'), row('2026-02-10', 'Netflix', '-15.99'), row('2026-03-10', 'Netflix', '-15.99')]);
  assert.deepEqual(nextCharge(r, '2026-03-11'), { date: '2026-04-10', cyclesAhead: 0, projectedFromOldData: false });
  const rolled = nextCharge(r, '2026-06-01');
  assert.equal(rolled.date, '2026-06-10');
  assert.equal(rolled.projectedFromOldData, true);
});
test('weekly items appear several times inside the horizon, sorted by date', () => {
  const weekly = detect([row('2026-01-05', 'Meal box', '-30'), row('2026-01-12', 'Meal box', '-30'), row('2026-01-19', 'Meal box', '-30'), row('2026-01-26', 'Meal box', '-30')]);
  const monthly = detect([row('2026-01-10', 'Netflix', '-15.99'), row('2026-02-10', 'Netflix', '-15.99'), row('2026-03-10', 'Netflix', '-15.99')]);
  const items = upcomingCharges([...weekly, ...monthly], '2026-02-02', 21);
  assert.ok(items.filter((i) => i.result.payee === 'Meal box').length >= 3);
  assert.deepEqual(items.map((i) => i.date), [...items.map((i) => i.date)].sort());
});
test('ICS output is valid-shaped, escaped, CRLF, folded, and stable', () => {
  const [r] = detect([row('2026-01-31', 'Big, Fancy; Co', '-9.99'), row('2026-02-28', 'Big, Fancy; Co', '-9.99'), row('2026-03-31', 'Big, Fancy; Co', '-9.99')]);
  const now = new Date('2026-10-16T10:00:00Z');
  const ics = buildIcs([r], { fromIso: '2026-04-01', now, formatAmount: (a) => a.toFixed(2) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('SUMMARY:Big\\, Fancy\\; Co'));
  assert.ok(ics.includes('RRULE:FREQ=MONTHLY;INTERVAL=1'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260428'));
  assert.ok(ics.includes('DTSTAMP:20261016T100000Z'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(ics, buildIcs([r], { fromIso: '2026-04-01', now, formatAmount: (a) => a.toFixed(2) }));
});

/* ---- catalog + overlaps ---- */
test('catalog matches whole words and prefers the most specific pattern', () => {
  assert.equal(lookupMerchant('netflix').id, 'netflix');
  assert.equal(lookupMerchant('apple music').id, 'apple-music');
  assert.equal(lookupMerchant('apple').id, 'apple');
  assert.equal(lookupMerchant('google one').id, 'google-one');
  assert.equal(lookupMerchant('pineapple farm'), null);
  assert.equal(lookupMerchant('zoomer cafe'), null);
});
test('overlap flags need two different services in one category and ignore Possible matches', () => {
  const rows = [];
  for (const m of [1, 2, 3]) rows.push(row(`2026-0${m}-10`, 'Netflix', '-15.99'), row(`2026-0${m}-12`, 'Disney Plus', '-9.99'), row(`2026-0${m}-14`, 'Spotify', '-10.99'));
  const results = enrichResults(detect(rows));
  const overlaps = findOverlaps(results);
  assert.equal(overlaps.length, 1);
  assert.equal(overlaps[0].category, 'streaming-video');
  assert.deepEqual(overlaps[0].services.sort(), ['Disney+', 'Netflix']);
  assert.equal(overlaps[0].totals[0].amount.toFixed(2), '25.98');
});
test('totals never add across currencies and split likely from possible', () => {
  const totals = totalsByCurrency([
    { currency: 'USD', estimatedMonthly: 10, confidence: 'High' },
    { currency: 'NGN', estimatedMonthly: 8000, confidence: 'Medium' },
    { currency: 'USD', estimatedMonthly: 5, confidence: 'Low' }
  ], isLikely);
  assert.deepEqual(totals, [{ currency: 'NGN', amount: 8000 }, { currency: 'USD', amount: 10 }]);
});

/* ---- statement metadata ---- */test('Moniepoint reference tails do not split one recipient into several streams', () => {
  const a = 'TRANSFER TO GOODNESS MAYOWA AJAYI OPay *****96864/TRF|2MPTjkhz4|2038628090511822848';
  const b = 'TRANSFER TO GOODNESS MAYOWA AJAYI OPay *****96864/TRF|2MPTaeh11|1934582684215967744';
  assert.equal(normalizeMerchant(a), 'to goodness mayowa ajayi opay');
  assert.equal(normalizeMerchant(a), normalizeMerchant(b));
  assert.equal(cleanPayee(a), 'TRANSFER TO GOODNESS MAYOWA AJAYI OPay');
});
test('a Currency: preamble above the header sets the statement currency', () => {
  const matrix = [
    ['Account Statement'],
    ['Account Name:', 'A Customer', 'Currency:', 'NGN'],
    ['Date', 'Narration', 'Debit'],
    ['2026-01-10', 'Netflix', '2000'],
    ['2026-02-10', 'Netflix', '2000'],
    ['2026-03-10', 'Netflix', '2000']
  ];
  const result = analyzeMatrix(matrix);
  assert.equal(result.summary.detectedCurrency, 'NGN');
  assert.equal(result.subscriptions[0].currency, 'NGN');
  assert.equal(result.subscriptions[0].kind, 'subscription');
});
