import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeCsvBuffer, analyzeMatrix } from './analyze.js';
import { readXlsxMatrix, readPdfMatrix, fileKind } from './importers.js';
import { pdfPagesToMatrix } from './pdfLayout.js';

const fixture = (name) => fs.readFileSync(new URL(`../../tests/fixtures/${name}`, import.meta.url));
const byName = (result, name) => result.subscriptions.find((s) => s.payee.toUpperCase().includes(name));

test('unrecognised (non-English) headers fail loudly instead of guessing', () => {
  const csv = 'Buchungstag;Verwendungszweck;Betrag\n10.01.2026;Netflix;-15,99\n';
  assert.throws(() => analyzeCsvBuffer(Buffer.from(csv)), /date column/);
});

test('CSV with a preamble and semicolon delimiter works with English headers', () => {
  const csv = 'Account;12345\nExported;2026-10-01\n\nDate;Description;Amount;Currency\n' +
    ['01', '02', '03'].map((m) => `10.${m}.2026;Netflix;-15,99;EUR`).join('\n');
  const result = analyzeCsvBuffer(Buffer.from(csv));
  assert.equal(result.subscriptions[0].estimatedMonthly.toFixed(2), '15.99');
  assert.equal(result.summary.detectedCurrency, 'EUR');
});

test('Windows-1252 CSV bytes decode instead of garbling', () => {
  const header = Buffer.from('Date,Description,Amount\n');
  const body = Buffer.concat([Buffer.from('2026-01-10,Caf'), Buffer.from([0xe9]), Buffer.from(' Nero,-5.00\n')]);
  const result = analyzeCsvBuffer(Buffer.concat([header, body]));
  assert.equal(result.preview[0].payee, 'Café Nero');
});

test('xlsx: picks the transaction sheet, reads real dates, finds charges and price step', async () => {
  const matrix = await readXlsxMatrix(new Blob([fixture('statement.xlsx')]));
  const result = analyzeMatrix(matrix, {}, 'xlsx');
  assert.equal(result.transactionCount, 12);
  const spotify = byName(result, 'SPOTIFY');
  const netflix = byName(result, 'NETFLIX');
  assert.equal(spotify.confidence, 'High');
  assert.equal(spotify.catalog.name, 'Spotify');
  assert.equal(netflix.priceChange.kind, 'step');
  assert.equal(netflix.priceChange.to, 18.99);
  assert.ok(!byName(result, 'SALARY'));
});

test('pdf: text statement across two pages becomes the same result as the xlsx', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = fixture('statement.pdf');
  const { matrix, rowCount, layout } = await readPdfMatrix(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), pdfjs);
  assert.equal(rowCount, 12);
  assert.equal(layout, 'debit-credit');
  const result = analyzeMatrix(matrix, {}, 'pdf');
  assert.equal(byName(result, 'SPOTIFY').confidence, 'High');
  assert.equal(byName(result, 'NETFLIX').priceChange.to, 18.99);
  assert.ok(!byName(result, 'SALARY'), 'credits must not become subscriptions');
  assert.equal(byName(result, 'NETFLIX').normalized, 'netflix', 'wrapped reference text must not alter the merchant');
});

test('pdf layout: columns assigned by x position; wrapped lines kept out of the name', () => {
  const t = (str, x, y, w = str.length * 5) => ({ str, x, y, w, h: 9 });
  const page = [
    t('Date', 40, 700), t('Description', 110, 700), t('Debit', 340, 700, 25), t('Credit', 420, 700, 30), t('Balance', 490, 700, 35),
    t('05/01/2026', 40, 680), t('SPOTIFY', 110, 680), t('10.99', 345, 680, 25), t('4,989.01', 490, 680, 40),
    t('Ref 998811', 110, 666),
    t('25/01/2026', 40, 650), t('SALARY ACME', 110, 650), t('2,500.00', 420, 650, 40), t('7,489.01', 490, 650, 40)
  ];
  const { matrix } = pdfPagesToMatrix([page]);
  assert.deepEqual(matrix[1].slice(0, 4), ['05/01/2026', 'SPOTIFY', '10.99', '']);
  assert.equal(matrix[1][4], 'Ref 998811');
  assert.deepEqual(matrix[2].slice(0, 4), ['25/01/2026', 'SALARY ACME', '', '2,500.00']);
});

test('pdf with no selectable text is rejected with a clear message', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const blank = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  await assert.rejects(() => readPdfMatrix(blank.buffer.slice(blank.byteOffset, blank.byteOffset + blank.byteLength), pdfjs), /no selectable text|could not be opened/);
});

test('file kinds', () => {
  assert.equal(fileKind({ name: 'a.CSV' }), 'csv');
  assert.equal(fileKind({ name: 'a.xlsx' }), 'xlsx');
  assert.equal(fileKind({ name: 'a.pdf' }), 'pdf');
  assert.equal(fileKind({ name: 'a.xls' }), 'xls');
  assert.equal(fileKind({ name: 'a.txt' }), 'unknown');
});
