/**
 * Source: Torc (platform.torc.dev)
 * List: #/jobs/matches (collect match links)
 * Detail: #/jobs/matches/<id> (enrich by opening each link)
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));

  const selectors = {
    matchLink: 'a[href*="#/jobs/matches/"], a[href*="/jobs/matches/"]',
    title: 'h1, h2, h3, [data-test*="title"], [class*="title"], [class*="font-title"], [class*="font-label"]',
    primaryContent: 'main, article, section, [class*="prose"], [class*="description"], [class*="content"]',
    chips: '[class*="badge"], [class*="chip"], [class*="tag"]',
    detailCard: 'div[class*="bg-background-default-secondary"][class*="rounded-md"]',
    detailSection: 'div[class*="flex"][class*="flex-col"][class*="gap-3"]',
    detailSectionTitle: 'h2, h3, h4, [class*="text-title"]',
    detailSectionBody: '[class*="text-body"]'
  };

  const TORC_LIST_READY_TIMEOUT_MS = 20000;
  const TORC_LIST_SCROLL_MAX_ROUNDS = 35;
  const TORC_LIST_SCROLL_STABLE_ROUNDS = 5;
  const TORC_LIST_SCROLL_JITTER_MIN_MS = 650;
  const TORC_LIST_SCROLL_JITTER_MAX_MS = 1500;
  const TORC_LIST_ITEM_JITTER_MIN_MS = 80;
  const TORC_LIST_ITEM_JITTER_MAX_MS = 260;
  const TORC_DETAIL_READY_JITTER_MIN_MS = 450;
  const TORC_DETAIL_READY_JITTER_MAX_MS = 1300;
  const TORC_DETAIL_READY_TIMEOUT_MS = 12000;
  const TORC_BOILERPLATE_TOKENS = [
    'back',
    'profile',
    'my jobs',
    'community hub',
    'loading',
    'about',
    'about us',
    'companies',
    'community',
    'blog',
    'accommodations',
    'data privacy',
    'privacy policy',
    'terms of use',
    'legal',
    'resources',
    'faqs',
    'newsroom',
    'all jobs',
    'kirill nickolsky',
    'you need to enable javascript to run this app',
    'googletagmanager.com'
  ];

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

  function randomInt(minValue, maxValue) {
    const min = Math.max(0, parseInt(minValue, 10) || 0);
    const max = Math.max(min, parseInt(maxValue, 10) || min);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async function sleepJitter(minMs, maxMs) {
    const delay = randomInt(minMs, maxMs);
    await sleep(delay);
    return delay;
  }

  function toAbsoluteUrl(href) {
    if (!href) return '';
    try {
      return new URL(String(href), root.location ? root.location.href : 'https://platform.torc.dev/#/jobs/matches').href;
    } catch (error) {
      return '';
    }
  }

  function normalizeTorcUrl(href) {
    const absolute = toAbsoluteUrl(href);
    if (!absolute) return '';
    try {
      const parsed = new URL(absolute);
      const normalized = `${parsed.origin}${parsed.pathname}${parsed.hash || ''}`;
      return normalized;
    } catch (error) {
      return absolute;
    }
  }

  function extractTorcJobId(url) {
    const value = String(url || '');
    const match = value.match(/(?:#\/|\/)jobs\/matches\/([a-f0-9-]{8,})/i);
    return match ? match[1] : '';
  }

  function waitFor(condition, timeoutMs, intervalMs) {
    const timeout = Math.max(200, timeoutMs || 2000);
    const interval = Math.max(40, intervalMs || 120);
    const startedAt = Date.now();
    return new Promise(resolve => {
      const tick = async function() {
        let ok = false;
        try {
          ok = !!condition();
        } catch (error) {
          ok = false;
        }
        if (ok) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= timeout) {
          resolve(false);
          return;
        }
        await sleep(interval);
        tick();
      };
      tick();
    });
  }

  function resolveScrollableRoot(documentRef) {
    const candidates = [
      documentRef.querySelector('[class*="overflow-y-auto"]'),
      documentRef.querySelector('[class*="overflow-auto"]'),
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

    let stableRounds = 0;
    let lastCount = 0;
    for (let i = 0; i < TORC_LIST_SCROLL_MAX_ROUNDS; i++) {
      const linksCount = documentRef.querySelectorAll(selectors.matchLink).length;
      const maxTop = Math.max(0, (scrollRoot.scrollHeight || 0) - (scrollRoot.clientHeight || 0));
      const currentTop = Math.max(0, scrollRoot.scrollTop || 0);

      if (linksCount <= lastCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }
      lastCount = linksCount;

      if (currentTop >= maxTop || stableRounds >= TORC_LIST_SCROLL_STABLE_ROUNDS) {
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
      const waitMs = await sleepJitter(TORC_LIST_SCROLL_JITTER_MIN_MS, TORC_LIST_SCROLL_JITTER_MAX_MS);
      debug && debug.add('torcListScroll', {
        round: i + 1,
        links: linksCount,
        waitMs: waitMs
      });
    }
  }

  function stripBoilerplateText(text, utils) {
    const value = utils.normalizeText(text || '');
    if (!value) return '';
    let cleaned = value;
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');
    for (let i = 0; i < TORC_BOILERPLATE_TOKENS.length; i++) {
      const token = TORC_BOILERPLATE_TOKENS[i];
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleaned = cleaned.replace(new RegExp(escaped, 'ig'), ' ');
    }
    cleaned = cleaned
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\/|.,;:()\-\u2022]+/, '')
      .trim();
    return cleaned;
  }

  function isLikelyBoilerplateOnlyText(text, utils) {
    const value = utils.normalizeText(text || '');
    if (!value) return true;
    const lower = value.toLowerCase();
    if (lower.includes('you need to enable javascript to run this app')) return true;
    if (lower.includes('googletagmanager.com')) return true;
    if (/<iframe|<noscript/i.test(value)) return true;
    let hits = 0;
    for (let i = 0; i < TORC_BOILERPLATE_TOKENS.length; i++) {
      if (lower.includes(TORC_BOILERPLATE_TOKENS[i])) {
        hits += 1;
      }
    }
    if (hits >= 4 && value.length < 1200) return true;
    if (/^back\s*\/?\s*$/i.test(value)) return true;
    return false;
  }

  function sanitizeTitleCandidate(rawText, utils) {
    let value = utils.normalizeText(rawText || '');
    if (!value) return '';
    value = value.replace(/^back\s*\/\s*/i, '');
    value = value.replace(/\s+/g, ' ').trim();
    const lower = value.toLowerCase();
    if (!value || value.length < 4) return '';
    if (/^(back|profile|my jobs|community hub|loading|view more|jobs|matches)$/.test(lower)) return '';
    if (/^(the ask|responsibilities|requirements|must-have skills?|status update)$/.test(lower)) return '';
    if (lower.includes('privacy policy') || lower.includes('terms of use')) return '';
    if (isLikelyBoilerplateOnlyText(value, utils)) return '';
    return value;
  }

  function scoreTitleCandidate(text) {
    if (!text) return -100;
    let score = 0;
    if (/\s-\s/.test(text)) score += 5;
    if (/\([^)]+\)/.test(text)) score += 3;
    if (text.split(' ').length >= 2) score += 2;
    if (text.length >= 12 && text.length <= 90) score += 2;
    if (text.length > 120) score -= 3;
    if (/^(the ask|responsibilities|requirements)/i.test(text)) score -= 4;
    return score;
  }

  function pickBestTitle(node, utils) {
    if (!node) return '';
    const nodes = Array.from(node.querySelectorAll(selectors.title));
    let bestText = '';
    let bestScore = -100;
    for (let i = 0; i < nodes.length; i++) {
      const candidate = sanitizeTitleCandidate(nodes[i].textContent || '', utils);
      if (!candidate) continue;
      const score = scoreTitleCandidate(candidate);
      if (score > bestScore) {
        bestScore = score;
        bestText = candidate;
      }
    }
    return bestScore >= 2 ? bestText : '';
  }

  function parseTitleParts(title, utils) {
    const value = utils.normalizeText(title || '');
    const result = { role: '', company: '', location: '' };
    if (!value) return result;

    const match = value.match(/^(.+?)\s*-\s*([^(]+?)(?:\s*\(([^)]+)\))?$/);
    if (!match) {
      result.role = value;
      return result;
    }
    result.role = utils.normalizeText(match[1] || '');
    result.company = utils.normalizeText(match[2] || '');
    result.location = utils.normalizeText(match[3] || '');
    return result;
  }

  function parseCompanyFromTitle(title, utils) {
    const value = utils.normalizeText(title || '');
    if (!value.includes(' - ')) return '';
    const parts = value.split(' - ');
    if (parts.length < 2) return '';
    return utils.normalizeText(parts.slice(1).join(' - '));
  }

  function parseLocation(text, utils) {
    const value = utils.normalizeText(text || '');
    const match = value.match(/\b(remote|latam|brazil|argentina|mexico|colombia|uruguay|chile|peru)\b[^,;|]*/i);
    return match ? utils.normalizeText(match[0]) : '';
  }

  function parseModality(text, utils) {
    const value = utils.normalizeText(text || '').toLowerCase();
    if (value.includes('full-time') || value.includes('full time')) return 'Full-time';
    if (value.includes('part-time') || value.includes('part time')) return 'Part-time';
    if (value.includes('contract')) return 'Contract';
    return '';
  }

  function parseSalary(text, utils) {
    const value = utils.normalizeText(text || '');
    const match = value.match(/([$€£]|usd|eur|brl|mxn)[^,;\n]{3,120}/i);
    return match ? utils.normalizeText(match[0]) : '';
  }

  function extractTagsFromNode(node, utils) {
    if (!node) return '';
    const tags = [];
    const seen = new Set();
    const tagNodes = Array.from(node.querySelectorAll(selectors.chips));
    for (let i = 0; i < tagNodes.length; i++) {
      const text = utils.normalizeText(tagNodes[i].textContent || '');
      const lower = text.toLowerCase();
      if (!text) continue;
      if (text.length < 2 || text.length > 42) continue;
      if (lower === 'view more' || lower === 'interested') continue;
      if (/\b(profile|community hub|my jobs|loading|back)\b/i.test(lower)) continue;
      if (/^\d+\s*\/\s*\d+$/.test(lower)) continue;
      if (seen.has(lower)) continue;
      seen.add(lower);
      tags.push(text);
      if (tags.length >= 10) break;
    }
    return tags.join(', ');
  }

  function findJobLinks(documentRef) {
    const anchors = Array.from(documentRef.querySelectorAll(selectors.matchLink));
    const links = [];
    const seen = new Set();

    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const href = anchor.getAttribute('href') || anchor.href || '';
      const url = normalizeTorcUrl(href);
      const jobId = extractTorcJobId(url);
      if (!url || !jobId) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      links.push({ anchor, url, jobId });
    }
    return links;
  }

  function buildListJob(anchor, url, jobId, index, utils) {
    const card = anchor.closest('article, li, [class*="rounded"], [class*="border"], [class*="card"], div') || anchor;
    const title = pickBestTitle(card, utils) || `Torc match ${index + 1}`;
    const cardText = utils.normalizeText(card.innerText || card.textContent || '');
    const company = parseCompanyFromTitle(title, utils);
    const descriptionSnippet = cardText.length > 420 ? `${cardText.slice(0, 420)}...` : cardText;

    return utils.createEmptyJob({
      JobUrl: url,
      JobId: jobId,
      JobTitle: title,
      JobCompany: company,
      JobLocation: parseLocation(cardText, utils),
      JobModality: parseModality(cardText, utils),
      JobSalary: parseSalary(cardText, utils),
      JobTags: extractTagsFromNode(card, utils),
      JobDescription: descriptionSnippet
    });
  }

  function findMatchHeroNode(documentRef, jobId, title, utils) {
    if (jobId) {
      const anchor = documentRef.querySelector(
        `a[href*="#/jobs/matches/${jobId}"], a[href*="/jobs/matches/${jobId}"]`
      );
      if (anchor) {
        let current = anchor;
        while (current && current !== documentRef.body) {
          const text = utils.normalizeText(current.innerText || current.textContent || '');
          if (text.length >= 40 && text.length <= 3200) {
            const className = String(current.className || '');
            if (/rounded|card|border|background|secondary|mb-1|px-6|pt-8/i.test(className)) {
              return current;
            }
          }
          current = current.parentElement;
        }
      }
    }

    if (title) {
      const headingNodes = Array.from(documentRef.querySelectorAll('h1, h2, h3, [class*="font-title"], [class*="font-label"]'));
      for (let i = 0; i < headingNodes.length; i++) {
        const headingText = sanitizeTitleCandidate(headingNodes[i].textContent || '', utils);
        if (!headingText) continue;
        if (headingText.toLowerCase() !== title.toLowerCase()) continue;
        let current = headingNodes[i];
        while (current && current !== documentRef.body) {
          const text = utils.normalizeText(current.innerText || current.textContent || '');
          if (text.length >= 40 && text.length <= 3200) {
            return current;
          }
          current = current.parentElement;
        }
      }
    }
    return null;
  }

  function collectDetailSectionsDescription(documentRef, utils, debug) {
    const cards = Array.from(documentRef.querySelectorAll(selectors.detailCard));
    const blocks = [];
    const seen = new Set();

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const sections = Array.from(card.querySelectorAll(selectors.detailSection));
      if (sections.length === 0) continue;

      for (let j = 0; j < sections.length; j++) {
        const section = sections[j];
        const headingEl = section.querySelector(selectors.detailSectionTitle);
        const bodyEl = section.querySelector(selectors.detailSectionBody);
        const heading = sanitizeTitleCandidate(headingEl ? headingEl.textContent : '', utils);
        let bodyText = utils.normalizeText(
          bodyEl ? (bodyEl.innerText || bodyEl.textContent || '') : (section.innerText || section.textContent || '')
        );
        if (heading && bodyText.toLowerCase().startsWith(heading.toLowerCase())) {
          bodyText = utils.normalizeText(bodyText.slice(heading.length));
        }
        bodyText = stripBoilerplateText(bodyText, utils);

        if (!bodyText || bodyText.length < 60) continue;
        if (isLikelyBoilerplateOnlyText(bodyText, utils)) continue;
        if (heading && /^(status update|must-have skills?)$/i.test(heading)) continue;

        const composed = heading ? `${heading}\n${bodyText}` : bodyText;
        const key = composed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push(composed);
      }
    }

    if (blocks.length > 0) {
      const joined = blocks.join('\n\n');
      debug && debug.add('torcDetailSections', { blocks: blocks.length, length: joined.length });
      return joined.length > 10000 ? `${joined.slice(0, 10000)}...` : joined;
    }

    const fallbackNodes = Array.from(documentRef.querySelectorAll(selectors.primaryContent));
    let fallback = '';
    for (let i = 0; i < fallbackNodes.length; i++) {
      const text = stripBoilerplateText(fallbackNodes[i].innerText || fallbackNodes[i].textContent || '', utils);
      if (!text || text.length < 80) continue;
      if (isLikelyBoilerplateOnlyText(text, utils)) continue;
      if (text.length > fallback.length) {
        fallback = text;
      }
    }
    if (!fallback && documentRef.body) {
      fallback = stripBoilerplateText(documentRef.body.innerText || documentRef.body.textContent || '', utils);
    }
    if (isLikelyBoilerplateOnlyText(fallback, utils)) {
      return '';
    }
    if (fallback.length > 10000) {
      return `${fallback.slice(0, 10000)}...`;
    }
    return fallback;
  }

  function extractMustHaveSkillTags(documentRef, utils, debug) {
    const headings = Array.from(documentRef.querySelectorAll('h2, h3, h4, p, strong'));
    for (let i = 0; i < headings.length; i++) {
      const headingText = utils.normalizeText(headings[i].textContent || '');
      if (!/must[- ]?have skills?/i.test(headingText)) continue;
      const parent = headings[i].parentElement || headings[i];
      const tags = extractTagsFromNode(parent, utils);
      if (tags) {
        debug && debug.add('torcMustHaveTags', { count: tags.split(',').length });
        return tags;
      }
      if (parent.nextElementSibling) {
        const siblingTags = extractTagsFromNode(parent.nextElementSibling, utils);
        if (siblingTags) {
          debug && debug.add('torcMustHaveTags', { count: siblingTags.split(',').length });
          return siblingTags;
        }
      }
    }
    return '';
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();

    await sleepJitter(120, 420);
    const ready = await waitFor(
      () => documentRef.querySelectorAll(selectors.matchLink).length > 0,
      TORC_LIST_READY_TIMEOUT_MS,
      180
    );

    if (!ready) {
      debug && debug.add('torcListReadyTimeout', { timeoutMs: TORC_LIST_READY_TIMEOUT_MS });
    }

    await scrollListForLazyLoad(documentRef, debug);
    const links = findJobLinks(documentRef);
    debug && debug.add('torcLinksCollected', { count: links.length });

    const jobs = [];
    for (let i = 0; i < links.length; i++) {
      const item = links[i];
      const job = buildListJob(item.anchor, item.url, item.jobId, i, utils);
      jobs.push(job);

      const waitMs = await sleepJitter(TORC_LIST_ITEM_JITTER_MIN_MS, TORC_LIST_ITEM_JITTER_MAX_MS);
      debug && debug.add('torcListItem', {
        index: i + 1,
        total: links.length,
        jobId: job.JobId || '',
        waitMs: waitMs
      });
    }

    return jobs;
  }

  async function scrapeDetail(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const pageUrl = normalizeTorcUrl((ctx && ctx.url) || (root.location ? root.location.href : ''));
    const jobId = extractTorcJobId(pageUrl) || '';

    const initialJitter = await sleepJitter(TORC_DETAIL_READY_JITTER_MIN_MS, TORC_DETAIL_READY_JITTER_MAX_MS);
    const ready = await waitFor(
      () => {
        const text = utils.normalizeText(documentRef.body ? (documentRef.body.innerText || '') : '');
        return text.length > 120;
      },
      TORC_DETAIL_READY_TIMEOUT_MS,
      180
    );

    debug && debug.add('torcDetailReady', {
      ready: ready,
      jitterMs: initialJitter,
      url: pageUrl
    });

    const bestTitle = pickBestTitle(documentRef, utils);
    const titleParts = parseTitleParts(bestTitle, utils);
    const heroNode = findMatchHeroNode(documentRef, jobId, bestTitle, utils);
    const heroText = stripBoilerplateText(heroNode ? (heroNode.innerText || heroNode.textContent || '') : '', utils);
    const rawPageText = stripBoilerplateText(documentRef.body ? (documentRef.body.innerText || documentRef.body.textContent || '') : '', utils);
    const pageText = isLikelyBoilerplateOnlyText(rawPageText, utils) ? '' : rawPageText;
    let description = collectDetailSectionsDescription(documentRef, utils, debug);
    if (isLikelyBoilerplateOnlyText(description, utils)) {
      description = '';
    }
    const tags = extractMustHaveSkillTags(documentRef, utils, debug) || extractTagsFromNode(heroNode || documentRef, utils);
    const attrText = stripBoilerplateText(`${heroText} ${description} ${pageText.slice(0, 1200)}`, utils);

    const finalTitle = titleParts.role || bestTitle;
    const finalCompany = titleParts.company || parseCompanyFromTitle(bestTitle, utils);
    const finalLocation = titleParts.location || parseLocation(attrText, utils);
    debug && debug.add('torcDetailParsed', {
      jobId: jobId || '',
      title: finalTitle || '',
      company: finalCompany || '',
      location: finalLocation || '',
      tagsCount: tags ? tags.split(',').length : 0,
      descriptionLength: String(description || '').length
    });

    return utils.createEmptyJob({
      JobUrl: pageUrl,
      JobId: jobId || '',
      JobTitle: finalTitle,
      JobCompany: finalCompany,
      JobLocation: finalLocation,
      JobModality: parseModality(attrText, utils),
      JobSalary: parseSalary(attrText, utils),
      JobTags: tags,
      JobDescription: description,
      enriched: true
    });
  }

  const source = {
    id: 'torc',
    name: 'Torc',
    match(url) {
      const value = String(url || '').toLowerCase();
      return value.includes('platform.torc.dev') || value.includes('.torc.dev');
    },
    scrapeList: scrapeList,
    scrapeDetail: scrapeDetail
  };

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource(source);
  }
})();
