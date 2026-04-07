# TEST MODE Update

## Changes Made

Added TEST_MODE to limit scraping to 3 jobs for testing on real LinkedIn site.

### Constants Added
**File**: `background.js` (lines 39-42)

```javascript
// TEST MODE: Limit to 3 jobs for testing
const TEST_MODE = true;
const TEST_MODE_MAX_JOBS = 3;
```

### Limits Applied

#### 1. Initial Job Collection
**Location**: `background.js` lines 89-98

When scraping job list, limits collected jobs to first 3:
```javascript
// TEST MODE: Limit to first N jobs
if (TEST_MODE && collectedJobs.length > TEST_MODE_MAX_JOBS) {
  console.log(`[TEST_MODE] Limiting ${collectedJobs.length} jobs to ${TEST_MODE_MAX_JOBS}`);
  collectedJobs = collectedJobs.slice(0, TEST_MODE_MAX_JOBS);
}
```

#### 2. Enrichment Queue
**Location**: `background.js` lines 568-575

Limits enrichment to first 3 jobs:
```javascript
// TEST MODE: Limit enrichment to first N jobs
let jobsToEnrich = unenrichedJobs;
if (TEST_MODE && jobsToEnrich.length > TEST_MODE_MAX_JOBS) {
  console.log(`[TEST_MODE] Limiting enrichment from ${jobsToEnrich.length} to ${TEST_MODE_MAX_JOBS} jobs`);
  jobsToEnrich = jobsToEnrich.slice(0, TEST_MODE_MAX_JOBS);
}
```

## Build Status

✅ **XPI Built Successfully**
- File: `dist/hrscrape2mart.xpi`
- Size: 49.3 KB
- background.js: 41,475 bytes (increased from 40,617 bytes)

## How It Works

1. **Scrape List**: Collects ALL jobs from page, then limits to first 3
2. **Enrichment**: Only enriches the first 3 jobs
3. **No Pagination**: Next button functionality still exists but won't be needed (only 3 jobs)
4. **Console Logs**: Shows when limits are applied

## Testing

Load the XPI in Firefox/LibreWolf and:
1. Navigate to LinkedIn jobs search
2. Click "Scrape Current Tab"
3. Will collect only 3 jobs
4. Click "Enrich Jobs"
5. Will enrich only those 3 jobs

## To Disable TEST_MODE

Set `TEST_MODE = false` in `background.js` line 40 and rebuild.
