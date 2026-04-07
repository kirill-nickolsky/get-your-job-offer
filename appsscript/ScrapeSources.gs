/**
 * ScrapeSources configuration helpers
 */

function ensureScrapeSourcesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('ScrapeSources');
  const wantedHeader = [
    'id',
    'name',
    'enabled',
    'MaxTabsPerSite',
    'Priority',
    'MinIntervalMin',
    'RetryLimit',
    'RetryBackoffMin',
    'DailySuccessCap',
    'ScrapePageUrl'
  ];
  if (!sheet) {
    sheet = ss.insertSheet('ScrapeSources');
    sheet.getRange(1, 1, 1, wantedHeader.length).setValues([wantedHeader]);
    sheet.getRange(1, 1, 1, wantedHeader.length).setFontWeight('bold');
    return sheet;
  }
  const lastCol = Math.max(sheet.getLastColumn(), wantedHeader.length);
  const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(cell => String(cell || '').trim().toLowerCase());
  for (let i = 0; i < wantedHeader.length; i++) {
    const normalized = wantedHeader[i].toLowerCase();
    if (header.indexOf(normalized) === -1) {
      const nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue(wantedHeader[i]);
      sheet.getRange(1, nextCol).setFontWeight('bold');
    }
  }
  return sheet;
}

function getScrapeSourcesConfig() {
  const sheet = ensureScrapeSourcesSheet();
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return {
      hasConfig: false,
      enabledById: {},
      enabledByName: {},
      rows: []
    };
  }

  const header = values[0].map(cell => String(cell || '').trim().toLowerCase());
  const idIndex = header.indexOf('id');
  const nameIndex = header.indexOf('name');
  const enabledIndex = header.indexOf('enabled');
  const maxTabsIndex = header.indexOf('maxtabspersite');
  const priorityIndex = header.indexOf('priority');
  const minIntervalIndex = header.indexOf('minintervalmin');
  const retryLimitIndex = header.indexOf('retrylimit');
  const retryBackoffIndex = header.indexOf('retrybackoffmin');
  const dailySuccessCapIndex = header.indexOf('dailysuccesscap');
  const scrapePageUrlIndex = header.indexOf('scrapepageurl');

  const enabledById = {};
  const enabledByName = {};
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length === 0) continue;
    const id = idIndex !== -1 ? String(row[idIndex] || '').trim() : '';
    const name = nameIndex !== -1 ? String(row[nameIndex] || '').trim() : '';
    const enabledRaw = enabledIndex !== -1 ? row[enabledIndex] : '';
    if (!id && !name) continue;

    let enabled = true;
    if (enabledRaw === false) {
      enabled = false;
    } else if (typeof enabledRaw === 'string') {
      const normalized = enabledRaw.trim().toLowerCase();
      if (normalized === 'false' || normalized === 'no' || normalized === '0') {
        enabled = false;
      }
    } else if (typeof enabledRaw === 'number') {
      enabled = enabledRaw !== 0;
    }

    if (id) {
      enabledById[id] = enabled;
    }
    if (name) {
      enabledByName[name] = enabled;
    }

    let maxTabsPerSite = null;
    if (maxTabsIndex !== -1) {
      const raw = row[maxTabsIndex];
      const parsed = parseInt(String(raw || '').trim(), 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        maxTabsPerSite = parsed;
      }
    }

    const parseOptionalPositiveInt = function(index, fallback) {
      if (index === -1) return fallback;
      const parsed = parseInt(String(row[index] || '').trim(), 10);
      return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
    };

    rows.push({
      id: id,
      name: name,
      enabled: enabled,
      maxTabsPerSite: maxTabsPerSite,
      priority: parseOptionalPositiveInt(priorityIndex, 100),
      minIntervalMin: parseOptionalPositiveInt(minIntervalIndex, 60),
      retryLimit: parseOptionalPositiveInt(retryLimitIndex, 2),
      retryBackoffMin: parseOptionalPositiveInt(retryBackoffIndex, 15),
      dailySuccessCap: parseOptionalPositiveInt(dailySuccessCapIndex, 0),
      scrapePageUrl: scrapePageUrlIndex !== -1 ? String(row[scrapePageUrlIndex] || '').trim() : ''
    });
  }

  return {
    hasConfig: rows.length > 0,
    enabledById: enabledById,
    enabledByName: enabledByName,
    rows: rows
  };
}

function validateScrapeSource(scrapePageName, scrapePageId) {
  const config = getScrapeSourcesConfig();
  if (!config.hasConfig) {
    return true;
  }

  const nameKey = String(scrapePageName || '').trim();
  const idKey = String(scrapePageId || '').trim();

  if (idKey && Object.prototype.hasOwnProperty.call(config.enabledById, idKey)) {
    if (config.enabledById[idKey] !== true) {
      throw new Error('Scrape source disabled: ' + idKey);
    }
    return true;
  }

  if (nameKey && Object.prototype.hasOwnProperty.call(config.enabledByName, nameKey)) {
    if (config.enabledByName[nameKey] !== true) {
      throw new Error('Scrape source disabled: ' + nameKey);
    }
    return true;
  }

  Logger.log('[ScrapeSources] Source not found in config: ' + (nameKey || idKey));
  return true;
}
