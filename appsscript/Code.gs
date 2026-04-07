/**
 * Main entry point - Menu setup and orchestration
 */

/**
 * Creates the custom menu when the spreadsheet is opened
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('get-your-offer')
    .addItem('✅ Validate Stage', 'validateStage')
    .addItem('⬆️ Increment Load', 'incrementLoad')
    .addSeparator()
    .addItem('✳️ Simple Rate: selected range', 'simpleRateSelectedRange')
    .addItem('✳️ Simple Rate: ALL w status Loaded', 'simpleRateAllLoadedUnratedNewJobs')
    .addSeparator()
    .addItem('🧩 Medium ARate: all 2MARate rows', 'mediumCRateAll2MCRate')
    .addItem('🤖 Medium BRate: selected range', 'mediumRateSelectedRange')
    .addItem('🤖 Medium BRate: all 2MBrate rows', 'mediumRateAll2Mrate')
    .addItem('🧪 Medium CRate: selected range', 'mediumBRateSelectedRange')
    .addItem('🧪 Medium CRate: all 2MCRate rows', 'mediumBRateAll2MBrate')
    .addSeparator()
    .addItem('🏷️ Mark Selected 2Delete', 'markSelected2Delete')
    .addItem('🗑️ Move 2Delete to DeletedJobs', 'move2DeleteToDeletedJobs')
    .addItem('📦 Archive old NewJobs to JobsHist', 'moveOldNewJobsToJobsHist')
    .addSeparator()
    .addItem('🚀 JUST DO IT!', 'justDoIt')
    .addSeparator()
    .addItem('🧪 List Available LLM Models', 'listAvailableModels')
    .addSeparator()
    .addItem('🏗️ Build Mart', 'buildMart')
    .addSeparator()
    .addItem('📝 Register Application', 'registerApplication')
    .addToUi();
}

/**
 * Validate Stage - implemented in StageValidator.gs
 * This function is called from the menu
 */
// Function is implemented in StageValidator.gs

/**
 * Increment Load - implemented in IncrementLoader.gs
 * This function is called from the menu
 */
// Function is implemented in IncrementLoader.gs

/**
 * JUST DO IT! - Run full pipeline with resumable status-gate checks.
 */
function justDoIt() {
  try {
    const executedSteps = [];
    const skippedSteps = [];
    const state = createJustDoItRunState_(7);

    const runActionStep = function(stepName, actionFn, options) {
      try {
        if (options && options.ensureNewJobsActive) {
          setActiveNewJobsSheet_();
        }
        actionFn();
        SpreadsheetApp.flush();
        refreshJustDoItRunState_(state, {
          refreshStage: true,
          refreshNewJobs: true,
          includeLoadedUnrated: true,
          includeOldRows: true
        });
        executedSteps.push(stepName);
      } catch (stepError) {
        throw new Error('JUST DO IT failed at ' + stepName + ': ' + stepError.toString());
      }
    };

    // Adaptive fast resume: always start from the earliest pending work by status.
    const maxIterations = 30;
    for (let i = 0; i < maxIterations; i++) {
      refreshJustDoItRunState_(state, {
        refreshStage: true,
        refreshNewJobs: true,
        includeLoadedUnrated: true,
        includeOldRows: true
      });

      const stageHasRows = (state.stageSummary && state.stageSummary.rowCount > 0);
      if (stageHasRows && hasStatusInSummary_(state.stageSummary, 'Staged')) {
        runActionStep('Validate Stage', validateStage);
        continue;
      }
      if (stageHasRows && hasStatusInSummary_(state.stageSummary, 'Approved')) {
        runActionStep('Increment Load', incrementLoad);
        continue;
      }

      if (hasStatusInSummary_(state.newJobsSummary, '2Delete')) {
        runActionStep('Move 2Delete to DeletedJobs', move2DeleteToDeletedJobs);
        continue;
      }
      if (state.newJobsSummary.hasLoadedUnrated) {
        runActionStep('Simple Rate', simpleRateAllLoadedUnratedNewJobs, { ensureNewJobsActive: true });
        continue;
      }
      if (hasStatusInSummary_(state.newJobsSummary, '2MARate') ||
          hasStatusInSummary_(state.newJobsSummary, '2Mrate')) {
        runActionStep('Medium ARate', mediumCRateAll2MCRate, { ensureNewJobsActive: true });
        continue;
      }
      if (hasStatusInSummary_(state.newJobsSummary, '2MBrate')) {
        runActionStep('Medium BRate', mediumRateAll2Mrate, { ensureNewJobsActive: true });
        continue;
      }
      if (hasStatusInSummary_(state.newJobsSummary, '2MCRate')) {
        runActionStep('Medium CRate', mediumBRateAll2MBrate, { ensureNewJobsActive: true });
        continue;
      }
      if (hasStatusInSummary_(state.newJobsSummary, '2LRate')) {
        const lRatePending = getStatusCountInSummary_(state.newJobsSummary, '2LRate');
        if (isLRateAddonTriggerAvailable_()) {
          runActionStep('Trigger LRate addon', triggerLRateAddonFromJustDoIt_);
        } else {
          skippedSteps.push(
            'Trigger LRate addon (manual required): 2LRate rows=' + lRatePending +
            '. Open Firefox addon popup and click "LRate (2LRate -> NewJobs)".'
          );
        }
        // If addon trigger exists, jobs remain in 2LRate until addon picks them up; stop here.
        break;
      }
      if (state.newJobsSummary.hasOldRows) {
        runActionStep('Archive old NewJobs', moveOldNewJobsToJobsHist);
        continue;
      }
      break;
    }

    if (executedSteps.length === 0) {
      skippedSteps.push('No pending work by statuses');
    }

    const message =
      'JUST DO IT! completed.\n' +
      'Executed: ' + executedSteps.length + '\n' +
      'Skipped: ' + skippedSteps.length +
      (executedSteps.length > 0 ? '\n\nExecuted steps:\n- ' + executedSteps.join('\n- ') : '') +
      (skippedSteps.length > 0 ? '\n\nSkipped steps:\n- ' + skippedSteps.join('\n- ') : '');
    uiAlertNonBlocking_('Success', message);
  } catch (error) {
    const text = String(error || '');
    if (text.indexOf('JUST DO IT failed at ') === 0) {
      uiAlertNonBlocking_('Error', text);
    } else {
      uiAlertNonBlocking_('Error', 'JUST DO IT failed: ' + text);
    }
  }
}

function promoteRemainingMARateToMBRate_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('NewJobs');
  if (!sheet || sheet.getLastRow() < 2) {
    return;
  }

  const header = readHeader(sheet);
  const statusColIndex = header.indexOf('Status');
  if (statusColIndex === -1) {
    return;
  }
  const jobRateDescColIndex = header.indexOf('JobRateDesc');

  const rowCount = sheet.getLastRow() - 1;
  const values = sheet.getRange(2, 1, rowCount, header.length).getValues();
  let updated = 0;
  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][statusColIndex] || '').trim();
    if (status !== '2MARate') {
      continue;
    }
    const rowNum = i + 2;
    sheet.getRange(rowNum, statusColIndex + 1).setValue('2MBrate');
    if (jobRateDescColIndex !== -1) {
      const currentDesc = String(values[i][jobRateDescColIndex] || '').trim();
      if (currentDesc.indexOf('MA->MB fallback') === -1) {
        const nextDesc = currentDesc ? (currentDesc + '; MA->MB fallback') : 'MA->MB fallback';
        sheet.getRange(rowNum, jobRateDescColIndex + 1).setValue(nextDesc);
      }
    }
    updated++;
  }
  if (updated > 0) {
    Logger.log('[JUST DO IT] Promoted remaining 2MARate rows to 2MBrate: ' + updated);
  }
}

function triggerLRateAddonFromJustDoIt_() {
  const triggerHookName = resolveLRateAddonTriggerHookName_();
  if (!triggerHookName) {
    throw new Error(
      'LRate addon trigger hook is not available. ' +
      'Run LRate manually from Firefox addon popup: "LRate (2LRate -> NewJobs)".'
    );
  }

  if (triggerHookName === 'triggerLRateAddon') {
    triggerLRateAddon();
    return;
  }
  if (triggerHookName === 'runLRateAddon') {
    runLRateAddon();
    return;
  }
  if (triggerHookName === 'startLRateAddon') {
    startLRateAddon();
    return;
  }
}

function resolveLRateAddonTriggerHookName_() {
  if (typeof triggerLRateAddon === 'function') {
    return 'triggerLRateAddon';
  }
  if (typeof runLRateAddon === 'function') {
    return 'runLRateAddon';
  }
  if (typeof startLRateAddon === 'function') {
    return 'startLRateAddon';
  }
  return '';
}

function isLRateAddonTriggerAvailable_() {
  return resolveLRateAddonTriggerHookName_() !== '';
}

function setActiveNewJobsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const newJobsSheet = ss.getSheetByName('NewJobs');
  if (!newJobsSheet) {
    throw new Error('NewJobs sheet not found');
  }
  ss.setActiveSheet(newJobsSheet);
  return newJobsSheet;
}

function createEmptyStatusSummary_() {
  return {
    rowCount: 0,
    statusCounts: {}
  };
}

function incrementStatusCount_(statusCounts, statusValue) {
  const key = String(statusValue || '').trim();
  if (!key) {
    return;
  }
  statusCounts[key] = (statusCounts[key] || 0) + 1;
}

function hasStatusInSummary_(summary, statusValue) {
  if (!summary || !summary.statusCounts) {
    return false;
  }
  return (summary.statusCounts[String(statusValue || '').trim()] || 0) > 0;
}

function getStatusCountInSummary_(summary, statusValue) {
  if (!summary || !summary.statusCounts) {
    return 0;
  }
  return summary.statusCounts[String(statusValue || '').trim()] || 0;
}

function parseDateCellToMs_(rawDate) {
  if (!rawDate) {
    return NaN;
  }
  if (rawDate instanceof Date) {
    const time = rawDate.getTime();
    return isNaN(time) ? NaN : time;
  }
  if (typeof rawDate === 'number') {
    const fromNumber = new Date(rawDate).getTime();
    return isNaN(fromNumber) ? NaN : fromNumber;
  }
  const parsed = new Date(String(rawDate)).getTime();
  return isNaN(parsed) ? NaN : parsed;
}

function collectStatusSummary_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const summary = createEmptyStatusSummary_();
  if (!sheet || sheet.getLastRow() < 2) {
    return summary;
  }

  const header = readHeader(sheet);
  const statusColIndex = header.indexOf('Status');
  if (statusColIndex === -1) {
    return summary;
  }

  const rowCount = sheet.getLastRow() - 1;
  const statusValues = sheet.getRange(2, statusColIndex + 1, rowCount, 1).getValues();
  summary.rowCount = rowCount;
  for (let i = 0; i < statusValues.length; i++) {
    incrementStatusCount_(summary.statusCounts, statusValues[i][0]);
  }
  return summary;
}

function collectNewJobsSummary_(archiveDays, options) {
  const opts = options || {};
  const includeLoadedUnrated = !!opts.includeLoadedUnrated;
  const includeOldRows = !!opts.includeOldRows;
  const summary = createEmptyStatusSummary_();
  summary.hasLoadedUnrated = false;
  summary.hasOldRows = false;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('NewJobs');
  if (!sheet || sheet.getLastRow() < 2) {
    return summary;
  }

  const header = readHeader(sheet);
  const statusColIndex = header.indexOf('Status');
  const jobRateNumColIndex = header.indexOf('JobRateNum');
  const ratedModelColIndex = header.indexOf('RatedModelName');
  const loadDttmColIndex = header.indexOf('LoadDttm');
  if (statusColIndex === -1) {
    return summary;
  }

  const rowCount = sheet.getLastRow() - 1;
  const statusValues = sheet.getRange(2, statusColIndex + 1, rowCount, 1).getValues();
  summary.rowCount = rowCount;

  const loadedIndexes = [];
  for (let i = 0; i < statusValues.length; i++) {
    const status = String(statusValues[i][0] || '').trim();
    incrementStatusCount_(summary.statusCounts, status);
    if (status === 'Loaded') {
      loadedIndexes.push(i);
    }
  }

  if (includeLoadedUnrated && loadedIndexes.length > 0 && (jobRateNumColIndex !== -1 || ratedModelColIndex !== -1)) {
    const rateValues = jobRateNumColIndex !== -1
      ? sheet.getRange(2, jobRateNumColIndex + 1, rowCount, 1).getValues()
      : null;
    const modelValues = ratedModelColIndex !== -1
      ? sheet.getRange(2, ratedModelColIndex + 1, rowCount, 1).getValues()
      : null;

    for (let i = 0; i < loadedIndexes.length; i++) {
      const rowIndex = loadedIndexes[i];
      let hasRate = false;

      if (rateValues) {
        const rateVal = rateValues[rowIndex][0];
        hasRate = !(rateVal === '' || rateVal === null || rateVal === undefined || String(rateVal).trim() === '');
      }
      if (!hasRate && modelValues) {
        const modelVal = modelValues[rowIndex][0];
        hasRate = !(modelVal === '' || modelVal === null || modelVal === undefined || String(modelVal).trim() === '');
      }

      if (!hasRate) {
        summary.hasLoadedUnrated = true;
        break;
      }
    }
  }

  if (includeOldRows && loadDttmColIndex !== -1) {
    const cutoffMs = new Date().getTime() - ((archiveDays || 7) * 24 * 60 * 60 * 1000);
    const loadValues = sheet.getRange(2, loadDttmColIndex + 1, rowCount, 1).getValues();
    for (let i = 0; i < loadValues.length; i++) {
      const dateMs = parseDateCellToMs_(loadValues[i][0]);
      if (!isNaN(dateMs) && dateMs <= cutoffMs) {
        summary.hasOldRows = true;
        break;
      }
    }
  }

  return summary;
}

function createJustDoItRunState_(archiveDays) {
  const state = {
    archiveDays: archiveDays || 7,
    stageSummary: createEmptyStatusSummary_(),
    newJobsSummary: createEmptyStatusSummary_()
  };
  state.newJobsSummary.hasLoadedUnrated = false;
  state.newJobsSummary.hasOldRows = false;
  refreshJustDoItRunState_(state, {
    refreshStage: true,
    refreshNewJobs: true,
    includeLoadedUnrated: true,
    includeOldRows: true
  });
  return state;
}

function refreshJustDoItRunState_(state, options) {
  const opts = options || {};
  if (opts.refreshStage) {
    state.stageSummary = collectStatusSummary_('Stage');
  }
  if (opts.refreshNewJobs) {
    state.newJobsSummary = collectNewJobsSummary_(state.archiveDays, {
      includeLoadedUnrated: !!opts.includeLoadedUnrated,
      includeOldRows: !!opts.includeOldRows
    });
  }
}

function hasStatusRows_(sheetName, statusValue) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }

  const header = readHeader(sheet);
  const statusColIndex = header.indexOf('Status');
  if (statusColIndex === -1) {
    return false;
  }

  const statusValues = sheet.getRange(2, statusColIndex + 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < statusValues.length; i++) {
    const status = String(statusValues[i][0] || '').trim();
    if (status === statusValue) {
      return true;
    }
  }
  return false;
}

function hasStagedRowsInStage_() {
  return hasStatusRows_('Stage', 'Staged');
}

function hasApprovedRowsInStage_() {
  return hasStatusRows_('Stage', 'Approved');
}

function hasLoadedUnratedRowsInNewJobs_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('NewJobs');
  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }

  const header = readHeader(sheet);
  const statusColIndex = header.indexOf('Status');
  const jobRateNumColIndex = header.indexOf('JobRateNum');
  const ratedModelColIndex = header.indexOf('RatedModelName');
  if (statusColIndex === -1) {
    return false;
  }
  if (jobRateNumColIndex === -1 && ratedModelColIndex === -1) {
    return false;
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const status = String(values[i][statusColIndex] || '').trim();
    if (status !== 'Loaded') {
      continue;
    }

    let hasRate = false;
    if (jobRateNumColIndex !== -1) {
      const rateVal = values[i][jobRateNumColIndex];
      if (rateVal !== '' && rateVal !== null && rateVal !== undefined) {
        hasRate = String(rateVal).trim() !== '';
      }
    }
    if (!hasRate && ratedModelColIndex !== -1) {
      const modelVal = values[i][ratedModelColIndex];
      if (modelVal !== '' && modelVal !== null && modelVal !== undefined) {
        hasRate = String(modelVal).trim() !== '';
      }
    }

    if (!hasRate) {
      return true;
    }
  }

  return false;
}

function hasOldRowsInNewJobs_(days) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('NewJobs');
  if (!sheet || sheet.getLastRow() < 2) {
    return false;
  }

  const header = readHeader(sheet);
  const loadDttmColIndex = header.indexOf('LoadDttm');
  if (loadDttmColIndex === -1) {
    return false;
  }

  const cutoffMs = new Date().getTime() - (days * 24 * 60 * 60 * 1000);
  const values = sheet.getRange(2, loadDttmColIndex + 1, sheet.getLastRow() - 1, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    const dateMs = parseDateCellToMs_(values[i][0]);
    if (!isNaN(dateMs) && dateMs <= cutoffMs) {
      return true;
    }
  }

  return false;
}

/**
 * Marks selected rows with Status=2Delete on the active jobs sheet.
 */
function markSelected2Delete() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();

    if (!activeSheet) {
      throw new Error('No active sheet');
    }

    const activeSheetName = String(activeSheet.getName() || '').trim();
    const isJobs2ApplySheet = activeSheetName === 'Jobs2Apply';
    if (!isJobs2ApplySheet) {
      assertActiveHistSheet();
    }

    const header = readHeader(activeSheet);
    const statusColIndex = header.indexOf('Status');
    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }

    const rangeList = ss.getActiveRangeList();
    const activeRange = ss.getActiveRange();
    const ranges = rangeList ? rangeList.getRanges() : (activeRange ? [activeRange] : []);
    if (!ranges || ranges.length === 0) {
      uiAlertNonBlocking_('Error', 'No range selected');
      return;
    }

    const visibleRowsSet = new Set();
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const startRow = range.getRow();
      const endRow = range.getLastRow();
      for (let row = startRow; row <= endRow; row++) {
        if (row < 2) {
          continue;
        }
        if (typeof activeSheet.isRowHiddenByFilter === 'function' && activeSheet.isRowHiddenByFilter(row)) {
          continue;
        }
        if (typeof activeSheet.isRowHiddenByUser === 'function' && activeSheet.isRowHiddenByUser(row)) {
          continue;
        }
        visibleRowsSet.add(row);
      }
    }

    const visibleRows = Array.from(visibleRowsSet).sort(function(a, b) {
      return a - b;
    });
    let markedCount = 0;
    let syncResult = null;

    if (isJobs2ApplySheet) {
      const jobIdColIndex = header.indexOf('JobId');
      const jobUrlColIndex = header.indexOf('JobUrl');
      const jobApplyUrlColIndex = header.indexOf('JobApplyUrl');
      const jobCompanyColIndex = header.indexOf('JobCompany');
      const jobTitleColIndex = header.indexOf('JobTitle');
      const jobLocationColIndex = header.indexOf('JobLocation');
      if (jobIdColIndex === -1) {
        throw new Error('Jobs2Apply must contain JobId');
      }

      const selectedItems = [];
      for (let i = 0; i < visibleRows.length; i++) {
        const rowNum = visibleRows[i];
        const rowValues = activeSheet.getRange(rowNum, 1, 1, header.length).getValues()[0];
        const statusValue = String(rowValues[statusColIndex] || '').trim();
        if (statusValue !== '2Apply' && statusValue !== 'Applied') {
          continue;
        }

        const primaryUrl = jobUrlColIndex !== -1 ? String(rowValues[jobUrlColIndex] || '').trim() : '';
        const applyUrl = jobApplyUrlColIndex !== -1 ? String(rowValues[jobApplyUrlColIndex] || '').trim() : '';
        selectedItems.push({
          rowNum: rowNum,
          effectiveUrl: primaryUrl || applyUrl,
          jobId: String(rowValues[jobIdColIndex] || '').trim(),
          jobCompany: jobCompanyColIndex !== -1 ? String(rowValues[jobCompanyColIndex] || '').trim() : '',
          jobTitle: jobTitleColIndex !== -1 ? String(rowValues[jobTitleColIndex] || '').trim() : '',
          jobLocation: jobLocationColIndex !== -1 ? String(rowValues[jobLocationColIndex] || '').trim() : ''
        });
      }

      if (selectedItems.length === 0) {
        uiAlertNonBlocking_('Info', 'No Jobs2Apply data rows selected');
        return;
      }

      setStatusForRowNums_(
        activeSheet,
        selectedItems.map(function(item) { return item.rowNum; }),
        statusColIndex + 1,
        '2Delete'
      );
      syncResult = setJobs2ApplyItemsStatusInNewJobs_(selectedItems, '2Delete');
      markedCount = selectedItems.length;
    } else if (visibleRows.length > 0) {
      let segmentStart = visibleRows[0];
      let segmentEnd = visibleRows[0];
      for (let i = 1; i < visibleRows.length; i++) {
        const row = visibleRows[i];
        if (row === segmentEnd + 1) {
          segmentEnd = row;
          continue;
        }
        const segmentCount = segmentEnd - segmentStart + 1;
        activeSheet.getRange(segmentStart, statusColIndex + 1, segmentCount, 1).setValue('2Delete');
        markedCount += segmentCount;
        segmentStart = row;
        segmentEnd = row;
      }
      const lastSegmentCount = segmentEnd - segmentStart + 1;
      activeSheet.getRange(segmentStart, statusColIndex + 1, lastSegmentCount, 1).setValue('2Delete');
      markedCount += lastSegmentCount;
    }

    if (markedCount === 0) {
      uiAlertNonBlocking_('Info', 'No data rows selected (row 1 is header)');
      return;
    }

    if ((activeSheetName === 'NewJobs' || isJobs2ApplySheet) && typeof recalcDataFunnelDerivedCounters === 'function') {
      try {
        recalcDataFunnelDerivedCounters();
      } catch (funnelError) {
        Logger.log('[Mark2Delete] DataFunnel recalc failed: ' + funnelError.toString());
      }
    }

    SpreadsheetApp.flush();
    let message = 'Marked as 2Delete: ' + markedCount + ' rows';
    if (syncResult) {
      message += '\nNewJobs updated: ' + syncResult.updatedCount;
      if (syncResult.missedCount > 0) {
        message += '\nNot matched: ' + syncResult.missedCount;
      }
    }
    uiAlertNonBlocking_('Success', message);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}
