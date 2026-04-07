# Contracts

This file documents the data structures shared across the addon and Apps Script.

## Job
Job objects are converted into sheet rows based on the `ExpectedHeader` setting
(from the Settings sheet). The exact column order is defined in Settings.

Common fields used in code:
- JobId
- JobTitle
- JobCompany
- JobLocation
- JobModality
- JobSalary
- JobTags
- JobDescription
- JobUrl
- JobApplyUrl (optional; direct Apply link from source detail page, e.g. LinkedIn apply button)
- JobPostedDttm (optional)
- JobRateNum
- JobRateDesc
- JobRateShortDesc
- JobRateDttm
- RatedModelName
- Status
- ScrapePageName
- LoadDttm

Rule: if a field is not available, the addon should set it to empty string.

## LRate Response Contract (addon parser)
`background.js` parses LRate response with a strict contract:
- `LRateLeaseId` must appear as `LRateLeaseId[:|=]<lease-id>`.
  - The value must exactly match the lease issued by `WebApp.gs action=getLRateRows`.
- `JobRateNum` must appear as `JobRateNum[:|=]<0..5>`.
  - Accepted examples: `JobRateNum:4`, `JobRateNum=4`, `JobRateNum = 4`.
- The final non-empty line must be `LRateResponseComplete[:|=]<lease-id>`.
  - The value must exactly match the lease issued by `WebApp.gs action=getLRateRows`.
  - This protects LRate from saving partially streamed/truncated answers.
- Any other rating formats (`x/5`, `rating=`, `оценка`, etc.) are ignored.
- If strict `LRateLeaseId[:|=]...`, `JobRateNum[:|=]<digit>`, or final
  `LRateResponseComplete[:|=]...` is missing, parsing fails and row retry starts.
- `JobRateShortDesc` is text after `JobRateNum[:|=]<digit>` up to first empty line (`\n\n`) or end of text.
- `JobTop3Want` is first paragraph after marker `на самом деле хотят`; if marker missing, value is empty.
- `JobRateDesc` stores full LLM response text unchanged.

## LRate Lease Contract
- `WebApp.gs action=getLRateRows` returns:
  - `LeaseId`
  - `RunId`
  - `StableJobKey`
  - `SnapshotHash`
  - `RowKey`
  - `rowNum` as debug only
- `WebApp.gs action=updateLRateRow` must receive:
  - `leaseId`
  - `stableJobKey`
  - `snapshotHash`
  - `values`
- `rowNum` is diagnostic only and is not the row identity anymore.
- Apps Script stores LRate leases in `DocumentProperties` under internal `lrateLeaseV1:*` keys.
- Save is `fail-closed`: if current `StableJobKey + SnapshotHash + Status=2LRate` does not match exactly one row, nothing is written.

Status mapping in LRate:
- `JobRateNum > 2` -> `Status=2Apply`
- `JobRateNum <= 2` -> `Status=2Delete`

## Addon Autofill Profiles State
- `WebApp.gs action=getAddonAutofillProfiles` returns:
  - `state.version`
  - `state.updatedAt`
  - `state.seededFromDefaults`
  - `state.entries[]` with:
    - `id`
    - `label`
    - `value`
    - `createdAt`
    - `updatedAt`
- `WebApp.gs action=saveAddonAutofillProfiles` accepts the same `state` structure and
  returns normalized state back.
- Invalid entries are dropped:
  - empty `id`
  - empty `label`
  - duplicate `id`
- Timestamps are normalized to ISO strings.
- Apps Script stores remote state in `DocumentProperties.addonAutofillProfilesV1`.
- Addon keeps a local primary cache in `browser.storage.local.autofill_profiles_v1`
  and syncs it with Apps Script in background.

## Telegram 2Apply Notification
- When `WebApp.gs action=updateLRateRow` saves a row with `Status=2Apply`,
  Apps Script sends a Telegram message if `TelegramBotToken` and `TelegramChatId`
  are configured in the `Settings` sheet.
- Notification failure does not rollback the row save and does not cancel lease completion.
  The failure is only logged via `Logger` and `ScrapeLog`.
- Notification payload includes:
  - company + title
  - location
  - `JobRateNum`
  - `JobRateShortDesc` / `JobRateDesc`
  - job/apply URLs
  - sheet name + row number
- Manual smoke test: `sendTelegramTest2ApplyNotification()`.

## ScrapeSource
Each source module must register an object with:
- id: string (stable key, used in ScrapeSources and ScrapeList)
- name: string
- match(url): boolean
- scrapeList(document, ctx): Job[]
- scrapeDetail(document, ctx): Job

## ScrapeProgress (addon)
Stored in `browser.storage.local.scrapeAllProgress` while Scrape All runs.
Typical fields:
- status: string (short UI status)
- phase: 'scrape' | 'enrich'
- sourceName: string
- sourceIndex: number
- totalSources: number
- progressCurrent: number
- progressTotal: number
- stagedJobs: number
- failedJobs: number
- lastError: string
- lastDebug: string

## DebugEvent (addon)
Stored in `browser.storage.local.debugEvents`:
- timestamp: ISO string
- site: source id
- url: page url
- entry: string (single event line)

## LoadsLog record (Apps Script)
Appended by `appendLoadsLog(record)`:
- HistSheetName
- StartDttm
- EndDttm
- StageRowsTotal
- NewCount
- DoubleCount
- LoadedCount
- SuccessFlag
- FailAtRowNum
