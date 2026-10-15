import React, { useState } from 'react';
import Upload from './pages/Upload';
import Subscriptions from './pages/Subscriptions';

export default function App() {
  const [subscriptions, setSubscriptions] = useState([]);
  return (
    <div className="app">
      <header>
        <h1>CleanSub</h1>
        <p>Find recurring charges from a CSV export (local only)</p>
      </header>
      <main>
        <Upload onResult={setSubscriptions} />
        <Subscriptions items={subscriptions} />
      </main>
    </div>
  );
}
