/**
 * Applications helpers
 */

/**
 * Register selected NewJobs/DeletedJobs/Jobs2Apply rows into "Отклики"
 */
function registerApplication() {
  const toastTitle = 'Applications';
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();
    if (!activeSheet) {
      throw new Error('No active sheet');
    }
    const sourceSheetName = String(activeSheet.getName() || '').trim();
    const allowedSourceSheets = {
      NewJobs: true,
      DeletedJobs: true,
      Jobs2Apply: true
    };
    if (!allowedSourceSheets[sourceSheetName]) {
      throw new Error('Active sheet must be NewJobs, DeletedJobs, or Jobs2Apply');
    }

    const rangeList = ss.getActiveRangeList();
    const activeRange = ss.getActiveRange();
    const ranges = rangeList ? rangeList.getRanges() : (activeRange ? [activeRange] : []);
    if (!ranges || ranges.length === 0) {
      throw new Error('No range selected');
    }

    const selectedRowsSet = new Set();
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const startRow = range.getRow();
      const endRow = range.getLastRow();
      for (let r = startRow; r <= endRow; r++) {
        if (r >= 2) {
          selectedRowsSet.add(r);
        }
      }
    }

    const selectedRows = Array.from(selectedRowsSet).sort(function(a, b) {
      return a - b;
    });
    if (selectedRows.length === 0) {
      throw new Error('Select at least one data row (row 2 or below)');
    }

    const header = readHeader(activeSheet);
    const jobCompanyColIndex = header.indexOf('JobCompany');
    const jobUrlColIndex = header.indexOf('JobUrl');
    const jobApplyUrlColIndex = header.indexOf('JobApplyUrl');
    const jobTitleColIndex = header.indexOf('JobTitle');
    const jobDescriptionColIndex = header.indexOf('JobDescription');
    const jobIdColIndex = header.indexOf('JobId');
    const jobLocationColIndex = header.indexOf('JobLocation');
    const jobTop3WantColIndex = header.indexOf('JobTop3Want');
    const jobTop3StackColIndex = header.indexOf('JobTop3Stack');
    const jobRateDescColIndex = header.indexOf('JobRateDesc');
    const jobRateShortDescColIndex = header.indexOf('JobRateShortDesc');
    const statusColIndex = header.indexOf('Status');

    if (jobCompanyColIndex === -1 || jobTitleColIndex === -1 || jobDescriptionColIndex === -1) {
      throw new Error('Missing columns in ' + sourceSheetName + ': JobCompany, JobTitle, JobDescription');
    }
    if (jobUrlColIndex === -1 && jobApplyUrlColIndex === -1) {
      throw new Error('Missing columns in ' + sourceSheetName + ': JobUrl or JobApplyUrl');
    }
    if (statusColIndex === -1) {
      throw new Error('Missing column in ' + sourceSheetName + ': Status');
    }

    const selectedItems = [];
    for (let i = 0; i < selectedRows.length; i++) {
      const rowNum = selectedRows[i];
      const rowValues = activeSheet.getRange(rowNum, 1, 1, header.length).getValues()[0];
      const statusValue = String(rowValues[statusColIndex] || '').trim();

      if (sourceSheetName === 'Jobs2Apply' &&
          statusValue !== '2Apply' &&
          statusValue !== 'Applied') {
        continue;
      }

      const primaryUrl = jobUrlColIndex !== -1 ? String(rowValues[jobUrlColIndex] || '').trim() : '';
      const applyUrl = jobApplyUrlColIndex !== -1 ? String(rowValues[jobApplyUrlColIndex] || '').trim() : '';
      const effectiveUrl = primaryUrl || applyUrl;
      selectedItems.push({
        rowNum: rowNum,
        rowValues: rowValues,
        effectiveUrl: effectiveUrl,
        jobId: jobIdColIndex !== -1 ? String(rowValues[jobIdColIndex] || '').trim() : '',
        jobCompany: String(rowValues[jobCompanyColIndex] || '').trim(),
        jobTitle: String(rowValues[jobTitleColIndex] || '').trim(),
        jobLocation: jobLocationColIndex !== -1 ? String(rowValues[jobLocationColIndex] || '').trim() : ''
      });
    }

    if (selectedItems.length === 0) {
      throw new Error(
        sourceSheetName === 'Jobs2Apply'
          ? 'Select data rows in Jobs2Apply, not section titles or headers'
          : 'Select at least one data row (row 2 or below)'
      );
    }

    const applicationsSheetName = 'Отклики';
    const expectedHeader = [
      'ApplicationDate',
      'LastContactDate',
      'JobCompany',
      'JobUrl',
      'JobTitle',
      'JobDescription',
      'JobTop3Want',
      'JobTop3Stack',
      'JobRateDesc',
      'JobRateShortDesc',
      'ApplicationText',
      'HRResponseText'
    ];

    let applicationsSheet = ss.getSheetByName(applicationsSheetName);
    if (!applicationsSheet) {
      applicationsSheet = ss.insertSheet(applicationsSheetName);
      applicationsSheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
      applicationsSheet.getRange(1, 1, 1, expectedHeader.length).setFontWeight('bold');
    } else {
      const validation = validateHeader(applicationsSheet, expectedHeader);
      if (!validation.valid) {
        throw new Error('Отклики header validation failed: ' + validation.errors.join('; '));
      }
    }

    if (applicationsSheet.getLastRow() >= 2 && selectedItems.length > 0) {
      applicationsSheet.insertRowsBefore(2, selectedItems.length);
    }

    const now = new Date();
    const newRows = [];
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      const rowValues = item.rowValues;
      newRows.push([
        now,
        now,
        String(rowValues[jobCompanyColIndex] || ''),
        item.effectiveUrl,
        String(rowValues[jobTitleColIndex] || ''),
        String(rowValues[jobDescriptionColIndex] || ''),
        jobTop3WantColIndex !== -1 ? String(rowValues[jobTop3WantColIndex] || '') : '',
        jobTop3StackColIndex !== -1 ? String(rowValues[jobTop3StackColIndex] || '') : '',
        jobRateDescColIndex !== -1 ? String(rowValues[jobRateDescColIndex] || '') : '',
        jobRateShortDescColIndex !== -1 ? String(rowValues[jobRateShortDescColIndex] || '') : '',
        '',
        ''
      ]);
    }

    applicationsSheet.getRange(2, 1, newRows.length, expectedHeader.length).setValues(newRows);

    const appliedRowNums = selectedItems.map(function(item) {
      return item.rowNum;
    });
    setStatusForRowNums_(activeSheet, appliedRowNums, statusColIndex + 1, 'Applied');

    let newJobsUpdateResult = {
      updatedCount: 0,
      missedCount: 0
    };
    if (sourceSheetName === 'Jobs2Apply') {
      newJobsUpdateResult = markJobs2ApplyItemsAppliedInNewJobs_(selectedItems);
    }

    try {
      incrementDataFunnelCounter('Отклики', newRows.length);
    } catch (funnelError) {
      Logger.log('[Applications] DataFunnel update failed: ' + funnelError.toString());
    }

    SpreadsheetApp.flush();
    let toastMessage = 'Application registered: ' + newRows.length + ' row(s)';
    if (sourceSheetName === 'Jobs2Apply') {
      toastMessage += '; NewJobs updated: ' + newJobsUpdateResult.updatedCount;
      if (newJobsUpdateResult.missedCount > 0) {
        toastMessage += '; not matched: ' + newJobsUpdateResult.missedCount;
      }
    }
    ss.toast(toastMessage, toastTitle, 4);
  } catch (error) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Error: ' + error.toString(), toastTitle, 6);
  }
}

function setStatusForRowNums_(sheet, rowNums, targetColIndex, nextStatus) {
  if (!sheet || !rowNums || rowNums.length === 0 || targetColIndex < 1) {
    return;
  }

  const uniqueRows = Array.from(new Set(rowNums)).sort(function(a, b) {
    return a - b;
  });
  let segmentStart = uniqueRows[0];
  let segmentEnd = uniqueRows[0];

  for (let i = 1; i < uniqueRows.length; i++) {
    const rowNum = uniqueRows[i];
    if (rowNum === segmentEnd + 1) {
      segmentEnd = rowNum;
      continue;
    }
    sheet.getRange(segmentStart, targetColIndex, segmentEnd - segmentStart + 1, 1).setValue(nextStatus);
    segmentStart = rowNum;
    segmentEnd = rowNum;
  }

  sheet.getRange(segmentStart, targetColIndex, segmentEnd - segmentStart + 1, 1).setValue(nextStatus);
}

function markJobs2ApplyItemsAppliedInNewJobs_(selectedItems) {
  return setJobs2ApplyItemsStatusInNewJobs_(selectedItems, 'Applied');
}

function setJobs2ApplyItemsStatusInNewJobs_(selectedItems, nextStatus) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const newJobsSheet = ss.getSheetByName('NewJobs');
  if (!newJobsSheet || newJobsSheet.getLastRow() < 2) {
    return {
      updatedCount: 0,
      missedCount: selectedItems.length
    };
  }

  const header = readHeader(newJobsSheet);
  const statusColIndex = header.indexOf('Status');
  const jobIdColIndex = header.indexOf('JobId');
  const jobUrlColIndex = header.indexOf('JobUrl');
  const jobApplyUrlColIndex = header.indexOf('JobApplyUrl');
  const jobCompanyColIndex = header.indexOf('JobCompany');
  const jobTitleColIndex = header.indexOf('JobTitle');
  const jobLocationColIndex = header.indexOf('JobLocation');
  if (statusColIndex === -1) {
    return {
      updatedCount: 0,
      missedCount: selectedItems.length
    };
  }

  const values = newJobsSheet.getRange(2, 1, newJobsSheet.getLastRow() - 1, header.length).getValues();
  const matchedRowNums = [];
  let missedCount = 0;

  for (let i = 0; i < selectedItems.length; i++) {
    const matchedRowNum = findNewJobsRowNumForApplication_(
      values,
      {
        jobIdColIndex: jobIdColIndex,
        jobUrlColIndex: jobUrlColIndex,
        jobApplyUrlColIndex: jobApplyUrlColIndex,
        jobCompanyColIndex: jobCompanyColIndex,
        jobTitleColIndex: jobTitleColIndex,
        jobLocationColIndex: jobLocationColIndex
      },
      selectedItems[i]
    );

    if (matchedRowNum > 0) {
      matchedRowNums.push(matchedRowNum);
    } else {
      missedCount++;
    }
  }

  setStatusForRowNums_(newJobsSheet, matchedRowNums, statusColIndex + 1, nextStatus);
  return {
    updatedCount: Array.from(new Set(matchedRowNums)).length,
    missedCount: missedCount
  };
}

function findNewJobsRowNumForApplication_(rows, indexMap, item) {
  const wantedJobId = String(item.jobId || '').trim();
  const wantedUrlKey = normalizeApplicationUrlKey_(item.effectiveUrl);
  const wantedSignature = buildApplicationMatchSignature_(
    item.jobCompany,
    item.jobTitle,
    item.jobLocation
  );
  let idFallbackRowNum = 0;
  let signatureFallbackRowNum = 0;

  for (let i = 0; i < rows.length; i++) {
    const rowValues = rows[i];
    const rowNum = i + 2;
    const rowJobId = getApplicationCellString_(rowValues, indexMap.jobIdColIndex);
    const rowUrlKey = normalizeApplicationUrlKey_(
      getApplicationCellString_(rowValues, indexMap.jobApplyUrlColIndex) ||
      getApplicationCellString_(rowValues, indexMap.jobUrlColIndex)
    );
    const rowSignature = buildApplicationMatchSignature_(
      getApplicationCellString_(rowValues, indexMap.jobCompanyColIndex),
      getApplicationCellString_(rowValues, indexMap.jobTitleColIndex),
      getApplicationCellString_(rowValues, indexMap.jobLocationColIndex)
    );

    if (wantedJobId && rowJobId && wantedJobId === rowJobId) {
      if (wantedUrlKey && rowUrlKey && wantedUrlKey === rowUrlKey) {
        return rowNum;
      }
      if (wantedSignature && rowSignature === wantedSignature) {
        return rowNum;
      }
      if (!idFallbackRowNum) {
        idFallbackRowNum = rowNum;
      }
      continue;
    }

    if (!wantedJobId && wantedUrlKey && rowUrlKey && wantedUrlKey === rowUrlKey) {
      return rowNum;
    }

    if (!wantedJobId && wantedSignature && rowSignature === wantedSignature && !signatureFallbackRowNum) {
      signatureFallbackRowNum = rowNum;
    }
  }

  return idFallbackRowNum || signatureFallbackRowNum;
}

function buildApplicationMatchSignature_(jobCompany, jobTitle, jobLocation) {
  const parts = [
    normalizeApplicationMatchValue_(jobCompany),
    normalizeApplicationMatchValue_(jobTitle),
    normalizeApplicationMatchValue_(jobLocation)
  ];
  return parts.join('|');
}

function normalizeApplicationMatchValue_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeApplicationUrlKey_(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return normalizeJobUrl(raw).url;
}

function getApplicationCellString_(rowValues, index) {
  if (typeof index !== 'number' || index < 0 || index >= rowValues.length) {
    return '';
  }
  return String(rowValues[index] || '').trim();
}
