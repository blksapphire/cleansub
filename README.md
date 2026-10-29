# CleanSub

CleanSub is a local-first web app that finds recurring payments in a bank or card statement, flags price rises and trial conversions, predicts the next charge, and links to each merchant's own account page. It never connects to your bank and never uploads your statement.

## Supported file formats

| Format | Notes |
| --- | --- |
| **CSV** | Auto-detects delimiter (comma, semicolon, tab, pipe), skips account-info lines above the header, decodes UTF-8 or Windows-1252. |
| **Excel (.xlsx)** | Picks the sheet that looks like transactions; header row may sit below a preamble. Old `.xls` is not supported - save as `.xlsx`. |
| **PDF** | Text-based statements only. Rebuilds rows from text positions, assigning Debit/Credit by column. Best-effort: bank layouts differ, so check the preview. Scanned PDFs (no selectable text) are rejected with a clear message; OCR is not supported. |

OFX/QFX and screenshots are not supported.

## What it does

- **Recurring detection** for weekly, fortnightly, monthly, every-two-months, quarterly, half-yearly and yearly cycles. Tolerates a missed billing cycle, treats one merchant billing several plans (Apple, Google Play, PayPal) as separate streams, and ignores per-transaction reference codes and processor prefixes such as `PAYPAL *`.
- **Subscriptions vs transfers**: each repeat is classed as a subscription, a transfer to a person, a bank fee/levy, or another recurring charge. Narrations such as `TRANSFER TO NAME BANK *****123/TRF`, `MOB/UTO`, `Value Added Tax` and airtime are recognised, so recurring transfers and fees never inflate the subscription count or spend total. All kinds remain viewable behind filter chips.
- **Curation**: mark a match as kept, or set it aside as not a subscription. Set-aside charges drop out of totals, insights and upcoming charges, and can be restored from the same page. Choices apply to the current import and reset when you import a new statement.
- **Possible matches**: two identical charges a long cycle apart are shown as "Possible", kept out of the headline total.
- **Price movement**: a one-off rise or fall is a *step*; a gradual one-way move is *drift* (price creep, or the exchange rate on a foreign-currency charge).
- **Next-charge prediction** and an **.ics calendar export** (recurring all-day events with a reminder the day before). Built on your device.
- **Trial-to-paid detection**: a small first charge followed by a much larger one 3-40 days later.
- **Overlap flags** (e.g. two video-streaming services) and a static, offline **merchant catalog** with links to official account/billing pages.
- **Direction handling**: debit/credit columns, `DR`/`CR` suffixes, whole-value Type columns, amount sign, and a file-level sign pattern. If every amount is positive, the app asks whether positives are spending or income rather than guessing.
- **Currency**: read from a Currency column, a `Currency: NGN` line above the header, or amount symbols (₦, £, €, $). Different currencies are never added together.
- **Duplicates** are flagged, never dropped; a flagged row is counted once for recurrence detection.
- Parsing runs in a Web Worker so large files do not freeze the page.
- **Plans page**: a static Free vs planned-Pro comparison. Pro is not priced, sold or connected to any server; see [docs/free-vs-pro.md](docs/free-vs-pro.md).

## Interface

The app uses a single dark theme (midnight navy with a mint accent); there is no light mode. On phones the five main views sit in a fixed bottom tab bar, and the subscriptions table becomes a card list so Keep, Set aside and Guide stay on screen. Larger screens use the sticky top navigation.

## Run locally

Requires Node 20 or newer.

~~~bash
npm install
npm run dev
~~~

## Test and build

~~~bash
npm test
npm run build
npm run preview
~~~

Tests use Node's built-in runner. Fixtures in `tests/fixtures` are a small `.xlsx` and a two-page `.pdf` statement.

## Privacy

- Files are read and analysed in the browser. Nothing is uploaded to a CleanSub server.
- Fonts are bundled (no Google Fonts request).
- `vercel.json` sets a Content-Security-Policy that limits the page to its own origin (`connect-src 'self'`, no third-party scripts, frames or form posts), so the app cannot send your data to another site.
- Imported data lives in memory for the session; refreshing clears it.
- Merchant links open only when you click them.
- `src/lib/privacy.test.js` fails the build if the analysis code gains any network primitive (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`...), or if the CSP is loosened by accident.
- Planned paid features (alerts, encrypted sync) are opt-in and never send the statement; see [docs/free-vs-pro.md](docs/free-vs-pro.md) for the boundary and the exact CSP change billing will need.
- Import statements only on a device you trust, and avoid sharing screenshots that contain account details.

## Important limitations

Detection is heuristic, not a guarantee. Results can include false positives or miss charges when merchants use inconsistent descriptions, amounts or billing intervals. Predicted dates and amounts are estimates, not confirmed bills. PDF extraction depends on the bank's layout. Catalog links point to merchants' own sites and can go stale. CleanSub does not cancel anything for you. Check results against the original statement before making financial decisions.
