(function() {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  const utils = root.ScrapeUtils = root.ScrapeUtils || {};

  if (!utils.SourceHelpers) {
    utils.SourceHelpers = {};
  }

  const helpers = utils.SourceHelpers;

  if (!helpers.sleep) {
    helpers.sleep = function(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    };
  }

  if (!helpers.normalizeText) {
    helpers.normalizeText = function(text) {
      return String(text || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
  }

  if (!helpers.safeQuery) {
    helpers.safeQuery = function(selector, rootNode) {
      const rootRef = rootNode || (root.document || document);
      if (!rootRef || !selector) return null;
      try {
        return rootRef.querySelector(selector);
      } catch (error) {
        return null;
      }
    };
  }

  if (!helpers.safeQueryAll) {
    helpers.safeQueryAll = function(selector, rootNode) {
      const rootRef = rootNode || (root.document || document);
      if (!rootRef || !selector) return [];
      try {
        return Array.from(rootRef.querySelectorAll(selector));
      } catch (error) {
        return [];
      }
    };
  }

  if (!helpers.extractJobIdFromUrl) {
    helpers.extractJobIdFromUrl = function(url) {
      if (!url) return '';
      const value = String(url);
      const hhMatch = value.match(/\/vacancy\/(\d+)/);
      if (hhMatch) return hhMatch[1];
      const habrMatch = value.match(/\/vacancies\/(\d+)/);
      if (habrMatch) return habrMatch[1];
      const leverMatch = value.match(/jobs\.lever\.co\/[^\/]+\/([^\/\?]+)/i);
      if (leverMatch) return leverMatch[1];
      const numMatch = value.match(/\/(\d+)(?:\/|$|\?)/);
      if (numMatch) return numMatch[1];
      return '';
    };
  }
})();
