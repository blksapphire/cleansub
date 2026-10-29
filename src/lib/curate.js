import { totalsByCurrency } from './insights.js';

/** Stable identity for a detected charge, shared by decisions and insights. */
export function itemKey(item) {
  if (!item) return '';
  return item.streamKey || item.normalized || item.payee || '';
}

export function decisionFor(item, decisions) {
  return (decisions && decisions[itemKey(item)]) || '';
}

/** Clicking the same decision again clears it, so every action is reversible. */
export function toggleDecision(decisions, item, next) {
  const key = itemKey(item);
  if (!key) return decisions || {};
  const current = (decisions && decisions[key]) || '';
  const updated = { ...(decisions || {}) };
  if (current === next) delete updated[key];
  else updated[key] = next;
  return updated;
}

export function visibleItems(items, decisions) {
  return (items || []).filter((item) => decisionFor(item, decisions) !== 'dismissed');
}

export function dismissedItems(items, decisions) {
  return (items || []).filter((item) => decisionFor(item, decisions) === 'dismissed');
}

export function keptItems(items, decisions) {
  return (items || []).filter((item) => decisionFor(item, decisions) === 'kept');
}

/**
 * Drop set-aside charges from the insight lists too, so a dismissed match cannot
 * keep showing up as a price change, trial or overlap.
 */
export function filterInsights(insights, items, decisions) {
  if (!insights) return insights;
  const dismissed = dismissedItems(items, decisions);
  if (!dismissed.length) return insights;
  const keys = new Set(dismissed.map(itemKey).filter(Boolean));
  const merchants = new Set(dismissed.map((item) => item.normalized).filter(Boolean));
  const isVisible = (entry) =>
    !keys.has(itemKey(entry)) && !(entry && entry.normalized && merchants.has(entry.normalized));

  const priceChanges = (insights.priceChanges || []).filter(isVisible);
  const trials = (insights.trials || []).filter(isVisible);
  const overlaps = (insights.overlaps || [])
    .map((group) => {
      const groupItems = (group.items || []).filter(isVisible);
      if (groupItems.length < 2) return null;
      const services = Array.from(new Set(groupItems.map((item) => item.catalog?.name).filter(Boolean)));
      return { ...group, items: groupItems, services, totals: totalsByCurrency(groupItems) };
    })
    .filter(Boolean);

  return { ...insights, priceChanges, trials, overlaps };
}
