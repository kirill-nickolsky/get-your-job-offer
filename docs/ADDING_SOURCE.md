# Как добавить новый источник (подробно)

Эта инструкция описывает **полный путь** добавления нового источника в проект, включая аддон, фикстуры, Google Sheets и проверку.

## Быстрый LLM-first чеклист (12-15 минут)
1. Создать `firefox-addon/sources/<id>.js` с `id/name/match/scrapeList/scrapeDetail`.
2. Добавить домен в `firefox-addon/manifest.json` (`permissions` + `content_scripts.matches`).
3. Добавить fallback в `firefox-addon/content-list.js` (`detectSite`) и detail-match в `firefox-addon/content-job.js`.
4. Положить фикстуры в `fixtures/`: `<id>_list.html`, `<id>_job.html` (или `<id>_list.rss`).
5. Обновить `docs/SOURCES.md` и сгенерировать `docs/SOURCES.generated.md`.
6. Запустить в `firefox-addon/`:
- `npm run check:sources`
- `npm run test:scrapers`
7. Обновить Google Sheets:
- `ScrapeSources`: `id`, `name`, `enabled`, `MaxTabsPerSite`
- `ScrapeList`: `ScrapePageId`, `ScrapePageName`, `ScrapePageUrl`

### Минимальный шаблон запроса для агента
```text
Добавь source <id> для <domain>.
Требования list scrape: <rules>.
Требования detail scrape: <rules>.
Добавь host permissions, fixtures, docs/SOURCES.md, SOURCES.generated.md.
Прогони check:sources и test:scrapers.
```

## 0. Куда смотреть в коде
- `firefox-addon/sources/<id>.js` — логика списка и детали.
- `firefox-addon/manifest.json` — разрешения и matches для контент‑скриптов.
- `firefox-addon/content-list.js` — fallback‑детект по домену (на случай если match(url) не сработал).
- `firefox-addon/content-job.js` — разрешённые detail‑страницы (isDetailPage).
- `fixtures/` — HTML фикстуры для офлайн‑теста.
- `docs/SOURCES.md` и `docs/SOURCES.generated.md` — документация источников.
- `docs/SETTINGS.md` — структура Google Sheets.

## 1. Придумайте `id` источника
Требования:
- латиница в нижнем регистре, без пробелов.
- стабилен (не меняется при правках).

Пример: `jobspresso`, `wellfound`, `linkedin`.

## 2. Создайте модуль источника
Файл: `firefox-addon/sources/<id>.js`

Шаблон (минимум):
```js
(function() {
  'use strict';
  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || (ms => new Promise(r => setTimeout(r, ms)));

  function scrapeList(doc, ctx) {
    // TODO: собрать список вакансий
    return [];
  }

  function scrapeDetail(doc, ctx) {
    // TODO: собрать детали вакансии
    return {};
  }

  const source = {
    id: '<id>',
    name: '<Name>',
    match(url) { return String(url || '').includes('<domain>'); },
    scrapeList,
    scrapeDetail
  };

  if (typeof registerScrapeSource === 'function') {
    registerScrapeSource(source);
  }
})();
```

### 2.1. Что обязано быть в Job‑объекте
Возвращаемые объекты должны включать:
- `JobUrl`, `JobId`, `JobTitle`, `JobCompany`, `JobLocation`, `JobDescription`
- остальные поля можно оставлять пустыми (см. другие источники).

Рекомендуемый шаблон:
```js
{
  JobUrl: '',
  JobId: '',
  JobTitle: '',
  JobCompany: '',
  JobLocation: '',
  JobSeniority: '',
  JobModality: '',
  JobSalary: '',
  JobTags: '',
  JobDescription: '',
  JobPostedDttm: '',
  JobRateDttm: '',
  JobRateNum: '',
  JobRateDesc: '',
  JobRateShortDesc: '',
  RatedModelName: '',
  Status: 'Staged',
  LoadDttm: ''
}
```

## 3. Добавьте host permissions и matches
Файл: `firefox-addon/manifest.json`

Нужно добавить:
- в `permissions` — домен источника `*://example.com/*`
- в `content_scripts[].matches` — URLы листа и детали

Пример:
```json
"permissions": [
  "*://example.com/*"
],
"content_scripts": [
  {
    "matches": [
      "*://example.com/jobs*"
    ],
    "js": [ "...", "sources/<id>.js", "content-list.js" ]
  },
  {
    "matches": [
      "*://example.com/job/*"
    ],
    "js": [ "...", "sources/<id>.js", "content-job.js" ]
  }
]
```

## 4. Добавьте fallback‑детект (если нужно)
Файл: `firefox-addon/content-list.js`, функция `detectSite()`.

Добавьте:
```js
} else if (url.includes('example.com')) {
  return '<id>';
}
```

Это нужно как подстраховка, если `match(url)` не сработает по каким‑то причинам.

## 5. Обновите isDetailPage (detail‑скрейп)
Файл: `firefox-addon/content-job.js`, функция `isDetailPage(url)`.

Добавьте проверку для detail‑URL.

## 6. Фикстуры для тестов
Положите HTML в `fixtures/`:
- `<id>_list.html`
- `<id>_job.html`

Если лист грузится AJAX’ом — фикстура может быть пустой, но это стоит отметить в коде и тесте.

## 7. Обновите тест‑харнесс
Файл: `firefox-addon/test-scrapers.js`

Добавьте URL для источника:
```js
const SOURCE_URLS = {
  "<id>": "https://example.com/jobs"
};
```
Если список может быть пустым в фикстуре:
```js
const ALLOW_EMPTY_LIST = new Set([...,"<id>"]);
```

## 8. Документация
Обновите:
- `docs/SOURCES.md` (ручные заметки)
- `docs/SOURCES.generated.md` (таблица id/name)
- `fixtures/README.md` (список фикстур)
- при необходимости `firefox-addon/README.md`

## 9. Google Sheets
### 9.1. ScrapeSources
Добавьте строку (можно оставить MaxTabsPerSite пустым):
```
<id>    <Name>    TRUE    <MaxTabsPerSite>
```

### 9.2. ScrapeList
Добавьте строку (можно несколько URL’ов для одного id):
```
<id>    <Human label>    <List URL>
```

## 10. Сборка и проверка
1. Соберите XPI: `./build.sh` (в `firefox-addon/`).
2. Перезагрузите аддон в `about:debugging`.
3. Прогоните `node firefox-addon/test-scrapers.js` (опционально).
4. Проверьте лог ScrapeLog и DataFunnel.

## 10.1. Нетипичные источники (двухступенчатый список)
Пример: Work at a Startup (`workatastartup.com`).
Схема:
1. Лист компаний: скроллить вниз до упора (infinite scroll).
2. Отфильтровать компании, у которых в карточке есть фраза:
   `No specific jobs listed. You can still apply and we'll let the founders know.`
3. Для оставшихся компаний открыть страницу компании и собрать ссылки на вакансии из JSON (`data-page`).
4. На этом шаге фильтровать вакансии по полю `pretty_sponsors_visa` (пропускать `US citizen/visa only`).
5. Детали вакансии доставать из `ApplyButton-react-component` (`data-page`) на странице `/jobs/<id>`.

## 11. Типовые ошибки
- **Missing host permission**: нет домена в `permissions`.
- **No source matched**: нет `match(url)` или `detectSite` fallback.
- **Detail scraper not registered**: нет `isDetailPage` или не подключён `sources/<id>.js`.
- **Empty list**: страница грузит список AJAX’ом — добавьте клики/scroll/таймаут.

## 11.1. Work at a Startup (YC) — напоминание по правам
Для `workatastartup.com` нужны host permissions:
- `*://workatastartup.com/*`
- `*://www.workatastartup.com/*`
- `*://*.workatastartup.com/*` (на случай поддоменов)

## 11.2. Анти-регресс для SPA и фоновых вкладок (обязательно)
Эти правила нужны, чтобы не ловить ошибки вида:
`Could not establish connection. Receiving end does not exist`
и сценарий «вкладка открылась и сразу закрылась».

1. Разделяйте ping для list и detail.
- `content-list.js` должен отвечать на `pingList`.
- `content-job.js` не должен считаться валидным ответчиком для list-фазы.
- Перед `scrapeList` в background проверяйте именно `pingList`, а не общий `ping`.

2. При fallback-инъекции инжектите полный list-bundle, а не только `content-list.js`.
- Последовательность: `utils/*` -> `sources/index.js` -> `sources/<all needed>.js` -> `content-list.js`.
- После инъекции повторно проверяйте `pingList`.

3. Делайте retry доставки сообщений в content script.
- Для list: retry `browser.tabs.sendMessage(... action: 'scrapeList')` с коротким backoff.
- Для detail: retry `scrapeJob` отдельно.
- Для нестабильных SPA-источников добавляйте 1 `reload + retry` перед финальным fail.

4. Для SPA-detail добавляйте source-specific readiness.
- Реализуйте проверку в `content-job.js` (`evaluateDetailReadiness_` ветка для source).
- Возвращайте `ready`, `reason`, `metrics` (длина текста, количество маркеров и т.д.).
- Используйте source-specific timeout в background (не только общий default).

5. Держите URL-контракт list -> detail.
- `JobUrl` из `scrapeList` должен вести на страницу, где реально работает `scrapeDetail`.
- Избегайте суррогатных URL, если они не поддержаны в `match(url)` и `isDetailPage(url)`.

6. Проверяйте manifest на оба потока.
- В `permissions` и `content_scripts.matches` должны быть все домены/поддомены источника.
- Отдельно проверьте, что list-URL и detail-URL входят в `matches`.

## 11.3. Минимальный smoke-тест нового источника
Перед merge обязательно:

1. Прогон list scraping на 1 URL источника.
- Ожидаемо: не меньше 1 вакансии или контролируемый пустой результат без transport ошибок.

2. Прогон detail enrichment хотя бы на 1 вакансии.
- Ожидаемо: вкладка не закрывается до готовности контента, `Failed to scrape` отсутствует.

3. Негативный сценарий.
- Битый URL должен падать с понятной причиной, а не с transport-ошибкой `Receiving end does not exist`.

4. Сборка артефакта.
- `cd firefox-addon && ./build.sh`
- Проверить свежий `firefox-addon/dist/hrscrape2mart.xpi`.
