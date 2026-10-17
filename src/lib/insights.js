import { lookupMerchant, CATEGORY_LABELS, OVERLAP_CATEGORIES } from '../data/catalog.js';
import { detectTrialConversions } from './detect.js';

/** Attach catalog info (name, category, official account link) to each detected stream. */
export function enrichResults(results) {
  return results.map((result) => {
    const entry = lookupMerchant(result.normalized);
    return {
      ...result,
      catalog: entry
        ? { id: entry.id, name: entry.name, category: entry.category, cancelUrl: entry.cancelUrl }
        : null
    };
  });
}

/** Sum per currency. Different currencies are never added together. */
export function totalsByCurrency(results, predicate) {
  const totals = new Map();
  for (const result of results) {
    if (predicate && !predicate(result)) continue;
    const currency = result.currency || '';
    totals.set(currency, (totals.get(currency) || 0) + (Number(result.estimatedMonthly) || 0));
  }
  return Array.from(totals, ([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export const isLikely = (result) => result.confidence === 'High' || result.confidence === 'Medium';
export const isPossible = (result) => !isLikely(result);

/** Two or more different services in a category where overlap is common. */
export function findOverlaps(results) {
  const byCategory = new Map();
  for (const result of results) {
    if (result.confidence === 'Possible' || !result.catalog) continue;
    if (!OVERLAP_CATEGORIES.has(result.catalog.category)) continue;
    if (!byCategory.has(result.catalog.category)) byCategory.set(result.catalog.category, new Map());
    const services = byCategory.get(result.catalog.category);
    if (!services.has(result.catalog.id)) services.set(result.catalog.id, []);
    services.get(result.catalog.id).push(result);
  }
  const overlaps = [];
  for (const [category, services] of byCategory) {
    if (services.size < 2) continue;
    const items = Array.from(services.values()).flat();
    overlaps.push({
      category,
      label: CATEGORY_LABELS[category] || category,
      services: Array.from(services.values()).map((list) => list[0].catalog.name),
      items,
      totals: totalsByCurrency(items)
    });
  }
  return overlaps.sort((a, b) => b.items.length - a.items.length);
}

export function buildInsights(results, transactions) {
  const priceChanges = results
    .filter((result) => result.priceChange)
    .sort((a, b) => Math.abs(b.priceChange.pct) - Math.abs(a.priceChange.pct));
  return {
    priceChanges,
    trials: detectTrialConversions(transactions, results),
    overlaps: findOverlaps(results)
  };
}
