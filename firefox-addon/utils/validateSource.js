(function() {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  const utils = root.ScrapeUtils = root.ScrapeUtils || {};

  if (!utils.validateSource) {
    utils.validateSource = function(source) {
      const errors = [];
      if (!source || typeof source !== 'object') {
        errors.push('source is not an object');
      } else {
        if (!source.id || typeof source.id !== 'string') errors.push('missing id');
        if (!source.name || typeof source.name !== 'string') errors.push('missing name');
        if (typeof source.match !== 'function') errors.push('missing match(url)');
        if (typeof source.scrapeList !== 'function') errors.push('missing scrapeList(document, ctx)');
        if (typeof source.scrapeDetail !== 'function') errors.push('missing scrapeDetail(document, ctx)');
      }
      return {valid: errors.length === 0, errors: errors};
    };
  }
})();
