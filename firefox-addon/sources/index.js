/**
 * Source registry for list/detail scrapers.
 * Must be loaded before any source modules.
 */
(function () {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const registry = root.ScrapeSources = root.ScrapeSources || [];
  const utils = root.ScrapeUtils || {};

  root.registerScrapeSource = function (source) {
    console.log(`[scrape] Registering source:`, source ? source.id : 'undefined');
    if (!source || !source.id || typeof source.match !== 'function') {
      console.error('[scrape] Invalid source structure', source);
      return;
    }
    if (utils.validateSource) {
      const result = utils.validateSource(source);
      if (!result.valid) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[scrape] invalid source', source && source.id, result.errors);
        }
        return;
      }
    }
    const index = registry.findIndex(item => item && item.id === source.id);
    if (index >= 0) {
      registry[index] = source;
      console.log(`[scrape] Updated source: ${source.id}`);
    } else {
      registry.push(source);
      console.log(`[scrape] Registered new source: ${source.id} (total: ${registry.length})`);
    }
  };

  root.findScrapeSourceByUrl = function (url) {
    if (!url) return null;
    // consoles.log('Finding source for:', url);
    for (let i = 0; i < registry.length; i++) {
      const source = registry[i];
      if (!source || typeof source.match !== 'function') continue;
      try {
        if (source.match(url)) {
          console.log(`[scrape] Matched source: ${source.id}`);
          return source;
        }
      } catch (error) {
        console.error(`[scrape] Error matching source ${source.id}:`, error);
      }
    }
    console.warn(`[scrape] No source matched for ${url}. Available: ${registry.map(s => s.id).join(', ')}`);
    return null;
  };
})();
