import React from 'react';
import Icon from '../Icon';
import { formatCurrency, formatDate, formatPct, formatTotals } from '../lib/format';
import { totalsByCurrency, isLikely, isPossible } from '../lib/insights';
import { PriceBadge } from './Subscriptions';

function ConfidenceRow({ label, count, total, tone }) {
  const width = total > 0 ? Math.max((count / total) * 100, count > 0 ? 5 : 0) : 0;
  return (
    <div className="confidence-row">
      <div className="confidence-copy">
        <span className={'confidence-dot ' + tone} />
        <span>{label}</span>
        <strong>{count}</strong>
      </div>
      <div className="progress-track"><div className={'progress-fill ' + tone} style={{ width: width + '%' }} /></div>
    </div>
  );
}

export default function Insights({ subscriptions, insights, currency, onImport }) {
  const total = subscriptions.length;
  const count = (label) => subscriptions.filter((item) => item.confidence === label).length;
  const high = count('High');
  const medium = count('Medium');
  const low = count('Low');
  const possible = count('Possible');
  const likelyTotals = totalsByCurrency(subscriptions, isLikely);
  const possibleTotals = totalsByCurrency(subscriptions, isPossible);
  const currencyTotal = (code) => likelyTotals.find((t) => t.currency === (code || ''))?.amount || 0;
  const sorted = subscriptions.filter(isLikely).sort((a, b) => b.estimatedMonthly - a.estimatedMonthly).slice(0, 5);
  const highest = sorted[0];

  if (!total) {
    return (
      <section className="empty-insights panel">
        <div className="empty-illustration"><Icon name="chart" size={28} /></div>
        <h2>Your insights will show up here</h2>
        <p>Import a statement to see recurring charges, price changes, overlaps and match confidence.</p>
        <button className="button button-primary" onClick={onImport}><Icon name="upload" size={17} /> Import a statement</button>
      </section>
    );
  }

  const { priceChanges = [], trials = [], overlaps = [] } = insights || {};

  return (
    <div className="insights-layout">
      <section className="panel insight-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">AT A GLANCE</p><h2>Recurring spend estimate</h2></div>
          <span className="panel-icon"><Icon name="wallet" size={19} /></span>
        </div>
        <p className="insight-total">{likelyTotals.length ? formatTotals(likelyTotals, currency) : formatCurrency(0, currency)}<span>/mo</span></p>
        <p className="muted-copy">Counts only high- and medium-confidence matches{possibleTotals.length ? <>; another {formatTotals(possibleTotals, currency)}/mo sits in lower-confidence matches you should check first</> : null}. Estimates are not confirmed bills.</p>
        <div className="insight-divider" />
        <div className="small-stat-list">
          <div><span>Subscriptions detected</span><strong>{total}</strong></div>
          <div><span>Highest estimated monthly charge</span><strong>{highest ? formatCurrency(highest.estimatedMonthly, highest.currency || currency) : '—'}</strong></div>
          <div><span>Strong matches</span><strong>{high} of {total}</strong></div>
        </div>
      </section>

      <section className="panel insight-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">DETECTION QUALITY</p><h2>Match confidence</h2></div>
          <span className="panel-icon"><Icon name="shield" size={19} /></span>
        </div>
        <p className="muted-copy confidence-intro">Confidence is based on how regularly a merchant appears and whether the amount stays consistent. Review each match before taking action.</p>
        <div className="confidence-list">
          <ConfidenceRow label="High confidence" count={high} total={total} tone="high" />
          <ConfidenceRow label="Medium confidence" count={medium} total={total} tone="medium" />
          <ConfidenceRow label="Needs a closer look" count={low} total={total} tone="low" />
          <ConfidenceRow label="Possible (only 2 charges)" count={possible} total={total} tone="low" />
        </div>
      </section>

      {priceChanges.length > 0 && (
        <section className="panel insight-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">PRICE MOVEMENT</p><h2>Charges that changed</h2></div>
            <span className="panel-icon"><Icon name="trend" size={19} /></span>
          </div>
          <ul className="flag-list">
            {priceChanges.slice(0, 6).map((item) => {
              const money = item.currency || currency;
              return (
                <li key={item.streamKey}>
                  <div><strong>{item.catalog?.name || item.payee}</strong><span>{formatCurrency(item.priceChange.from, money)} → {formatCurrency(item.priceChange.to, money)}{item.priceChange.kind === 'step' ? ' · since ' + formatDate(item.priceChange.changeDate) : ' · gradual'}</span></div>
                  <PriceBadge change={item.priceChange} currency={money} />
                </li>
              );
            })}
          </ul>
          <p className="muted-copy">Gradual moves on foreign-currency charges can be exchange rates rather than a real price rise.</p>
        </section>
      )}

      {trials.length > 0 && (
        <section className="panel insight-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">HEADS-UP</p><h2>Trials that turned paid</h2></div>
            <span className="panel-icon"><Icon name="alert" size={19} /></span>
          </div>
          <ul className="flag-list">
            {trials.map((trial) => {
              const money = trial.currency || currency;
              return (
                <li key={trial.normalized + trial.firstPaidDate}>
                  <div>
                    <strong>{trial.payee}</strong>
                    <span>{formatCurrency(trial.trialAmount, money)} on {formatDate(trial.trialDate)}, then {formatCurrency(trial.paidAmount, money)} on {formatDate(trial.firstPaidDate)}</span>
                  </div>
                  <span className={'confidence-pill ' + (trial.kind === 'recurring' ? 'confidence-medium' : 'confidence-low')}><span />{trial.kind === 'recurring' ? 'Now recurring' : 'Just converted'}</span>
                </li>
              );
            })}
          </ul>
          <p className="muted-copy">A tiny first charge followed by a much larger one often means a free trial rolled into a paid plan. Check whether you still want it.</p>
        </section>
      )}

      {overlaps.length > 0 && (
        <section className="panel insight-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">OVERLAP</p><h2>Paying twice for the same thing?</h2></div>
            <span className="panel-icon"><Icon name="layers" size={19} /></span>
          </div>
          <ul className="flag-list">
            {overlaps.map((group) => (
              <li key={group.category}>
                <div><strong>{group.label}: {group.services.length} services</strong><span>{group.services.join(', ')}</span></div>
                <strong className="spending-amount">{formatTotals(group.totals, currency)}<small>/mo</small></strong>
              </li>
            ))}
          </ul>
          <p className="muted-copy">Having more than one is sometimes deliberate. It is worth a look when you only really use one.</p>
        </section>
      )}

      <section className="panel insight-panel spending-breakdown">
        <div className="panel-heading">
          <div><p className="eyebrow">TOP RECURRING CHARGES</p><h2>Where the money goes</h2></div>
          <span className="panel-icon"><Icon name="chart" size={19} /></span>
        </div>
        <div className="spending-list">
          {sorted.length === 0 && <p className="muted-copy">No high- or medium-confidence matches yet.</p>}
          {sorted.map((item, index) => {
            const base = currencyTotal(item.currency);
            const share = base > 0 ? Math.max((item.estimatedMonthly / base) * 100, 0) : 0;
            return (
              <div className="spending-item" key={item.streamKey || item.payee || index}>
                <div className="spending-item-top">
                  <div className="merchant-avatar">{(item.catalog?.name || item.payee || '?').trim().charAt(0).toUpperCase()}</div>
                  <div className="spending-name"><strong>{item.catalog?.name || item.payee}</strong><span>{Math.round(share)}% of detected spend</span></div>
                  <strong className="spending-amount">{formatCurrency(item.estimatedMonthly, item.currency || currency)}</strong>
                </div>
                <div className="progress-track"><div className="progress-fill spend" style={{ width: share + '%' }} /></div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
