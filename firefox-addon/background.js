/**
 * Background script for managing scraping process
 */

(function () {
  'use strict';

  let jobsData = [];
  let enrichmentQueue = [];
  let isEnriching = false;
  let enrichmentState = {
    isEnriching: false,
    total: 0,
    completed: 0
  };
  let scrapeAllContext = {
    active: false,
    totalSources: 0,
    currentSourceIndex: 0,
    currentSourceId: '',
    currentSourceName: '',
    progressCurrent: 0,
    progressTotal: 0,
    stagedJobs: 0,
    failedJobs: 0,
    notificationShellDropped: 0,
    lastError: '',
    lastDebug: ''
  };
  let lRateContext = {
    active: false,
    status: '',
    current: 0,
    total: 0,
    processed: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
    workers: []
  };

  const ENRICH_CONCURRENCY = 5;
  const ENRICH_TAB_READY_WAIT_MS = 600;
  const ENRICH_DETAIL_READY_POLL_MS = 350;
  const ENRICH_DETAIL_READY_TIMEOUT_MS = 12000;
  const ENRICH_DETAIL_READY_TIMEOUT_TORC_MS = 45000;
  const ENRICH_DETAIL_READY_TIMEOUT_REVELO_MS = 30000;
  const ENRICH_BETWEEN_JOBS_MS = 150;
  const ENRICH_LINKEDIN_DELAY_MIN_MS = 1000;
  const ENRICH_LINKEDIN_DELAY_MAX_MS = 10000;
  const ENRICH_SCRAPE_RETRY_ATTEMPTS = 3;
  const ENRICH_SCRAPE_RETRY_DELAY_MS = 300;
  const ENRICH_SCRAPE_RETRY_ATTEMPTS_REVELO = 8;
  const ENRICH_SCRAPE_RETRY_DELAY_REVELO_MS = 500;
  const LINKEDIN_SHELL_TIMEOUT_X5 = 5;
  const LINKEDIN_SHELL_TIMEOUT_X10 = 10;
  const WAAS_LIST_READY_TIMEOUT_X3 = 3;
  const WAAS_LIST_RELOAD_RETRY_COUNT = 3;
  const SCRAPE_ALL_PAGE_WAIT_MS = 500;
  const SCRAPE_LIST_MESSAGE_RETRY_ATTEMPTS = 4;
  const SCRAPE_LIST_MESSAGE_RETRY_DELAY_MS = 350;
  const CONTENT_LIST_INJECT_FILES = [
    'utils/normalize.js',
    'utils/parse.js',
    'utils/schema.js',
    'utils/job.js',
    'utils/debug.js',
    'utils/dom.js',
    'utils/source-helpers.js',
    'utils/validateSource.js',
    'sources/index.js',
    'sources/hh.js',
    'sources/getonbrd.js',
    'sources/habr.js',
    'sources/lever.js',
    'sources/computrabajo.js',
    'sources/linkedin.js',
    'sources/jobspresso.js',
    'sources/torc.js',
    'sources/revelo.js',
    'sources/wellfound.js',
    'sources/workatastartup.js',
    'content-list.js'
  ];
  const SCRAPE_ALL_TAB_LOAD_TIMEOUT_MS = 60000;
  const DEFAULT_MAX_OPEN_TABS = 6;
  const AUTOFILL_PROFILES_STORAGE_KEY = 'autofill_profiles_v1';
  const AUTOFILL_POPUP_INTENT_STORAGE_KEY = 'autofill_popup_intent_v1';
  const AUTOFILL_SEEDED_STORAGE_KEY = 'autofill_seeded_v1';
  const AUTOFILL_LAST_DIAGNOSTIC_STORAGE_KEY = 'autofill_last_diagnostic_v1';
  const AUTOFILL_PROFILES_VERSION = 1;
  const AUTOFILL_CONTEXT_ROOT_ID = 'hrscrape2mart-autofill-root-v1';
  const AUTOFILL_CONTEXT_ROOT_TITLE = 'get-your-offer Fill';
  const AUTOFILL_CONTEXT_ADD_ID = 'hrscrape2mart-autofill-add-v1';
  const AUTOFILL_CONTEXT_MANAGE_ID = 'hrscrape2mart-autofill-manage-v1';
  const AUTOFILL_CONTEXT_PROFILE_PREFIX = 'hrscrape2mart-autofill-profile-';
  const AUTOFILL_TYPING_MIN_DELAY_MS = 20;
  const AUTOFILL_TYPING_MAX_DELAY_MS = 65;
  const AUTOFILL_REMOTE_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;
  const CLOUD_SCRAPE_POLL_ALARM_NAME = 'cloudScrapePlanPoll';
  const DEFAULT_CLOUD_POLL_MINUTES = 5;
  const DEFAULT_CLOUD_MAX_PLAN_COMMANDS = 2;
  const AUTOFILL_SEED_ENTRIES = [
    { label: '👤 name', value: 'Kirill' },
    { label: '🪪 family name', value: 'Nickolsky' },
    { label: '📛 full name', value: 'Kirill Nickolsky' },
    { label: '💼 LinkedIn', value: 'https://www.linkedin.com/in/kirill-nickolsky/' },
    { label: '📱 phone', value: '+995599934288' },
    { label: '📧 email', value: 'kirill.nickolsky@gmail.com' },
    { label: '🏢 current job', value: 'Wholesome Development' },
    { label: '📍 location', value: 'Montevideo, Uruguay' },
    { label: '💰 salary', value: '4000 USD/month gross' }
  ];
  const AUTOFILL_LEGACY_SEED_ENTRIES = [
    { label: 'Name', value: 'John Doe' },
    { label: 'Email', value: 'john@example.com' },
    { label: 'LinkedIn', value: 'https://www.linkedin.com/in/username/' },
    { label: 'Phone', value: '+1 555 010 0000' }
  ];
  let autofillMenuEntryIds = [];
  let autofillMenuBuildQueue = Promise.resolve();
  let autofillRemoteSyncPromise = null;
  let autofillRemoteSyncLastAtMs = 0;
  let cloudScrapePollInFlight = false;

  // TEST MODE: Limit to 3 jobs for testing
  const TEST_MODE = false;
  const TEST_MODE_MAX_JOBS = 3;

  // Listen for messages from content scripts and popup
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scrapeList') {
      // Forward to content script
      browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
        if (!tabs[0]) {
          throw new Error('No active tab found');
        }

        const tab = tabs[0];
        const tabUrl = tab.url || '';

        // Check if we're on a supported page
        if (!tabUrl.includes('getonbrd.com') && !tabUrl.includes('hh.ru') && !tabUrl.includes('headhunter.ge') && !tabUrl.includes('career.habr.com') && !tabUrl.includes('jobs.lever.co') && !tabUrl.includes('computrabajo.com') && !tabUrl.includes('wellfound.com') && !tabUrl.includes('linkedin.com/jobs')) {
          throw new Error('Please navigate to a supported job site (Get on Board, HeadHunter, Habr Career, Lever, Computrabajo, Wellfound, or LinkedIn Jobs)');
        }

        // First, try to ping the content script to see if it's already loaded
        return browser.tabs.sendMessage(tab.id, { action: 'ping' }).then(async () => {
          // Content script is loaded, send scrape request
          const context = await buildListScrapeContext_(tabUrl, {});
          return browser.tabs.sendMessage(tab.id, { action: 'scrapeList', context: context });
        }).catch(err => {
          console.error('Ping failed:', err);
          // If ping fails, it usually means the extension context is invalid (updated) 
          // or the script isn't loaded (and we can't easily inject ALL dependencies manually).
          throw new Error('Please reload the page and try again (Content script not ready).');
        });
      }).then(async (response) => {
        if (response && response.success) {
          let collectedJobs = response.data.map(job => ({
            ...job,
            Status: 'Staged'
          }));

          // TEST MODE: Limit to first N jobs
          if (TEST_MODE && collectedJobs.length > TEST_MODE_MAX_JOBS) {
            console.log(`[TEST_MODE] Limiting ${collectedJobs.length} jobs to ${TEST_MODE_MAX_JOBS}`);
            collectedJobs = collectedJobs.slice(0, TEST_MODE_MAX_JOBS);
          }

          // Append to existing jobsData, filtering duplicates by JobId or JobUrl
          // If no previous jobsData, load from storage first
          // NOTE: We don't await here to keep response fast, but using local var is risky if concurency.
          // For manual scrape it's fine.
          const existingUrls = new Set(jobsData.map(j => j.JobUrl));
          const existingIds = new Set(jobsData.map(j => j.JobId).filter(id => !!id));

          let addedCount = 0;
          for (const job of collectedJobs) {
            const isDupId = job.JobId && existingIds.has(job.JobId);
            const isDupUrl = existingUrls.has(job.JobUrl);

            if (!isDupId && !isDupUrl) {
              jobsData.push(job);
              if (job.JobId) existingIds.add(job.JobId);
              existingUrls.add(job.JobUrl);
              addedCount++;
            }
          }

          // Save to storage
          browser.storage.local.set({ jobsData: jobsData });

          // Try to upload to Stage Sheet
          let uploadStatus = '';
          try {
            const sourceUrl = await resolveScrapeListSourceUrl();
            const sheetId = extractSpreadsheetId(sourceUrl);
            if (!sheetId) throw new Error('No Sheet ID found');

            const webAppUrl = await fetchSettingsValue(sheetId, 'WebAppUrl');
            if (!webAppUrl) throw new Error('No WebAppUrl in Settings');

            // Optional: Filter duplicates on server side before appending?
            // For manual scrape, we usually want to force add, or at least try.
            // Let's just append.
            await appendStageRows(webAppUrl, collectedJobs);
            uploadStatus = ' & Uploaded to Stage';
          } catch (e) {
            console.error('Manual upload failed:', e);
            uploadStatus = ` (Local only. Upload failed: ${e.message})`;
          }

          if (response.debug && response.debugMeta) {
            const debugPayload = {
              timestamp: new Date().toISOString(),
              url: response.debugMeta.url || (tab && tab.url) || '',
              site: response.debugMeta.site || '',
              entries: response.debug
            };
            browser.storage.local.set({ lastScrapeDebug: debugPayload });
            appendDebugEvents(debugPayload);
          }
          sendResponse({ success: true, count: jobsData.length, added: addedCount, message: uploadStatus });
        } else {
          sendResponse({ success: false, error: response?.error || 'Failed to scrape' });
        }
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'saveScrapedJobs') {
      if (request.data && Array.isArray(request.data)) {
        jobsData = request.data;
        browser.storage.local.set({ jobsData: jobsData });
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'Invalid data' });
      }
      return false;
    }

    if (request.action === 'loadMoreJobs') {
      loadMoreJobs().then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'clearLinkedInViewed') {
      clearLinkedInViewedOnCurrentPage().then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'startLinkedInScrollRecording') {
      startLinkedInScrollRecordingOnCurrentPage(request && request.durationMs).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'linkedinScrollRecordingFinished') {
      handleLinkedInScrollRecordingFinished_(request && request.data).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'scrapeAllNewJobs') {
      scrapeAllNewJobs().then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'getScrapeSources') {
      getScrapeSources().then(result => {
        sendResponse({ success: true, sources: result });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'runLRate') {
      runLRate().then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'getLRateStatus') {
      sendResponse({
        success: true,
        active: lRateContext.active === true,
        progress: lRateContext
      });
      return false;
    }

    if (request.action === 'getScrapeAllStatus') {
      sendResponse({
        success: true,
        active: scrapeAllContext.active === true
      });
      return false;
    }

    if (request.action === 'startEnrichment') {
      startEnrichment().then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'getJobsData') {
      // If in-memory data is empty, try to load from storage
      if (jobsData.length === 0) {
        browser.storage.local.get('jobsData').then(result => {
          if (result.jobsData && result.jobsData.length > 0) {
            jobsData = result.jobsData;
            sendResponse({ success: true, data: jobsData });
          } else {
            sendResponse({ success: true, data: [] });
          }
        }).catch(() => {
          sendResponse({ success: true, data: jobsData });
        });
        return true; // Will respond asynchronously
      }
      sendResponse({ success: true, data: jobsData });
      return false;
    }

    if (request.action === 'clearData') {
      jobsData = [];
      enrichmentQueue = [];
      browser.storage.local.remove([
        'jobsData',
        'enrichmentProgress',
        'scrapeAllProgress',
        'lRateProgress',
        'scrapeListSourceUrl',
        'linkedinScrollProfile',
        'linkedinScrollRecordingStatus'
      ]).then(() => {
        sendResponse({ success: true });
      }).catch(() => {
        sendResponse({ success: true });
      });
      return true; // Will respond asynchronously
    }

    if (request.action === 'getAutofillProfiles') {
      getAutofillProfiles_({
        scheduleRemoteSync: true
      }).then(entries => {
        sendResponse({ success: true, entries: entries });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'upsertAutofillProfile') {
      upsertAutofillProfile_(request && request.profile ? request.profile : {}).then(result => {
        sendResponse({ success: true, profile: result.profile, entries: result.entries });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'deleteAutofillProfile') {
      deleteAutofillProfile_(request && request.id ? request.id : '').then(entries => {
        sendResponse({ success: true, entries: entries });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'consumeAutofillPopupIntent') {
      consumeAutofillPopupIntent_().then(intent => {
        sendResponse({ success: true, intent: intent });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'getAutofillLastDiagnostic') {
      getAutofillLastDiagnostic_().then(diagnostic => {
        sendResponse({ success: true, diagnostic: diagnostic });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'setAutofillPopupIntent') {
      setAutofillPopupIntent_(request && request.mode ? request.mode : 'manage', 'popup').then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }

    if (request.action === 'getEnrichmentStatus') {
      sendResponse({
        success: true,
        isEnriching: isEnriching,
        total: enrichmentState.total,
        completed: enrichmentState.completed
      });
      return false;
    }
  });

  /**
   * Loads more jobs by clicking "Load more" button until jobs older than 1 month are found
   */
  async function loadMoreJobs() {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        return { success: false, error: 'No active tab found' };
      }

      const tab = tabs[0];
      const tabUrl = tab.url || '';

      if (!tabUrl.includes('getonbrd.com') && !tabUrl.includes('hh.ru') && !tabUrl.includes('headhunter.ge') && !tabUrl.includes('career.habr.com') && !tabUrl.includes('jobs.lever.co') && !tabUrl.includes('computrabajo.com') && !tabUrl.includes('wellfound.com') && !tabUrl.includes('linkedin.com/jobs')) {
        return { success: false, error: 'Please navigate to a supported job site (Get on Board, HeadHunter, Habr Career, Lever, Computrabajo, Wellfound, or LinkedIn Jobs)' };
      }

      // Inject content script if needed
      try {
        await browser.tabs.sendMessage(tab.id, { action: 'ping' });
      } catch (e) {
        await browser.tabs.executeScript(tab.id, { file: 'content-list.js' });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Call loadMore function in content script
      const response = await browser.tabs.sendMessage(tab.id, { action: 'loadMoreJobs' });

      if (response && response.success) {
        // Update jobsData from storage
        const stored = await browser.storage.local.get('jobsData');
        if (stored.jobsData) {
          jobsData = stored.jobsData;
        }

        return {
          success: true,
          totalJobs: response.totalJobs || jobsData.length,
          foundOldJobs: response.foundOldJobs || false
        };
      } else {
        return { success: false, error: response?.error || 'Failed to load more jobs' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function clearLinkedInViewedOnCurrentPage() {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        return { success: false, error: 'No active tab found' };
      }

      const tab = tabs[0];
      const tabUrl = String(tab.url || '');
      if (!tabUrl.includes('linkedin.com/jobs')) {
        return { success: false, error: 'Open a LinkedIn Jobs list page first' };
      }

      try {
        await browser.tabs.sendMessage(tab.id, { action: 'ping' });
      } catch (e) {
        await browser.tabs.executeScript(tab.id, { file: 'content-list.js' });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const response = await browser.tabs.sendMessage(tab.id, { action: 'clearLinkedInViewed' });
      if (!response || response.success !== true) {
        return { success: false, error: response?.error || 'Failed to hide LinkedIn viewed jobs' };
      }

      return response;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async function startLinkedInScrollRecordingOnCurrentPage(durationMs) {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        return { success: false, error: 'No active tab found' };
      }

      const tab = tabs[0];
      const tabUrl = String(tab.url || '');
      if (!tabUrl.includes('linkedin.com/jobs')) {
        return { success: false, error: 'Open a LinkedIn Jobs list page first' };
      }

      try {
        await browser.tabs.sendMessage(tab.id, { action: 'ping' });
      } catch (e) {
        await browser.tabs.executeScript(tab.id, { file: 'content-list.js' });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const parsedDuration = parseInt(String(durationMs || ''), 10);
      const effectiveDuration = Number.isNaN(parsedDuration) ? 5000 : Math.max(3000, Math.min(parsedDuration, 120000));

      await browser.storage.local.set({
        linkedinScrollRecordingStatus: {
          state: 'recording',
          startedAt: new Date().toISOString(),
          durationMs: effectiveDuration
        }
      });

      const response = await browser.tabs.sendMessage(tab.id, {
        action: 'startLinkedInScrollRecording',
        durationMs: effectiveDuration
      });
      if (!response || response.success !== true) {
        await browser.storage.local.set({
          linkedinScrollRecordingStatus: {
            state: 'failed',
            at: new Date().toISOString(),
            error: response?.error || 'Failed to start recording in content script'
          }
        });
        return { success: false, error: response?.error || 'Failed to start recording' };
      }

      return {
        success: true,
        message: `Recording started for ${Math.round(effectiveDuration / 1000)}s. Scroll the LinkedIn jobs list now.`
      };
    } catch (error) {
      await browser.storage.local.set({
        linkedinScrollRecordingStatus: {
          state: 'failed',
          at: new Date().toISOString(),
          error: error.message
        }
      });
      return { success: false, error: error.message };
    }
  }

  async function handleLinkedInScrollRecordingFinished_(payload) {
    const data = payload || {};
    if (data.success !== true || !data.profile || !Array.isArray(data.profile.steps) || data.profile.steps.length === 0) {
      const errorText = data.error || 'No usable scroll steps captured';
      await browser.storage.local.set({
        linkedinScrollRecordingStatus: {
          state: 'failed',
          at: new Date().toISOString(),
          error: errorText
        }
      });
      return { success: false, error: errorText };
    }

    const maxSteps = 240;
    const profile = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: 'user-recorded',
      durationMs: parsePositiveInt(data.profile.durationMs, 5000),
      steps: data.profile.steps.slice(0, maxSteps).map(step => ({
        delta: parsePositiveInt(step.delta, 0),
        waitMs: parsePositiveInt(step.waitMs, 0)
      })).filter(step => step.delta > 0 && step.waitMs > 0),
      captureMethod: String(data.captureMethod || '').trim(),
      fallbackGenerated: data.fallbackGenerated === true,
      fallbackReason: String(data.fallbackReason || '').trim()
    };

    if (profile.steps.length === 0) {
      await browser.storage.local.set({
        linkedinScrollRecordingStatus: {
          state: 'failed',
          at: new Date().toISOString(),
          error: 'Captured steps were empty after normalization'
        }
      });
      return { success: false, error: 'Captured steps were empty after normalization' };
    }

    await browser.storage.local.set({
      linkedinScrollProfile: profile,
      linkedinScrollRecordingStatus: {
        state: 'done',
        at: new Date().toISOString(),
        durationMs: profile.durationMs,
        steps: profile.steps.length,
        captureMethod: profile.captureMethod || '',
        fallbackGenerated: profile.fallbackGenerated === true,
        fallbackReason: profile.fallbackReason || ''
      }
    });

    return { success: true, steps: profile.steps.length };
  }

  async function scrapeAllNewJobs() {
    if (scrapeAllContext.active) {
      return { success: false, error: 'Scrape All already in progress' };
    }
    if (isEnriching) {
      return { success: false, error: 'Enrichment already in progress' };
    }

    const sourceUrl = await resolveScrapeListSourceUrl();
    const sheetId = extractSpreadsheetId(sourceUrl);
    if (!sheetId) {
      return { success: false, error: 'Could not detect spreadsheet ID from URL' };
    }

    const scrapeListEntries = await fetchScrapeListEntries(sheetId);
    if (!scrapeListEntries || scrapeListEntries.length === 0) {
      return { success: false, error: 'ScrapeList is empty or missing ScrapePageUrl' };
    }

    const webAppUrl = await fetchSettingsValue(sheetId, 'WebAppUrl');
    if (!webAppUrl) {
      return { success: false, error: 'Settings missing WebAppUrl' };
    }

    try {
      await postWebApp(webAppUrl, { action: 'validateStage' });
    } catch (error) {
      return { success: false, error: error.message };
    }

    const groupedSources = groupScrapeListEntries(scrapeListEntries);
    if (groupedSources.length === 0) {
      return { success: false, error: 'ScrapeList is empty or missing ScrapePageName' };
    }

    const storedSelection = await browser.storage.local.get('scrapeSourceSelection');
    const selectionMap = storedSelection.scrapeSourceSelection || {};
    const hasSelection = Object.keys(selectionMap).length > 0;
    const filteredSources = groupedSources.filter(source => {
      if (!hasSelection) {
        return true;
      }
      const primaryKey = source.id || source.name || '';
      if (primaryKey && Object.prototype.hasOwnProperty.call(selectionMap, primaryKey)) {
        return selectionMap[primaryKey] !== false;
      }
      if (source.name && Object.prototype.hasOwnProperty.call(selectionMap, source.name)) {
        return selectionMap[source.name] !== false;
      }
      return true;
    });

    if (filteredSources.length === 0) {
      return { success: false, error: 'No sources selected' };
    }

    const maxOpenTabsRaw = await fetchSettingsValue(sheetId, 'MaxOpenTabs');
    const maxOpenTabs = parsePositiveInt(maxOpenTabsRaw, DEFAULT_MAX_OPEN_TABS);
    let scrapeSourcesConfig = [];
    try {
      scrapeSourcesConfig = await getScrapeSources();
    } catch (error) {
      scrapeSourcesConfig = [];
    }
    const perSiteLimits = buildPerSiteLimits(scrapeSourcesConfig, maxOpenTabs);

    scrapeAllContext.active = true;
    scrapeAllContext.totalSources = filteredSources.length;
    scrapeAllContext.currentSourceIndex = 0;
    scrapeAllContext.currentSourceId = '';
    scrapeAllContext.currentSourceName = '';
    scrapeAllContext.progressCurrent = 0;
    scrapeAllContext.progressTotal = 0;
    scrapeAllContext.stagedJobs = 0;
    scrapeAllContext.failedJobs = 0;
    scrapeAllContext.notificationShellDropped = 0;
    scrapeAllContext.lastError = '';
    scrapeAllContext.skippedDuplicates = 0;

    await setScrapeAllProgress({
      phase: 'scrape',
      status: `Starting ${filteredSources.length} sources...`,
      progressCurrent: 0,
      progressTotal: filteredSources.length,
      stagedJobs: 0,
      failedJobs: 0,
      notificationShellDropped: 0,
      lastError: '',
      skippedDuplicates: 0
    });

    const summary = {
      success: true,
      totalSources: filteredSources.length,
      sourcesProcessed: 0,
      stagedJobs: 0,
      failedJobs: 0,
      notificationShellDropped: 0,
      skippedDuplicates: 0,
      errors: []
    };
    const sessionDedupKeys = new Set();

    const recordError = (message, increment) => {
      const safeMessage = formatErrorMessage(message);
      summary.errors.push(safeMessage);
      if (increment) {
        summary.failedJobs += 1;
      }
      scrapeAllContext.failedJobs = summary.failedJobs;
      scrapeAllContext.lastError = safeMessage;
    };

    try {
      await processScrapeSources(filteredSources, webAppUrl, summary, recordError, sessionDedupKeys, {
        maxOpenTabs: maxOpenTabs,
        perSiteLimits: perSiteLimits
      });
      const lastError = summary.errors.length > 0 ? summary.errors[summary.errors.length - 1] : '';
      summary.lastError = lastError;
      const finalStatus = `Scrape All завершен. Источников: ${summary.sourcesProcessed}, новых: ${summary.stagedJobs}, дублей: ${summary.skippedDuplicates || 0}, ошибки: ${summary.failedJobs}, отброшено(shell): ${summary.notificationShellDropped || 0}`;
      await setScrapeAllProgress({
        phase: 'done',
        status: finalStatus,
        progressCurrent: summary.sourcesProcessed,
        progressTotal: summary.totalSources,
        stagedJobs: summary.stagedJobs,
        failedJobs: summary.failedJobs,
        notificationShellDropped: summary.notificationShellDropped || 0,
        skippedDuplicates: summary.skippedDuplicates || 0,
        lastError: lastError
      });
      await browser.storage.local.set({
        lastScrapeAllSummary: Object.assign({}, summary, { completedAt: new Date().toISOString() })
      });
      return summary;
    } finally {
      scrapeAllContext.active = false;
      await browser.storage.local.remove('scrapeAllProgress');
    }
  }

  async function processScrapeSources(filteredSources, webAppUrl, summary, recordError, sessionDedupKeys, options) {
    const maxOpenTabs = parsePositiveInt(options && options.maxOpenTabs, DEFAULT_MAX_OPEN_TABS);
    const perSiteLimits = options && options.perSiteLimits ? options.perSiteLimits : {};

    const sourceOrder = new Map();
    const sourceStats = new Map();

    for (let i = 0; i < filteredSources.length; i++) {
      const source = filteredSources[i];
      const sourceId = source.id || source.name || `Source ${i + 1}`;
      sourceOrder.set(sourceId, i + 1);
      sourceStats.set(sourceId, {
        source: source,
        totalPages: source.urls.length,
        donePages: 0,
        jobs: []
      });
    }

    const tasks = [];
    filteredSources.forEach((source, idx) => {
      const sourceId = source.id || source.name || `Source ${idx + 1}`;
      const totalPages = source.urls.length;
      source.urls.forEach((url, pageIdx) => {
        tasks.push({
          siteId: sourceId,
          sourceId: sourceId,
          sourceName: sourceId,
          pageIndex: pageIdx + 1,
          totalPages: totalPages,
          run: async () => {
            const pageJobs = await scrapeListFromUrl(url);
            return Array.isArray(pageJobs) ? pageJobs : [];
          }
        });
      });
    });

    if (tasks.length > 0) {
      await setScrapeAllProgress({
        phase: 'scrape',
        status: `Scraping pages: 0/${tasks.length}`,
        progressCurrent: 0,
        progressTotal: tasks.length,
        totalSources: filteredSources.length
      });

      const scrapingStatusSet = new Set();
      await runTasksWithLimits(tasks, maxOpenTabs, perSiteLimits, async (settled) => {
        const task = settled.task;
        const stats = sourceStats.get(task.sourceId);
        if (stats) {
          stats.donePages += 1;
        }

        if (!scrapingStatusSet.has(task.sourceId)) {
          scrapingStatusSet.add(task.sourceId);
          updateDataFunnelStatus(webAppUrl, task.sourceName, task.sourceId, 'Scraping', null, false)
            .catch(error => recordError(`DataFunnel Scraping ${task.sourceName}: ${error.message}`, true));
        }

        if (settled.error) {
          recordError(`${task.sourceName} page ${task.pageIndex}: ${settled.error.message}`, true);
        } else {
          const taggedJobs = (settled.result || []).map(job => Object.assign({}, job, {
            ScrapePageName: task.sourceId
          }));
          if (taggedJobs.length > 0 && stats) {
            stats.jobs = mergeJobsByUrl(stats.jobs, taggedJobs);
          }
        }

        const progressCurrent = stats ? stats.donePages : task.pageIndex;
        await setScrapeAllProgress({
          phase: 'scrape',
          status: `${task.sourceName}: page ${progressCurrent}/${task.totalPages}`,
          progressCurrent: progressCurrent,
          progressTotal: task.totalPages,
          sourceIndex: sourceOrder.get(task.sourceId) || 0,
          totalSources: filteredSources.length,
          sourceId: task.sourceId,
          sourceName: task.sourceName,
          failedJobs: summary.failedJobs,
          lastError: scrapeAllContext.lastError
        });
      });
    }

    await setScrapeAllProgress({
      phase: 'scrape',
      status: 'List scraping complete. Starting enrichment...',
      progressCurrent: filteredSources.length,
      progressTotal: filteredSources.length
    });

    const allJobsToEnrich = [];
    const dedupTasks = [];
    const dedupResults = new Map();
    for (let i = 0; i < filteredSources.length; i++) {
      const source = filteredSources[i];
      const sourceId = source.id || source.name || `Source ${i + 1}`;
      const sourceName = sourceId;
      const stats = sourceStats.get(sourceId) || { jobs: [], totalPages: source.urls.length, donePages: source.urls.length };

      scrapeAllContext.currentSourceIndex = i + 1;
      scrapeAllContext.currentSourceId = sourceId;
      scrapeAllContext.currentSourceName = sourceName;

      try {
        let batchJobs = stats.jobs || [];
        if (batchJobs.length > 0) {
          const sessionResult = filterSessionDuplicates(batchJobs, sessionDedupKeys);
          if (sessionResult.skipped > 0) {
            summary.skippedDuplicates += sessionResult.skipped;
            scrapeAllContext.skippedDuplicates = summary.skippedDuplicates;
            await setScrapeAllProgress({
              status: `${sourceName}: skipped ${sessionResult.skipped} session duplicates`,
              sourceIndex: i + 1,
              totalSources: filteredSources.length,
              sourceId: sourceId,
              sourceName: sourceName,
              skippedDuplicates: summary.skippedDuplicates
            });
          }
          batchJobs = sessionResult.jobs;
        }

        if (batchJobs.length > 0) {
          dedupTasks.push({
            siteId: sourceId,
            sourceId: sourceId,
            sourceName: sourceName,
            batchJobs: batchJobs,
            run: async () => {
              return await filterDuplicateJobs(webAppUrl, batchJobs);
            }
          });
        } else {
          dedupResults.set(sourceId, { jobs: [], skipped: 0 });
        }
      } catch (error) {
        recordError(`${sourceName}: ${error.message}`, true);
        try {
          await updateDataFunnelStatus(
            webAppUrl,
            sourceName,
            source.id || '',
            `Error: ${formatErrorMessage(error.message)}`,
            null,
            false
          );
        } catch (funnelError) {
          recordError(`DataFunnel Error ${sourceName}: ${funnelError.message}`, true);
        }
      }
    }

    if (dedupTasks.length > 0) {
      const maxDedupConcurrency = Math.max(1, maxOpenTabs);
      let dedupDone = 0;
      await setScrapeAllProgress({
        phase: 'scrape',
        status: `Dedup: 0/${dedupTasks.length}`,
        progressCurrent: 0,
        progressTotal: dedupTasks.length,
        totalSources: filteredSources.length
      });

      await runTasksWithLimits(dedupTasks, maxDedupConcurrency, perSiteLimits, async (settled) => {
        const task = settled.task;
        dedupDone += 1;

        if (settled.error) {
          recordError(`${task.sourceName} dedup: ${settled.error.message}`, true);
          dedupResults.set(task.sourceId, { jobs: [], skipped: 0 });
        } else {
          const result = settled.result || { jobs: task.batchJobs, skipped: 0 };
          const resultJobs = Array.isArray(result.jobs) ? result.jobs : task.batchJobs;
          const skipped = typeof result.skipped === 'number' ? result.skipped : 0;
          dedupResults.set(task.sourceId, { jobs: resultJobs || [], skipped: skipped });
          summary.skippedDuplicates += skipped;
          scrapeAllContext.skippedDuplicates = summary.skippedDuplicates;
        }

        await setScrapeAllProgress({
          phase: 'scrape',
          status: `${task.sourceName}: dedup done (${dedupDone}/${dedupTasks.length})`,
          progressCurrent: dedupDone,
          progressTotal: dedupTasks.length,
          sourceIndex: sourceOrder.get(task.sourceId) || 0,
          totalSources: filteredSources.length,
          sourceId: task.sourceId,
          sourceName: task.sourceName,
          skippedDuplicates: summary.skippedDuplicates,
          lastError: scrapeAllContext.lastError
        });
      });
    }

    allJobsToEnrich.length = 0;
    for (let i = 0; i < filteredSources.length; i++) {
      const source = filteredSources[i];
      const sourceId = source.id || source.name || `Source ${i + 1}`;
      const stats = sourceStats.get(sourceId);
      const aggregate = dedupResults.get(sourceId);
      if (aggregate && Array.isArray(aggregate.jobs) && stats) {
        stats.jobs = aggregate.jobs;
      }
      const jobs = stats && Array.isArray(stats.jobs) ? stats.jobs : [];
      if (jobs.length > 0) {
        allJobsToEnrich.push(...jobs);
      }
    }

    let enrichedJobs = [];
    if (allJobsToEnrich.length > 0) {
      await setScrapeAllProgress({
        phase: 'enrich',
        status: `Enriching ${allJobsToEnrich.length} jobs across sources...`,
        progressCurrent: 0,
        progressTotal: allJobsToEnrich.length,
        totalSources: filteredSources.length
      });

      const enrichmentResult = await enrichJobsParallel(allJobsToEnrich, {
        maxOpenTabs: maxOpenTabs,
        perSiteLimits: perSiteLimits,
        sourceOrder: sourceOrder,
        totalSources: filteredSources.length
      });
      if (enrichmentResult.errors && enrichmentResult.errors.length > 0) {
        const last = enrichmentResult.errors[enrichmentResult.errors.length - 1];
        recordError(last, false);
      }
      summary.failedJobs += enrichmentResult.failed || 0;
      summary.notificationShellDropped += enrichmentResult.notificationShellDropped || 0;
      scrapeAllContext.failedJobs = summary.failedJobs;
      scrapeAllContext.notificationShellDropped = summary.notificationShellDropped;
      enrichedJobs = enrichmentResult.enrichedJobs || allJobsToEnrich.filter(job => job.enriched);
      await setScrapeAllProgress({
        phase: 'enrich',
        failedJobs: summary.failedJobs,
        notificationShellDropped: summary.notificationShellDropped || 0,
        lastError: scrapeAllContext.lastError
      });
    }

    const jobsBySource = new Map();
    (enrichedJobs || []).forEach(job => {
      const key = String(job.ScrapePageName || '').trim();
      if (!key) return;
      if (!jobsBySource.has(key)) {
        jobsBySource.set(key, []);
      }
      jobsBySource.get(key).push(job);
    });

    for (let i = 0; i < filteredSources.length; i++) {
      const source = filteredSources[i];
      const sourceId = source.id || source.name || `Source ${i + 1}`;
      const sourceName = sourceId;
      const sourceJobs = jobsBySource.get(sourceId) || [];

      scrapeAllContext.currentSourceIndex = i + 1;
      scrapeAllContext.currentSourceId = sourceId;
      scrapeAllContext.currentSourceName = sourceName;

      try {
        if (sourceJobs.length > 0) {
          const appendResult = await appendStageRows(webAppUrl, sourceJobs);
          summary.stagedJobs += appendResult.appended || sourceJobs.length;
          scrapeAllContext.stagedJobs = summary.stagedJobs;
          await setScrapeAllProgress({
            stagedJobs: summary.stagedJobs
          });
        }

        try {
          await updateDataFunnelStatus(webAppUrl, sourceName, source.id || '', 'Staged', sourceJobs.length, false);
        } catch (error) {
          recordError(`DataFunnel Staged ${sourceName}: ${error.message}`, true);
        }
      } catch (error) {
        recordError(`${sourceName}: ${error.message}`, true);
        try {
          await updateDataFunnelStatus(
            webAppUrl,
            sourceName,
            source.id || '',
            `Error: ${formatErrorMessage(error.message)}`,
            null,
            false
          );
        } catch (funnelError) {
          recordError(`DataFunnel Error ${sourceName}: ${funnelError.message}`, true);
        }
      } finally {
        summary.sourcesProcessed++;
        await setScrapeAllProgress({
          phase: 'scrape',
          status: `${sourceName}: done`,
          sourceIndex: i + 1,
          totalSources: filteredSources.length,
          sourceName: sourceName,
          stagedJobs: summary.stagedJobs,
          failedJobs: summary.failedJobs,
          lastError: scrapeAllContext.lastError
        });
      }
    }
  }

  /**
   * Enriches jobs across all sources in parallel, respecting global and per-site limits.
   */
  async function enrichJobsParallel(jobsList, options) {
    if (isEnriching) {
      return { success: false, error: 'Enrichment already in progress', enrichedJobs: [] };
    }

    if (!Array.isArray(jobsList) || jobsList.length === 0) {
      return { success: false, error: 'No jobs to enrich', enrichedJobs: [] };
    }

    const unenrichedJobs = jobsList.filter(job => !job.enriched || job.enriched === false);
    if (unenrichedJobs.length === 0) {
      return { success: false, error: 'All jobs are already enriched', enrichedJobs: jobsList };
    }

    let jobsToEnrich = unenrichedJobs;
    if (TEST_MODE && jobsToEnrich.length > TEST_MODE_MAX_JOBS) {
      console.log(`[TEST_MODE] Limiting enrichment from ${jobsToEnrich.length} to ${TEST_MODE_MAX_JOBS} jobs`);
      jobsToEnrich = jobsToEnrich.slice(0, TEST_MODE_MAX_JOBS);
    }

    isEnriching = true;
    enrichmentState = {
      isEnriching: true,
      total: jobsToEnrich.length,
      completed: 0
    };

    const results = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
      enrichedJobs: [],
      notificationShellDropped: 0
    };

    await browser.storage.local.set({
      enrichmentProgress: {
        processed: 0,
        completed: 0,
        total: jobsToEnrich.length,
        current: 0,
        isEnriching: true,
        startedAt: Date.now()
      }
    });

    const totalJobs = jobsToEnrich.length;
    const maxOpenTabs = parsePositiveInt(options && options.maxOpenTabs, DEFAULT_MAX_OPEN_TABS);
    const sourceOrder = options && options.sourceOrder ? options.sourceOrder : new Map();
    const totalSources = options && options.totalSources ? options.totalSources : 0;

    const perSiteLimits = Object.assign({}, options && options.perSiteLimits ? options.perSiteLimits : {});

    const tasks = jobsToEnrich.map((job, index) => {
      const sourceId = String(job.ScrapePageName || '').trim() || 'unknown';
      return {
        siteId: sourceId,
        sourceId: sourceId,
        sourceName: sourceId,
        jobIndex: index + 1,
        totalJobs: totalJobs,
        job: job,
        run: async () => {
          let tab = null;
          try {
            if (sourceId === 'linkedin' || sourceId === 'wellfound') {
              const jitter = ENRICH_LINKEDIN_DELAY_MIN_MS + Math.floor(Math.random() * (ENRICH_LINKEDIN_DELAY_MAX_MS - ENRICH_LINKEDIN_DELAY_MIN_MS + 1));
              await sleep(jitter);
            }

            tab = await browser.tabs.create({
              url: job.JobUrl,
              active: false
            });

            await waitForTabLoad(tab.id);
            await sleep(ENRICH_TAB_READY_WAIT_MS);
            const detailReady = await waitForEnrichDetailReadyWithRecovery_(tab.id, sourceId, job.JobUrl);
            if (!detailReady.ready) {
              console.warn(`[enrich] Detail readiness timeout (${sourceId}) ${job.JobUrl} reason=${detailReady.reason}`);
              if (normalizeSiteKey(sourceId || '') === 'revelo') {
                throw new Error(`Detail readiness timeout (${sourceId}) ${detailReady.reason || 'unknown'}`);
              }
            }

            const response = await sendScrapeJobWithRetry(tab.id, sourceId);
            if (response && response.success && response.data) {
              if (response.data.__dropFromStage) {
                return {
                  droppedNotificationShell: response.data.__dropReason === 'linkedin_notifications_shell'
                };
              }
              mergeJobDataPreserveFilled(job, response.data);
              job.enriched = true;
              job.Status = 'Staged';
              return true;
            }

            throw new Error(response?.error || 'Unknown error');
          } finally {
            if (tab && tab.id) {
              try {
                await browser.tabs.remove(tab.id);
              } catch (e) {
                // Ignore tab close errors
              }
            }
          }
        }
      };
    });

    await runTasksWithLimits(tasks, maxOpenTabs, perSiteLimits, async (settled) => {
      const task = settled.task;
      const job = task.job;
      if (settled.error) {
        results.failed++;
        const message = `${task.sourceName}: ${settled.error.message}`;
        results.errors.push(message);
        scrapeAllContext.lastError = message;
      } else {
        const droppedNotificationShell = !!(settled.result && settled.result.droppedNotificationShell);
        if (droppedNotificationShell) {
          results.notificationShellDropped++;
          scrapeAllContext.notificationShellDropped = results.notificationShellDropped;
        } else {
          results.processed++;
          results.enrichedJobs.push(job);
        }
      }

      enrichmentState.completed = getEnrichmentCompletedCount_(results);
      await browser.storage.local.set({
        enrichmentProgress: {
          processed: results.processed,
          completed: enrichmentState.completed,
          total: totalJobs,
          current: enrichmentState.completed,
          isEnriching: true
        }
      });

      if (scrapeAllContext.active) {
        await setScrapeAllProgress({
          phase: 'enrich',
          progressCurrent: enrichmentState.completed,
          progressTotal: totalJobs,
          status: `Enriching ${task.sourceName}: ${enrichmentState.completed}/${totalJobs}`,
          sourceIndex: sourceOrder.get(task.sourceId) || 0,
          totalSources: totalSources || scrapeAllContext.totalSources,
          sourceId: task.sourceId,
          sourceName: task.sourceName,
          failedJobs: scrapeAllContext.failedJobs,
          notificationShellDropped: scrapeAllContext.notificationShellDropped,
          lastError: scrapeAllContext.lastError
        });
      }
    });

    isEnriching = false;
    enrichmentState.isEnriching = false;

    await browser.storage.local.set({
      enrichmentProgress: {
        processed: results.processed,
        completed: getEnrichmentCompletedCount_(results),
        total: totalJobs,
        current: getEnrichmentCompletedCount_(results),
        isEnriching: false,
        completedAt: Date.now()
      }
    });

    if (scrapeAllContext.active) {
      await setScrapeAllProgress({
        phase: 'enrich',
        progressCurrent: getEnrichmentCompletedCount_(results),
        progressTotal: totalJobs,
        notificationShellDropped: results.notificationShellDropped || 0,
        status: `Enrichment complete (${getEnrichmentCompletedCount_(results)}/${totalJobs})`
      });
    }

    return results;
  }

  /**
   * Enriches a list of jobs by opening each job URL and scraping details.
   */
  async function enrichJobsList(jobsList, options) {
    if (isEnriching) {
      return { success: false, error: 'Enrichment already in progress', enrichedJobs: [] };
    }

    if (!Array.isArray(jobsList) || jobsList.length === 0) {
      return { success: false, error: 'No jobs to enrich', enrichedJobs: [] };
    }

    const unenrichedJobs = jobsList.filter(job => !job.enriched || job.enriched === false);
    if (unenrichedJobs.length === 0) {
      return { success: false, error: 'All jobs are already enriched', enrichedJobs: jobsList };
    }

    // TEST MODE: Limit enrichment to first N jobs
    let jobsToEnrich = unenrichedJobs;
    if (TEST_MODE && jobsToEnrich.length > TEST_MODE_MAX_JOBS) {
      console.log(`[TEST_MODE] Limiting enrichment from ${jobsToEnrich.length} to ${TEST_MODE_MAX_JOBS} jobs`);
      jobsToEnrich = jobsToEnrich.slice(0, TEST_MODE_MAX_JOBS);
    }

    isEnriching = true;
    enrichmentState = {
      isEnriching: true,
      total: jobsToEnrich.length,
      completed: 0
    };
    enrichmentQueue = jobsToEnrich.map((job, index) => ({
      job: job,
      index: index
    }));

    const results = {
      success: true,
      processed: 0,
      failed: 0,
      errors: [],
      enrichedJobs: [],
      notificationShellDropped: 0
    };

    await browser.storage.local.set({
      enrichmentProgress: {
        processed: 0,
        completed: 0,
        total: enrichmentQueue.length,
        current: 0,
        isEnriching: true,
        startedAt: Date.now()
      }
    });

    const totalJobs = enrichmentQueue.length;
    let nextIndex = 0;

    const sourceIdForEnrich = scrapeAllContext.currentSourceId || (jobsList[0] && jobsList[0].ScrapePageName) || '';

    const processJob = async (queueIndex) => {
      const queueItem = enrichmentQueue[queueIndex];
      const job = queueItem.job;
      let tab = null;

      try {
        if (sourceIdForEnrich === 'linkedin' || sourceIdForEnrich === 'wellfound') {
          const jitter = ENRICH_LINKEDIN_DELAY_MIN_MS + Math.floor(Math.random() * (ENRICH_LINKEDIN_DELAY_MAX_MS - ENRICH_LINKEDIN_DELAY_MIN_MS + 1));
          await sleep(jitter);
        }

        tab = await browser.tabs.create({
          url: job.JobUrl,
          active: false
        });

        await waitForTabLoad(tab.id);
        await sleep(ENRICH_TAB_READY_WAIT_MS);
        const detailReady = await waitForEnrichDetailReadyWithRecovery_(tab.id, sourceIdForEnrich, job.JobUrl);
        if (!detailReady.ready) {
          console.warn(`[enrich] Detail readiness timeout (${sourceIdForEnrich}) ${job.JobUrl} reason=${detailReady.reason}`);
          if (normalizeSiteKey(sourceIdForEnrich || '') === 'revelo') {
            throw new Error(`Detail readiness timeout (${sourceIdForEnrich}) ${detailReady.reason || 'unknown'}`);
          }
        }

        const response = await sendScrapeJobWithRetry(tab.id, sourceIdForEnrich);

        if (response && response.success && response.data) {
          if (response.data.__dropFromStage) {
            if (response.data.__dropReason === 'linkedin_notifications_shell') {
              results.notificationShellDropped++;
            }
          } else {
            mergeJobDataPreserveFilled(job, response.data);
            job.enriched = true;
            job.Status = 'Staged';
            results.processed++;
            results.enrichedJobs.push(job);
          }
        } else {
          results.failed++;
          results.errors.push(`Failed to scrape ${job.JobUrl}: ${response?.error || 'Unknown error'}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Error processing ${job.JobUrl}: ${error.message}`);
      } finally {
        if (tab && tab.id) {
          try {
            await browser.tabs.remove(tab.id);
          } catch (e) {
            // Ignore tab close errors
          }
        }
      }

      enrichmentState.completed = getEnrichmentCompletedCount_(results);
      await browser.storage.local.set({
        enrichmentProgress: {
          processed: results.processed,
          completed: enrichmentState.completed,
          total: totalJobs,
          current: enrichmentState.completed,
          isEnriching: true
        }
      });

      if (scrapeAllContext.active) {
        await setScrapeAllProgress({
          phase: 'enrich',
          progressCurrent: enrichmentState.completed,
          progressTotal: totalJobs,
          status: `${scrapeAllContext.currentSourceName}: ${enrichmentState.completed}/${totalJobs}`
        });
      }

      if (sourceIdForEnrich !== 'linkedin' && sourceIdForEnrich !== 'wellfound') {
        await sleep(ENRICH_BETWEEN_JOBS_MS);
      }
    };

    const worker = async () => {
      while (true) {
        const index = nextIndex;
        if (index >= totalJobs) {
          break;
        }
        nextIndex++;
        await processJob(index);
      }
    };

    const baseConcurrency = ENRICH_CONCURRENCY;
    const maxConcurrency = parsePositiveInt(options && options.maxConcurrency, baseConcurrency);
    const concurrency = Math.max(1, maxConcurrency);
    const workerCount = Math.min(concurrency, totalJobs);
    const workers = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    isEnriching = false;
    enrichmentQueue = [];
    enrichmentState.isEnriching = false;

    await browser.storage.local.set({
      enrichmentProgress: {
        processed: results.processed,
        completed: getEnrichmentCompletedCount_(results),
        total: totalJobs,
        current: getEnrichmentCompletedCount_(results),
        isEnriching: false,
        completedAt: Date.now()
      }
    });

    if (scrapeAllContext.active) {
      await setScrapeAllProgress({
        phase: 'enrich',
        progressCurrent: getEnrichmentCompletedCount_(results),
        progressTotal: totalJobs,
        notificationShellDropped: results.notificationShellDropped || 0,
        status: `${scrapeAllContext.currentSourceName}: enrichment complete (${getEnrichmentCompletedCount_(results)}/${totalJobs})`
      });
    }

    return results;
  }

  /**
   * Starts enrichment process for jobsData (legacy entry point)
   */
  async function startEnrichment() {
    if (isEnriching) {
      return { success: false, error: 'Enrichment already in progress' };
    }

    try {
      const stored = await browser.storage.local.get('jobsData');
      if (stored.jobsData && stored.jobsData.length > 0) {
        jobsData = stored.jobsData;
      }
    } catch (e) {
      console.error('Error loading jobsData from storage:', e);
    }

    if (jobsData.length === 0) {
      return { success: false, error: 'No jobs to enrich. Please scrape job list first.' };
    }

    return enrichJobsList(jobsData);
  }

  async function setScrapeAllProgress(progress) {
    if (progress && typeof progress.progressCurrent === 'number') {
      scrapeAllContext.progressCurrent = progress.progressCurrent;
    }
    if (progress && typeof progress.progressTotal === 'number') {
      scrapeAllContext.progressTotal = progress.progressTotal;
    }
    if (progress && typeof progress.sourceIndex === 'number') {
      scrapeAllContext.currentSourceIndex = progress.sourceIndex;
    }
    if (progress && typeof progress.totalSources === 'number') {
      scrapeAllContext.totalSources = progress.totalSources;
    }
    if (progress && typeof progress.sourceId === 'string') {
      scrapeAllContext.currentSourceId = progress.sourceId;
    }
    if (progress && typeof progress.sourceName === 'string') {
      scrapeAllContext.currentSourceName = progress.sourceName;
    }
    if (progress && typeof progress.stagedJobs === 'number') {
      scrapeAllContext.stagedJobs = progress.stagedJobs;
    }
    if (progress && typeof progress.failedJobs === 'number') {
      scrapeAllContext.failedJobs = progress.failedJobs;
    }
    if (progress && typeof progress.notificationShellDropped === 'number') {
      scrapeAllContext.notificationShellDropped = progress.notificationShellDropped;
    }
    if (progress && typeof progress.lastError === 'string') {
      scrapeAllContext.lastError = progress.lastError;
    }
    if (progress && typeof progress.lastDebug === 'string') {
      scrapeAllContext.lastDebug = progress.lastDebug;
    }
    if (progress && typeof progress.skippedDuplicates === 'number') {
      scrapeAllContext.skippedDuplicates = progress.skippedDuplicates;
    }
    const payload = Object.assign({
      phase: 'scrape',
      totalSources: scrapeAllContext.totalSources,
      sourceIndex: scrapeAllContext.currentSourceIndex,
      sourceId: scrapeAllContext.currentSourceId,
      sourceName: scrapeAllContext.currentSourceName,
      progressCurrent: scrapeAllContext.progressCurrent,
      progressTotal: scrapeAllContext.progressTotal,
      stagedJobs: scrapeAllContext.stagedJobs,
      failedJobs: scrapeAllContext.failedJobs,
      notificationShellDropped: scrapeAllContext.notificationShellDropped || 0,
      skippedDuplicates: scrapeAllContext.skippedDuplicates,
      lastError: scrapeAllContext.lastError,
      lastDebug: scrapeAllContext.lastDebug,
      status: ''
    }, progress || {});

    await browser.storage.local.set({ scrapeAllProgress: payload });
  }

  function summarizeDebug(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return '';
    const sample = entries.slice(0, 6).map(item => {
      const text = String(item || '').replace(/\s+/g, ' ').trim();
      return text.length > 160 ? text.slice(0, 160) + '…' : text;
    });
    return `steps=${entries.length}; ${sample.join(' | ')}`;
  }

  async function appendDebugEvents(debugPayload) {
    if (!debugPayload || !Array.isArray(debugPayload.entries)) return;
    const stored = await browser.storage.local.get(['debugEnabled', 'debugEvents']);
    if (stored.debugEnabled !== true) return;

    const existing = Array.isArray(stored.debugEvents) ? stored.debugEvents : [];
    const timestamp = debugPayload.timestamp || new Date().toISOString();
    const site = debugPayload.site || '';
    const url = debugPayload.url || '';

    const incoming = debugPayload.entries.map(entry => ({
      timestamp: timestamp,
      site: site,
      url: url,
      entry: String(entry || '')
    }));

    const merged = existing.concat(incoming);
    const trimmed = merged.slice(Math.max(merged.length - 20, 0));
    await browser.storage.local.set({ debugEvents: trimmed });
  }

  function isJobspressoUrl(url) {
    if (!url) return false;
    return String(url).toLowerCase().includes('jobspresso.co');
  }

  function isJobspressoFeedUrl(url) {
    if (!url) return false;
    const value = String(url).toLowerCase();
    if (!value.includes('jobspresso.co')) return false;
    return value.includes('feed=job_feed') || value.includes('/remote-work/feed') || value.includes('/feed/');
  }

  function normalizeJobspressoJobUrl(rawUrl) {
    if (!rawUrl) return '';
    let url = String(rawUrl).trim();
    if (!url) return '';
    if (url.startsWith('/')) {
      url = 'https://jobspresso.co' + url;
    }
    url = url.split('#')[0].split('?')[0];
    const match = url.match(/https?:\/\/(?:www\.)?jobspresso\.co\/job\/[^\/\?#]+\/?/i);
    if (match) {
      url = match[0];
    }
    if (!/jobspresso\.co\/job\//i.test(url)) {
      return '';
    }
    if (url.length > 1 && url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  function extractJobspressoJobsFromHtml(html, debugEntries) {
    if (typeof DOMParser === 'undefined') return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const items = Array.from(doc.querySelectorAll('li.job_listing, li.type-job_listing'));
    debugEntries && debugEntries.push(`jobspressoAjaxHtml: {"count":${items.length}}`);

    const jobs = [];
    const seen = new Set();
    items.forEach(item => {
      const linkEl = item.querySelector('a.job_listing-clickbox, a[href*="/job/"]');
      const href = linkEl ? (linkEl.getAttribute('href') || linkEl.href) : '';
      const normalizedUrl = normalizeJobspressoJobUrl(href);
      const finalUrl = normalizedUrl || href || '';
      if (!finalUrl || seen.has(finalUrl)) return;
      seen.add(finalUrl);

      const titleEl = item.querySelector('.position h3, .position strong, .job_listing-title, h3');
      const companyEl = item.querySelector('.company strong, .company');
      const locationEl = item.querySelector('.location');
      const typeEl = item.querySelector('.job-type, .job_listing-type, .job-types');

      jobs.push({
        JobUrl: finalUrl,
        JobId: normalizedUrl ? normalizedUrl.split('/job/')[1] || '' : '',
        JobTitle: String(titleEl ? titleEl.textContent : '').trim(),
        JobCompany: String(companyEl ? companyEl.textContent : '').trim(),
        JobLocation: String(locationEl ? locationEl.textContent : '').trim(),
        JobSeniority: '',
        JobModality: '',
        JobSalary: '',
        JobTags: String(typeEl ? typeEl.textContent : '').trim(),
        JobDescription: '',
        JobPostedDttm: '',
        JobRateDttm: '',
        JobRateNum: '',
        JobRateDesc: '',
        JobRateShortDesc: '',
        RatedModelName: '',
        Status: 'Staged',
        LoadDttm: ''
      });
    });
    return jobs;
  }

  async function scrapeJobspressoAjax(url) {
    const debugEntries = [];
    const baseUrl = new URL(url);
    const params = baseUrl.searchParams;

    const searchKeywords = params.get('search_keywords') || '';
    const searchLocation = params.get('search_location') || '';
    const jobTypes = params.get('job_types') || '';
    const jobCategories = params.get('job_categories') || '';
    const perPage = params.get('per_page') || '30';
    const maxPages = 4; // соответствует "Load more" 3 раза

    const seen = new Set();
    const allJobs = [];

    for (let page = 1; page <= maxPages; page++) {
      const bodyParams = new URLSearchParams();
      bodyParams.set('page', String(page));
      bodyParams.set('per_page', perPage);
      if (searchKeywords) bodyParams.set('search_keywords', searchKeywords);
      if (searchLocation) bodyParams.set('search_location', searchLocation);
      if (jobTypes) bodyParams.set('job_types', jobTypes);
      if (jobCategories) bodyParams.set('job_categories', jobCategories);

      const response = await fetch('https://jobspresso.co/jm-ajax/get_listings/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: bodyParams.toString()
      });
      if (!response.ok) {
        throw new Error(`Jobspresso AJAX fetch failed (${response.status})`);
      }
      const json = await response.json();
      const html = json && json.html ? json.html : '';
      debugEntries.push(`jobspressoAjaxPage: {"page":${page},"found":${json && json.found_jobs ? 'true' : 'false'}}`);
      const jobs = extractJobspressoJobsFromHtml(html, debugEntries);
      jobs.forEach(job => {
        if (!job.JobUrl || seen.has(job.JobUrl)) return;
        seen.add(job.JobUrl);
        allJobs.push(job);
      });
      if (!json || !json.found_jobs || jobs.length === 0) {
        break;
      }
    }

    return { jobs: allJobs, debugEntries };
  }

  async function scrapeListFromUrl(url) {
    if (!url) return [];
    if (isJobspressoUrl(url)) {
      const result = await scrapeJobspressoAjax(url);
      const debugPayload = {
        timestamp: new Date().toISOString(),
        url: url,
        site: 'jobspresso',
        entries: result.debugEntries || []
      };
      await browser.storage.local.set({ lastScrapeDebug: debugPayload });
      await appendDebugEvents(debugPayload);
      return result.jobs || [];
    }
    let tab = null;
    try {
      tab = await browser.tabs.create({ url: url, active: false });
      await waitForTabLoad(tab.id, 30000);
      await sleep(ENRICH_TAB_READY_WAIT_MS);
      const tabInfo = await browser.tabs.get(tab.id).catch(() => null);
      if (tabInfo && isRestrictedTabUrl(tabInfo.url)) {
        await sleep(2000);
      }
      const siteKey = normalizeSiteKey(url);
      let response = null;
      const maxAttempts = siteKey === 'workatastartup'
        ? WAAS_LIST_RELOAD_RETRY_COUNT + 1
        : (siteKey === 'revelo' ? 2 : 1);

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await ensureContentListScript(tab.id);
        const context = await buildListScrapeContext_(url, { scrapeAll: true });
        if (siteKey === 'workatastartup' && attempt > 1) {
          context.waasListReadyTimeoutMultiplier = WAAS_LIST_READY_TIMEOUT_X3;
          context.waasListRetryAttempt = attempt - 1;
        }

        try {
          response = await sendScrapeListMessageWithRetry_(tab.id, context);
        } catch (error) {
          const isReveloRetry = siteKey === 'revelo' && attempt < maxAttempts;
          if (!isReveloRetry) {
            throw error;
          }
          console.warn(`[revelo] scrapeList transport failed, reloading (${attempt}/${maxAttempts - 1}): ${error && error.message ? error.message : error}`);
          await browser.tabs.reload(tab.id);
          await waitForTabLoad(tab.id, 30000);
          await sleep(ENRICH_TAB_READY_WAIT_MS * 2);
          continue;
        }

        if (!response || !response.success) {
          const isReveloRetry = siteKey === 'revelo' && attempt < maxAttempts;
          if (isReveloRetry) {
            console.warn(`[revelo] scrapeList returned unsuccessful response, reloading (${attempt}/${maxAttempts - 1}): ${response && response.error ? response.error : 'unknown'}`);
            await browser.tabs.reload(tab.id);
            await waitForTabLoad(tab.id, 30000);
            await sleep(ENRICH_TAB_READY_WAIT_MS * 2);
            continue;
          }
          throw new Error(response && response.error ? response.error : 'Failed to scrape list');
        }

        const responseJobs = Array.isArray(response.data) ? response.data : [];
        const responseDebug = Array.isArray(response.debug) ? response.debug : [];
        const timedOutOnEmptyList = responseJobs.length === 0 &&
          responseDebug.some(entry => String(entry || '').includes('waasListEmptyAfterReadyTimeout'));

        if (!(siteKey === 'workatastartup' && timedOutOnEmptyList && attempt < maxAttempts)) {
          break;
        }

        console.warn(`[waas] List page timed out waiting for companies; reloading (${attempt}/${WAAS_LIST_RELOAD_RETRY_COUNT})`);
        await browser.tabs.reload(tab.id);
        await waitForTabLoad(tab.id);
        await sleep(ENRICH_TAB_READY_WAIT_MS * WAAS_LIST_READY_TIMEOUT_X3);
      }

      if (response.debug && response.debugMeta) {
        const debugPayload = {
          timestamp: new Date().toISOString(),
          url: response.debugMeta.url || url,
          site: response.debugMeta.site || '',
          entries: response.debug
        };
        await browser.storage.local.set({ lastScrapeDebug: debugPayload });
        await appendDebugEvents(debugPayload);
      }
      return response.data || [];
    } finally {
      if (tab && tab.id) {
        try {
          await browser.tabs.remove(tab.id);
        } catch (e) {
          // Ignore tab close errors
        }
      }
    }
  }

  async function buildListScrapeContext_(url, baseContext) {
    const context = Object.assign({}, baseContext || {});
    const value = String(url || '').toLowerCase();
    if (!value.includes('linkedin.com/jobs')) {
      return context;
    }

    const stored = await browser.storage.local.get('linkedinScrollProfile');
    const profile = stored && stored.linkedinScrollProfile;
    if (profile && Array.isArray(profile.steps) && profile.steps.length > 0) {
      context.linkedinRecordedScrollProfile = profile;
    }
    return context;
  }

  function isRestrictedTabUrl(url) {
    if (!url) return true;
    const value = String(url);
    return (
      value.startsWith('about:') ||
      value.startsWith('moz-extension:') ||
      value.startsWith('chrome:') ||
      value.startsWith('file:') ||
      value.startsWith('view-source:')
    );
  }

  async function ensureContentListScript(tabId) {
    try {
      const pingResponse = await browser.tabs.sendMessage(tabId, { action: 'pingList' });
      if (pingResponse && pingResponse.success === true) {
        return;
      }
    } catch (e) {
      // Continue to inject
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      const tabInfo = await browser.tabs.get(tabId).catch(() => null);
      const url = tabInfo && tabInfo.url ? tabInfo.url : '';
      if (!isRestrictedTabUrl(url)) {
        break;
      }
      await sleep(500);
    }

    try {
      await injectContentListBundle_(tabId);
      await sleep(SCRAPE_ALL_PAGE_WAIT_MS);
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message.includes('Missing host permission')) {
        await waitForTabLoad(tabId);
        await sleep(SCRAPE_ALL_PAGE_WAIT_MS * 6);
        await injectContentListBundle_(tabId);
        await sleep(SCRAPE_ALL_PAGE_WAIT_MS);
      } else {
        throw error;
      }
    }

    for (let verifyAttempt = 1; verifyAttempt <= 4; verifyAttempt++) {
      try {
        const pingResponse = await browser.tabs.sendMessage(tabId, { action: 'pingList' });
        if (pingResponse && pingResponse.success === true) {
          return;
        }
      } catch (e) {
        // wait and retry
      }
      await sleep(SCRAPE_ALL_PAGE_WAIT_MS + (verifyAttempt * 150));
    }

    throw new Error('content-list script is not ready after injection');
  }

  async function injectContentListBundle_(tabId) {
    for (let i = 0; i < CONTENT_LIST_INJECT_FILES.length; i++) {
      await browser.tabs.executeScript(tabId, { file: CONTENT_LIST_INJECT_FILES[i] });
    }
  }

  async function sendScrapeListMessageWithRetry_(tabId, context) {
    let lastError = null;
    for (let attempt = 1; attempt <= SCRAPE_LIST_MESSAGE_RETRY_ATTEMPTS; attempt++) {
      try {
        return await browser.tabs.sendMessage(tabId, {
          action: 'scrapeList',
          context: context || {}
        });
      } catch (error) {
        lastError = error;
        if (attempt < SCRAPE_LIST_MESSAGE_RETRY_ATTEMPTS) {
          try {
            await ensureContentListScript(tabId);
          } catch (ensureError) {
            // keep last transport error and continue retry loop
          }
          await sleep(SCRAPE_LIST_MESSAGE_RETRY_DELAY_MS * attempt);
          continue;
        }
      }
    }

    throw lastError || new Error('Failed to send scrapeList message');
  }

  function normalizeJobUrlForKey(rawUrl) {
    if (!rawUrl) return '';
    const value = String(rawUrl).trim();
    if (!value) return '';
    try {
      const parsed = new URL(value);
      const host = String(parsed.hostname || '').toLowerCase();
      let path = parsed.pathname || '';
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      return host + path;
    } catch (error) {
      let cleaned = value.split('#')[0].split('?')[0].trim();
      cleaned = cleaned.replace(/^https?:\/\//i, '');
      if (cleaned.length > 1 && cleaned.endsWith('/')) {
        cleaned = cleaned.slice(0, -1);
      }
      return cleaned.toLowerCase();
    }
  }

  function extractHostFromUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      return String(new URL(String(rawUrl)).hostname || '').toLowerCase();
    } catch (error) {
      let cleaned = String(rawUrl).trim();
      cleaned = cleaned.replace(/^https?:\/\//i, '');
      return cleaned.split('/')[0].toLowerCase();
    }
  }

  function buildJobDedupKey(job) {
    if (!job) return '';
    const jobId = String(job.JobId || '').trim();
    const jobUrl = String(job.JobUrl || '').trim();
    const host = extractHostFromUrl(jobUrl);
    if (jobId && host) {
      return `id|${host}|${jobId}`;
    }
    if (jobId) {
      return `id|${jobId}`;
    }
    const urlKey = normalizeJobUrlForKey(jobUrl);
    if (urlKey) {
      return `url|${urlKey}`;
    }
    return '';
  }

  function mergeJobDataPreserveFilled(targetJob, incomingData) {
    if (!targetJob || !incomingData || typeof incomingData !== 'object') {
      return targetJob;
    }
    const keys = Object.keys(incomingData);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const nextValue = incomingData[key];
      if (nextValue === undefined || nextValue === null) {
        continue;
      }
      if (typeof nextValue === 'string' && nextValue.trim() === '') {
        continue;
      }
      targetJob[key] = nextValue;
    }
    return targetJob;
  }

  function filterSessionDuplicates(jobs, seenKeys) {
    const filtered = [];
    let skipped = 0;
    (jobs || []).forEach(job => {
      const key = buildJobDedupKey(job);
      if (!key) {
        filtered.push(job);
        return;
      }
      if (seenKeys.has(key)) {
        skipped += 1;
        return;
      }
      seenKeys.add(key);
      filtered.push(job);
    });
    return { jobs: filtered, skipped: skipped };
  }

  function mergeJobsByUrl(existingJobs, incomingJobs) {
    const merged = [];
    const indexByKey = new Map();

    (existingJobs || []).forEach(job => {
      const key = buildJobDedupKey(job);
      if (!key) return;
      indexByKey.set(key, merged.length);
      merged.push(job);
    });

    (incomingJobs || []).forEach(job => {
      const key = buildJobDedupKey(job);
      if (!key) return;
      const existingIndex = indexByKey.get(key);
      if (existingIndex === undefined) {
        indexByKey.set(key, merged.length);
        merged.push(job);
        return;
      }

      const existing = merged[existingIndex] || {};
      const updated = Object.assign({}, existing);
      Object.keys(job).forEach(keyName => {
        const newValue = job[keyName];
        if (updated[keyName] === '' || updated[keyName] === null || updated[keyName] === undefined) {
          if (newValue !== '' && newValue !== null && newValue !== undefined) {
            updated[keyName] = newValue;
          }
        }
      });
      merged[existingIndex] = updated;
    });

    return merged;
  }

  function parsePositiveInt(value, fallback) {
    const num = parseInt(String(value || '').trim(), 10);
    if (Number.isNaN(num) || num <= 0) {
      return fallback;
    }
    return num;
  }

  function normalizeSiteKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('linkedin')) return 'linkedin';
    if (raw.includes('wellfound')) return 'wellfound';
    if (raw.includes('lever') || raw.includes('jobs.lever.co') || raw.includes('dlocal')) return 'lever';
    if (raw.includes('career.habr.com') || raw.startsWith('habr')) return 'habr';
    if (raw.includes('headhunter') || raw.includes('hh.ru')) return 'hh';
    if (raw.includes('getonbrd')) return 'getonbrd';
    if (raw.includes('computrabajo')) return 'computrabajo';
    if (raw.includes('jobspresso')) return 'jobspresso';
    if (raw.includes('workatastartup') || raw.includes('ycombinator')) return 'workatastartup';
    if (raw.includes('torc.dev') || raw.includes('platform.torc.dev') || raw === 'torc') return 'torc';
    if (raw.includes('revelo')) return 'revelo';
    return raw;
  }

  function buildPerSiteLimits(scrapeSources, maxOpenTabs) {
    const limits = {};
    (scrapeSources || []).forEach(source => {
      const key = normalizeSiteKey(source.id || source.name || '');
      if (!key) return;
      const limit = parsePositiveInt(source.maxTabsPerSite, 0);
      if (limit > 0) {
        limits[key] = limit;
      }
    });
    return limits;
  }

  async function runTasksWithLimits(tasks, maxOpenTabs, perSiteLimits, onTaskDone) {
    const queue = Array.isArray(tasks) ? tasks.slice() : [];
    const active = new Set();
    const activeBySite = new Map();
    const results = [];
    const maxTabs = parsePositiveInt(maxOpenTabs, 1);
    const siteLimits = {};
    Object.keys(perSiteLimits || {}).forEach(key => {
      const normalized = normalizeSiteKey(key);
      if (!normalized) return;
      siteLimits[normalized] = perSiteLimits[key];
    });

    const canStartTask = (task) => {
      const siteId = normalizeSiteKey(task.siteId || '');
      const limit = parsePositiveInt(siteLimits[siteId], maxTabs);
      const activeCount = activeBySite.get(siteId) || 0;
      return activeCount < limit;
    };

    while (queue.length > 0 || active.size > 0) {
      while (queue.length > 0 && active.size < maxTabs) {
        const nextIndex = queue.findIndex(canStartTask);
        if (nextIndex === -1) {
          break;
        }
        const task = queue.splice(nextIndex, 1)[0];
        const siteId = normalizeSiteKey(task.siteId || '');
        activeBySite.set(siteId, (activeBySite.get(siteId) || 0) + 1);

        let promise = null;
        promise = (async () => {
          try {
            const result = await task.run();
            return { task, result };
          } catch (error) {
            return { task, error: error };
          }
        })();

        promise = promise.finally(() => {
          active.delete(promise);
          const current = (activeBySite.get(siteId) || 1) - 1;
          if (current <= 0) {
            activeBySite.delete(siteId);
          } else {
            activeBySite.set(siteId, current);
          }
        });

        active.add(promise);
      }

      if (active.size === 0) {
        break;
      }

      const settled = await Promise.race(active);
      results.push(settled);
      if (onTaskDone) {
        await onTaskDone(settled);
      }
    }

    return results;
  }

  async function fetchScrapeListEntries(sheetId) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=ScrapeList`;
    const response = await fetch(csvUrl, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch ScrapeList (${response.status})`);
    }
    const csvText = await response.text();
    // Reverted v1.1.10 strict check. Let parseCsv handle it or fail later.
    const rows = parseCsv(csvText);

    if (!rows || rows.length === 0) {
      console.warn('[scrape] fetchScrapeListEntries: Parsed 0 rows. Raw text preview (first 500 chars):', csvText.substring(0, 500));
      return [];
    }

    const header = rows[0].map(cell => String(cell || '').trim());
    const headerLower = header.map(cell => cell.toLowerCase());
    const nameIndex = headerLower.indexOf('scrapepagename');
    const idIndex = headerLower.indexOf('scrapepageid');
    const urlIndex = headerLower.indexOf('scrapepageurl');

    if (urlIndex === -1) {
      throw new Error('ScrapeList missing ScrapePageUrl column');
    }

    const entries = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const url = String(row[urlIndex] || '').trim();
      if (!url) continue;
      const name = nameIndex !== -1 ? String(row[nameIndex] || '').trim() : '';
      const id = idIndex !== -1 ? String(row[idIndex] || '').trim() : '';
      entries.push({ id: id, name: name, url: url });
    }
    return entries;
  }

  async function getScrapeSources() {
    const sourceUrl = await resolveScrapeListSourceUrl();
    const sheetId = extractSpreadsheetId(sourceUrl);
    if (!sheetId) {
      throw new Error('Could not detect spreadsheet ID from URL');
    }

    try {
      const webAppUrl = await fetchSettingsValue(sheetId, 'WebAppUrl');
      if (webAppUrl) {
        const response = await postWebApp(webAppUrl, { action: 'getScrapeSources', enabledOnly: true });
        if (response && response.sources && response.sources.length > 0) {
          return response.sources.map(source => ({
            id: source.id || '',
            name: source.name || source.id || '',
            count: 0,
            maxTabsPerSite: source.maxTabsPerSite || ''
          }));
        }
      }
    } catch (error) {
      console.warn('[scrape] getScrapeSources from WebApp failed, using ScrapeList', error);
    }

    const entries = await fetchScrapeListEntries(sheetId);
    const grouped = groupScrapeListEntries(entries);
    return grouped.map(group => ({
      id: group.id || '',
      name: group.name,
      count: group.urls.length,
      maxTabsPerSite: ''
    }));
  }

  function buildLRatePromptInput_(row) {
    const safe = row || {};
    const leaseId = String(safe.LeaseId || safe.leaseId || '').trim();
    const completionMarker = buildLRateCompletionMarker_(leaseId);
    const lines = [
      'TechnicalContract:',
      `LRateLeaseId: ${leaseId}`,
      `Return first line exactly: LRateLeaseId=${leaseId}`,
      'Return rating line exactly: JobRateNum=<0..5>',
      `Return final line exactly: ${completionMarker}`,
      '',
      `JobTitle: ${String(safe.JobTitle || '').trim()}`,
      `JobCompany: ${String(safe.JobCompany || '').trim()}`,
      `JobLocation: ${String(safe.JobLocation || '').trim()}`,
      `JobSeniority: ${String(safe.JobSeniority || '').trim()}`,
      `JobModality: ${String(safe.JobModality || '').trim()}`,
      `JobEasyApplyFlg: ${String(safe.JobEasyApplyFlg || '').trim()}`,
      `JobSalary: ${String(safe.JobSalary || '').trim()}`,
      `JobTags: ${String(safe.JobTags || '').trim()}`,
      'JobDescription:',
      String(safe.JobDescription || '').trim()
    ];
    return lines.join('\n');
  }

  function buildLRateCombinedPromptInput_(lRatePrompt, row) {
    const bootstrapText = String(lRatePrompt || '').trim();
    const vacancyText = String(buildLRatePromptInput_(row) || '').trim();
    if (!bootstrapText) {
      return vacancyText;
    }
    if (!vacancyText) {
      return bootstrapText;
    }
    return `${bootstrapText}\n\n--- VACANCY ---\n${vacancyText}`;
  }

  function normalizeLRateRowKeyPart_(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function buildLRateRowKey_(row) {
    const safe = row || {};
    const explicit = String(safe.RowKey || '').trim();
    if (explicit) {
      return explicit;
    }
    const stableJobKey = String(safe.StableJobKey || safe.stableJobKey || '').trim();
    if (stableJobKey) {
      return stableJobKey;
    }

    const jobId = String(safe.JobId || '').trim();
    const jobUrl = String(safe.JobUrl || '').trim();
    const host = extractHostFromUrl(jobUrl);
    const normalizedUrl = normalizeJobUrlForKey(jobUrl);

    if (jobId && host) {
      return `id|${host}|${jobId}`;
    }
    if (normalizedUrl) {
      return `url|${normalizedUrl}`;
    }
    if (jobId) {
      return `id|${jobId}`;
    }

    const signature = [
      normalizeLRateRowKeyPart_(safe.JobCompany),
      normalizeLRateRowKeyPart_(safe.JobTitle),
      normalizeLRateRowKeyPart_(safe.JobLocation),
      normalizeLRateRowKeyPart_(safe.JobModality),
      normalizeLRateRowKeyPart_(safe.JobSeniority)
    ].filter(Boolean);

    if (signature.length > 0) {
      return `sig|${signature.join('|')}`;
    }

    const rowNum = Number(safe.rowNum || 0);
    return rowNum > 0 ? `row|${rowNum}` : '';
  }

  function computePromptHash_(value) {
    var text = String(value || '');
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function parseNumberedSections_(text) {
    const content = String(text || '').replace(/\r\n/g, '\n').trim();
    const sections = {};
    if (!content) {
      return sections;
    }

    // Accept common markdown variants:
    // "1) ...", "1. ...", "**1) ...**", "### 1) ...", "- 1) ..."
    const markerRe = /(?:^|\n)\s*(?:[#>*\-]\s*)?(?:\*\*)?(\d{1,2})(?:\*\*)?\s*[\)\.\-:–—]?\s+/gm;
    const marks = [];
    let match;
    while ((match = markerRe.exec(content)) !== null) {
      marks.push({
        num: parseInt(match[1], 10),
        start: match.index + (match[0].startsWith('\n') ? 1 : 0),
        contentStart: markerRe.lastIndex
      });
    }

    if (marks.length === 0) {
      sections[1] = content;
      return sections;
    }

    for (let i = 0; i < marks.length; i++) {
      const current = marks[i];
      const next = marks[i + 1];
      const end = next ? next.start : content.length;
      const body = content.slice(current.contentStart, end).trim();
      sections[current.num] = body;
    }
    return sections;
  }

  function buildLRateCompletionMarker_(leaseId) {
    const normalizedLeaseId = String(leaseId || '').trim();
    return normalizedLeaseId ? `LRateResponseComplete=${normalizedLeaseId}` : '';
  }

  function getLastNonEmptyLine_(text) {
    const lines = String(text || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(function(line) { return String(line || '').trim(); })
      .filter(function(line) { return line.length > 0; });
    return lines.length > 0 ? lines[lines.length - 1] : '';
  }

  function parseLRateCompletionMarker_(line) {
    const text = String(line || '').trim();
    if (!text) {
      return '';
    }
    const match = text.match(/^LRateResponseComplete\s*[:=]\s*([a-z0-9_-]+)\s*$/i);
    return match && match[1] ? String(match[1] || '').trim() : '';
  }

  function hasLRateCompletionMarker_(text, expectedLeaseId) {
    const normalizedExpectedLeaseId = String(expectedLeaseId || '').trim();
    const parsedLeaseId = parseLRateCompletionMarker_(getLastNonEmptyLine_(text));
    if (!parsedLeaseId) {
      return false;
    }
    return !normalizedExpectedLeaseId || parsedLeaseId === normalizedExpectedLeaseId;
  }

  function parseLRateResponse_(responseText, expectedLeaseId) {
    const whole = String(responseText || '').replace(/\r\n/g, '\n').trim();
    if (!whole) {
      throw new Error('Empty LRate response');
    }
    const normalizedExpectedLeaseId = String(expectedLeaseId || '').trim();
    const parsedCompletionLeaseId = parseLRateCompletionMarker_(getLastNonEmptyLine_(whole));
    if (!parsedCompletionLeaseId) {
      throw new Error('Could not parse final LRateResponseComplete line');
    }
    if (normalizedExpectedLeaseId && parsedCompletionLeaseId !== normalizedExpectedLeaseId) {
      throw new Error('LRateResponseComplete mismatch');
    }
    const leaseMatch = whole.match(/\blrateleaseid\s*[:=]\s*([a-z0-9_-]+)/i);
    if (!leaseMatch || leaseMatch[1] === undefined) {
      throw new Error('Could not parse LRateLeaseId in format LRateLeaseId[:|=]<id>');
    }
    const parsedLeaseId = String(leaseMatch[1] || '').trim();
    if (!parsedLeaseId) {
      throw new Error('Could not parse LRateLeaseId value');
    }
    if (normalizedExpectedLeaseId && parsedLeaseId !== normalizedExpectedLeaseId) {
      throw new Error('LRateLeaseId mismatch');
    }

    const rateMatch = whole.match(/\bjobratenum\s*[:=]\s*([0-5])(?!\s*[-–—/]\s*[0-9])\b/i);
    if (!rateMatch || rateMatch[1] === undefined) {
      throw new Error('Could not parse JobRateNum in format JobRateNum[:|=]<0..5>');
    }
    const rateNum = parseInt(rateMatch[1], 10);
    if (isNaN(rateNum)) {
      throw new Error('Could not parse JobRateNum value');
    }

    const shortTail = whole
      .slice((rateMatch.index || 0) + rateMatch[0].length)
      .replace(/^[\s:;\-–—]+/, '');
    const shortDesc = shortTail.split(/\n\s*\n/)[0].trim();

    let top3Want = '';
    const wantMarker = whole.match(/на\s+самом\s+деле\s+хотят/iu);
    if (wantMarker && wantMarker.index !== undefined) {
      const wantTail = whole
        .slice(wantMarker.index + wantMarker[0].length)
        .replace(/^[\s:;\-–—]+/, '');
      top3Want = wantTail.split(/\n\s*\n/)[0].trim();
    }

    return {
      lRateLeaseId: parsedLeaseId,
      jobRateNum: rateNum,
      jobRateDesc: whole,
      jobRateShortDesc: shortDesc,
      jobTop3Want: top3Want
    };
  }

  async function executeScriptInTab_(tabId, code) {
    const result = await browser.tabs.executeScript(tabId, { code: code });
    return Array.isArray(result) ? result[0] : null;
  }

  async function getChatGptState_(tabId) {
    const code = `(function () {
      function collectAssistantTexts() {
        var candidates = [];
        var byRole = document.querySelectorAll('[data-message-author-role="assistant"]');
        for (var i = 0; i < byRole.length; i++) {
          var t = (byRole[i].innerText || byRole[i].textContent || '').trim();
          if (t) candidates.push(t);
        }
        if (candidates.length === 0) {
          var prose = document.querySelectorAll('article .markdown, article .prose, .markdown.prose');
          for (var j = 0; j < prose.length; j++) {
            var p = (prose[j].innerText || prose[j].textContent || '').trim();
            if (p) candidates.push(p);
          }
        }
        return candidates;
      }

      function collectUserTexts() {
        var candidates = [];
        var byRole = document.querySelectorAll('[data-message-author-role="user"]');
        for (var i = 0; i < byRole.length; i++) {
          var t = (byRole[i].innerText || byRole[i].textContent || '').trim();
          if (t) candidates.push(t);
        }
        return candidates;
      }

      function findComposer() {
        return document.querySelector('#prompt-textarea, textarea#prompt-textarea, textarea[data-testid*="prompt"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]');
      }

      function getComposerTextLength(composer) {
        if (!composer) return 0;
        if (composer.tagName === 'TEXTAREA') {
          return String(composer.value || '').length;
        }
        return String(composer.innerText || composer.textContent || '').length;
      }

      function findSendButton(composer) {
        var selector = '#composer-submit-button, button[data-testid="send-button"], button[data-testid*="send"], button[aria-label*="Send prompt"], button[aria-label*="Send"], button[type="submit"]';
        if (composer && composer.closest) {
          var form = composer.closest('form');
          if (form) {
            var formBtn = form.querySelector(selector);
            if (formBtn) return formBtn;
          }
        }
        return document.querySelector('#composer-submit-button, button[data-testid="send-button"], button[data-testid*="send"], button[aria-label*="Send prompt"], button[aria-label*="Send"]');
      }

      var composer = findComposer();
      var stopBtn = document.querySelector('button[data-testid*="stop"], button[aria-label*="Stop"], button[title*="Stop"]');
      var sendBtn = findSendButton(composer);
      var assistantTexts = collectAssistantTexts();
      var userTexts = collectUserTexts();
      return {
        hasComposer: !!composer,
        hasStop: !!stopBtn,
        hasSendButton: !!sendBtn,
        sendEnabled: !!(sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true'),
        composerTextLength: getComposerTextLength(composer),
        assistantCount: assistantTexts.length,
        userCount: userTexts.length,
        lastAssistantText: assistantTexts.length > 0 ? assistantTexts[assistantTexts.length - 1] : ''
      };
    })();`;
    return executeScriptInTab_(tabId, code);
  }

  async function waitForChatGptComposer_(tabId, timeoutMs) {
    var started = Date.now();
    while (Date.now() - started < timeoutMs) {
      var state = await getChatGptState_(tabId);
      if (state && state.hasComposer) {
        return true;
      }
      await sleep(800);
    }
    return false;
  }

  async function waitForChatGptPageReady_(tabId, timeoutMs) {
    var started = Date.now();
    var stableTicks = 0;
    while (Date.now() - started < timeoutMs) {
      var ready = await executeScriptInTab_(tabId, `(function () {
        var readyState = document.readyState || '';
        var composer = document.querySelector('#prompt-textarea, textarea#prompt-textarea, textarea[data-testid*="prompt"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]');
        var isComposerUsable = !!(composer && !composer.disabled);
        var isReadyStateOk = readyState === 'complete' || readyState === 'interactive';
        // Do not require send button here: in ChatGPT UI it may appear only after input.
        var isReady = isReadyStateOk && isComposerUsable;
        return { isReady: isReady };
      })();`);
      if (ready && ready.isReady) {
        stableTicks++;
        if (stableTicks >= 3) {
          return true;
        }
      } else {
        stableTicks = 0;
      }
      await sleep(400);
    }
    return false;
  }

  async function submitPromptToChatGpt_(tabId, promptText) {
    const safePrompt = JSON.stringify(String(promptText || ''));
    const code = `(function () {
      var promptText = ${safePrompt};
      var sendSelector = '#composer-submit-button, button[data-testid="send-button"], button[data-testid*="send"], button[aria-label*="Send prompt"], button[aria-label*="Send"], button[type="submit"]';
      function setEditorValue(el, value) {
        if (!el) return false;
        el.focus();
        if (el.tagName === 'TEXTAREA') {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        if (el.isContentEditable) {
          el.textContent = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
          return true;
        }
        return false;
      }

      function findSendButton(editor) {
        if (editor && editor.closest) {
          var form = editor.closest('form');
          if (form) {
            var formBtn = form.querySelector(sendSelector);
            if (formBtn) return formBtn;
          }
        }
        return document.querySelector('#composer-submit-button, button[data-testid="send-button"], button[data-testid*="send"], button[aria-label*="Send prompt"], button[aria-label*="Send"]');
      }

      var editor = document.querySelector('#prompt-textarea, textarea#prompt-textarea, textarea[data-testid*="prompt"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]');
      if (!editor) {
        return { ok: false, error: 'Composer not found' };
      }

      if (!setEditorValue(editor, promptText)) {
        return { ok: false, error: 'Could not write prompt to composer' };
      }

      var sendBtn = findSendButton(editor);
      if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true') {
        sendBtn.click();
        return { ok: true, sent: true, method: 'button' };
      }

      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
      return { ok: true, sent: false, method: 'enter' };
    })();`;
    return executeScriptInTab_(tabId, code);
  }

  async function setChatGptComposerText_(tabId, promptText) {
    const safePrompt = JSON.stringify(String(promptText || ''));
    const code = `(function () {
      var promptText = ${safePrompt};
      function setEditorValue(el, value) {
        if (!el) return false;
        el.focus();
        if (el.tagName === 'TEXTAREA') {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        if (el.isContentEditable) {
          el.textContent = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
          return true;
        }
        return false;
      }

      var editor = document.querySelector('#prompt-textarea, textarea#prompt-textarea, textarea[data-testid*="prompt"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]');
      if (!editor) {
        return { ok: false, error: 'Composer not found' };
      }
      if (!setEditorValue(editor, promptText)) {
        return { ok: false, error: 'Could not write prompt to composer' };
      }
      return { ok: true };
    })();`;
    return executeScriptInTab_(tabId, code);
  }

  async function getChatGptSendButtonState_(tabId) {
    return executeScriptInTab_(tabId, `(function () {
      var sendSelector = '#composer-submit-button, button[data-testid="send-button"], button[data-testid*="send"], button[aria-label*="Send prompt"], button[aria-label*="Send"], button[type="submit"]';
      var editor = document.querySelector('#prompt-textarea, textarea#prompt-textarea, textarea[data-testid*="prompt"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]');
      var sendBtn = null;
      if (editor && editor.closest) {
        var form = editor.closest('form');
        if (form) {
          sendBtn = form.querySelector(sendSelector);
        }
      }
      if (!sendBtn) {
        sendBtn = document.querySelector('#composer-submit-button, button[data-testid="send-button"], button[data-testid*="send"], button[aria-label*="Send prompt"], button[aria-label*="Send"]');
      }
      if (!sendBtn) {
        return { found: false, enabled: false };
      }
      var enabled = !sendBtn.disabled && sendBtn.getAttribute('aria-disabled') !== 'true';
      return { found: true, enabled: enabled };
    })();`);
  }

  async function sendPrefilledPromptOrFallback_(tabId, fallbackPromptText) {
    const clicked = await clickChatGptSendButton_(tabId, 6000);
    if (clicked) {
      return { sent: true, method: 'prefilled' };
    }

    const submit = await submitPromptToChatGpt_(tabId, fallbackPromptText);
    if (!submit || submit.ok !== true) {
      throw new Error(submit && submit.error ? submit.error : 'Failed to submit fallback prompt');
    }
    if (!submit.sent) {
      const clickedFallback = await clickChatGptSendButton_(tabId, 6000);
      if (!clickedFallback) {
        throw new Error('Send button was not clicked for fallback prompt');
      }
    }
    return { sent: true, method: 'fallback' };
  }

  async function clickChatGptSendButton_(tabId, timeoutMs) {
    var started = Date.now();
    while (Date.now() - started < timeoutMs) {
      var clickResult = await executeScriptInTab_(tabId, `(function () {
        var sendSelector = '#composer-submit-button, button[data-testid="send-button"], button[data-testid*="send"], button[aria-label*="Send prompt"], button[aria-label*="Send"], button[type="submit"]';
        var editor = document.querySelector('#prompt-textarea, textarea#prompt-textarea, textarea[data-testid*="prompt"], [contenteditable="true"][role="textbox"], div[contenteditable="true"]');
        var sendBtn = null;
        if (editor && editor.closest) {
          var form = editor.closest('form');
          if (form) {
            sendBtn = form.querySelector(sendSelector);
          }
        }
        if (!sendBtn) {
          sendBtn = document.querySelector('#composer-submit-button, button[data-testid="send-button"], button[data-testid*="send"], button[aria-label*="Send prompt"], button[aria-label*="Send"]');
        }
        if (!sendBtn) {
          return { found: false, clicked: false };
        }
        if (sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true') {
          return { found: true, clicked: false };
        }
        sendBtn.click();
        return { found: true, clicked: true };
      })();`);
      if (clickResult && clickResult.clicked) {
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  async function clickChatGptRetryButtonOnce_(tabId, timeoutMs) {
    var started = Date.now();
    var timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 6000;
    while (Date.now() - started < timeout) {
      var result = await executeScriptInTab_(tabId, `(function () {
        function isVisible(el) {
          if (!el) return false;
          var rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        }
        function canClick(el) {
          if (!el) return false;
          if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
          return isVisible(el);
        }
        function textMatches(value) {
          var text = String(value || '').trim().toLowerCase();
          if (!text) return false;
          return (
            text.indexOf('try again') !== -1 ||
            text.indexOf('regenerate') !== -1 ||
            text.indexOf('retry') !== -1 ||
            text.indexOf('повторить') !== -1 ||
            text.indexOf('перегенер') !== -1
          );
        }
        function firstClickable(nodes) {
          for (var i = 0; i < nodes.length; i++) {
            if (canClick(nodes[i])) return nodes[i];
          }
          return null;
        }

        var directSelectors = [
          'button[aria-label*="Try again" i]',
          'button[title*="Try again" i]',
          'button[aria-label*="Regenerate" i]',
          'button[title*="Regenerate" i]',
          'button[data-testid*="regenerate" i]',
          'button[data-testid*="retry" i]'
        ];
        for (var s = 0; s < directSelectors.length; s++) {
          var directNodes = document.querySelectorAll(directSelectors[s]);
          var directBtn = firstClickable(directNodes);
          if (directBtn) {
            directBtn.click();
            return { clicked: true, method: 'direct' };
          }
        }

        var menuItems = document.querySelectorAll('[role="menuitem"], button, div');
        for (var i = 0; i < menuItems.length; i++) {
          var item = menuItems[i];
          var label = String(item.innerText || item.textContent || '').trim();
          if (!textMatches(label)) continue;
          if (!canClick(item)) continue;
          item.click();
          return { clicked: true, method: 'menu-item' };
        }

        var moreSelectors = [
          'button[aria-label*="More actions" i]',
          'button[title*="More actions" i]',
          'button[aria-haspopup="menu"]'
        ];
        for (var m = 0; m < moreSelectors.length; m++) {
          var moreNodes = document.querySelectorAll(moreSelectors[m]);
          var moreBtn = firstClickable(moreNodes);
          if (moreBtn) {
            moreBtn.click();
            return { clicked: false, method: 'opened-menu' };
          }
        }
        return { clicked: false, method: 'none' };
      })();`);
      if (result && result.clicked) {
        return true;
      }
      await sleep(250);
    }
    return false;
  }

  async function waitForChatGptIdleBeforeSend_(tabId, timeoutMs) {
    var started = Date.now();
    var timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 12000;
    var lastState = null;
    while (Date.now() - started < timeout) {
      var state = await getChatGptState_(tabId);
      lastState = state;
      if (state && state.hasComposer && !state.hasStop) {
        return state;
      }
      await sleep(300);
    }
    return null;
  }

  function isJobRateParseError_(error) {
    var message = String(error && error.message ? error.message : error || '').trim();
    if (!message) {
      return false;
    }
    return (
      message.indexOf('Could not parse final LRateResponseComplete line') !== -1 ||
      message.indexOf('LRateResponseComplete mismatch') !== -1 ||
      message.indexOf('Could not parse LRateLeaseId') !== -1 ||
      message.indexOf('Could not parse LRateLeaseId value') !== -1 ||
      message.indexOf('LRateLeaseId mismatch') !== -1 ||
      message.indexOf('Could not parse JobRateNum') !== -1 ||
      message.indexOf('Could not parse JobRateNum value') !== -1
    );
  }

  async function waitForPromptDispatch_(tabId, baselineState, timeoutMs) {
    var started = Date.now();
    var baseline = baselineState || {};
    var baselineUserCount = Number(baseline.userCount || 0);
    var baselineComposerTextLength = Number(baseline.composerTextLength || 0);
    var baselineHasStop = baseline.hasStop === true;
    var timeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 8000;
    while (Date.now() - started < timeout) {
      var state = await getChatGptState_(tabId);
      var currentUserCount = Number(state && state.userCount || 0);
      var composerTextLength = Number(state && state.composerTextLength || 0);

      if (state && state.hasStop && !baselineHasStop) {
        return { sent: true, signal: 'stop-transition' };
      }
      if (currentUserCount > baselineUserCount) {
        return { sent: true, signal: 'user-count' };
      }
      if (baselineComposerTextLength > 0 && composerTextLength === 0) {
        return { sent: true, signal: 'composer-cleared' };
      }
      await sleep(250);
    }
    var finalState = await getChatGptState_(tabId).catch(function() { return null; });
    return {
      sent: false,
      signal: 'timeout',
      state: finalState
    };
  }

  async function setLRateProgress_(patch) {
    lRateContext = Object.assign({}, lRateContext, patch || {});
    await browser.storage.local.set({ lRateProgress: lRateContext });
  }

  async function waitForChatGptAnswer_(tabId, baselineText, timeoutMs, options) {
    var opts = options || {};
    var started = Date.now();
    var lastText = '';
    var lastTextChangeAt = 0;
    var sendReadyAt = 0;
    var generationDoneAt = 0;
    var baseline = String(baselineText || '').trim();
    var pollMs = typeof opts.pollMs === 'number' && opts.pollMs > 0 ? opts.pollMs : 1200;
    var stableMs = typeof opts.stableMs === 'number' && opts.stableMs > 0 ? opts.stableMs : 2500;
    var confirmationDelayMs = typeof opts.confirmationDelayMs === 'number' && opts.confirmationDelayMs > 0
      ? opts.confirmationDelayMs
      : 1000;
    var requireSendReady = opts.requireSendReady === true;
    var requireGenerationDone = opts.requireGenerationDone !== false;
    var minAssistantCount = typeof opts.minAssistantCount === 'number' && opts.minAssistantCount > 0
      ? Math.floor(opts.minAssistantCount)
      : 0;
    var prefillDelayMs = typeof opts.prefillDelayMs === 'number' && opts.prefillDelayMs >= 0
      ? opts.prefillDelayMs
      : 5000;
    var expectedLeaseId = String(opts.expectedLeaseId || '').trim();
    var prefillText = String(opts.prefillText || '').trim();
    var shouldPrefill = prefillText.length > 0;
    var prefilled = false;
    var ignoreAssistantTexts = Array.isArray(opts.ignoreAssistantTexts)
      ? opts.ignoreAssistantTexts
        .map(function(value) { return String(value || '').trim(); })
        .filter(function(value) { return value.length > 0; })
      : [];

    function isIgnoredAssistantText_(value) {
      var text = String(value || '').trim();
      if (!text) {
        return false;
      }
      for (var i = 0; i < ignoreAssistantTexts.length; i++) {
        if (text === ignoreAssistantTexts[i]) {
          return true;
        }
      }
      return false;
    }

    function hasRequiredCompletionMarker_(value) {
      if (!expectedLeaseId) {
        return true;
      }
      return hasLRateCompletionMarker_(value, expectedLeaseId);
    }

    while (Date.now() - started < timeoutMs) {
      var now = Date.now();
      var state = await getChatGptState_(tabId);
      var text = state && state.lastAssistantText ? String(state.lastAssistantText).trim() : '';
      var assistantCount = state && typeof state.assistantCount === 'number'
        ? Number(state.assistantCount || 0)
        : 0;
      var meetsAssistantCount = minAssistantCount <= 0 || assistantCount >= minAssistantCount;
      var changedFromBaseline = !!(text && text !== baseline && !isIgnoredAssistantText_(text));

      if (shouldPrefill && !prefilled && (now - started) >= prefillDelayMs) {
        var prefillResult = await setChatGptComposerText_(tabId, prefillText);
        if (!prefillResult || prefillResult.ok !== true) {
          throw new Error(prefillResult && prefillResult.error ? prefillResult.error : 'Failed to prefill next prompt');
        }
        prefilled = true;
      }

      if (changedFromBaseline && meetsAssistantCount) {
        if (text === lastText) {
          if (!lastTextChangeAt) {
            lastTextChangeAt = now;
          }
        } else {
          lastText = text;
          lastTextChangeAt = now;
          sendReadyAt = 0;
          generationDoneAt = 0;
        }

        var sendReady = true;
        if (requireSendReady) {
          var sendState = await getChatGptSendButtonState_(tabId);
          sendReady = !!(sendState && sendState.enabled);
          if (sendReady) {
            if (!sendReadyAt) {
              sendReadyAt = now;
            }
          } else {
            sendReadyAt = 0;
          }
        }

        var generationDone = !!(state && state.hasStop !== true);
        if (requireGenerationDone) {
          if (generationDone) {
            if (!generationDoneAt) {
              generationDoneAt = now;
            }
          } else {
            generationDoneAt = 0;
          }
        }

        var textStableMs = lastTextChangeAt > 0 ? (now - lastTextChangeAt) : 0;
        var sendStableMs = requireSendReady
          ? (sendReadyAt > 0 ? (now - sendReadyAt) : 0)
          : stableMs;
        var generationStableMs = requireGenerationDone
          ? (generationDoneAt > 0 ? (now - generationDoneAt) : 0)
          : stableMs;

        if (textStableMs >= stableMs && sendStableMs >= stableMs && generationStableMs >= stableMs && sendReady) {
          // Final confirmation read protects against late UI chunks.
          await sleep(confirmationDelayMs);
          var confirmState = await getChatGptState_(tabId);
          var confirmText = confirmState && confirmState.lastAssistantText ? String(confirmState.lastAssistantText).trim() : '';
          var confirmAssistantCount = confirmState && typeof confirmState.assistantCount === 'number'
            ? Number(confirmState.assistantCount || 0)
            : 0;
          var confirmMeetsAssistantCount = minAssistantCount <= 0 || confirmAssistantCount >= minAssistantCount;
          var confirmChanged = !!(confirmText && confirmText !== baseline && !isIgnoredAssistantText_(confirmText));
          var confirmGenerationDone = !!(confirmState && confirmState.hasStop !== true);
          var confirmHasCompletionMarker = hasRequiredCompletionMarker_(confirmText);

          if (confirmChanged && confirmText === lastText && confirmMeetsAssistantCount && confirmHasCompletionMarker) {
            if (requireSendReady) {
              var confirmSendState = await getChatGptSendButtonState_(tabId);
              if (!confirmSendState || !confirmSendState.enabled) {
                await sleep(pollMs);
                continue;
              }
            }
            if (requireGenerationDone && !confirmGenerationDone) {
              await sleep(pollMs);
              continue;
            }
            return {
              responseText: confirmText,
              prefilled: prefilled
            };
          }

          if (confirmChanged && confirmText !== lastText) {
            lastText = confirmText;
            lastTextChangeAt = Date.now();
            sendReadyAt = 0;
            generationDoneAt = 0;
          } else if (!confirmChanged && lastText) {
            // Keep waiting if response briefly disappeared from selector.
            await sleep(confirmationDelayMs);
          }
        }
      }

      await sleep(pollMs);
    }

    var finalState = await getChatGptState_(tabId).catch(function() { return null; });
    var diag = '';
    if (finalState) {
      var finalText = finalState.lastAssistantText ? String(finalState.lastAssistantText).trim() : '';
      diag =
        `baselineLen=${baseline.length}` +
        `;lastLen=${lastText.length}` +
        `;finalLen=${finalText.length}` +
        `;assistantCount=${Number(finalState.assistantCount || 0)}` +
        `;userCount=${Number(finalState.userCount || 0)}` +
        `;hasStop=${finalState.hasStop === true}` +
        `;sendEnabled=${finalState.sendEnabled === true}` +
        `;composerLen=${Number(finalState.composerTextLength || 0)}`;
    }
    throw new Error(diag ? `Timed out waiting for ChatGPT answer [${diag}]` : 'Timed out waiting for ChatGPT answer');
  }

  const LRATE_CHAT_POOL_STORAGE_KEY = 'lrate_chat_pool_v1';
  const LRATE_CHAT_POOL_VERSION = 1;
  const LRATE_CHAT_POOL_SCOPE = 'global';
  const LRATE_WORKER_ROW_KEYS_STORAGE_KEY = 'lrate_worker_row_keys_v1';
  const LRATE_WORKER_ROW_KEYS_VERSION = 1;

  function parseChatIdFromUrl_(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) {
      return '';
    }
    try {
      const parsed = new URL(value);
      const host = String(parsed.hostname || '').toLowerCase();
      if (host !== 'chatgpt.com' && host !== 'chat.openai.com') {
        return '';
      }
      const match = String(parsed.pathname || '').match(/\/c\/([a-zA-Z0-9_-]+)/);
      return match && match[1] ? String(match[1]) : '';
    } catch (error) {
      return '';
    }
  }

  function isChatUrlValid_(rawUrl) {
    return parseChatIdFromUrl_(rawUrl).length > 0;
  }

  function normalizeLRateChatPool_(rawPool) {
    const nowIso = new Date().toISOString();
    const normalized = {
      version: LRATE_CHAT_POOL_VERSION,
      scope: LRATE_CHAT_POOL_SCOPE,
      updatedAt: nowIso,
      entries: []
    };
    const sourceEntries = Array.isArray(rawPool && rawPool.entries) ? rawPool.entries : [];
    const seenSlots = new Set();
    for (let i = 0; i < sourceEntries.length; i++) {
      const entry = sourceEntries[i] || {};
      const slotIdRaw = parseInt(String(entry.slotId), 10);
      if (isNaN(slotIdRaw) || slotIdRaw < 1 || seenSlots.has(slotIdRaw)) {
        continue;
      }
      seenSlots.add(slotIdRaw);
      const chatUrl = String(entry.chatUrl || '').trim();
      const sentVacancyCountRaw = parseInt(String(entry.sentVacancyCount || 0), 10);
      const sentVacancyCount = isNaN(sentVacancyCountRaw) || sentVacancyCountRaw < 0
        ? 0
        : sentVacancyCountRaw;
      normalized.entries.push({
        slotId: slotIdRaw,
        chatUrl: isChatUrlValid_(chatUrl) ? chatUrl : '',
        sentVacancyCount: sentVacancyCount,
        lastPromptHash: String(entry.lastPromptHash || '').trim(),
        lastSheetId: String(entry.lastSheetId || '').trim(),
        lastUsedAt: String(entry.lastUsedAt || '').trim() || nowIso,
        createdAt: String(entry.createdAt || '').trim() || nowIso
      });
    }
    normalized.entries.sort(function(a, b) {
      return a.slotId - b.slotId;
    });
    return normalized;
  }

  async function loadLRateChatPool_() {
    const stored = await browser.storage.local.get(LRATE_CHAT_POOL_STORAGE_KEY);
    return normalizeLRateChatPool_(stored ? stored[LRATE_CHAT_POOL_STORAGE_KEY] : null);
  }

  async function saveLRateChatPool_(pool) {
    const normalized = normalizeLRateChatPool_(pool);
    normalized.updatedAt = new Date().toISOString();
    await browser.storage.local.set({
      [LRATE_CHAT_POOL_STORAGE_KEY]: normalized
    });
    return normalized;
  }

  function normalizeLRateWorkerRowKeys_(rawState) {
    const nowIso = new Date().toISOString();
    const normalized = {
      version: LRATE_WORKER_ROW_KEYS_VERSION,
      updatedAt: nowIso,
      workers: {}
    };
    const sourceWorkers = rawState && rawState.workers && typeof rawState.workers === 'object'
      ? rawState.workers
      : {};
    const workerIds = Object.keys(sourceWorkers);
    for (let i = 0; i < workerIds.length; i++) {
      const workerId = parseInt(String(workerIds[i]), 10);
      if (isNaN(workerId) || workerId < 1) {
        continue;
      }
      const entry = sourceWorkers[workerIds[i]] || {};
      const rowKey = String(entry.rowKey || '').trim();
      if (!rowKey) {
        continue;
      }
      const rowNum = parseInt(String(entry.rowNum || 0), 10);
      normalized.workers[String(workerId)] = {
        workerId: workerId,
        rowKey: rowKey,
        leaseId: String(entry.leaseId || '').trim(),
        rowNum: isNaN(rowNum) || rowNum < 2 ? 0 : rowNum,
        jobUrl: String(entry.jobUrl || '').trim(),
        updatedAt: String(entry.updatedAt || '').trim() || nowIso
      };
    }
    return normalized;
  }

  async function loadLRateWorkerRowKeys_() {
    const stored = await browser.storage.local.get(LRATE_WORKER_ROW_KEYS_STORAGE_KEY);
    return normalizeLRateWorkerRowKeys_(stored ? stored[LRATE_WORKER_ROW_KEYS_STORAGE_KEY] : null);
  }

  async function saveLRateWorkerRowKeys_(state) {
    const normalized = normalizeLRateWorkerRowKeys_(state);
    normalized.updatedAt = new Date().toISOString();
    await browser.storage.local.set({
      [LRATE_WORKER_ROW_KEYS_STORAGE_KEY]: normalized
    });
    return normalized;
  }

  async function readTabUrlSafe_(tabId) {
    const tabInfo = await browser.tabs.get(tabId).catch(function() { return null; });
    return tabInfo && tabInfo.url ? String(tabInfo.url || '').trim() : '';
  }

  async function openLRateWorkerTabSession_(params) {
    const workerId = params && params.workerId ? params.workerId : 0;
    const targetUrl = String((params && params.chatUrl) || '').trim();
    const lRateBaseUrl = String((params && params.lRateBaseUrl) || '').trim();
    const requireConversationUrl = params && params.requireConversationUrl === true;
    const openingLabel = String((params && params.openingLabel) || 'opening chat').trim();
    const timeouts = params && params.timeouts ? params.timeouts : {};
    const reportStatus = params && typeof params.reportStatus === 'function'
      ? params.reportStatus
      : async function () {};

    const tabLoadTimeoutMs = typeof timeouts.tabLoadMs === 'number' ? timeouts.tabLoadMs : 30000;
    const pageReadyTimeoutMs = typeof timeouts.pageReadyMs === 'number' ? timeouts.pageReadyMs : 30000;
    const composerReadyTimeoutMs = typeof timeouts.composerReadyMs === 'number' ? timeouts.composerReadyMs : 30000;
    const openUrl = targetUrl || lRateBaseUrl;
    if (!openUrl) {
      throw new Error('LRateBaseUrl is missing in Settings');
    }

    let tab = null;
    try {
      await reportStatus(`LRate worker ${workerId}: ${openingLabel}`);
      tab = await browser.tabs.create({ url: openUrl, active: false });
      await waitForTabLoad(tab.id, tabLoadTimeoutMs);

      if (requireConversationUrl) {
        const loadedUrl = await readTabUrlSafe_(tab.id);
        if (!isChatUrlValid_(loadedUrl)) {
          throw new Error('stored chat URL is unavailable or redirected');
        }
      }

      await reportStatus(`LRate worker ${workerId}: waiting page ready`);
      const pageReady = await waitForChatGptPageReady_(tab.id, pageReadyTimeoutMs);
      if (!pageReady) {
        await reportStatus(`LRate worker ${workerId}: page-ready timeout, fallback to composer`);
      }

      await reportStatus(`LRate worker ${workerId}: waiting composer`);
      const composerReady = await waitForChatGptComposer_(tab.id, composerReadyTimeoutMs);
      if (!composerReady) {
        throw new Error('ChatGPT composer not ready');
      }
      await sleep(1200);

      await reportStatus(`LRate worker ${workerId}: chat ready`);
      const finalUrl = await readTabUrlSafe_(tab.id);
      return {
        tab: tab,
        finalUrl: finalUrl
      };
    } catch (error) {
      if (tab && tab.id) {
        try {
          await browser.tabs.remove(tab.id);
        } catch (e) {
          // ignore
        }
      }
      throw error;
    }
  }

  async function createFreshLRateWorkerTab_(params) {
    return openLRateWorkerTabSession_(Object.assign({}, params || {}, {
      openingLabel: `opening fresh chat`,
      requireConversationUrl: false
    }));
  }

  async function runLRate() {
    if (lRateContext.active === true) {
      return { success: false, error: 'LRate is already running' };
    }

    // Temporary test mode requested by user:
    // - worker chat restarts on repeated failures (fresh chat)
    // - close worker chat tabs when worker is done
    // - per-worker row limit is configurable in popup debug settings
    const L_RATE_TEST_NO_WORKER_RESTARTS = true;
    const L_RATE_TEST_KEEP_TABS_OPEN = false;
    const L_RATE_DEBUG_DEFAULT_ROWS_PER_WORKER = 2;
    const L_RATE_DEBUG_MAX_ROWS_PER_WORKER = 50;
    const L_RATE_DEBUG_HANDOFF_RETRIES_MIN = 1;
    const L_RATE_DEBUG_HANDOFF_RETRIES_MAX = 10;
    const L_RATE_DEBUG_HANDOFF_RETRIES_DEFAULT_ON = 1;

    const sourceUrl = await resolveScrapeListSourceUrl();
    const sheetId = extractSpreadsheetId(sourceUrl);
    if (!sheetId) {
      throw new Error('Could not detect spreadsheet ID from URL');
    }

    const webAppUrl = await fetchSettingsValue(sheetId, 'WebAppUrl');
    if (!webAppUrl) {
      throw new Error('WebAppUrl is missing in Settings');
    }

    const lRateBaseUrl = await fetchSettingsValue(sheetId, 'LRateBaseUrl');
    if (!lRateBaseUrl) {
      throw new Error('LRateBaseUrl is missing in Settings');
    }
    const lRatePrompt = await fetchSettingsValue(sheetId, 'LRatePrompt');
    if (!lRatePrompt) {
      throw new Error('LRatePrompt is missing in Settings');
    }
    const lRatePromptHash = computePromptHash_(lRatePrompt);
    const lRateThreadsRaw = await fetchSettingsValue(sheetId, 'LRateTreads');
    const lRateChatMsgLimitRaw = await fetchSettingsValue(sheetId, 'LRateChatMsgLimit');
    const parsedLRateChatMsgLimit = parseInt(String(lRateChatMsgLimitRaw || ''), 10);
    if (isNaN(parsedLRateChatMsgLimit) || parsedLRateChatMsgLimit < 1 || parsedLRateChatMsgLimit > 500) {
      await setLRateProgress_({
        active: false,
        status: 'LRate stopped (fatal): LRateChatMsgLimit is missing or invalid in Settings (expected integer 1..500)',
        current: 0,
        total: 0,
        processed: 0,
        applied: 0,
        skipped: 0,
        failed: 0,
        workers: []
      });
      throw new Error('LRateChatMsgLimit is missing or invalid in Settings (expected integer 1..500)');
    }
    const lRateChatMsgLimit = parsedLRateChatMsgLimit;
    const debugStored = await browser.storage.local.get([
      'lrate_debug_enabled',
      'lrate_debug_rows_per_worker',
      'lrate_debug_disable_rows_limit',
      'lrate_debug_handoff_enabled',
      'lrate_debug_handoff_retries'
    ]);
    const debugEnabled = debugStored.lrate_debug_enabled === true;
    let parsedDebugRowsPerWorker = parseInt(String(debugStored.lrate_debug_rows_per_worker || ''), 10);
    if (isNaN(parsedDebugRowsPerWorker) ||
        parsedDebugRowsPerWorker < 1 ||
        parsedDebugRowsPerWorker > L_RATE_DEBUG_MAX_ROWS_PER_WORKER) {
      parsedDebugRowsPerWorker = L_RATE_DEBUG_DEFAULT_ROWS_PER_WORKER;
    }
    const debugDisableRowsLimit = debugEnabled && debugStored.lrate_debug_disable_rows_limit === true;
    const rowsPerWorkerLimit = (!debugEnabled || debugDisableRowsLimit)
      ? Number.POSITIVE_INFINITY
      : parsedDebugRowsPerWorker;
    const debugHandoffEnabled = debugEnabled && debugStored.lrate_debug_handoff_enabled === true;
    let parsedDebugHandoffRetries = parseInt(String(debugStored.lrate_debug_handoff_retries || ''), 10);
    if (isNaN(parsedDebugHandoffRetries) ||
        parsedDebugHandoffRetries < L_RATE_DEBUG_HANDOFF_RETRIES_MIN ||
        parsedDebugHandoffRetries > L_RATE_DEBUG_HANDOFF_RETRIES_MAX) {
      parsedDebugHandoffRetries = L_RATE_DEBUG_HANDOFF_RETRIES_DEFAULT_ON;
    }
    const handoffEnabled = debugHandoffEnabled;
    const handoffRetries = handoffEnabled ? parsedDebugHandoffRetries : 0;

    const rowsResp = await postWebApp(webAppUrl, {
      action: 'getLRateRows',
      sheetName: 'NewJobs',
      status: '2LRate'
    });
    const rows = Array.isArray(rowsResp && rowsResp.rows) ? rowsResp.rows : [];
    if (rows.length === 0) {
      await setLRateProgress_({
        active: false,
        status: 'LRate: no rows with Status=2LRate',
        current: 0,
        total: 0,
        processed: 0,
        applied: 0,
        skipped: 0,
        failed: 0,
        workers: []
      });
      return { success: true, processed: 0, applied: 0, skipped: 0, failed: 0 };
    }

    const MAX_WORKERS = 99;
    const MAX_ROW_ATTEMPTS = 2;
    const MAX_WORKER_FAILED_ROWS = 3;
    const TIMEOUTS = {
      tabLoadMs: 30000,
      pageReadyMs: 30000,
      composerReadyMs: 30000,
      composerAliveMs: 12000,
      waitAnswerMs: 180000,
      prefillDelayMs: 5000,
      stableTextMs: 5000,
      confirmDelayMs: 2000,
      pollMs: 1200
    };

    const parsedThreads = parseInt(String(lRateThreadsRaw || ''), 10);
    const requestedThreads = isNaN(parsedThreads) ? 1 : parsedThreads;
    const normalizedThreads = Math.max(1, Math.min(MAX_WORKERS, requestedThreads));
    const workersCount = Math.min(normalizedThreads, rows.length);

    let processed = 0;
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    let lastError = '';
    let fatalError = '';

    let nextQueueIndex = 0;
    const returnedQueue = [];
    let chatPool = await loadLRateChatPool_();
    chatPool.scope = LRATE_CHAT_POOL_SCOPE;
    let chatPoolSaveQueue = Promise.resolve();
    let workerRowKeys = await loadLRateWorkerRowKeys_();
    let workerRowKeysSaveQueue = Promise.resolve();

    function buildEmptyChatPoolEntry_(slotId) {
      const nowIso = new Date().toISOString();
      return {
        slotId: slotId,
        chatUrl: '',
        sentVacancyCount: 0,
        lastPromptHash: '',
        lastSheetId: '',
        lastUsedAt: nowIso,
        createdAt: nowIso
      };
    }

    function ensurePoolCapacity_(requiredCount) {
      if (!chatPool || !Array.isArray(chatPool.entries)) {
        chatPool = normalizeLRateChatPool_(chatPool);
      }
      const bySlot = new Map();
      for (let i = 0; i < chatPool.entries.length; i++) {
        const entry = chatPool.entries[i];
        if (!entry || !Number.isFinite(entry.slotId)) {
          continue;
        }
        if (!bySlot.has(entry.slotId)) {
          bySlot.set(entry.slotId, entry);
        }
      }
      for (let slotId = 1; slotId <= requiredCount; slotId++) {
        if (!bySlot.has(slotId)) {
          bySlot.set(slotId, buildEmptyChatPoolEntry_(slotId));
        }
      }
      chatPool.entries = Array.from(bySlot.values()).sort(function(a, b) {
        return a.slotId - b.slotId;
      });
      return chatPool;
    }

    function findPoolEntry_(slotId) {
      if (!chatPool || !Array.isArray(chatPool.entries)) {
        return null;
      }
      const wanted = Number(slotId || 0);
      if (!wanted) {
        return null;
      }
      for (let i = 0; i < chatPool.entries.length; i++) {
        if (Number(chatPool.entries[i].slotId || 0) === wanted) {
          return chatPool.entries[i];
        }
      }
      return null;
    }

    function ensurePoolEntry_(slotId) {
      ensurePoolCapacity_(slotId);
      const existing = findPoolEntry_(slotId);
      if (existing) {
        return existing;
      }
      const created = buildEmptyChatPoolEntry_(slotId);
      chatPool.entries.push(created);
      chatPool.entries.sort(function(a, b) {
        return a.slotId - b.slotId;
      });
      return created;
    }

    function queueSaveChatPool_() {
      chatPool = normalizeLRateChatPool_(chatPool);
      chatPool.updatedAt = new Date().toISOString();
      chatPoolSaveQueue = chatPoolSaveQueue.then(function() {
        return saveLRateChatPool_(chatPool).then(function(savedPool) {
          chatPool = savedPool;
        });
      }).catch(function() {
        return null;
      });
      return chatPoolSaveQueue;
    }

    function queueSaveWorkerRowKeys_() {
      workerRowKeys = normalizeLRateWorkerRowKeys_(workerRowKeys);
      workerRowKeys.updatedAt = new Date().toISOString();
      workerRowKeysSaveQueue = workerRowKeysSaveQueue.then(function() {
        return saveLRateWorkerRowKeys_(workerRowKeys).then(function(savedState) {
          workerRowKeys = savedState;
        });
      }).catch(function() {
        return null;
      });
      return workerRowKeysSaveQueue;
    }

    async function setWorkerActiveRowKey_(worker, row, rowKey) {
      if (!worker || !row) {
        return;
      }
      const safeKey = String(rowKey || buildLRateRowKey_(row) || '').trim();
      worker.currentRowKey = safeKey;
      if (!safeKey) {
        return;
      }
      if (!workerRowKeys || typeof workerRowKeys !== 'object') {
        workerRowKeys = normalizeLRateWorkerRowKeys_(null);
      }
      if (!workerRowKeys.workers || typeof workerRowKeys.workers !== 'object') {
        workerRowKeys.workers = {};
      }
      workerRowKeys.workers[String(worker.id)] = {
        workerId: Number(worker.id || 0),
        rowKey: safeKey,
        leaseId: String(row.LeaseId || row.leaseId || '').trim(),
        rowNum: Number(row.rowNum || 0),
        jobUrl: String(row.JobUrl || '').trim(),
        updatedAt: new Date().toISOString()
      };
      await queueSaveWorkerRowKeys_();
    }

    async function clearWorkerActiveRowKey_(worker) {
      if (!worker) {
        return;
      }
      worker.currentRowKey = '';
      if (!workerRowKeys || !workerRowKeys.workers) {
        return;
      }
      const key = String(worker.id || '');
      if (!workerRowKeys.workers[key]) {
        return;
      }
      delete workerRowKeys.workers[key];
      await queueSaveWorkerRowKeys_();
    }

    async function clearAllWorkerRowKeys_() {
      workerRowKeys = normalizeLRateWorkerRowKeys_(workerRowKeys);
      workerRowKeys.workers = {};
      await queueSaveWorkerRowKeys_();
    }

    function attachPoolMetaToWorker_(worker) {
      const slotEntry = ensurePoolEntry_(worker.chatSlotId);
      worker.chatMsgCount = Number(slotEntry.sentVacancyCount || 0);
      return slotEntry;
    }

    async function updateSlotAfterSessionOpen_(worker, session) {
      const slotEntry = ensurePoolEntry_(worker.chatSlotId);
      const finalUrl = String((session && session.finalUrl) || '').trim();
      if (isChatUrlValid_(finalUrl)) {
        slotEntry.chatUrl = finalUrl;
      }
      slotEntry.lastPromptHash = lRatePromptHash;
      slotEntry.lastSheetId = sheetId;
      slotEntry.lastUsedAt = new Date().toISOString();
      if (!Number.isFinite(slotEntry.sentVacancyCount) || slotEntry.sentVacancyCount < 0) {
        slotEntry.sentVacancyCount = 0;
      }
      worker.chatMsgCount = slotEntry.sentVacancyCount;
      await queueSaveChatPool_();
      return slotEntry;
    }

    async function incrementSlotVacancyCount_(worker) {
      const slotEntry = ensurePoolEntry_(worker.chatSlotId);
      const currentCount = Number(slotEntry.sentVacancyCount || 0);
      slotEntry.sentVacancyCount = currentCount >= 0 ? currentCount + 1 : 1;
      slotEntry.lastUsedAt = new Date().toISOString();
      slotEntry.lastPromptHash = lRatePromptHash;
      slotEntry.lastSheetId = sheetId;
      worker.chatMsgCount = slotEntry.sentVacancyCount;
      await queueSaveChatPool_();
    }

    function isSlotLimitReached_(worker) {
      const slotEntry = ensurePoolEntry_(worker.chatSlotId);
      const msgCount = Number(slotEntry.sentVacancyCount || 0);
      return msgCount >= lRateChatMsgLimit;
    }

    ensurePoolCapacity_(workersCount);
    await queueSaveChatPool_();

    const workers = [];
    for (let i = 0; i < workersCount; i++) {
      workers.push({
        id: i + 1,
        chatSlotId: i + 1,
        chatMsgCount: 0,
        chatRotations: 0,
        tab: null,
        state: 'init',
        dead: false,
        currentRowNum: 0,
        currentRowKey: '',
        reservedItem: null,
        preSentState: null,
        needsBootstrapOnNextRow: true,
        lastAssistantText: '',
        consecutiveFailedRows: 0,
        rowsLimit: rowsPerWorkerLimit,
        limitDisabled: !Number.isFinite(rowsPerWorkerLimit),
        waitingForHandoff: false,
        lastTitleState: '',
        handled: 0,
        processed: 0,
        applied: 0,
        skipped: 0,
        failed: 0,
        lastError: ''
      });
    }

    await clearAllWorkerRowKeys_();

    function getDoneCount_() {
      return processed + skipped + failed;
    }

    function buildWorkersProgress_() {
      return workers.map(function(worker) {
        return {
          id: worker.id,
          workerId: worker.id,
          state: worker.state,
          currentRow: worker.currentRowNum || 0,
          currentRowKey: worker.currentRowKey || '',
          handled: worker.handled || 0,
          limit: Number.isFinite(worker.rowsLimit) ? worker.rowsLimit : null,
          processed: worker.processed,
          applied: worker.applied,
          skipped: worker.skipped,
          failed: worker.failed,
          chatSlotId: worker.chatSlotId || 0,
          chatMsgCount: worker.chatMsgCount || 0,
          chatRotations: worker.chatRotations || 0,
          lastError: worker.lastError || ''
        };
      });
    }

    function getWorkerTitleEmoji_(state) {
      const value = String(state || '').trim().toLowerCase();
      if (value === 'init') return '⚪';
      if (value === 'starting') return '🚀';
      if (value === 'ready') return '🟡';
      if (value === 'processing') return '⚙️';
      if (value === 'waiting_handoff') return '⏳';
      if (value === 'recovering') return '🧯';
      if (value === 'limit_reached') return '🧪';
      if (value === 'queue_empty' || value === 'done') return '✅';
      if (value === 'stopped') return '⏸️';
      if (value === 'dead' || value === 'error') return '⛔';
      return '🔹';
    }

    async function setWorkerTabTitle_(worker) {
      if (!worker || !worker.tab || !worker.tab.id) {
        return;
      }
      const prefix = `W${worker.id}${getWorkerTitleEmoji_(worker.state)}: `;
      const markerAttr = 'data-hr-lrate-original-title';
      const code = `(function () {
        try {
          var prefix = ${JSON.stringify(prefix)};
          var markerAttr = ${JSON.stringify(markerAttr)};
          var root = document.documentElement;
          var original = '';
          if (root) {
            original = String(root.getAttribute(markerAttr) || '');
          }
          if (!original) {
            original = String(document.title || '').trim();
            if (!original) {
              original = 'ChatGPT';
            }
            original = original.replace(/^W\\d+[^:]{0,8}:\\s*/, '').trim();
            if (root) {
              root.setAttribute(markerAttr, original);
            }
          }
          document.title = prefix + original;
          return true;
        } catch (e) {
          return false;
        }
      })();`;
      await executeScriptInTab_(worker.tab.id, code);
    }

    async function syncWorkerTabTitles_() {
      const tasks = [];
      for (let i = 0; i < workers.length; i++) {
        const worker = workers[i];
        if (!worker || !worker.tab || !worker.tab.id) {
          worker.lastTitleState = '';
          continue;
        }
        const nextState = String(worker.state || '');
        if (worker.lastTitleState === nextState) {
          continue;
        }
        worker.lastTitleState = nextState;
        tasks.push(setWorkerTabTitle_(worker).catch(function() { return null; }));
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    }

    let progressQueue = Promise.resolve();
    function updateProgress_(statusText) {
      const patch = {
        active: true,
        status: statusText,
        current: getDoneCount_(),
        total: rows.length,
        processed: processed,
        applied: applied,
        skipped: skipped,
        failed: failed,
        workers: buildWorkersProgress_()
      };
      progressQueue = progressQueue.then(function() {
        return setLRateProgress_(patch).then(function() {
          return syncWorkerTabTitles_();
        });
      }).catch(function() {
        return null;
      });
      return progressQueue;
    }

    function buildQueueItem_(index, row) {
      const rowKey = buildLRateRowKey_(row);
      return {
        index: index,
        row: row,
        rowKey: rowKey,
        leaseId: String(row && (row.LeaseId || row.leaseId) || '').trim(),
        runId: String(row && (row.RunId || row.runId) || '').trim(),
        stableJobKey: String(row && (row.StableJobKey || row.stableJobKey) || '').trim(),
        snapshotHash: String(row && (row.SnapshotHash || row.snapshotHash) || '').trim(),
        handoffRemaining: handoffRetries,
        lastFailedWorkerId: 0,
        lastError: '',
        originRowNum: row && row.rowNum ? row.rowNum : 0
      };
    }

    function canWorkerTakeQueueItem_(workerId, item) {
      if (!item) {
        return false;
      }
      const blockedWorkerId = Number(item.lastFailedWorkerId || 0);
      return blockedWorkerId <= 0 || blockedWorkerId !== Number(workerId || 0);
    }

    function takeNextQueueItemForWorker_(workerId) {
      if (returnedQueue.length > 0) {
        for (let i = 0; i < returnedQueue.length; i++) {
          const candidate = returnedQueue[i];
          if (!canWorkerTakeQueueItem_(workerId, candidate)) {
            continue;
          }
          returnedQueue.splice(i, 1);
          return candidate;
        }
      }
      if (nextQueueIndex >= rows.length) {
        return null;
      }
      const item = buildQueueItem_(nextQueueIndex, rows[nextQueueIndex]);
      nextQueueIndex++;
      return item;
    }

    function hasBlockedQueueForWorker_(workerId) {
      if (returnedQueue.length === 0) {
        return false;
      }
      for (let i = 0; i < returnedQueue.length; i++) {
        if (canWorkerTakeQueueItem_(workerId, returnedQueue[i])) {
          return false;
        }
      }
      return true;
    }

    function returnQueueItem_(item) {
      if (!item) {
        return;
      }
      returnedQueue.unshift(item);
    }

    function hasRemainingWork_() {
      return getDoneCount_() < rows.length;
    }

    function canWorkerReceiveHandoff_(worker) {
      if (!worker || worker.dead) {
        return false;
      }
      if (worker.state === 'dead' || worker.state === 'stopped' || worker.state === 'limit_reached' || worker.state === 'queue_empty') {
        return false;
      }
      if (Number.isFinite(worker.rowsLimit) && worker.handled >= worker.rowsLimit) {
        return false;
      }
      return true;
    }

    function hasAnotherHandoffTarget_(sourceWorkerId) {
      for (let i = 0; i < workers.length; i++) {
        const candidate = workers[i];
        if (candidate.id === sourceWorkerId) {
          continue;
        }
        if (canWorkerReceiveHandoff_(candidate)) {
          return true;
        }
      }
      return false;
    }

    async function closeWorkerTabSafe_(worker) {
      if (!worker || !worker.tab || !worker.tab.id) {
        worker.tab = null;
        return;
      }
      if (L_RATE_TEST_KEEP_TABS_OPEN) {
        return;
      }
      try {
        await browser.tabs.remove(worker.tab.id);
      } catch (e) {
        // ignore
      }
      worker.tab = null;
    }

    async function openWorkerFromPoolSlot_(worker, slotEntry) {
      const slotUrl = String((slotEntry && slotEntry.chatUrl) || '').trim();
      if (!isChatUrlValid_(slotUrl)) {
        throw new Error('slot bad url');
      }
      return openLRateWorkerTabSession_({
        workerId: worker.id,
        chatUrl: slotUrl,
        lRateBaseUrl: lRateBaseUrl,
        timeouts: TIMEOUTS,
        requireConversationUrl: true,
        openingLabel: `opening slot chat ${slotEntry.slotId}`,
        reportStatus: async function(text) {
          worker.state = 'starting';
          await updateProgress_(text);
        }
      });
    }

    async function rotateWorkerChatSlot_(worker, reasonCode) {
      const slotEntry = ensurePoolEntry_(worker.chatSlotId);
      slotEntry.chatUrl = '';
      slotEntry.sentVacancyCount = 0;
      slotEntry.lastPromptHash = lRatePromptHash;
      slotEntry.lastSheetId = sheetId;
      slotEntry.lastUsedAt = new Date().toISOString();
      worker.chatMsgCount = 0;
      worker.chatRotations++;
      await queueSaveChatPool_();
      const reasonText = String(reasonCode || 'manual');
      await updateProgress_(`LRate worker ${worker.id}: slot rotated by ${reasonText}`);
      return openWorkerSession_(worker, `slot rotated by ${reasonText}`, false, {
        forceFresh: true,
        countRotation: false
      });
    }

    async function recoverWorkerTabFromSlot_(worker, contextReason) {
      const context = String(contextReason || 'tab loss');
      await updateProgress_(`LRate worker ${worker.id}: trying slot recovery after ${context}`);
      const recovered = await openWorkerSession_(worker, `recovering from slot after ${context}`, false, {
        forceFresh: false,
        countRotation: false,
        strictSlot: true
      });
      if (recovered) {
        return true;
      }
      await updateProgress_(`LRate worker ${worker.id}: slot recovery failed, replacing chat after ${context}`);
      return rotateWorkerChatSlot_(worker, `slot replaced after ${context}`);
    }

    async function openWorkerSession_(worker, reasonText, markDeadOnFailure, options) {
      const opts = options || {};
      const forceFresh = opts.forceFresh === true;
      const countRotation = opts.countRotation === true;
      const strictSlot = opts.strictSlot === true;
      await closeWorkerTabSafe_(worker);
      worker.preSentState = null;
      worker.lastAssistantText = '';
      worker.needsBootstrapOnNextRow = false;
      worker.currentRowNum = 0;
      worker.currentRowKey = '';
      worker.waitingForHandoff = false;
      worker.lastTitleState = '';
      worker.state = 'starting';
      await updateProgress_(`LRate worker ${worker.id}: ${reasonText}`);
      const slotEntry = attachPoolMetaToWorker_(worker);

      try {
        let session = null;
        let slotHadUrl = false;
        if (!forceFresh) {
          slotHadUrl = isChatUrlValid_(String(slotEntry && slotEntry.chatUrl || ''));
          try {
            session = await openWorkerFromPoolSlot_(worker, slotEntry);
          } catch (slotError) {
            const slotErrText = slotError && slotError.message ? slotError.message : 'slot unavailable';
            await updateProgress_(`LRate worker ${worker.id}: slot bad url (${slotErrText})`);
            if (strictSlot) {
              throw new Error(`slot bad url: ${slotErrText}`);
            }
          }
        }
        if (!session) {
          if (countRotation || slotHadUrl) {
            worker.chatRotations++;
          }
          session = await createFreshLRateWorkerTab_({
            workerId: worker.id,
            lRateBaseUrl: lRateBaseUrl,
            timeouts: TIMEOUTS,
            reportStatus: async function(text) {
              worker.state = 'starting';
              await updateProgress_(text);
            }
          });
        }
        worker.tab = session && session.tab ? session.tab : null;
        worker.lastAssistantText = '';
        worker.needsBootstrapOnNextRow = true;
        await updateSlotAfterSessionOpen_(worker, session);
        worker.state = 'ready';
        worker.lastError = '';
        worker.dead = false;
        await updateProgress_(`LRate worker ${worker.id}: ready`);
        return true;
      } catch (error) {
        worker.lastError = error && error.message ? error.message : 'unknown worker init error';
        worker.state = markDeadOnFailure ? 'dead' : 'error';
        if (markDeadOnFailure) {
          worker.dead = true;
        }
        await closeWorkerTabSafe_(worker);
        await updateProgress_(`LRate worker ${worker.id}: failed to init chat - ${worker.lastError}`);
        return false;
      }
    }

    function isWorkerTabLostError_(message) {
      const value = String(message || '').toLowerCase();
      if (!value) {
        return false;
      }
      return (
        value.indexOf('no tab with id') !== -1 ||
        value.indexOf('invalid tab id') !== -1 ||
        value.indexOf('worker chat tab is unavailable') !== -1 ||
        value.indexOf('tab was closed') !== -1 ||
        value.indexOf('chatgpt composer lost') !== -1 ||
        value.indexOf('stored chat url is unavailable') !== -1
      );
    }

    async function processRowWithWorker_(worker, item) {
      if (!item || typeof item !== 'object') {
        throw new Error('queue item is required');
      }
      const row = item.row;
      const leaseId = String(item.leaseId || row.LeaseId || row.leaseId || '').trim();
      const stableJobKey = String(item.stableJobKey || row.StableJobKey || row.stableJobKey || '').trim();
      const snapshotHash = String(item.snapshotHash || row.SnapshotHash || row.snapshotHash || '').trim();
      item.leaseId = leaseId;
      item.stableJobKey = stableJobKey;
      item.snapshotHash = snapshotHash;
      if (!leaseId || !stableJobKey || !snapshotHash) {
        const contractError = 'LRate queue item is missing lease contract fields';
        failed++;
        worker.failed++;
        worker.handled++;
        worker.lastError = contractError;
        lastError = `row ${row.rowNum}: ${contractError}`;
        await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} failed - missing lease contract`);
        return 'fail';
      }
      const rowKey = String(item.rowKey || buildLRateRowKey_(row) || '').trim();
      item.rowKey = rowKey;
      await setWorkerActiveRowKey_(worker, row, rowKey);
      if (!Number.isFinite(item.handoffRemaining)) {
        item.handoffRemaining = handoffRetries;
      }
      if (!Number.isFinite(item.lastFailedWorkerId)) {
        item.lastFailedWorkerId = 0;
      }
      item.lastError = '';
      const vacancyPromptInput = String(buildLRatePromptInput_(row) || '').trim();
      // Safety-first mode: disable pre-sent pipeline to keep strict row<->response mapping.
      worker.preSentState = null;

      if (!vacancyPromptInput) {
        worker.preSentState = null;
        skipped++;
        worker.skipped++;
        worker.handled++;
        worker.lastError = '';
        await clearWorkerActiveRowKey_(worker);
        await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} skipped (empty prompt)`);
        return 'success';
      }

      let rowError = '';
      let parseRetryUsed = false;

      if (isSlotLimitReached_(worker)) {
        const rotatedBeforeRow = await rotateWorkerChatSlot_(worker, 'limit');
        if (!rotatedBeforeRow || !worker.tab || !worker.tab.id) {
          rowError = worker.lastError || 'Failed to rotate chat by limit';
          failed++;
          worker.failed++;
          worker.handled++;
          worker.lastError = rowError;
          lastError = `row ${row.rowNum}: ${rowError}`;
          await clearWorkerActiveRowKey_(worker);
          await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} failed after slot rotation error`);
          return 'fail';
        }
      }

      for (let attempt = 1; attempt <= MAX_ROW_ATTEMPTS; attempt++) {
        try {
          if (!worker.tab || !worker.tab.id) {
            const recoveredFromSlot = await recoverWorkerTabFromSlot_(worker, `row ${row.rowNum} tab loss`);
            if (!recoveredFromSlot || !worker.tab || !worker.tab.id) {
              throw new Error(worker.lastError || 'worker chat tab is unavailable');
            }
          }

          worker.state = 'processing';
          await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} ensure composer (${attempt}/${MAX_ROW_ATTEMPTS})`);
          const composerAlive = await waitForChatGptComposer_(worker.tab.id, TIMEOUTS.composerAliveMs);
          if (!composerAlive) {
            throw new Error('ChatGPT composer lost');
          }

          const before = await waitForChatGptIdleBeforeSend_(worker.tab.id, 12000);
          if (!before) {
            const stateAfterIdleWait = await getChatGptState_(worker.tab.id).catch(function() { return null; });
            const idleDiag = stateAfterIdleWait
              ? `hasStop=${stateAfterIdleWait.hasStop === true};sendEnabled=${stateAfterIdleWait.sendEnabled === true};composerLen=${Number(stateAfterIdleWait.composerTextLength || 0)};assistantCount=${Number(stateAfterIdleWait.assistantCount || 0)};userCount=${Number(stateAfterIdleWait.userCount || 0)}`
              : 'no-state';
            throw new Error(`ChatGPT not idle before send (${idleDiag})`);
          }
          let baselineText = before && before.lastAssistantText ? String(before.lastAssistantText || '').trim() : '';
          if (!baselineText) {
            baselineText = String(worker.lastAssistantText || '');
          }
          const baselineAssistantCount = before && typeof before.assistantCount === 'number'
            ? Number(before.assistantCount || 0)
            : 0;
          const baselineUserCount = before && typeof before.userCount === 'number'
            ? Number(before.userCount || 0)
            : 0;
          const baselineComposerTextLength = before && typeof before.composerTextLength === 'number'
            ? Number(before.composerTextLength || 0)
            : 0;
          const sendCombinedPrompt = worker.needsBootstrapOnNextRow === true;
          const promptInput = sendCombinedPrompt
            ? String(buildLRateCombinedPromptInput_(lRatePrompt, row) || '').trim()
            : vacancyPromptInput;
          if (!promptInput) {
            throw new Error('Prompt text is empty');
          }

          await updateProgress_(
            `LRate worker ${worker.id}: row ${row.rowNum} sending ${sendCombinedPrompt ? 'combined' : 'vacancy'} prompt (${attempt}/${MAX_ROW_ATTEMPTS})`
          );
          const submit = await submitPromptToChatGpt_(worker.tab.id, promptInput);
          if (!submit || submit.ok !== true) {
            throw new Error(submit && submit.error ? submit.error : 'Failed to submit prompt');
          }
          if (!submit.sent) {
            const clicked = await clickChatGptSendButton_(worker.tab.id, 6000);
            if (!clicked) {
              throw new Error('Send button was not clicked after prompt insert');
            }
          }
          const dispatch = await waitForPromptDispatch_(worker.tab.id, {
            userCount: baselineUserCount,
            assistantCount: baselineAssistantCount,
            composerTextLength: baselineComposerTextLength,
            hasStop: before && before.hasStop === true
          }, 8000);
          if (!dispatch || dispatch.sent !== true) {
            const dispatchState = dispatch && dispatch.state ? dispatch.state : null;
            const dispatchDiag = dispatchState
              ? `assistantCount=${Number(dispatchState.assistantCount || 0)};userCount=${Number(dispatchState.userCount || 0)};hasStop=${dispatchState.hasStop === true};sendEnabled=${dispatchState.sendEnabled === true};composerLen=${Number(dispatchState.composerTextLength || 0)}`
              : 'no-state';
            throw new Error(`Prompt dispatch not confirmed (${dispatch && dispatch.signal ? dispatch.signal : 'unknown'}; ${dispatchDiag})`);
          }
          worker.needsBootstrapOnNextRow = false;
          await incrementSlotVacancyCount_(worker);

          await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} waiting answer`);
          const ignoreAssistantTexts = [];
          if (!baselineText && worker.lastAssistantText) {
            ignoreAssistantTexts.push(String(worker.lastAssistantText || '').trim());
          }
          const waitResult = await waitForChatGptAnswer_(worker.tab.id, baselineText, TIMEOUTS.waitAnswerMs, {
            requireSendReady: false,
            requireGenerationDone: true,
            minAssistantCount: 0,
            stableMs: TIMEOUTS.stableTextMs,
            pollMs: TIMEOUTS.pollMs,
            confirmationDelayMs: TIMEOUTS.confirmDelayMs,
            expectedLeaseId: leaseId,
            ignoreAssistantTexts: ignoreAssistantTexts
          });
          let responseText = waitResult && waitResult.responseText ? String(waitResult.responseText || '') : '';
          if (!responseText.trim()) {
            throw new Error('Empty response after wait');
          }
          worker.lastAssistantText = responseText;

          let parsed = null;
          try {
            parsed = parseLRateResponse_(responseText, leaseId);
          } catch (parseError) {
            if (!parseRetryUsed && isJobRateParseError_(parseError)) {
              parseRetryUsed = true;
              await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} invalid response contract, clicking retry once`);
              const retryClicked = await clickChatGptRetryButtonOnce_(worker.tab.id, 7000);
              if (!retryClicked) {
                throw new Error('Could not parse LRate contract and retry button was not found');
              }
              await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} waiting retry answer`);
              const retryWaitResult = await waitForChatGptAnswer_(worker.tab.id, responseText, TIMEOUTS.waitAnswerMs, {
                requireSendReady: false,
                requireGenerationDone: true,
                minAssistantCount: 0,
                stableMs: TIMEOUTS.stableTextMs,
                pollMs: TIMEOUTS.pollMs,
                confirmationDelayMs: TIMEOUTS.confirmDelayMs,
                expectedLeaseId: leaseId,
                ignoreAssistantTexts: ignoreAssistantTexts
              });
              responseText = retryWaitResult && retryWaitResult.responseText ? String(retryWaitResult.responseText || '') : '';
              if (!responseText.trim()) {
                throw new Error('Empty retry response after invalid LRate contract');
              }
              worker.lastAssistantText = responseText;
              parsed = parseLRateResponse_(responseText, leaseId);
            } else {
              throw parseError;
            }
          }
          const values = {
            JobRateNum: parsed.jobRateNum,
            JobRateDesc: String(parsed.jobRateDesc || '').trim() || 'No response text',
            JobRateShortDesc: parsed.jobRateShortDesc,
            RatedModelName: 'GPT 5.2',
            JobTop3Want: parsed.jobTop3Want
          };
          if (parsed.jobRateNum > 2) {
            values.Status = '2Apply';
          } else {
            values.Status = '2Delete';
          }
          worker.preSentState = null;

          await postWebApp(webAppUrl, {
            action: 'updateLRateRow',
            sheetName: 'NewJobs',
            rowNum: row.rowNum,
            leaseId: leaseId,
            runId: item.runId || '',
            stableJobKey: stableJobKey,
            snapshotHash: snapshotHash,
            expectedRowKey: rowKey,
            expectedJobUrl: row.JobUrl || '',
            values: values,
            setLoadDttmNow: true
          });

          processed++;
          worker.processed++;
          worker.handled++;
          if (values.Status === '2Apply') {
            applied++;
            worker.applied++;
          }
          worker.lastError = '';
          await clearWorkerActiveRowKey_(worker);
          await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} saved`);
          await sleep(200);
          return 'success';
        } catch (attemptError) {
          rowError = attemptError && attemptError.message ? attemptError.message : 'unknown error';
          const isTabLostError = isWorkerTabLostError_(rowError);
          worker.preSentState = null;
          await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} attempt ${attempt}/${MAX_ROW_ATTEMPTS} failed: ${rowError}`);

          const shouldCloseTabAfterAttemptError = (
            !L_RATE_TEST_NO_WORKER_RESTARTS &&
            !isTabLostError
          );
          if (shouldCloseTabAfterAttemptError) {
            await closeWorkerTabSafe_(worker);
          } else if (isTabLostError) {
            await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} trying recovery after tab/session issue`);
            const recoveredAfterFailure = await recoverWorkerTabFromSlot_(
              worker,
              `row ${row.rowNum} attempt ${attempt}`
            );
            if (!recoveredAfterFailure) {
              await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} recovery failed after tab/session issue`);
            }
          } else if (L_RATE_TEST_NO_WORKER_RESTARTS) {
            await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} keeping current tab state (test mode)`);
          }

          const canHandoffNow = (
            attempt === 1 &&
            handoffEnabled &&
            workersCount > 1 &&
            Number(item.handoffRemaining || 0) > 0 &&
            hasAnotherHandoffTarget_(worker.id)
          );
          if (canHandoffNow) {
            item.handoffRemaining = Math.max(0, Number(item.handoffRemaining || 0) - 1);
            item.lastFailedWorkerId = worker.id;
            item.lastError = rowError;
            worker.lastError = rowError;
            returnQueueItem_(item);
            await clearWorkerActiveRowKey_(worker);
            await updateProgress_(
              `LRate worker ${worker.id}: row ${row.rowNum} handed off to other worker (remaining: ${item.handoffRemaining})`
            );
            return 'handoff';
          }

          if (isTabLostError && L_RATE_TEST_NO_WORKER_RESTARTS && (!worker.tab || !worker.tab.id)) {
            break;
          }
        }
      }

      failed++;
      worker.failed++;
      worker.handled++;
      worker.lastError = rowError;
      lastError = `row ${row.rowNum}: ${rowError || 'unknown error'}`;
      await clearWorkerActiveRowKey_(worker);
      await updateProgress_(`LRate worker ${worker.id}: row ${row.rowNum} failed after ${MAX_ROW_ATTEMPTS} attempts`);
      return 'fail';
    }

    async function workerLoop_(worker) {
      while (true) {
        if (worker.dead) {
          break;
        }

        if (Number.isFinite(worker.rowsLimit) && worker.handled >= worker.rowsLimit) {
          worker.state = 'limit_reached';
          worker.currentRowNum = 0;
          worker.currentRowKey = '';
          worker.waitingForHandoff = false;
          if (worker.reservedItem) {
            returnQueueItem_(worker.reservedItem);
            worker.reservedItem = null;
          }
          await updateProgress_(`LRate worker ${worker.id}: limit reached (${worker.handled}/${worker.rowsLimit})`);
          break;
        }

        let currentItem = null;
        if (worker.reservedItem) {
          currentItem = worker.reservedItem;
          worker.reservedItem = null;
        } else {
          currentItem = takeNextQueueItemForWorker_(worker.id);
        }

        if (!currentItem) {
          if (hasBlockedQueueForWorker_(worker.id) && hasRemainingWork_()) {
            worker.currentRowNum = 0;
            worker.currentRowKey = '';
            if (!worker.waitingForHandoff) {
              worker.state = 'waiting_handoff';
              worker.waitingForHandoff = true;
              await updateProgress_(`LRate worker ${worker.id}: waiting handoff row from other worker`);
            }
            await sleep(350);
            continue;
          }
          worker.state = 'queue_empty';
          worker.currentRowNum = 0;
          worker.currentRowKey = '';
          worker.waitingForHandoff = false;
          await updateProgress_(`LRate worker ${worker.id}: queue empty`);
          break;
        }
        worker.waitingForHandoff = false;

        if (!worker.tab || !worker.tab.id) {
          const opened = await openWorkerSession_(worker, `attaching slot ${worker.chatSlotId}`, true);
          if (!opened || !worker.tab || !worker.tab.id) {
            returnQueueItem_(currentItem);
            currentItem = null;
            if (worker.reservedItem) {
              returnQueueItem_(worker.reservedItem);
              worker.reservedItem = null;
            }
            worker.dead = true;
            worker.state = 'dead';
            await updateProgress_(
              `LRate worker ${worker.id}: failed to init chat while taking row, worker stopped`
            );
            break;
          }
        }

        if (!worker.reservedItem &&
            (!Number.isFinite(worker.rowsLimit) || (worker.handled + 1 < worker.rowsLimit))) {
          worker.reservedItem = takeNextQueueItemForWorker_(worker.id);
        }

        worker.currentRowNum = currentItem.row.rowNum;
        worker.currentRowKey = String(currentItem.rowKey || buildLRateRowKey_(currentItem.row) || '').trim();
        worker.state = 'processing';

        const rowResult = await processRowWithWorker_(worker, currentItem);
        worker.currentRowNum = 0;
        worker.currentRowKey = '';

        if (rowResult === 'success') {
          worker.consecutiveFailedRows = 0;
          continue;
        }
        if (rowResult === 'handoff') {
          continue;
        }

        worker.consecutiveFailedRows++;
        const shouldRestartByStreak = worker.consecutiveFailedRows >= MAX_WORKER_FAILED_ROWS;
        const shouldRestartByTotalFails =
          worker.failed > 0 &&
          (worker.failed % MAX_WORKER_FAILED_ROWS === 0);
        if (shouldRestartByStreak || shouldRestartByTotalFails) {
          worker.state = 'recovering';
          const restartReason = shouldRestartByStreak
            ? `${worker.consecutiveFailedRows} consecutive failed rows`
            : `${worker.failed} total failed rows`;
          await updateProgress_(`LRate worker ${worker.id}: restarting chat after ${restartReason}`);
          const recovered = L_RATE_TEST_NO_WORKER_RESTARTS
            ? await rotateWorkerChatSlot_(worker, `failed-${worker.failed}`)
            : await openWorkerSession_(worker, 'recovering fresh chat', true);
          if (recovered) {
            worker.consecutiveFailedRows = 0;
            worker.state = 'ready';
          } else {
            worker.dead = true;
            worker.state = 'dead';
            if (worker.reservedItem) {
              returnQueueItem_(worker.reservedItem);
              worker.reservedItem = null;
            }
            break;
          }
        }
      }

      await closeWorkerTabSafe_(worker);
    }

    await setLRateProgress_({
      active: true,
      status: `LRate TEST: starting 0/${rows.length} with ${workersCount} workers ` +
        `(global pool sticky slots, chat msg limit=${lRateChatMsgLimit}, ` +
        `restart on ${MAX_WORKER_FAILED_ROWS} fails, close tabs, per-worker limit=${Number.isFinite(rowsPerWorkerLimit) ? rowsPerWorkerLimit : 'off'}, ` +
        `handoff=${handoffEnabled ? `on/${handoffRetries}` : 'off'})`,
      current: 0,
      total: rows.length,
      processed: 0,
      applied: 0,
      skipped: 0,
      failed: 0,
      workers: buildWorkersProgress_()
    });

    try {
      const aliveWorkers = workers.filter(function(worker) { return !worker.dead; });
      if (aliveWorkers.length === 0) {
        fatalError = 'No LRate workers available';
      } else {
        // Fair-start distribution: give each live worker one initial row before
        // any worker reserves an extra next row for prefill pipeline.
        for (let i = 0; i < aliveWorkers.length; i++) {
          if (!aliveWorkers[i].reservedItem) {
            aliveWorkers[i].reservedItem = takeNextQueueItemForWorker_(aliveWorkers[i].id);
          }
        }
        await Promise.all(aliveWorkers.map(function(worker) {
          return workerLoop_(worker);
        }));
      }
    } finally {
      await Promise.all(workers.map(function(worker) {
        return closeWorkerTabSafe_(worker);
      }));
      await clearAllWorkerRowKeys_();
      await queueSaveChatPool_();
      await chatPoolSaveQueue;
      await workerRowKeysSaveQueue;
      await progressQueue;
    }

    const doneCount = getDoneCount_();
    const remainingCount = rows.length - doneCount;
    if (!fatalError && remainingCount > 0 && hasRemainingWork_()) {
      const stoppedOnlyByLimitOrQueue = workers.every(function(worker) {
        return worker.state === 'limit_reached' || worker.state === 'queue_empty';
      });
      if (!stoppedOnlyByLimitOrQueue) {
        fatalError = `All workers stopped before queue completion (${doneCount}/${rows.length})`;
      }
    }

    const stoppedByFatalError = !!fatalError;
    let doneStatus = stoppedByFatalError
      ? `LRate stopped (fatal). Processed: ${processed}, 2Apply: ${applied}, skipped: ${skipped}, failed: ${failed}`
      : `LRate done. Processed: ${processed}, 2Apply: ${applied}, skipped: ${skipped}, failed: ${failed}`;
    if (lastError) {
      doneStatus += `, last error: ${lastError}`;
    }
    if (stoppedByFatalError) {
      doneStatus += `, fatal: ${fatalError}`;
    } else if (remainingCount > 0 && Number.isFinite(rowsPerWorkerLimit)) {
      doneStatus += `, remaining in queue: ${remainingCount}`;
    }

    await setLRateProgress_({
      active: false,
      status: doneStatus,
      current: doneCount,
      total: rows.length,
      processed: processed,
      applied: applied,
      skipped: skipped,
      failed: failed,
      workers: buildWorkersProgress_()
    });

    return {
      success: !stoppedByFatalError,
      processed: processed,
      applied: applied,
      skipped: skipped,
      failed: failed,
      lastError: lastError,
      stoppedByFatalError: stoppedByFatalError,
      fatalError: fatalError
    };
  }

  async function resolveScrapeListSourceUrl() {
    const stored = await browser.storage.local.get('scrapeListSourceUrl');
    if (stored.scrapeListSourceUrl) {
      return stored.scrapeListSourceUrl;
    }

    const tabs = await browser.tabs.query({});
    const sheetTabs = tabs.filter(tab => tab.url && tab.url.includes('/spreadsheets/') && tab.url.includes('/d/'));
    if (sheetTabs.length === 0) {
      throw new Error('Please open the get-your-offer Google Sheet in a new tab.');
    }

    const namedTabs = sheetTabs.filter(tab => {
      const title = String(tab.title || '').toLowerCase();
      return title.includes('hrscrape2mart');
    });

    let selectedTab = null;
    if (namedTabs.length > 0) {
      selectedTab = namedTabs[0];
    } else {
      const activeTab = sheetTabs.find(tab => tab.active);
      selectedTab = activeTab || sheetTabs[0];
    }

    const sheetUrl = selectedTab.url;
    console.log('[scrape] Resolved Source URL:', sheetUrl);
    await browser.storage.local.set({ scrapeListSourceUrl: sheetUrl });
    return sheetUrl;
  }

  function extractSpreadsheetId(url) {
    const match = String(url || '').match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : '';
  }

  function parseCsv(text) {
    if (!text) return [];
    let csv = text;
    if (csv.charCodeAt(0) === 0xfeff) {
      csv = csv.slice(1);
    }
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < csv.length; i++) {
      const char = csv[i];
      if (inQuotes) {
        if (char === '"') {
          const nextChar = csv[i + 1];
          if (nextChar === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }
      if (char === ',') {
        row.push(field);
        field = '';
        continue;
      }
      if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        continue;
      }
      if (char === '\r') {
        continue;
      }
      field += char;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function formatErrorMessage(message) {
    const text = String(message || '').replace(/\\s+/g, ' ').trim();
    if (text.length <= 200) {
      return text;
    }
    return text.substring(0, 197) + '...';
  }

  function groupScrapeListEntries(entries) {
    const groups = new Map();
    (entries || []).forEach(entry => {
      const name = String(entry.name || '').trim();
      const id = String(entry.id || '').trim();
      const url = String(entry.url || '').trim();
      if (!url) return;
      const key = id || name || url;
      if (!groups.has(key)) {
        groups.set(key, { id: id || '', name: name || id || key, urls: [] });
      }
      groups.get(key).urls.push(url);
    });
    return Array.from(groups.values()).filter(group => group.urls.length > 0);
  }

  async function fetchSettingsValue(sheetId, key) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=Settings`;
    const response = await fetch(csvUrl, { credentials: 'include' });
    const csvText = await response.text();
    const rows = parseCsv(csvText);
    if (!rows || rows.length === 0) {
      return '';
    }

    const targetKey = String(key || '').trim().toLowerCase();
    for (let i = 0; i < rows.length; i++) {
      const rowKey = String(rows[i][0] || '').trim().toLowerCase();
      if (rowKey === targetKey) {
        return String(rows[i][1] || '').trim();
      }
    }
    return '';
  }

  async function postWebApp(webAppUrl, payload) {
    const response = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(payload || {})
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`WebApp error ${response.status}: ${text.substring(0, 200)}`);
    }

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`WebApp invalid JSON response: ${text.substring(0, 200)}`);
    }

    if (!parsed || parsed.success !== true) {
      throw new Error(parsed && parsed.error ? parsed.error : 'WebApp returned error');
    }

    return parsed;
  }

  async function computeCloudHmacHex_(secret, message) {
    const cryptoApi = globalThis.crypto || (globalThis.window && window.crypto);
    if (!cryptoApi || !cryptoApi.subtle) {
      throw new Error('WebCrypto is not available for cloud HMAC auth');
    }
    const encoder = new TextEncoder();
    const key = await cryptoApi.subtle.importKey(
      'raw',
      encoder.encode(String(secret || '')),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await cryptoApi.subtle.sign('HMAC', key, encoder.encode(message));
    return Array.from(new Uint8Array(signature))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  async function buildCloudAddonHeaders_(path, payload, extraHeaders) {
    const body = JSON.stringify(payload || {});
    const headers = Object.assign({
      'Content-Type': 'application/json'
    }, extraHeaders || {});
    const legacyToken = String((extraHeaders && extraHeaders['x-addon-token']) || '').trim();
    if (!legacyToken) {
      return { headers, body };
    }

    const timestamp = new Date().toISOString();
    const signature = await computeCloudHmacHex_(
      legacyToken,
      ['POST', String(path || '').trim(), timestamp, body].join('\n')
    );
    headers['x-addon-key-id'] = 'default';
    headers['x-addon-timestamp'] = timestamp;
    headers['x-addon-signature'] = signature;
    headers['x-addon-token'] = legacyToken;
    return { headers, body };
  }

  async function postCloudApi_(baseUrl, path, payload, extraHeaders) {
    const prepared = await buildCloudAddonHeaders_(path, payload, extraHeaders);
    const response = await fetch(baseUrl.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: prepared.headers,
      body: prepared.body
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Cloud API error ${response.status}: ${text.substring(0, 200)}`);
    }

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`Cloud API invalid JSON response: ${text.substring(0, 200)}`);
    }
    return parsed || {};
  }

  function normalizeCloudJobTags_(value) {
    if (Array.isArray(value)) {
      return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    const raw = String(value || '').trim();
    if (!raw) {
      return [];
    }
    return raw
      .split(/[,\n|]/)
      .map(item => String(item || '').trim())
      .filter(Boolean);
  }

  async function getCloudAddonInstanceId_() {
    const storageKey = 'cloudAddonInstanceId';
    const stored = await browser.storage.local.get(storageKey);
    const existing = String(stored[storageKey] || '').trim();
    if (existing) {
      return existing;
    }
    const created = `ff-addon-${Date.now()}`;
    await browser.storage.local.set({ [storageKey]: created });
    return created;
  }

  async function fetchCloudBackendConfig_() {
    try {
      const sourceUrl = await resolveScrapeListSourceUrl();
      const sheetId = extractSpreadsheetId(sourceUrl);
      if (!sheetId) {
        return null;
      }

      const cloudBackendUrl = await fetchSettingsValue(sheetId, 'CloudBackendUrl');
      if (!cloudBackendUrl) {
        return null;
      }

      const pollMinutesRaw = await fetchSettingsValue(sheetId, 'CloudPollMinutes');
      const maxPlanCommandsRaw = await fetchSettingsValue(sheetId, 'CloudMaxPlanCommands');
      const cloudBackendToken = await fetchSettingsValue(sheetId, 'CloudBackendToken');
      return {
        cloudBackendUrl: cloudBackendUrl,
        cloudBackendToken: cloudBackendToken,
        pollMinutes: Math.max(1, parsePositiveInt(pollMinutesRaw, DEFAULT_CLOUD_POLL_MINUTES)),
        maxPlanCommands: Math.max(1, parsePositiveInt(maxPlanCommandsRaw, DEFAULT_CLOUD_MAX_PLAN_COMMANDS))
      };
    } catch (error) {
      console.warn('[cloud] Failed to resolve cloud backend config', error);
      return null;
    }
  }

  async function executeCloudScrapeCommand_(cloudBackendUrl, cloudBackendToken, command, addonInstanceId) {
    const startedAt = new Date().toISOString();
    let success = true;
    let errorCode = '';
    let errorMessage = '';
    let jobs = [];

    try {
      const scrapedJobs = await scrapeListFromUrl(command.scrape_page_url);
      jobs = Array.isArray(scrapedJobs) ? scrapedJobs.map(job => ({
        external_job_id: String(job.JobId || '').trim(),
        job_url: String(job.JobUrl || '').trim(),
        job_apply_url: String(job.JobApplyUrl || '').trim(),
        job_title: String(job.JobTitle || '').trim(),
        job_company: String(job.JobCompany || '').trim(),
        job_location: String(job.JobLocation || '').trim(),
        job_tags: normalizeCloudJobTags_(job.JobTags),
        job_description: String(job.JobDescription || '').trim()
      })).filter(job => job.job_url) : [];
    } catch (error) {
      success = false;
      errorCode = 'SCRAPE_FAILED';
      errorMessage = error && error.message ? error.message : String(error || 'Scrape failed');
    }

    return postCloudApi_(cloudBackendUrl, '/scrape-result', {
      lease_id: String(command.lease_id || '').trim(),
      run_id: `${String(command.source_id || 'source').trim()}-${Date.now()}`,
      source_id: String(command.source_id || '').trim(),
      addon_instance_id: addonInstanceId,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      success: success,
      error_code: errorCode,
      error_message: errorMessage,
      jobs: jobs
    }, {
      'x-addon-token': String(cloudBackendToken || '').trim()
    });
  }

  async function pollCloudScrapePlan_() {
    if (cloudScrapePollInFlight || scrapeAllContext.active || isEnriching || lRateContext.active) {
      return;
    }

    const cloudConfig = await fetchCloudBackendConfig_();
    if (!cloudConfig || !cloudConfig.cloudBackendUrl) {
      return;
    }

    cloudScrapePollInFlight = true;
    try {
      const addonInstanceId = await getCloudAddonInstanceId_();
      const supportedSources = await getScrapeSources();
      const manifest = browser.runtime && browser.runtime.getManifest ? browser.runtime.getManifest() : { version: '0.0.0' };
      const plan = await postCloudApi_(cloudConfig.cloudBackendUrl, '/scrape-plan', {
        addon_instance_id: addonInstanceId,
        addon_version: String(manifest.version || '0.0.0'),
        supported_sources: (supportedSources || []).map(source => String(source.id || source.name || '').trim()).filter(Boolean),
        max_commands: cloudConfig.maxPlanCommands
      }, {
        'x-addon-token': String(cloudConfig.cloudBackendToken || '').trim()
      });

      const commands = Array.isArray(plan && plan.commands) ? plan.commands : [];
      for (let i = 0; i < commands.length; i++) {
        await executeCloudScrapeCommand_(cloudConfig.cloudBackendUrl, cloudConfig.cloudBackendToken, commands[i], addonInstanceId);
      }
    } catch (error) {
      console.warn('[cloud] Poll failed', error);
    } finally {
      cloudScrapePollInFlight = false;
    }
  }

  async function ensureCloudScrapePollAlarm_() {
    if (!browser.alarms || typeof browser.alarms.create !== 'function') {
      return;
    }
    const cloudConfig = await fetchCloudBackendConfig_();
    if (!cloudConfig || !cloudConfig.cloudBackendUrl) {
      if (typeof browser.alarms.clear === 'function') {
        await browser.alarms.clear(CLOUD_SCRAPE_POLL_ALARM_NAME);
      }
      return;
    }
    browser.alarms.create(CLOUD_SCRAPE_POLL_ALARM_NAME, {
      periodInMinutes: cloudConfig.pollMinutes
    });
  }

  async function updateDataFunnelStatus(webAppUrl, scrapePageName, scrapePageId, status, jobsCount, clearCount) {
    if (!scrapePageName) {
      throw new Error('ScrapePageName is required');
    }
    const payload = {
      action: 'updateDataFunnel',
      scrapePageName: scrapePageName,
      scrapePageId: scrapePageId || '',
      status: status || '',
      jobsCount: jobsCount
    };
    if (clearCount) {
      payload.clearCount = true;
    }
    return postWebApp(webAppUrl, payload);
  }

  async function appendStageRows(webAppUrl, rows) {
    if (!rows || rows.length === 0) {
      return { success: true, appended: 0 };
    }
    return postWebApp(webAppUrl, {
      action: 'appendStage',
      rows: rows
    });
  }

  async function filterDuplicateJobs(webAppUrl, jobs) {
    if (!jobs || jobs.length === 0) {
      return { jobs: [], skipped: 0 };
    }

    const payloadJobs = jobs.map(job => ({
      JobId: job.JobId || '',
      JobUrl: job.JobUrl || ''
    }));

    const response = await postWebApp(webAppUrl, {
      action: 'filterDuplicates',
      jobs: payloadJobs
    });

    const keepMask = Array.isArray(response.keepMask) ? response.keepMask : [];
    if (keepMask.length !== jobs.length) {
      throw new Error(`Dedup mask mismatch: expected ${jobs.length}, got ${keepMask.length}`);
    }

    const filtered = [];
    let skipped = 0;
    for (let i = 0; i < jobs.length; i++) {
      if (keepMask[i] === false) {
        skipped++;
        continue;
      }
      filtered.push(jobs[i]);
    }

    return { jobs: filtered, skipped: skipped };
  }

  /**
   * Waits for a tab to finish loading
   */
  function waitForTabLoad(tabId, timeoutMs) {
    return new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          browser.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(listener);

      const timeout = typeof timeoutMs === 'number' && timeoutMs > 0
        ? timeoutMs
        : SCRAPE_ALL_TAB_LOAD_TIMEOUT_MS;

      setTimeout(() => {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }, timeout);
    });
  }

  function getEnrichmentCompletedCount_(results) {
    return (results && results.processed ? results.processed : 0) +
      (results && results.failed ? results.failed : 0) +
      (results && results.notificationShellDropped ? results.notificationShellDropped : 0);
  }

  function isLinkedInNotificationShellResponse_(response) {
    if (!response || response.success !== true || !response.data) {
      return false;
    }
    if (response.data.__dropFromStage) {
      return false;
    }
    if (response.data.__linkedinNotificationShell === true) {
      return true;
    }
    const description = String(response.data.JobDescription || '').trim().toLowerCase();
    return description.startsWith('0 notifications');
  }

  async function sendScrapeJobRequestWithRetry_(tabId, context, options) {
    const retryAttempts = parsePositiveInt(options && options.attempts, ENRICH_SCRAPE_RETRY_ATTEMPTS);
    const retryDelayMs = parsePositiveInt(options && options.delayMs, ENRICH_SCRAPE_RETRY_DELAY_MS);
    let lastError = null;
    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const payload = { action: 'scrapeJob' };
        if (context) {
          payload.context = context;
        }
        return await browser.tabs.sendMessage(tabId, payload);
      } catch (error) {
        lastError = error;
        await sleep(retryDelayMs);
      }
    }
    throw lastError || new Error('Failed to scrape job');
  }

  async function reloadTabAndWait_(tabId, multiplier) {
    const waitMultiplier = parsePositiveInt(multiplier, 1);
    await browser.tabs.reload(tabId);
    await waitForTabLoad(tabId);
    await sleep(ENRICH_TAB_READY_WAIT_MS * waitMultiplier);
  }

  function getEnrichDetailReadyTimeoutMs_(sourceId) {
    const normalized = normalizeSiteKey(sourceId || '');
    if (normalized === 'torc') {
      return ENRICH_DETAIL_READY_TIMEOUT_TORC_MS;
    }
    if (normalized === 'revelo') {
      return ENRICH_DETAIL_READY_TIMEOUT_REVELO_MS;
    }
    return ENRICH_DETAIL_READY_TIMEOUT_MS;
  }

  async function waitForEnrichDetailReady_(tabId, sourceId, jobUrl) {
    const timeoutMs = getEnrichDetailReadyTimeoutMs_(sourceId);
    const startedAt = Date.now();
    let lastReason = 'unknown';
    let lastMetrics = null;
    let attempts = 0;

    while (Date.now() - startedAt < timeoutMs) {
      attempts++;
      try {
        const response = await browser.tabs.sendMessage(tabId, {
          action: 'isDetailReady',
          sourceId: sourceId || '',
          jobUrl: jobUrl || ''
        });
        if (response && response.success === true) {
          lastReason = String(response.reason || '');
          lastMetrics = response.metrics || null;
          if (response.ready === true) {
            return { ready: true, reason: lastReason || 'ready', metrics: lastMetrics, attempts: attempts };
          }
        } else if (response && response.error) {
          lastReason = String(response.error);
        }
      } catch (error) {
        lastReason = String(error && error.message ? error.message : error);
      }
      await sleep(ENRICH_DETAIL_READY_POLL_MS);
    }

    return {
      ready: false,
      reason: lastReason || 'timeout_waiting_detail_ready',
      metrics: lastMetrics,
      attempts: attempts
    };
  }

  async function waitForEnrichDetailReadyWithRecovery_(tabId, sourceId, jobUrl) {
    const normalizedSource = normalizeSiteKey(sourceId || '');
    const firstAttempt = await waitForEnrichDetailReady_(tabId, sourceId, jobUrl);
    if (firstAttempt.ready || normalizedSource !== 'revelo') {
      return firstAttempt;
    }

    try {
      await reloadTabAndWait_(tabId, 1);
    } catch (reloadError) {
      return {
        ready: false,
        reason: firstAttempt.reason || 'reload_failed',
        metrics: Object.assign({}, firstAttempt.metrics || {}, {
          recovery: 'reload_failed',
          reloadError: String(reloadError && reloadError.message ? reloadError.message : reloadError)
        }),
        attempts: firstAttempt.attempts || 0
      };
    }

    const secondAttempt = await waitForEnrichDetailReady_(tabId, sourceId, jobUrl);
    const totalAttempts = (firstAttempt.attempts || 0) + (secondAttempt.attempts || 0);

    if (secondAttempt.ready) {
      return {
        ready: true,
        reason: 'ready_after_reload',
        metrics: Object.assign({}, secondAttempt.metrics || {}, {
          recovery: 'reload_retry_success',
          firstReason: firstAttempt.reason || ''
        }),
        attempts: totalAttempts
      };
    }

    return {
      ready: false,
      reason: secondAttempt.reason || firstAttempt.reason || 'timeout_waiting_detail_ready',
      metrics: Object.assign({}, secondAttempt.metrics || {}, {
        recovery: 'reload_retry_failed',
        firstReason: firstAttempt.reason || '',
        firstAttempts: firstAttempt.attempts || 0
      }),
      attempts: totalAttempts
    };
  }

  async function sendScrapeJobWithRetry(tabId, sourceId) {
    const normalizedSource = normalizeSiteKey(sourceId || '');
    if (normalizedSource === 'revelo') {
      const retryOptions = {
        attempts: ENRICH_SCRAPE_RETRY_ATTEMPTS_REVELO,
        delayMs: ENRICH_SCRAPE_RETRY_DELAY_REVELO_MS
      };
      let firstResponse = null;
      try {
        firstResponse = await sendScrapeJobRequestWithRetry_(tabId, null, retryOptions);
        if (firstResponse && firstResponse.success === true && firstResponse.data) {
          return firstResponse;
        }
      } catch (error) {
        firstResponse = { success: false, error: String(error && error.message ? error.message : error) };
      }

      try {
        await reloadTabAndWait_(tabId, 1);
        const detailReady = await waitForEnrichDetailReadyWithRecovery_(tabId, normalizedSource, '');
        if (!detailReady.ready) {
          return firstResponse || {
            success: false,
            error: `Revelo detail not ready after reload: ${detailReady.reason || 'unknown'}`
          };
        }
        const secondResponse = await sendScrapeJobRequestWithRetry_(tabId, null, retryOptions);
        return secondResponse || firstResponse;
      } catch (error) {
        if (firstResponse) {
          return firstResponse;
        }
        throw error;
      }
    }

    if (normalizedSource !== 'linkedin') {
      return await sendScrapeJobRequestWithRetry_(tabId, null);
    }

    const firstResponse = await sendScrapeJobRequestWithRetry_(tabId, null);
    if (!isLinkedInNotificationShellResponse_(firstResponse)) {
      return firstResponse;
    }

    await reloadTabAndWait_(tabId, LINKEDIN_SHELL_TIMEOUT_X5);
    const secondResponse = await sendScrapeJobRequestWithRetry_(tabId, {
      linkedinTimeoutMultiplier: LINKEDIN_SHELL_TIMEOUT_X5
    });
    if (!isLinkedInNotificationShellResponse_(secondResponse)) {
      return secondResponse;
    }

    await reloadTabAndWait_(tabId, LINKEDIN_SHELL_TIMEOUT_X10);
    const thirdResponse = await sendScrapeJobRequestWithRetry_(tabId, {
      linkedinTimeoutMultiplier: LINKEDIN_SHELL_TIMEOUT_X10
    });
    if (!isLinkedInNotificationShellResponse_(thirdResponse)) {
      return thirdResponse;
    }

    return {
      success: true,
      data: {
        __dropFromStage: true,
        __dropReason: 'linkedin_notifications_shell',
        __linkedinNotificationShell: true
      }
    };
  }

  function normalizeAutofillLabelKey_(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function sanitizeAutofillLabel_(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  function sanitizeAutofillValue_(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/\r\n/g, '\n')
      .slice(0, 50000);
  }

  function toIsoOrNow_(value, fallbackIso) {
    const text = String(value || '').trim();
    if (!text) {
      return fallbackIso || new Date().toISOString();
    }
    const parsed = new Date(text);
    if (isNaN(parsed.getTime())) {
      return fallbackIso || new Date().toISOString();
    }
    return parsed.toISOString();
  }

  function createAutofillProfileId_() {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `af_${Date.now()}_${randomPart}`;
  }

  function normalizeAutofillSeedSignaturePart_(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function buildAutofillSeedSignature_(entries) {
    const sourceEntries = Array.isArray(entries) ? entries : [];
    return sourceEntries.map(function(entry) {
      const safe = entry || {};
      return [
        normalizeAutofillSeedSignaturePart_(safe.label),
        normalizeAutofillSeedSignaturePart_(safe.value)
      ].join('::');
    }).sort().join('\n');
  }

  function buildAutofillSeedProfileEntries_(seedEntries, nowIso) {
    const timestamp = String(nowIso || new Date().toISOString()).trim();
    return (Array.isArray(seedEntries) ? seedEntries : []).map(function(seed) {
      return {
        id: createAutofillProfileId_(),
        label: sanitizeAutofillLabel_(seed.label),
        value: sanitizeAutofillValue_(seed.value),
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });
  }

  function shouldMigrateLegacyAutofillSeedState_(rawState, entries) {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const normalizedEntries = Array.isArray(entries) ? entries : [];
    if (normalizedEntries.length === 0) {
      return false;
    }
    const legacySignature = buildAutofillSeedSignature_(AUTOFILL_LEGACY_SEED_ENTRIES);
    const currentSignature = buildAutofillSeedSignature_(normalizedEntries);
    if (currentSignature !== legacySignature) {
      return false;
    }
    return source.seededFromDefaults === true || normalizedEntries.length === AUTOFILL_LEGACY_SEED_ENTRIES.length;
  }

  function normalizeAutofillProfilesState_(rawState) {
    const nowIso = new Date().toISOString();
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const sourceEntries = Array.isArray(source.entries) ? source.entries : [];
    const seenIds = new Set();
    const entries = [];

    for (let i = 0; i < sourceEntries.length; i++) {
      const src = sourceEntries[i] || {};
      const label = sanitizeAutofillLabel_(src.label);
      if (!label) {
        continue;
      }
      let id = String(src.id || '').trim();
      if (!id) {
        id = createAutofillProfileId_();
      }
      if (seenIds.has(id)) {
        continue;
      }
      seenIds.add(id);
      const createdAt = toIsoOrNow_(src.createdAt, nowIso);
      const updatedAt = toIsoOrNow_(src.updatedAt, createdAt);
      entries.push({
        id: id,
        label: label,
        value: sanitizeAutofillValue_(src.value),
        createdAt: createdAt,
        updatedAt: updatedAt
      });
    }

    const migratedFromLegacyDefaults = shouldMigrateLegacyAutofillSeedState_(source, entries);
    const normalizedEntries = migratedFromLegacyDefaults
      ? buildAutofillSeedProfileEntries_(AUTOFILL_SEED_ENTRIES, nowIso)
      : entries;

    return {
      version: AUTOFILL_PROFILES_VERSION,
      updatedAt: migratedFromLegacyDefaults ? nowIso : toIsoOrNow_(source.updatedAt, nowIso),
      seededFromDefaults: migratedFromLegacyDefaults || source.seededFromDefaults === true,
      entries: normalizedEntries
    };
  }

  function parseAutofillStateUpdatedAtMs_(value) {
    const text = String(value || '').trim();
    if (!text) {
      return 0;
    }
    const parsed = new Date(text).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  async function resolveAutofillWebAppConfig_() {
    try {
      const sourceUrl = await resolveScrapeListSourceUrl();
      const sheetId = extractSpreadsheetId(sourceUrl);
      if (!sheetId) {
        return null;
      }
      const webAppUrl = await fetchSettingsValue(sheetId, 'WebAppUrl');
      if (!webAppUrl) {
        return null;
      }
      return {
        sheetId: sheetId,
        webAppUrl: webAppUrl
      };
    } catch (error) {
      return null;
    }
  }

  async function fetchAutofillProfilesStateFromWebApp_() {
    const config = await resolveAutofillWebAppConfig_();
    if (!config || !config.webAppUrl) {
      return null;
    }
    const response = await postWebApp(config.webAppUrl, {
      action: 'getAddonAutofillProfiles'
    });
    if (!response) {
      return null;
    }
    return normalizeAutofillProfilesState_(response.state || null);
  }

  async function saveAutofillProfilesStateToWebApp_(stateInput) {
    const config = await resolveAutofillWebAppConfig_();
    if (!config || !config.webAppUrl) {
      return null;
    }
    const normalized = normalizeAutofillProfilesState_(stateInput);
    normalized.updatedAt = new Date().toISOString();
    const response = await postWebApp(config.webAppUrl, {
      action: 'saveAddonAutofillProfiles',
      state: normalized
    });
    return normalizeAutofillProfilesState_(response && response.state ? response.state : normalized);
  }

  async function saveAutofillProfilesState_(stateInput, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const normalized = normalizeAutofillProfilesState_(stateInput);
    normalized.updatedAt = new Date().toISOString();
    await browser.storage.local.set({
      [AUTOFILL_PROFILES_STORAGE_KEY]: normalized
    });
    if (opts.syncRemote === false) {
      return normalized;
    }
    try {
      const remoteState = await saveAutofillProfilesStateToWebApp_(normalized);
      if (remoteState) {
        autofillRemoteSyncLastAtMs = Date.now();
        await browser.storage.local.set({
          [AUTOFILL_PROFILES_STORAGE_KEY]: remoteState
        });
        return remoteState;
      }
    } catch (error) {
      console.warn('[Autofill] Remote save failed:', error && error.message ? error.message : error);
    }
    return normalized;
  }

  function areAutofillProfilesStatesEqual_(leftState, rightState) {
    return JSON.stringify(normalizeAutofillProfilesState_(leftState)) === JSON.stringify(normalizeAutofillProfilesState_(rightState));
  }

  async function getLocalAutofillProfilesState_() {
    const stored = await browser.storage.local.get(AUTOFILL_PROFILES_STORAGE_KEY);
    const source = stored ? stored[AUTOFILL_PROFILES_STORAGE_KEY] : null;
    const localState = normalizeAutofillProfilesState_(source);
    if (!source || JSON.stringify(source) !== JSON.stringify(localState)) {
      await browser.storage.local.set({
        [AUTOFILL_PROFILES_STORAGE_KEY]: localState
      });
    }
    return localState;
  }

  function reconcileAutofillProfilesStates_(localStateInput, remoteStateInput) {
    const localState = normalizeAutofillProfilesState_(localStateInput);
    const remoteState = normalizeAutofillProfilesState_(remoteStateInput);
    const localHasEntries = Array.isArray(localState.entries) && localState.entries.length > 0;
    const remoteHasEntries = Array.isArray(remoteState.entries) && remoteState.entries.length > 0;
    const localUpdatedAtMs = parseAutofillStateUpdatedAtMs_(localState.updatedAt);
    const remoteUpdatedAtMs = parseAutofillStateUpdatedAtMs_(remoteState.updatedAt);
    const localSeedOnly = localState.seededFromDefaults === true;
    const shouldUseRemote = (!localHasEntries && remoteHasEntries) ||
      (localSeedOnly && remoteHasEntries) ||
      (remoteUpdatedAtMs >= localUpdatedAtMs);
    const finalState = shouldUseRemote ? remoteState : localState;

    return {
      finalState: finalState,
      shouldWriteLocal: shouldUseRemote && !areAutofillProfilesStatesEqual_(localState, finalState),
      shouldPushRemote: !shouldUseRemote && localHasEntries && localUpdatedAtMs > remoteUpdatedAtMs
    };
  }

  async function syncAutofillProfilesStateFromWebApp_(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const nowMs = Date.now();
    const localState = opts.localState || await getLocalAutofillProfilesState_();

    if (autofillRemoteSyncPromise) {
      return autofillRemoteSyncPromise;
    }
    if (!opts.force && autofillRemoteSyncLastAtMs > 0 && (nowMs - autofillRemoteSyncLastAtMs) < AUTOFILL_REMOTE_SYNC_MIN_INTERVAL_MS) {
      return localState;
    }

    autofillRemoteSyncPromise = (async function() {
      try {
        const remoteState = await fetchAutofillProfilesStateFromWebApp_();
        if (!remoteState) {
          return localState;
        }

        autofillRemoteSyncLastAtMs = Date.now();
        const resolution = reconcileAutofillProfilesStates_(localState, remoteState);
        let finalState = resolution.finalState;

        if (resolution.shouldWriteLocal) {
          await browser.storage.local.set({
            [AUTOFILL_PROFILES_STORAGE_KEY]: finalState
          });
        }

        if (resolution.shouldPushRemote) {
          try {
            const remoteSavedState = await saveAutofillProfilesStateToWebApp_(localState);
            if (remoteSavedState) {
              autofillRemoteSyncLastAtMs = Date.now();
              finalState = remoteSavedState;
              if (!areAutofillProfilesStatesEqual_(localState, remoteSavedState)) {
                await browser.storage.local.set({
                  [AUTOFILL_PROFILES_STORAGE_KEY]: remoteSavedState
                });
              }
            }
          } catch (remoteSaveError) {
            console.warn('[Autofill] Remote catch-up save failed:', remoteSaveError && remoteSaveError.message ? remoteSaveError.message : remoteSaveError);
          }
        }

        return finalState;
      } catch (error) {
        console.warn('[Autofill] Remote load failed:', error && error.message ? error.message : error);
        return localState;
      } finally {
        autofillRemoteSyncPromise = null;
      }
    })();

    return autofillRemoteSyncPromise;
  }

  function queueAutofillProfilesRemoteSync_(options) {
    return syncAutofillProfilesStateFromWebApp_(options).catch(error => {
      console.warn('[Autofill] Background sync failed:', error && error.message ? error.message : error);
      return null;
    });
  }

  async function getAutofillProfilesState_(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const localState = await getLocalAutofillProfilesState_();

    if (opts.syncRemote === true) {
      return syncAutofillProfilesStateFromWebApp_({
        localState: localState,
        force: opts.forceRemote === true
      });
    }
    if (opts.scheduleRemoteSync === true) {
      queueAutofillProfilesRemoteSync_({
        localState: localState,
        force: opts.forceRemote === true
      });
    }
    return localState;
  }

  async function getAutofillProfiles_(options) {
    const state = await getAutofillProfilesState_(options);
    return (state.entries || []).map(function(entry) {
      return Object.assign({}, entry);
    });
  }

  function createAutofillSeedState_() {
    const nowIso = new Date().toISOString();
    return {
      version: AUTOFILL_PROFILES_VERSION,
      updatedAt: nowIso,
      seededFromDefaults: true,
      entries: buildAutofillSeedProfileEntries_(AUTOFILL_SEED_ENTRIES, nowIso)
    };
  }

  async function ensureAutofillSeeded_(options) {
    const opts = options && typeof options === 'object' ? options : {};
    const stored = await browser.storage.local.get(AUTOFILL_SEEDED_STORAGE_KEY);
    const alreadySeeded = stored[AUTOFILL_SEEDED_STORAGE_KEY] === true;
    const existingState = await getAutofillProfilesState_({
      syncRemote: opts.syncRemote === true,
      forceRemote: opts.forceRemote === true
    });

    if (Array.isArray(existingState.entries) && existingState.entries.length > 0) {
      if (!alreadySeeded) {
        await browser.storage.local.set({
          [AUTOFILL_SEEDED_STORAGE_KEY]: true
        });
      }
      return existingState;
    }

    if (alreadySeeded) {
      return existingState;
    }

    const seededState = await saveAutofillProfilesState_(createAutofillSeedState_());
    await browser.storage.local.set({
      [AUTOFILL_SEEDED_STORAGE_KEY]: true
    });
    return seededState;
  }

  function isSpreadsheetTabUrl_(urlValue) {
    const url = String(urlValue || '').trim();
    return !!(url && url.indexOf('/spreadsheets/') !== -1 && url.indexOf('/d/') !== -1);
  }

  async function restoreAutofillProfilesFromSheetIfNeeded_(reason, options) {
    const opts = options && typeof options === 'object' ? options : {};
    try {
      const localState = await getLocalAutofillProfilesState_();
      const shouldTryRemote = opts.force === true ||
        localState.seededFromDefaults === true ||
        !Array.isArray(localState.entries) ||
        localState.entries.length === 0;

      if (!shouldTryRemote) {
        return localState;
      }

      const syncedState = await getAutofillProfilesState_({
        syncRemote: true,
        forceRemote: opts.force === true
      });

      if (!areAutofillProfilesStatesEqual_(localState, syncedState)) {
        await queueRebuildAutofillContextMenus_(`autofill-restore:${reason || 'unknown'}`);
      }

      return syncedState;
    } catch (error) {
      console.warn('[Autofill] Restore from sheet failed:', reason || '', error && error.message ? error.message : error);
      return null;
    }
  }

  function createContextMenuItem_(item) {
    return new Promise((resolve, reject) => {
      browser.contextMenus.create(item, () => {
        const err = browser.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve();
      });
    });
  }

  function removeContextMenuItemSafe_(id) {
    return new Promise(resolve => {
      browser.contextMenus.remove(id, () => {
        resolve();
      });
    });
  }

  function truncateContextMenuTitle_(label) {
    const text = String(label || '').trim();
    if (!text) return 'Untitled';
    if (text.length <= 50) return text;
    return text.slice(0, 47) + '...';
  }

  async function clearAutofillContextMenus_() {
    autofillMenuEntryIds = [];
    await new Promise(resolve => {
      browser.contextMenus.removeAll(() => {
        resolve();
      });
    });
  }

  async function rebuildAutofillContextMenus_(reason) {
    if (!browser.contextMenus || typeof browser.contextMenus.create !== 'function') {
      return;
    }
    await ensureAutofillSeeded_();
    const entries = await getAutofillProfiles_();
    await clearAutofillContextMenus_();

    try {
      await createContextMenuItem_({
        id: AUTOFILL_CONTEXT_ROOT_ID,
        title: AUTOFILL_CONTEXT_ROOT_TITLE,
        contexts: ['editable']
      });
      autofillMenuEntryIds.push(AUTOFILL_CONTEXT_ROOT_ID);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const itemId = AUTOFILL_CONTEXT_PROFILE_PREFIX + entry.id;
        await createContextMenuItem_({
          id: itemId,
          parentId: AUTOFILL_CONTEXT_ROOT_ID,
          title: truncateContextMenuTitle_(entry.label),
          contexts: ['editable']
        });
        autofillMenuEntryIds.push(itemId);
      }

      const separatorId = AUTOFILL_CONTEXT_ROOT_ID + '-sep';
      await createContextMenuItem_({
        id: separatorId,
        parentId: AUTOFILL_CONTEXT_ROOT_ID,
        type: 'separator',
        contexts: ['editable']
      });
      autofillMenuEntryIds.push(separatorId);

      await createContextMenuItem_({
        id: AUTOFILL_CONTEXT_ADD_ID,
        parentId: AUTOFILL_CONTEXT_ROOT_ID,
        title: '+ Add',
        contexts: ['editable']
      });
      autofillMenuEntryIds.push(AUTOFILL_CONTEXT_ADD_ID);

      await createContextMenuItem_({
        id: AUTOFILL_CONTEXT_MANAGE_ID,
        parentId: AUTOFILL_CONTEXT_ROOT_ID,
        title: 'Manage',
        contexts: ['editable']
      });
      autofillMenuEntryIds.push(AUTOFILL_CONTEXT_MANAGE_ID);

      if (browser.contextMenus && typeof browser.contextMenus.refresh === 'function') {
        browser.contextMenus.refresh();
      }
    } catch (error) {
      console.error('[Autofill] Failed to rebuild context menu', reason || '', error);
    }
  }

  function queueRebuildAutofillContextMenus_(reason) {
    autofillMenuBuildQueue = autofillMenuBuildQueue.then(() => {
      return rebuildAutofillContextMenus_(reason);
    }).catch(error => {
      console.error('[Autofill] Menu build queue failed', error);
    });
    return autofillMenuBuildQueue;
  }

  async function upsertAutofillProfile_(profileInput) {
    const input = profileInput && typeof profileInput === 'object' ? profileInput : {};
    const label = sanitizeAutofillLabel_(input.label);
    const value = sanitizeAutofillValue_(input.value);
    const id = String(input.id || '').trim();

    if (!label) {
      throw new Error('Label is required');
    }
    if (!value) {
      throw new Error('Value is required');
    }

    const state = await getAutofillProfilesState_({
      syncRemote: true
    });
    const labelKey = normalizeAutofillLabelKey_(label);
    const duplicate = (state.entries || []).find(function(entry) {
      return normalizeAutofillLabelKey_(entry.label) === labelKey && entry.id !== id;
    });
    if (duplicate) {
      throw new Error('Label must be unique');
    }

    const nowIso = new Date().toISOString();
    let updatedEntry = null;
    let found = false;
    for (let i = 0; i < state.entries.length; i++) {
      const entry = state.entries[i];
      if (entry.id === id && id) {
        found = true;
        updatedEntry = {
          id: entry.id,
          label: label,
          value: value,
          createdAt: toIsoOrNow_(entry.createdAt, nowIso),
          updatedAt: nowIso
        };
        state.entries[i] = updatedEntry;
        break;
      }
    }

    if (!found) {
      updatedEntry = {
        id: createAutofillProfileId_(),
        label: label,
        value: value,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      state.entries.push(updatedEntry);
    }

    state.seededFromDefaults = false;
    const savedState = await saveAutofillProfilesState_(state);
    await queueRebuildAutofillContextMenus_('profile-upsert');
    return {
      profile: updatedEntry,
      entries: savedState.entries || []
    };
  }

  async function deleteAutofillProfile_(idValue) {
    const id = String(idValue || '').trim();
    if (!id) {
      throw new Error('Profile id is required');
    }
    const state = await getAutofillProfilesState_({
      syncRemote: true
    });
    const before = state.entries.length;
    state.entries = state.entries.filter(function(entry) {
      return entry.id !== id;
    });

    if (state.entries.length !== before) {
      state.seededFromDefaults = false;
      await saveAutofillProfilesState_(state);
      await queueRebuildAutofillContextMenus_('profile-delete');
    }
    return state.entries || [];
  }

  function normalizeAutofillIntentMode_(modeValue) {
    const mode = String(modeValue || '').trim().toLowerCase();
    return mode === 'add' ? 'add' : 'manage';
  }

  async function setAutofillPopupIntent_(modeValue, source) {
    const mode = normalizeAutofillIntentMode_(modeValue);
    await browser.storage.local.set({
      [AUTOFILL_POPUP_INTENT_STORAGE_KEY]: {
        mode: mode,
        source: String(source || 'context-menu'),
        createdAt: new Date().toISOString()
      }
    });
  }

  async function consumeAutofillPopupIntent_() {
    const stored = await browser.storage.local.get(AUTOFILL_POPUP_INTENT_STORAGE_KEY);
    const intent = stored ? stored[AUTOFILL_POPUP_INTENT_STORAGE_KEY] : null;
    await browser.storage.local.remove(AUTOFILL_POPUP_INTENT_STORAGE_KEY);
    if (!intent || typeof intent !== 'object') {
      return null;
    }
    return {
      mode: normalizeAutofillIntentMode_(intent.mode),
      source: String(intent.source || ''),
      createdAt: toIsoOrNow_(intent.createdAt)
    };
  }

  async function saveAutofillDiagnostic_(diagnosticInput) {
    const source = diagnosticInput && typeof diagnosticInput === 'object' ? diagnosticInput : {};
    const normalized = {
      createdAt: toIsoOrNow_(source.createdAt),
      tabId: typeof source.tabId === 'number' ? source.tabId : -1,
      profileId: String(source.profileId || '').trim(),
      profileLabel: String(source.profileLabel || '').trim(),
      requestedFrameId: Number.isInteger(source.requestedFrameId) ? source.requestedFrameId : null,
      success: source.success === true,
      finalError: String(source.finalError || '').trim(),
      attempts: Array.isArray(source.attempts)
        ? source.attempts.map(function(item) {
            return {
              frameId: Number.isInteger(item && item.frameId) ? item.frameId : null,
              phase: String(item && item.phase ? item.phase : '').trim(),
              success: item && item.success === true,
              error: String(item && item.error ? item.error : '').trim(),
              targetTag: String(item && item.targetTag ? item.targetTag : '').trim(),
              elapsedMs: Number.isFinite(Number(item && item.elapsedMs)) ? Number(item.elapsedMs) : null
            };
          })
        : []
    };
    await browser.storage.local.set({
      [AUTOFILL_LAST_DIAGNOSTIC_STORAGE_KEY]: normalized
    });
    return normalized;
  }

  async function getAutofillLastDiagnostic_() {
    const stored = await browser.storage.local.get(AUTOFILL_LAST_DIAGNOSTIC_STORAGE_KEY);
    const diagnostic = stored ? stored[AUTOFILL_LAST_DIAGNOSTIC_STORAGE_KEY] : null;
    if (!diagnostic || typeof diagnostic !== 'object') {
      return null;
    }
    return diagnostic;
  }

  function recordAutofillAttempt_(diagnostic, frameId, phase, response) {
    if (!diagnostic || !Array.isArray(diagnostic.attempts)) {
      return;
    }
    const parsedResponse = response && typeof response === 'object' ? response : {};
    diagnostic.attempts.push({
      frameId: Number.isInteger(frameId) ? frameId : null,
      phase: String(phase || '').trim(),
      success: parsedResponse.success === true,
      error: String(parsedResponse.error || '').trim(),
      targetTag: String(parsedResponse.targetTag || '').trim(),
      elapsedMs: Number.isFinite(Number(parsedResponse.elapsedMs)) ? Number(parsedResponse.elapsedMs) : null
    });
  }

  async function openAutofillPopupFromContext_(mode) {
    await setAutofillPopupIntent_(mode, 'context-menu');
    try {
      if (browser.browserAction && typeof browser.browserAction.openPopup === 'function') {
        await browser.browserAction.openPopup();
      }
    } catch (error) {
      console.log('[Autofill] openPopup unavailable, intent saved for manual popup open');
    }
  }

  async function tryAutofillMessage_(tabId, messagePayload, frameId) {
    try {
      if (Number.isInteger(frameId) && frameId >= 0) {
        return await browser.tabs.sendMessage(tabId, messagePayload, { frameId: frameId });
      }
      return await browser.tabs.sendMessage(tabId, messagePayload);
    } catch (error) {
      return {
        success: false,
        error: String(error && error.message ? error.message : error)
      };
    }
  }

  async function ensureAutofillScriptInTab_(tabId, frameId) {
    if (!browser.tabs || typeof browser.tabs.executeScript !== 'function') {
      return;
    }

    const details = {
      file: 'content-autofill.js',
      runAt: 'document_start',
      matchAboutBlank: true
    };
    if (Number.isInteger(frameId) && frameId >= 0) {
      details.frameId = frameId;
    } else {
      details.allFrames = true;
    }

    try {
      await browser.tabs.executeScript(tabId, details);
    } catch (error) {
      // Injection can fail on restricted pages; best-effort fallback only.
    }
  }

  async function tryAutofillOnFrameWithInjection_(tabId, messagePayload, frameId, diagnostic) {
    let response = await tryAutofillMessage_(tabId, messagePayload, frameId);
    recordAutofillAttempt_(diagnostic, frameId, 'direct', response);
    if (response && response.success === true) {
      return response;
    }

    await ensureAutofillScriptInTab_(tabId, frameId);
    response = await tryAutofillMessage_(tabId, messagePayload, frameId);
    recordAutofillAttempt_(diagnostic, frameId, 'afterInject', response);
    return response;
  }

  async function getTabFrameIds_(tabId) {
    if (!browser.webNavigation || typeof browser.webNavigation.getAllFrames !== 'function') {
      return [];
    }
    try {
      const frames = await browser.webNavigation.getAllFrames({ tabId: tabId });
      if (!Array.isArray(frames)) {
        return [];
      }
      return frames
        .map(function(frame) { return frame && Number.isInteger(frame.frameId) ? frame.frameId : -1; })
        .filter(function(frameId) { return frameId >= 0; });
    } catch (error) {
      return [];
    }
  }

  async function applyAutofillProfileToTab_(tabId, profileId, frameId) {
    const id = String(profileId || '').trim();
    const hasValidTabId = typeof tabId === 'number' && tabId >= 0;
    if (!hasValidTabId || !id) {
      return;
    }
    const entries = await getAutofillProfiles_();
    const profile = entries.find(function(entry) {
      return entry.id === id;
    });
    if (!profile) {
      await queueRebuildAutofillContextMenus_('profile-missing');
      return;
    }

    const diagnostic = {
      createdAt: new Date().toISOString(),
      tabId: tabId,
      profileId: profile.id || id,
      profileLabel: profile.label || '',
      requestedFrameId: Number.isInteger(frameId) ? frameId : null,
      success: false,
      finalError: '',
      attempts: []
    };

    const messagePayload = {
      action: 'autofillTypeIntoLastContextTarget',
      value: profile.value,
      mode: 'replace',
      minDelayMs: AUTOFILL_TYPING_MIN_DELAY_MS,
      maxDelayMs: AUTOFILL_TYPING_MAX_DELAY_MS
    };

    const frameIdsToTry = [];
    if (Number.isInteger(frameId) && frameId >= 0) {
      frameIdsToTry.push(frameId);
    }
    if (frameIdsToTry.indexOf(0) === -1) {
      frameIdsToTry.push(0);
    }

    const discoveredFrameIds = await getTabFrameIds_(tabId);
    for (let i = 0; i < discoveredFrameIds.length; i++) {
      const candidate = discoveredFrameIds[i];
      if (frameIdsToTry.indexOf(candidate) === -1) {
        frameIdsToTry.push(candidate);
      }
    }

    for (let i = 0; i < frameIdsToTry.length; i++) {
      const candidateFrameId = frameIdsToTry[i];
      const response = await tryAutofillOnFrameWithInjection_(tabId, messagePayload, candidateFrameId, diagnostic);
      if (response && response.success === true) {
        diagnostic.success = true;
        diagnostic.finalError = '';
        await saveAutofillDiagnostic_(diagnostic);
        return;
      }
    }

    const broadcastResponse = await tryAutofillOnFrameWithInjection_(tabId, messagePayload, null, diagnostic);
    if (!broadcastResponse || broadcastResponse.success !== true) {
      const errText = broadcastResponse && broadcastResponse.error
        ? broadcastResponse.error
        : 'autofill typing failed';
      diagnostic.success = false;
      diagnostic.finalError = errText;
      await saveAutofillDiagnostic_(diagnostic);
      console.error('[Autofill] Failed to apply profile to tab', tabId, profile.label, 'frameId=', frameId, errText, diagnostic);
      return;
    }
    diagnostic.success = true;
    diagnostic.finalError = '';
    await saveAutofillDiagnostic_(diagnostic);
  }

  async function handleAutofillContextMenuClick_(info, tab) {
    const menuItemId = String((info && info.menuItemId) || '');
    if (!menuItemId) {
      return;
    }

    if (menuItemId.indexOf(AUTOFILL_CONTEXT_PROFILE_PREFIX) === 0) {
      const profileId = menuItemId.slice(AUTOFILL_CONTEXT_PROFILE_PREFIX.length);
      const tabId = tab && typeof tab.id === 'number' ? tab.id : -1;
      const frameId = info && Number.isInteger(info.frameId) ? info.frameId : null;
      await applyAutofillProfileToTab_(tabId, profileId, frameId);
      return;
    }

    if (menuItemId === AUTOFILL_CONTEXT_ADD_ID) {
      await openAutofillPopupFromContext_('add');
      return;
    }

    if (menuItemId === AUTOFILL_CONTEXT_MANAGE_ID) {
      await openAutofillPopupFromContext_('manage');
    }
  }

  if (browser.contextMenus && browser.contextMenus.onClicked) {
    browser.contextMenus.onClicked.addListener((info, tab) => {
      handleAutofillContextMenuClick_(info, tab).catch(error => {
        console.error('[Autofill] Context click handler failed', error);
      });
    });
  }

  if (browser.tabs && browser.tabs.onUpdated) {
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      const candidateUrl = String((changeInfo && changeInfo.url) || (tab && tab.url) || '').trim();
      const status = String((changeInfo && changeInfo.status) || '').trim();
      if (!candidateUrl || !isSpreadsheetTabUrl_(candidateUrl)) {
        return;
      }
      if (status && status !== 'complete') {
        return;
      }
      restoreAutofillProfilesFromSheetIfNeeded_('tabs.onUpdated').catch(error => {
        console.warn('[Autofill] Sheet-tab restore on update failed:', error && error.message ? error.message : error);
      });
    });
  }

  if (browser.tabs && browser.tabs.onActivated) {
    browser.tabs.onActivated.addListener((activeInfo) => {
      const tabId = activeInfo && typeof activeInfo.tabId === 'number' ? activeInfo.tabId : -1;
      if (tabId < 0 || !browser.tabs.get) {
        return;
      }
      browser.tabs.get(tabId).then(tab => {
        if (!tab || !isSpreadsheetTabUrl_(tab.url)) {
          return;
        }
        return restoreAutofillProfilesFromSheetIfNeeded_('tabs.onActivated');
      }).catch(() => {
        // ignore tab inspection failures
      });
    });
  }

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes || !changes[AUTOFILL_PROFILES_STORAGE_KEY]) {
      return;
    }
    queueRebuildAutofillContextMenus_('storage-change');
  });

  if (browser.runtime && browser.runtime.onInstalled) {
    browser.runtime.onInstalled.addListener(() => {
      ensureAutofillSeeded_({
        syncRemote: true,
        forceRemote: true
      })
        .then(() => queueRebuildAutofillContextMenus_('installed'))
        .catch(error => {
          console.error('[Autofill] onInstalled bootstrap failed', error);
        });
      ensureCloudScrapePollAlarm_().catch(error => {
        console.error('[cloud] Failed to initialize poll alarm on install', error);
      });
    });
  }

  if (browser.alarms && browser.alarms.onAlarm) {
    browser.alarms.onAlarm.addListener((alarm) => {
      if (!alarm || alarm.name !== CLOUD_SCRAPE_POLL_ALARM_NAME) {
        return;
      }
      pollCloudScrapePlan_().catch(error => {
        console.error('[cloud] Poll alarm failed', error);
      });
    });
  }

  /**
   * Sleep utility
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Initialize storage
  browser.storage.local.get(['jobsData']).then(result => {
    if (result.jobsData) {
      jobsData = result.jobsData;
    }
  });

  ensureAutofillSeeded_({
    syncRemote: true,
    forceRemote: true
  })
    .then(() => queueRebuildAutofillContextMenus_('startup'))
    .catch(error => {
      console.error('[Autofill] Startup bootstrap failed', error);
    });

  ensureCloudScrapePollAlarm_()
    .then(() => pollCloudScrapePlan_())
    .catch(error => {
      console.error('[cloud] Startup poll bootstrap failed', error);
    });

  // Save jobs data periodically
  setInterval(() => {
    if (jobsData.length > 0) {
      browser.storage.local.set({ jobsData: jobsData });
    }
  }, 5000);
})();
