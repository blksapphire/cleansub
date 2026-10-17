// Turns positioned PDF text into transaction rows. Pure functions only (no pdf.js here)
// so the layout logic can be tested with synthetic input.

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const DATE_RE = new RegExp(
  '^(?:' +
  '\\d{1,2}[/.\\-]\\d{1,2}[/.\\-]\\d{2,4}' +
  '|\\d{4}[/.\\-]\\d{1,2}[/.\\-]\\d{1,2}' +
  '|\\d{1,2}[ \\-]' + MONTH + '[ \\-,]*\\d{2,4}' +
  '|' + MONTH + '\\.? \\d{1,2},? \\d{4}' +
  ')$', 'i');
const MONEY_RE = /^[(+-]?\s*(?:US\$|C\$|CA\$|[₦$£€])?\s*\d[\d,. ]*\d?\)?(?:\s?(?:CR|DR))?$/i;

const HEADER_WORDS = {
  debit: ['debit', 'debits', 'withdrawal', 'withdrawals', 'money out', 'paid out', 'dr'],
  credit: ['credit', 'credits', 'deposit', 'deposits', 'money in', 'paid in', 'cr'],
  amount: ['amount', 'amt'],
  balance: ['balance', 'running balance'],
  date: ['date', 'transaction date', 'posting date', 'value date', 'posted'],
  description: ['description', 'details', 'narration', 'particulars', 'transaction details', 'payee']
};

const SKIP_LINE = /\b(page \d|opening balance|closing balance|balance brought forward|balance carried forward|total|statement period|account number)\b/i;

function groupLines(items, tolerance = 3) {
  const sorted = items
    .filter((item) => item.str && item.str.trim() !== '')
    .slice()
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - item.y) <= tolerance) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines.map((line) => ({ y: line.y, items: line.items.sort((a, b) => a.x - b.x) }));
}

/** Merge text runs that sit close together into table cells. */
function toCells(items) {
  const cells = [];
  for (const item of items) {
    const height = item.h || 10;
    const last = cells[cells.length - 1];
    const gap = last ? item.x - last.x1 : Infinity;
    if (last && gap <= height * 0.8) {
      last.text += (gap > height * 0.15 ? ' ' : '') + item.str.trim();
      last.x1 = item.x + (item.w || 0);
    } else {
      cells.push({ text: item.str.trim(), x0: item.x, x1: item.x + (item.w || 0) });
    }
  }
  return cells;
}

function detectHeader(cells) {
  const found = {};
  for (const cell of cells) {
    const text = cell.text.toLowerCase().replace(/[.:]/g, '').trim();
    for (const [name, words] of Object.entries(HEADER_WORDS)) {
      if (words.includes(text) && !found[name]) found[name] = cell;
    }
  }
  const strong = ['debit', 'credit', 'amount', 'balance'].filter((name) => found[name]).length;
  return found.date && strong >= 1 ? found : null;
}

function nearestColumn(cell, header) {
  let best = null;
  for (const name of ['debit', 'credit', 'amount', 'balance']) {
    const column = header[name];
    if (!column) continue;
    const distance = Math.min(
      Math.abs((cell.x0 + cell.x1) / 2 - (column.x0 + column.x1) / 2),
      Math.abs(cell.x1 - column.x1),
      Math.abs(cell.x0 - column.x0)
    );
    if (!best || distance < best.distance) best = { name, distance };
  }
  return best ? best.name : null;
}

/**
 * pages: Array<Array<{ str, x, y, w, h }>>  (PDF coordinates, y grows upward)
 * returns { matrix, rowCount, layout } where matrix is [header, ...rows] ready for matrixToRows.
 */
export function pdfPagesToMatrix(pages) {
  let header = null;
  const records = [];
  let previous = null;

  for (const items of pages) {
    for (const line of groupLines(items)) {
      const cells = toCells(line.items);
      if (!cells.length) continue;

      const maybeHeader = detectHeader(cells);
      if (maybeHeader) { header = maybeHeader; previous = null; continue; }

      const first = cells[0];
      let dateIndex = DATE_RE.test(first.text) ? 0 : -1;
      if (dateIndex === -1 && cells.length > 1 && DATE_RE.test(first.text + ' ' + cells[1].text)) {
        // "05 Jan" and "2026" split into two cells
        cells.splice(0, 2, { text: first.text + ' ' + cells[1].text, x0: first.x0, x1: cells[1].x1 });
        dateIndex = 0;
      }

      if (dateIndex === -1) {
        // Wrapped description line belonging to the previous transaction.
        if (previous && !SKIP_LINE.test(line.items.map((i) => i.str).join(' '))
          && cells.every((cell) => !MONEY_RE.test(cell.text))
          && cells[0].x0 >= previous.descX - 3) {
          const extra = cells.map((cell) => cell.text).join(' ');
          // Wrapped text usually holds references and notes. Keeping it out of the merchant
          // name stops one wrapped row from splitting a subscription into two merchants,
          // unless the first line has no real name in it.
          if (extra.length <= 80) {
            if ((previous.description.match(/\p{L}{3,}/gu) || []).length === 0) previous.description += ' ' + extra;
            else previous.notes += (previous.notes ? ' ' : '') + extra;
          }
        } else {
          previous = null;
        }
        continue;
      }

      const rest = cells.slice(1).filter((cell, index) => !(index === 0 && DATE_RE.test(cell.text))); // drop value date
      const moneyCells = rest.filter((cell) => MONEY_RE.test(cell.text));
      const descriptionCells = rest.filter((cell) => !MONEY_RE.test(cell.text));
      if (!moneyCells.length || !descriptionCells.length) { previous = null; continue; }

      const record = {
        date: cells[0].text,
        description: descriptionCells.map((cell) => cell.text).join(' '),
        descX: descriptionCells[0].x0,
        notes: '',
        debit: '',
        credit: '',
        amount: ''
      };

      if (header) {
        for (const cell of moneyCells) {
          const column = nearestColumn(cell, header);
          if (column === 'debit') record.debit = cell.text;
          else if (column === 'credit') record.credit = cell.text;
          else if (column === 'amount') record.amount = cell.text;
        }
      } else {
        // No recognisable header: with several figures, the last one is the running balance.
        record.amount = moneyCells.length >= 2 ? moneyCells[moneyCells.length - 2].text : moneyCells[0].text;
      }
      if (!record.debit && !record.credit && !record.amount) { previous = null; continue; }
      records.push(record);
      previous = record;
    }
  }

  const useSplit = header && (header.debit || header.credit) && records.some((r) => r.debit || r.credit);
  // "Notes" is deliberately not a recognised column name, so it never feeds merchant matching.
  const head = useSplit ? ['Date', 'Description', 'Debit', 'Credit', 'Notes'] : ['Date', 'Description', 'Amount', 'Notes'];
  const matrix = [head, ...records.map((r) => useSplit
    ? [r.date, r.description.trim(), r.debit, r.credit, r.notes]
    : [r.date, r.description.trim(), r.amount || r.debit || r.credit, r.notes])];
  return { matrix, rowCount: records.length, layout: useSplit ? 'debit-credit' : 'amount' };
}
