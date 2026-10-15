import React from 'react';

function formatAmount(a){ return Number(a).toFixed(2); }

export default function Subscriptions({ items }) {
  if (!items || items.length === 0) return <div className="card"><h2>No recurring charges found yet</h2></div>;
  return (
    <div className="card">
      <h2>Detected subscriptions</h2>
      <table>
        <thead><tr><th>Provider</th><th>Approx monthly</th><th>Occurrences</th><th>Confidence</th><th>Help</th></tr></thead>
        <tbody>
          {items.map((s, i) => (
            <tr key={i}>
              <td>{s.payee}</td>
              <td>${formatAmount(s.estimatedMonthly)}</td>
              <td>{s.count}</td>
              <td>{s.confidence}</td>
              <td><button onClick={() => alert(`Cancel help for ${s.payee}\n\nSuggested actions:\n1) Visit your account page 2) Use bank charge dispute if unauthorized\n\n(We will expand help in future builds.)`)}>Cancel help</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
