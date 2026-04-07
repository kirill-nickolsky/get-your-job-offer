/**
 * Web app endpoint for addon integration
 */

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    if (params.action) {
      return jsonResponse(false, {error: 'Use POST for action=' + params.action});
    }
    return jsonResponse(true, {message: 'WebApp OK'});
  } catch (error) {
    return jsonResponse(false, {error: error.toString()});
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? e.postData.contents : '';
    const payload = body ? JSON.parse(body) : {};
    const action = String(payload.action || '').trim();

    if (!action) {
      return jsonResponse(false, {error: 'Missing action'});
    }

    if (action === 'appendStage') {
      const result = appendStageRows(payload);
      return jsonResponse(true, result);
    }

    if (action === 'validateStage') {
      const result = handleValidateStage(payload);
      return jsonResponse(true, result);
    }

    if (action === 'filterDuplicates') {
      const result = handleFilterDuplicates(payload);
      return jsonResponse(true, result);
    }

    if (action === 'updateDataFunnel') {
      const result = handleUpdateDataFunnel(payload);
      return jsonResponse(true, result);
    }

    if (action === 'getScrapeSources') {
      const result = handleGetScrapeSources(payload);
      return jsonResponse(true, result);
    }

    if (action === 'getLRateRows') {
      const result = handleGetLRateRows(payload);
      return jsonResponse(true, result);
    }

    if (action === 'updateLRateRow') {
      const result = handleUpdateLRateRow(payload);
      return jsonResponse(true, result);
    }

    if (action === 'updateSetting') {
      const result = handleUpdateSetting(payload);
      return jsonResponse(true, result);
    }

    if (action === 'syncCloudJobStates') {
      const result = handleSyncCloudJobStates(payload);
      return jsonResponse(true, result);
    }

    if (action === 'getAddonAutofillProfiles') {
      const result = handleGetAddonAutofillProfiles(payload);
      return jsonResponse(true, result);
    }

    if (action === 'saveAddonAutofillProfiles') {
      const result = handleSaveAddonAutofillProfiles(payload);
      return jsonResponse(true, result);
    }

    return jsonResponse(false, {error: 'Unknown action: ' + action});
  } catch (error) {
    return jsonResponse(false, {error: error.toString()});
  }
}

function jsonResponse(success, data) {
  const payload = Object.assign({success: success}, data || {});
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function logWebAppEvent(stage, sourceId, details) {
  try {
    appendScrapeLog({
      sourceId: sourceId || '',
      stage: stage || '',
      details: details || ''
    });
  } catch (error) {
    Logger.log('[WebApp] Failed to append ScrapeLog: ' + error.toString());
  }
}

function appendStageRows(payload) {
  const rows = payload && payload.rows ? payload.rows : [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return {appended: 0};
  }

  const scrapePageName = payload.scrapePageName ||
    (rows[0] && rows[0].ScrapePageName ? rows[0].ScrapePageName : '');
  if (scrapePageName && typeof validateScrapeSource === 'function') {
    validateScrapeSource(scrapePageName, payload.scrapePageId || '');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let stageSheet = ss.getSheetByName('Stage');
  const expectedHeader = getExpectedHeader();

  if (!stageSheet) {
    stageSheet = ss.insertSheet('Stage');
    stageSheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
  } else {
    const validation = validateHeader(stageSheet, expectedHeader);
    if (!validation.valid) {
      alignSheetHeaderToExpected_(stageSheet, expectedHeader);
      const afterAlignValidation = validateHeader(stageSheet, expectedHeader);
      if (!afterAlignValidation.valid) {
        throw new Error('Stage header validation failed: ' + afterAlignValidation.errors.join('; '));
      }
    }
  }

  const values = rows.map(row => {
    const safeRow = row || {};
    return expectedHeader.map(colName => {
      if (colName === 'Status') {
        return 'Staged';
      }
      if (colName === 'ScrapePageName') {
        const scrapeName = safeRow.ScrapePageName || payload.scrapePageName || '';
        return scrapeName;
      }
      if (safeRow[colName] !== undefined && safeRow[colName] !== null) {
        return safeRow[colName];
      }
      return '';
    });
  });

  const startRow = stageSheet.getLastRow() + 1;
  stageSheet.getRange(startRow, 1, values.length, expectedHeader.length).setValues(values);

  logWebAppEvent('appendStage', scrapePageName, 'appended=' + values.length);
  return {appended: values.length};
}

function handleUpdateDataFunnel(payload) {
  const scrapePageName = payload.scrapePageName || '';
  const status = payload.status || '';
  const jobsCount = payload.jobsCount;
  const clearCount = payload.clearCount === true;

  if (scrapePageName && typeof validateScrapeSource === 'function') {
    validateScrapeSource(scrapePageName, payload.scrapePageId || '');
  }

  updateDataFunnelStatus(scrapePageName, status, jobsCount, clearCount);
  logWebAppEvent('updateDataFunnel', scrapePageName, `status=${status};jobsCount=${jobsCount || ''}`);
  return {updated: true};
}

function handleValidateStage(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let stageSheet = ss.getSheetByName('Stage');
  const expectedHeader = getExpectedHeader();

  if (!stageSheet) {
    stageSheet = ss.insertSheet('Stage');
    stageSheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
    logWebAppEvent('validateStage', '', 'created=true');
    return {valid: true, created: true};
  }

  const validation = validateHeader(stageSheet, expectedHeader);
  if (!validation.valid) {
    alignSheetHeaderToExpected_(stageSheet, expectedHeader);
    const afterAlignValidation = validateHeader(stageSheet, expectedHeader);
    if (!afterAlignValidation.valid) {
      throw new Error('Stage header validation failed: ' + afterAlignValidation.errors.join('; '));
    }
  }

  logWebAppEvent('validateStage', '', 'created=false');
  return {valid: true, created: false};
}

function handleFilterDuplicates(payload) {
  const jobs = payload && payload.jobs ? payload.jobs : [];
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return {keepMask: [], skipped: 0};
  }

  const existingKeys = buildExistingJobKeys(['NewJobs', 'JobsHist', 'DeletedJobs']);
  const keepMask = [];
  let skipped = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i] || {};
    const key = buildJobKey(job.JobId, job.JobUrl);
    const urlKey = buildJobUrlKey(job.JobUrl);
    const idKey = buildJobIdKey(job.JobId, job.JobUrl);
    if (!key && !urlKey && !idKey) {
      keepMask.push(true);
      continue;
    }
    if ((key && existingKeys.has(key)) ||
        (urlKey && existingKeys.has(urlKey)) ||
        (idKey && existingKeys.has(idKey))) {
      keepMask.push(false);
      skipped++;
    } else {
      keepMask.push(true);
    }
  }

  logWebAppEvent('filterDuplicates', '', 'skipped=' + skipped);
  return {keepMask: keepMask, skipped: skipped};
}

function handleGetScrapeSources(payload) {
  const config = getScrapeSourcesConfig();
  const enabledOnly = payload && payload.enabledOnly === true;
  const rows = Array.isArray(config) ? config : (config && Array.isArray(config.rows) ? config.rows : []);
  const sources = rows.filter(source => source && (enabledOnly ? source.enabled : true));
  return {sources: sources};
}

function handleGetAddonAutofillProfiles(payload) {
  return {
    state: getAddonAutofillProfilesState_()
  };
}

function handleSaveAddonAutofillProfiles(payload) {
  return {
    state: saveAddonAutofillProfilesState_(payload && payload.state ? payload.state : null)
  };
}

function getAddonAutofillProfilesPropKey_() {
  return 'addonAutofillProfilesV1';
}

function normalizeAutofillIsoOrNow_(value, fallbackIso) {
  const fallback = String(fallbackIso || new Date().toISOString()).trim();
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  const ms = new Date(text).getTime();
  return isNaN(ms) ? fallback : new Date(ms).toISOString();
}

function normalizeAddonAutofillProfilesState_(rawState) {
  const nowIso = new Date().toISOString();
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  const sourceEntries = Array.isArray(source.entries) ? source.entries : [];
  const seenIds = {};
  const entries = [];

  for (let i = 0; i < sourceEntries.length; i++) {
    const entry = sourceEntries[i] && typeof sourceEntries[i] === 'object' ? sourceEntries[i] : {};
    const id = String(entry.id || '').trim();
    const label = String(entry.label || '').trim();
    if (!id || !label || seenIds[id]) {
      continue;
    }
    seenIds[id] = true;

    const createdAt = normalizeAutofillIsoOrNow_(entry.createdAt, nowIso);
    entries.push({
      id: id,
      label: label,
      value: String(entry.value || ''),
      createdAt: createdAt,
      updatedAt: normalizeAutofillIsoOrNow_(entry.updatedAt, createdAt)
    });
  }

  return {
    version: 1,
    updatedAt: normalizeAutofillIsoOrNow_(source.updatedAt, nowIso),
    seededFromDefaults: source.seededFromDefaults === true,
    entries: entries
  };
}

function getAddonAutofillProfilesState_() {
  const docProps = PropertiesService.getDocumentProperties();
  const raw = docProps.getProperty(getAddonAutofillProfilesPropKey_());
  if (!raw) {
    return normalizeAddonAutofillProfilesState_(null);
  }
  try {
    return normalizeAddonAutofillProfilesState_(JSON.parse(raw));
  } catch (error) {
    docProps.deleteProperty(getAddonAutofillProfilesPropKey_());
    return normalizeAddonAutofillProfilesState_(null);
  }
}

function saveAddonAutofillProfilesState_(rawState) {
  const docProps = PropertiesService.getDocumentProperties();
  const normalized = normalizeAddonAutofillProfilesState_(rawState);
  normalized.updatedAt = new Date().toISOString();
  docProps.setProperty(getAddonAutofillProfilesPropKey_(), JSON.stringify(normalized));
  return normalized;
}

function getSettingOrEmpty_(key) {
  try {
    if (typeof getSetting !== 'function') {
      return '';
    }
    return String(getSetting(key) || '').trim();
  } catch (error) {
    return '';
  }
}

function normalizeTelegramBotToken_(value) {
  return String(value || '').trim().replace(/^bot/i, '');
}

function buildRowObjectFromHeaderValues_(header, rowValues) {
  const cols = Array.isArray(header) ? header : [];
  const values = Array.isArray(rowValues) ? rowValues : [];
  const result = {};
  for (let i = 0; i < cols.length; i++) {
    const key = String(cols[i] || '').trim();
    if (!key) continue;
    result[key] = values[i];
  }
  return result;
}

function buildTelegram2ApplyMessage_(row, context) {
  const safeRow = row || {};
  const safeContext = context || {};
  const title = String(safeRow.JobTitle || '').trim() || 'Untitled';
  const company = String(safeRow.JobCompany || '').trim() || 'Unknown company';
  const location = String(safeRow.JobLocation || '').trim();
  const jobUrl = String(safeRow.JobUrl || safeRow.JobApplyUrl || safeContext.jobUrl || '').trim();
  const applyUrl = String(safeRow.JobApplyUrl || '').trim();
  const rateNum = String(safeRow.JobRateNum || '').trim();
  const shortDesc = String(safeRow.JobRateShortDesc || safeRow.JobRateDesc || '').trim();
  const lines = [
    '2Apply',
    company + ' - ' + title
  ];

  if (location) lines.push('Location: ' + location);
  if (rateNum) lines.push('Rate: ' + rateNum + '/5');
  if (shortDesc) lines.push('Why: ' + shortDesc);
  if (jobUrl) lines.push('Job: ' + jobUrl);
  if (applyUrl && applyUrl !== jobUrl) lines.push('Apply: ' + applyUrl);
  if (safeContext.sheetName && safeContext.rowNum) {
    lines.push('Sheet: ' + safeContext.sheetName + ' #' + safeContext.rowNum);
  }

  return lines.join('\n');
}

function sendTelegram2ApplyNotification_(row, context) {
  const botToken = normalizeTelegramBotToken_(getSettingOrEmpty_('TelegramBotToken'));
  const chatId = getSettingOrEmpty_('TelegramChatId');

  if (!botToken || !chatId) {
    return {
      sent: false,
      reason: 'not-configured'
    };
  }

  const messageText = buildTelegram2ApplyMessage_(row, context);
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'post',
    payload: {
      chat_id: chatId,
      text: messageText,
      disable_web_page_preview: 'true'
    },
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const bodyText = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Telegram sendMessage failed: HTTP ' + code + ' ' + bodyText);
  }

  return {
    sent: true,
    code: code
  };
}

function sendTelegramTest2ApplyNotification() {
  return sendTelegram2ApplyNotification_({
    JobTitle: 'Telegram test job',
    JobCompany: 'get-your-offer',
    JobLocation: 'Remote',
    JobRateNum: '5',
    JobRateShortDesc: 'Manual test from Apps Script',
    JobUrl: 'https://example.com/job/test'
  }, {
    sheetName: 'NewJobs',
    rowNum: 0
  });
}

const LRATE_LEASE_PROP_PREFIX_ = 'lrateLeaseV1:';
const LRATE_LOCK_TTL_MINUTES_ = 240;
const LRATE_LEASE_TERMINAL_RETENTION_HOURS_ = 72;
const LRATE_LEASE_LOCK_WAIT_MS_ = 30000;

function handleGetLRateRows(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = String((payload && payload.sheetName) || 'NewJobs').trim();
  const statusFilter = String((payload && payload.status) || '2LRate').trim();
  const limitRaw = payload && payload.limit !== undefined ? parseInt(String(payload.limit), 10) : 0;
  const limit = isNaN(limitRaw) || limitRaw <= 0 ? 0 : limitRaw;

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return {rows: []};
  }

  const header = readHeader(sheet);
  const statusCol = header.indexOf('Status');
  if (statusCol === -1) {
    throw new Error('Status column missing in ' + sheetName);
  }

  const wantedColumns = [
    'JobId',
    'JobTitle',
    'JobCompany',
    'JobLocation',
    'JobSeniority',
    'JobModality',
    'JobEasyApplyFlg',
    'JobSalary',
    'JobTags',
    'JobDescription',
    'JobUrl',
    'JobApplyUrl'
  ];
  const keyIndexMap = buildLRateKeyIndexMap_(header);
  return withLRateLeaseLock_(function(docProps) {
    cleanupExpiredLRateLeases_(docProps, LRATE_LOCK_TTL_MINUTES_);

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues();
    const activeLeasedIdentities = buildActiveLeasedIdentitySet_(docProps, sheetName);
    const candidateRows = [];
    const candidateIdentityCounts = {};
    let skippedMissingIdentity = 0;
    let skippedDuplicateIdentity = 0;
    let skippedAlreadyLeased = 0;

    for (let i = 0; i < data.length; i++) {
      const status = String(data[i][statusCol] || '').trim();
      if (statusFilter && status !== statusFilter) {
        continue;
      }

      const sourceRowNum = i + 2;
      const stableJobKey = buildLRateStableJobKeyFromIndexedRow_(data[i], keyIndexMap);
      if (!stableJobKey) {
        skippedMissingIdentity++;
        continue;
      }

      const snapshotHash = buildLRateSnapshotHashFromIndexedRow_(data[i], keyIndexMap);
      const identityKey = buildLRateIdentityKey_(stableJobKey, snapshotHash);
      candidateRows.push({
        rowIndex: i,
        rowNum: sourceRowNum,
        stableJobKey: stableJobKey,
        snapshotHash: snapshotHash,
        identityKey: identityKey
      });
      candidateIdentityCounts[identityKey] = (candidateIdentityCounts[identityKey] || 0) + 1;
    }

    const rows = [];
    const runId = Utilities.getUuid();
    const nowIso = new Date().toISOString();

    for (let i = 0; i < candidateRows.length; i++) {
      const candidate = candidateRows[i];
      if (candidateIdentityCounts[candidate.identityKey] > 1) {
        skippedDuplicateIdentity++;
        continue;
      }
      if (activeLeasedIdentities.has(candidate.identityKey)) {
        skippedAlreadyLeased++;
        continue;
      }

      const sourceRowNum = candidate.rowNum;
      const rowObj = {
        rowNum: sourceRowNum
      };
      for (let c = 0; c < wantedColumns.length; c++) {
        const colName = wantedColumns[c];
        const colIndex = header.indexOf(colName);
        rowObj[colName] = colIndex !== -1 ? data[candidate.rowIndex][colIndex] : '';
      }
      rowObj.RunId = runId;
      rowObj.LeaseId = Utilities.getUuid();
      rowObj.StableJobKey = candidate.stableJobKey;
      rowObj.SnapshotHash = candidate.snapshotHash;
      rowObj.RowKey = buildLRateRowKeyFromIndexedRow_(data[candidate.rowIndex], keyIndexMap, sourceRowNum);
      rows.push(rowObj);

      saveLRateLeaseEntry_(docProps, {
        leaseId: rowObj.LeaseId,
        runId: runId,
        sheetName: sheetName,
        issuedRowNum: sourceRowNum,
        stableJobKey: candidate.stableJobKey,
        snapshotHash: candidate.snapshotHash,
        issuedAt: nowIso,
        updatedAt: nowIso,
        state: 'leased',
        resolvedRowNum: '',
        error: ''
      });
      activeLeasedIdentities.add(candidate.identityKey);

      if (limit > 0 && rows.length >= limit) {
        break;
      }
    }

    logWebAppEvent(
      'getLRateRows',
      sheetName,
      'issued=' + rows.length +
        ';skippedMissingIdentity=' + skippedMissingIdentity +
        ';skippedDuplicateIdentity=' + skippedDuplicateIdentity +
        ';skippedAlreadyLeased=' + skippedAlreadyLeased
    );
    return {
      runId: runId,
      rows: rows,
      skippedMissingIdentity: skippedMissingIdentity,
      skippedDuplicateIdentity: skippedDuplicateIdentity,
      skippedAlreadyLeased: skippedAlreadyLeased
    };
  });
}

function handleUpdateLRateRow(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = String((payload && payload.sheetName) || 'NewJobs').trim();
  const rowNum = payload && payload.rowNum !== undefined ? parseInt(String(payload.rowNum), 10) : NaN;
  const leaseId = String((payload && payload.leaseId) || '').trim();
  const stableJobKey = String((payload && payload.stableJobKey) || '').trim();
  const snapshotHash = String((payload && payload.snapshotHash) || '').trim();
  const values = payload && payload.values ? payload.values : {};
  const setLoadDttmNow = payload && payload.setLoadDttmNow === true;
  const expectedJobUrl = String((payload && payload.expectedJobUrl) || '').trim();
  const expectedRowKey = String((payload && payload.expectedRowKey) || '').trim();

  if (!values || typeof values !== 'object') {
    throw new Error('values object is required');
  }
  if (!leaseId) {
    throw new Error('leaseId is required');
  }
  if (!stableJobKey) {
    throw new Error('stableJobKey is required');
  }
  if (!snapshotHash) {
    throw new Error('snapshotHash is required');
  }

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(sheetName + ' sheet not found');
  }

  const header = readHeader(sheet);
  const keyIndexMap = buildLRateKeyIndexMap_(header);
  return withLRateLeaseLock_(function(docProps) {
    cleanupExpiredLRateLeases_(docProps, LRATE_LOCK_TTL_MINUTES_);

    const lockEntry = findLRateLockByLeaseId_(docProps, leaseId);
    if (!lockEntry) {
      throw new Error('Active LRate lease not found: ' + leaseId);
    }
    if (String(lockEntry.state || '').trim() !== 'leased') {
      throw new Error('LRate lease is not active: ' + leaseId + ' state=' + lockEntry.state);
    }
    if (String(lockEntry.sheetName || '').trim() !== sheetName) {
      markLRateLockState_(docProps, lockEntry, 'conflict', '', 'Lease sheet mismatch');
      throw new Error('LRate lease sheet mismatch: expected ' + sheetName + ', got ' + lockEntry.sheetName);
    }
    if (String(lockEntry.stableJobKey || '').trim() !== stableJobKey) {
      markLRateLockState_(docProps, lockEntry, 'conflict', '', 'StableJobKey mismatch');
      throw new Error('StableJobKey mismatch for lease ' + leaseId);
    }
    if (String(lockEntry.snapshotHash || '').trim() !== snapshotHash) {
      markLRateLockState_(docProps, lockEntry, 'conflict', '', 'SnapshotHash mismatch');
      throw new Error('SnapshotHash mismatch for lease ' + leaseId);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      markLRateLockState_(docProps, lockEntry, 'conflict', '', 'Target sheet has no data rows');
      throw new Error('Target sheet has no data rows');
    }
    const statusCol = header.indexOf('Status');
    if (statusCol === -1) {
      markLRateLockState_(docProps, lockEntry, 'conflict', '', 'Status column missing');
      throw new Error('Status column missing in ' + sheetName);
    }

    const data = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    const matchedRows = [];
    for (let i = 0; i < data.length; i++) {
      const currentStatus = String(data[i][statusCol] || '').trim();
      if (currentStatus !== '2LRate') {
        continue;
      }
      const currentStableJobKey = buildLRateStableJobKeyFromIndexedRow_(data[i], keyIndexMap);
      if (currentStableJobKey !== stableJobKey) {
        continue;
      }
      const currentSnapshotHash = buildLRateSnapshotHashFromIndexedRow_(data[i], keyIndexMap);
      if (currentSnapshotHash !== snapshotHash) {
        continue;
      }
      matchedRows.push(i + 2);
    }

    if (matchedRows.length !== 1) {
      const errorText = 'Expected exactly 1 matching active row, got ' + matchedRows.length;
      markLRateLockState_(docProps, lockEntry, 'conflict', '', errorText);
      logWebAppEvent('updateLRateRowConflict', sheetName, 'leaseId=' + leaseId + ';matches=' + matchedRows.length);
      throw new Error(errorText + ' for leaseId=' + leaseId);
    }
    const targetRowNum = matchedRows[0];

    const keys = Object.keys(values);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const colIndex = header.indexOf(key);
      if (colIndex === -1) {
        continue;
      }
      sheet.getRange(targetRowNum, colIndex + 1).setValue(values[key]);
    }

    if (setLoadDttmNow) {
      const loadDttmCol = header.indexOf('LoadDttm');
      if (loadDttmCol !== -1) {
        sheet.getRange(targetRowNum, loadDttmCol + 1).setValue(new Date());
      }
    }

    const updatedRowValues = sheet.getRange(targetRowNum, 1, 1, header.length).getValues()[0];
    const updatedRow = buildRowObjectFromHeaderValues_(header, updatedRowValues);
    const updatedStatus = String(updatedRow.Status || values.Status || '').trim();

    if (updatedStatus === '2Apply') {
      try {
        const telegramResult = sendTelegram2ApplyNotification_(updatedRow, {
          sheetName: sheetName,
          rowNum: targetRowNum,
          jobUrl: expectedJobUrl
        });
        if (telegramResult && telegramResult.sent) {
          logWebAppEvent('telegram2Apply', sheetName, 'row=' + targetRowNum + ';leaseId=' + leaseId);
        }
      } catch (telegramError) {
        Logger.log('[WebApp] Telegram 2Apply notification failed: ' + telegramError.toString());
        logWebAppEvent('telegram2ApplyError', sheetName, 'row=' + targetRowNum + ';error=' + telegramError.toString());
      }
    }

    markLRateLockState_(docProps, lockEntry, 'saved', targetRowNum, '');
    logWebAppEvent(
      'updateLRateRow',
      sheetName,
      'leaseId=' + leaseId +
        ';resolvedRow=' + targetRowNum +
        ';debugRow=' + (isNaN(rowNum) ? '' : rowNum) +
        ';rowKey=' + expectedRowKey +
        ';jobUrl=' + expectedJobUrl
    );

    return {
      updated: true,
      leaseId: leaseId,
      rowNum: targetRowNum,
      matchedByLease: true
    };
  });
}

function buildLRateKeyIndexMap_(header) {
  const cols = Array.isArray(header) ? header : [];
  return {
    jobId: cols.indexOf('JobId'),
    jobUrl: cols.indexOf('JobUrl'),
    jobApplyUrl: cols.indexOf('JobApplyUrl'),
    jobTitle: cols.indexOf('JobTitle'),
    jobCompany: cols.indexOf('JobCompany'),
    jobLocation: cols.indexOf('JobLocation'),
    jobModality: cols.indexOf('JobModality'),
    jobSeniority: cols.indexOf('JobSeniority'),
    jobEasyApplyFlg: cols.indexOf('JobEasyApplyFlg'),
    jobSalary: cols.indexOf('JobSalary'),
    jobTags: cols.indexOf('JobTags'),
    jobDescription: cols.indexOf('JobDescription'),
    status: cols.indexOf('Status')
  };
}

function normalizeLRateKeyPart_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeLRateSnapshotPart_(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildLRateStableJobKeyFromIndexedRow_(rowValues, keyIndexMap) {
  const safeRow = Array.isArray(rowValues) ? rowValues : [];
  const indexMap = keyIndexMap || {};
  const getAt = function(index) {
    if (typeof index !== 'number' || index < 0 || index >= safeRow.length) {
      return '';
    }
    return safeRow[index];
  };

  const jobId = getAt(indexMap.jobId);
  const jobUrl = getAt(indexMap.jobUrl);
  const key = buildJobKey(jobId, jobUrl);
  if (key) return key;

  const idKey = buildJobIdKey(jobId, jobUrl);
  if (idKey) return idKey;

  return buildJobUrlKey(jobUrl);
}

function buildLRateSnapshotHashFromIndexedRow_(rowValues, keyIndexMap) {
  const safeRow = Array.isArray(rowValues) ? rowValues : [];
  const indexMap = keyIndexMap || {};
  const getAt = function(index) {
    if (typeof index !== 'number' || index < 0 || index >= safeRow.length) {
      return '';
    }
    return safeRow[index];
  };

  const payload = [
    'JobId=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobId)),
    'JobUrl=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobUrl)),
    'JobApplyUrl=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobApplyUrl)),
    'JobTitle=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobTitle)),
    'JobCompany=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobCompany)),
    'JobLocation=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobLocation)),
    'JobSeniority=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobSeniority)),
    'JobModality=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobModality)),
    'JobEasyApplyFlg=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobEasyApplyFlg)),
    'JobSalary=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobSalary)),
    'JobTags=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobTags)),
    'JobDescription=' + normalizeLRateSnapshotPart_(getAt(indexMap.jobDescription))
  ].join('\n');

  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8);
  const hex = [];
  for (let i = 0; i < digest.length; i++) {
    const normalizedByte = digest[i] < 0 ? digest[i] + 256 : digest[i];
    const nextHex = normalizedByte.toString(16);
    hex.push(nextHex.length === 1 ? '0' + nextHex : nextHex);
  }
  return hex.join('');
}

function buildLRateIdentityKey_(stableJobKey, snapshotHash) {
  return String(stableJobKey || '').trim() + '|' + String(snapshotHash || '').trim();
}

function buildLRateRowKeyFromIndexedRow_(rowValues, keyIndexMap, rowNum) {
  const safeRow = Array.isArray(rowValues) ? rowValues : [];
  const indexMap = keyIndexMap || {};
  const getAt = function(index) {
    if (typeof index !== 'number' || index < 0 || index >= safeRow.length) {
      return '';
    }
    return safeRow[index];
  };

  const stableJobKey = buildLRateStableJobKeyFromIndexedRow_(safeRow, indexMap);
  if (stableJobKey) return stableJobKey;

  const signatureParts = [
    normalizeLRateKeyPart_(getAt(indexMap.jobCompany)),
    normalizeLRateKeyPart_(getAt(indexMap.jobTitle)),
    normalizeLRateKeyPart_(getAt(indexMap.jobLocation)),
    normalizeLRateKeyPart_(getAt(indexMap.jobModality)),
    normalizeLRateKeyPart_(getAt(indexMap.jobSeniority))
  ].filter(Boolean);

  if (signatureParts.length > 0) {
    return 'sig|' + signatureParts.join('|');
  }

  return 'row|' + String(rowNum || '');
}

function findLRateRowNumByKey_(sheet, header, expectedRowKey) {
  const wantedKey = String(expectedRowKey || '').trim();
  if (!wantedKey || !sheet) {
    return 0;
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }

  const keyIndexMap = buildLRateKeyIndexMap_(header);
  const range = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  for (let i = 0; i < range.length; i++) {
    const rowNum = i + 2;
    const rowKey = buildLRateRowKeyFromIndexedRow_(range[i], keyIndexMap, rowNum);
    if (rowKey === wantedKey) {
      return rowNum;
    }
  }
  return 0;
}

function withLRateLeaseLock_(callback) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(LRATE_LEASE_LOCK_WAIT_MS_);
  try {
    return callback(PropertiesService.getDocumentProperties());
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // ignore release failures
    }
  }
}

function getLRateLeasePropertyKey_(leaseId) {
  return LRATE_LEASE_PROP_PREFIX_ + String(leaseId || '').trim();
}

function normalizeLRateLeaseEntry_(rawEntry, fallbackLeaseId) {
  const safe = rawEntry || {};
  const leaseId = String(safe.leaseId || fallbackLeaseId || '').trim();
  if (!leaseId) {
    return null;
  }
  return {
    leaseId: leaseId,
    runId: String(safe.runId || '').trim(),
    sheetName: String(safe.sheetName || '').trim(),
    issuedRowNum: parseInt(String(safe.issuedRowNum || 0), 10) || 0,
    stableJobKey: String(safe.stableJobKey || '').trim(),
    snapshotHash: String(safe.snapshotHash || '').trim(),
    issuedAt: String(safe.issuedAt || '').trim(),
    updatedAt: String(safe.updatedAt || safe.issuedAt || '').trim(),
    state: String(safe.state || '').trim(),
    resolvedRowNum: parseInt(String(safe.resolvedRowNum || 0), 10) || 0,
    error: String(safe.error || '').trim()
  };
}

function loadLRateLeaseEntries_(docProps) {
  const props = docProps ? docProps.getProperties() : {};
  const leases = [];
  const keys = Object.keys(props || {});
  for (let i = 0; i < keys.length; i++) {
    const propKey = keys[i];
    if (propKey.indexOf(LRATE_LEASE_PROP_PREFIX_) !== 0) {
      continue;
    }
    const leaseId = propKey.substring(LRATE_LEASE_PROP_PREFIX_.length);
    try {
      const parsed = JSON.parse(String(props[propKey] || '{}'));
      const normalized = normalizeLRateLeaseEntry_(parsed, leaseId);
      if (normalized) {
        leases.push(normalized);
      }
    } catch (e) {
      docProps.deleteProperty(propKey);
    }
  }
  return leases;
}

function saveLRateLeaseEntry_(docProps, leaseEntry) {
  const normalized = normalizeLRateLeaseEntry_(leaseEntry, leaseEntry && leaseEntry.leaseId);
  if (!normalized) {
    throw new Error('Invalid LRate lease entry');
  }
  normalized.updatedAt = new Date().toISOString();
  docProps.setProperty(getLRateLeasePropertyKey_(normalized.leaseId), JSON.stringify(normalized));
  return normalized;
}

function deleteLRateLeaseEntry_(docProps, leaseId) {
  const safeLeaseId = String(leaseId || '').trim();
  if (!safeLeaseId) {
    return;
  }
  docProps.deleteProperty(getLRateLeasePropertyKey_(safeLeaseId));
}

function cleanupExpiredLRateLeases_(docProps, ttlMinutes) {
  const leases = loadLRateLeaseEntries_(docProps);
  const nowMs = new Date().getTime();
  const leasedCutoffMs = nowMs - ((ttlMinutes || LRATE_LOCK_TTL_MINUTES_) * 60 * 1000);
  const terminalCutoffMs = nowMs - (LRATE_LEASE_TERMINAL_RETENTION_HOURS_ * 60 * 60 * 1000);
  let expiredCount = 0;

  for (let i = 0; i < leases.length; i++) {
    const lease = leases[i];
    const issuedAtMs = parseDateCellToMs_(lease.issuedAt);
    const updatedAtMs = parseDateCellToMs_(lease.updatedAt || lease.issuedAt);
    const state = String(lease.state || '').trim();

    if (state === 'leased') {
      if (!isNaN(issuedAtMs) && issuedAtMs > leasedCutoffMs) {
        continue;
      }
      saveLRateLeaseEntry_(docProps, Object.assign({}, lease, {
        state: 'expired',
        error: 'Lease expired after ' + (ttlMinutes || LRATE_LOCK_TTL_MINUTES_) + ' minutes'
      }));
      expiredCount++;
      continue;
    }

    if (!isNaN(updatedAtMs) && updatedAtMs <= terminalCutoffMs) {
      deleteLRateLeaseEntry_(docProps, lease.leaseId);
    }
  }
  return expiredCount;
}

function buildActiveLeasedIdentitySet_(docProps, sheetName) {
  const result = new Set();
  const wantedSheetName = String(sheetName || '').trim();
  const leases = loadLRateLeaseEntries_(docProps);
  for (let i = 0; i < leases.length; i++) {
    const lease = leases[i];
    if (String(lease.state || '').trim() !== 'leased') {
      continue;
    }
    if (wantedSheetName && String(lease.sheetName || '').trim() !== wantedSheetName) {
      continue;
    }
    if (!lease.stableJobKey || !lease.snapshotHash) {
      continue;
    }
    result.add(buildLRateIdentityKey_(lease.stableJobKey, lease.snapshotHash));
  }
  return result;
}

function findLRateLockByLeaseId_(docProps, leaseId) {
  const wantedLeaseId = String(leaseId || '').trim();
  if (!wantedLeaseId) {
    return null;
  }
  const value = docProps.getProperty(getLRateLeasePropertyKey_(wantedLeaseId));
  if (!value) {
    return null;
  }
  try {
    return normalizeLRateLeaseEntry_(JSON.parse(value), wantedLeaseId);
  } catch (e) {
    deleteLRateLeaseEntry_(docProps, wantedLeaseId);
    return null;
  }
}

function markLRateLockState_(docProps, leaseEntry, state, resolvedRowNum, errorText) {
  if (!docProps || !leaseEntry || !leaseEntry.leaseId) {
    return;
  }
  saveLRateLeaseEntry_(docProps, Object.assign({}, leaseEntry, {
    state: String(state || '').trim(),
    resolvedRowNum: resolvedRowNum || '',
    error: String(errorText || '').trim()
  }));
}

function resetAllLRateLeases() {
  return withLRateLeaseLock_(function(docProps) {
    const leases = loadLRateLeaseEntries_(docProps);
    let removed = 0;

    for (let i = 0; i < leases.length; i++) {
      const leaseId = String(leases[i] && leases[i].leaseId || '').trim();
      if (!leaseId) {
        continue;
      }
      deleteLRateLeaseEntry_(docProps, leaseId);
      removed++;
    }

    Logger.log('[LRate] resetAllLRateLeases removed=' + removed);
    return {
      removed: removed
    };
  });
}

function listActiveLRateLeases() {
  return withLRateLeaseLock_(function(docProps) {
    cleanupExpiredLRateLeases_(docProps, LRATE_LOCK_TTL_MINUTES_);
    const leases = loadLRateLeaseEntries_(docProps);
    const active = [];

    for (let i = 0; i < leases.length; i++) {
      const lease = leases[i];
      if (String(lease.state || '').trim() !== 'leased') {
        continue;
      }
      active.push({
        leaseId: lease.leaseId,
        runId: lease.runId,
        sheetName: lease.sheetName,
        issuedRowNum: lease.issuedRowNum,
        stableJobKey: lease.stableJobKey,
        issuedAt: lease.issuedAt
      });
    }

    Logger.log('[LRate] active leases=' + JSON.stringify(active));
    return {
      count: active.length,
      leases: active
    };
  });
}

function handleUpdateSetting(payload) {
  const key = String((payload && payload.key) || '').trim();
  const value = String((payload && payload.value) || '').trim();

  if (!key) {
    throw new Error('key is required');
  }
  if (key !== 'LRateUrl' &&
      key !== 'TelegramBotToken' &&
      key !== 'TelegramChatId') {
    throw new Error('Unsupported key for updateSetting: ' + key);
  }
  if (!value) {
    throw new Error('value is required');
  }
  if (value.length > 2000) {
    throw new Error('value is too long');
  }

  if (typeof setSettingValue_ !== 'function') {
    throw new Error('setSettingValue_ is not available');
  }
  setSettingValue_(key, value);

  return {updated: true, key: key};
}

function handleSyncCloudJobStates(payload) {
  const rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
  if (rows.length === 0) {
    return {updated: 0};
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targetSheetNames = ['NewJobs', 'Jobs2Apply'];
  let updated = 0;

  for (let s = 0; s < targetSheetNames.length; s++) {
    const sheet = ss.getSheetByName(targetSheetNames[s]);
    if (!sheet || sheet.getLastRow() < 2) {
      continue;
    }
    const header = readHeader(sheet);
    if (!header || header.length === 0) {
      continue;
    }
    updated += syncCloudJobStatesToSheet_(sheet, header, rows);
  }

  if (updated > 0 && typeof recalcDataFunnelDerivedCounters === 'function') {
    try {
      recalcDataFunnelDerivedCounters();
    } catch (error) {
      Logger.log('[WebApp] DataFunnel recalc failed after syncCloudJobStates: ' + error.toString());
    }
  }

  return {updated: updated};
}

function syncCloudJobStatesToSheet_(sheet, header, updates) {
  const jobIdCol = header.indexOf('JobId');
  const jobUrlCol = header.indexOf('JobUrl');
  const jobApplyUrlCol = header.indexOf('JobApplyUrl');
  const titleCol = header.indexOf('JobTitle');
  const companyCol = header.indexOf('JobCompany');
  const locationCol = header.indexOf('JobLocation');
  const statusCol = header.indexOf('Status');
  const rateNumCol = header.indexOf('JobRateNum');
  const rateDescCol = header.indexOf('JobRateDesc');
  const rateShortDescCol = header.indexOf('JobRateShortDesc');
  const ratedModelCol = header.indexOf('RatedModelName');
  const rateDttmCol = header.indexOf('JobRateDttm');

  if (statusCol === -1) {
    return 0;
  }

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(1, 1, lastRow, header.length).getValues();
  let updated = 0;
  for (let i = 0; i < updates.length; i++) {
    const matchRowNum = findSheetRowForCloudUpdate_(
      values,
      {
        jobIdCol: jobIdCol,
        jobUrlCol: jobUrlCol,
        jobApplyUrlCol: jobApplyUrlCol,
        titleCol: titleCol,
        companyCol: companyCol,
        locationCol: locationCol,
        statusCol: statusCol
      },
      updates[i]
    );
    if (matchRowNum <= 0) {
      continue;
    }

    const rowValues = values[matchRowNum - 1];
    if (rateNumCol !== -1) {
      rowValues[rateNumCol] = updates[i].JobRateNum;
    }
    if (rateDescCol !== -1) {
      rowValues[rateDescCol] = updates[i].JobRateDesc || '';
    }
    if (rateShortDescCol !== -1) {
      rowValues[rateShortDescCol] = updates[i].JobRateShortDesc || updates[i].JobRateDesc || '';
    }
    if (ratedModelCol !== -1) {
      rowValues[ratedModelCol] = updates[i].RatedModelName || '';
    }
    rowValues[statusCol] = updates[i].Status || rowValues[statusCol];
    if (rateDttmCol !== -1) {
      rowValues[rateDttmCol] = new Date();
    }
    sheet.getRange(matchRowNum, 1, 1, header.length).setValues([rowValues]);
    updated++;
  }

  return updated;
}

function findSheetRowForCloudUpdate_(values, indexMap, update) {
  const wantedKey = buildJobKey(update.JobId, update.JobUrl || update.JobApplyUrl);
  const wantedUrlKey = buildJobUrlKey(update.JobApplyUrl || update.JobUrl);
  const wantedIdKey = buildJobIdKey(update.JobId, update.JobUrl || update.JobApplyUrl);
  const wantedSignature = [
    normalizeLRateKeyPart_(update.JobCompany),
    normalizeLRateKeyPart_(update.JobTitle),
    normalizeLRateKeyPart_(update.JobLocation)
  ].filter(Boolean).join('|');

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const rowNum = i + 1;
    if (rowNum === 1 && String(row[0] || '').trim() === 'JobTitle') {
      continue;
    }
    if (String(row[0] || '').trim().indexOf('Rate ') === 0) {
      continue;
    }
    if (indexMap.statusCol !== -1) {
      const statusText = String(row[indexMap.statusCol] || '').trim();
      if (statusText === 'Status') {
        continue;
      }
    }

    const rowJobId = indexMap.jobIdCol !== -1 ? row[indexMap.jobIdCol] : '';
    const rowJobUrl = indexMap.jobUrlCol !== -1 ? row[indexMap.jobUrlCol] : '';
    const rowApplyUrl = indexMap.jobApplyUrlCol !== -1 ? row[indexMap.jobApplyUrlCol] : '';
    const rowKey = buildJobKey(rowJobId, rowJobUrl || rowApplyUrl);
    const rowUrlKey = buildJobUrlKey(rowApplyUrl || rowJobUrl);
    const rowIdKey = buildJobIdKey(rowJobId, rowJobUrl || rowApplyUrl);
    const rowSignature = [
      indexMap.companyCol !== -1 ? normalizeLRateKeyPart_(row[indexMap.companyCol]) : '',
      indexMap.titleCol !== -1 ? normalizeLRateKeyPart_(row[indexMap.titleCol]) : '',
      indexMap.locationCol !== -1 ? normalizeLRateKeyPart_(row[indexMap.locationCol]) : ''
    ].filter(Boolean).join('|');

    if (wantedKey && rowKey && wantedKey === rowKey) return rowNum;
    if (wantedUrlKey && rowUrlKey && wantedUrlKey === rowUrlKey) return rowNum;
    if (wantedIdKey && rowIdKey && wantedIdKey === rowIdKey) return rowNum;
    if (wantedSignature && rowSignature && wantedSignature === rowSignature) return rowNum;
  }

  return 0;
}

function buildJobUrlKey(jobUrl) {
  const info = normalizeJobUrl(jobUrl);
  if (info && info.url) {
    return 'url|' + info.url;
  }
  return '';
}

function buildJobIdKey(jobId, jobUrl) {
  const id = String(jobId || '').trim();
  if (!id) return '';
  const info = normalizeJobUrl(jobUrl);
  if (info && info.host) {
    return 'id|' + info.host + '|' + id;
  }
  return 'id|' + id;
}

function buildExistingJobKeys(sheetNames) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const keys = new Set();
  const targets = Array.isArray(sheetNames) ? sheetNames : [];

  for (let i = 0; i < targets.length; i++) {
    const sheetName = targets[i];
    if (!sheetName) continue;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) continue;

    const header = readHeader(sheet);
    const jobIdCol = header.indexOf('JobId');
    const jobUrlCol = header.indexOf('JobUrl');
    if (jobUrlCol === -1 && jobIdCol === -1) continue;

    const range = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    for (let r = 0; r < range.length; r++) {
      const jobId = jobIdCol !== -1 ? range[r][jobIdCol] : '';
      const jobUrl = jobUrlCol !== -1 ? range[r][jobUrlCol] : '';
      const key = buildJobKey(jobId, jobUrl);
      const urlKey = buildJobUrlKey(jobUrl);
      const idKey = buildJobIdKey(jobId, jobUrl);
      if (key) keys.add(key);
      if (urlKey) keys.add(urlKey);
      if (idKey) keys.add(idKey);
    }
  }

  return keys;
}

function alignSheetHeaderToExpected_(sheet, expectedHeader) {
  if (!sheet) {
    throw new Error('Sheet is required for header alignment');
  }

  const actualHeader = readHeader(sheet);
  if (!actualHeader || actualHeader.length === 0) {
    sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
    return;
  }

  const lastRow = sheet.getLastRow();
  const actualColCount = actualHeader.length;
  const existingRows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, actualColCount).getValues()
    : [];

  const sourceIndexByName = {};
  for (let i = 0; i < actualHeader.length; i++) {
    sourceIndexByName[actualHeader[i]] = i;
  }

  const remappedRows = [];
  for (let r = 0; r < existingRows.length; r++) {
    const sourceRow = existingRows[r];
    const targetRow = [];
    for (let c = 0; c < expectedHeader.length; c++) {
      const colName = expectedHeader[c];
      const sourceIndex = sourceIndexByName[colName];
      targetRow.push(sourceIndex === undefined ? '' : sourceRow[sourceIndex]);
    }
    remappedRows.push(targetRow);
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
  if (remappedRows.length > 0) {
    sheet.getRange(2, 1, remappedRows.length, expectedHeader.length).setValues(remappedRows);
  }
}
