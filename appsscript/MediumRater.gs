/**
 * Stage 7.5: Medium BRate (LLM) - Extracts fields and sets Status=2MCRate
 */

// Global status tracking
var mediumRateStatus = {
  currentRow: 0,
  totalRows: 0,
  currentStep: '',
  currentModel: '',
  currentAttempt: 0,
  totalAttempts: 0
};

/**
 * Updates status message (logs and optionally shows to user)
 * @param {string} message - Status message
 */
function updateMediumRateStatus(message) {
  mediumRateStatus.currentStep = message;
  Logger.log('[MediumRate] ' + message);
  
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Medium BRate Status', 3);
  } catch (e) {
    // Ignore toast errors
  }
  
  SpreadsheetApp.flush();
}

function resolveExpectedHeader_(sheet) {
  if (typeof getExpectedHeader === 'function') {
    try {
      const expected = getExpectedHeader();
      if (expected && expected.length) return expected;
    } catch (e) {
      // fall through to sheet header
    }
  }
  if (sheet) {
    if (typeof readHeader === 'function') {
      return readHeader(sheet);
    }
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    return headerRow.map(cell => String(cell || '').trim()).filter(cell => cell.length > 0);
  }
  return [];
}

function getSettingValueWithFallback_(key, defaultValue) {
  if (typeof getSetting === 'function') {
    const value = getSetting(key);
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }
  return defaultValue;
}

function getModelsFallbackListSafe_() {
  if (typeof getModelsFallbackList === 'function') {
    return getModelsFallbackList();
  }
  const raw = String(getSettingValueWithFallback_('ModelsFallbackList', '') || '');
  return raw.split(',').map(function(item) { return String(item || '').trim(); }).filter(function(item) { return item.length > 0; });
}

function getRetryPolicyAttemptsSafe_() {
  if (typeof getRetryPolicyAttempts === 'function') {
    return getRetryPolicyAttempts();
  }
  const value = parseInt(String(getSettingValueWithFallback_('RetryPolicyAttempts', '3')), 10);
  return isNaN(value) ? 3 : value;
}

function getRetryPolicySleepSecondsSafe_() {
  if (typeof getRetryPolicySleepSeconds === 'function') {
    return getRetryPolicySleepSeconds();
  }
  const value = parseInt(String(getSettingValueWithFallback_('RetryPolicySleepSeconds', '2')), 10);
  return isNaN(value) ? 2 : value;
}

function getRetryPolicyBackoffMultiplierSafe_() {
  if (typeof getRetryPolicyBackoffMultiplier === 'function') {
    return getRetryPolicyBackoffMultiplier();
  }
  const value = parseFloat(String(getSettingValueWithFallback_('RetryPolicyBackoffMultiplier', '2')));
  return isNaN(value) ? 2 : value;
}

function getStackNegativeListSafe_() {
  if (typeof getStackNegativeList === 'function') {
    return getStackNegativeList();
  }
  const raw = String(getSettingValueWithFallback_('StackNegative', '') || '');
  return raw
    .split(',')
    .map(function(item) { return String(item || '').trim().toLowerCase(); })
    .filter(function(item) { return item.length > 0; });
}

function getCompanyNegativeListSafe_() {
  if (typeof getCompanyNegativeList === 'function') {
    return getCompanyNegativeList();
  }
  const raw = String(getSettingValueWithFallback_('CompanyNegative', '') || '');
  return raw
    .split(',')
    .map(function(item) { return String(item || '').trim().toLowerCase(); })
    .filter(function(item) { return item.length > 0; });
}

/**
 * Medium BRate: selected range (rows with Status=2MBrate only)
 */
function mediumRateSelectedRange() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();

    if (!activeSheet) {
      throw new Error('No active sheet');
}

    assertActiveHistSheet();

    const expectedHeader = resolveExpectedHeader_(activeSheet);
    if (expectedHeader.length > 0 && typeof validateHeader === 'function') {
      const validationResult = validateHeader(activeSheet, expectedHeader);
      if (!validationResult.valid) {
        throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
      }
    }

    const range = activeSheet.getActiveRange();
    if (!range) {
      uiAlertNonBlocking_('Info', 'Select rows first');
      return;
    }

    const startRow = range.getRow();
    const endRow = startRow + range.getNumRows() - 1;
    if (endRow < 2) {
      uiAlertNonBlocking_('Info', 'Selected range has no data rows');
      return;
    }

    const rowsToProcess = [];
    for (let row = Math.max(2, startRow); row <= endRow; row++) {
      rowsToProcess.push(row);
    }

    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No rows to process');
      return;
    }

    mediumRateRows(rowsToProcess);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Medium BRate: all rows with Status=2MBrate
 */
function mediumRateAll2Mrate() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();
    
    if (!activeSheet) {
      throw new Error('No active sheet');
    }
    
    assertActiveHistSheet();
    
    const expectedHeader = resolveExpectedHeader_(activeSheet);
    if (expectedHeader.length > 0 && typeof validateHeader === 'function') {
      const validationResult = validateHeader(activeSheet, expectedHeader);
      if (!validationResult.valid) {
        throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
      }
    }
    
    const header = readHeader(activeSheet);
    const statusColIndex = header.indexOf('Status');
    
    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }
    
    const lastRow = activeSheet.getLastRow();
    if (lastRow < 2) {
      uiAlertNonBlocking_('Info', 'No data rows found');
      return;
    }
    
    const dataRange = activeSheet.getRange(2, 1, lastRow - 1, header.length);
    const dataValues = dataRange.getValues();
    
    const rowsToProcess = [];
    for (let i = 0; i < dataValues.length; i++) {
      const status = String(dataValues[i][statusColIndex] || '').trim();
      if (status === '2MBrate') {
        rowsToProcess.push(i + 2);
      }
    }
    
    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No rows found with Status=2MBrate');
      return;
    }
    
    mediumRateRows(rowsToProcess);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Main function to rate rows using JobText
 * @param {Array<number>} rowsToProcess - Array of row numbers (1-based) to process
 */
function mediumRateRows(rowsToProcess) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();
    
    if (!activeSheet) {
      throw new Error('No active sheet');
    }
    
    assertActiveHistSheet();
    
    const expectedHeader = resolveExpectedHeader_(activeSheet);
    if (expectedHeader.length > 0 && typeof validateHeader === 'function') {
      const validationResult = validateHeader(activeSheet, expectedHeader);
      if (!validationResult.valid) {
        throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
      }
    }
    
    const header = readHeader(activeSheet);
    
    const statusColIndex = header.indexOf('Status');
    const jobRateDescColIndex = header.indexOf('JobRateDesc');
    const jobRateDttmColIndex = header.indexOf('JobRateDttm');
    const ratedModelNameColIndex = header.indexOf('RatedModelName');
    const jobTop3StackColIndex = header.indexOf('JobTop3Stack');
    const jobTop3WantColIndex = header.indexOf('JobTop3Want');
    const jobWorkModeColIndex = header.indexOf('JobWorkMode');
    const jobTitleColIndex = header.indexOf('JobTitle');
    const jobCompanyColIndex = header.indexOf('JobCompany');
    const jobLocationColIndex = header.indexOf('JobLocation');
    const jobModalityColIndex = header.indexOf('JobModality');
    const jobSalaryColIndex = header.indexOf('JobSalary');
    const jobTagsColIndex = header.indexOf('JobTags');
    const jobDescriptionColIndex = header.indexOf('JobDescription');
    const jobUrlColIndex = header.indexOf('JobUrl');
    
    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }
    
    const cv = (typeof getCV === 'function') ? getCV() : String(getSettingValueWithFallback_('CV', '') || '');
    const goal = (typeof getGoal === 'function') ? getGoal() : String(getSettingValueWithFallback_('Goal', '') || '');
    const promptTemplate = (typeof getPromptMediumRate === 'function')
      ? getPromptMediumRate()
      : String(getSettingValueWithFallback_('PromptMediumRate', '') || '');
    const models = getModelsFallbackListSafe_();
    const retryAttempts = getRetryPolicyAttemptsSafe_();
    const retrySleepSeconds = getRetryPolicySleepSecondsSafe_();
    const retryBackoffMultiplier = getRetryPolicyBackoffMultiplierSafe_();
    
    if (!promptTemplate) {
      throw new Error('PromptMediumRate setting not found');
    }
    if (models.length === 0) {
      throw new Error('ModelsFallbackList is empty');
    }
    if (jobTop3StackColIndex === -1 || jobTop3WantColIndex === -1 || jobWorkModeColIndex === -1) {
      throw new Error('Missing columns: JobTop3Stack, JobTop3Want, JobWorkMode');
    }
    
    const retryConfig = {
      attempts: retryAttempts,
      sleepSeconds: retrySleepSeconds,
      backoffMultiplier: retryBackoffMultiplier
    };
    
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    mediumRateStatus.totalRows = rowsToProcess.length;
    
    for (let i = 0; i < rowsToProcess.length; i++) {
      const rowNum = rowsToProcess[i];
      mediumRateStatus.currentRow = i + 1;
      
      try {
        updateMediumRateStatus(`Processing row ${i + 1}/${rowsToProcess.length} (sheet row ${rowNum})...`);
        
        const rowRange = activeSheet.getRange(rowNum, 1, 1, header.length);
        const rowValues = rowRange.getValues()[0];
        const status = String(rowValues[statusColIndex] || '').trim();
        
        if (status !== '2MBrate') {
          updateMediumRateStatus(`Row ${rowNum}: Skipped (Status=${status}, expected 2MBrate)`);
          skippedCount++;
          continue;
        }
        
        const jobTitle = jobTitleColIndex !== -1 ? String(rowValues[jobTitleColIndex] || '') : 'Untitled';
        const jobData = {
          JobTitle: jobTitle,
          JobCompany: jobCompanyColIndex !== -1 ? String(rowValues[jobCompanyColIndex] || '') : '',
          JobLocation: jobLocationColIndex !== -1 ? String(rowValues[jobLocationColIndex] || '') : '',
          JobModality: jobModalityColIndex !== -1 ? String(rowValues[jobModalityColIndex] || '') : '',
          JobSalary: jobSalaryColIndex !== -1 ? String(rowValues[jobSalaryColIndex] || '') : '',
          JobTags: jobTagsColIndex !== -1 ? String(rowValues[jobTagsColIndex] || '') : '',
          JobDescription: jobDescriptionColIndex !== -1 ? String(rowValues[jobDescriptionColIndex] || '') : '',
          JobUrl: jobUrlColIndex !== -1 ? String(rowValues[jobUrlColIndex] || '') : ''
        };
        
        const prompt = buildPrompt(cv, goal, jobData, promptTemplate);
        
        updateMediumRateStatus(`Row ${rowNum}: Calling LLM (${models.length} models, ${retryConfig.attempts} retries)...`);
        
        const llmResult = callLLMWithFallback(prompt, models, retryConfig, rowNum, {
          status: mediumRateStatus,
          updateStatus: updateMediumRateStatus
        });
        
        if (llmResult.success) {
          updateMediumRateStatus(`Row ${rowNum}: LLM responded (model: ${llmResult.model}), parsing...`);
          
          const parsed = parseMediumRateResponse(llmResult.response, llmResult.model);
          
          if (parsed.success) {
            updateMediumRateStatus(`Row ${rowNum}: Parsed successfully, updating extraction fields...`);
            
            const now = new Date();
            
            activeSheet.getRange(rowNum, jobTop3StackColIndex + 1).setValue(parsed.jobTop3Stack.join(' | '));
            activeSheet.getRange(rowNum, jobTop3WantColIndex + 1).setValue(parsed.jobTop3Want.join(' | '));
            activeSheet.getRange(rowNum, jobWorkModeColIndex + 1).setValue(parsed.jobWorkMode);
            if (jobRateDttmColIndex !== -1) {
              activeSheet.getRange(rowNum, jobRateDttmColIndex + 1).setValue(now);
            }
            if (ratedModelNameColIndex !== -1) {
              activeSheet.getRange(rowNum, ratedModelNameColIndex + 1).setValue(parsed.modelName);
            }
            
            activeSheet.getRange(rowNum, statusColIndex + 1).setValue('2MCRate');
            SpreadsheetApp.flush();
            
            updateMediumRateStatus(`Row ${rowNum}: Completed (Status: 2MCRate)`);
            processedCount++;
          } else {
            updateMediumRateStatus(`Row ${rowNum}: Parse failed - ${parsed.error}`);
            if (jobRateDescColIndex !== -1) {
              activeSheet.getRange(rowNum, jobRateDescColIndex + 1)
                .setValue('Error parsing LLM response: ' + parsed.error);
            }
            if (ratedModelNameColIndex !== -1) {
              activeSheet.getRange(rowNum, ratedModelNameColIndex + 1).setValue('FAILED_PARSE');
            }
            errorCount++;
          }
        } else {
          const errorMsg = 'Error calling LLM: ' + llmResult.error;
          updateMediumRateStatus(`Row ${rowNum}: LLM call failed - ${llmResult.error}`);
          Logger.log(`[MediumRate] Full LLM error for row ${rowNum}: ${JSON.stringify(llmResult)}`);
          
          if (jobRateDescColIndex !== -1) {
            const errorText = errorMsg.length > 50000 ? errorMsg.substring(0, 50000) + '... (truncated)' : errorMsg;
            activeSheet.getRange(rowNum, jobRateDescColIndex + 1).setValue(errorText);
          }
          if (ratedModelNameColIndex !== -1) {
            activeSheet.getRange(rowNum, ratedModelNameColIndex + 1).setValue('FAILED_ALL');
          }
          errorCount++;
        }
        
      } catch (error) {
        errorCount++;
        const jobRateDescColIndex = header.indexOf('JobRateDesc');
        if (jobRateDescColIndex !== -1) {
          activeSheet.getRange(rowNum, jobRateDescColIndex + 1).setValue('Error: ' + error.toString());
        }
      }
    }

    if (activeSheet.getName() === 'NewJobs' && typeof recalcDataFunnelDerivedCounters === 'function') {
      try {
        recalcDataFunnelDerivedCounters();
      } catch (funnelError) {
        Logger.log('[MediumRate] DataFunnel recalc failed: ' + funnelError.toString());
      }
    }
    
    const message = 'Medium BRate completed:\n' +
                   'Processed: ' + processedCount + '\n' +
                   'Skipped (not 2MBrate): ' + skippedCount + '\n' +
                   'Errors: ' + errorCount;
    uiAlertNonBlocking_('Medium BRate', message);
    
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Medium CRate: selected range (StackNegative/CompanyNegative/WorkMode/Age check)
 */
function mediumBRateSelectedRange() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();

    if (!activeSheet) {
      throw new Error('No active sheet');
    }

    assertActiveHistSheet();

    const expectedHeader = resolveExpectedHeader_(activeSheet);
    if (expectedHeader.length > 0 && typeof validateHeader === 'function') {
      const validationResult = validateHeader(activeSheet, expectedHeader);
      if (!validationResult.valid) {
        throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
      }
    }

    const range = activeSheet.getActiveRange();
    if (!range) {
      uiAlertNonBlocking_('Info', 'Select rows first');
      return;
    }

    const startRow = range.getRow();
    const endRow = startRow + range.getNumRows() - 1;
    if (endRow < 2) {
      uiAlertNonBlocking_('Info', 'Selected range has no data rows');
      return;
    }

    const rowsToProcess = [];
    for (let row = Math.max(2, startRow); row <= endRow; row++) {
      rowsToProcess.push(row);
    }

    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No rows to process');
      return;
    }

    mediumBRateRows(rowsToProcess);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Medium CRate: all rows with Status=2MCRate
 */
function mediumBRateAll2MBrate() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();

    if (!activeSheet) {
      throw new Error('No active sheet');
    }

    assertActiveHistSheet();

    const expectedHeader = resolveExpectedHeader_(activeSheet);
    if (expectedHeader.length > 0 && typeof validateHeader === 'function') {
      const validationResult = validateHeader(activeSheet, expectedHeader);
      if (!validationResult.valid) {
        throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
      }
    }

    const header = readHeader(activeSheet);
    const statusColIndex = header.indexOf('Status');
    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }

    const lastRow = activeSheet.getLastRow();
    if (lastRow < 2) {
      uiAlertNonBlocking_('Info', 'No data rows found');
      return;
    }

    const dataRange = activeSheet.getRange(2, 1, lastRow - 1, header.length);
    const dataValues = dataRange.getValues();

    const rowsToProcess = [];
    for (let i = 0; i < dataValues.length; i++) {
      const status = String(dataValues[i][statusColIndex] || '').trim();
      if (status === '2MCRate') {
        rowsToProcess.push(i + 2);
      }
    }

    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No rows found with Status=2MCRate');
      return;
    }

    mediumBRateRows(rowsToProcess);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

function normalizeStackText_(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9+#.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitStackTokens_(value) {
  const normalized = normalizeStackText_(value);
  if (!normalized) {
    return [];
  }
  return normalized.split(' ').filter(function(token) {
    return token.length > 0;
  });
}

function compactStackText_(value) {
  return normalizeStackText_(value).replace(/[^A-Z0-9+#.\-]+/g, '');
}

function stackItemMatchesNegative_(stackItem, negativeTerm) {
  const stackNormalized = normalizeStackText_(stackItem);
  const negativeNormalized = normalizeStackText_(negativeTerm);
  if (!stackNormalized || !negativeNormalized) {
    return false;
  }

  const stackTokens = splitStackTokens_(stackNormalized);
  const negativeTokens = splitStackTokens_(negativeNormalized);
  if (stackTokens.length === 0 || negativeTokens.length === 0) {
    return false;
  }

  // Short negatives like "R" must match as whole token to avoid false positives.
  if (negativeTokens.length === 1) {
    const token = negativeTokens[0];
    if (stackTokens.indexOf(token) !== -1) {
      return true;
    }
    // Handle hidden separators in stack item: e.g. "G o" should match "go".
    if (token.length <= 3) {
      const stackCompact = compactStackText_(stackItem);
      const negativeCompact = compactStackText_(negativeTerm);
      if (stackCompact && (stackCompact === token || stackCompact === negativeCompact)) {
        return true;
      }
    }
    return false;
  }

  // Multi-word negatives are matched as normalized phrase.
  return stackNormalized.indexOf(negativeNormalized) !== -1;
}

function findNegativeStackHit_(stackItems, negativeList) {
  for (let s = 0; s < stackItems.length; s++) {
    const stackItem = stackItems[s];
    for (let n = 0; n < negativeList.length; n++) {
      const negativeTerm = negativeList[n];
      if (stackItemMatchesNegative_(stackItem, negativeTerm)) {
        return {
          hit: true,
          stackItem: stackItem,
          negativeTerm: negativeTerm
        };
      }
    }
  }
  return {
    hit: false,
    stackItem: '',
    negativeTerm: ''
  };
}

/**
 * Checks if JobPostedDttm matches delete-age rules:
 * 1) contains "ago" and "year"
 * 2) contains "ago" and "months"
 * 3) contains "ago" and "weeks" with number 3..9
 * Also supports abbreviations (yr/mo/wk) and absolute dates.
 * @param {string} value
 * @return {{hit: boolean, rule: string, raw: string}}
 */
function checkPostedAgeDeleteRule_(value) {
  const raw = String(value || '').trim();
  let normalized = raw.toUpperCase();
  normalized = normalized
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = normalized.replace(/[^A-Z0-9]/g, '');
  if (!normalized && !compact) {
    return { hit: false, rule: '', raw: raw };
  }

  const hasAgo = normalized.indexOf('AGO') !== -1 || compact.indexOf('AGO') !== -1;
  const hasYears = /\bYEARS?\b/.test(normalized) || /\bYRS?\b/.test(normalized) || /YEARS?/.test(compact) || /YRS?/.test(compact);
  const hasMonths = /\bMONTHS?\b/.test(normalized) || /\bMOS?\b/.test(normalized) || /MONTHS?/.test(compact) || /MOS?/.test(compact);
  const hasWeeks = /\bWEEKS?\b/.test(normalized) || /\bWKS?\b/.test(normalized) || /\bWK\b/.test(normalized) || /WEEKS?/.test(compact) || /WKS?/.test(compact);

  if (hasAgo && hasYears) {
    return { hit: true, rule: 'ago+year', raw: raw };
  }
  if (hasAgo && hasMonths) {
    return { hit: true, rule: 'ago+months', raw: raw };
  }
  if (hasAgo && hasWeeks) {
    let weeks = NaN;
    const weekMatch = normalized.match(/(\d+)\s*(?:WEEKS?|WKS?|WK)\b/);
    if (weekMatch && weekMatch[1]) {
      weeks = parseInt(weekMatch[1], 10);
    } else {
      const compactWeekMatch = compact.match(/(\d+)(?:WEEKS?|WKS?|WK)(?:AGO)?/);
      if (compactWeekMatch && compactWeekMatch[1]) {
        weeks = parseInt(compactWeekMatch[1], 10);
      }
    }
    if (!isNaN(weeks) && weeks >= 3 && weeks <= 9) {
      return { hit: true, rule: 'ago+weeks(3-9)', raw: raw };
    }
  }

  // Fallback for absolute date values (Date object or parseable date string).
  let dateObj = null;
  if (value instanceof Date) {
    dateObj = value;
  } else if (typeof value === 'number') {
    const byNumber = new Date(value);
    if (!isNaN(byNumber.getTime())) {
      dateObj = byNumber;
    }
  } else if (raw) {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      dateObj = parsed;
    }
  }

  if (dateObj && !isNaN(dateObj.getTime())) {
    const ageMs = new Date().getTime() - dateObj.getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    if (ageDays >= 365) {
      return { hit: true, rule: 'absolute>=1y', raw: raw };
    }
    if (ageDays >= 30) {
      return { hit: true, rule: 'absolute>=1m', raw: raw };
    }
    if (ageDays >= 21 && ageDays <= 63) {
      return { hit: true, rule: 'absolute=weeks(3-9)', raw: raw };
    }
  }

  return { hit: false, rule: '', raw: raw };
}

function normalizeCompanyText_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u00A0]/g, ' ')
    .replace(/[^\p{L}\p{N}\s&+.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findNegativeCompanyHit_(jobCompany, negativeCompanies) {
  const companyNormalized = normalizeCompanyText_(jobCompany);
  if (!companyNormalized || !Array.isArray(negativeCompanies) || negativeCompanies.length === 0) {
    return { hit: false, company: '', negativeTerm: '' };
  }

  for (let i = 0; i < negativeCompanies.length; i++) {
    const negativeTerm = normalizeCompanyText_(negativeCompanies[i]);
    if (!negativeTerm) continue;

    if (companyNormalized === negativeTerm) {
      return { hit: true, company: jobCompany, negativeTerm: negativeCompanies[i] };
    }

    // Allow partial match only for sufficiently long patterns to reduce false positives.
    if (negativeTerm.length >= 3 && companyNormalized.indexOf(negativeTerm) !== -1) {
      return { hit: true, company: jobCompany, negativeTerm: negativeCompanies[i] };
    }
  }

  return { hit: false, company: '', negativeTerm: '' };
}

/**
 * Medium CRate: checks JobTop3Stack against StackNegative, JobCompany against CompanyNegative,
 * JobWorkMode and JobPostedDttm.
 * Sets Status=2Delete if StackNegative hit OR CompanyNegative hit OR JobWorkMode is Onsite/Hybrid OR JobPostedDttm rule matched,
 * otherwise Status=2LRate.
 * @param {Array<number>} rowsToProcess
 */
function mediumBRateRows(rowsToProcess) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();

    if (!activeSheet) {
      throw new Error('No active sheet');
    }

    assertActiveHistSheet();

    const expectedHeader = resolveExpectedHeader_(activeSheet);
    if (expectedHeader.length > 0 && typeof validateHeader === 'function') {
      const validationResult = validateHeader(activeSheet, expectedHeader);
      if (!validationResult.valid) {
        throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
      }
    }

    const header = readHeader(activeSheet);
    const statusColIndex = header.indexOf('Status');
    const jobTop3StackColIndex = header.indexOf('JobTop3Stack');
    const jobCompanyColIndex = header.indexOf('JobCompany');
    const jobWorkModeColIndex = header.indexOf('JobWorkMode');
    const jobPostedDttmColIndex = header.indexOf('JobPostedDttm');
    const jobRateDescColIndex = header.indexOf('JobRateDesc');
    if (statusColIndex === -1 || jobTop3StackColIndex === -1 || jobWorkModeColIndex === -1 || jobPostedDttmColIndex === -1) {
      throw new Error('Missing columns: Status, JobTop3Stack, JobWorkMode, JobPostedDttm');
    }

    const negativeList = getStackNegativeListSafe_();
    const companyNegativeList = getCompanyNegativeListSafe_();
    if (companyNegativeList.length > 0 && jobCompanyColIndex === -1) {
      throw new Error('Missing column: JobCompany (required when CompanyNegative is configured)');
    }

    let deletedCount = 0;
    let continueCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < rowsToProcess.length; i++) {
      const rowNum = rowsToProcess[i];
      const rowValues = activeSheet.getRange(rowNum, 1, 1, header.length).getValues()[0];
      const status = String(rowValues[statusColIndex] || '').trim();

      if (status !== '2MCRate') {
        skippedCount++;
        continue;
      }

      const stackRaw = String(rowValues[jobTop3StackColIndex] || '');
      const stackItems = stackRaw
        .split('|')
        .map(item => String(item || '').trim())
        .filter(item => item.length > 0);

      const hitInfo = negativeList.length > 0
        ? findNegativeStackHit_(stackItems, negativeList)
        : { hit: false, stackItem: '', negativeTerm: '' };
      const jobCompany = jobCompanyColIndex !== -1 ? String(rowValues[jobCompanyColIndex] || '') : '';
      const companyHitInfo = companyNegativeList.length > 0
        ? findNegativeCompanyHit_(jobCompany, companyNegativeList)
        : { hit: false, company: '', negativeTerm: '' };
      const workMode = normalizeWorkMode_(rowValues[jobWorkModeColIndex]);
      const workModeDelete = workMode === 'Onsite' || workMode === 'Hybrid';
      const postedAgeHit = checkPostedAgeDeleteRule_(rowValues[jobPostedDttmColIndex]);
      const reasons = [];
      if (hitInfo.hit) {
        reasons.push('StackNegative hit "' + hitInfo.negativeTerm + '" in "' + hitInfo.stackItem + '"');
      }
      if (companyHitInfo.hit) {
        reasons.push('CompanyNegative hit "' + companyHitInfo.negativeTerm + '" in "' + jobCompany + '"');
      }
      if (workModeDelete) {
        reasons.push('JobWorkMode=' + workMode);
      }
      if (postedAgeHit.hit) {
        reasons.push('JobPostedDttm rule ' + postedAgeHit.rule + ' in "' + postedAgeHit.raw + '"');
      }

      if (reasons.length > 0) {
        activeSheet.getRange(rowNum, statusColIndex + 1).setValue('2Delete');
        if (jobRateDescColIndex !== -1) {
          activeSheet.getRange(rowNum, jobRateDescColIndex + 1).setValue('Medium CRate: ' + reasons.join('; '));
        }
        deletedCount++;
      } else {
        activeSheet.getRange(rowNum, statusColIndex + 1).setValue('2LRate');
        if (jobRateDescColIndex !== -1) {
          activeSheet.getRange(rowNum, jobRateDescColIndex + 1)
            .setValue('Medium CRate: no StackNegative/CompanyNegative hit; JobWorkMode=' + workMode);
        }
        continueCount++;
      }
    }

    if (activeSheet.getName() === 'NewJobs' && typeof recalcDataFunnelDerivedCounters === 'function') {
      try {
        recalcDataFunnelDerivedCounters();
      } catch (funnelError) {
        Logger.log('[MediumCRate] DataFunnel recalc failed: ' + funnelError.toString());
      }
    }

    SpreadsheetApp.flush();
    uiAlertNonBlocking_(
      'Medium CRate',
      'Updated to 2Delete: ' + deletedCount + '\nUpdated to 2LRate: ' + continueCount + '\nSkipped: ' + skippedCount);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

function normalizeMCRateGroupKeyPart_(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getMCRateLocationPriority_(locationValue) {
  const location = String(locationValue || '').toLowerCase();
  if (location.indexOf('uruguay') !== -1) return 3;
  if (location.indexOf('montevideo') !== -1) return 2;
  if (location.indexOf('latin americ') !== -1) return 1;
  return 0;
}

function pickMCRateWinner_(items) {
  let winner = null;
  for (let i = 0; i < items.length; i++) {
    const candidate = items[i];
    if (!winner) {
      winner = candidate;
      continue;
    }
    if (candidate.priority > winner.priority) {
      winner = candidate;
      continue;
    }
    if (candidate.priority === winner.priority && candidate.rowNum < winner.rowNum) {
      winner = candidate;
    }
  }
  return winner;
}

/**
 * Medium ARate: groups rows with Status=2MARate by JobCompany+JobTitle
 * and keeps exactly one row per group as 2MBrate.
 * Winner priority: Uruguay -> Montevideo -> Latin Americ -> top row.
 */
function mediumCRateAll2MCRate() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();

    if (!activeSheet) {
      throw new Error('No active sheet');
    }

    assertActiveHistSheet();

    const expectedHeader = resolveExpectedHeader_(activeSheet);
    if (expectedHeader.length > 0 && typeof validateHeader === 'function') {
      const validationResult = validateHeader(activeSheet, expectedHeader);
      if (!validationResult.valid) {
        throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
      }
    }

    const header = readHeader(activeSheet);
    const statusColIndex = header.indexOf('Status');
    const jobCompanyColIndex = header.indexOf('JobCompany');
    const jobTitleColIndex = header.indexOf('JobTitle');
    const jobLocationColIndex = header.indexOf('JobLocation');
    const jobRateDescColIndex = header.indexOf('JobRateDesc');
    if (statusColIndex === -1 || jobCompanyColIndex === -1 || jobTitleColIndex === -1 || jobLocationColIndex === -1) {
      throw new Error('Missing columns: Status, JobCompany, JobTitle, JobLocation');
    }

    const lastRow = activeSheet.getLastRow();
    if (lastRow < 2) {
      uiAlertNonBlocking_('Info', 'No data rows found');
      return;
    }

    const dataValues = activeSheet.getRange(2, 1, lastRow - 1, header.length).getValues();
    const rowsToProcess = [];
    for (let i = 0; i < dataValues.length; i++) {
      const status = String(dataValues[i][statusColIndex] || '').trim();
      if (status === '2MARate' || status === '2Mrate') {
        rowsToProcess.push(i + 2);
      }
    }

    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No rows found with Status=2MARate');
      return;
    }

    const groups = {};
    let skippedCount = 0;

    for (let i = 0; i < rowsToProcess.length; i++) {
      const rowNum = rowsToProcess[i];
      const rowValues = dataValues[rowNum - 2];
      const company = String(rowValues[jobCompanyColIndex] || '').trim();
      const title = String(rowValues[jobTitleColIndex] || '').trim();
      if (!company || !title) {
        skippedCount++;
        continue;
      }

      const key = normalizeMCRateGroupKeyPart_(company) + '|' + normalizeMCRateGroupKeyPart_(title);
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push({
        rowNum: rowNum,
        location: String(rowValues[jobLocationColIndex] || ''),
        rateDesc: jobRateDescColIndex !== -1 ? String(rowValues[jobRateDescColIndex] || '') : ''
      });
    }

    let toMBRateCount = 0;
    let deletedCount = 0;

    const groupKeys = Object.keys(groups);
    for (let g = 0; g < groupKeys.length; g++) {
      const key = groupKeys[g];
      const items = groups[key];
      for (let i = 0; i < items.length; i++) {
        items[i].priority = getMCRateLocationPriority_(items[i].location);
      }
      const winner = pickMCRateWinner_(items);
      if (!winner) {
        continue;
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.rowNum === winner.rowNum) {
          activeSheet.getRange(item.rowNum, statusColIndex + 1).setValue('2MBrate');
          toMBRateCount++;
        } else {
          activeSheet.getRange(item.rowNum, statusColIndex + 1).setValue('2Delete');
          if (jobRateDescColIndex !== -1) {
            const existingDesc = String(item.rateDesc || '').trim();
            const nextDesc = existingDesc ? (existingDesc + '; Location DBL') : 'Location DBL';
            activeSheet.getRange(item.rowNum, jobRateDescColIndex + 1).setValue(nextDesc);
          }
          deletedCount++;
        }
      }
    }

    if (activeSheet.getName() === 'NewJobs' && typeof recalcDataFunnelDerivedCounters === 'function') {
      try {
        recalcDataFunnelDerivedCounters();
      } catch (funnelError) {
        Logger.log('[MediumARate] DataFunnel recalc failed: ' + funnelError.toString());
      }
    }

    SpreadsheetApp.flush();
    uiAlertNonBlocking_(
      'Medium ARate',
      'Updated to 2Delete: ' + deletedCount + '\nUpdated to 2MBrate: ' + toMBRateCount + '\nSkipped: ' + skippedCount);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Builds prompt for Medium Rate with JobRateShortDesc
 * @param {string} cv - CV text
 * @param {string} goal - Goal text
 * @param {string} jobRateShortDesc - Short job description
 * @param {string} promptTemplate - Template with placeholders
 * @return {string} Final prompt
 */
function buildMediumRatePrompt(cv, goal, jobRateShortDesc, promptTemplate) {
  let prompt = promptTemplate;
  prompt = prompt.replace(/{CV}/g, cv || '');
  prompt = prompt.replace(/{Goal}/g, goal || '');
  prompt = prompt.replace(/{JobRateShortDesc}/g, jobRateShortDesc || '');
  return prompt;
}

function normalizeTop3Field_(value) {
  let arr = [];
  if (Array.isArray(value)) {
    arr = value.map(function(item) { return String(item || '').trim(); });
  } else if (typeof value === 'string') {
    const text = value.trim();
    arr = text ? [text] : [];
  }
  arr = arr.filter(function(item) { return item.length > 0; });
  while (arr.length < 3) {
    arr.push('Unknown');
  }
  if (arr.length > 3) {
    arr = arr.slice(0, 3);
  }
  return arr;
}

function normalizeWorkMode_(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'remote') return 'Remote';
  if (raw === 'onsite') return 'Onsite';
  if (raw === 'hybrid') return 'Hybrid';
  return 'Unknown';
}

function parseMediumRateResponse(responseText, modelName) {
  try {
    if (!responseText || typeof responseText !== 'string') {
      return {
        success: false,
        jobTop3Stack: ['Unknown', 'Unknown', 'Unknown'],
        jobTop3Want: ['Unknown', 'Unknown', 'Unknown'],
        jobWorkMode: 'Unknown',
        modelName: modelName || '',
        error: 'Empty or invalid response'
      };
    }

    let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleanedText.indexOf('{');
    const lastBrace = cleanedText.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return {
        success: false,
        jobTop3Stack: ['Unknown', 'Unknown', 'Unknown'],
        jobTop3Want: ['Unknown', 'Unknown', 'Unknown'],
        jobWorkMode: 'Unknown',
        modelName: modelName || '',
        error: 'No JSON object found'
      };
    }

    const jsonText = cleanedText.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonText);

    const top3Stack = normalizeTop3Field_(parsed.JobTop3Stack);
    const top3Want = normalizeTop3Field_(parsed.JobTop3Want);
    const workMode = normalizeWorkMode_(parsed.JobWorkMode);

    return {
      success: true,
      jobTop3Stack: top3Stack,
      jobTop3Want: top3Want,
      jobWorkMode: workMode,
      modelName: modelName || '',
      error: null
    };
  } catch (error) {
    return {
      success: false,
      jobTop3Stack: ['Unknown', 'Unknown', 'Unknown'],
      jobTop3Want: ['Unknown', 'Unknown', 'Unknown'],
      jobWorkMode: 'Unknown',
      modelName: modelName || '',
      error: 'Parse error: ' + error.toString()
    };
  }
}
