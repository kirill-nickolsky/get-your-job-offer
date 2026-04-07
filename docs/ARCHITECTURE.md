# Architecture

## Overview
get-your-offer is a hybrid system with three runtime parts:
- Firefox addon: scrapes job lists and details from source sites.
- Google Apps Script: receives scraped jobs and moves them through sheets.
- Optional Cloud Run backend: plans scrape leases, ingests results, runs task pipeline, and serves Telegram bot / Mini App flows.

The design goal is a stable data contract between addon, Cloud Run, and Apps Script, with
source-specific logic isolated in `firefox-addon/sources/`.

## Data Flow (Direct GAS mode)
1. User runs Scrape All in the addon popup.
2. `background.js` orchestrates per-source scraping.
3. `content-list.js` runs on a list URL, finds a source module, and returns jobs.
4. `background.js` sends jobs to Apps Script WebApp `doPost` (action=appendStage).
5. Apps Script writes rows into `Stage` (Status=Staged).
6. User runs `incrementLoad()` to move Approved rows to `NewJobs`.
7. SimpleRate/Medium ARate/BRate/CRate set statuses for review or delete (`2MARate -> 2MBrate -> 2MCRate -> 2LRate/2Delete`).
8. Addon `LRate` processes `2LRate` rows via ChatGPT, updates row fields/status through WebApp.
9. RowMover moves old/2Delete rows into `JobsHist`/`DeletedJobs`.

## Data Flow (Cloud mode)
1. Addon polls Cloud Run `/scrape-plan` using `CloudBackendUrl`, `CloudBackendToken`, and `browser.alarms`.
2. Cloud planner leases sources from Firestore `source_configs`, using priority / retry / interval settings synced from GAS `ScrapeSources`.
3. Addon scrapes list pages and posts run results to Cloud Run `/scrape-result`.
4. Cloud ingest stores jobs and scrape runs in Firestore, then enqueues `normalize -> enrich -> rate`.
5. Cloud `notify` sends Telegram alerts for good jobs; `sync-sheets` pushes new rows and status changes back to GAS.
6. Telegram webhook and Mini App read the same Firestore state and can mark jobs `Applied` / `2Delete` / `2Apply`.
7. Apps Script remains the source of sheet-based workflow, while Cloud Run becomes the orchestrator for planner/bot/async pipeline.

## Components

### Firefox Addon
- `background.js`: orchestrates scraping, progress tracking, WebApp calls, and LRate chat recovery.
- `content-list.js`: runs on list pages; chooses source and scrapes list data.
- `content-job.js`: runs on detail pages; scrapes a single job detail.
- `sources/*.js`: per-site scrapers (list + detail) implementing the same API.
- `utils/*.js`: shared helpers (normalize/parse/dom/debug).
- `popup.js`/`popup.html`: UI for scraping, source selection, debug toggles.

### Apps Script
- `WebApp.gs`: HTTP endpoint for addon, validation, duplicate filtering, and LRate row/settings updates.
- `IncrementLoader.gs`: moves Approved Stage rows to NewJobs with de-dup.
- `RowMover.gs`: moves 2Delete/old rows to DeletedJobs/JobsHist.
- `SimpleRater.gs`/`MediumRater.gs`: rate jobs and update status columns.
- `Settings.gs`: reads Settings sheet values and parsing helpers.
- `ScrapeSources.gs`: reads ScrapeSources sheet and validates source ids.
- `ScrapeLog.gs`: appends addon events to ScrapeLog sheet.
- `Utils.gs`: shared helpers like URL normalization and LoadsLog.

### Cloud Run
- `cloud/src/index.ts`: Express app wiring.
- `cloud/src/routes/*`: HTTP routes for planner, ingest, tasks, Telegram bot, session, stats, and mini app.
- `cloud/src/services/planner.ts`: scrape lease planner based on Firestore `source_configs`.
- `cloud/src/services/ingest.ts`: stores scrape runs/jobs and enqueues downstream tasks.
- `cloud/src/services/normalize.ts` / `enrich.ts` / `rate.ts` / `notify.ts`: async pipeline stages.
- `cloud/src/services/sync-sheets.ts`: pushes Stage rows and job-state updates back into GAS WebApp.
- `cloud/src/services/bot.ts` / `telegram-client.ts` / `session.ts`: Telegram bot, fake local session, Mini App actions.
- `cloud/src/firestore.ts`: Firestore adapter with memory fallback for local mode.

### Infra / Deploy
- `cloudbuild.yaml`: Cloud Build deploy step for Cloud Run.
- `infra/terraform/*.tf`: queues, secrets, indexes, BigQuery, scheduler jobs, runtime service account.

## Sheets
- `Stage`: raw jobs from addon (Status=Staged).
- `NewJobs`: current jobs for review/rating.
- `JobsHist`: historical archive.
- `DeletedJobs`: rejected jobs.
- `LoadsLog`: audit of `incrementLoad()` runs.
- `ScrapeSources`: list of allowed sources plus cloud planner fields (`Priority`, retry/backoff, `DailySuccessCap`, `ScrapePageUrl`, `MaxTabsPerSite`).
- `ScrapeLog`: debug events from addon.
- `Settings`: key-value settings used by Apps Script.

## Key Contracts
- `Job` object fields must align to `ExpectedHeader`.
- `ScrapeProgress` stored in addon local storage to drive popup updates.
- `ScrapeSource` interface: `id`, `name`, `match()`, `scrapeList()`, `scrapeDetail()`.
