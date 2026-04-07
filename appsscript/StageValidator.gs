/**
 * Stage 2: Validate Stage - Converts Staged → Approved
 */

/**
 * Validates Stage sheet and converts all Staged rows to Approved
 */
function validateStage() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stageSheet = ss.getSheetByName('Stage');
    
    if (!stageSheet) {
      uiAlertNonBlocking_('Error', 'Stage sheet not found');
      return;
    }
    
    // Preconditions Check: Verify Stage has data (>= 2 rows including header)
    const lastRow = stageSheet.getLastRow();
    if (lastRow < 2) {
      uiAlertNonBlocking_('Error', 'Stage sheet is empty or has no data rows');
      return;
    }
    
    // Header Validation
    const expectedHeader = getExpectedHeader();
    const validationResult = validateHeader(stageSheet, expectedHeader);
    
    if (!validationResult.valid) {
      const errorMsg = 'Header validation failed:\n' + validationResult.errors.join('\n');
      uiAlertNonBlocking_('Error', errorMsg);
      return;
    }
    
    // Status Column Check
    const actualHeader = readHeader(stageSheet);
    const statusColIndex = actualHeader.indexOf('Status');
    
    if (statusColIndex === -1) {
      uiAlertNonBlocking_('Error', 'Status column missing');
      return;
    }
    
    // Data Row Validation: allow Staged/Approved only
    const dataRange = stageSheet.getRange(2, 1, lastRow - 1, stageSheet.getLastColumn());
    const dataValues = dataRange.getValues();
    
    let firstProblemRow = null;
    let stagedCount = 0;
    let approvedCount = 0;
    for (let i = 0; i < dataValues.length; i++) {
      const statusValue = String(dataValues[i][statusColIndex] || '').trim();
      if (statusValue === 'Staged') {
        stagedCount++;
      } else if (statusValue === 'Approved') {
        approvedCount++;
      } else {
        firstProblemRow = i + 2; // +2 because data starts at row 2 and i is 0-based
        break;
      }
    }
    
    if (firstProblemRow !== null) {
      uiAlertNonBlocking_('Error', 
        'Row ' + firstProblemRow + ' has invalid Status. Expected "Staged" or "Approved".');
      return;
    }
    
    if (stagedCount === 0) {
      uiAlertNonBlocking_('Info', 
        'No rows with Status="Staged" found');
      return;
    }

    // Status Update: replace Staged → Approved
    const statusCol = statusColIndex + 1; // Convert to 1-based column number
    const statusRange = stageSheet.getRange(2, statusCol, lastRow - 1, 1);
    const statusValues = statusRange.getValues();
    
    const approvedValues = statusValues.map(row => {
      const value = String(row[0] || '').trim();
      return [value === 'Staged' ? 'Approved' : value];
    });
    statusRange.setValues(approvedValues);
    
    // Show success message
    const rowCount = stagedCount;
    uiAlertNonBlocking_('Success', 
      'Validated: ' + rowCount + ' rows set to Approved');
      
  } catch (error) {
    uiAlertNonBlocking_('Error', 
      'An error occurred: ' + error.toString());
  }
}


