import { FREQUENCY_BY_KEY } from './detect.js';

const DAY_MS = 86400000;

function parseIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function toIso(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function todayIso(now = new Date()) {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(iso, days) {
  const { y, m, d } = parseIso(iso);
  const date = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return toIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Add whole months, keeping the billing day where the month allows it (31st -> 30th/28th). */
export function addMonths(iso, months, anchorDay) {
  const { y, m, d } = parseIso(iso);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(anchorDay || d, daysInMonth(year, month));
  return toIso(year, month, day);
}

function stepForward(iso, frequencyKey, anchorDay) {
  const frequency = FREQUENCY_BY_KEY[frequencyKey];
  if (!frequency) return null;
  return frequency.months > 0
    ? addMonths(iso, frequency.months, anchorDay)
    : addDays(iso, Math.round(frequency.target));
}

/**
 * Next expected charge on or after `fromIso`. A statement may be old, so cycles are
 * rolled forward from the last seen charge; `cyclesAhead` says how far.
 */
export function nextCharge(result, fromIso = todayIso()) {
  if (!result || !result.lastDate || !FREQUENCY_BY_KEY[result.frequencyKey]) return null;
  let date = stepForward(result.lastDate, result.frequencyKey, result.anchorDay);
  let cyclesAhead = 0;
  let guard = 0;
  while (date && date < fromIso && guard < 1000) {
    date = stepForward(date, result.frequencyKey, result.anchorDay);
    cyclesAhead += 1;
    guard += 1;
  }
  if (!date) return null;
  return { date, cyclesAhead, projectedFromOldData: cyclesAhead > 0 };
}

/** Charges expected within the next `horizonDays`, soonest first. */
export function upcomingCharges(results, fromIso = todayIso(), horizonDays = 45) {
  const limit = addDays(fromIso, horizonDays);
  const items = [];
  for (const result of results) {
    const next = nextCharge(result, fromIso);
    if (!next) continue;
    // Walk through every occurrence inside the horizon (weekly items hit several times).
    let date = next.date;
    let guard = 0;
    while (date && date <= limit && guard < 60) {
      items.push({
        result,
        date,
        amount: result.lastAmount ?? result.estimatedMonthly,
        projectedFromOldData: next.projectedFromOldData
      });
      date = stepForward(date, result.frequencyKey, result.anchorDay);
      guard += 1;
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

/* ------------------------------- .ics export ------------------------------- */

function escapeText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545: lines are folded at 75 octets; continuation lines start with a space.
function fold(line) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
      limit = 74; // the leading space counts as one octet
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function hash(text) {
  let h = 5381;
  for (let index = 0; index < text.length; index += 1) h = ((h << 5) + h + text.charCodeAt(index)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

function icsStamp(now) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function rruleFor(result) {
  const frequency = FREQUENCY_BY_KEY[result.frequencyKey];
  if (!frequency) return null;
  if (result.frequencyKey === 'weekly') return 'FREQ=WEEKLY';
  if (result.frequencyKey === 'fortnightly') return 'FREQ=WEEKLY;INTERVAL=2';
  if (result.frequencyKey === 'yearly') return 'FREQ=YEARLY';
  return `FREQ=MONTHLY;INTERVAL=${frequency.months}`;
}

/**
 * Build an iCalendar file with one recurring all-day event per detected subscription.
 * Everything is generated in the browser; nothing is uploaded.
 */
export function buildIcs(results, { fromIso = todayIso(), now = new Date(), formatAmount } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CleanSub//Recurring charges//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:CleanSub expected charges'
  ];
  const stamp = icsStamp(now);

  for (const result of results) {
    const next = nextCharge(result, fromIso);
    const rule = rruleFor(result);
    if (!next || !rule) continue;

    // Days past the 28th would be skipped by calendars in short months, so anchor to the 28th.
    let startIso = next.date;
    const usesMonths = FREQUENCY_BY_KEY[result.frequencyKey].months > 0;
    if (usesMonths && Number(startIso.slice(8, 10)) > 28) startIso = startIso.slice(0, 8) + '28';

    const amount = result.lastAmount ?? result.estimatedMonthly;
    const amountText = formatAmount ? formatAmount(amount, result.currency) : Number(amount).toFixed(2);
    const label = result.streamAmount !== undefined ? `${result.payee} (${amountText})` : result.payee;

    lines.push(
      'BEGIN:VEVENT',
      `UID:cleansub-${hash(result.streamKey || result.normalized || result.payee)}@cleansub.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${startIso.replace(/-/g, '')}`,
      `RRULE:${rule}`,
      `SUMMARY:${escapeText(`${label} - expected charge (~${amountText})`)}`,
      `DESCRIPTION:${escapeText(`Predicted from your statement (${result.frequency.toLowerCase()}, ${result.confidence} confidence). This is an estimate, not a confirmed bill. Check the merchant's own billing page before acting.`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(`${result.payee} may renew tomorrow`)}`,
      'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
