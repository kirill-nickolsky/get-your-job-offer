# Apps Script Flow

Краткая карта серверной части, чтобы не читать весь `appsscript/` при каждом изменении.

## 1. Вход из аддона
Файл: `appsscript/WebApp.gs`
- `doPost` принимает action-запросы от аддона.
- Основные действия:
  - `appendStage`
  - `validateStage`
  - `filterDuplicates`
  - `updateDataFunnel`
  - `getScrapeSources`
  - `getLRateRows`
  - `updateLRateRow`
  - `updateSetting` (backward compatible; используется в том числе для `TelegramBotToken` и `TelegramChatId`)
  - `getAddonAutofillProfiles`
  - `saveAddonAutofillProfiles`
- Autofill профили аддона теперь живут в двух слоях:
  - локальный primary cache в `browser.storage.local`
  - remote backup/sync в `DocumentProperties` через `WebApp.gs`
- Popup/context menu читают локальный cache, а не таблицу на каждый клик.

## 2. Stage
Файлы: `appsscript/WebApp.gs`, `appsscript/StageValidator.gs`
- Новые вакансии пишутся в `Stage` со `Status=Staged`.
- Заголовок должен соответствовать `ExpectedHeader` из `Settings`.

## 3. Validate Stage
Файлы: `appsscript/StageValidator.gs`, `appsscript/Validators.gs`
- Проверяет обязательные поля и формат.
- Маркирует строки к обработке (обычно `Approved`).

## 4. Increment Load
Файл: `appsscript/IncrementLoader.gs`
- Берёт `Approved` из `Stage`.
- Делает дедуп по ключу (`JobId` + `JobUrl`) против `NewJobs`, `JobsHist`, `DeletedJobs`.
- Загружает в `NewJobs` со `Status=Loaded`.
- Логирует запуск в `LoadsLog`.

## 5. Rating
Файлы: `appsscript/SimpleRater.gs`, `appsscript/MediumRater.gs`
- Оценивает `Loaded` вакансии.
- Ставит score/description/model/status.
- `Medium ARate`: для `2MARate` группирует строки по `JobCompany+JobTitle`:
  - winner в группе ставится в `2MBrate` по приоритету `JobLocation`: `Uruguay` -> `Montevideo` -> `Latin Americ` -> верхняя строка
  - остальные строки в группе переводятся в `2Delete` с дописыванием `Location DBL` в `JobRateDesc`
  - строки с пустым `JobCompany` или `JobTitle` пропускаются (без смены статуса)
- `Medium BRate`: переводит `2MBrate` -> `2MCRate` и заполняет `JobTop3Stack`, `JobTop3Want`, `JobWorkMode`.
- `Medium CRate`: для `2MCRate` ставит `2Delete`, если:
  - есть совпадение `JobTop3Stack` с `Settings.StackNegative`, или
  - `JobWorkMode` равен `Onsite`/`Hybrid`, или
  - `JobPostedDttm` подпадает под возрастные правила:
    - содержит `ago` и `year`
    - содержит `ago` и `months`
    - содержит `ago` и `weeks` с числом `3..9`
  - стек-матчинг нормализуется в `UPPERCASE` (нерегистрозависимо), а для коротких токенов (`Go`, `R`) дополнительно учитывает вариант со скрытыми разделителями (`G o`, zero-width).
  Иначе ставит `2LRate`.
- `LRate` (в аддоне, с записью через `WebApp`):
  - Берёт строки `NewJobs` со `Status=2LRate` через `action=getLRateRows` (включая `JobApplyUrl`, если колонка есть в header).
  - `WebApp` выдает каждой строке lease (`LeaseId`, `RunId`, `StableJobKey`, `SnapshotHash`) и хранит его в `DocumentProperties`.
  - Строки без стабильного identity (`JobId/JobUrl`) и строки с дублирующимся `StableJobKey + SnapshotHash` в выдачу не попадают.
  - Использует persistent global chat pool в `browser.storage.local` (`lrate_chat_pool_v1`).
  - Закрепляет sticky slot: `W1 -> slot1`, `W2 -> slot2`, ...
  - Для пустого/битого slot URL создаёт fresh chat и подменяет слот.
  - Lazy init: вкладка воркера открывается только когда воркер реально берёт первую строку из очереди.
  - В отдельный bootstrap-цикл не уходит: первый запрос после attach/recover/rotate отправляется как combined prompt
    (`LRatePrompt + "\n\n--- VACANCY ---\n" + vacancy fields`).
  - Ротирует чат слота при достижении `Settings.LRateChatMsgLimit`.
  - Работает параллельными воркерами по `Settings.LRateTreads` (ограничение `1..99`).
  - Парсит `JobRateNum` по токену `JobRateNum[:|=]<0..5>` (`:` или `=`).
  - Парсит и валидирует `LRateLeaseId[:|=]<lease-id>`; если lease id не совпал, ответ считается чужим и не пишется в Sheets.
  - Требует финальную non-empty строку `LRateResponseComplete[:|=]<lease-id>`; без неё ответ считается незавершённым и не пишется в Sheets.
  - Пишет полный ответ в `JobRateDesc`.
  - Пишет `JobRateShortDesc` как текст после `JobRateNum[:|=]<digit>` до первого пустого абзаца.
  - Пишет `JobTop3Want` как первый абзац после маркера `на самом деле хотят` (если маркера нет, поле пустое).
  - Ставит `Status=2Apply` при `JobRateNum>2`, иначе `Status=2Delete`.
  - Обновляет строку через `action=updateLRateRow` по `leaseId + stableJobKey + snapshotHash`, а не по `rowNum`, и проставляет `LoadDttm`.
  - Если после сохранения итоговый `Status=2Apply`, `WebApp.gs` отправляет Telegram-уведомление
    по `Settings.TelegramBotToken + Settings.TelegramChatId`.
  - Ошибка отправки в Telegram не откатывает запись строки и lease; логируется отдельно как `telegram2ApplyError`.
  - Если текущая строка уже не матчит lease snapshot, запись блокируется (`fail-closed`) и в `NewJobs` ничего не меняется.
  - Использует prefill-конвейер: отправляет `N`, префиллит `N+1` через 5с, ждёт активную `Send` + стабильность текста, затем сразу отправляет `N+1` и только после этого пишет `N` в Sheets.
  - Для последней строки (когда `N+1` нет) не ждёт активную `Send`, завершение определяется по стабильности текста ответа.
  - Таймауты: `tab load=30s`, `page ready=30s`, `composer ready=30s`, `composer alive=12s`, `wait answer=180s`, `prefill delay=5s`, `stable text=5s`, `confirm delay=2s`.
  - Счётчик лимита чата увеличивается на каждой отправке строки (включая первую combined отправку после attach/recover/rotate).
  - Текущий test-mode: `no worker restarts`; при 3 подряд провалах воркер останавливается.
  - Вкладка воркера закрывается при завершении воркера (не во время обычных attempt-ошибок в no-restart режиме).
  - Debug handoff mode (popup): строка может быть перекинута в другой воркер после первой неудачи, с лимитом попыток `1..10`.
  - Run становится fatal только если очередь не завершена и не осталось живых воркеров.

## 6. Move/Archive
Файл: `appsscript/RowMover.gs`
- Перемещает строки между `NewJobs`, `JobsHist`, `DeletedJobs`.

## 7. Funnel/Observability
Файлы: `appsscript/DataFunnel.gs`, `appsscript/ScrapeLog.gs`
- `DataFunnel` отражает статусы по источникам.
- Derived-счётчики в `DataFunnel`:
  - Источник дедакшенов: `NewJobs + DeletedJobs` за дату funnel (`LoadDttm`), только `Status=2Delete`.
  - `Jobs After S-Rate` = `Scraped TOTAL - count(JobRateDesc contains "Title matched deny regex")`
  - `Jobs After M-Rate` = `Jobs After S-Rate - count(JobRateDesc contains "Medium BRate"/"Medium CRate"/"Location DBL")`
  - `Jobs After L-Rate` = `Jobs After M-Rate - count(JobRateDesc matches JobRateNum[:|=](0|1))`
  - Все значения clamped: `max(0, value)`.
  - При первом `Scraping` нового дня перед суточным сдвигом выполняется финальный пересчёт за предыдущую дату.
- `ScrapeLog` хранит debug-события из аддона.

## 8. Настройки/контракты
Файлы: `appsscript/Settings.gs`, `appsscript/ScrapeSources.gs`, `appsscript/Utils.gs`
- `Settings`: глобальные ключи (`ExpectedHeader`, regex, webapp url, `TelegramBotToken`, `TelegramChatId` и т.д.).
- `ScrapeSources`: разрешённые `ScrapePageId`/name.
- `Utils`: buildJobKey/нормализация URL/служебные функции.

## 9. Отклики
Файл: `appsscript/Applications.gs`
- `registerApplication` копирует выделенные строки `NewJobs` или `DeletedJobs` в лист `Отклики` (вставка с 2-й строки).
- После регистрации в исходных строках ставит `Status = Applied`.
- Успех/ошибки показываются через `toast` (без модального `OK`).

## 10. Быстрый triage (где искать проблему)
- Ошибка при scrape all -> `WebApp.gs` + `ScrapeLog.gs`.
- Дубли/неправильный load -> `IncrementLoader.gs` + `Utils.gs`.
- Не тот статус в funnel -> `DataFunnel.gs`.
- Пропали поля/сломался формат -> `Settings.gs` + `ExpectedHeader`.
