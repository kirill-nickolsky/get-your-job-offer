(function() {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  const utils = root.ScrapeUtils = root.ScrapeUtils || {};

  if (!utils.normalizeText) {
    utils.normalizeText = function(text) {
      return String(text || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
  }
})();
