# Fixtures

This folder stores saved HTML snapshots for offline scraper testing.

Naming:
- `<id>_list.html` for list pages
- `<id>_job.html` for detail pages

Current fixtures:
- getonbrd_list.html
- gettonbrd_job.html (legacy alias in test script)
- gallito_list.html / gallito_job.html
- hh_list.html / hh_job.html
- habr_list.html / habr_job.html
- lever_list.html / lever_job.html
- computrabajo_list.html / computrabajo_job.html
- linkedin_list.html / linkedIn_job*.html
- wellfound_list.html / wellfound_job.html
- jobspresso_list.html / jobspresso_job.html / jobspresso_list.rss
- Torc_list.html / Torc_job.html
- ycombinator_list.html / ycombinator_startup.html / ycombinator_job.html (workatastartup.com)

Testing:
1. `cd firefox-addon`
2. `npm install`
3. `npm run test:scrapers`
