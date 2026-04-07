/**
 * Stage 7: Simple Rate (Title Regex) - Sets statuses 2Delete/2MARate based on JobTitle deny regex
 */

// Global status tracking
var simpleRateStatus = {
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
function updateSimpleRateStatus(message) {
  simpleRateStatus.currentStep = message;
  Logger.log('[SimpleRate] ' + message);
  
  // Show toast notification (non-blocking)
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Simple Rate Status', 3);
  } catch (e) {
    // Ignore toast errors
  }
  
  SpreadsheetApp.flush(); // Force spreadsheet update
}

/**
 * Simple Rate: 1 row from cursor
 */
function simpleRate1Row() {
  simpleRateFromCursor(1);
}

/**
 * Simple Rate: 5 rows from cursor
 */
function simpleRate5Rows() {
  simpleRateFromCursor(5);
}

/**
 * Simple Rate: 10 rows from cursor
 */
function simpleRate10Rows() {
  simpleRateFromCursor(10);
}

/**
 * Simple Rate: selected range
 */
function simpleRateSelectedRange() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();
    
    if (!activeSheet) {
      throw new Error('No active sheet');
    }
    
    // Verify active sheet is Hist
    assertActiveHistSheet();
    
    // Get selected range
    const selectedRange = ss.getActiveRange();
    if (!selectedRange) {
      uiAlertNonBlocking_('Error', 'No range selected');
      return;
    }
    
    const startRow = selectedRange.getRow();
    const endRow = selectedRange.getLastRow();
    const numRows = endRow - startRow + 1;
    
    if (startRow < 2) {
      uiAlertNonBlocking_('Error', 'Selected range must start from row 2 or below (row 1 is header)');
      return;
    }
    
    // Get rows to process
    const rowsToProcess = [];
    for (let row = startRow; row <= endRow; row++) {
      rowsToProcess.push(row);
    }
    
    simpleRateRows(rowsToProcess);
    
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Lists available models from Google AI Studio API
 * Useful for debugging which models are available
 */
function listAvailableModels() {
  try {
    const properties = PropertiesService.getScriptProperties();
    const apiKey = properties.getProperty('LLM_API_KEY') || properties.getProperty('GEMINI_API_KEY');
    
    if (!apiKey) {
      uiAlertNonBlocking_('Error', 'LLM_API_KEY or GEMINI_API_KEY not found in Script Properties');
      return;
    }
    
    const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
    const response = UrlFetchApp.fetch(url);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode !== 200) {
      uiAlertNonBlocking_('Error', 'API returned code ' + responseCode + ': ' + responseText.substring(0, 200));
      return;
    }
    
    const responseJson = JSON.parse(responseText);
    let modelsList = 'Available models:\n\n';
    
    if (responseJson.models && responseJson.models.length > 0) {
      for (let i = 0; i < responseJson.models.length; i++) {
        const model = responseJson.models[i];
        const name = model.name || model.displayName || 'Unknown';
        const supportedMethods = model.supportedGenerationMethods || [];
        if (supportedMethods.indexOf('generateContent') !== -1) {
          modelsList += name + '\n';
        }
      }
    } else {
      modelsList = 'No models found or unexpected response format';
    }
    
    uiAlertNonBlocking_('Available Models', modelsList);
    Logger.log('[SimpleRate] Available models: ' + JSON.stringify(responseJson, null, 2));
    
  } catch (error) {
    uiAlertNonBlocking_('Error', 'Failed to list models: ' + error.toString());
  }
}

/**
 * Simple Rate: re-rate weak model
 */
function simpleRateRerateWeak() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();
    
    if (!activeSheet) {
      throw new Error('No active sheet');
    }
    
    // Verify active sheet is Hist
    assertActiveHistSheet();
    
    // Get expected header
    const expectedHeader = getExpectedHeader();
    const validationResult = validateHeader(activeSheet, expectedHeader);
    if (!validationResult.valid) {
      throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
    }
    
    const header = readHeader(activeSheet);
    const statusColIndex = header.indexOf('Status');
    const ratedModelColIndex = header.indexOf('RatedModelName');
    
    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }
    if (ratedModelColIndex === -1) {
      throw new Error('RatedModelName column missing');
    }
    
    // Get weak models list
    const weakModels = getWeakModelsList();
    if (weakModels.length === 0) {
      uiAlertNonBlocking_('Info', 'WeakModelsList is empty. Nothing to re-rate.');
      return;
    }
    
    // Find rows with Status=Loaded and RatedModelName in weak list
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
      const ratedModel = String(dataValues[i][ratedModelColIndex] || '').trim();
      
      if (status === 'Loaded' && weakModels.indexOf(ratedModel) !== -1) {
        rowsToProcess.push(i + 2); // Row number (1-based, data starts at row 2)
      }
    }
    
    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No rows found with Status=Loaded and RatedModelName in WeakModelsList');
      return;
    }
    
    simpleRateRows(rowsToProcess);
    
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Simple Rate: all Loaded rows that are not yet rated
 */
function simpleRateAllLoadedUnrated() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();

    if (!activeSheet) {
      throw new Error('No active sheet');
    }

    // Verify active sheet is Hist
    assertActiveHistSheet();

    // Get expected header
    const expectedHeader = getExpectedHeader();
    const validationResult = validateHeader(activeSheet, expectedHeader);
    if (!validationResult.valid) {
      throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
    }

    const header = readHeader(activeSheet);
    const statusColIndex = header.indexOf('Status');
    const jobRateNumColIndex = header.indexOf('JobRateNum');
    const ratedModelColIndex = header.indexOf('RatedModelName');

    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }
    if (jobRateNumColIndex === -1 && ratedModelColIndex === -1) {
      throw new Error('JobRateNum or RatedModelName column missing');
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
      if (status !== 'Loaded') continue;

      let hasRate = false;
      if (jobRateNumColIndex !== -1) {
        const rateVal = dataValues[i][jobRateNumColIndex];
        if (rateVal !== '' && rateVal !== null && rateVal !== undefined) {
          hasRate = String(rateVal).trim() !== '';
        }
      }
      if (!hasRate && ratedModelColIndex !== -1) {
        const modelVal = dataValues[i][ratedModelColIndex];
        if (modelVal !== '' && modelVal !== null && modelVal !== undefined) {
          hasRate = String(modelVal).trim() !== '';
        }
      }

      if (!hasRate) {
        rowsToProcess.push(i + 2); // data starts at row 2
      }
    }

    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No unrated Loaded rows found');
      return;
    }

    simpleRateRows(rowsToProcess);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Simple Rate: all Loaded rows that are not yet rated in NewJobs sheet
 */
function simpleRateAllLoadedUnratedNewJobs() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const newJobsSheet = ss.getSheetByName('NewJobs');
    if (!newJobsSheet) {
      uiAlertNonBlocking_('Error', 'NewJobs sheet not found');
      return;
    }

    const expectedHeader = getExpectedHeader();
    const validationResult = validateHeader(newJobsSheet, expectedHeader);
    if (!validationResult.valid) {
      throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
    }

    const header = readHeader(newJobsSheet);
    const statusColIndex = header.indexOf('Status');
    const jobRateNumColIndex = header.indexOf('JobRateNum');
    const ratedModelColIndex = header.indexOf('RatedModelName');

    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }
    if (jobRateNumColIndex === -1 && ratedModelColIndex === -1) {
      throw new Error('JobRateNum or RatedModelName column missing');
    }

    const lastRow = newJobsSheet.getLastRow();
    if (lastRow < 2) {
      uiAlertNonBlocking_('Info', 'No data rows found');
      return;
    }

    const dataRange = newJobsSheet.getRange(2, 1, lastRow - 1, header.length);
    const dataValues = dataRange.getValues();

    const rowsToProcess = [];
    for (let i = 0; i < dataValues.length; i++) {
      const status = String(dataValues[i][statusColIndex] || '').trim();
      if (status !== 'Loaded') continue;

      let hasRate = false;
      if (jobRateNumColIndex !== -1) {
        const rateVal = dataValues[i][jobRateNumColIndex];
        if (rateVal !== '' && rateVal !== null && rateVal !== undefined) {
          hasRate = String(rateVal).trim() !== '';
        }
      }
      if (!hasRate && ratedModelColIndex !== -1) {
        const modelVal = dataValues[i][ratedModelColIndex];
        if (modelVal !== '' && modelVal !== null && modelVal !== undefined) {
          hasRate = String(modelVal).trim() !== '';
        }
      }

      if (!hasRate) {
        rowsToProcess.push(i + 2);
      }
    }

    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No unrated Loaded rows found in NewJobs');
      return;
    }

    simpleRateRowsOnSheet(rowsToProcess, newJobsSheet);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Simple Rate: N rows from cursor
 */
function simpleRateFromCursor(numRows) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();
    
    if (!activeSheet) {
      throw new Error('No active sheet');
    }
    
    // Verify active sheet is Hist
    assertActiveHistSheet();
    
    // Get current cursor row
    const currentRow = getCurrentCursorRow();
    if (currentRow < 2) {
      uiAlertNonBlocking_('Error', 'Cursor must be on row 2 or below (row 1 is header)');
      return;
    }
    
    const lastRow = activeSheet.getLastRow();
    const endRow = Math.min(currentRow + numRows - 1, lastRow);
    
    // Get rows to process
    const rowsToProcess = [];
    for (let row = currentRow; row <= endRow; row++) {
      rowsToProcess.push(row);
    }
    
    if (rowsToProcess.length === 0) {
      uiAlertNonBlocking_('Info', 'No rows to process');
      return;
    }
    
    simpleRateRows(rowsToProcess);
    
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Gets the current cursor row (active cell row)
 * @return {number} Row number (1-based)
 */
function getCurrentCursorRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  if (!activeSheet) {
    throw new Error('No active sheet');
  }
  const activeCell = activeSheet.getActiveCell();
  return activeCell.getRow();
}

/**
 * Main function to rate rows
 * @param {Array<number>} rowsToProcess - Array of row numbers (1-based) to process
 */
function simpleRateRows(rowsToProcess) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = ss.getActiveSheet();
    
    if (!activeSheet) {
      throw new Error('No active sheet');
    }
    
    // Verify active sheet is Hist
    assertActiveHistSheet();
    
    // Get expected header
    const expectedHeader = getExpectedHeader();
    const validationResult = validateHeader(activeSheet, expectedHeader);
    if (!validationResult.valid) {
      throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
    }
    
    const header = readHeader(activeSheet);
    
    // Find required columns
    const statusColIndex = header.indexOf('Status');
    const jobTitleColIndex = header.indexOf('JobTitle');
    const jobCompanyColIndex = header.indexOf('JobCompany');
    const jobLocationColIndex = header.indexOf('JobLocation');
    const jobModalityColIndex = header.indexOf('JobModality');
    const jobSalaryColIndex = header.indexOf('JobSalary');
    const jobTagsColIndex = header.indexOf('JobTags');
    const jobDescriptionColIndex = header.indexOf('JobDescription');
    const jobUrlColIndex = header.indexOf('JobUrl');
    const jobRateNumColIndex = header.indexOf('JobRateNum');
    const jobRateDescColIndex = header.indexOf('JobRateDesc');
    const jobRateShortDescColIndex = header.indexOf('JobRateShortDesc');
    const jobRateDttmColIndex = header.indexOf('JobRateDttm');
    const ratedModelNameColIndex = header.indexOf('RatedModelName');
    
    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }
    
    // Get settings
    const regex = buildSimpleRateDenyRegex();
    if (!regex) {
      throw new Error('SimpleRateTitleDenyRegex setting not found');
    }
    
    // Process rows
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    simpleRateStatus.totalRows = rowsToProcess.length;
    
    for (let i = 0; i < rowsToProcess.length; i++) {
      const rowNum = rowsToProcess[i];
      simpleRateStatus.currentRow = i + 1;
      
      try {
        updateSimpleRateStatus(`Processing row ${i + 1}/${rowsToProcess.length} (sheet row ${rowNum})...`);
        
        // Read row data
        const rowRange = activeSheet.getRange(rowNum, 1, 1, header.length);
        const rowValues = rowRange.getValues()[0];
        const status = String(rowValues[statusColIndex] || '').trim();
        
        // Skip if not Loaded
        if (status !== 'Loaded') {
          updateSimpleRateStatus(`Row ${rowNum}: Skipped (Status=${status}, expected Loaded)`);
          skippedCount++;
          continue;
        }
        
        const jobTitle = jobTitleColIndex !== -1 ? String(rowValues[jobTitleColIndex] || '') : 'Untitled';
        updateSimpleRateStatus(`Row ${rowNum}: Checking title against deny regex...`);

        let isDenied = false;
        try {
          regex.lastIndex = 0;
          isDenied = regex.test(jobTitle);
        } catch (error) {
          throw new Error('Invalid SimpleRateTitleDenyRegex: ' + error.toString());
        }

        const now = new Date();
        if (jobRateNumColIndex !== -1) {
          activeSheet.getRange(rowNum, jobRateNumColIndex + 1).setValue(isDenied ? 0 : 5);
        }
        if (jobRateDescColIndex !== -1) {
          activeSheet.getRange(rowNum, jobRateDescColIndex + 1)
            .setValue(isDenied ? 'Title matched deny regex' : 'Title passed deny regex');
        }
        if (jobRateShortDescColIndex !== -1) {
          activeSheet.getRange(rowNum, jobRateShortDescColIndex + 1).setValue('');
        }
        if (jobRateDttmColIndex !== -1) {
          activeSheet.getRange(rowNum, jobRateDttmColIndex + 1).setValue(now);
        }
        if (ratedModelNameColIndex !== -1) {
          activeSheet.getRange(rowNum, ratedModelNameColIndex + 1).setValue('TitleRegex');
        }

        const newStatus = isDenied ? '2Delete' : '2MARate';
        activeSheet.getRange(rowNum, statusColIndex + 1).setValue(newStatus);
        SpreadsheetApp.flush();

        updateSimpleRateStatus(`Row ${rowNum}: Completed (Status: ${newStatus})`);
        processedCount++;
        
      } catch (error) {
        // Individual row error - log but continue
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
        Logger.log('[SimpleRate] DataFunnel recalc failed: ' + funnelError.toString());
      }
    }
    
    // Show summary
    const message = 'Simple Rate completed:\n' +
                   'Processed: ' + processedCount + '\n' +
                   'Skipped (not Loaded): ' + skippedCount + '\n' +
                   'Errors: ' + errorCount;
    uiAlertNonBlocking_('Simple Rate', message);
    
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Main function to rate rows on a specific sheet
 * @param {Array<number>} rowsToProcess - Array of row numbers (1-based) to process
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Target sheet
 */
function simpleRateRowsOnSheet(rowsToProcess, sheet) {
  try {
    if (!sheet) {
      throw new Error('No sheet provided');
    }

    const expectedHeader = getExpectedHeader();
    const validationResult = validateHeader(sheet, expectedHeader);
    if (!validationResult.valid) {
      throw new Error('Header validation failed: ' + validationResult.errors.join('; '));
    }

    const header = readHeader(sheet);

    const statusColIndex = header.indexOf('Status');
    const jobTitleColIndex = header.indexOf('JobTitle');
    const jobRateNumColIndex = header.indexOf('JobRateNum');
    const jobRateDescColIndex = header.indexOf('JobRateDesc');
    const jobRateShortDescColIndex = header.indexOf('JobRateShortDesc');
    const jobRateDttmColIndex = header.indexOf('JobRateDttm');
    const ratedModelNameColIndex = header.indexOf('RatedModelName');

    if (statusColIndex === -1) {
      throw new Error('Status column missing');
    }

    const regex = buildSimpleRateDenyRegex();
    if (!regex) {
      throw new Error('SimpleRateTitleDenyRegex setting not found');
    }

    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    simpleRateStatus.totalRows = rowsToProcess.length;

    for (let i = 0; i < rowsToProcess.length; i++) {
      const rowNum = rowsToProcess[i];
      simpleRateStatus.currentRow = i + 1;

      try {
        updateSimpleRateStatus(`Processing row ${i + 1}/${rowsToProcess.length} (sheet row ${rowNum})...`);

        const rowRange = sheet.getRange(rowNum, 1, 1, header.length);
        const rowValues = rowRange.getValues()[0];
        const status = String(rowValues[statusColIndex] || '').trim();

        if (status !== 'Loaded') {
          updateSimpleRateStatus(`Row ${rowNum}: Skipped (Status=${status}, expected Loaded)`);
          skippedCount++;
          continue;
        }

        const jobTitle = jobTitleColIndex !== -1 ? String(rowValues[jobTitleColIndex] || '') : 'Untitled';
        updateSimpleRateStatus(`Row ${rowNum}: Checking title against deny regex...`);

        let isDenied = false;
        try {
          regex.lastIndex = 0;
          isDenied = regex.test(jobTitle);
        } catch (error) {
          throw new Error('Invalid SimpleRateTitleDenyRegex: ' + error.toString());
        }

        const now = new Date();
        if (jobRateNumColIndex !== -1) {
          sheet.getRange(rowNum, jobRateNumColIndex + 1).setValue(isDenied ? 0 : 5);
        }
        if (jobRateDescColIndex !== -1) {
          sheet.getRange(rowNum, jobRateDescColIndex + 1)
            .setValue(isDenied ? 'Title matched deny regex' : 'Title passed deny regex');
        }
        if (jobRateShortDescColIndex !== -1) {
          sheet.getRange(rowNum, jobRateShortDescColIndex + 1).setValue('');
        }
        if (jobRateDttmColIndex !== -1) {
          sheet.getRange(rowNum, jobRateDttmColIndex + 1).setValue(now);
        }
        if (ratedModelNameColIndex !== -1) {
          sheet.getRange(rowNum, ratedModelNameColIndex + 1).setValue('TitleRegex');
        }

        const newStatus = isDenied ? '2Delete' : '2MARate';
        sheet.getRange(rowNum, statusColIndex + 1).setValue(newStatus);
        SpreadsheetApp.flush();

        updateSimpleRateStatus(`Row ${rowNum}: Completed (Status: ${newStatus})`);
        processedCount++;
      } catch (error) {
        errorCount++;
        const jobRateDescIndex = header.indexOf('JobRateDesc');
        if (jobRateDescIndex !== -1) {
          sheet.getRange(rowNum, jobRateDescIndex + 1).setValue('Error: ' + error.toString());
        }
      }
    }

    if (sheet.getName() === 'NewJobs' && typeof recalcDataFunnelDerivedCounters === 'function') {
      try {
        recalcDataFunnelDerivedCounters();
      } catch (funnelError) {
        Logger.log('[SimpleRate] DataFunnel recalc failed: ' + funnelError.toString());
      }
    }

    const message = 'Simple Rate completed:\n' +
                   'Processed: ' + processedCount + '\n' +
                   'Skipped (not Loaded): ' + skippedCount + '\n' +
                   'Errors: ' + errorCount;
    uiAlertNonBlocking_('Simple Rate', message);
  } catch (error) {
    uiAlertNonBlocking_('Error', 'An error occurred: ' + error.toString());
  }
}

/**
 * Builds deny regex from settings for Simple Rate title filter
 * @return {RegExp|null} Compiled regex
 */
function buildSimpleRateDenyRegex() {
  const raw = getSimpleRateTitleDenyRegex();
  if (!raw) return null;

  let pattern = String(raw).trim();
  pattern = pattern.replace(/[\r\n]+/g, '');
  if ((pattern.startsWith('"') && pattern.endsWith('"')) ||
      (pattern.startsWith("'") && pattern.endsWith("'"))) {
    pattern = pattern.slice(1, -1).trim();
  }
  let flags = '';
  const slashMatch = pattern.match(/^\/(.+)\/([a-z]*)$/i);
  if (slashMatch) {
    pattern = slashMatch[1];
    flags = slashMatch[2] || '';
  }

  pattern = pattern.trim();
  if (pattern.length === 0) {
    return null;
  }

  if (!flags.includes('i')) {
    flags += 'i';
  }
  flags = flags.replace(/g/g, '');

  return new RegExp(pattern, flags);
}

/**
 * Builds prompt from template with substitutions
 * @param {string} cv - CV text
 * @param {string} goal - Goal text
 * @param {Object} jobData - Job data object
 * @param {string} promptTemplate - Template with {CV}, {Goal}, {JobText} placeholders
 * @return {string} Final prompt
 */
function buildPrompt(cv, goal, jobData, promptTemplate) {
  // Build JobText from job data
  const jobTextParts = [];
  if (jobData.JobTitle) jobTextParts.push('Title: ' + jobData.JobTitle);
  if (jobData.JobCompany) jobTextParts.push('Company: ' + jobData.JobCompany);
  if (jobData.JobLocation) jobTextParts.push('Location: ' + jobData.JobLocation);
  if (jobData.JobModality) jobTextParts.push('Modality: ' + jobData.JobModality);
  if (jobData.JobSalary) jobTextParts.push('Salary: ' + jobData.JobSalary);
  if (jobData.JobTags) jobTextParts.push('Tags: ' + jobData.JobTags);
  if (jobData.JobDescription) jobTextParts.push('Description: ' + jobData.JobDescription);
  if (jobData.JobUrl) jobTextParts.push('URL: ' + jobData.JobUrl);
  
  const jobText = jobTextParts.join('\n');
  
  // Substitute placeholders
  let prompt = promptTemplate;
  prompt = prompt.replace(/{CV}/g, cv);
  prompt = prompt.replace(/{Goal}/g, goal);
  prompt = prompt.replace(/{JobText}/g, jobText);
  
  return prompt;
}

/**
 * Calls LLM with fallback and retry
 * @param {string} prompt - The prompt to send
 * @param {Array<string>} models - Array of model names to try (fallback order)
 * @param {Object} retryConfig - Retry configuration {attempts, sleepSeconds, backoffMultiplier}
 * @param {number} rowNum - Row number for status logging (optional)
 * @param {Object} statusContext - Optional {status, updateStatus} for custom status tracking
 * @return {Object} {success: boolean, response: string, model: string, error: string}
 */
function callLLMWithFallback(prompt, models, retryConfig, rowNum, statusContext) {
  const status = statusContext && statusContext.status ? statusContext.status : simpleRateStatus;
  const updateStatus = statusContext && statusContext.updateStatus ? statusContext.updateStatus : updateSimpleRateStatus;
  const maxAttempts = retryConfig.attempts || 3;
  status.totalAttempts = maxAttempts;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    status.currentAttempt = attempt;
    const rowPrefix = rowNum ? `Row ${rowNum}: ` : '';
    updateStatus(`${rowPrefix}Attempt ${attempt}/${maxAttempts}, trying ${models.length} models...`);
    
    // Try each model in fallback order
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      status.currentModel = model;
      updateStatus(`${rowPrefix}Attempt ${attempt}/${maxAttempts}, model ${i + 1}/${models.length}: ${model}...`);
      
      try {
        const result = callLLMSingleModel(prompt, model, rowNum, statusContext);
        if (result.success) {
          updateStatus(`${rowPrefix}Success with model ${model} on attempt ${attempt}`);
          return {
            success: true,
            response: result.response,
            model: model,
            error: null
          };
        } else {
          updateStatus(`${rowPrefix}Model ${model} failed: ${result.error || 'Unknown error'}`);
        }
        // If this model failed, try next model
      } catch (error) {
        updateStatus(`${rowPrefix}Model ${model} exception: ${error.toString()}`);
        // Model failed, try next
        continue;
      }
    }
    
    // All models failed in this attempt
    // If not last attempt, wait with exponential backoff
    if (attempt < maxAttempts) {
      const sleepMs = retryConfig.sleepSeconds * 1000 * Math.pow(retryConfig.backoffMultiplier, attempt - 1);
      const sleepSeconds = sleepMs / 1000;
      updateStatus(`${rowPrefix}All models failed in attempt ${attempt}, waiting ${sleepSeconds.toFixed(1)}s before retry...`);
      Utilities.sleep(sleepMs);
    }
  }
  
  // All attempts failed
  updateStatus(`${rowNum ? 'Row ' + rowNum + ': ' : ''}All models failed after ${maxAttempts} attempts`);
  return {
    success: false,
    response: null,
    model: null,
    error: 'All models failed after ' + maxAttempts + ' attempts'
  };
}

/**
 * Calls a single LLM model
 * @param {string} prompt - The prompt to send
 * @param {string} model - Model name (e.g., "gemma-3-27b")
 * @param {number} rowNum - Row number for status logging (optional)
 * @param {Object} statusContext - Optional {status, updateStatus} for custom status tracking
 * @return {Object} {success: boolean, response: string, error: string}
 */
function callLLMSingleModel(prompt, model, rowNum, statusContext) {
  const rowPrefix = rowNum ? `Row ${rowNum}: ` : '';
  const startTime = new Date();
  const updateStatus = statusContext && statusContext.updateStatus ? statusContext.updateStatus : updateSimpleRateStatus;
  
  try {
    updateStatus(`${rowPrefix}Calling ${model} API...`);
    
    // Get API key from Script Properties
    // Try both LLM_API_KEY and GEMINI_API_KEY (for compatibility with working code)
    const properties = PropertiesService.getScriptProperties();
    let apiKey = properties.getProperty('LLM_API_KEY') || properties.getProperty('GEMINI_API_KEY');
    
    if (!apiKey) {
      throw new Error('LLM_API_KEY or GEMINI_API_KEY not found in Script Properties. Please set it in File > Project Settings > Script Properties');
    }
    
    // Use Google AI Studio API for Gemma models
    // Based on working code: models use -it suffix (gemma-3-27b-it, gemma-3-12b-it, etc.)
    
    // Normalize model name (remove spaces, handle different formats)
    let normalizedModel = model.trim().replace(/\s+/g, '-');
    const isGemma = normalizedModel.toLowerCase().includes('gemma');
    
    // For Gemma models, ensure -it suffix is present
    let modelToUse = normalizedModel;
    if (isGemma) {
      // If model doesn't end with -it, add it
      // e.g., gemma-3-2b -> gemma-3-2b-it
      if (!normalizedModel.endsWith('-it')) {
        modelToUse = normalizedModel + '-it';
      }
      Logger.log(`[SimpleRate] Using Gemma model: ${modelToUse} (original: ${model})`);
    } else {
      Logger.log(`[SimpleRate] Calling model: ${normalizedModel}`);
    }
    
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelToUse + ':generateContent?key=' + apiKey;
    Logger.log(`[SimpleRate] URL: ${url.substring(0, 100)}...`);
    
    const payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 500
      }
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    updateStatus(`${rowPrefix}Sending request to ${model}...`);
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    const elapsedMs = new Date() - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);
    
    updateStatus(`${rowPrefix}Received response from ${model} (${elapsedSec}s, code ${responseCode})...`);
    
    if (responseCode !== 200) {
      // Try to parse error details
      let errorDetails = responseText.substring(0, 500);
      let errorJson = null;
      try {
        errorJson = JSON.parse(responseText);
        if (errorJson.error) {
          errorDetails = JSON.stringify(errorJson.error);
        }
      } catch (e) {
        // Use raw text if can't parse
      }
      
      // Handle specific error codes like in working code
      if (responseCode === 404 || responseCode === 400) {
        // Don't retry for 404/400 - model not available
        const errorMsg = `API error ${responseCode}: Model not found or invalid`;
        updateStatus(`${rowPrefix}${errorMsg}`);
        Logger.log(`[SimpleRate] Model ${modelToUse} not available (${responseCode})`);
        throw new Error(errorMsg);
      } else if (responseCode === 429) {
        // Rate limit - will be handled by retry logic in callLLMWithFallback
        const errorMsg = `Rate limit (429) for ${modelToUse}`;
        updateStatus(`${rowPrefix}${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      const errorMsg = `API error ${responseCode}: ${errorDetails}`;
      updateStatus(`${rowPrefix}${errorMsg}`);
      Logger.log(`[SimpleRate] Full error response: ${responseText}`);
      throw new Error(errorMsg);
    }
    
    updateStatus(`${rowPrefix}Parsing response from ${model}...`);
    const responseJson = JSON.parse(responseText);
    
    // Extract text from response
    if (responseJson.candidates && responseJson.candidates.length > 0) {
      const candidate = responseJson.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const text = candidate.content.parts[0].text;
        updateStatus(`${rowPrefix}${model} responded successfully (${text.length} chars)`);
        return {
          success: true,
          response: text,
          error: null
        };
      }
    }
    
    const errorMsg = 'Unexpected response format: ' + responseText.substring(0, 200);
    updateStatus(`${rowPrefix}${errorMsg}`);
    throw new Error(errorMsg);
    
  } catch (error) {
    const elapsedMs = new Date() - startTime;
    const elapsedSec = (elapsedMs / 1000).toFixed(1);
    updateStatus(`${rowPrefix}${model} failed after ${elapsedSec}s: ${error.toString()}`);
    return {
      success: false,
      response: null,
      error: error.toString()
    };
  }
}

/**
 * Parses LLM response to extract rate and descriptions
 * Supports both JSON format ({ "rate": number, "explanation": "text", "job short desc": "text" }) and "RATE: X" format
 * @param {string} responseText - LLM response text
 * @param {string} modelName - Model name that generated the response
 * @return {Object} {success: boolean, rateNum: number, rateDesc: string, jobShortDesc: string, modelName: string, error: string}
 */
function parseLLMResponse(responseText, modelName) {
  try {
    if (!responseText || typeof responseText !== 'string') {
      return {
        success: false,
        rateNum: null,
        rateDesc: null,
        jobShortDesc: null,
        modelName: modelName || '',
        error: 'Empty or invalid response'
      };
    }

    const extractJobShortDesc = function(resObj) {
      if (!resObj || typeof resObj !== 'object') {
        return '';
      }
      if (resObj['job short desc'] !== undefined) {
        return String(resObj['job short desc'] || '').trim();
      }
      if (resObj.jobShortDesc !== undefined) {
        return String(resObj.jobShortDesc || '').trim();
      }
      if (resObj.job_short_desc !== undefined) {
        return String(resObj.job_short_desc || '').trim();
      }
      if (resObj.jobShortDescription !== undefined) {
        return String(resObj.jobShortDescription || '').trim();
      }
      if (resObj.job_short_description !== undefined) {
        return String(resObj.job_short_description || '').trim();
      }
      return '';
    };
    
    // First, try to parse as JSON (format from working code)
    try {
      // Clean up markdown code blocks if present
      let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Find JSON object (between first { and last })
      const firstBrace = cleanedText.indexOf('{');
      const lastBrace = cleanedText.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonText = cleanedText.substring(firstBrace, lastBrace + 1);
        const resObj = JSON.parse(jsonText);
        
        // Check if it has rate and explanation fields
        if (resObj.rate !== undefined && resObj.explanation !== undefined) {
          const rateNum = parseInt(resObj.rate);
          if (rateNum >= 0 && rateNum <= 10) {
            return {
              success: true,
              rateNum: rateNum,
              rateDesc: String(resObj.explanation || 'No explanation provided').trim(),
              jobShortDesc: extractJobShortDesc(resObj),
              modelName: modelName || '',
              error: null
            };
          }
        }
      }
    } catch (jsonError) {
      // Not JSON format, continue to try other formats
      Logger.log(`[SimpleRate] JSON parse failed, trying other formats: ${jsonError.toString()}`);
    }
    
    // Fallback: Try "RATE: X" format or plain number
    const lines = responseText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length === 0) {
      return {
        success: false,
        rateNum: null,
        rateDesc: null,
        jobShortDesc: null,
        modelName: modelName || '',
        error: 'No lines in response'
      };
    }
    
    // Find RATE line (first line should contain "RATE: X" or just a number)
    let rateNum = null;
    let rateStartIndex = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Try to match "RATE: X" pattern
      const rateMatch = line.match(/RATE\s*:\s*(\d+)/i);
      if (rateMatch) {
        rateNum = parseInt(rateMatch[1]);
        rateStartIndex = i + 1;
        break;
      }
      
      // Try to match just a number at the start of line
      const numMatch = line.match(/^\s*(\d+)\s*$/);
      if (numMatch && rateNum === null) {
        const num = parseInt(numMatch[1]);
        if (num >= 0 && num <= 10) {
          rateNum = num;
          rateStartIndex = i + 1;
          break;
        }
      }
    }
    
    if (rateNum === null || rateNum < 0 || rateNum > 10) {
      // Log the response for debugging
      Logger.log(`[SimpleRate] Could not parse response. First 200 chars: ${responseText.substring(0, 200)}`);
      return {
        success: false,
        rateNum: null,
        rateDesc: null,
        jobShortDesc: null,
        modelName: modelName || '',
        error: 'Could not extract valid rate (0-10) from response. Response: ' + responseText.substring(0, 100)
      };
    }
    
    // Extract description (remaining lines, remove bullet markers if present)
    const descLines = lines.slice(rateStartIndex);
    let rateDesc = descLines.join('\n');
    
    // Clean up bullet markers (normalize to - format)
    rateDesc = rateDesc.replace(/^[\*\-\•]\s*/gm, '- ');
    
    if (rateDesc.trim().length === 0) {
      rateDesc = 'No description provided';
    }
    
    return {
      success: true,
      rateNum: rateNum,
      rateDesc: rateDesc.trim(),
      jobShortDesc: '',
      modelName: modelName || '',
      error: null
    };
    
  } catch (error) {
    Logger.log(`[SimpleRate] Parse error: ${error.toString()}, response: ${responseText.substring(0, 200)}`);
    return {
      success: false,
      rateNum: null,
      rateDesc: null,
      jobShortDesc: null,
      modelName: modelName || '',
      error: 'Parse error: ' + error.toString()
    };
  }
}
