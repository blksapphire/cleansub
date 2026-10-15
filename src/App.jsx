import React, { useMemo, useState } from 'react';
import Icon from './Icon';
import Upload from './pages/Upload';
import Subscriptions from './pages/Subscriptions';

const navigation = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'repeat' },
  { id: 'insights', label: 'Spending insights', icon: 'chart' },
];

const viewCopy = {
  overview: {
    title: 'Your money, at a glance.',
    description: 'A calmer, clearer picture of the recurring charges in your life.',
  },
  subscriptions: {
    title: 'Your subscriptions.',
    description: 'Review recurring payments and decide what deserves a place in your budget.',
  },
  insights: {
    title: 'Know where it goes.',
    description: 'Simple insights built from the transactions you choose to import.',
  },
};

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(amount) || 0);
  } catch {
    return String(Number(amount) || 0);
  }
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

function InsightsView({ subscriptions, currency, onImport }) {
  const total = subscriptions.length;
  const high = subscriptions.filter((item) => item.confidence === 'High').length;
  const medium = subscriptions.filter((item) => item.confidence === 'Medium').length;
  const low = subscriptions.filter((item) => item.confidence === 'Low').length;
  const sorted = subscriptions.slice().sort((a, b) => b.estimatedMonthly - a.estimatedMonthly).slice(0, 5);
  const monthlyTotal = subscriptions.reduce((sum, item) => sum + (Number(item.estimatedMonthly) || 0), 0);
  const highest = sorted[0];

  if (!total) {
    return (
      <section className="empty-insights panel">
        <div className="empty-illustration"><Icon name="chart" size={28} /></div>
        <h2>Your insights will show up here</h2>
        <p>Import a transaction CSV to see recurring charges, monthly estimates, and match confidence.</p>
        <button className="button button-primary" onClick={onImport}><Icon name="upload" size={17} /> Import a statement</button>
      </section>
    );
  }

  return (
    <div className="insights-layout">
      <section className="panel insight-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">AT A GLANCE</p><h2>Recurring spend estimate</h2></div>
          <span className="panel-icon"><Icon name="wallet" size={19} /></span>
        </div>
        <p className="insight-total">{formatCurrency(monthlyTotal, currency)}<span>/mo</span></p>
        <p className="muted-copy">Based on the recurring patterns found in your imported statement. Estimates are not confirmed bills.</p>
        <div className="insight-divider" />
        <div className="small-stat-list">
          <div><span>Subscriptions detected</span><strong>{total}</strong></div>
          <div><span>Highest estimated monthly charge</span><strong>{formatCurrency(highest ? highest.estimatedMonthly : 0, currency)}</strong></div>
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
        </div>
      </section>

      <section className="panel insight-panel spending-breakdown">
        <div className="panel-heading">
          <div><p className="eyebrow">TOP RECURRING CHARGES</p><h2>Where the money goes</h2></div>
          <span className="panel-icon"><Icon name="chart" size={19} /></span>
        </div>
        <div className="spending-list">
          {sorted.map((item, index) => {
            const share = monthlyTotal > 0 ? Math.max((item.estimatedMonthly / monthlyTotal) * 100, 0) : 0;
            return (
              <div className="spending-item" key={item.normalized || item.payee || index}>
                <div className="spending-item-top">
                  <div className="merchant-avatar">{(item.payee || '?').trim().charAt(0).toUpperCase()}</div>
                  <div className="spending-name"><strong>{item.payee}</strong><span>{Math.round(share)}% of detected spend</span></div>
                  <strong className="spending-amount">{formatCurrency(item.estimatedMonthly, currency)}</strong>
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

export default function App() {
  const [activeView, setActiveView] = useState('overview');
  const [subscriptions, setSubscriptions] = useState([]);
  const [transactionCount, setTransactionCount] = useState(0);
  const [lastImport, setLastImport] = useState('');
  const [currency, setCurrency] = useState('USD');

  const monthlyTotal = useMemo(
    () => subscriptions.reduce((sum, item) => sum + (Number(item.estimatedMonthly) || 0), 0),
    [subscriptions]
  );
  const highConfidence = subscriptions.filter((item) => item.confidence === 'High').length;
  const copy = viewCopy[activeView];

  function handleImportResult(result) {
    setSubscriptions(result.subscriptions || []);
    setTransactionCount(result.transactionCount || 0);
    setLastImport(result.fileName || '');
  }

  function goToImport() {
    setActiveView('overview');
    window.setTimeout(() => {
      document.getElementById('import-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
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
          {navigation.map((item) => (
            <button
              key={item.id}
              className={'nav-item ' + (activeView === item.id ? 'active' : '')}
              onClick={() => setActiveView(item.id)}
              aria-current={activeView === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.id === 'subscriptions' && subscriptions.length > 0 && <span className="nav-count">{subscriptions.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="privacy-card">
          <span className="privacy-icon"><Icon name="shield" size={18} /></span>
          <div>
            <strong>Your data stays yours</strong>
            <p>Statements are processed in your browser, not uploaded to a server.</p>
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
          <div className="breadcrumbs"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{navigation.find((item) => item.id === activeView)?.label || 'Overview'}</strong></div>
          <div className="topbar-actions">
            <label className="currency-select">
              <span>Display currency</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value)} aria-label="Display currency">
                <option value="USD">USD · $</option>
                <option value="NGN">NGN · ₦</option>
                <option value="GBP">GBP · £</option>
                <option value="EUR">EUR · €</option>
                <option value="CAD">CAD · C$</option>
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
                <MetricCard icon="repeat" tone="tone-green" label="Estimated monthly recurring" value={formatCurrency(monthlyTotal, currency)} detail={subscriptions.length ? 'Across detected patterns' : 'Import a statement to begin'} />
                <MetricCard icon="card" tone="tone-blue" label="Subscriptions found" value={subscriptions.length} detail={subscriptions.length ? 'Potential recurring merchants' : 'Nothing tracked yet'} />
                <MetricCard icon="shield" tone="tone-violet" label="High-confidence matches" value={highConfidence} detail={subscriptions.length ? 'Worth reviewing first' : 'Built from repeat patterns'} />
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
                    <div className={'step-item ' + (transactionCount > 0 ? 'completed' : '')}><span className="step-number">{transactionCount > 0 ? <Icon name="check" size={15} /> : '1'}</span><span><strong>Import a CSV statement</strong><small>Export transactions from your bank or card provider.</small></span></div>
                    <div className={'step-item ' + (subscriptions.length > 0 ? 'completed' : '')}><span className="step-number">{subscriptions.length > 0 ? <Icon name="check" size={15} /> : '2'}</span><span><strong>Review detected patterns</strong><small>Check confidence and estimated monthly costs.</small></span></div>
                    <div className="step-item"><span className="step-number">3</span><span><strong>Choose what stays</strong><small>Use each merchant's official settings to manage a plan.</small></span></div>
                  </div>
                  <div className="honesty-note"><Icon name="info" size={17} /><span>CleanSub identifies possible recurring charges. It does not cancel subscriptions or access your bank account.</span></div>
                </section>
              </div>

              <Subscriptions items={subscriptions} currency={currency} compact onViewAll={() => setActiveView('subscriptions')} />
            </>
          )}

          {activeView === 'subscriptions' && (
            <>
              <div className="metrics-grid metrics-grid-three">
                <MetricCard icon="repeat" tone="tone-green" label="Detected subscriptions" value={subscriptions.length} detail="Potential recurring merchants" />
                <MetricCard icon="wallet" tone="tone-blue" label="Estimated monthly total" value={formatCurrency(monthlyTotal, currency)} detail="An estimate, not a bill total" />
                <MetricCard icon="shield" tone="tone-violet" label="High confidence" value={highConfidence} detail="Review these matches first" />
              </div>
              <Subscriptions items={subscriptions} currency={currency} />
              <div className="bottom-import-cta"><div className="cta-icon"><Icon name="upload" size={20} /></div><div><strong>Have a newer statement?</strong><p>Import an updated CSV to refresh your recurring-payment view.</p></div><button className="button button-secondary" onClick={goToImport}>Import statement <Icon name="arrow" size={15} /></button></div>
            </>
          )}

          {activeView === 'insights' && (
            <InsightsView subscriptions={subscriptions} currency={currency} onImport={goToImport} />
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
