(function() {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  const utils = root.ScrapeUtils = root.ScrapeUtils || {};

  if (!utils.waitForAnySelector) {
    utils.waitForAnySelector = async function(selectors, timeoutMs, intervalMs = 100) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        for (const selector of selectors) {
          if (root.document && root.document.querySelector(selector)) {
            return true;
          }
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
      return false;
    };
  }
})();
