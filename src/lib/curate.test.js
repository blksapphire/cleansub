import test from 'node:test';
import assert from 'node:assert/strict';
import {
  itemKey,
  decisionFor,
  toggleDecision,
  visibleItems,
  dismissedItems,
  keptItems,
  filterInsights
} from './curate.js';

const item = (name, amount, extra = {}) => ({
  streamKey: `${name}|NGN#${amount}.00`,
  normalized: name,
  payee: name.toUpperCase(),
  currency: 'NGN',
  estimatedMonthly: amount,
  catalog: { name: name[0].toUpperCase() + name.slice(1), category: 'streaming' },
  ...extra
});

const netflix = item('netflix', 1500);
const spotify = item('spotify', 1000);
const youtube = item('youtube', 500);

test('itemKey prefers the stream key and falls back to merchant fields', () => {
  assert.equal(itemKey(netflix), 'netflix|NGN#1500.00');
  assert.equal(itemKey({ normalized: 'spotify' }), 'spotify');
  assert.equal(itemKey({ payee: 'NETFLIX.COM' }), 'NETFLIX.COM');
  assert.equal(itemKey(null), '');
});

test('toggling a decision sets it, clears it on repeat, and never mutates the original', () => {
  const empty = {};
  const kept = toggleDecision(empty, netflix, 'kept');
  assert.deepEqual(empty, {});
  assert.equal(decisionFor(netflix, kept), 'kept');

  const dismissed = toggleDecision(kept, netflix, 'dismissed');
  assert.equal(decisionFor(netflix, dismissed), 'dismissed');

  const cleared = toggleDecision(dismissed, netflix, 'dismissed');
  assert.equal(decisionFor(netflix, cleared), '');
  assert.deepEqual(cleared, {});
});

test('visible items drop set-aside charges but keep kept ones', () => {
  const decisions = { [netflix.streamKey]: 'dismissed', [spotify.streamKey]: 'kept' };
  assert.deepEqual(visibleItems([netflix, spotify, youtube], decisions), [spotify, youtube]);
  assert.deepEqual(dismissedItems([netflix, spotify, youtube], decisions), [netflix]);
  assert.deepEqual(keptItems([netflix, spotify, youtube], decisions), [spotify]);
});

test('insights forget a set-aside charge, including its trial and price change', () => {
  const insights = {
    priceChanges: [netflix, spotify],
    trials: [
      { normalized: 'netflix', payee: 'NETFLIX.COM' },
      { normalized: 'spotify', payee: 'Spotify' }
    ],
    overlaps: [
      { category: 'streaming', label: 'Streaming', services: ['Netflix', 'Spotify'], items: [netflix, spotify] }
    ]
  };
  const filtered = filterInsights(insights, [netflix, spotify], { [netflix.streamKey]: 'dismissed' });
  assert.deepEqual(filtered.priceChanges, [spotify]);
  assert.deepEqual(filtered.trials, [{ normalized: 'spotify', payee: 'Spotify' }]);
  assert.deepEqual(filtered.overlaps, []);
});

test('an overlap survives only while two different services remain', () => {
  const insights = {
    priceChanges: [],
    trials: [],
    overlaps: [
      { category: 'streaming', label: 'Streaming', services: ['Netflix', 'Spotify', 'Youtube'], items: [netflix, spotify, youtube] }
    ]
  };
  const filtered = filterInsights(insights, [netflix, spotify, youtube], { [netflix.streamKey]: 'dismissed' });
  assert.equal(filtered.overlaps.length, 1);
  assert.deepEqual(filtered.overlaps[0].items, [spotify, youtube]);
  assert.deepEqual(filtered.overlaps[0].services, ['Spotify', 'Youtube']);
  assert.deepEqual(filtered.overlaps[0].totals, [{ currency: 'NGN', amount: 1500 }]);
});

test('insights are untouched when nothing is set aside', () => {
  const insights = { priceChanges: [netflix], trials: [], overlaps: [] };
  assert.equal(filterInsights(insights, [netflix], {}), insights);
  assert.equal(filterInsights(null, [netflix], {}), null);
});
