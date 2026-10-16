# CleanSub

CleanSub is a local-first web app that helps you review possible recurring payments from a bank or card statement.

## Supported file formats

**CSV is the only supported import format in the current MVP.** Excel workbooks, PDF statements, screenshots, and OFX/QFX files are not supported yet.

The recommended next format is **Excel (.xlsx)** because people often download transaction exports from spreadsheets. OFX/QFX can follow as structured financial-data formats. PDF statement extraction should come later because bank layouts differ and scanned PDFs may require OCR.

## Run locally

~~~bash
npm install
npm run dev
~~~

Vite prints the local URL to open in your browser.

## Test and build

~~~bash
npm test
npm run build
npm run preview
~~~

The transaction parser regression tests use Node's built-in test runner.

## Current features

- Import a CSV transaction statement by selecting a file or dragging it into the app.
- Normalize common date, merchant-description, and amount columns in the browser.
- Infer day-first or month-first date order from unambiguous rows; ambiguous dates are flagged.
- Handle debit and credit columns separately when both are provided.
- Identify likely incoming credits/refunds and exclude them from recurring-payment candidates.
- Remove exact duplicate transaction rows and report malformed dates, amounts, and uncertain transaction direction.
- Detect plausible weekly, fortnightly, monthly, every-two-months, quarterly, half-yearly, and yearly patterns.
- Review estimated monthly amounts, occurrence counts, detected cadence, confidence, and the reasons behind a match.
- Search detected merchants and review general safe next steps before attempting to cancel a service.
- Display amounts in USD, NGN, GBP, EUR, or CAD. This changes formatting only; it does not convert exchange rates.
- View summary metrics and insights based on the imported transaction set.

## Privacy notes

- CSV contents are read and processed in the browser. CleanSub does not connect to your bank or upload the statement to a CleanSub server.
- Imported data is kept in app memory for the current session; refreshing the page clears the current results.
- The app's external font request is separate from the transaction import. Before making a strict no-third-party-network-requests promise, remove the external font import and review hosting scripts and dependencies.
- Import statements only on a device you trust, and avoid sharing screenshots that contain account or personal information.

## Important limitations

Recurring-payment detection is heuristic, not a guarantee. Results can include false positives or miss charges when merchants use inconsistent descriptions, amounts, or billing intervals. Positive values in a generic Amount column may not reveal whether a transaction is a debit or credit; those rows are marked as unclear and cannot receive high confidence without other evidence. Numeric dates such as 01/02/2026 are ambiguous when the file does not establish its date convention; CleanSub defaults to day-first and flags those dates.

Estimated monthly values are approximations, not confirmed future bills. Cancellation guidance is general and does not cancel subscriptions for you. Validate results against the original statement before making financial decisions.
