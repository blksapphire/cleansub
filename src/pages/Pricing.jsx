import React from 'react';
import Icon from '../Icon';

const freeFeatures = [
  'Import CSV, Excel or text-based PDF statements',
  'Find recurring subscriptions, transfers and fees',
  'Keep or set aside every detected match',
  'Upcoming-charge estimates and .ics calendar export',
  'Price-change, trial and overlap insights',
  'No account and no upload: everything runs here'
];

const proFeatures = [
  {
    icon: 'alert',
    title: 'Price and renewal alerts',
    body: 'An email when a tracked charge is due to renew or its amount changes.'
  },
  {
    icon: 'shield',
    title: 'Encrypted history and sync',
    body: 'Carry your watchlist across devices and statements, encrypted before it leaves the browser.'
  },
  {
    icon: 'trend',
    title: 'What changed since your last import',
    body: 'New, cancelled and repriced charges after each statement.'
  }
];

export default function Pricing({ onImport }) {
  return (
    <div className="pricing-layout">
      <section className="panel price-card">
        <div className="price-head">
          <div>
            <p className="eyebrow">FREE</p>
            <h2>Everything on this device</h2>
          </div>
          <span className="plan-badge free">Available now</span>
        </div>
        <p className="price-amount">$0<span>forever</span></p>
        <p className="muted-copy">No account, no card. Detection, curation and the calendar stay free because they run in your browser.</p>
        <ul className="price-list">
          {freeFeatures.map((feature) => (
            <li key={feature}><Icon name="check" size={16} /><span>{feature}</span></li>
          ))}
        </ul>
        <button className="button button-primary price-cta" onClick={onImport}><Icon name="upload" size={17} /> Import a statement</button>
      </section>

      <section className="panel price-card pro">
        <div className="price-head">
          <div>
            <p className="eyebrow">PRO</p>
            <h2>Alerts and history, when you choose</h2>
          </div>
          <span className="plan-badge planned">Planned</span>
        </div>
        <p className="price-amount">TBA<span>monthly + annual</span></p>
        <p className="muted-copy">Pricing is not set. Before building billing, the goal is to learn whether these features are worth paying for.</p>
        <ul className="price-list pro-list">
          {proFeatures.map((feature) => (
            <li key={feature.title}>
              <span className="price-list-icon"><Icon name={feature.icon} size={16} /></span>
              <span><strong>{feature.title}</strong><small>{feature.body}</small></span>
            </li>
          ))}
        </ul>
        <div className="honesty-note">
          <Icon name="shield" size={17} />
          <span>Pro would be opt-in per feature. If it ships, only the fields shown before you enable it would leave the device; your statement never would. No billing code or waitlist is connected yet.</span>
        </div>
      </section>

      <section className="panel price-principles">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">THE BOUNDARY</p>
            <h2>What stays free, and what would leave</h2>
          </div>
          <span className="panel-icon"><Icon name="layers" size={19} /></span>
        </div>
        <div className="principle-grid">
          <div><strong>Free stays complete</strong><p>One statement, full detection, curation, insights and calendar. Nothing that runs locally is held back.</p></div>
          <div><strong>Only a small watchlist could leave</strong><p>Merchant label, cadence, last amount, currency and next date. Never transaction rows or raw statements.</p></div>
          <div><strong>Delete, don't hoard</strong><p>Any future Pro data would be one-click deletable, with a documented retention period and no dark patterns.</p></div>
        </div>
      </section>
    </div>
  );
}
