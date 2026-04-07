# Debugging

## Addon debug
1. Open the popup.
2. Enable "Debug" toggle.
3. Run Scrape All.
4. Click "Copy debug TSV" and paste into issue/chat.

Debug events are stored in `browser.storage.local.debugEvents` (last 20 events).

## Apps Script logs
- Open Apps Script editor -> Executions / Logs.
- WebApp returns JSON errors in addon UI if available.

## Typical errors
- "No detail scraper registered": content-job.js loaded without sources.
- "WebApp invalid JSON": WebApp URL or deployment issue.
- "header validation failed": Stage/NewJobs header mismatched `ExpectedHeader`.

## Repro checklist
- Confirm ScrapeSources enabled for the source id.
- Confirm ScrapeList row has correct ScrapePageId and URL.
- Confirm addon is updated (reload XPI).
- Confirm WebApp URL is current in Settings.

