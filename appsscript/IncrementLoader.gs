/**
 * Stage 3: Increment Load - Loads Approved records from Stage to NewJobs
 */

/**
 * Incrementally loads records from Stage to NewJobs sheet
 */
function incrementLoad() {
  const startDttm = new Date();
  let failAtRowNum = null;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const targetSheetName = 'NewJobs';
    const expectedHeader = getExpectedHeader();

    const targetSheet = incrementLoadEnsureTargetSheet_(ss, targetSheetName, expectedHeader);
    const stageSheet = incrementLoadGetRequiredSheet_(ss, 'Stage');

    incrementLoadAssertDataRows_(stageSheet, 'Stage');
    incrementLoadAssertHeader_(stageSheet, expectedHeader, 'Stage');
    incrementLoadAssertHeader_(targetSheet, expectedHeader, 'NewJobs');

    const stageHeader = readHeader(stageSheet);
    const statusColIndex = stageHeader.indexOf('Status');
    const scrapePageNameColIndex = stageHeader.indexOf('ScrapePageName');
    const stageJobIdColIndex = stageHeader.indexOf('JobId');
    const jobUrlColIndex = stageHeader.indexOf('JobUrl');

    if (statusColIndex === -1) {
      throw new Error('Status column missing in Stage');
    }
    if (jobUrlColIndex === -1) {
      throw new Error('JobUrl column missing in Stage');
    }

    const stageRowsTotal = stageSheet.getLastRow() - 1;
    const approvedRows = incrementLoadReadApprovedRows_(stageSheet, stageHeader, statusColIndex);
    if (approvedRows.length === 0) {
      throw new Error('No rows with Status="Approved" found in Stage');
    }

    const processedScrapePageNames = incrementLoadCollectScrapeNames_(approvedRows, scrapePageNameColIndex);

    const histHeader = readHeader(targetSheet);
    const histJobUrlColIndex = histHeader.indexOf('JobUrl');
    const histLoadDttmColIndex = histHeader.indexOf('LoadDttm');
    const histStatusColIndex = histHeader.indexOf('Status');

    if (histJobUrlColIndex === -1) {
      throw new Error('JobUrl column missing in NewJobs sheet');
    }
    if (histLoadDttmColIndex === -1) {
      throw new Error('LoadDttm column missing in NewJobs sheet');
    }
    if (histStatusColIndex === -1) {
      throw new Error('Status column missing in NewJobs sheet');
    }

    const histKeySet = incrementLoadBuildHistKeySet_(ss, targetSheet);
    const doubleRows = incrementLoadDetectDuplicates_(
      approvedRows,
      stageJobIdColIndex,
      jobUrlColIndex,
      histKeySet
    );

    incrementLoadDeleteRowsDescending_(stageSheet, doubleRows);

    const doubleCount = doubleRows.length;
    const newRows = incrementLoadReadApprovedRows_(stageSheet, stageHeader, statusColIndex);
    const newCount = newRows.length;

    const loadResult = incrementLoadMoveRowsToNewJobs_({
      stageSheet: stageSheet,
      targetSheet: targetSheet,
      stageHeader: stageHeader,
      histHeader: histHeader,
      newRows: newRows,
      statusColIndex: statusColIndex,
      histStatusColIndex: histStatusColIndex,
      histLoadDttmColIndex: histLoadDttmColIndex
    });

    failAtRowNum = loadResult.failAtRowNum;
    const loadedCount = loadResult.loadedCount;

    try {
      updateDataFunnelStatusBatch(Array.from(processedScrapePageNames), 'Loaded');
    } catch (error) {
      Logger.log('[IncrementLoad] Failed to update DataFunnel: ' + error.toString());
    }

    appendLoadsLog({
      HistSheetName: targetSheetName,
      StartDttm: startDttm,
      EndDttm: new Date(),
      StageRowsTotal: stageRowsTotal,
      NewCount: newCount,
      DoubleCount: doubleCount,
      LoadedCount: loadedCount,
      SuccessFlag: true,
      FailAtRowNum: failAtRowNum
    });

    const summaryMsg = 'Loaded: ' + loadedCount + ' rows\n' +
      'Duplicates removed: ' + doubleCount + ' rows\n' +
      'Log written to LoadsLog';
    uiAlertNonBlocking_('Success', summaryMsg);
  } catch (error) {
    if (error && error.rowIndex) {
      failAtRowNum = error.rowIndex;
    }

    incrementLoadWriteFailureLog_(startDttm, failAtRowNum);

    uiAlertNonBlocking_(
      'Error',
      'An error occurred: ' + error.toString());
  }
}

function incrementLoadEnsureTargetSheet_(ss, targetSheetName, expectedHeader) {
  let targetSheet = ss.getSheetByName(targetSheetName);
  if (!targetSheet) {
    targetSheet = ss.insertSheet(targetSheetName);
    targetSheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
  }
  return targetSheet;
}

function incrementLoadGetRequiredSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(sheetName + ' sheet not found');
  }
  return sheet;
}

function incrementLoadAssertDataRows_(sheet, sheetName) {
  if (sheet.getLastRow() < 2) {
    throw new Error(sheetName + ' sheet is empty or has no data rows');
  }
}

function incrementLoadAssertHeader_(sheet, expectedHeader, sheetName) {
  const validationResult = validateHeader(sheet, expectedHeader);
  if (!validationResult.valid) {
    throw new Error(sheetName + ' header validation failed: ' + validationResult.errors.join('; '));
  }
}

function incrementLoadReadApprovedRows_(stageSheet, stageHeader, statusColIndex) {
  const lastRow = stageSheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const range = stageSheet.getRange(2, 1, lastRow - 1, stageHeader.length);
  const values = range.getValues();
  const approvedRows = [];

  for (let i = 0; i < values.length; i++) {
    const statusValue = String(values[i][statusColIndex] || '').trim();
    if (statusValue === 'Approved') {
      approvedRows.push({
        rowIndex: i + 2,
        values: values[i]
      });
    }
  }

  return approvedRows;
}

function incrementLoadCollectScrapeNames_(approvedRows, scrapePageNameColIndex) {
  const names = new Set();
  if (scrapePageNameColIndex === -1) {
    return names;
  }

  for (let i = 0; i < approvedRows.length; i++) {
    const name = String(approvedRows[i].values[scrapePageNameColIndex] || '').trim();
    if (name) {
      names.add(name);
    }
  }

  return names;
}

function incrementLoadBuildHistKeySet_(ss, targetSheet) {
  const keySet = new Set();

  incrementLoadAddKeysFromSheet_(keySet, targetSheet);
  incrementLoadAddKeysFromSheet_(keySet, ss.getSheetByName('JobsHist'));
  incrementLoadAddKeysFromSheet_(keySet, ss.getSheetByName('DeletedJobs'));

  return keySet;
}

function incrementLoadAddKeysFromSheet_(keySet, sheet) {
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const header = readHeader(sheet);
  const jobIdColIndex = header.indexOf('JobId');
  const jobUrlColIndex = header.indexOf('JobUrl');
  if (jobUrlColIndex === -1) return;

  const values = sheet.getRange(2, 1, lastRow - 1, header.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const jobId = jobIdColIndex !== -1 ? String(values[i][jobIdColIndex] || '').trim() : '';
    const jobUrl = String(values[i][jobUrlColIndex] || '').trim();
    const key = buildJobKey(jobId, jobUrl);
    if (key) {
      keySet.add(key);
    }
  }
}

function incrementLoadDetectDuplicates_(approvedRows, stageJobIdColIndex, stageJobUrlColIndex, histKeySet) {
  const stageKeySet = new Set();
  const doubleRows = [];

  for (let i = 0; i < approvedRows.length; i++) {
    const row = approvedRows[i];
    const jobId = stageJobIdColIndex !== -1 ? String(row.values[stageJobIdColIndex] || '').trim() : '';
    const jobUrl = String(row.values[stageJobUrlColIndex] || '').trim();
    const key = buildJobKey(jobId, jobUrl);

    if (!key) {
      continue;
    }

    if (histKeySet.has(key) || stageKeySet.has(key)) {
      doubleRows.push(row);
    } else {
      stageKeySet.add(key);
    }
  }

  return doubleRows;
}

function incrementLoadDeleteRowsDescending_(sheet, rows) {
  rows.sort(function(a, b) {
    return b.rowIndex - a.rowIndex;
  });

  for (let i = 0; i < rows.length; i++) {
    sheet.deleteRow(rows[i].rowIndex);
  }
}

function incrementLoadMoveRowsToNewJobs_(params) {
  const stageSheet = params.stageSheet;
  const targetSheet = params.targetSheet;
  const stageHeader = params.stageHeader;
  const histHeader = params.histHeader;
  const statusColIndex = params.statusColIndex;
  const histStatusColIndex = params.histStatusColIndex;
  const histLoadDttmColIndex = params.histLoadDttmColIndex;
  const newRows = (params.newRows || []).slice();

  newRows.sort(function(a, b) {
    return b.rowIndex - a.rowIndex;
  });

  let loadedCount = 0;
  let failAtRowNum = null;
  const now = new Date();
  const currentStageLastRow = stageSheet.getLastRow();

  for (let i = 0; i < newRows.length; i++) {
    const row = newRows[i];

    try {
      if (row.rowIndex > currentStageLastRow) {
        continue;
      }

      const currentValues = stageSheet.getRange(row.rowIndex, 1, 1, stageHeader.length).getValues()[0];
      const currentStatus = String(currentValues[statusColIndex] || '').trim();
      if (currentStatus !== 'Approved') {
        continue;
      }

      targetSheet.insertRowBefore(2);

      const rowValuesForHist = [];
      for (let col = 0; col < histHeader.length; col++) {
        const histColName = histHeader[col];
        const stageColIndex = stageHeader.indexOf(histColName);
        rowValuesForHist.push(stageColIndex !== -1 ? currentValues[stageColIndex] : '');
      }

      targetSheet.getRange(2, 1, 1, histHeader.length).setValues([rowValuesForHist]);
      targetSheet.getRange(2, histStatusColIndex + 1).setValue('Loaded');
      targetSheet.getRange(2, histLoadDttmColIndex + 1).setValue(now);

      stageSheet.deleteRow(row.rowIndex);
      loadedCount++;
    } catch (rowError) {
      failAtRowNum = row.rowIndex;
      const error = new Error('Error processing row ' + row.rowIndex + ': ' + rowError.toString());
      error.rowIndex = row.rowIndex;
      throw error;
    }
  }

  return {
    loadedCount: loadedCount,
    failAtRowNum: failAtRowNum
  };
}

function incrementLoadWriteFailureLog_(startDttm, failAtRowNum) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stageSheet = ss.getSheetByName('Stage');
    const stageRowsTotal = stageSheet ? (stageSheet.getLastRow() - 1) : 0;

    appendLoadsLog({
      HistSheetName: 'NewJobs',
      StartDttm: startDttm,
      EndDttm: new Date(),
      StageRowsTotal: stageRowsTotal,
      NewCount: 0,
      DoubleCount: 0,
      LoadedCount: 0,
      SuccessFlag: false,
      FailAtRowNum: failAtRowNum
    });
  } catch (logError) {
    // Ignore log errors
  }
}
