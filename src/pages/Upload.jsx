import React, { useState } from 'react';
import Papa from 'papaparse';
import { parseTransactions, detectRecurring } from '../lib/parser';

export default function Upload({ onResult }) {
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  function handleFile(e) {
    setError(null);
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = reader.result;
      const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true });
      try {
        const tx = parseTransactions(parsed.data);
        setPreview(tx.slice(0, 10));
        const subs = detectRecurring(tx);
        onResult(subs);
      } catch (err) {
        setError(String(err));
      }
    };
    reader.readAsText(f);
  }

  return (
    <div className="card">
      <h2>Upload transactions CSV</h2>
      <p>Export your transactions (CSV) from your bank or card and upload here. Parsing is client-side.</p>
      <input type="file" accept=".csv" onChange={handleFile} />
      {error && <p style={{color:'red'}}>{error}</p>}
      {preview && (
        <>
          <h3>Preview (first rows)</h3>
          <table>
            <thead><tr><th>Date</th><th>Payee</th><th>Amount</th></tr></thead>
            <tbody>
              {preview.map((r,i) => (<tr key={i}><td>{r.date}</td><td>{r.payee}</td><td>{r.amount}</td></tr>))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
