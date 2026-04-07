/**
 * Validators - Header validation, source parsing, Hist sheet validation
 */

/**
 * Reads the header (row 1) from a sheet
 * @param {Sheet} sheet - The sheet to read from
 * @return {Array<string>} Array of column names from row 1
 */
function readHeader(sheet) {
  if (!sheet) {
    throw new Error('Sheet is null or undefined');
  }

  const sheetName = String(sheet.getName() || '').trim();
  if (sheetName === 'Jobs2Apply') {
    const jobs2ApplyHeader = tryReadJobs2ApplyHeader_(sheet);
    if (jobs2ApplyHeader.length > 0) {
      return jobs2ApplyHeader;
    }
  }

  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headerRow.map(cell => String(cell || '').trim()).filter(cell => cell.length > 0);
}

function tryReadJobs2ApplyHeader_(sheet) {
  if (!sheet || sheet.getLastColumn() < 1 || sheet.getLastRow() < 1) {
    return [];
  }

  const scanRowCount = Math.min(sheet.getLastRow(), 10);
  const rows = sheet.getRange(1, 1, scanRowCount, sheet.getLastColumn()).getValues();
  for (let i = 0; i < rows.length; i++) {
    const candidate = rows[i]
      .map(function(cell) { return String(cell || '').trim(); })
      .filter(function(cell) { return cell.length > 0; });
    if (candidate.indexOf('JobId') !== -1 &&
        candidate.indexOf('Status') !== -1 &&
        candidate.indexOf('JobTitle') !== -1) {
      return candidate;
    }
  }

  return [];
}

/**
 * Validates that a sheet's header matches the expected header exactly (composition and order)
 * @param {Sheet} sheet - The sheet to validate
 * @param {Array<string>} expectedHeader - The expected header array
 * @return {Object} {valid: boolean, errors: Array<string>}
 */
function validateHeader(sheet, expectedHeader) {
  const actualHeader = readHeader(sheet);
  const errors = [];
  
  // Check composition - all expected columns must be present
  const missing = [];
  for (let i = 0; i < expectedHeader.length; i++) {
    if (actualHeader.indexOf(expectedHeader[i]) === -1) {
      missing.push(expectedHeader[i]);
    }
  }
  if (missing.length > 0) {
    errors.push('Missing columns: ' + missing.join(', '));
  }
  
  // Check for extra columns
  const extra = [];
  for (let i = 0; i < actualHeader.length; i++) {
    if (expectedHeader.indexOf(actualHeader[i]) === -1) {
      extra.push(actualHeader[i]);
    }
  }
  if (extra.length > 0) {
    errors.push('Extra columns: ' + extra.join(', '));
  }
  
  // Check order - must match exactly
  if (actualHeader.length !== expectedHeader.length) {
    errors.push('Column count mismatch: expected ' + expectedHeader.length + ', got ' + actualHeader.length);
  } else {
    let misordered = false;
    for (let i = 0; i < expectedHeader.length; i++) {
      if (actualHeader[i] !== expectedHeader[i]) {
        misordered = true;
        break;
      }
    }
    if (misordered) {
      errors.push('Column order mismatch');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Parses a job URL to extract the source (e.g., linkedin, hh, habr)
 * @param {string} jobUrl - The job URL to parse
 * @param {string} sourceParseRules - The parse rules (currently unused, for future extension)
 * @return {string} The extracted source name
 */
function parseSource(jobUrl, sourceParseRules) {
  if (!jobUrl || typeof jobUrl !== 'string') {
    throw new Error('Invalid jobUrl');
  }
  
  let url = jobUrl.trim();
  
  // Remove protocol if present
  url = url.replace(/^https?:\/\//, '');
  
  // Remove prefixes: www., m., jobs.
  url = url.replace(/^(www\.|m\.|jobs\.)/i, '');
  
  // Extract first label before first dot (domain label)
  const firstDotIndex = url.indexOf('.');
  if (firstDotIndex === -1) {
    // No dot found, return the whole string
    return url.toLowerCase();
  }
  
  const source = url.substring(0, firstDotIndex).toLowerCase();
  return source;
}

/**
 * Parses HistSheetSourceMap string into a map object
 * @param {string} histSheetSourceMap - The map string (e.g., "linkedin=LinkedinHist; hh=HhHist")
 * @return {Object} Map of source -> sheet name
 */
function getHistMap(histSheetSourceMap) {
  if (!histSheetSourceMap) {
    return {};
  }
  
  const map = {};
  const pairs = histSheetSourceMap.split(';');
  
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
 * Asserts that the currently active sheet is a Hist sheet
 * @throws {Error} If the active sheet is not a Hist sheet
 */
function assertActiveHistSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  
  if (!activeSheet) {
    throw new Error('No active sheet');
  }
  
  const activeSheetName = activeSheet.getName();
  const newJobsSheetName = 'NewJobs';
  if (activeSheetName === newJobsSheetName) {
    return;
  }
  
  let histSheetNames = [];
  try {
    const histMap = getHistSheetSourceMap();
    histSheetNames = Object.values(histMap);
  } catch (e) {
    histSheetNames = [];
  }
  
  // Check if active sheet name is in the Hist map values
  if (histSheetNames.indexOf(activeSheetName) === -1) {
    const expectedNames = [newJobsSheetName].concat(histSheetNames).filter(Boolean);
    throw new Error('Active sheet "' + activeSheetName + '" is not a jobs sheet. Expected one of: ' + expectedNames.join(', '));
  }
}
