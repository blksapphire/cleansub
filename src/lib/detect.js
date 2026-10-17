import { normalizeMerchant } from './merchant.js';
import { INFERRED_SOURCES } from './direction.js';

const DAY_MS = 86400000;
const AVG_MONTH = 30.4375;

const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly', target: 7, months: 0 },
  { key: 'fortnightly', label: 'Every 2 weeks', target: 14, months: 0 },
  { key: 'monthly', label: 'Monthly', target: AVG_MONTH, months: 1 },
  { key: 'every-two-months', label: 'Every 2 months', target: 60.875, months: 2 },
  { key: 'quarterly', label: 'Quarterly', target: 91.3125, months: 3 },
  { key: 'twice-yearly', label: 'Every 6 months', target: 182.625, months: 6 },
  { key: 'yearly', label: 'Yearly', target: 365.25, months: 12 }
];

export const FREQUENCY_BY_KEY = Object.fromEntries(FREQUENCIES.map((f) => [f.key, f]));

const CONFIDENCE_RANK = { High: 0, Medium: 1, Low: 2, Possible: 3 };

/* ------------------------------ helpers ------------------------------ */

function isoToUtc(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(earlierIso, laterIso) {
  return Math.round((isoToUtc(laterIso) - isoToUtc(earlierIso)) / DAY_MS);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stableAmounts(amounts) {
  if (amounts.length < 2) return false;
  const typical = median(amounts);
  if (typical <= 0) return false;
  return amounts.every((amount) => Math.abs(amount - typical) <= Math.max(0.1, typical * 0.05));
}

/** Gradual change (price creep, or a foreign-currency charge following exchange rates). */
function driftingAmounts(amounts) {
  if (amounts.length < 3) return false;
  let ups = 0;
  let downs = 0;
  for (let index = 1; index < amounts.length; index += 1) {
    const previous = amounts[index - 1];
    if (previous <= 0) return false;
    const change = (amounts[index] - previous) / previous;
    if (Math.abs(change) > 0.12) return false;
    if (change > 0.02) ups += 1;
    if (change < -0.02) downs += 1;
  }
  // Drift moves one way. Amounts that bounce up and down are just variable.
  return (ups > 0) !== (downs > 0);
}

/**
 * How well do the observed gaps fit a cycle length? A gap of ~2 cycles means one
 * charge was missed (card declined, paused month), not that the pattern is broken.
 */
function cycleFit(intervals, target) {
  let totalDeviation = 0;
  let singleCycle = 0;
  let skipped = 0;
  for (const days of intervals) {
    const cycles = Math.max(1, Math.round(days / target));
    if (cycles > 3) return null;
    if (cycles === 1) singleCycle += 1;
    skipped += cycles - 1;
    totalDeviation += Math.abs(days / cycles - target) / target;
  }
  if (singleCycle / intervals.length < 0.5) return null;
  return { deviation: totalDeviation / intervals.length, skipped };
}

function pickFrequency(intervals) {
  let best = null;
  for (const frequency of FREQUENCIES) {
    const fit = cycleFit(intervals, frequency.target);
    if (!fit || fit.deviation > 0.22) continue;
    if (!best || fit.deviation < best.fit.deviation) best = { frequency, fit };
  }
  return best;
}

/* --------------------------- price movement --------------------------- */

/**
 * Compare what was charged first with what was charged last. A single jump is a "step"
 * (a price rise); several same-direction moves are "drift" (price creep or FX).
 */
export function analyzePriceChange(occurrences) {
  if (occurrences.length < 2) return null;
  const amounts = occurrences.map((o) => o.amount);
  const first = amounts[0];
  const last = amounts[amounts.length - 1];
  if (first <= 0) return null;
  const overall = (last - first) / first;
  if (Math.abs(overall) < 0.03 || Math.abs(last - first) < 0.5) return null;

  const moves = [];
  for (let index = 1; index < amounts.length; index += 1) {
    const change = (amounts[index] - amounts[index - 1]) / amounts[index - 1];
    if (Math.abs(change) >= 0.03) moves.push({ index, change });
  }
  if (!moves.length) return null;
  const sign = Math.sign(moves[0].change);
  if (moves.some((move) => Math.sign(move.change) !== sign)) return null; // erratic, e.g. usage billing

  if (moves.length === 1) {
    const { index } = moves[0];
    return {
      kind: 'step',
      direction: sign > 0 ? 'increase' : 'decrease',
      from: amounts[index - 1],
      to: last,
      pct: (last - amounts[index - 1]) / amounts[index - 1],
      changeDate: occurrences[index].date
    };
  }
  return {
    kind: 'drift',
    direction: sign > 0 ? 'increase' : 'decrease',
    from: first,
    to: last,
    pct: overall,
    changeDate: occurrences[0].date
  };
}

/* ----------------------------- trial logic ----------------------------- */

/**
 * A small first charge (card check / trial fee) followed 3-40 days later by a much
 * larger one is the signature of a free trial turning into a paid plan.
 */
export function findTrialStart(occurrences) {
  if (occurrences.length < 2) return null;
  const [trial, paid] = occurrences;
  const gap = daysBetween(trial.date, paid.date);
  if (gap < 3 || gap > 40) return null;
  if (trial.amount > paid.amount * 0.2) return null;
  return {
    trialDate: trial.date,
    trialAmount: trial.amount,
    firstPaidDate: paid.date,
    paidAmount: paid.amount,
    daysBetween: gap
  };
}

/* --------------------------- stream building --------------------------- */

function buildOccurrences(transactions) {
  const sorted = transactions.slice().sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map();
  for (const transaction of sorted) {
    const amount = Math.abs(Number(transaction.amount));
    const direction = transaction.direction === 'outflow' ? 'outflow' : 'unknown';
    const inferred = INFERRED_SOURCES.has(transaction.directionSource);
    const existing = byDate.get(transaction.date);
    if (!existing) {
      byDate.set(transaction.date, {
        date: transaction.date,
        amount,
        payee: transaction.payee,
        directions: [direction],
        inferred,
        ambiguousDate: Boolean(transaction.dateAmbiguous)
      });
    } else {
      // A row flagged as a possible export duplicate must not double the day's charge.
      if (!transaction.possibleDuplicate) existing.amount += amount;
      existing.directions.push(direction);
      existing.inferred = existing.inferred || inferred;
      existing.ambiguousDate = existing.ambiguousDate || Boolean(transaction.dateAmbiguous);
    }
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Chain-cluster amounts so two plans billed by one merchant become separate streams. */
function clusterByAmount(transactions) {
  const ordered = transactions.slice().sort((a, b) => a.amount - b.amount);
  const clusters = [];
  let current = [];
  for (const transaction of ordered) {
    const previous = current[current.length - 1];
    if (previous && transaction.amount > previous.amount * 1.15 && transaction.amount - previous.amount > 0.5) {
      clusters.push(current);
      current = [];
    }
    current.push(transaction);
  }
  if (current.length) clusters.push(current);
  return clusters;
}

function evaluateStream(occurrences, context) {
  if (occurrences.length < 2) return null;

  const intervals = [];
  for (let index = 1; index < occurrences.length; index += 1) {
    const days = daysBetween(occurrences[index - 1].date, occurrences[index].date);
    if (days > 0) intervals.push(days);
  }
  if (!intervals.length) return null;

  const amounts = occurrences.map((o) => o.amount);
  const allOutflow = occurrences.every((o) => o.directions.every((d) => d === 'outflow'));
  const anyInferred = occurrences.some((o) => o.inferred);
  const hasAmbiguousDates = occurrences.some((o) => o.ambiguousDate);
  const amountStable = stableAmounts(amounts);
  const amountDrifting = !amountStable && driftingAmounts(amounts);
  const typicalAmount = median(amounts);
  const latest = occurrences[occurrences.length - 1];

  let frequency;
  let deviation;
  let skipped = 0;
  let confidence;

  if (occurrences.length >= 3) {
    const picked = pickFrequency(intervals);
    if (!picked) return null;
    ({ frequency } = picked);
    deviation = picked.fit.deviation;
    skipped = picked.fit.skipped;

    const high = allOutflow && !anyInferred && amountStable && deviation <= 0.12 && !hasAmbiguousDates && skipped === 0;
    const medium = allOutflow && (amountStable || amountDrifting || occurrences.length >= 4)
      && deviation <= 0.18 && !hasAmbiguousDates;
    confidence = high ? 'High' : medium ? 'Medium' : 'Low';
  } else {
    // Two charges: only a "possible" match, and only for cycles long enough that
    // two identical charges are unlikely to be coincidence.
    const days = intervals[0];
    const candidate = FREQUENCIES
      .filter((f) => f.months >= 1)
      .map((f) => ({ f, dev: Math.abs(days - f.target) / f.target }))
      .sort((a, b) => a.dev - b.dev)[0];
    if (!candidate || candidate.dev > 0.12) return null;
    frequency = candidate.f;
    deviation = candidate.dev;
    const tolerance = frequency.key === 'monthly' ? 0.01 : 0.03;
    if (Math.abs(amounts[0] - amounts[1]) > Math.max(0.01, amounts[0] * tolerance)) return null;
    if (!allOutflow) return null;
    confidence = 'Possible';
  }

  const basis = amountStable || amountDrifting || occurrences.length < 3 ? latest.amount : typicalAmount;
  const estimatedMonthly = basis * (AVG_MONTH / frequency.target);
  const typicalInterval = median(intervals);

  const reasons = [
    confidence === 'Possible'
      ? 'Only 2 charges seen - possible pattern, not yet confirmed'
      : 'Appeared on ' + occurrences.length + ' separate dates',
    frequency.label + ' pattern (median interval ' + typicalInterval + ' days)',
    amountStable ? 'Amounts are relatively consistent'
      : amountDrifting ? 'Amounts change gradually (price creep or exchange-rate movement)'
        : 'Amounts vary between occurrences',
    allOutflow
      ? (anyInferred ? 'Outgoing direction inferred from the file (not stated outright)' : 'Outgoing payment direction identified')
      : 'Transaction direction is unclear from the source file'
  ];
  if (skipped > 0) reasons.push(skipped + ' missed cycle' + (skipped === 1 ? '' : 's') + ' tolerated (gap of roughly 2+ billing periods)');
  if (hasAmbiguousDates) reasons.push('Some dates used an assumed day/month order');

  return {
    payee: occurrences[0].payee,
    count: occurrences.length,
    intervals,
    medianIntervalDays: typicalInterval,
    frequency: frequency.label,
    frequencyKey: frequency.key,
    estimatedMonthly,
    confidence,
    reasons,
    amountStable,
    amountDrifting,
    directionConfirmed: allOutflow,
    directionInferred: anyInferred,
    intervalDeviation: deviation,
    skippedCycles: skipped,
    firstDate: occurrences[0].date,
    lastDate: latest.date,
    lastAmount: latest.amount,
    anchorDay: Number(latest.date.slice(8, 10)),
    history: occurrences.map((o) => ({ date: o.date, amount: o.amount })),
    priceChange: confidence === 'Possible' ? null : analyzePriceChange(occurrences),
    currency: context.currency
  };
}

function usableTransactions(transactions) {
  return transactions.filter((t) => t && t.payee && t.date
    && Number.isFinite(Number(t.amount)) && Number(t.amount) > 0
    && t.direction !== 'inflow');
}

function groupByMerchant(transactions) {
  const groups = new Map();
  for (const transaction of usableTransactions(transactions)) {
    const merchant = normalizeMerchant(transaction.normalized || transaction.payee);
    if (!merchant) continue;
    const currency = transaction.currency || '';
    const key = merchant + '|' + currency;
    if (!groups.has(key)) groups.set(key, { merchant, currency, transactions: [] });
    groups.get(key).transactions.push(transaction.normalized === merchant ? transaction : { ...transaction, normalized: merchant });
  }
  return groups;
}

function latestDateOf(transactions) {
  let latest = '';
  for (const t of transactions) if (t && t.date && t.date > latest) latest = t.date;
  return latest;
}

/**
 * Detects plausible recurring outflows. Incoming credits/refunds are ignored.
 * Unknown-direction rows may be shown as low-confidence candidates, but cannot
 * receive a high-confidence label without explicit outflow evidence.
 */
export function detectRecurring(transactions) {
  if (!Array.isArray(transactions) || !transactions.length) return [];

  const results = [];
  for (const { merchant, currency, transactions: group } of groupByMerchant(transactions).values()) {
    const context = { currency };
    let occurrences = buildOccurrences(group);

    // A trial/card-check charge is not part of the billing rhythm; set it aside.
    const trial = findTrialStart(occurrences);
    let trialRest = trial && occurrences.length >= 3 ? occurrences.slice(1) : null;
    // Only a real trial if everything after it is clearly bigger and steady; an aggregator
    // (Apple, Google Play) with a cheap plan and a dear plan must not be mistaken for one.
    if (trialRest) {
      const restAmounts = trialRest.map((o) => o.amount);
      const clearlyBigger = restAmounts.every((a) => a > trial.trialAmount * 3);
      if (!clearlyBigger || !(stableAmounts(restAmounts) || driftingAmounts(restAmounts))) trialRest = null;
    }

    let found = [];
    const whole = evaluateStream(trialRest || occurrences, context);
    const wholeIsSteady = Boolean(whole) && whole.confidence !== 'Possible'
      && (whole.amountStable || whole.amountDrifting || Boolean(trialRest) || clusterByAmount(group).length === 1);
    if (wholeIsSteady) {
      found = [{ ...whole, trial: trialRest ? trial : null }];
    } else {
      // One merchant, several plans (Apple, Google Play, PayPal): analyse each amount stream.
      const clusters = clusterByAmount(group);
      let streams = [];
      if (clusters.length > 1) {
        streams = clusters
          .map((cluster) => ({ cluster, result: evaluateStream(buildOccurrences(cluster), context) }))
          .filter((entry) => entry.result);
      }
      const strong = streams.filter((entry) => entry.result.confidence !== 'Possible');
      if (strong.length) {
        found = strong.map(({ cluster, result }) => ({
          ...result,
          trial: null,
          streamAmount: median(cluster.map((t) => t.amount))
        }));
      } else if (whole) {
        found = [{ ...whole, trial: trialRest ? trial : null }];
      } else if (streams.length) {
        found = streams.map(({ cluster, result }) => ({
          ...result,
          trial: null,
          streamAmount: median(cluster.map((t) => t.amount))
        }));
      }
    }

    for (const result of found) {
      results.push({
        ...result,
        normalized: merchant,
        streamKey: merchant + '|' + currency + (result.streamAmount !== undefined ? '#' + result.streamAmount.toFixed(2) : '')
      });
    }
    occurrences = null;
  }

  results.sort((a, b) =>
    CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] || b.estimatedMonthly - a.estimatedMonthly);
  return results;
}

/**
 * Merchants whose first charge was small and whose second was much larger, seen too
 * recently to have a second paid cycle yet. These are possible trial conversions the
 * user may still want to cancel.
 */
export function detectTrialConversions(transactions, recurring = []) {
  if (!Array.isArray(transactions) || !transactions.length) return [];
  const latestDate = latestDateOf(transactions);
  const alerts = [];

  for (const result of recurring) {
    if (result.trial) {
      alerts.push({
        kind: 'recurring',
        payee: result.payee,
        normalized: result.normalized,
        currency: result.currency,
        ...result.trial,
        estimatedMonthly: result.estimatedMonthly
      });
    }
  }

  for (const { merchant, currency, transactions: group } of groupByMerchant(transactions).values()) {
    const occurrences = buildOccurrences(group);
    if (occurrences.length !== 2) continue;
    const trial = findTrialStart(occurrences);
    if (!trial) continue;
    if (daysBetween(trial.firstPaidDate, latestDate) > 45) continue; // old news, no longer actionable
    alerts.push({
      kind: 'possible',
      payee: occurrences[0].payee,
      normalized: merchant,
      currency,
      ...trial
    });
  }
  return alerts;
}
