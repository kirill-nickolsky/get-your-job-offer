(function() {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  const utils = root.ScrapeUtils = root.ScrapeUtils || {};

  if (!utils.safeStringify) {
    utils.safeStringify = function(value) {
      try {
        const text = JSON.stringify(value);
        if (text && text.length > 500) {
          return text.slice(0, 500) + '...';
        }
        return text;
      } catch (error) {
        return String(value);
      }
    };
  }

  if (!utils.createDebugCollector) {
    utils.createDebugCollector = function(site) {
      const entries = [];
      return {
        site: site,
        url: root.location && root.location.href ? root.location.href : '',
        entries: entries,
        add(step, data) {
          const hasData = data !== undefined;
          const payloadData = hasData
            ? (typeof data === 'object' ? data : {value: data})
            : null;
          const payload = hasData
            ? `${step}: ${utils.safeStringify(payloadData)}`
            : step;
          entries.push(payload);
          if (typeof console !== 'undefined' && console.log) {
            console.log(`[${site} debug] ${payload}`);
          }
        }
      };
    };
  }
})();
