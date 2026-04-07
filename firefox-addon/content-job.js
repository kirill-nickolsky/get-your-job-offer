/**
 * Content script for scraping individual job page
 */

(function () {
  'use strict';

  console.log('[get-your-offer] content-job.js loaded on', window.location.href);

  // Guard removed: logic moved to listener to ensure we can always receive messages.

  const sharedUtils = window.ScrapeUtils || {};
  const safeStringify = sharedUtils.safeStringify || function (value) {
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
  const createDebugCollector = sharedUtils.createDebugCollector || function (site) {
    const entries = [];
    return {
      site: site,
      url: window.location.href,
      entries: entries,
      add(step, data) {
        const payload = data !== undefined ? `${step}: ${safeStringify(data)}` : step;
        entries.push(payload);
        console.log(`[${site} debug] ${payload}`);
      }
    };
  };
  const normalizeJob = sharedUtils.normalizeJob;

  function normalizeSiteKey(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('linkedin')) return 'linkedin';
    if (raw.includes('wellfound')) return 'wellfound';
    if (raw.includes('lever') || raw.includes('jobs.lever.co') || raw.includes('dlocal')) return 'lever';
    if (raw.includes('career.habr.com') || raw.startsWith('habr')) return 'habr';
    if (raw.includes('headhunter') || raw.includes('hh.ru')) return 'hh';
    if (raw.includes('getonbrd')) return 'getonbrd';
    if (raw.includes('trabajo.gallito.com.uy') || raw.includes('gallito')) return 'gallito';
    if (raw.includes('computrabajo')) return 'computrabajo';
    if (raw.includes('jobspresso')) return 'jobspresso';
    if (raw.includes('workatastartup') || raw.includes('ycombinator')) return 'workatastartup';
    if (raw.includes('torc.dev') || raw.includes('platform.torc.dev') || raw.includes('torc')) return 'torc';
    if (raw.includes('revelo')) return 'revelo';
    return raw;
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getBodyText_() {
    if (!document || !document.body) return '';
    return normalizeText(document.body.innerText || document.body.textContent || '');
  }

  function checkTorcDetailReady_() {
    const url = String(window.location.href || '');
    if (!/(?:#\/|\/)jobs\/matches\/[a-f0-9-]{8,}/i.test(url)) {
      return { ready: false, reason: 'not_torc_detail_url', metrics: {} };
    }

    const text = getBodyText_();
    const lower = text.toLowerCase();
    const textLen = text.length;
    const detailCards = document.querySelectorAll('div[class*="bg-background-default-secondary"][class*="rounded-md"]').length;
    const sectionHeadings = Array.from(document.querySelectorAll('h2, h3, h4, [class*="text-title"]'))
      .map(node => normalizeText(node.textContent || ''))
      .filter(Boolean);
    const sectionHits = sectionHeadings.filter(item => /(the ask|responsibilities|requirements|must[- ]?have skills?)/i.test(item)).length;
    const hasMain = Boolean(document.querySelector('main'));
    const readyState = String(document.readyState || '');
    const hasJsShell = lower.includes('you need to enable javascript to run this app');
    const hasFooterTokens = lower.includes('about us') &&
      lower.includes('privacy policy') &&
      lower.includes('terms of use') &&
      lower.includes('accommodations');
    const footerOnlyShell = hasFooterTokens && detailCards === 0 && sectionHits === 0 && textLen < 1100;
    const loadingOnly = textLen < 180 || /^loading\.{0,3}$/i.test(text);

    const ready = (readyState === 'interactive' || readyState === 'complete') &&
      !hasJsShell &&
      !footerOnlyShell &&
      !loadingOnly &&
      hasMain &&
      (detailCards > 0 || sectionHits > 0 || textLen >= 1400);

    let reason = 'ready';
    if (!ready) {
      if (readyState === 'loading') reason = 'dom_loading';
      else if (hasJsShell) reason = 'js_shell';
      else if (footerOnlyShell) reason = 'footer_shell_only';
      else if (loadingOnly) reason = 'text_too_short';
      else if (!hasMain) reason = 'main_missing';
      else reason = 'detail_markers_missing';
    }

    return {
      ready: ready,
      reason: reason,
      metrics: {
        readyState: readyState,
        textLen: textLen,
        detailCards: detailCards,
        sectionHits: sectionHits
      }
    };
  }

  function checkReveloDetailReady_() {
    const readyState = String(document.readyState || '');
    const text = getBodyText_();
    const lower = text.toLowerCase();
    const textLen = text.length;

    const drawerNodes = Array.from(document.querySelectorAll('article.ev-drawer .ev-drawer__content'));
    let drawerTextMaxLen = 0;
    for (let i = 0; i < drawerNodes.length && i < 5; i++) {
      const nodeText = normalizeText(drawerNodes[i].innerText || drawerNodes[i].textContent || '');
      if (nodeText.length > drawerTextMaxLen) {
        drawerTextMaxLen = nodeText.length;
      }
    }

    const sectionNodes = Array.from(document.querySelectorAll('main, article, section'));
    let sectionTextHits = 0;
    let sectionTextMaxLen = 0;
    for (let i = 0; i < sectionNodes.length && i < 24; i++) {
      const sectionText = normalizeText(sectionNodes[i].innerText || sectionNodes[i].textContent || '');
      const sectionLen = sectionText.length;
      if (sectionLen > sectionTextMaxLen) {
        sectionTextMaxLen = sectionLen;
      }
      if (sectionLen >= 220) {
        sectionTextHits++;
      }
    }

    const titleNodes = Array.from(document.querySelectorAll('[data-test="position-title"], h1, h2, h3'));
    const titleHits = titleNodes
      .map(node => normalizeText(node.textContent || ''))
      .filter(Boolean)
      .filter(value => value.length >= 6)
      .filter(value => !/^(jobs?|positions?)$/i.test(value)).length;

    const hasJsShell = lower.includes('enable javascript');
    const hasLoadingToken = /(loading|please wait|just a moment|fetching)/i.test(lower);
    const loadingOnly = textLen < 160 || /^loading(?:\s*\.{0,3})?$/i.test(text);
    const shellOnly = hasLoadingToken && textLen < 260 && drawerTextMaxLen < 80 && sectionTextHits === 0;

    const hasDrawerContent = drawerNodes.length > 0 && drawerTextMaxLen >= 80;
    const hasMainSectionContent = sectionTextHits > 0 || sectionTextMaxLen >= 320;
    const hasTitle = titleHits > 0;
    const hasDetailMarkers = hasDrawerContent || hasMainSectionContent || hasTitle;

    const ready = (readyState === 'interactive' || readyState === 'complete') &&
      !hasJsShell &&
      !loadingOnly &&
      !shellOnly &&
      hasDetailMarkers &&
      (textLen >= 180 || drawerTextMaxLen >= 80 || sectionTextMaxLen >= 180);

    let reason = 'ready';
    if (!ready) {
      if (readyState === 'loading') reason = 'dom_loading';
      else if (hasJsShell) reason = 'js_shell';
      else if (loadingOnly) reason = 'loading_only';
      else if (shellOnly) reason = 'shell_loading_only';
      else if (!hasDetailMarkers) reason = 'detail_markers_missing';
      else reason = 'text_too_short';
    }

    return {
      ready: ready,
      reason: reason,
      metrics: {
        readyState: readyState,
        textLen: textLen,
        drawerNodes: drawerNodes.length,
        drawerTextMaxLen: drawerTextMaxLen,
        sectionTextHits: sectionTextHits,
        sectionTextMaxLen: sectionTextMaxLen,
        titleHits: titleHits
      }
    };
  }

  function checkGenericDetailReady_() {
    const readyState = String(document.readyState || '');
    const textLen = getBodyText_().length;
    const ready = (readyState === 'interactive' || readyState === 'complete') && textLen >= 120;
    return {
      ready: ready,
      reason: ready ? 'ready' : (readyState === 'loading' ? 'dom_loading' : 'text_too_short'),
      metrics: {
        readyState: readyState,
        textLen: textLen
      }
    };
  }

  function evaluateDetailReadiness_(requestedSourceId) {
    const sourceFromRequest = normalizeSiteKey(requestedSourceId || '');
    const sourceFromUrl = normalizeSiteKey(window.location.href || '');
    const source = sourceFromRequest || sourceFromUrl;
    if (source === 'torc') {
      return checkTorcDetailReady_();
    }
    if (source === 'revelo') {
      return checkReveloDetailReady_();
    }
    return checkGenericDetailReady_();
  }

  // Listen for messages from background script
  function isDetailPage(url) {
    if (!url) return false;
    if (url.includes('linkedin.com') && (url.includes('/jobs/view/') || url.includes('/jobs/details/'))) {
      return true;
    }
    if ((url.includes('hh.ru') || url.includes('headhunter.ge')) && url.includes('/vacancy/')) {
      return true;
    }
    if (url.includes('career.habr.com') && /\/vacancies\/\d+/.test(url)) {
      return true;
    }
    if (url.includes('trabajo.gallito.com.uy') && /\/anuncio\/[^\/?#]+/i.test(url)) {
      return true;
    }
    if (url.includes('jobs.lever.co')) {
      return /jobs\.lever\.co\/[^\/]+\/[^\/\?#]+/.test(url);
    }
    if (url.includes('getonbrd.com') && /\/jobs\/[^\/]+\/[^\/]+/.test(url)) {
      return true;
    }
    if (url.includes('computrabajo.com') && (url.includes('/ofertas-de-trabajo/') || url.includes('/trabajo-'))) {
      return true;
    }
    if (url.includes('jobspresso.co') && url.includes('/job/')) {
      return true;
    }
    if (url.includes('torc.dev')) {
      return /(?:#\/|\/)jobs\/matches\/[a-f0-9-]{8,}/i.test(url);
    }
    if (url.includes('careers.revelo.com')) {
      if (url.includes('/home')) return false;
      return /\/(jobs?|positions?)\//.test(url);
    }
    if (url.includes('workatastartup.com') && /\/jobs\/\d+/.test(url)) {
      return true;
    }
    return false;
  }

  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Check if we are on a valid View page for this script
    const url = window.location.href;
    const isLinkedinView = url.includes('linkedin.com') && (url.includes('/jobs/view/') || url.includes('/jobs/details/'));

    // If this is LinkedIn but NOT a view page, we generally ignore...
    // UNLESS it's a specific 'scrapeJob' request which forces us to try?
    // Actually, if it's 'scrapeJob', we should try.
    // If it's 'scrapeList', we should only handle it if it IS a view page.

    if (request.action === 'ping') {
      sendResponse({ success: true, ready: true });
      return false; // Sync response
    }

    if (request.action === 'scrapeJob') {
      scrapeJobDetails(request && request.context ? request.context : null).then(data => {
        sendResponse({ success: true, data: data });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Async
    }

    if (request.action === 'isDetailReady') {
      try {
        const result = evaluateDetailReadiness_(request && request.sourceId ? request.sourceId : '');
        sendResponse({
          success: true,
          ready: !!(result && result.ready),
          reason: result && result.reason ? result.reason : '',
          metrics: result && result.metrics ? result.metrics : {}
        });
      } catch (error) {
        sendResponse({ success: false, ready: false, error: error.message });
      }
      return false;
    }

    if (request.action === 'scrapeList') {
      // Let content-list handle non-detail pages
      if (!isDetailPage(url)) {
        return false;
      }

      scrapeJobDetails(request && request.context ? request.context : null).then(data => {
        const list = data ? [data] : [];
        sendResponse({ success: true, data: list, count: list.length });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Async
    }
  });

  async function scrapeJobDetails(extraContext) {
    const finder = (typeof findScrapeSourceByUrl === 'function') ? findScrapeSourceByUrl : null;
    const source = finder ? finder(window.location.href) : null;

    if (!source || typeof source.scrapeDetail !== 'function') {
      const debug = createDebugCollector('detail');
      const registry = Array.isArray(window.ScrapeSources) ? window.ScrapeSources : [];
      const ids = registry.map(item => item && item.id).filter(Boolean);
      debug.add('detailMissing', {
        url: window.location.href,
        hasFinder: Boolean(finder),
        sourcesCount: registry.length,
        sourceIds: ids
      });
      throw new Error(
        'No detail scraper registered for this site. Please update the addon or open a supported job page.'
      );
    }

    const debug = createDebugCollector(source.id || 'source');
    const ctx = Object.assign({
      debug: debug,
      url: window.location.href
    }, extraContext || {});
    const job = await source.scrapeDetail(document, ctx);

    const result = job || {};
    return normalizeJob ? normalizeJob(result) : result;
  }
})();
