import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { parseTransactions, detectRecurring } from '../lib/parser';
import Icon from '../Icon';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const sampleCsv = 'data:text/csv;charset=utf-8,Date%2CDescription%2CAmount%0A2026-01-10%2CNetflix%2C15.99%0A2026-02-10%2CNetflix%2C15.99%0A2026-03-10%2CNetflix%2C15.99%0A2026-01-05%2CSpotify%2C10.99%0A2026-02-05%2CSpotify%2C10.99%0A2026-03-05%2CSpotify%2C10.99%0A2026-02-18%2CGrocery%20Store%2C54.20';

export default function Upload({ onResult }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState([]);
  const [importInfo, setImportInfo] = useState(null);

  function processFile(file) {
    if (!file) return;
    setError('');
    setImportInfo(null);
    setPreview([]);

    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please choose a CSV file exported from your bank or card provider.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('That file is larger than 10 MB. Export a smaller date range and try again.');
      return;
    }
    if (file.size === 0) {
      setError('This file is empty. Choose a CSV with transaction rows.');
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();

    reader.onerror = () => {
      setError('We could not read that file. Please try selecting it again.');
      setIsLoading(false);
    };

    reader.onload = () => {
      try {
        const parsed = Papa.parse(String(reader.result || ''), {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
        });

        if (!parsed.data || parsed.data.length === 0) {
          throw new Error('No transaction rows were found in this CSV.');
        }

        const transactions = parseTransactions(parsed.data);
        if (!transactions.length) {
          throw new Error('No usable transaction rows were found. Check your CSV columns and try again.');
        }

        const detected = detectRecurring(transactions);
        setPreview(transactions.slice(0, 4));
        setImportInfo({
          fileName: file.name,
          transactionCount: transactions.length,
          detectedCount: detected.length,
        });
        onResult({
          subscriptions: detected,
          transactionCount: transactions.length,
          fileName: file.name,
        });
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'We could not read this CSV. Check its format and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    reader.readAsText(file);
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
        <input ref={inputRef} id="statement-file" type="file" accept=".csv,text/csv" onChange={handleInputChange} className="visually-hidden" />
        <div className="dropzone-icon"><Icon name={isLoading ? 'clock' : 'upload'} size={24} /></div>
        <div className="dropzone-copy">
          <strong>{isLoading ? 'Reading your statement…' : isDragging ? 'Drop your CSV to import' : 'Drop your CSV statement here'}</strong>
          <span>{isLoading ? 'Everything is processed in your browser.' : 'or choose a file from your device'}</span>
        </div>
        <label className={'button button-secondary choose-file ' + (isLoading ? 'disabled' : '')} htmlFor="statement-file">
          {isLoading ? 'Please wait…' : 'Choose CSV'}
        </label>
        <p className="file-constraints"><Icon name="shield" size={13} /> CSV only <span>·</span> Up to 10 MB <span>·</span> No account connection</p>
      </div>

      {error && (
        <div className="feedback-message error-message" role="alert">
          <Icon name="close" size={17} /><span>{error}</span>
        </div>
      )}

      {importInfo && (
        <div className="feedback-message success-message" role="status">
          <Icon name="check" size={17} />
          <span><strong>Import complete.</strong> {importInfo.transactionCount} transactions reviewed; {importInfo.detectedCount} potential recurring {importInfo.detectedCount === 1 ? 'charge' : 'charges'} found.</span>
        </div>
      )}

      {preview.length > 0 && (
        <div className="preview-block">
          <div className="preview-heading"><div><strong>Quick preview</strong><span>First {preview.length} transaction rows</span></div><span className="preview-file"><Icon name="file" size={14} />{importInfo ? importInfo.fileName : 'CSV file'}</span></div>
          <div className="preview-table-wrap">
            <table className="data-table preview-table">
              <thead><tr><th>Date</th><th>Description</th><th className="align-right">Amount</th></tr></thead>
              <tbody>
                {preview.map((row, index) => (
                  <tr key={index}><td>{row.date || '—'}</td><td>{row.payee}</td><td className="align-right">{Number(row.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="import-footer">
        <span><Icon name="shield" size={15} /><span><strong>Private by default</strong><small>Your file is read locally and is not sent to a server.</small></span></span>
        <a href={sampleCsv} download="cleansub-sample.csv" className="sample-link">Try sample data <Icon name="arrow" size={14} /></a>
      </div>
    </section>
  );
}
