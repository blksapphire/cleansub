import React, { useState } from 'react';
import { runAnalysis } from '../lib/runAnalysis';
import { fileKind, readXlsxMatrix, readPdfMatrix, MAX_FILE_SIZE } from '../lib/importers';
import Icon from '../Icon';

const sampleCsv = 'data:text/csv;charset=utf-8,Date%2CDescription%2CAmount%0A2026-01-10%2CNetflix%2C-15.99%0A2026-02-10%2CNetflix%2C-15.99%0A2026-03-10%2CNetflix%2C-18.99%0A2026-04-10%2CNetflix%2C-18.99%0A2026-01-05%2CSpotify%2C-10.99%0A2026-02-05%2CSpotify%2C-10.99%0A2026-03-05%2CSpotify%2C-10.99%0A2026-04-05%2CSpotify%2C-10.99%0A2026-02-18%2CGrocery%20Store%2C-54.20%0A2026-03-02%2CDisney%20Plus%2C-1.00%0A2026-03-16%2CDisney%20Plus%2C-9.99%0A2026-04-16%2CDisney%20Plus%2C-9.99';

const KIND_LABEL = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };

export default function Upload({ onResult }) {
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [current, setCurrent] = useState(null); // { payload, fileName, kind }
  const [result, setResult] = useState(null);

  async function analyse(payload, fileName, kind, options = {}) {
    const response = await runAnalysis({ ...payload, options, source: kind });
    setCurrent({ payload, fileName, kind });
    setResult(response);
    onResult({ ...response, fileName });
    return response;
  }

  async function processFile(file) {
    if (!file) return;
    setError('');
    setResult(null);
    setCurrent(null);

    const kind = fileKind(file);
    if (kind === 'xls') {
      setError('Old .xls workbooks are not supported. In Excel, choose Save As > .xlsx (or CSV) and try again.');
      return;
    }
    if (kind === 'unknown') {
      setError('Please choose a CSV, Excel (.xlsx) or text-based PDF statement.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('That file is larger than 10 MB. Export a smaller date range and try again.');
      return;
    }
    if (file.size === 0) {
      setError('This file is empty. Choose a statement with transaction rows.');
      return;
    }

    setIsLoading(true);
    setLoadingLabel(kind === 'pdf' ? 'Reading PDF text on this device…' : 'Reading your statement…');
    try {
      if (kind === 'csv') {
        const buffer = await file.arrayBuffer();
        await analyse({ kind: 'csv', buffer }, file.name, kind);
      } else {
        const matrix = kind === 'xlsx'
          ? await readXlsxMatrix(file)
          : (await readPdfMatrix(await file.arrayBuffer())).matrix;
        await analyse({ kind: 'matrix', matrix }, file.name, kind);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not read this file. Check its format and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function chooseSign(signConvention) {
    if (!current) return;
    setIsLoading(true);
    setLoadingLabel('Re-checking with your choice…');
    try {
      await analyse(current.payload, current.fileName, current.kind, { signConvention });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not re-analyse the file.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleInputChange(event) {
    const file = event.target.files && event.target.files[0];
    processFile(file);
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    processFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  }

  const summary = result?.summary;
  const preview = result?.preview || [];
  const notes = [];
  if (summary) {
    if (summary.duplicateRows > 0) notes.push(`${summary.duplicateRows} row(s) looked identical to another row. They were kept, but counted once when looking for recurring charges.`);
    if (summary.invalidDateRows > 0) notes.push(`${summary.invalidDateRows} row(s) had dates that could not be parsed and will not count toward recurrence detection.`);
    if (summary.ambiguousDateRows > 0) notes.push(`${summary.ambiguousDateRows} date(s) were ambiguous; CleanSub assumed day-first. Check dates before relying on a match.`);
    if (summary.unknownDirectionRows > 0 && !summary.needsSignChoice) notes.push(`${summary.unknownDirectionRows} amount(s) had no clear debit/credit direction, so related matches cannot be high confidence.`);
    if (summary.invalidAmountRows > 0) notes.push(`${summary.invalidAmountRows} row(s) with invalid amounts were skipped.`);
    if (summary.mixedCurrencies) notes.push(`This file mixes currencies (${summary.currencies.join(', ')}). Totals are shown per currency and never added together.`);
    if (summary.signConventionSource === 'inferred' && summary.signConvention === 'positive-spending') notes.push('Positive amounts look like card charges in this file, so they were treated as spending. Medium confidence at most.');
  }
  for (const warning of result?.warnings || []) notes.push(warning);
  if (current?.kind === 'pdf') notes.push('PDF import is best-effort: layouts differ between banks. Check the preview, or use your bank\'s CSV/Excel export when you can.');

  return (
    <section className="panel import-panel" id="import-panel">
      <div className="panel-heading import-heading">
        <div>
          <p className="eyebrow">START HERE</p>
          <h2>Bring your transactions in</h2>
          <p className="panel-subtitle">Find recurring charges from a statement you already have.</p>
        </div>
        <span className="panel-icon import-panel-icon"><Icon name="file" size={19} /></span>
      </div>

      <div
        className={'dropzone ' + (isDragging ? 'dragging' : '') + (isLoading ? ' uploading' : '')}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
        onDrop={handleDrop}
      >
        <input id="statement-file" type="file" accept=".csv,text/csv,.xlsx,.xlsm,.pdf,application/pdf" onChange={handleInputChange} className="visually-hidden" disabled={isLoading} />
        <div className="dropzone-icon"><Icon name={isLoading ? 'clock' : 'upload'} size={24} /></div>
        <div className="dropzone-copy">
          <strong>{isLoading ? loadingLabel : isDragging ? 'Drop your statement to import' : 'Drop your statement here'}</strong>
          <span>{isLoading ? 'Everything is processed in your browser.' : 'CSV, Excel or text-based PDF'}</span>
        </div>
        <label className={'button button-secondary choose-file ' + (isLoading ? 'disabled' : '')} htmlFor="statement-file">
          {isLoading ? 'Please wait…' : 'Choose file'}
        </label>
        <p className="file-constraints"><Icon name="shield" size={13} /> CSV · XLSX · PDF <span>·</span> Up to 10 MB <span>·</span> No account connection</p>
      </div>

      {error && (
        <div className="feedback-message error-message" role="alert">
          <Icon name="close" size={17} /><span>{error}</span>
        </div>
      )}

      {result && (
        <div className="feedback-message success-message" role="status">
          <Icon name="check" size={17} />
          <span><strong>Import complete.</strong> {result.transactionCount} transactions reviewed from {KIND_LABEL[current?.kind] || 'your file'}; {result.subscriptions.length} potential recurring {result.subscriptions.length === 1 ? 'charge' : 'charges'} found.</span>
        </div>
      )}

      {summary?.needsSignChoice && (
        <div className="feedback-message warning-message sign-choice" role="group" aria-label="Choose what positive amounts mean">
          <Icon name="info" size={17} />
          <div>
            <p><strong>One quick question.</strong> Every amount in this file is positive, so CleanSub cannot tell spending from income. What do positive amounts mean here?</p>
            <div className="sign-choice-buttons">
              <button className="button button-secondary" onClick={() => chooseSign('positive-spending')} disabled={isLoading}>Spending (card statement)</button>
              <button className="button button-secondary" onClick={() => chooseSign('positive-income')} disabled={isLoading}>Money coming in</button>
            </div>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="feedback-message warning-message" role="status">
          <Icon name="info" size={17} />
          <span>{notes.join(' ')}</span>
        </div>
      )}

      {preview.length > 0 && (
        <div className="preview-block">
          <div className="preview-heading"><div><strong>Quick preview</strong><span>First {preview.length} transaction rows</span></div><span className="preview-file"><Icon name="file" size={14} />{current ? current.fileName : 'File'}</span></div>
          <div className="preview-table-wrap">
            <table className="data-table preview-table">
              <thead><tr><th>Date</th><th>Description</th><th className="align-right">Amount / direction</th></tr></thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index}><td>{row.date || '—'}</td><td>{row.payee}</td><td className="align-right">{row.direction === 'outflow' ? '− ' : row.direction === 'inflow' ? '+ ' : '? '}{Number(row.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="import-footer">
        <span><Icon name="shield" size={15} /><span><strong>Private by default</strong><small>Your file is read locally and is never sent to a server.</small></span></span>
        <a href={sampleCsv} download="cleansub-sample.csv" className="sample-link">Try sample data <Icon name="arrow" size={14} /></a>
      </div>
    </section>
  );
}
