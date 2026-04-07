/**
 * ScrapeLog utilities
 */

function appendScrapeLog(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('ScrapeLog');
  if (!sheet) {
    sheet = ss.insertSheet('ScrapeLog');
    sheet.getRange(1, 1, 1, 4).setValues([[
      'Timestamp',
      'SourceId',
      'Stage',
      'Details'
    ]]);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  const timestamp = entry && entry.timestamp ? entry.timestamp : new Date();
  const sourceId = entry && entry.sourceId ? String(entry.sourceId) : '';
  const stage = entry && entry.stage ? String(entry.stage) : '';
  const details = entry && entry.details ? String(entry.details) : '';

  const formattedTimestamp = timestamp instanceof Date
    ? Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
    : String(timestamp);

  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, 4).setValues([[
    formattedTimestamp,
    sourceId,
    stage,
    details
  ]]);
}
