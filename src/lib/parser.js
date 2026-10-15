// simple transaction normalizer + recurring detection
// expects parsed CSV rows: objects with at least { Date, Description, Amount } or similar
export function parseTransactions(rows) {
  // normalizing heuristics - try several common column names
  return rows.map(r => {
    const date = r.Date || r.date || r['Transaction Date'] || r['Posted Date'] || '';
    const payee = r.Description || r.Memo || r.Payee || r['Transaction Description'] || '';
    const amount = r.Amount || r['Amount'] || r['Debit'] || r['Credit'] || r.Amount || '';
    if (!payee) throw new Error('Missing payee column - try a different CSV export format.');
    return { date: date.trim(), payee: payee.trim(), amount: parseFloat(String(amount).replace(/[^0-9.-]/g,'')) || 0 };
  }).filter(Boolean);
}

function normalizePayee(p) {
  return p.toLowerCase().replace(/[\W_]+/g,' ').replace(/\s{2,}/g,' ').trim()
}

function median(arr){
  const a = arr.slice().sort((x,y)=>x-y);
  const m = Math.floor(a.length/2);
  return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}

export function detectRecurring(transactions) {
  // group by normalized payee
  const groups = {};
  for (const t of transactions) {
    const key = normalizePayee(t.payee);
    groups[key] = groups[key] || [];
    groups[key].push(t);
  }
  const results = [];
  for (const k of Object.keys(groups)) {
    const arr = groups[k].slice().sort((a,b)=> new Date(a.date) - new Date(b.date));
    if (arr.length < 3) continue;
    // compute days between occurrences
    const diffs = [];
    for (let i=1;i<arr.length;i++){
      const d0 = new Date(arr[i-1].date), d1 = new Date(arr[i].date);
      const days = Math.round((d1 - d0) / (1000*60*60*24));
      diffs.push(days);
    }
    const med = median(diffs);
    // heuristic: median interval ~ 28-34 days or 7/14/30 multiples or consistent
    const isRegular = med >= 25 && med <= 35 || med >= 28 && med <= 32 || (med >=6 && med <=9) || (med >=13 && med <=16);
    const sameAmount = arr.every(t => Math.abs(t.amount - arr[0].amount) < 0.01);
    const confidence = (isRegular && sameAmount) ? 'High' : (isRegular || sameAmount) ? 'Medium' : 'Low';
    const monthlyEstimate = Math.abs(arr.reduce((s,x)=>s + x.amount,0) / (arr.length) * (30/med || 1));
    results.push({
      payee: arr[0].payee,
      normalized: k,
      count: arr.length,
      intervals: diffs,
      medianIntervalDays: med,
      estimatedMonthly: Math.abs(monthlyEstimate),
      confidence
    });
  }
  // sort high-to-low confidence then by amount
  results.sort((a,b)=> (b.confidence.localeCompare(a.confidence) || b.estimatedMonthly - a.estimatedMonthly));
  return results;
}
