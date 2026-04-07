/**
 * Utilities for moving rows between sheets
 */

/**
 * Moves all rows with Status=2Delete from NewJobs to DeletedJobs.
 */
function move2DeleteToDeletedJobs() {
  moveRowsByStatus('NewJobs', 'DeletedJobs', '2Delete');
}

/**
 * Moves all rows from NewJobs to JobsHist if LoadDttm is older than 7 days.
 */
function moveOldNewJobsToJobsHist() {
  moveRowsOlderThanDays('NewJobs', 'JobsHist', 'LoadDttm', 7);
}

function moveRowsByStatus(sourceSheetName, targetSheetName, statusValue) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = ss.getSheetByName(sourceSheetName);
    if (!sourceSheet) {
      throw new Error(sourceSheetName + ' sheet not found');
    }

    const sourceHeader = readHeader(sourceSheet);
    const statusColIndex = sourceHeader.indexOf('Status');
    if (statusColIndex === -1) {
      throw new Error('Status column missing in ' + sourceSheetName);
    }

    const targetSheet = ensureSheetWithHeader(ss, targetSheetName, sourceHeader);
    const targetHeader = ensureTargetHasSourceColumns_(targetSheet, sourceHeader);

    const lastRow = sourceSheet.getLastRow();
    if (lastRow < 2) {
      uiAlertNonBlocking_('Info', sourceSheetName + ' has no data rows');
      return;
    }

    const dataRange = sourceSheet.getRange(2, 1, lastRow - 1, sourceHeader.length);
    const dataValues = dataRange.getValues();
    const rowsToMoveSourceShape = [];
    const rowIndexes = [];

    for (let i = 0; i < dataValues.length; i++) {
      const status = String(dataValues[i][statusColIndex] || '').trim();
      if (status === statusValue) {
        rowsToMoveSourceShape.push(dataValues[i]);
        rowIndexes.push(i + 2);
      }
    }

    if (rowsToMoveSourceShape.length === 0) {
      uiAlertNonBlocking_('Info', 'No rows with Status=' + statusValue + ' in ' + sourceSheetName);
      return;
    }

    const rowsToMove = remapRowsByHeader_(rowsToMoveSourceShape, sourceHeader, targetHeader);
    const targetStartRow = targetSheet.getLastRow() + 1;
    targetSheet.getRange(targetStartRow, 1, rowsToMove.length, targetHeader.length).setValues(rowsToMove);

    rowIndexes.sort((a, b) => b - a);
    for (let i = 0; i < rowIndexes.length; i++) {
      sourceSheet.deleteRow(rowIndexes[i]);
    }

    if (sourceSheetName === 'NewJobs' && typeof recalcDataFunnelDerivedCounters === 'function') {
      try {
        recalcDataFunnelDerivedCounters();
      } catch (e) {
        Logger.log('[RowMover] DataFunnel recalc failed: ' + e.toString());
      }
    }

    uiAlertNonBlocking_(
      'Success',
      'Moved ' + rowsToMove.length + ' rows to ' + targetSheetName);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

function moveRowsOlderThanDays(sourceSheetName, targetSheetName, dateColumnName, days) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = ss.getSheetByName(sourceSheetName);
    if (!sourceSheet) {
      throw new Error(sourceSheetName + ' sheet not found');
    }

    const sourceHeader = readHeader(sourceSheet);
    const dateColIndex = sourceHeader.indexOf(dateColumnName);
    if (dateColIndex === -1) {
      throw new Error(dateColumnName + ' column missing in ' + sourceSheetName);
    }

    const targetSheet = ensureSheetWithHeader(ss, targetSheetName, sourceHeader);
    const targetHeader = ensureTargetHasSourceColumns_(targetSheet, sourceHeader);

    const lastRow = sourceSheet.getLastRow();
    if (lastRow < 2) {
      uiAlertNonBlocking_('Info', sourceSheetName + ' has no data rows');
      return;
    }

    const dataRange = sourceSheet.getRange(2, 1, lastRow - 1, sourceHeader.length);
    const dataValues = dataRange.getValues();
    const rowsToMoveSourceShape = [];
    const rowIndexes = [];

    const now = new Date();
    const cutoffMs = now.getTime() - (days * 24 * 60 * 60 * 1000);

    for (let i = 0; i < dataValues.length; i++) {
      const rawDate = dataValues[i][dateColIndex];
      if (!rawDate) {
        continue;
      }

      let dateValue = null;
      if (rawDate instanceof Date) {
        dateValue = rawDate;
      } else if (typeof rawDate === 'number') {
        dateValue = new Date(rawDate);
      } else {
        const parsed = new Date(String(rawDate));
        if (!isNaN(parsed.getTime())) {
          dateValue = parsed;
        }
      }

      if (!dateValue || isNaN(dateValue.getTime())) {
        continue;
      }

      if (dateValue.getTime() <= cutoffMs) {
        rowsToMoveSourceShape.push(dataValues[i]);
        rowIndexes.push(i + 2);
      }
    }

    if (rowsToMoveSourceShape.length === 0) {
      uiAlertNonBlocking_(
        'Info',
        'No rows with ' + dateColumnName + ' older than ' + days + ' days in ' + sourceSheetName);
      return;
    }

    const rowsToMove = remapRowsByHeader_(rowsToMoveSourceShape, sourceHeader, targetHeader);
    const targetStartRow = targetSheet.getLastRow() + 1;
    targetSheet.getRange(targetStartRow, 1, rowsToMove.length, targetHeader.length).setValues(rowsToMove);

    rowIndexes.sort((a, b) => b - a);
    for (let i = 0; i < rowIndexes.length; i++) {
      sourceSheet.deleteRow(rowIndexes[i]);
    }

    if (sourceSheetName === 'NewJobs' && typeof recalcDataFunnelDerivedCounters === 'function') {
      try {
        recalcDataFunnelDerivedCounters();
      } catch (e) {
        Logger.log('[RowMover] DataFunnel recalc failed: ' + e.toString());
      }
    }

    uiAlertNonBlocking_(
      'Success',
      'Moved ' + rowsToMove.length + ' rows to ' + targetSheetName);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

function ensureSheetWithHeader(ss, sheetName, header) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  return sheet;
}

function ensureTargetHasSourceColumns_(targetSheet, sourceHeader) {
  let targetHeader = readHeader(targetSheet);
  if (!targetHeader || targetHeader.length === 0) {
    targetSheet.getRange(1, 1, 1, sourceHeader.length).setValues([sourceHeader]);
    return sourceHeader.slice();
  }

  const missingColumns = [];
  for (let i = 0; i < sourceHeader.length; i++) {
    if (targetHeader.indexOf(sourceHeader[i]) === -1) {
      missingColumns.push(sourceHeader[i]);
    }
  }

  if (missingColumns.length > 0) {
    const startCol = targetHeader.length + 1;
    targetSheet.getRange(1, startCol, 1, missingColumns.length).setValues([missingColumns]);
    targetHeader = targetHeader.concat(missingColumns);
  }

  return targetHeader;
}

function remapRowsByHeader_(rows, sourceHeader, targetHeader) {
  const sourceIndexByName = {};
  for (let i = 0; i < sourceHeader.length; i++) {
    sourceIndexByName[sourceHeader[i]] = i;
  }

  const mapped = [];
  for (let r = 0; r < rows.length; r++) {
    const sourceRow = rows[r];
    const targetRow = [];
    for (let c = 0; c < targetHeader.length; c++) {
      const colName = targetHeader[c];
      const sourceIndex = sourceIndexByName[colName];
      targetRow.push(sourceIndex === undefined ? '' : sourceRow[sourceIndex]);
    }
    mapped.push(targetRow);
  }
  return mapped;
}
