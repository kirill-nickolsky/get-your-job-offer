/**
 * Settings API - Reads configuration from Settings sheet
 */

/**
 * Gets a setting value by key from the Settings sheet
 * @param {string} key - The exact key to look up
 * @return {string} The value associated with the key, or null if not found
 */
function getSetting(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName('Settings');
  
  if (!settingsSheet) {
    throw new Error('Settings sheet not found');
  }
  
  const data = settingsSheet.getDataRange().getValues();
  
  // Search for exact key match (skip header row if present)
  let startIndex = 0;
  if (data.length > 0) {
    const firstKey = String(data[0][0] || '').trim().toLowerCase();
    const firstVal = String(data[0][1] || '').trim().toLowerCase();
    if ((firstKey === 'key' && firstVal === 'value') ||
        (firstKey === 'setting' && firstVal === 'value') ||
        (firstKey === 'name' && firstVal === 'value')) {
      startIndex = 1;
    }
  }
  for (let i = startIndex; i < data.length; i++) {
    if (data[i][0] === key) {
      return data[i][1] || '';
    }
  }
  
  return null;
}

/**
 * Sets (or appends) a setting value by key in the Settings sheet.
 * @param {string} key
 * @param {string} value
 */
function setSettingValue_(key, value) {
  const settingKey = String(key || '').trim();
  if (!settingKey) {
    throw new Error('Setting key is required');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settingsSheet = ss.getSheetByName('Settings');
  if (!settingsSheet) {
    throw new Error('Settings sheet not found');
  }

  const normalizedValue = String(value || '').trim();
  const data = settingsSheet.getDataRange().getValues();

  let startIndex = 0;
  if (data.length > 0) {
    const firstKey = String(data[0][0] || '').trim().toLowerCase();
    const firstVal = String(data[0][1] || '').trim().toLowerCase();
    if ((firstKey === 'key' && firstVal === 'value') ||
        (firstKey === 'setting' && firstVal === 'value') ||
        (firstKey === 'name' && firstVal === 'value')) {
      startIndex = 1;
    }
  }

  for (let i = startIndex; i < data.length; i++) {
    const rowKey = String(data[i][0] || '').trim();
    if (rowKey === settingKey) {
      settingsSheet.getRange(i + 1, 2).setValue(normalizedValue);
      return;
    }
  }

  settingsSheet.appendRow([settingKey, normalizedValue]);
}

/**
 * Gets the expected header as an array of column names
 * @return {Array<string>} Array of column names in order
 */
function getExpectedHeader() {
  const headerStr = getSetting('ExpectedHeader');
  if (!headerStr) {
    throw new Error('ExpectedHeader setting not found');
  }

  // Support both comma and tab separation from Settings.
  const configuredHeader = headerStr.indexOf('\t') !== -1
    ? headerStr.split('\t').map(col => col.trim()).filter(col => col.length > 0)
    : headerStr.split(',').map(col => col.trim()).filter(col => col.length > 0);

  // Prefer live NewJobs header when available to avoid runtime breakage after
  // manual column additions/reordering in the workbook.
  const liveNewJobsHeader = tryReadSheetHeaderByName_('NewJobs');
  if (liveNewJobsHeader.length > 0) {
    return liveNewJobsHeader;
  }

  // Fallback to Stage header if NewJobs does not exist yet.
  const liveStageHeader = tryReadSheetHeaderByName_('Stage');
  if (liveStageHeader.length > 0) {
    return liveStageHeader;
  }

  return configuredHeader;
}

function tryReadSheetHeaderByName_(sheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastColumn() < 1) {
      return [];
    }
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return headerRow
      .map(cell => String(cell || '').trim())
      .filter(cell => cell.length > 0);
  } catch (e) {
    return [];
  }
}

/**
 * Gets the HistSheetSourceMap and parses it into an object
 * @return {Object} Map of source -> sheet name (e.g., {linkedin: 'LinkedinHist', hh: 'HhHist'})
 */
function getHistSheetSourceMap() {
  const mapStr = getSetting('HistSheetSourceMap');
  if (!mapStr) {
    throw new Error('HistSheetSourceMap setting not found');
  }
  
  const map = {};
  const pairs = mapStr.split(';');
  
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].trim();
    if (pair.length === 0) continue;
    
    const equalIndex = pair.indexOf('=');
    if (equalIndex === -1) continue;
    
    const source = pair.substring(0, equalIndex).trim();
    const sheetName = pair.substring(equalIndex + 1).trim();
    map[source] = sheetName;
  }
  
  return map;
}

/**
 * Gets the SourceParseRules setting
 * @return {string} The SourceParseRules value
 */
function getSourceParseRules() {
  return getSetting('SourceParseRules') || '';
}

/**
 * Gets the CV setting
 * @return {string} The CV value
 */
function getCV() {
  return getSetting('CV') || '';
}

/**
 * Gets the Goal setting
 * @return {string} The Goal value
 */
function getGoal() {
  return getSetting('Goal') || '';
}

/**
 * Gets the PromptSimpleRate setting
 * @return {string} The PromptSimpleRate template
 */
function getPromptSimpleRate() {
  return getSetting('PromptSimpleRate') || '';
}

/**
 * Gets the PromptMediumRate setting
 * @return {string} The PromptMediumRate template
 */
function getPromptMediumRate() {
  return getSetting('PromptMediumRate') || '';
}

/**
 * Gets the StackNegative list (comma-separated) from Settings
 * @return {Array<string>} Array of normalized lowercase keywords
 */
function getStackNegativeList() {
  const value = getSetting('StackNegative') || '';
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => item.length > 0);
}

/**
 * Gets the CompanyNegative list (comma-separated) from Settings
 * @return {Array<string>} Array of normalized lowercase company patterns
 */
function getCompanyNegativeList() {
  const value = getSetting('CompanyNegative') || '';
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => item.length > 0);
}

/**
 * Gets the SimpleRateTitleDenyRegex setting
 * @return {string} Regex pattern string
 */
function getSimpleRateTitleDenyRegex() {
  return getSetting('SimpleRateTitleDenyRegex') || '';
}

/**
 * Gets the ModelsFallbackList and parses it into an array
 * @return {Array<string>} Array of model names
 */
function getModelsFallbackList() {
  const listStr = getSetting('ModelsFallbackList');
  if (!listStr) {
    throw new Error('ModelsFallbackList setting not found');
  }
  return listStr.split(',').map(m => m.trim()).filter(m => m.length > 0);
}

/**
 * Gets the WeakModelsList and parses it into an array
 * @return {Array<string>} Array of weak model names
 */
function getWeakModelsList() {
  const listStr = getSetting('WeakModelsList') || '';
  if (!listStr) {
    return [];
  }
  return listStr.split(',').map(m => m.trim()).filter(m => m.length > 0);
}

/**
 * Gets the RetryPolicyAttempts setting
 * @return {number} Number of retry attempts
 */
function getRetryPolicyAttempts() {
  const value = getSetting('RetryPolicyAttempts');
  if (!value) {
    return 3; // Default
  }
  const num = parseInt(value);
  return isNaN(num) ? 3 : num;
}

/**
 * Gets the RetryPolicySleepSeconds setting
 * @return {number} Sleep seconds for retry
 */
function getRetryPolicySleepSeconds() {
  const value = getSetting('RetryPolicySleepSeconds');
  if (!value) {
    return 2; // Default
  }
  const num = parseInt(value);
  return isNaN(num) ? 2 : num;
}

/**
 * Gets the RetryPolicyBackoffMultiplier setting
 * @return {number} Backoff multiplier for retry
 */
function getRetryPolicyBackoffMultiplier() {
  const value = getSetting('RetryPolicyBackoffMultiplier');
  if (!value) {
    return 2; // Default
  }
  const num = parseFloat(value);
  return isNaN(num) ? 2 : num;
}
