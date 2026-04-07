# Settings

Settings live in Google Sheets. There are two kinds:
- Key/value entries in the `Settings` sheet.
- Dedicated configuration sheets (ScrapeList, ScrapeSources, etc.).

## Settings sheet (key/value)
These keys are read in `appsscript/Settings.gs`:

- ExpectedHeader
  - Defines the sheet column order (comma or tab separated).
- HistSheetSourceMap
  - Mapping `sourceId=SheetName` pairs, separated by `;`.
- SourceParseRules
  - Custom parsing rules (string; format project-specific).
- CV
  - CV text used by LLM rating prompts.
- Goal
  - Goal text used by LLM rating prompts.
- PromptSimpleRate
  - Prompt template for simple rate.
- PromptMediumRate
  - Prompt template for medium rate.
- LRateUrl
  - Legacy key kept for backward compatibility.
  - Current LRate runtime ignores it and uses persistent chat slots from addon local storage.
- LRateBaseUrl
  - Base URL used to create fresh LRate chats at run start and worker recovery.
- LRatePrompt
  - Bootstrap/system prompt prefix used in the first message for each worker session.
  - Addon sends it together with the first vacancy payload (`LRatePrompt + --- VACANCY --- + row data`).
  - Vacancy payload also includes technical contract lines for `LRateLeaseId`, `JobRateNum`,
    and final `LRateResponseComplete=<lease-id>`.
- LRateTreads
  - Number of parallel LRate workers (clamped to `1..99` and to remaining row count).
- LRateChatMsgLimit
  - Max count of vacancy prompts per worker chat before rotation (`1..500`).
  - Counter increases on each row send; the first combined bootstrap+vacancy message counts as one row send.
- SimpleRateTitleDenyRegex
  - Regex used by SimpleRater to mark 2Delete/2MARate.
- ModelsFallbackList
  - Comma separated LLM model names.
- WeakModelsList
  - Comma separated list of model names considered weak.
- RetryPolicyAttempts
  - Number of retry attempts for LLM calls.
- RetryPolicySleepSeconds
  - Sleep seconds between retries.
- RetryPolicyBackoffMultiplier
  - Exponential backoff multiplier.
- MaxOpenTabs
  - Global limit for concurrently opened tabs during scraping and enrichment (default 6).
- CloudBackendUrl
  - Base URL of the Cloud Run backend used by addon polling (`/scrape-plan`, `/scrape-result`).
- CloudBackendToken
  - Shared secret used by addon to sign Cloud requests.
  - In local/dev it can still be used as plain `x-addon-token`.
  - In current cloud flow the addon also derives HMAC headers from the same value.
- CloudPollMinutes
  - Addon local alarm period for cloud scrape-plan polling.
- CloudMaxPlanCommands
  - Max number of cloud scrape commands addon asks for in one poll.
- TelegramBotToken
  - Telegram bot token from `@BotFather`.
  - Used by `WebApp.gs` to send `2Apply` notifications and by `sendTelegramTest2ApplyNotification()`.
- TelegramChatId
  - Numeric Telegram chat id that receives `2Apply` notifications.

## ScrapeList sheet
Source URLs that the addon scrapes.

Columns:
- ScrapePageId (matches source id; can repeat for multiple URLs)
- ScrapePageName (human label)
- ScrapePageUrl (target list URL)

Примечание:
- Для Jobspresso рекомендуется указывать **обычную страницу** (например `https://jobspresso.co/remote-work/`) **или RSS‑URL**.
- В любом случае аддон использует **AJAX endpoint** Jobspresso (`/jm-ajax/get_listings/`) и сам постранично выгружает список **в фоне**, без открытия вкладки и без диалога “сохранить файл”.
- Для имитации “Load more” выгружается 4 страницы (страница + 3 клика).

## ScrapeSources sheet
Controls which sources are allowed and enabled.

Columns:
- id (must match source module id)
- name (label shown in UI)
- enabled (TRUE/FALSE)
- Priority (higher runs first in cloud planner)
- MinIntervalMin (minimum minutes between launches)
- RetryLimit (max retry attempts after failures)
- RetryBackoffMin (minutes before next retry window)
- DailySuccessCap (optional success cap per day; `0` means unlimited)
- ScrapePageUrl (optional direct URL exported to cloud planner)
- MaxTabsPerSite (per-source tab limit; if empty, falls back to MaxOpenTabs)
  - Применяется для list scrape, dedup и enrichment задач этого источника.
  - Скрытого hard-cap для LinkedIn нет: приоритет у `MaxTabsPerSite`, иначе `MaxOpenTabs`.
  - Рекомендуется указывать стабильный `id` источника (например `linkedin`, `wellfound`), чтобы лимит гарантированно матчился.

## Other sheets
- ScrapeLog: debug events (timestamp, sourceId, stage, details).
- LoadsLog: increment load audit.
- Stage/NewJobs/JobsHist/DeletedJobs: pipeline sheets.

## Apps Script internal properties
Stored in `PropertiesService.getDocumentProperties()`:

- `addonAutofillProfilesV1`
  - Normalized addon autofill profile state returned by `action=getAddonAutofillProfiles`
    and updated by `action=saveAddonAutofillProfiles`.
  - Used to restore addon autofill profiles after addon reinstall.
- `lrateLeaseV1:*`
  - Active/saved/expired LRate lease entries issued by `action=getLRateRows`.

## Addon local state (`browser.storage.local`)
These are not stored in Google Sheets:

- `autofill_profiles_v1` (object)
  - Normalized local autofill cache used by popup and context-menu autofill.
  - Remote sync to Apps Script runs in background; autofill clicks do not read Sheets directly.
- `autofill_seeded_v1` (boolean)
  - Tracks whether one-time local autofill defaults were seeded.
- `autofill_last_diagnostic_v1` (object)
  - Last autofill diagnostic payload shown in popup/debug UI.

- `lrate_debug_enabled` (boolean)
- `lrate_debug_rows_per_worker` (int, `1..50`)
- `lrate_debug_disable_rows_limit` (boolean)
- `lrate_debug_handoff_enabled` (boolean)
- `lrate_debug_handoff_retries` (int, `0..10`)
  - `0` when handoff mode is disabled.
  - `1..10` when handoff mode is enabled.
- `lrate_chat_pool_v1` (object)
  - Persistent global LRate chat pool used by sticky worker slots.
  - Stores `slotId`, `chatUrl`, `sentVacancyCount`, and last usage metadata.
