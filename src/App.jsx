import React, { useMemo, useState } from 'react';
import Icon from './Icon';
import Upload from './pages/Upload';
import Subscriptions from './pages/Subscriptions';
import Upcoming from './pages/Upcoming';
import Insights from './pages/Insights';
import Pricing from './pages/Pricing';
import { formatCurrency, formatDate, formatTotals, isValidCurrency } from './lib/format';
import { totalsByCurrency, isLikely, isSubscription } from './lib/insights';
import { visibleItems, filterInsights, toggleDecision } from './lib/curate';
import { upcomingCharges, todayIso } from './lib/schedule';

const navigation = [
  { id: 'overview', label: 'Overview', tab: 'Overview', short: 'Overview', icon: 'grid' },
  { id: 'subscriptions', label: 'Subscriptions', tab: 'Subscriptions', short: 'Subs', icon: 'repeat' },
  { id: 'upcoming', label: 'Upcoming charges', tab: 'Upcoming', short: 'Upcoming', icon: 'calendar' },
  { id: 'insights', label: 'Spending insights', tab: 'Insights', short: 'Insights', icon: 'chart' },
];

const plansNavigation = [
  { id: 'pricing', label: 'Plans & Pro', tab: 'Plans & Pro', short: 'Plans', icon: 'wallet' },
];

const allNavigation = [...navigation, ...plansNavigation];

const viewCopy = {
  overview: {
    title: 'Your money, at a glance.',
    description: 'A calmer, clearer picture of the recurring charges in your life.',
  },
  subscriptions: {
    title: 'Your subscriptions.',
    description: 'Review recurring payments and decide what deserves a place in your budget.',
  },
  upcoming: {
    title: 'See charges coming.',
    description: 'Predicted renewal dates for your recurring payments, with a calendar you can keep.',
  },
  insights: {
    title: 'Know where it goes.',
    description: 'Simple insights built from the transactions you choose to import.',
  },
  pricing: {
    title: 'Free today. Pro only when it earns its place.',
    description: 'The local app stays complete. Paid alerts and history are planned, not built or charged for yet.',
  },
};

const DAY_MS = 86400000;

function greetingFor(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function daysUntil(iso, fromIso) {
  const parse = (value) => {
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(iso) - parse(fromIso)) / DAY_MS);
}

function relativeDay(days) {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

function MetricCard({ icon, label, value, detail, tone }) {
  return (
    <section className="metric-card">
      <div className={'metric-icon ' + tone}><Icon name={icon} size={19} /></div>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-detail">{detail}</p>
    </section>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState('overview');
  const [subscriptions, setSubscriptions] = useState([]);
  const [insights, setInsights] = useState(null);
  const [transactionCount, setTransactionCount] = useState(0);
  const [lastImport, setLastImport] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [detectedCurrency, setDetectedCurrency] = useState('');
  const [decisions, setDecisions] = useState({});

  const allSubscriptionItems = useMemo(() => subscriptions.filter(isSubscription), [subscriptions]);
  const visibleList = useMemo(() => visibleItems(subscriptions, decisions), [subscriptions, decisions]);
  const subscriptionItems = useMemo(() => visibleList.filter(isSubscription), [visibleList]);
  const likelyTotals = useMemo(() => totalsByCurrency(subscriptionItems, isLikely), [subscriptionItems]);
  const highConfidence = subscriptionItems.filter((item) => item.confidence === 'High').length;
  const otherRecurring = visibleList.length - subscriptionItems.length;
  const setAside = subscriptions.length - visibleList.length;
  const foundDetail = [
    otherRecurring ? `${otherRecurring} other recurring charge${otherRecurring === 1 ? '' : 's'} kept separate` : '',
    setAside ? `${setAside} set aside` : ''
  ].filter(Boolean).join(' · ') || (subscriptionItems.length ? 'Potential recurring merchants' : 'Nothing tracked yet');
  const visibleInsights = useMemo(() => filterInsights(insights, subscriptions, decisions), [insights, subscriptions, decisions]);
  const copy = viewCopy[activeView];
  const today = todayIso();
  const greeting = greetingFor();
  const currencyOptions = useMemo(() => {
    const base = ['USD', 'NGN', 'GBP', 'EUR', 'CAD'];
    return detectedCurrency && !base.includes(detectedCurrency) && isValidCurrency(detectedCurrency)
      ? [...base, detectedCurrency]
      : base;
  }, [detectedCurrency]);

  const nextThirty = useMemo(() => {
    const charges = upcomingCharges(subscriptionItems, todayIso(), 30);
    const totals = totalsByCurrency(
      charges.map((charge) => ({ currency: charge.result.currency, estimatedMonthly: charge.amount }))
    );
    return { charges, totals };
  }, [subscriptionItems]);
  const nextChargePreview = nextThirty.charges[0] || null;

  function handleImportResult(result) {
    setSubscriptions(result.subscriptions || []);
    setInsights(result.insights || null);
    setTransactionCount(result.transactionCount || 0);
    setLastImport(result.fileName || '');
    setDecisions({});
    // A currency stated by the file wins over the default; mixed files keep each charge's own.
    const found = result.summary?.detectedCurrency || '';
    setDetectedCurrency(found);
    if (found && !result.summary?.mixedCurrencies && isValidCurrency(found)) setCurrency(found);
  }

  function handleDecide(item, next) {
    setDecisions((current) => toggleDecision(current, item, next));
  }

  function goToImport() {
    setActiveView('overview');
    window.setTimeout(() => {
      document.getElementById('import-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="topnav-inner">
          <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setActiveView('overview'); }} aria-label="CleanSub overview">
            <span className="brand-mark"><Icon name="sparkles" size={19} strokeWidth={2} /></span>
            <span className="brand-name">cleansub<span>.</span></span>
          </a>

          <nav className="desktop-nav" aria-label="Main navigation">
            {allNavigation.map((item) => (
              <button
                key={item.id}
                className={'nav-item' + (activeView === item.id ? ' active' : '')}
                onClick={() => setActiveView(item.id)}
                aria-current={activeView === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} size={17} />
                <span>{item.tab}</span>
                {item.id === 'subscriptions' && subscriptionItems.length > 0 && <span className="nav-count">{subscriptionItems.length}</span>}
              </button>
            ))}
          </nav>

          <div className="topnav-tools">
            <span className="local-chip"><span className="live-dot" />Local-only</span>
            <label className="currency-select">
              <span>Currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Display currency">
                {currencyOptions.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            <button className="button button-primary top-import" onClick={goToImport} aria-label="Import statement">
              <Icon name="upload" size={17} /><span className="button-label">Import statement</span>
            </button>
          </div>
        </div>
      </header>

      <main className="page-content">
        {activeView === 'overview' ? (
          <section className="hero-panel">
            <div className="hero-main">
              <p className="eyebrow">{greeting} · Your clean slate</p>
              <h1>{subscriptionItems.length ? 'Your recurring spend, at a glance.' : 'See every subscription in one quiet place.'}</h1>
              <p className="hero-copy">CleanSub finds repeating charges in your statement, so you can keep what matters and set aside the rest. Everything runs on this device.</p>
              <div className="hero-amount-row">
                <div>
                  <span className="hero-amount-label">Estimated monthly recurring</span>
                  <p className={'hero-amount' + (likelyTotals.length > 1 ? ' multi' : '')}>{formatTotals(likelyTotals, currency)}<span className="hero-per">/mo</span></p>
                </div>
              </div>
              <div className="hero-actions">
                <button className="button button-primary" onClick={goToImport}><Icon name="upload" size={17} /> Import statement</button>
                <span className="local-chip hero-local"><span className="live-dot" /> Processed on this device</span>
              </div>
            </div>
            <aside className="hero-aside">
              <div className="hero-aside-card">
                <div>
                  <p className="hero-aside-label">Next 30 days</p>
                  <p className="hero-aside-value">{nextThirty.charges.length}</p>
                  <p className="hero-aside-copy">
                    {nextThirty.charges.length
                      ? `${formatTotals(nextThirty.totals, currency)} expected across ${nextThirty.charges.length === 1 ? 'one charge' : nextThirty.charges.length + ' charges'}.`
                      : 'Import a statement to see predicted renewals.'}
                  </p>
                </div>
                {nextChargePreview && (
                  <div className="hero-next">
                    <span className="hero-aside-label">Next charge</span>
                    <strong>{nextChargePreview.result.catalog?.name || nextChargePreview.result.payee}</strong>
                    <small>{formatDate(nextChargePreview.date)} · {formatCurrency(nextChargePreview.amount, nextChargePreview.result.currency || currency)}</small>
                  </div>
                )}
                <div className="hero-aside-foot">
                  <Icon name="shield" size={15} />
                  <span>Statement data never leaves this browser</span>
                </div>
              </div>
            </aside>
          </section>
        ) : (
          <div className="page-heading">
            <div>
              <p className="eyebrow">CleanSub · {allNavigation.find((item) => item.id === activeView)?.label}</p>
              <h1>{copy.title}</h1>
              <p className="page-description">{copy.description}</p>
            </div>
            <div className="page-status"><span className="status-check"><Icon name="check" size={15} /></span><span><strong>Private by default</strong><small>Processed on this device</small></span></div>
          </div>
        )}

        {activeView === 'overview' && (
          <>
            <div className="metrics-grid metrics-grid-three">
              <MetricCard icon="repeat" tone="tone-green" label="Subscriptions found" value={subscriptionItems.length} detail={foundDetail} />
              <MetricCard icon="shield" tone="tone-violet" label="High-confidence matches" value={highConfidence} detail={subscriptionItems.length ? 'Worth reviewing first' : 'Built from repeat patterns'} />
              <MetricCard icon="file" tone="tone-amber" label="Transactions reviewed" value={transactionCount.toLocaleString()} detail={lastImport ? 'Latest: ' + lastImport : 'Your statement stays local'} />
            </div>

            {lastImport && (
              <div className="import-success-strip">
                <span className="success-symbol"><Icon name="check" size={15} /></span>
                <span><strong>Statement reviewed</strong><small>{lastImport} · {transactionCount.toLocaleString()} transactions processed on this device</small></span>
                <button className="text-button" onClick={goToImport}>Import another</button>
              </div>
            )}

            <div className={'content-grid overview-grid' + (subscriptionItems.length ? ' has-import' : '')}>
              <Upload onResult={handleImportResult} />
              {subscriptionItems.length ? (
                <section className="panel upcoming-preview-panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">NEXT 30 DAYS</p>
                      <h2>Upcoming renewals</h2>
                      <p className="panel-subtitle">Predicted from each charge's rhythm — estimates, not bills.</p>
                    </div>
                    <button className="text-button" onClick={() => setActiveView('upcoming')}>View timeline <Icon name="chevron" size={14} /></button>
                  </div>
                  {nextThirty.charges.length ? (
                    <ul className="renewal-preview-list">
                      {nextThirty.charges.slice(0, 3).map((charge, index) => {
                        const result = charge.result;
                        const [day, month] = formatDate(charge.date).split(' ');
                        return (
                          <li className="renewal-preview-item" key={(result.streamKey || result.normalized || result.payee) + charge.date + index}>
                            <span className="renewal-date"><strong>{day}</strong><small>{month}</small></span>
                            <span className="renewal-info">
                              <strong>{result.catalog?.name || result.payee}</strong>
                              <small>{relativeDay(daysUntil(charge.date, today))} · {result.frequency}</small>
                            </span>
                            <span className="renewal-amount">
                              <strong>{formatCurrency(charge.amount, result.currency || currency)}</strong>
                              <small>{result.confidence}</small>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="preview-empty"><Icon name="calendar" size={22} /><span>No predicted renewals in the next 30 days.</span></div>
                  )}
                  <div className="honesty-note"><Icon name="info" size={16} /><span>Dates are projected from past charges. Check the merchant before relying on them.</span></div>
                </section>
              ) : (
                <section className="panel getting-started-panel">
                  <div className="panel-heading">
                    <div><p className="eyebrow">YOUR NEXT STEP</p><h2>Make every charge count</h2></div>
                    <span className="panel-icon"><Icon name="sparkles" size={19} /></span>
                  </div>
                  <p className="muted-copy">CleanSub spots patterns in your transaction history so you can decide which recurring payments are worth keeping.</p>
                  <div className="step-list">
                    <div className={'step-item ' + (transactionCount > 0 ? 'completed' : '')}><span className="step-number">{transactionCount > 0 ? <Icon name="check" size={15} /> : '1'}</span><span><strong>Import a statement</strong><small>CSV, Excel or a text-based PDF from your bank or card provider.</small></span></div>
                    <div className={'step-item ' + (subscriptionItems.length > 0 ? 'completed' : '')}><span className="step-number">{subscriptionItems.length > 0 ? <Icon name="check" size={15} /> : '2'}</span><span><strong>Review detected patterns</strong><small>Keep the matches you recognise and set aside anything that is not a subscription.</small></span></div>
                    <div className="step-item"><span className="step-number">3</span><span><strong>Choose what stays</strong><small>Use each merchant's official settings, and add the renewal dates to your calendar.</small></span></div>
                  </div>
                  <div className="honesty-note"><Icon name="info" size={17} /><span>CleanSub identifies possible recurring charges. It does not cancel subscriptions or access your bank account.</span></div>
                </section>
              )}
            </div>

            <Subscriptions items={allSubscriptionItems} currency={currency} decisions={decisions} onDecide={handleDecide} compact onViewAll={() => setActiveView('subscriptions')} onImport={goToImport} />
          </>
        )}

        {activeView === 'subscriptions' && (
          <>
            <div className="metrics-grid metrics-grid-three">
              <MetricCard icon="repeat" tone="tone-green" label="Detected subscriptions" value={subscriptionItems.length} detail={foundDetail} />
              <MetricCard icon="wallet" tone="tone-blue" label="Estimated monthly total" value={formatTotals(likelyTotals, currency)} detail="High and medium matches; not a bill total" />
              <MetricCard icon="shield" tone="tone-violet" label="High confidence" value={highConfidence} detail="Review these matches first" />
            </div>
            <Subscriptions items={subscriptions} currency={currency} decisions={decisions} onDecide={handleDecide} onImport={goToImport} />
            <div className="bottom-import-cta"><div className="cta-icon"><Icon name="upload" size={20} /></div><div><strong>Have a newer statement?</strong><p>Import an updated statement to refresh your recurring-payment view.</p></div><button className="button button-secondary" onClick={goToImport}>Import statement <Icon name="arrow" size={15} /></button></div>
          </>
        )}

        {activeView === 'upcoming' && (
          <Upcoming subscriptions={visibleList} currency={currency} onImport={goToImport} />
        )}

        {activeView === 'insights' && (
          <Insights subscriptions={subscriptionItems} insights={visibleInsights} currency={currency} onImport={goToImport} />
        )}

        {activeView === 'pricing' && (
          <Pricing onImport={goToImport} />
        )}

        <footer className="page-footer">
          <span>CleanSub <span className="footer-dot">·</span> Built for a clearer view of your money.</span>
          <span><Icon name="shield" size={14} /> Your financial data stays on your device.</span>
        </footer>
      </main>

      <nav className="bottom-nav" aria-label="Main navigation">
        {allNavigation.map((item) => (
          <button
            key={item.id}
            className={'bottom-nav-item' + (activeView === item.id ? ' active' : '')}
            onClick={() => setActiveView(item.id)}
            aria-current={activeView === item.id ? 'page' : undefined}
            aria-label={item.label}
          >
            <span className="bottom-icon">
              <Icon name={item.icon} size={19} />
              {item.id === 'subscriptions' && subscriptionItems.length > 0 && <span className="bottom-badge">{subscriptionItems.length > 99 ? '99+' : subscriptionItems.length}</span>}
            </span>
            <span>{item.short}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
