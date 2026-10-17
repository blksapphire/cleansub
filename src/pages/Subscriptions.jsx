import React, { useMemo, useState } from 'react';
import Icon from '../Icon';
import { formatCurrency, formatDate, formatPct } from '../lib/format';
import { nextCharge } from '../lib/schedule';
import { CATEGORY_LABELS } from '../data/catalog';

function confidenceLabel(value) {
  if (value === 'High') return 'High confidence';
  if (value === 'Medium') return 'Medium confidence';
  if (value === 'Possible') return 'Possible match';
  return 'Review match';
}

export function PriceBadge({ change, currency }) {
  if (!change) return null;
  const up = change.direction === 'increase';
  const title = change.kind === 'step'
    ? `${formatCurrency(change.from, currency)} to ${formatCurrency(change.to, currency)} on ${formatDate(change.changeDate)}`
    : `Moved gradually from ${formatCurrency(change.from, currency)} to ${formatCurrency(change.to, currency)}. This can be a price rise or exchange-rate movement on a foreign-currency charge.`;
  return (
    <span className={'price-badge ' + (up ? 'up' : 'down')} title={title}>
      <Icon name="trend" size={12} />{formatPct(change.pct)}{change.kind === 'drift' ? ' drift' : ''}
    </span>
  );
}

export default function Subscriptions({ items = [], currency = 'USD', compact = false, onViewAll, onImport }) {
  const [query, setQuery] = useState('');
  const [openHelp, setOpenHelp] = useState(null);
  const safeItems = Array.isArray(items) ? items : [];
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? safeItems.filter((item) => (String(item.payee || '') + ' ' + (item.catalog?.name || '')).toLowerCase().includes(normalizedQuery))
      : safeItems;
    return compact ? filtered.slice(0, 5) : filtered;
  }, [safeItems, query, compact]);
  const colSpan = compact ? 4 : 7;

  return (
    <section className={'panel subscriptions-panel ' + (compact ? 'compact-subscriptions' : '')}>
      <div className="panel-heading subscription-heading">
        <div>
          <p className="eyebrow">{compact ? 'THE REPEAT LIST' : 'YOUR RECURRING PAYMENTS'}</p>
          <h2>{compact ? 'Detected subscriptions' : 'All detected subscriptions'}</h2>
          <p className="panel-subtitle">{compact ? 'Potential recurring charges found in your statement.' : 'Review each match before deciding what to keep or cancel.'}</p>
        </div>
        {compact ? (
          <button className="text-button view-all-button" onClick={onViewAll} disabled={!safeItems.length}>View all <Icon name="chevron" size={15} /></button>
        ) : (
          <span className="count-pill">{safeItems.length} {safeItems.length === 1 ? 'match' : 'matches'}</span>
        )}
      </div>

      {!compact && safeItems.length > 0 && (
        <div className="table-toolbar">
          <label className="search-field">
            <Icon name="search" size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search merchants…" aria-label="Search merchants" />
            {query && <button className="clear-search" onClick={() => setQuery('')} aria-label="Clear search"><Icon name="close" size={14} /></button>}
          </label>
          <span className="table-note">Amounts shown in each charge's own currency, else {currency}</span>
        </div>
      )}

      {safeItems.length === 0 ? (
        <div className="empty-table-state">
          <div className="empty-illustration small"><Icon name="repeat" size={23} /></div>
          <h3>No recurring charges yet</h3>
          <p>Once you import a statement, CleanSub will look for merchants that appear on a regular schedule.</p>
          {onImport && <button className="button button-secondary" onClick={onImport}><Icon name="upload" size={16} /> Import a statement</button>}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="no-search-results"><Icon name="search" size={19} /><span>No merchants match “{query}”. Try another name.</span></div>
      ) : (
        <div className="table-scroll">
          <table className="data-table subscriptions-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Est. monthly</th>
                {!compact && <th>Billing pattern</th>}
                {!compact && <th>Next charge</th>}
                {!compact && <th>Seen</th>}
                <th>Confidence</th>
                <th className="actions-column">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => {
                const key = item.streamKey || item.normalized || item.payee || String(index);
                const confidence = item.confidence || 'Low';
                const isOpen = openHelp === key;
                const money = item.currency || currency;
                const next = compact ? null : nextCharge(item);
                const category = item.catalog ? CATEGORY_LABELS[item.catalog.category] : '';
                return (
                  <React.Fragment key={key}>
                    <tr className={isOpen ? 'row-open' : ''}>
                      <td>
                        <div className="merchant-cell">
                          <span className={'merchant-avatar merchant-' + (index % 5)}>{String(item.catalog?.name || item.payee || '?').trim().charAt(0).toUpperCase()}</span>
                          <span className="merchant-info">
                            <strong>{item.catalog?.name || item.payee || 'Unknown merchant'}{item.streamAmount !== undefined ? ' · ' + formatCurrency(item.streamAmount, money) : ''}</strong>
                            <small>{compact ? 'Recurring payment' : (category || item.payee)}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong className="amount-cell">{formatCurrency(item.estimatedMonthly, money)}</strong>
                        <small className="table-subtext">per month, est. <PriceBadge change={item.priceChange} currency={money} /></small>
                      </td>
                      {!compact && <td><span className="interval-cell"><Icon name="clock" size={14} />{item.frequency}</span></td>}
                      {!compact && (
                        <td className="next-cell">
                          {next ? <><strong>{formatDate(next.date)}</strong>{next.projectedFromOldData && <small className="table-subtext">projected</small>}</> : '—'}
                        </td>
                      )}
                      {!compact && <td className="occurrences-cell">{item.count || 0} <span>times</span></td>}
                      <td><span className={'confidence-pill confidence-' + confidence.toLowerCase()}><span />{confidenceLabel(confidence)}</span></td>
                      <td className="actions-column"><button className={'row-action ' + (isOpen ? 'is-open' : '')} onClick={() => setOpenHelp(isOpen ? null : key)} aria-expanded={isOpen}>{isOpen ? 'Hide' : 'Guide'}<Icon name="chevron" size={14} /></button></td>
                    </tr>
                    {isOpen && (
                      <tr className="guidance-row">
                        <td colSpan={colSpan}>
                          <div className="guidance-content">
                            <span className="guidance-icon"><Icon name="info" size={18} /></span>
                            <div className="guidance-copy">
                              <strong>Before you change {item.catalog?.name || item.payee || 'this subscription'}</strong>
                              <p>Confirm the charge in the merchant's official account or billing settings. If you don't recognize it, contact the merchant using a trusted website or phone number. For an unauthorized card charge, contact your bank or card provider.</p>
                              {item.priceChange && (
                                <p className="guidance-flag"><Icon name="trend" size={14} /> {item.priceChange.kind === 'step'
                                  ? `The charge went ${item.priceChange.direction === 'increase' ? 'up' : 'down'} ${formatPct(item.priceChange.pct)} (${formatCurrency(item.priceChange.from, money)} to ${formatCurrency(item.priceChange.to, money)}) from ${formatDate(item.priceChange.changeDate)}.`
                                  : `The charge moved ${formatPct(item.priceChange.pct)} over ${item.count} payments (${formatCurrency(item.priceChange.from, money)} to ${formatCurrency(item.priceChange.to, money)}). On a foreign-currency charge this can simply be the exchange rate.`}</p>
                              )}
                              {item.trial && (
                                <p className="guidance-flag"><Icon name="alert" size={14} /> This began with a small {formatCurrency(item.trial.trialAmount, money)} charge on {formatDate(item.trial.trialDate)}, then {formatCurrency(item.trial.paidAmount, money)} {item.trial.daysBetween} days later. That pattern often means a trial became a paid plan.</p>
                              )}
                              {item.catalog?.cancelUrl && (
                                <a className="link-out" href={item.catalog.cancelUrl} target="_blank" rel="noopener noreferrer">Open {item.catalog.name}'s account page <Icon name="external" size={13} /></a>
                              )}
                              <small>CleanSub does not cancel payments or verify the merchant's cancellation policy. Links go to the merchant's own site and may change.</small>
                              {Array.isArray(item.reasons) && item.reasons.length > 0 && (
                                <ul className="detection-reasons">
                                  {item.reasons.map((reason, reasonIndex) => <li key={reasonIndex}>{reason}</li>)}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {compact && safeItems.length > 5 && (
        <div className="table-bottom-link"><span>Showing 5 of {safeItems.length} detected matches</span><button className="text-button" onClick={onViewAll}>See all subscriptions <Icon name="arrow" size={14} /></button></div>
      )}
      {!compact && safeItems.length > 0 && (
        <div className="table-bottom-link"><span>{query ? 'Showing ' + filteredItems.length + ' of ' + safeItems.length + ' matches' : 'Matches are estimates, not confirmed subscriptions.'}</span><span><Icon name="shield" size={14} /> Stored only in this session</span></div>
      )}
    </section>
  );
}
