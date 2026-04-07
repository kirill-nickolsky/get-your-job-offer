# Sources

This file summarizes the current scraper sources. For exact selectors and
parsing logic, see `firefox-addon/sources/<id>.js`.

A machine-generated list is available at `docs/SOURCES.generated.md`.

## Source Table (manual notes)

| id | name | match(url) | list scraping | detail scraping | notes |
| --- | --- | --- | --- | --- | --- |
| getonbrd | Get on Board | `getonbrd.com` | list cards on `/myjobs` | job detail page `/jobs/*` | list page may be dynamic; fixtures can be empty |
| gallito | Gallito | `trabajo.gallito.com.uy` | listing cards on `/buscar/*` | job detail page `/anuncio/*` | server-rendered Uruguay board |
| hh | HeadHunter | `hh.ru` / `headhunter.ge` | search list cards | vacancy page `/vacancy/*` | Russian date text, modality parsing |
| habr | Habr Career | `career.habr.com/vacancies` | list items on search page + pagination via `page`/`Next` | vacancy detail page | qid parameter controls seniority |
| lever | Lever | `jobs.lever.co/dlocal` | Lever postings list | Lever posting detail | stable static HTML |
| computrabajo | Computrabajo | `computrabajo.com` | listing cards | job detail page | multiple domains/paths |
| linkedin | LinkedIn | `linkedin.com/jobs` | list rail + pagination | job detail page `/jobs/view/*` | list uses job IDs embedded in HTML |
| wellfound | Wellfound | `wellfound.com/jobs` | infinite scroll list | company job detail page | list uses infinite scroll; fallback to __NEXT_DATA__ |
| jobspresso | Jobspresso | `jobspresso.co/remote-work` или RSS | AJAX `/jm-ajax/get_listings/` (4 страницы = 3 клика) | job detail page `/job/*` | список загружается в фоне по AJAX, без вкладки и без диалога загрузки |
| revelo | Revelo | `app.careers.revelo.com` | cards on `/home`, then open/close `View details` drawer per card | direct detail-like pages fallback | list enrichment is in-page via drawer open/close cycle |
| torc | Torc | `platform.torc.dev/#/jobs/matches` | collect match links from SPA list | detail route `#/jobs/matches/<id>` | enrich waits explicit detail readiness (not only `tab complete`) before scrape |
| workatastartup | Work at a Startup (YC) | `workatastartup.com/companies` | scroll list of companies, then fetch company pages for job links | job detail page `/jobs/<id>` | skip companies with “No specific jobs listed…”; skip jobs with “US citizen/visa only” |

## Source API (expected)
Each source module registers itself via:
- `id` (string, stable key)
- `name` (human label)
- `match(url)` -> boolean
- `scrapeList(document, ctx)` -> `Job[]`
- `scrapeDetail(document, ctx)` -> `Job`

## Adding a new source
Подробная пошаговая инструкция теперь вынесена в:
- `docs/ADDING_SOURCE.md`

Кратко:
1. Создать `firefox-addon/sources/<id>.js` (match + scrapeList + scrapeDetail).
2. Добавить домен в `manifest.json` (permissions + matches).
3. Обновить fallback‑детект в `content-list.js` и `isDetailPage` в `content-job.js`.
4. Добавить фикстуры `<id>_list.html` и `<id>_job.html`.
5. Обновить `docs/SOURCES.md`, `docs/SOURCES.generated.md`, `fixtures/README.md`.
6. Добавить строки в Google Sheets:
   - `ScrapeSources` (`id`, `name`, `enabled`)
   - `ScrapeList` (`ScrapePageId`, `ScrapePageName`, `ScrapePageUrl`)
