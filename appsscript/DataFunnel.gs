/**
 * DataFunnel helpers
 */

var DATAFUNNEL_TOTAL_LABEL = 'Scraped TOTAL:';
var DATAFUNNEL_DATE_FORMAT = 'yyyy-MM-dd';
var DATAFUNNEL_APPLICATIONS_LABEL = 'Откликов';
var DATAFUNNEL_AFTER_S_RATE_LABEL = 'Jobs After S-Rate';
var DATAFUNNEL_AFTER_M_RATE_LABEL = 'Jobs After M-Rate';
var DATAFUNNEL_AFTER_L_RATE_LABEL = 'Jobs After L-Rate';

function ensureDataFunnelSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('DataFunnel');
  if (!sheet) {
    sheet = ss.insertSheet('DataFunnel');
  }

  sheet.getRange(1, 1, 1, 3).setValues([[
    'ScrapePageId',
    'ScrapeJobsCount',
    'ScrapeJobsStatus'
  ]]);

  const lastCol = Math.max(sheet.getLastColumn(), 3);
  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const header = headerRow.map(cell => String(cell || '').trim());

  const columns = {
    ScrapePageId: 1,
    ScrapeJobsCount: 2,
    ScrapeJobsStatus: 3
  };

  const totalRowIndex = ensureTotalsRow(sheet, columns.ScrapePageId);

  return {
    sheet: sheet,
    header: header,
    columns: columns,
    totalRowIndex: totalRowIndex
  };
}

function ensureTotalsRow(sheet, nameCol) {
  const totalLabelNormalized = String(DATAFUNNEL_TOTAL_LABEL || '').trim().toUpperCase();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.getRange(2, nameCol).setValue(DATAFUNNEL_TOTAL_LABEL);
    return 2;
  }

  const nameValues = sheet.getRange(2, nameCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < nameValues.length; i++) {
    const value = String(nameValues[i][0] || '').trim().toUpperCase();
    if (value === totalLabelNormalized) {
      return i + 2;
    }
  }

  const newRow = lastRow + 1;
  sheet.getRange(newRow, nameCol).setValue(DATAFUNNEL_TOTAL_LABEL);
  return newRow;
}

function ensureDailyShift(funnel) {
  const sheet = funnel.sheet;
  const now = new Date();
  const today = Utilities.formatDate(now, Session.getScriptTimeZone(), DATAFUNNEL_DATE_FORMAT);
  const props = PropertiesService.getDocumentProperties();
  const lastRunDate = props.getProperty('DataFunnelLastRunDate') || '';

  if (lastRunDate === today) {
    return false;
  }

  if (!lastRunDate) {
    props.setProperty('DataFunnelLastRunDate', today);
    return false;
  }

  const totalRowIndex = ensureTotalsRow(sheet, funnel.columns.ScrapePageId);
  const lastSourceRow = Math.max(totalRowIndex - 1, 1);
  const lastDataRow = sheet.getLastRow();
  if (lastDataRow < 2) {
    props.setProperty('DataFunnelLastRunDate', today);
    return false;
  }

  const sourceRowCount = Math.max(lastSourceRow - 1, 0);
  const hasSourceRows = sourceRowCount > 0;
  const countRange = sheet.getRange(2, funnel.columns.ScrapeJobsCount, lastDataRow - 1, 1);
  const countValues = countRange.getValues();
  const statusValues = hasSourceRows
    ? sheet.getRange(2, funnel.columns.ScrapeJobsStatus, sourceRowCount, 1).getValues()
    : [];
  let hasData = false;

  for (let i = 0; i < countValues.length; i++) {
    const countVal = String(countValues[i][0] || '').trim();
    if (countVal !== '') {
      hasData = true;
      break;
    }
  }
  if (!hasData && hasSourceRows) {
    for (let i = 0; i < statusValues.length; i++) {
      const statusVal = String(statusValues[i][0] || '').trim();
      if (statusVal !== '') {
        hasData = true;
        break;
      }
    }
  }

  if (!hasData) {
    props.setProperty('DataFunnelLastRunDate', today);
    return false;
  }

  // Finalize derived counters for the previous funnel date before snapshot/shift.
  recalcDataFunnelDerivedCountersForDate_(sheet, lastRunDate);
  const lastDataRowAfterRecalc = sheet.getLastRow();
  const countRangeToArchive = sheet.getRange(2, funnel.columns.ScrapeJobsCount, lastDataRowAfterRecalc - 1, 1);
  const countValuesToArchive = countRangeToArchive.getValues();

  sheet.insertColumnAfter(3);
  sheet.getRange(1, 4).setValue(lastRunDate);

  sheet.getRange(2, 4, lastDataRowAfterRecalc - 1, 1).setValues(countValuesToArchive);

  // Clear current day count for all data rows.
  countRangeToArchive.setValues(countValuesToArchive.map(() => ['']));
  // Reset source statuses only.
  if (hasSourceRows) {
    sheet.getRange(2, funnel.columns.ScrapeJobsStatus, sourceRowCount, 1)
      .setValues(Array.from({length: sourceRowCount}, () => ['Waiting']));
  }

  props.setProperty('DataFunnelLastRunDate', today);
  return true;
}

function updateTotalsRow(funnel) {
  const sheet = funnel.sheet;
  const totalRowIndex = ensureTotalsRow(sheet, funnel.columns.ScrapePageId);
  const lastRow = sheet.getLastRow();
  const lastSourceRow = Math.max(totalRowIndex - 1, 1);
  if (lastSourceRow < 2) {
    recalcDataFunnelDerivedCounters_(sheet);
    return;
  }

  const lastCol = sheet.getLastColumn();
  const sourceRange = sheet.getRange(2, 1, lastSourceRow - 1, lastCol).getValues();
  const totals = new Array(lastCol).fill('');

  for (let col = 2; col <= lastCol; col++) {
    if (col === funnel.columns.ScrapeJobsStatus) {
      continue;
    }
    let sum = 0;
    for (let row = 0; row < sourceRange.length; row++) {
      const value = sourceRange[row][col - 1];
      const num = typeof value === 'number' ? value : parseFloat(String(value || '').replace(',', '.'));
      if (!isNaN(num)) {
        sum += num;
      }
    }
    totals[col - 1] = sum > 0 ? sum : '';
  }

  totals[funnel.columns.ScrapePageId - 1] = DATAFUNNEL_TOTAL_LABEL;
  sheet.getRange(totalRowIndex, 1, 1, lastCol).setValues([totals]);
  recalcDataFunnelDerivedCounters_(sheet);
}

function parseDataFunnelNumber_(value) {
  const num = parseFloat(String(value || '').replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

function normalizeDataFunnelLabel_(label) {
  return String(label || '')
    .trim()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/ё/gi, 'е')
    .toUpperCase();
}

function isApplicationsLabel_(normalizedLabel) {
  return normalizedLabel === 'ОТКЛИКИ' || normalizedLabel === 'ОТКЛИКОВ';
}

function canonicalDataFunnelLabel_(label) {
  const normalized = normalizeDataFunnelLabel_(label);
  if (isApplicationsLabel_(normalized)) {
    return DATAFUNNEL_APPLICATIONS_LABEL;
  }
  return String(label || '').trim();
}

function findDataFunnelRowByLabel_(sheet, label) {
  const target = normalizeDataFunnelLabel_(label);
  if (!target) {
    return -1;
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return -1;
  }
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    const current = normalizeDataFunnelLabel_(values[i][0]);
    if (current === target) {
      return i + 2;
    }
    if (isApplicationsLabel_(target) && isApplicationsLabel_(current)) {
      return i + 2;
    }
  }
  return -1;
}

function findOrCreateDataFunnelRowByLabel_(sheet, label) {
  const canonicalLabel = canonicalDataFunnelLabel_(label);
  const existingRow = findDataFunnelRowByLabel_(sheet, canonicalLabel);
  if (existingRow !== -1) {
    return existingRow;
  }
  const newRow = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(newRow, 1).setValue(canonicalLabel);
  return newRow;
}

function getCurrentFunnelDateKey_() {
  const props = PropertiesService.getDocumentProperties();
  const fromProps = String(props.getProperty('DataFunnelLastRunDate') || '').trim();
  if (fromProps) {
    return fromProps;
  }
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), DATAFUNNEL_DATE_FORMAT);
}

function toDateKey_(value) {
  if (!value) return '';
  let dateObj = null;
  if (value instanceof Date) {
    dateObj = value;
  } else if (typeof value === 'number') {
    dateObj = new Date(value);
  } else {
    const parsed = new Date(String(value));
    if (!isNaN(parsed.getTime())) {
      dateObj = parsed;
    }
  }
  if (!dateObj || isNaN(dateObj.getTime())) {
    return '';
  }
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), DATAFUNNEL_DATE_FORMAT);
}

function getDeletedCountersForDate_(dateKey) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetNames = ['NewJobs', 'DeletedJobs'];
  const counters = {
    simpleDeleteCount: 0,
    mediumBDeleteCount: 0,
    lDeleteCount: 0
  };

  const lRateDeleteRegex = /jobratenum\s*(?::|=|\|)\s*(0|1)\b/i;
  for (let s = 0; s < sheetNames.length; s++) {
    const sheet = ss.getSheetByName(sheetNames[s]);
    if (!sheet || sheet.getLastRow() < 2) {
      continue;
    }

    const header = readHeader(sheet);
    const statusCol = header.indexOf('Status');
    const loadDttmCol = header.indexOf('LoadDttm');
    const jobRateDescCol = header.indexOf('JobRateDesc');
    if (statusCol === -1 || loadDttmCol === -1 || jobRateDescCol === -1) {
      continue;
    }

    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues();
    for (let i = 0; i < values.length; i++) {
      const rowDateKey = toDateKey_(values[i][loadDttmCol]);
      if (rowDateKey !== dateKey) {
        continue;
      }

      const status = String(values[i][statusCol] || '').trim();
      if (status !== '2Delete') {
        continue;
      }

      const jobRateDescRaw = String(values[i][jobRateDescCol] || '').trim();
      if (!jobRateDescRaw) {
        continue;
      }

      const jobRateDesc = jobRateDescRaw.toLowerCase();
      if (jobRateDesc.indexOf('title matched deny regex') !== -1) {
        counters.simpleDeleteCount++;
      }
      if (jobRateDesc.indexOf('medium brate') !== -1 ||
          jobRateDesc.indexOf('medium crate') !== -1 ||
          jobRateDesc.indexOf('location dbl') !== -1) {
        counters.mediumBDeleteCount++;
      }
      if (lRateDeleteRegex.test(jobRateDescRaw)) {
        counters.lDeleteCount++;
      }
    }
  }

  return counters;
}

function recalcDataFunnelDerivedCountersForDate_(sheet, dateKey) {
  const targetDateKey = String(dateKey || '').trim() || getCurrentFunnelDateKey_();
  const totalRow = ensureTotalsRow(sheet, 1);
  const scrapedTotal = parseDataFunnelNumber_(sheet.getRange(totalRow, 2).getValue());
  const deletedCounters = getDeletedCountersForDate_(targetDateKey);
  const afterSRate = Math.max(0, scrapedTotal - deletedCounters.simpleDeleteCount);
  const afterMRate = Math.max(0, afterSRate - deletedCounters.mediumBDeleteCount);
  const afterLRate = Math.max(0, afterMRate - deletedCounters.lDeleteCount);

  const afterSRow = findOrCreateDataFunnelRowByLabel_(sheet, DATAFUNNEL_AFTER_S_RATE_LABEL);
  const afterMRow = findOrCreateDataFunnelRowByLabel_(sheet, DATAFUNNEL_AFTER_M_RATE_LABEL);
  const afterLRow = findOrCreateDataFunnelRowByLabel_(sheet, DATAFUNNEL_AFTER_L_RATE_LABEL);
  sheet.getRange(afterSRow, 2).setValue(afterSRate);
  sheet.getRange(afterMRow, 2).setValue(afterMRate);
  sheet.getRange(afterLRow, 2).setValue(afterLRate);
}

function recalcDataFunnelDerivedCounters_(sheet) {
  recalcDataFunnelDerivedCountersForDate_(sheet, getCurrentFunnelDateKey_());
}

function recalcDataFunnelDerivedCounters() {
  const funnel = ensureDataFunnelSheet();
  recalcDataFunnelDerivedCounters_(funnel.sheet);
}

function incrementDataFunnelCounter(label, delta) {
  const funnel = ensureDataFunnelSheet();
  const sheet = funnel.sheet;
  const row = findOrCreateDataFunnelRowByLabel_(sheet, canonicalDataFunnelLabel_(label));
  const cell = sheet.getRange(row, 2);
  const existing = parseDataFunnelNumber_(cell.getValue());
  const add = parseDataFunnelNumber_(delta);
  cell.setValue(existing + add);
  recalcDataFunnelDerivedCounters_(sheet);
}

function findOrCreateSourceRow(funnel, scrapePageId) {
  const sheet = funnel.sheet;
  const nameCol = funnel.columns.ScrapePageId;
  const totalRowIndex = ensureTotalsRow(sheet, nameCol);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.getRange(2, nameCol).setValue(scrapePageId);
    return 2;
  }

  const nameValues = sheet.getRange(2, nameCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < nameValues.length; i++) {
    const value = String(nameValues[i][0] || '').trim();
    if (value === scrapePageId) {
      return i + 2;
    }
  }

  sheet.insertRowBefore(totalRowIndex);
  sheet.getRange(totalRowIndex, nameCol).setValue(scrapePageId);
  return totalRowIndex;
}

function resolveScrapePageId(scrapePageName) {
  if (!scrapePageName) {
    return '';
  }
  try {
    const sources = getScrapeSourcesConfig();
    if (Array.isArray(sources)) {
      const exactId = sources.find(row => String(row.id || '').trim() === String(scrapePageName).trim());
      if (exactId && exactId.id) {
        return exactId.id;
      }
      const byName = sources.find(row => String(row.name || '').trim() === String(scrapePageName).trim());
      if (byName && byName.id) {
        return byName.id;
      }
    }
  } catch (error) {
    // Ignore lookup errors, fall back to provided value
  }
  return String(scrapePageName);
}

function updateDataFunnelStatus(scrapePageName, status, jobsCount, clearCount) {
  if (!scrapePageName) {
    throw new Error('ScrapePageId is required');
  }

  const funnel = ensureDataFunnelSheet();
  if (status === 'Scraping') {
    ensureDailyShift(funnel);
  }

  const scrapePageId = resolveScrapePageId(scrapePageName);
  const rowIndex = findOrCreateSourceRow(funnel, scrapePageId);

  if (status) {
    funnel.sheet.getRange(rowIndex, funnel.columns.ScrapeJobsStatus).setValue(status);
  }

  if (clearCount) {
    funnel.sheet.getRange(rowIndex, funnel.columns.ScrapeJobsCount).setValue('');
  } else if (jobsCount !== undefined && jobsCount !== null) {
    const cell = funnel.sheet.getRange(rowIndex, funnel.columns.ScrapeJobsCount);
    const existingValue = cell.getValue();
    const existingNum = parseFloat(String(existingValue || '').replace(',', '.'));
    const incomingNum = parseFloat(String(jobsCount).replace(',', '.'));
    const base = isNaN(existingNum) ? 0 : existingNum;
    const add = isNaN(incomingNum) ? 0 : incomingNum;
    cell.setValue(base + add);
  }

  updateTotalsRow(funnel);
}

function updateDataFunnelStatusBatch(scrapePageNames, status) {
  if (!Array.isArray(scrapePageNames) || scrapePageNames.length === 0) {
    return;
  }

  const funnel = ensureDataFunnelSheet();
  for (let i = 0; i < scrapePageNames.length; i++) {
    const name = scrapePageNames[i];
    if (!name) continue;
    const scrapePageId = resolveScrapePageId(name);
    const rowIndex = findOrCreateSourceRow(funnel, scrapePageId);
    if (status) {
      funnel.sheet.getRange(rowIndex, funnel.columns.ScrapeJobsStatus).setValue(status);
    }
  }

  updateTotalsRow(funnel);
}
