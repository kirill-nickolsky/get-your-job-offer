/**
 * Non-blocking UI notifications helpers.
 */
function uiAlertNonBlocking_(title, message) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      Logger.log('[UiNotifications] Spreadsheet is not available');
      return;
    }

    let toastTitle = 'Info';
    let toastMessage = '';

    if (arguments.length <= 1) {
      toastMessage = String(title || '');
    } else {
      toastTitle = String(title || 'Info');
      toastMessage = String(message || '');
    }

    ss.toast(toastMessage, toastTitle, 5);
  } catch (error) {
    Logger.log('[UiNotifications] Failed to show toast: ' + error.toString());
  }
}
