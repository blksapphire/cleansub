import React, { useMemo, useState } from 'react';
import Icon from '../Icon';

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch {
    return String(Number(amount) || 0);
  }
}

function intervalLabel(days) {
  const interval = Number(days);
  if (!Number.isFinite(interval) || interval <= 0) return 'Not enough data';
  if (interval >= 6 && interval <= 9) return 'Weekly';
  if (interval >= 13 && interval <= 16) return 'Every 2 weeks';
  if (interval >= 25 && interval <= 35) return 'Monthly';
  if (interval >= 85 && interval <= 100) return 'Quarterly';
  if (interval >= 350 && interval <= 380) return 'Yearly';
  return 'Every ' + Math.round(interval) + ' days';
}

function confidenceLabel(value) {
  if (value === 'High') return 'High confidence';
  if (value === 'Medium') return 'Medium confidence';
  return 'Review match';
}

export default function Subscriptions({ items = [], currency = 'USD', compact = false, onViewAll, onImport }) {
  const [query, setQuery] = useState('');
  const [openHelp, setOpenHelp] = useState(null);
  const safeItems = Array.isArray(items) ? items : [];
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? safeItems.filter((item) => String(item.payee || '').toLowerCase().includes(normalizedQuery))
      : safeItems;
    return compact ? filtered.slice(0, 5) : filtered;
  }, [safeItems, query, compact]);

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
          <span className="table-note">Estimates shown in {currency}</span>
        </div>
      )}

      {safeItems.length === 0 ? (
        <div className="empty-table-state">
          <div className="empty-illustration small"><Icon name="repeat" size={23} /></div>
          <h3>No recurring charges yet</h3>
          <p>Once you import a CSV statement, CleanSub will look for merchants that appear on a regular schedule.</p>
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
                {!compact && <th>Occurrences</th>}
                <th>Confidence</th>
                <th className="actions-column">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => {
                const key = item.normalized || item.payee || String(index);
                const confidence = item.confidence || 'Low';
                const isOpen = openHelp === key;
                return (
                  <React.Fragment key={key}>
                    <tr className={isOpen ? 'row-open' : ''}>
                      <td>
                        <div className="merchant-cell">
                          <span className={'merchant-avatar merchant-' + (index % 5)}>{String(item.payee || '?').trim().charAt(0).toUpperCase()}</span>
                          <span className="merchant-info"><strong>{item.payee || 'Unknown merchant'}</strong><small>{compact ? 'Recurring payment' : (item.normalized || 'Detected from statement')}</small></span>
                        </div>
                      </td>
                      <td><strong className="amount-cell">{formatCurrency(item.estimatedMonthly, currency)}</strong><small className="table-subtext">per month, est.</small></td>
                      {!compact && <td><span className="interval-cell"><Icon name="clock" size={14} />{item.frequency || intervalLabel(item.medianIntervalDays)}</span></td>}
                      {!compact && <td className="occurrences-cell">{item.count || 0} <span>times</span></td>}
                      <td><span className={'confidence-pill confidence-' + confidence.toLowerCase()}><span />{confidenceLabel(confidence)}</span></td>
                      <td className="actions-column"><button className={'row-action ' + (isOpen ? 'is-open' : '')} onClick={() => setOpenHelp(isOpen ? null : key)} aria-expanded={isOpen}>{isOpen ? 'Hide' : 'Guide'}<Icon name="chevron" size={14} /></button></td>
                    </tr>
                    {isOpen && (
                      <tr className="guidance-row">
                        <td colSpan={compact ? 4 : 6}>
                          <div className="guidance-content">
                            <span className="guidance-icon"><Icon name="info" size={18} /></span>
                            <div className="guidance-copy">
                              <strong>Before you change {item.payee || 'this subscription'}</strong>
                              <p>Confirm the charge in the merchant's official account or billing settings. If you don't recognize it, contact the merchant using a trusted website or phone number. For an unauthorized card charge, contact your bank or card provider.</p>
                              <small>CleanSub does not cancel payments or verify the merchant's cancellation policy.</small>
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
