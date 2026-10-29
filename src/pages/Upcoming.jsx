import React, { useMemo, useState } from 'react';
import Icon from '../Icon';
import { formatCurrency, formatDate, formatTotals } from '../lib/format';
import { upcomingCharges, buildIcs, addDays, todayIso } from '../lib/schedule';
import { totalsByCurrency, isLikely } from '../lib/insights';
import { KIND_LABELS } from '../lib/classify';

export default function Upcoming({ subscriptions, currency, onImport }) {
  const [includePossible, setIncludePossible] = useState(false);
  const today = todayIso();
  const pool = useMemo(
    () => (includePossible ? subscriptions : subscriptions.filter(isLikely)),
    [subscriptions, includePossible]
  );
  const items = useMemo(() => upcomingCharges(pool, today, 60), [pool, today]);
  const next30 = items.filter((i) => i.date <= addDays(today, 30));
  const totals = totalsByCurrency(next30.map((i) => ({ currency: i.result.currency, estimatedMonthly: i.amount })));
  const projected = items.some((i) => i.projectedFromOldData);

  function download() {
    const ics = buildIcs(pool, { fromIso: today, formatAmount: (amount, code) => formatCurrency(amount, code || currency) });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cleansub-expected-charges.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (!subscriptions.length) {
    return (
      <section className="empty-insights panel">
        <div className="empty-illustration"><Icon name="calendar" size={28} /></div>
        <h2>Your upcoming charges will show up here</h2>
        <p>Import a statement and CleanSub will predict when each recurring charge is likely to hit next.</p>
        <button className="button button-primary" onClick={onImport}><Icon name="upload" size={17} /> Import a statement</button>
      </section>
    );
  }

  return (
    <section className="panel insight-panel upcoming-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">NEXT 60 DAYS</p>
          <h2>Expected charges</h2>
          <p className="panel-subtitle">Predicted from each charge's rhythm. Estimates, not bills.</p>
        </div>
        <button className="button button-secondary" onClick={download} disabled={!pool.length}><Icon name="download" size={16} /> Add to calendar (.ics)</button>
      </div>

      <div className="upcoming-summary">
        <div><span>Next 30 days</span><strong>{next30.length ? formatTotals(totals, currency) : '—'}</strong></div>
        <div><span>Charges expected</span><strong>{next30.length}</strong></div>
        <label className="toggle-row"><input type="checkbox" checked={includePossible} onChange={(e) => setIncludePossible(e.target.checked)} /> Include low-confidence and possible matches</label>
      </div>

      {projected && (
        <div className="honesty-note"><Icon name="info" size={17} /><span>Your statement ends before today, so some dates are projected forward by whole billing cycles. Import a newer statement for sharper dates.</span></div>
      )}

      {items.length === 0 ? (
        <div className="no-search-results"><Icon name="calendar" size={19} /><span>No charges expected in the next 60 days from the selected matches.</span></div>
      ) : (
        <ul className="upcoming-list">
          {items.map((item, index) => {
            const money = item.result.currency || currency;
            const kind = item.result.kind || 'subscription';
            return (
              <li key={item.result.streamKey + item.date + index}>
                <span className="upcoming-date"><strong>{formatDate(item.date)}</strong></span>
                <span className="upcoming-name">{item.result.catalog?.name || item.result.payee}<small>{kind !== 'subscription' ? KIND_LABELS[kind] + ' · ' : ''}{item.result.frequency} · {item.result.confidence}</small></span>
                <strong className="upcoming-amount">{formatCurrency(item.amount, money)}</strong>
              </li>
            );
          })}
        </ul>
      )}
      <div className="honesty-note"><Icon name="shield" size={17} /><span>The calendar file is built on your device. Each event has a reminder the day before and repeats on the detected cycle. Billing days after the 28th are set to the 28th so every month fires.</span></div>
    </section>
  );
}
