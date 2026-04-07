# Apps Script Index

- WebApp.gs: doGet/doPost endpoints for addon integration, LRate lease persistence, addon autofill profile sync, and Telegram `2Apply` notifications.
- IncrementLoader.gs: Stage -> NewJobs load with de-dup + LoadsLog.
- RowMover.gs: move 2Delete/old rows to DeletedJobs/JobsHist.
- SimpleRater.gs: title regex rating (2Delete/2MARate).
- MediumRater.gs: Medium ARate/BRate/CRate pipeline (`2MARate` -> `2MBrate` -> `2MCRate` -> `2LRate`/`2Delete`).
- Settings.gs: read Settings sheet values.
- ScrapeSources.gs: ScrapeSources sheet helpers/validation.
- ScrapeLog.gs: append debug events to ScrapeLog sheet.
- Utils.gs: helpers (LoadsLog, URL normalization, job key, etc).
- StageValidator.gs: header validation and stage checks.
- DataFunnel.gs: status updates for ScrapePageName pipeline.
- Code.gs: menu bindings and UI entry points.
