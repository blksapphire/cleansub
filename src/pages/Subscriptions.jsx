import React, { useMemo, useState } from 'react';
import Icon from '../Icon';
import { formatCurrency, formatDate, formatPct } from '../lib/format';
import { nextCharge } from '../lib/schedule';
import { CATEGORY_LABELS } from '../data/catalog';
import { KIND_LABELS } from '../lib/classify';
import { decisionFor, visibleItems, dismissedItems } from '../lib/curate';

const kindOf = (item) => item.kind || 'subscription';

const KIND_GUIDANCE = {
  transfer: {
    heading: 'About this recurring transfer',
    body: "CleanSub matched this because money went to the same recipient on a repeating schedule. It is a transfer, not a merchant subscription. If you recognise the recipient, nothing needs changing; if you don't, check the transaction in your bank app."
  },
  fee: {
    heading: 'About this bank charge',
    body: 'This is a recurring bank charge, not a merchant subscription. Fees appear here so they are not mistaken for a service you can cancel. Check your bank\'s fee schedule if the amount looks unusually high.'
  },
  other: {
    heading: 'About this recurring charge',
    body: 'This repeats in your statement but does not look like a merchant subscription. Confirm it in your bank app before acting on it.'
  }
};

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

export default function Subscriptions({ items = [], currency = 'USD', compact = false, decisions = {}, onDecide, onViewAll, onImport }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('subscription');
  const [openHelp, setOpenHelp] = useState(null);
  const [showSetAside, setShowSetAside] = useState(false);
  const safeItems = Array.isArray(items) ? items : [];
  const dismissedList = useMemo(() => dismissedItems(safeItems, decisions), [safeItems, decisions]);
  const visibleList = useMemo(() => visibleItems(safeItems, decisions), [safeItems, decisions]);
  const kindCounts = useMemo(() => {
    const counts = { all: visibleList.length, subscription: 0, transfer: 0, fee: 0, other: 0 };
    for (const item of visibleList) counts[kindOf(item)] = (counts[kindOf(item)] || 0) + 1;
    return counts;
  }, [visibleList]);
  const hasOtherKinds = kindCounts.transfer + kindCounts.fee + kindCounts.other > 0;
  // A new import may not contain the selected kind at all; show everything instead of an empty table.
  const activeKind = !compact && kind !== 'all' && kindCounts[kind] === 0 ? 'all' : kind;
  const filteredItems = useMemo(() => {
    const byKind = compact ? visibleList : visibleList.filter((item) => activeKind === 'all' || kindOf(item) === activeKind);
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? byKind.filter((item) => (String(item.payee || '') + ' ' + (item.catalog?.name || '')).toLowerCase().includes(normalizedQuery))
      : byKind;
    return compact ? filtered.slice(0, 5) : filtered;
  }, [visibleList, query, compact, activeKind]);
  const colSpan = compact ? 4 : 7;

  return (
    <section className={'panel subscriptions-panel ' + (compact ? 'compact-subscriptions' : '')}>
      <div className="panel-heading subscription-heading">
        <div>
          <p className="eyebrow">{compact ? 'THE REPEAT LIST' : 'YOUR RECURRING PAYMENTS'}</p>
          <h2>{compact ? 'Detected subscriptions' : hasOtherKinds ? 'All recurring payments' : 'All detected subscriptions'}</h2>
          <p className="panel-subtitle">{compact ? 'Potential recurring charges found in your statement.' : 'Subscriptions, transfers and fees are kept apart so each one is reviewed for what it is. Keep what you recognise; set aside what is not a subscription.'}</p>
        </div>
        {compact ? (
          <button className="text-button view-all-button" onClick={onViewAll} disabled={!visibleList.length}>View all <Icon name="chevron" size={15} /></button>
        ) : (
          <span className="count-pill">{visibleList.length} {visibleList.length === 1 ? 'match' : 'matches'}{dismissedList.length ? ` · ${dismissedList.length} set aside` : ''}</span>
        )}
      </div>

      {!compact && hasOtherKinds && visibleList.length > 0 && (
        <div className="kind-filters" role="group" aria-label="Filter by charge type">
          {[
            ['all', 'All recurring'],
            ['subscription', 'Subscriptions'],
            ['transfer', 'Transfers'],
            ['fee', 'Bank fees'],
            ['other', 'Other']
          ].filter(([id]) => id === 'all' || id === 'subscription' || kindCounts[id] > 0).map(([id, label]) => (
            <button
              key={id}
              className={'kind-chip ' + (activeKind === id ? 'active' : '')}
              aria-pressed={activeKind === id}
              onClick={() => setKind(id)}
            >
              {label}<span className="kind-count">{kindCounts[id] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {!compact && visibleList.length > 0 && (
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
      ) : visibleList.length === 0 ? (
        <div className="empty-table-state">
          <div className="empty-illustration small"><Icon name="close" size={23} /></div>
          <h3>Every match is set aside</h3>
          <p>{compact ? 'Open the full subscriptions list to restore any of them.' : 'You marked all detected charges as not subscriptions. Use the set-aside list below to restore any of them.'}</p>
          {compact && onViewAll
            ? <button className="button button-secondary" onClick={onViewAll}>View all matches</button>
            : !compact && <button className="button button-secondary" onClick={() => setShowSetAside(true)}>Review set-aside items</button>}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="no-search-results"><Icon name="search" size={19} /><span>No merchants match “{query}”. Try another name.</span></div>
      ) : (
        <div className="table-scroll">
          <table className="data-table subscriptions-table">
            <thead>
              <tr>
                <th>Merchant or payee</th>
                <th>Est. monthly</th>
                {!compact && <th>Billing pattern</th>}
                {!compact && <th>Next charge</th>}
                {!compact && <th>Seen</th>}
                <th>Confidence</th>
                <th className="actions-column">Review</th>
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
                const itemKind = kindOf(item);
                const meta = [category, itemKind !== 'subscription' ? KIND_LABELS[itemKind] : ''].filter(Boolean).join(' · ');
                const isKept = decisionFor(item, decisions) === 'kept';
                return (
                  <React.Fragment key={key}>
                    <tr className={[isOpen ? 'row-open' : '', isKept ? 'row-kept' : ''].filter(Boolean).join(' ')}>
                      <td>
                        <div className="merchant-cell">
                          <span className={'merchant-avatar merchant-' + (index % 5)}>{String(item.catalog?.name || item.payee || '?').trim().charAt(0).toUpperCase()}</span>
                          <span className="merchant-info">
                            <strong>{item.catalog?.name || item.payee || 'Unknown merchant'}{item.streamAmount !== undefined ? ' · ' + formatCurrency(item.streamAmount, money) : ''}</strong>
                            <small>{compact ? 'Recurring payment' : (meta || item.payee)}{isKept ? ' · Kept' : ''}</small>
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
                      <td className="actions-column">
                        <div className="row-actions">
                          {onDecide && (
                            <>
                              <button
                                type="button"
                                className={'decision-button keep' + (isKept ? ' active' : '')}
                                onClick={() => onDecide(item, 'kept')}
                                aria-pressed={isKept}
                                aria-label={isKept ? 'Remove keep mark' : 'Keep this match'}
                                title={isKept ? 'Remove keep mark' : 'Mark as reviewed and keep'}
                              ><Icon name="check" size={14} /></button>
                              <button
                                type="button"
                                className="decision-button dismiss"
                                onClick={() => onDecide(item, 'dismissed')}
                                aria-label="Set aside as not a subscription"
                                title="Set aside as not a subscription"
                              ><Icon name="close" size={14} /></button>
                            </>
                          )}
                          <button className={'row-action ' + (isOpen ? 'is-open' : '')} onClick={() => setOpenHelp(isOpen ? null : key)} aria-expanded={isOpen}>{isOpen ? 'Hide' : 'Guide'}<Icon name="chevron" size={14} /></button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="guidance-row">
                        <td colSpan={colSpan}>
                          <div className="guidance-content">
                            <span className="guidance-icon"><Icon name="info" size={18} /></span>
                            <div className="guidance-copy">
                              <strong>{itemKind === 'subscription' ? `Before you change ${item.catalog?.name || item.payee || 'this subscription'}` : KIND_GUIDANCE[itemKind].heading}</strong>
                              <p>{itemKind === 'subscription'
                                ? "Confirm the charge in the merchant's official account or billing settings. If you don't recognize it, contact the merchant using a trusted website or phone number. For an unauthorized card charge, contact your bank or card provider."
                                : KIND_GUIDANCE[itemKind].body}</p>
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
      {compact && visibleList.length > 5 && (
        <div className="table-bottom-link"><span>Showing 5 of {visibleList.length} detected matches</span><button className="text-button" onClick={onViewAll}>See all subscriptions <Icon name="arrow" size={14} /></button></div>
      )}
      {!compact && dismissedList.length > 0 && (
        <div className="set-aside-bar">
          <span><Icon name="info" size={15} />{dismissedList.length} set aside as not subscriptions; excluded from totals and insights.</span>
          <button className="text-button" onClick={() => setShowSetAside((value) => !value)} aria-expanded={showSetAside}>{showSetAside ? 'Hide set-aside items' : 'Review set-aside items'}</button>
        </div>
      )}
      {!compact && showSetAside && dismissedList.length > 0 && (
        <ul className="set-aside-list">
          {dismissedList.map((item, index) => {
            const money = item.currency || currency;
            return (
              <li className="set-aside-item" key={item.streamKey || item.normalized || item.payee || String(index)}>
                <span className={'merchant-avatar merchant-' + (index % 5)}>{String(item.catalog?.name || item.payee || '?').trim().charAt(0).toUpperCase()}</span>
                <span className="set-aside-name">
                  <strong>{item.catalog?.name || item.payee || 'Unknown merchant'}</strong>
                  <small>{item.frequency} · {formatCurrency(item.estimatedMonthly, money)}/mo</small>
                </span>
                <button className="text-button" onClick={() => onDecide(item, 'dismissed')}>Restore</button>
              </li>
            );
          })}
        </ul>
      )}
      {!compact && (visibleList.length > 0 || dismissedList.length > 0) && (
        <div className="table-bottom-link"><span>{query ? 'Showing ' + filteredItems.length + ' of ' + visibleList.length + ' matches' : 'Matches are estimates, not confirmed charges.'}</span><span><Icon name="shield" size={14} /> Stored only in this session</span></div>
      )}
    </section>
  );
}
