/**
 * Utilities - Logging and helper functions
 */

/**
 * Appends a record to the LoadsLog sheet
 * @param {Object} record - The log record object with fields:
 *   - HistSheetName: string
 *   - StartDttm: Date or string
 *   - EndDttm: Date or string
 *   - StageRowsTotal: number
 *   - NewCount: number
 *   - DoubleCount: number
 *   - LoadedCount: number
 *   - SuccessFlag: boolean
 *   - FailAtRowNum: number or null
 */
function appendLoadsLog(record) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let loadsLogSheet = ss.getSheetByName('LoadsLog');
  
  // Create LoadsLog sheet if it doesn't exist
  if (!loadsLogSheet) {
    loadsLogSheet = ss.insertSheet('LoadsLog');
    // Set header row
    loadsLogSheet.getRange(1, 1, 1, 9).setValues([[
      'HistSheetName',
      'StartDttm',
      'EndDttm',
      'StageRowsTotal',
      'NewCount',
      'DoubleCount',
      'LoadedCount',
      'SuccessFlag',
      'FailAtRowNum'
    ]]);
    // Format header
    loadsLogSheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  }
  
  // Format dates
  const formatDate = function(date) {
    if (!date) return '';
    if (date instanceof Date) {
      return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
    return String(date);
  };
  
  // Append the record
  const nextRow = loadsLogSheet.getLastRow() + 1;
  loadsLogSheet.getRange(nextRow, 1, 1, 9).setValues([[
    record.HistSheetName || '',
    formatDate(record.StartDttm),
    formatDate(record.EndDttm),
    record.StageRowsTotal || 0,
    record.NewCount || 0,
    record.DoubleCount || 0,
    record.LoadedCount || 0,
    record.SuccessFlag !== false, // Default to true
    record.FailAtRowNum || ''
  ]]);
}

function normalizeJobHost(host) {
  let value = String(host || '').trim().toLowerCase();
  if (value.startsWith('www.')) {
    value = value.slice(4);
  }
  if (value.startsWith('m.')) {
    value = value.slice(2);
  }
  return value;
}

function normalizeJobUrl(jobUrl) {
  const raw = String(jobUrl || '').trim();
  if (!raw) {
    return {url: '', host: ''};
  }

  const stripTrailingSlash = function(value) {
    if (value.length > 1 && value.endsWith('/')) {
      return value.slice(0, -1);
    }
    return value;
  };

  try {
    const parsed = new URL(raw);
    const host = normalizeJobHost(parsed.hostname);
    const path = parsed.pathname || '';
    const normalized = stripTrailingSlash(host + path);
    return {url: normalized, host: host};
  } catch (error) {
    let cleaned = raw.split('#')[0].split('?')[0].trim();
    cleaned = cleaned.replace(/^https?:\/\//i, '');
    cleaned = stripTrailingSlash(cleaned);
    const host = normalizeJobHost(cleaned.split('/')[0] || '');
    return {url: cleaned, host: host};
  }
}

function buildJobKey(jobId, jobUrl) {
  const id = String(jobId || '').trim();
  const info = normalizeJobUrl(jobUrl);
  if (id && info.host) {
    return 'id|' + info.host + '|' + id;
  }
  if (info.url) {
    return 'url|' + info.url;
  }
  if (id) {
    return 'id|' + id;
  }
  return '';
}

