# Free vs Pro: where the paywall can actually hold

**Principle:** anything that runs in the browser can be bypassed, so don't charge for it. Charge for things that need a server, and make those the opt-in, minimal-data part of the product. The statement itself never leaves the device.

## Free (local, no account)

Import (CSV, XLSX, PDF), recurring detection, confidence, price-change flags for the imported statement, trial flags, overlap flags, catalog links, upcoming-charges list, `.ics` export.

Why free: it is unenforceable anyway, and it is the trust and acquisition engine. "Your statement never leaves your device" is the pitch; keep it literally true for everything here.

## Pro (server-authorized, opt-in)

| Feature | What leaves the device | What the server stores | Enforced by |
| --- | --- | --- | --- |
| **Price and renewal alerts by email** ("Netflix goes up on the 10th, +12%") | A *watchlist* the user ticks: merchant label, cadence, last amount, currency, next date. No transaction rows, no account or statement data. | The watchlist, email, subscription status. | Server checks the entitlement before storing or sending. |
| **Encrypted history and sync** (across devices and across statements) | One blob, encrypted in the browser with a key derived from the user's passphrase. | The ciphertext and its size. It cannot read it. Lost passphrase = lost data, and the UI must say so. | Server refuses blob read/write without an active entitlement. |
| **"What changed since last import"** | Nothing extra. Computed locally from the decrypted history. | Nothing extra. | Gated because the history lives behind sync. |

Rules for every Pro feature:
1. Opt-in per feature, with the exact fields shown before anything is sent.
2. One-click delete of everything stored, and a documented retention period.
3. Never upload transaction rows or raw statements.

## Pricing (opinion, test it before building)

- Offer **monthly + annual** (annual discounted). Quarterly-only is an unusual, high-friction offer for a tool people use occasionally.
- Selling a subscription to a subscription-finder invites an obvious objection. Make the recurring value concrete (alerts and history), not "unlock the detector".
- Before any billing code: a pricing page or waitlist to see whether anyone clicks, and confirm provider eligibility and payout for Nigeria against the provider's *current* docs.

## Entitlement model (when built)

- The provider's signed webhook is the only thing that grants, renews or revokes access. A success URL never unlocks anything.
- Server stores `status`, `current_period_end`, `cancel_at_period_end`. Every Pro endpoint re-checks it; the browser's `isPro` flag is display-only.
- Webhook handler verifies the HMAC over the raw body and is idempotent per event ID.
- Cancel keeps access to period end; failed renewal gets a defined grace period.

## CSP: what has to change, and when

`vercel.json` is deliberately strict today (`connect-src 'self'`) because nothing talks to a server yet. Loosening it early weakens the guarantee for no benefit. When Supabase lands, change only:

```
connect-src 'self' https://<your-project-ref>.supabase.co
```

and, if you use Supabase Realtime, also `wss://<your-project-ref>.supabase.co`.

For checkout, **redirect** to the provider's hosted checkout URL (`window.location.assign(url)`). A redirect needs no CSP change. Do not use an overlay/embedded checkout script: it would require adding the provider's script and frame origins to `script-src` and `frame-src`, which is a much bigger hole. (Check the provider's current docs before relying on this.)

## Privacy copy

- Today (accurate now): statements are processed in your browser; the page is configured to talk to no other site.
- When Pro ships, replace with: "Analysis runs on your device. If you turn on Pro features, only the fields you approve are sent; your statement never is."
- Keep the CSP header and the no-network test (`src/lib/privacy.test.js`) as the evidence behind that sentence.
