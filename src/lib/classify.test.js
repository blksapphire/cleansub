import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRecurring } from './classify.js';
import { parseTransactionsDetailed, detectRecurring } from './parser.js';
import { enrichResults, buildInsights, totalsByCurrency, isSubscription } from './insights.js';

const classify = (payee) => classifyRecurring({ payee, normalized: payee });

/* ---- narrations from a real Moniepoint export ---- */
test('person-to-person transfers are not subscriptions', () => {
  assert.equal(classify('TRANSFER TO Veronica Ajayi MOMO PSB *****123/TRF'), 'transfer');
  assert.equal(classify('TRANSFER TO POS Transfer-OWOLABI FOLASHADE VERONICA Moniepoint MFB *****123/TRF'), 'transfer');
  assert.equal(classify('SAMUEL AJAYI TO TAIWO KENNETH OWOEYE MONIEPOINT *****456/TRF'), 'transfer');
  assert.equal(classify('Transfer from VERONICA OMOLAYO AJAYI'), 'transfer');
  assert.equal(classify('MOB/UTO/SAMUEL FERANMI/ /30976823222|SAMUEL FERANMI AJAYI'), 'transfer');
});
test('bank fees and levies are their own kind', () => {
  assert.equal(classify('Value Added Tax'), 'fee');
  assert.equal(classify('Electronic Money Transfer Levy'), 'fee');
  assert.equal(classify('SMS Charge'), 'fee');
  assert.equal(classify('SMS ALERT CHARGE FOR 01Jan2026-31Jan2026'), 'fee');
});
test('airtime, savings and rewards are other recurring charges', () => {
  assert.equal(classify('AIRTIME TO # MTN/ATP|abc|123'), 'other');
  assert.equal(classify('saving, Top-up, Flexible Savings'), 'other');
  assert.equal(classify('saving, Withdrawal on completion, Flexible Savings'), 'other');
  assert.equal(classify('Moniepoint Rewards Cashout'), 'other');
  assert.equal(classify('# TRF TO MMF USSD SAMUEL FERANMI AJAYI'), 'other');
});
test('merchant charges stay subscriptions, even alongside banking words', () => {
  assert.equal(classify('NETFLIX.COM'), 'subscription');
  assert.equal(classify('Spotify'), 'subscription');
  assert.equal(classify('apple music'), 'subscription');
  assert.equal(classify('BILL PAYMENT FOR AJAYI SAMUEL FERANMIMAHRU GOTV'), 'subscription');
});

/* ---- integration with detection ---- */
const row = (Date, Description, Amount) => ({ Date, Description, Amount });

test('mixing a recurring transfer, Spotify and VAT keeps only Spotify as a subscription', () => {
  const rows = [];
  for (const month of ['01', '02', '03']) {
    rows.push(
      row(`2026-${month}-05`, 'TRANSFER TO JOHN DOE OPAY *****123/TRF', '-5000'),
      row(`2026-${month}-12`, 'Spotify', '-1500'),
      row(`2026-${month}-28`, 'Value Added Tax', '-75')
    );
  }
  const parsed = parseTransactionsDetailed(rows, { defaultCurrency: 'NGN' });
  const results = enrichResults(detectRecurring(parsed.transactions));
  const byPayee = Object.fromEntries(results.map((result) => [result.payee.toLowerCase(), result]));

  assert.equal(results.length, 3);
  assert.equal(byPayee['transfer to john doe opay'].kind, 'transfer');
  assert.equal(byPayee['spotify'].kind, 'subscription');
  assert.equal(byPayee['value added tax'].kind, 'fee');

  const subscriptions = results.filter(isSubscription);
  assert.equal(subscriptions.length, 1);
  assert.deepEqual(totalsByCurrency(subscriptions), [{ currency: 'NGN', amount: 1500 }]);
  const insights = buildInsights(results, parsed.transactions);
  assert.equal(insights.priceChanges.length, 0);
  assert.equal(insights.trials.length, 0);
});
