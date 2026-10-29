import React, { useMemo, useState } from 'react';
import Icon from './Icon';
import Upload from './pages/Upload';
import Subscriptions from './pages/Subscriptions';
import Upcoming from './pages/Upcoming';
import Insights from './pages/Insights';
import Pricing from './pages/Pricing';
import { formatTotals, isValidCurrency } from './lib/format';
import { totalsByCurrency, isLikely, isSubscription } from './lib/insights';
import { visibleItems, filterInsights, toggleDecision } from './lib/curate';

const navigation = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'repeat' },
  { id: 'upcoming', label: 'Upcoming charges', icon: 'calendar' },
  { id: 'insights', label: 'Spending insights', icon: 'chart' },
];

const plansNavigation = [
  { id: 'pricing', label: 'Plans & Pro', icon: 'wallet' },
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
  const currencyOptions = useMemo(() => {
    const base = ['USD', 'NGN', 'GBP', 'EUR', 'CAD'];
    return detectedCurrency && !base.includes(detectedCurrency) && isValidCurrency(detectedCurrency)
      ? [...base, detectedCurrency]
      : base;
  }, [detectedCurrency]);

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

  function navItem(item) {
    return (
      <button
        key={item.id}
        className={'nav-item ' + (activeView === item.id ? 'active' : '')}
        onClick={() => setActiveView(item.id)}
        aria-current={activeView === item.id ? 'page' : undefined}
      >
        <Icon name={item.icon} size={18} />
        <span>{item.label}</span>
        {item.id === 'subscriptions' && subscriptionItems.length > 0 && <span className="nav-count">{subscriptionItems.length}</span>}
      </button>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setActiveView('overview'); }}>
          <span className="brand-mark"><Icon name="sparkles" size={21} strokeWidth={2} /></span>
          <span className="brand-name">cleansub<span>.</span></span>
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <p className="nav-caption">YOUR MONEY</p>
          {navigation.map(navItem)}
          <p className="nav-caption nav-caption-group">CLEANSUB</p>
          {plansNavigation.map(navItem)}
        </nav>

        <div className="sidebar-spacer" />
        <div className="privacy-card">
          <span className="privacy-icon"><Icon name="shield" size={18} /></span>
          <div>
            <strong>Your data stays yours</strong>
            <p>Statements are processed in your browser. The page is configured to talk to no other site.</p>
          </div>
          <span className="privacy-status"><span /> Local-only</span>
        </div>
        <div className="sidebar-footer">
          <div className="workspace-avatar">C</div>
          <div className="footer-user"><strong>Personal workspace</strong><span>Private by design</span></div>
          <span className="local-indicator" title="Local-first app"><span /></span>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{allNavigation.find((item) => item.id === activeView)?.label || 'Overview'}</strong></div>
          <div className="topbar-actions">
            <label className="currency-select">
              <span>Currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Display currency">
                {currencyOptions.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>
            <button className="button button-primary top-import" onClick={goToImport}><Icon name="upload" size={17} /><span>Import statement</span></button>
          </div>
        </header>

        <main className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">A LITTLE MORE FINANCIAL CLARITY</p>
              <h1>{copy.title}</h1>
              <p className="page-description">{copy.description}</p>
            </div>
            <div className="page-status"><span className="status-check"><Icon name="check" size={15} /></span><span><strong>Private by default</strong><small>Processed on this device</small></span></div>
          </div>

          {activeView === 'overview' && (
            <>
              <div className="metrics-grid">
                <MetricCard icon="repeat" tone="tone-green" label="Estimated monthly recurring" value={formatTotals(likelyTotals, currency)} detail={subscriptionItems.length ? 'Subscriptions only; likely matches' : 'Import a statement to begin'} />
                <MetricCard icon="card" tone="tone-blue" label="Subscriptions found" value={subscriptionItems.length} detail={foundDetail} />
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

              <div className="content-grid overview-grid">
                <Upload onResult={handleImportResult} />
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
      </div>
    </div>
  );
}
