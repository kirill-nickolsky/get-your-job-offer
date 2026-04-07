/**
 * Stage 8: Build Mart - Rebuilds Jobs2Apply from NewJobs
 */

/**
 * Main function to build Jobs2Apply mart
 */
function buildMart() {
  try {
    const jobs2ApplyStats = rebuildJobs2ApplySheet_();
    
    let message = 'Build Mart completed:\n\n';
    message += 'Sheet: Jobs2Apply\n';
    message += 'Total rows: ' + jobs2ApplyStats.totalRows + '\n';
    message += 'Jobs2Apply rate 5: ' + jobs2ApplyStats.rateCounts[5] + '\n';
    message += 'Jobs2Apply rate 4: ' + jobs2ApplyStats.rateCounts[4] + '\n';
    message += 'Jobs2Apply rate 3: ' + jobs2ApplyStats.rateCounts[3];
    
    uiAlertNonBlocking_('Build Mart', message);
    
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

function rebuildJobs2ApplySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName('NewJobs');
  if (!sourceSheet) {
    throw new Error('NewJobs sheet not found');
  }

  const outputSheetName = 'Jobs2Apply';
  let outputSheet = ss.getSheetByName(outputSheetName);
  if (!outputSheet) {
    outputSheet = ss.insertSheet(outputSheetName);
  }

  const outputHeader = [
    'JobTitle',
    'JobCompany',
    'JobLocation',
    'JobTags',
    'JobDescription',
    'JobId',
    'JobApplyUrl',
    'ScrapePageName',
    'JobRateDttm',
    'JobRateNum',
    'JobRateDesc',
    'JobRateShortDesc',
    'RatedModelName',
    'Status',
    'LoadDttm',
    'JobTop3Stack',
    'JobTop3Want',
    'JobWorkMode'
  ];
  const desiredRates = [5, 4, 3];
  const rateSections = {
    5: [],
    4: [],
    3: []
  };
  const headerIndexMap = {};

  const sourceHeader = readHeader(sourceSheet);
  for (let i = 0; i < outputHeader.length; i++) {
    headerIndexMap[outputHeader[i]] = sourceHeader.indexOf(outputHeader[i]);
  }

  const statusColIndex = sourceHeader.indexOf('Status');
  const jobRateNumColIndex = sourceHeader.indexOf('JobRateNum');
  const jobRateDttmColIndex = sourceHeader.indexOf('JobRateDttm');
  const loadDttmColIndex = sourceHeader.indexOf('LoadDttm');
  if (statusColIndex === -1 || jobRateNumColIndex === -1) {
    throw new Error('NewJobs sheet must contain Status and JobRateNum columns');
  }

  if (sourceSheet.getLastRow() >= 2) {
    const values = sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, sourceHeader.length).getValues();
    for (let i = 0; i < values.length; i++) {
      const status = String(values[i][statusColIndex] || '').trim();
      if (status !== '2Apply') {
        continue;
      }

      const rateNum = parseJobs2ApplyRate_(values[i][jobRateNumColIndex]);
      if (!rateSections.hasOwnProperty(rateNum)) {
        continue;
      }

      const mappedRow = [];
      for (let c = 0; c < outputHeader.length; c++) {
        const sourceColIndex = headerIndexMap[outputHeader[c]];
        mappedRow.push(sourceColIndex === -1 ? '' : values[i][sourceColIndex]);
      }

      rateSections[rateNum].push({
        values: mappedRow,
        jobRateDttmMs: jobRateDttmColIndex === -1 ? NaN : parseDateCellToMs_(values[i][jobRateDttmColIndex]),
        loadDttmMs: loadDttmColIndex === -1 ? NaN : parseDateCellToMs_(values[i][loadDttmColIndex])
      });
    }
  }

  for (let r = 0; r < desiredRates.length; r++) {
    const rate = desiredRates[r];
    rateSections[rate].sort(function(a, b) {
      const aJobRateMs = isNaN(a.jobRateDttmMs) ? -Infinity : a.jobRateDttmMs;
      const bJobRateMs = isNaN(b.jobRateDttmMs) ? -Infinity : b.jobRateDttmMs;
      if (aJobRateMs !== bJobRateMs) {
        return bJobRateMs - aJobRateMs;
      }
      const aLoadMs = isNaN(a.loadDttmMs) ? -Infinity : a.loadDttmMs;
      const bLoadMs = isNaN(b.loadDttmMs) ? -Infinity : b.loadDttmMs;
      return bLoadMs - aLoadMs;
    });
  }

  const outputRows = [];
  const sectionTitleRows = [];
  const sectionHeaderRows = [];
  for (let j = 0; j < desiredRates.length; j++) {
    const rateValue = desiredRates[j];
    const titleRowIndex = outputRows.length + 1;
    sectionTitleRows.push(titleRowIndex);
    outputRows.push(['Rate ' + rateValue + ' and Status 2Apply'].concat(Array(outputHeader.length - 1).fill('')));

    const headerRowIndex = outputRows.length + 1;
    sectionHeaderRows.push(headerRowIndex);
    outputRows.push(outputHeader.slice());

    const sectionRows = rateSections[rateValue];
    for (let k = 0; k < sectionRows.length; k++) {
      outputRows.push(sectionRows[k].values);
    }

    if (j !== desiredRates.length - 1) {
      outputRows.push(Array(outputHeader.length).fill(''));
    }
  }

  if (outputSheet.getMaxColumns() < outputHeader.length) {
    outputSheet.insertColumnsAfter(outputSheet.getMaxColumns(), outputHeader.length - outputSheet.getMaxColumns());
  }
  outputSheet.clear();
  if (typeof outputSheet.showColumns === 'function') {
    outputSheet.showColumns(1, outputHeader.length);
  }
  if (outputRows.length > 0) {
    outputSheet.getRange(1, 1, outputRows.length, outputHeader.length).setValues(outputRows);
    outputSheet.setRowHeights(1, outputRows.length, 21);
  }

  for (let t = 0; t < sectionTitleRows.length; t++) {
    outputSheet.getRange(sectionTitleRows[t], 1, 1, outputHeader.length)
      .setFontWeight('bold')
      .setBackground('#d9ead3');
  }
  for (let h = 0; h < sectionHeaderRows.length; h++) {
    outputSheet.getRange(sectionHeaderRows[h], 1, 1, outputHeader.length)
      .setFontWeight('bold')
      .setBackground('#f3f3f3');
  }

  outputSheet.autoResizeColumns(1, outputHeader.length);

  return {
    totalRows: rateSections[5].length + rateSections[4].length + rateSections[3].length,
    rateCounts: {
      5: rateSections[5].length,
      4: rateSections[4].length,
      3: rateSections[3].length
    }
  };
}

function parseJobs2ApplyRate_(value) {
  const normalized = String(value === null || value === undefined ? '' : value).trim();
  if (!normalized) {
    return NaN;
  }
  const parsed = Number(normalized.replace(',', '.'));
  return isNaN(parsed) ? NaN : parsed;
}
