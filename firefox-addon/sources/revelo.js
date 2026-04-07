/**
 * Source: Revelo Careers (app.careers.revelo.com)
 * List: /home cards with "View details" drawer.
 * Detail: fallback parser for direct detail-like pages.
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));

  const selectors = {
    cards: 'article[data-test="home-position-card"], article.home-position-card',
    title: '[data-test="position-title"], .home-position-card__title, h2, h3',
    company: '[data-test="position-company"], .home-position-card__company, .home-position-card__header [class*="company"]',
    skills: '[data-test="position-skills"] [class*="badge"], .home-position-card__skills [class*="badge"], .home-position-card__skills span',
    info: '[data-test="position-info"], .home-position-card__info',
    detailsButton: 'button[data-test="view-details-button"], button.home-position-card__view-details',
    drawer: 'article.ev-drawer .ev-drawer__content[data-test="content"], article.ev-drawer .ev-drawer__content, article.ev-drawer',
    drawerHeader: 'article.ev-drawer [data-test="overline"], article.ev-drawer h1, article.ev-drawer h2, article.ev-drawer h3',
    drawerBody: 'article.ev-drawer [data-test="body"], article.ev-drawer .ev-drawer__body',
    drawerClose: 'article.ev-drawer [data-test="close"], article.ev-drawer .ev-drawer__close, article.ev-drawer i.ev-icon-times[aria-role="button"], article.ev-drawer [aria-label="close"]',
    drawerOverlay: 'article.ev-drawer [data-test="overlay"], article.ev-drawer .ev-drawer__overlay'
  };

  const REVELO_LIST_READY_TIMEOUT_MS = 20000;
  const REVELO_STEP_WAIT_MS = 180;
  const REVELO_DRAWER_TIMEOUT_MS = 9000;
  const REVELO_CLOSE_TIMEOUT_MS = 5000;
  const REVELO_SCROLL_MAX_ROUNDS = 30;
  const REVELO_SCROLL_STABLE_ROUNDS = 5;
  const REVELO_SCROLL_WAIT_MS = 900;

  function getUtils() {
    const utils = root.ScrapeUtils || {};
    const normalizeText = helpers.normalizeText || utils.normalizeText || function(text) {
      return String(text || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const createEmptyJob = utils.createEmptyJob || function(overrides) {
      return Object.assign({
        JobUrl: '',
        JobId: '',
        JobTitle: '',
        JobCompany: '',
        JobLocation: '',
        JobSeniority: '',
        JobModality: '',
        JobSalary: '',
        JobTags: '',
        JobDescription: '',
        JobPostedDttm: '',
        JobRateDttm: '',
        JobRateNum: '',
        JobRateDesc: '',
        JobRateShortDesc: '',
        RatedModelName: '',
        Status: 'Staged',
        LoadDttm: ''
      }, overrides || {});
    };
    return { normalizeText, createEmptyJob };
  }

  function toAbsoluteUrl(href, baseUrl) {
    if (!href) return '';
    try {
      return new URL(String(href), baseUrl || (root.location ? root.location.href : '')).href;
    } catch (error) {
      return '';
    }
  }

  function hashText(text) {
    const value = String(text || '');
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function uniqueList(values) {
    const seen = new Set();
    const result = [];
    for (let i = 0; i < values.length; i++) {
      const value = String(values[i] || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
    }
    return result;
  }

  function getDrawerNode(documentRef) {
    const node = documentRef.querySelector(selectors.drawer);
    if (!node) return null;
    const style = root.getComputedStyle ? root.getComputedStyle(node) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return null;
    }
    if (typeof node.getBoundingClientRect === 'function') {
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width < 40 || rect.height < 40) {
        return null;
      }
    }
    return node;
  }

  function getDrawerSignature(documentRef, utils) {
    const drawer = getDrawerNode(documentRef);
    if (!drawer) return '';
    return utils.normalizeText((drawer.textContent || '').slice(0, 320));
  }

  async function waitFor(condition, timeoutMs, intervalMs) {
    const timeout = Math.max(200, timeoutMs || 2000);
    const interval = Math.max(40, intervalMs || 100);
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      let ok = false;
      try {
        ok = !!condition();
      } catch (error) {
        ok = false;
      }
      if (ok) return true;
      await sleep(interval);
    }
    return false;
  }

  function fireClick(node) {
    if (!node || typeof node.click !== 'function') return false;
    try {
      if (typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    } catch (error) {
      // Ignore scroll errors
    }
    try {
      node.click();
      return true;
    } catch (error) {
      return false;
    }
  }

  function parseModality(text) {
    const value = String(text || '').toLowerCase();
    if (!value) return '';
    if (value.includes('full-time') || value.includes('full time')) return 'Full-time';
    if (value.includes('part-time') || value.includes('part time')) return 'Part-time';
    if (value.includes('contract')) return 'Contract';
    if (value.includes('freelance')) return 'Freelance';
    return '';
  }

  function parseSalary(text, utils) {
    const value = utils.normalizeText(text || '');
    if (!value) return '';
    const salaryMatch = value.match(/([$€£]|usd|eur|brl|mxn)[^,;\n]{4,120}/i);
    return salaryMatch ? utils.normalizeText(salaryMatch[0]) : '';
  }

  function parseLocation(cardText, title, utils) {
    const titleText = utils.normalizeText(title || '');
    const titleLocationMatch = titleText.match(/\bremote\b(?:\s*[-,]\s*[^,;|]+)?/i);
    if (titleLocationMatch) return utils.normalizeText(titleLocationMatch[0]);
    const normalized = utils.normalizeText(cardText || '');
    const lineMatch = normalized.match(/\b(?:brazil|brasil|mexico|argentina|colombia|latam|latin america|remote)\b[^,;|]*/i);
    return lineMatch ? utils.normalizeText(lineMatch[0]) : '';
  }

  function extractCardBase(card, index, documentRef, utils) {
    const titleEl = card.querySelector(selectors.title);
    const companyEl = card.querySelector(selectors.company);
    const detailsButton = card.querySelector(selectors.detailsButton);
    const infoEl = card.querySelector(selectors.info);
    const cardText = utils.normalizeText(card.innerText || card.textContent || '');

    const title = utils.normalizeText(titleEl ? titleEl.textContent : '') || 'Untitled';
    const company = utils.normalizeText(companyEl ? companyEl.textContent : '');
    const infoText = utils.normalizeText(infoEl ? infoEl.textContent : cardText);

    const skillNodes = Array.from(card.querySelectorAll(selectors.skills));
    const tags = uniqueList(skillNodes.map(node => utils.normalizeText(node.textContent || '')));

    const idCandidates = [
      card.getAttribute('data-position-id'),
      card.getAttribute('data-id'),
      detailsButton ? detailsButton.getAttribute('data-position-id') : '',
      detailsButton ? detailsButton.getAttribute('data-id') : '',
      card.id,
      detailsButton ? detailsButton.id : ''
    ].map(value => utils.normalizeText(value)).filter(Boolean);

    const stableSignature = `${title}|${company}|${infoText}|${index + 1}`;
    const derivedId = idCandidates[0] || `rv-${hashText(stableSignature)}`;
    const origin = (root.location && root.location.origin) ? root.location.origin : 'https://app.careers.revelo.com';
    const fallbackUrl = `${origin}/home#job=${encodeURIComponent(derivedId)}`;

    const linkedUrlNode = card.querySelector('a[href*="/positions/"], a[href*="/job/"], a[href*="/jobs/"], a[href*="careers.revelo.com"]');
    const linkedUrl = linkedUrlNode ? toAbsoluteUrl(linkedUrlNode.getAttribute('href') || linkedUrlNode.href || '', root.location && root.location.href) : '';

    const job = utils.createEmptyJob({
      JobId: derivedId,
      JobUrl: linkedUrl || fallbackUrl,
      JobTitle: title,
      JobCompany: company,
      JobLocation: parseLocation(cardText, title, utils),
      JobModality: parseModality(infoText),
      JobSalary: parseSalary(infoText, utils),
      JobTags: tags.join(', ')
    });

    if (!job.JobDescription) {
      job.JobDescription = cardText;
    }
    return job;
  }

  function enrichFromDrawer(job, documentRef, utils) {
    const drawer = getDrawerNode(documentRef);
    if (!drawer) return job;

    const titleEl = drawer.querySelector('h1, h2, h3, [data-test="position-title"]');
    const companyEl = drawer.querySelector('[data-test="position-company"], [class*="company"]');
    const bodyEl = drawer.querySelector(selectors.drawerBody);
    const linkEl = drawer.querySelector('a[href*="/positions/"], a[href*="/job/"], a[href*="/jobs/"], a[href*="careers.revelo.com"]');
    const headerEl = drawer.querySelector(selectors.drawerHeader);

    const drawerTitle = utils.normalizeText(titleEl ? titleEl.textContent : '');
    const drawerCompany = utils.normalizeText(companyEl ? companyEl.textContent : '');
    const drawerDescription = utils.normalizeText(bodyEl ? (bodyEl.innerText || bodyEl.textContent || '') : (drawer.textContent || ''));
    const drawerHeader = utils.normalizeText(headerEl ? headerEl.textContent : '');
    const drawerUrl = linkEl ? toAbsoluteUrl(linkEl.getAttribute('href') || linkEl.href || '', root.location && root.location.href) : '';

    if (drawerTitle) job.JobTitle = drawerTitle;
    if (drawerCompany && !job.JobCompany) job.JobCompany = drawerCompany;
    if (drawerUrl) {
      job.JobUrl = drawerUrl;
      if (!job.JobId) {
        job.JobId = `rv-${hashText(drawerUrl)}`;
      }
    }
    if (drawerDescription) {
      job.JobDescription = drawerDescription.length > 10000
        ? `${drawerDescription.slice(0, 10000)}...`
        : drawerDescription;
    }
    if (!job.JobDescription && drawerHeader) {
      job.JobDescription = drawerHeader;
    }
    return job;
  }

  async function closeDrawer(documentRef, debug) {
    const closeButton = documentRef.querySelector(selectors.drawerClose);
    if (closeButton) {
      fireClick(closeButton);
    } else {
      const overlay = documentRef.querySelector(selectors.drawerOverlay);
      if (overlay) {
        fireClick(overlay);
      }
    }

    const closed = await waitFor(() => !getDrawerNode(documentRef), REVELO_CLOSE_TIMEOUT_MS, 120);
    if (!closed) {
      debug && debug.add('reveloDrawerCloseTimeout', {});
    }
    return closed;
  }

  async function openAndReadDrawer(card, documentRef, job, utils, debug, cardIndex, cardTotal) {
    const index = Number.isFinite(cardIndex) ? (cardIndex + 1) : 0;
    const total = Number.isFinite(cardTotal) ? cardTotal : 0;
    const startedAt = Date.now();
    const button = card.querySelector(selectors.detailsButton);
    debug && debug.add('reveloCardOpenStart', {
      index: index,
      total: total,
      jobId: job.JobId || '',
      title: job.JobTitle || ''
    });

    if (!button) {
      debug && debug.add('reveloNoDetailsButton', {
        index: index,
        total: total,
        jobId: job.JobId || '',
        title: job.JobTitle || ''
      });
      return job;
    }

    if (getDrawerNode(documentRef)) {
      debug && debug.add('reveloCardCloseStaleDrawer', {
        index: index,
        total: total,
        jobId: job.JobId || ''
      });
      await closeDrawer(documentRef, debug);
      await sleep(REVELO_STEP_WAIT_MS);
    }

    const clicked = fireClick(button);
    debug && debug.add('reveloCardOpenClick', {
      index: index,
      total: total,
      jobId: job.JobId || '',
      clicked: clicked
    });
    await sleep(REVELO_STEP_WAIT_MS);

    const opened = await waitFor(() => {
      const drawer = getDrawerNode(documentRef);
      if (!drawer) return false;
      const currentSignature = getDrawerSignature(documentRef, utils);
      return currentSignature.length > 0;
    }, REVELO_DRAWER_TIMEOUT_MS, 120);

    if (!opened) {
      debug && debug.add('reveloDrawerOpenTimeout', {
        index: index,
        total: total,
        jobId: job.JobId || '',
        title: job.JobTitle || '',
        elapsedMs: Date.now() - startedAt
      });
      return job;
    }

    enrichFromDrawer(job, documentRef, utils);
    debug && debug.add('reveloCardParsed', {
      index: index,
      total: total,
      jobId: job.JobId || '',
      title: job.JobTitle || '',
      descriptionLength: String(job.JobDescription || '').length
    });
    const closed = await closeDrawer(documentRef, debug);
    debug && debug.add('reveloCardCloseResult', {
      index: index,
      total: total,
      jobId: job.JobId || '',
      closed: closed,
      elapsedMs: Date.now() - startedAt
    });
    await sleep(REVELO_STEP_WAIT_MS);
    return job;
  }

  async function waitForCards(documentRef, debug) {
    const ready = await waitFor(() => documentRef.querySelectorAll(selectors.cards).length > 0, REVELO_LIST_READY_TIMEOUT_MS, 150);
    if (!ready) {
      debug && debug.add('reveloCardsTimeout', { timeoutMs: REVELO_LIST_READY_TIMEOUT_MS });
    }
    return ready;
  }

  function resolveScrollableRoot(documentRef) {
    const candidates = [
      documentRef.querySelector('.home-main__container'),
      documentRef.querySelector('.home-main'),
      documentRef.querySelector('main'),
      documentRef.scrollingElement,
      documentRef.documentElement,
      documentRef.body
    ].filter(Boolean);

    let best = candidates[0] || null;
    let bestScore = -1;
    for (let i = 0; i < candidates.length; i++) {
      const node = candidates[i];
      const score = Math.max(0, (node.scrollHeight || 0) - (node.clientHeight || 0));
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  async function scrollListForLazyLoad(documentRef, debug) {
    const scrollRoot = resolveScrollableRoot(documentRef);
    if (!scrollRoot) return;

    let lastCount = 0;
    let stableRounds = 0;

    for (let i = 0; i < REVELO_SCROLL_MAX_ROUNDS; i++) {
      const cardsCount = documentRef.querySelectorAll(selectors.cards).length;
      const maxTop = Math.max(0, (scrollRoot.scrollHeight || 0) - (scrollRoot.clientHeight || 0));
      const currentTop = Math.max(0, scrollRoot.scrollTop || 0);

      if (cardsCount <= lastCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }
      lastCount = cardsCount;

      if (currentTop >= maxTop || stableRounds >= REVELO_SCROLL_STABLE_ROUNDS) {
        break;
      }

      scrollRoot.scrollTop = maxTop;
      if (typeof root.scrollTo === 'function' && (scrollRoot === documentRef.body || scrollRoot === documentRef.documentElement || scrollRoot === documentRef.scrollingElement)) {
        try {
          root.scrollTo(0, maxTop);
        } catch (error) {
          // Ignore scroll errors
        }
      }
      await sleep(REVELO_SCROLL_WAIT_MS);
    }

    debug && debug.add('reveloScrollComplete', {
      cards: documentRef.querySelectorAll(selectors.cards).length
    });
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seen = new Set();

    await waitForCards(documentRef, debug);
    await scrollListForLazyLoad(documentRef, debug);
    const cards = Array.from(documentRef.querySelectorAll(selectors.cards));
    debug && debug.add('reveloCardsFound', { count: cards.length });

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card) continue;
      const cardStartedAt = Date.now();
      let job = extractCardBase(card, i, documentRef, utils);
      debug && debug.add('reveloCardStart', {
        index: i + 1,
        total: cards.length,
        jobId: job.JobId || '',
        title: job.JobTitle || ''
      });
      job = await openAndReadDrawer(card, documentRef, job, utils, debug, i, cards.length);

      if (!job.JobId) {
        job.JobId = `rv-${hashText(`${job.JobTitle}|${job.JobCompany}|${i + 1}`)}`;
      }
      if (!job.JobUrl) {
        const origin = (root.location && root.location.origin) ? root.location.origin : 'https://app.careers.revelo.com';
        job.JobUrl = `${origin}/home#job=${encodeURIComponent(job.JobId)}`;
      }

      job.enriched = true;

      const dedupKey = `${job.JobUrl}|${job.JobId}`;
      if (seen.has(dedupKey)) {
        debug && debug.add('reveloCardDuplicate', {
          index: i + 1,
          total: cards.length,
          jobId: job.JobId || '',
          url: job.JobUrl || '',
          elapsedMs: Date.now() - cardStartedAt
        });
        continue;
      }
      seen.add(dedupKey);
      jobs.push(job);
      debug && debug.add('reveloCardDone', {
        index: i + 1,
        total: cards.length,
        jobId: job.JobId || '',
        title: job.JobTitle || '',
        url: job.JobUrl || '',
        descriptionLength: String(job.JobDescription || '').length,
        elapsedMs: Date.now() - cardStartedAt
      });
    }

    debug && debug.add('reveloListComplete', {
      cardsSeen: cards.length,
      jobsCollected: jobs.length
    });
    return jobs;
  }

  async function scrapeDetail(doc, ctx) {
    const documentRef = doc || document;
    const utils = getUtils();
    const pageUrl = (ctx && ctx.url) || (root.location ? root.location.href : '');
    const baseId = `rv-${hashText(pageUrl)}`;

    const titleEl = documentRef.querySelector('h1, h2, h3, [data-test="position-title"], .home-position-card__title');
    const companyEl = documentRef.querySelector('[data-test="position-company"], [class*="company"]');
    const bodyEl = documentRef.querySelector(selectors.drawerBody) || documentRef.querySelector('main, article, section');

    const title = utils.normalizeText(titleEl ? titleEl.textContent : '') || 'Untitled';
    const company = utils.normalizeText(companyEl ? companyEl.textContent : '');
    const description = utils.normalizeText(bodyEl ? (bodyEl.innerText || bodyEl.textContent || '') : '');

    return utils.createEmptyJob({
      JobId: baseId,
      JobUrl: pageUrl,
      JobTitle: title,
      JobCompany: company,
      JobDescription: description.length > 10000 ? `${description.slice(0, 10000)}...` : description,
      enriched: true
    });
  }

  const source = {
    id: 'revelo',
    name: 'Revelo',
    match(url) {
      const value = String(url || '').toLowerCase();
      return value.includes('careers.revelo.com');
    },
    scrapeList: scrapeList,
    scrapeDetail: scrapeDetail
  };

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource(source);
  }
})();
