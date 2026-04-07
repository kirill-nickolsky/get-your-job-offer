# Firefox Addon Index

- background.js: orchestrates scraping, enrichment, WebApp calls, progress.
- content-list.js: list-page scraper; calls source.scrapeList.
- content-job.js: detail-page scraper; calls source.scrapeDetail.
- popup.html / popup.js: UI for scrape, debug, source selection.
- sources/: per-site scrapers (list + detail).
- utils/: shared helpers (normalize, parse, debug, DOM helpers).
- manifest.json: addon manifest and content script matches.
- build*.sh / build*.py / build.js: build the XPI.
- dist/: built XPI output.

