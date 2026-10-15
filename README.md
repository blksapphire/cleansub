# CleanSub

CleanSub is a local-first web app that helps you review possible recurring payments from a bank or card statement exported as CSV.

## Run locally

~~~bash
npm install
npm run dev
~~~

Vite prints the local URL to open in your browser. To check the production build, run:

~~~bash
npm run build
npm run preview
~~~

## Current features

- Import a CSV transaction statement by selecting a file or dragging it into the app.
- Parse common transaction columns in the browser using Papa Parse.
- Detect possible recurring payments using merchant, date-interval, and amount patterns.
- Review estimated monthly amounts, observed intervals, occurrence counts, and match confidence.
- Search detected merchants and view general safe next steps before attempting to cancel a service.
- Display amounts in USD, NGN, GBP, EUR, or CAD.
- View summary metrics and insights based on the imported transaction set.

## Privacy notes

- CSV contents are read and processed in the browser. CleanSub does not connect to your bank or upload the statement to a CleanSub server.
- Imported data is kept in the app's in-memory state for the current session; refreshing the page clears the current results.
- Import statements only on a device you trust, and avoid sharing screenshots that contain account or personal information.

## Important limitations

Recurring-payment detection is heuristic. Results can include false positives or miss charges when merchants use inconsistent descriptions, amounts, or billing intervals. Estimated monthly values are approximations, not a record of confirmed future bills. The display-currency selector changes formatting only; it does not convert exchange rates. Cancellation guidance is general and does not cancel a subscription for you.

This is an early-stage project. Validate results against the source statement before making financial decisions.
