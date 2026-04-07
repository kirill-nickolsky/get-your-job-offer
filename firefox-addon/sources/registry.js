/**
 * Deprecated registry shim.
 * Kept for backward compatibility if this file is still loaded.
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  if (typeof root.registerScrapeSource === 'function' &&
      typeof root.findScrapeSourceByUrl === 'function') {
    return;
  }

  const registry = root.ScrapeSources = root.ScrapeSources || [];

  root.registerScrapeSource = function(source) {
    if (!source || !source.id || typeof source.match !== 'function') return;
    const index = registry.findIndex(item => item && item.id === source.id);
    if (index >= 0) {
      registry[index] = source;
    } else {
      registry.push(source);
    }
  };

  root.findScrapeSourceByUrl = function(url) {
    if (!url) return null;
    for (let i = 0; i < registry.length; i++) {
      const source = registry[i];
      if (!source || typeof source.match !== 'function') continue;
      try {
        if (source.match(url)) {
          return source;
        }
      } catch (error) {
        // Ignore match errors
      }
    }
    return null;
  };
})();
