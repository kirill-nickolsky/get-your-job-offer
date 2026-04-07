/**
 * Source: LinkedIn Jobs (linkedin.com)
 * List: /jobs/search* (left rail list + pagination)
 * Detail: /jobs/view/* (job details)
 * Notes: list HTML may embed job IDs in JSON (urn:li:fsd_jobPosting:<id>).
 */
(function () {
  'use strict';
  console.log('[linkedin] 🚀 Initializing LinkedIn source v1.1.24 (DOM Debug)');


  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));

  const selectors = {
    jobLink: 'a[href*="/jobs/view/"]',
    jobCard: 'li, div',
    nextButton: 'button.jobs-search-pagination__button--next, button[aria-label*="Next"], button[aria-label*="Следующая"], button[data-test-pagination-button-next]',
    showMoreButton: 'button.infinite-scroller__show-more-button, button[aria-label*="Show more"], button[aria-label*="Показать больше"]',
    listContainer: '.scaffold-layout__list, .jobs-search-results-list__list, .jobs-search-results-list, .scaffold-layout__list-container, [data-results-list-container]',
    noJobs: '.jobs-search-results-list__no-jobs-available-card'
  };

  const LINKEDIN_NEXT_JITTER_MIN_MS = 900;
  const LINKEDIN_NEXT_JITTER_MAX_MS = 2600;
  const LINKEDIN_VIEWED_DISMISS_JITTER_MIN_MS = 140;
  const LINKEDIN_VIEWED_DISMISS_JITTER_MAX_MS = 520;
  const LINKEDIN_PRECOLLECT_SCROLL_JITTER_MIN_MS = 320;
  const LINKEDIN_PRECOLLECT_SCROLL_JITTER_MAX_MS = 980;
  const LINKEDIN_PRECOLLECT_SCROLL_HUMAN_MIN_STEPS = 3;
  const LINKEDIN_PRECOLLECT_SCROLL_HUMAN_MAX_STEPS = 7;
  const LINKEDIN_PRECOLLECT_SCROLL_HUMAN_STEP_MIN_PX = 180;
  const LINKEDIN_PRECOLLECT_SCROLL_HUMAN_STEP_MAX_PX = 720;
  const LINKEDIN_PRECOLLECT_SCROLL_HUMAN_PAUSE_MIN_MS = 70;
  const LINKEDIN_PRECOLLECT_SCROLL_HUMAN_PAUSE_MAX_MS = 240;
  const LINKEDIN_RECORDED_SCROLL_CHUNK_MIN_STEPS = 4;
  const LINKEDIN_RECORDED_SCROLL_CHUNK_MAX_STEPS = 10;
  const LINKEDIN_MIN_RECORDS_PER_PAGE = 25;
  const LINKEDIN_EXTRA_SCROLL_ATTEMPTS_WHEN_FEW = 30;
  const LINKEDIN_EXTRA_SCROLL_STOP_NO_PROGRESS = 5;
  const LINKEDIN_VIEWED_DISMISS_TIMEOUT_MS = 9000;
  const LINKEDIN_CODED_SCROLL_PROFILE_V1 = {
    version: 1,
    source: 'coded-scroll-v1',
    durationMs: 5000,
    steps: [
      { delta: 307, waitMs: 1517 },
      { delta: 681, waitMs: 83 },
      { delta: 131, waitMs: 167 },
      { delta: 500, waitMs: 150 },
      { delta: 66, waitMs: 66 },
      { delta: 648, waitMs: 617 },
      { delta: 40, waitMs: 67 },
      { delta: 20, waitMs: 50 }
    ]
  };

  function randomInt_(minValue, maxValue) {
    const min = Math.max(0, parseInt(minValue, 10) || 0);
    const max = Math.max(min, parseInt(maxValue, 10) || min);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function getNextClickJitterMs_(ctx) {
    const rawMin = ctx && ctx.linkedinNextJitterMinMs;
    const rawMax = ctx && ctx.linkedinNextJitterMaxMs;
    const minMs = rawMin !== undefined && rawMin !== null ? parseInt(rawMin, 10) : LINKEDIN_NEXT_JITTER_MIN_MS;
    const maxMs = rawMax !== undefined && rawMax !== null ? parseInt(rawMax, 10) : LINKEDIN_NEXT_JITTER_MAX_MS;
    return randomInt_(minMs, maxMs);
  }

  function getViewedDismissJitterMs_(ctx) {
    const rawMin = ctx && ctx.linkedinViewedDismissJitterMinMs;
    const rawMax = ctx && ctx.linkedinViewedDismissJitterMaxMs;
    const minMs = rawMin !== undefined && rawMin !== null ? parseInt(rawMin, 10) : LINKEDIN_VIEWED_DISMISS_JITTER_MIN_MS;
    const maxMs = rawMax !== undefined && rawMax !== null ? parseInt(rawMax, 10) : LINKEDIN_VIEWED_DISMISS_JITTER_MAX_MS;
    return randomInt_(minMs, maxMs);
  }

  function getPreCollectScrollJitterMs_(ctx) {
    const rawMin = ctx && ctx.linkedinPreCollectScrollJitterMinMs;
    const rawMax = ctx && ctx.linkedinPreCollectScrollJitterMaxMs;
    const minMs = rawMin !== undefined && rawMin !== null ? parseInt(rawMin, 10) : LINKEDIN_PRECOLLECT_SCROLL_JITTER_MIN_MS;
    const maxMs = rawMax !== undefined && rawMax !== null ? parseInt(rawMax, 10) : LINKEDIN_PRECOLLECT_SCROLL_JITTER_MAX_MS;
    return randomInt_(minMs, maxMs);
  }

  function resolveLinkedInListContainer_(documentRef) {
    const listSelectors = [
      '.scaffold-layout__list',
      '.jobs-search-results-list__list',
      '.jobs-search-results-list',
      '.scaffold-layout__list-container',
      '[data-results-list-container]'
    ];

    let best = null;
    let bestScore = -1;
    for (let i = 0; i < listSelectors.length; i++) {
      const nodes = Array.from(documentRef.querySelectorAll(listSelectors[i]));
      for (let n = 0; n < nodes.length; n++) {
        const el = nodes[n];
        if (!el) continue;
        const score = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
        if (score > bestScore) {
          best = el;
          bestScore = score;
        }
      }
    }

    if (best) return best;
    return (documentRef && documentRef.scrollingElement) || documentRef.documentElement || documentRef.body;
  }

  function getRecordedLinkedInScrollPreset_(ctx) {
    const fromContext = ctx && ctx.linkedinRecordedScrollProfile && Array.isArray(ctx.linkedinRecordedScrollProfile.steps)
      ? ctx.linkedinRecordedScrollProfile
      : null;
    const profile = fromContext || LINKEDIN_CODED_SCROLL_PROFILE_V1;
    const normalized = [];
    const sourceSteps = Array.isArray(profile.steps) ? profile.steps : [];
    for (let i = 0; i < sourceSteps.length; i++) {
      const step = sourceSteps[i] || {};
      const delta = parseInt(String(step.delta || 0), 10);
      const waitMs = parseInt(String(step.waitMs || 0), 10);
      if (!Number.isFinite(delta) || !Number.isFinite(waitMs)) continue;
      if (delta <= 0 || waitMs <= 0) continue;
      normalized.push({
        delta: Math.max(20, Math.min(delta, 2600)),
        waitMs: Math.max(10, Math.min(waitMs, 2500))
      });
      if (normalized.length >= 320) break;
    }
    return {
      steps: normalized,
      source: fromContext ? 'context-recorded' : 'coded-v1',
      replayExact: !(ctx && ctx.linkedinRecordedScrollReplayExact === false)
    };
  }

  async function scrollLinkedInListBeforeCollect_(documentRef, ctx, pageNumber) {
    const listContainer = resolveLinkedInListContainer_(documentRef);
    const scrollingRoot = (documentRef && documentRef.scrollingElement) || documentRef.documentElement || documentRef.body;
    const useContainerScroll = listContainer && listContainer !== documentRef.body && listContainer !== documentRef.documentElement && listContainer !== scrollingRoot;

    const requestedStepsMin = parseInt(String((ctx && ctx.linkedinPreCollectHumanMinSteps) || LINKEDIN_PRECOLLECT_SCROLL_HUMAN_MIN_STEPS), 10);
    const requestedStepsMax = parseInt(String((ctx && ctx.linkedinPreCollectHumanMaxSteps) || LINKEDIN_PRECOLLECT_SCROLL_HUMAN_MAX_STEPS), 10);
    const requestedStepMinPx = parseInt(String((ctx && ctx.linkedinPreCollectHumanStepMinPx) || LINKEDIN_PRECOLLECT_SCROLL_HUMAN_STEP_MIN_PX), 10);
    const requestedStepMaxPx = parseInt(String((ctx && ctx.linkedinPreCollectHumanStepMaxPx) || LINKEDIN_PRECOLLECT_SCROLL_HUMAN_STEP_MAX_PX), 10);
    const requestedPauseMinMs = parseInt(String((ctx && ctx.linkedinPreCollectHumanPauseMinMs) || LINKEDIN_PRECOLLECT_SCROLL_HUMAN_PAUSE_MIN_MS), 10);
    const requestedPauseMaxMs = parseInt(String((ctx && ctx.linkedinPreCollectHumanPauseMaxMs) || LINKEDIN_PRECOLLECT_SCROLL_HUMAN_PAUSE_MAX_MS), 10);
    const stepsMin = Number.isNaN(requestedStepsMin) ? LINKEDIN_PRECOLLECT_SCROLL_HUMAN_MIN_STEPS : Math.max(1, requestedStepsMin);
    const stepsMax = Number.isNaN(requestedStepsMax) ? LINKEDIN_PRECOLLECT_SCROLL_HUMAN_MAX_STEPS : Math.max(stepsMin, requestedStepsMax);
    const stepMinPx = Number.isNaN(requestedStepMinPx) ? LINKEDIN_PRECOLLECT_SCROLL_HUMAN_STEP_MIN_PX : Math.max(40, requestedStepMinPx);
    const stepMaxPx = Number.isNaN(requestedStepMaxPx) ? LINKEDIN_PRECOLLECT_SCROLL_HUMAN_STEP_MAX_PX : Math.max(stepMinPx, requestedStepMaxPx);
    const pauseMinMs = Number.isNaN(requestedPauseMinMs) ? LINKEDIN_PRECOLLECT_SCROLL_HUMAN_PAUSE_MIN_MS : Math.max(10, requestedPauseMinMs);
    const pauseMaxMs = Number.isNaN(requestedPauseMaxMs) ? LINKEDIN_PRECOLLECT_SCROLL_HUMAN_PAUSE_MAX_MS : Math.max(pauseMinMs, requestedPauseMaxMs);
    const stepsTarget = randomInt_(stepsMin, stepsMax);

    const getCurrentTop = function() {
      if (useContainerScroll) {
        return Math.max(0, listContainer.scrollTop || 0);
      }
      if (scrollingRoot) {
        return Math.max(0, scrollingRoot.scrollTop || 0);
      }
      return Math.max(0, root.pageYOffset || 0);
    };

    const getMaxTop = function() {
      if (useContainerScroll) {
        return Math.max(0, (listContainer.scrollHeight || 0) - (listContainer.clientHeight || 0));
      }
      const docHeight = Math.max(
        (documentRef.documentElement && documentRef.documentElement.scrollHeight) || 0,
        (documentRef.body && documentRef.body.scrollHeight) || 0
      );
      const viewportHeight = Math.max(
        (root && root.innerHeight) || 0,
        (documentRef.documentElement && documentRef.documentElement.clientHeight) || 0
      );
      return Math.max(0, docHeight - viewportHeight);
    };

    const setTop = function(nextTop) {
      const target = Math.max(0, nextTop || 0);
      if (useContainerScroll) {
        listContainer.scrollTop = target;
        return;
      }
      if (scrollingRoot) {
        scrollingRoot.scrollTop = target;
      }
      if (typeof root.scrollTo === 'function') {
        try {
          root.scrollTo(0, target);
        } catch (e) {
          // Ignore scroll errors
        }
      }
    };

    const recordedPreset = getRecordedLinkedInScrollPreset_(ctx);
    const recordedSteps = recordedPreset.steps;
    if (recordedSteps.length > 0) {
      const defaultChunkSize = recordedPreset.replayExact ? recordedSteps.length : LINKEDIN_RECORDED_SCROLL_CHUNK_MIN_STEPS;
      const requestedChunkMin = parseInt(String((ctx && ctx.linkedinRecordedScrollChunkMinSteps) || defaultChunkSize), 10);
      const requestedChunkMax = parseInt(String((ctx && ctx.linkedinRecordedScrollChunkMaxSteps) || (recordedPreset.replayExact ? defaultChunkSize : LINKEDIN_RECORDED_SCROLL_CHUNK_MAX_STEPS)), 10);
      const chunkMin = Number.isNaN(requestedChunkMin) ? LINKEDIN_RECORDED_SCROLL_CHUNK_MIN_STEPS : Math.max(1, requestedChunkMin);
      const chunkMax = Number.isNaN(requestedChunkMax) ? LINKEDIN_RECORDED_SCROLL_CHUNK_MAX_STEPS : Math.max(chunkMin, requestedChunkMax);
      const chunkSize = randomInt_(chunkMin, chunkMax);
      const initialTop = getCurrentTop();
      let stepsDone = 0;
      let totalDelta = 0;
      let cursor = (ctx && typeof ctx.__linkedinRecordedScrollCursor === 'number')
        ? ctx.__linkedinRecordedScrollCursor
        : 0;
      if (cursor < 0 || !Number.isFinite(cursor)) {
        cursor = 0;
      }

      for (let i = 0; i < chunkSize; i++) {
        const maxTop = getMaxTop();
        const currentTop = getCurrentTop();
        const remaining = Math.max(0, maxTop - currentTop);
        if (remaining <= 2) {
          break;
        }

        const profileStep = recordedSteps[cursor % recordedSteps.length];
        cursor++;
        const deltaScale = recordedPreset.replayExact ? 1 : (randomInt_(85, 130) / 100);
        const waitScale = recordedPreset.replayExact ? 1 : (randomInt_(80, 135) / 100);
        const desiredDelta = Math.max(20, Math.round(profileStep.delta * deltaScale));
        const desiredWait = Math.max(10, Math.round(profileStep.waitMs * waitScale));
        const delta = Math.min(remaining, desiredDelta);
        setTop(currentTop + delta);
        const afterTop = getCurrentTop();
        totalDelta += Math.max(0, afterTop - currentTop);
        stepsDone++;

        if (i + 1 < chunkSize) {
          await sleep(Math.max(15, Math.min(desiredWait, 2200)));
        }
      }

      if (ctx && typeof ctx === 'object') {
        ctx.__linkedinRecordedScrollCursor = cursor % recordedSteps.length;
      }

      const settleWaitMs = getPreCollectScrollJitterMs_(ctx);
      await sleep(settleWaitMs);
      const finalTop = getCurrentTop();
      if (ctx && ctx.debug && typeof ctx.debug.add === 'function') {
        ctx.debug.add('linkedinPreCollectScroll', {
          page: pageNumber,
          mode: useContainerScroll ? 'container' : 'window',
          strategy: 'recorded-profile',
          profileSource: recordedPreset.source,
          replayExact: recordedPreset.replayExact,
          moved: finalTop > initialTop,
          stepsTarget: chunkSize,
          stepsDone: stepsDone,
          totalDelta: totalDelta,
          settleWaitMs: settleWaitMs
        });
      }
      return;
    }

    const initialTop = getCurrentTop();
    let stepsDone = 0;
    let totalDelta = 0;
    for (let i = 0; i < stepsTarget; i++) {
      const maxTop = getMaxTop();
      const currentTop = getCurrentTop();
      const remaining = Math.max(0, maxTop - currentTop);
      if (remaining <= 2) {
        break;
      }

      const desiredStep = randomInt_(stepMinPx, stepMaxPx);
      const delta = Math.min(remaining, desiredStep);
      const nextTop = currentTop + delta;
      setTop(nextTop);
      const afterTop = getCurrentTop();
      totalDelta += Math.max(0, afterTop - currentTop);
      stepsDone++;

      if (i + 1 < stepsTarget) {
        await sleep(randomInt_(pauseMinMs, pauseMaxMs));
      }
    }

    // Keep previous pacing as a final settle wait for lazy loaders.
    const settleWaitMs = getPreCollectScrollJitterMs_(ctx);
    await sleep(settleWaitMs);

    const finalTop = getCurrentTop();
    if (ctx && ctx.debug && typeof ctx.debug.add === 'function') {
      ctx.debug.add('linkedinPreCollectScroll', {
        page: pageNumber,
        mode: useContainerScroll ? 'container' : 'window',
        moved: finalTop > initialTop,
        stepsTarget: stepsTarget,
        stepsDone: stepsDone,
        totalDelta: totalDelta,
        settleWaitMs: settleWaitMs
      });
    }
  }

  async function ensureMinRecordsBeforeCollect_(documentRef, ctx, pageNumber) {
    const requestedMin = parseInt(String((ctx && ctx.linkedinMinRecordsPerPage) || LINKEDIN_MIN_RECORDS_PER_PAGE), 10);
    const requestedExtraScrolls = parseInt(String((ctx && ctx.linkedinExtraScrollAttemptsWhenFew) || LINKEDIN_EXTRA_SCROLL_ATTEMPTS_WHEN_FEW), 10);
    const requestedNoProgressLimit = parseInt(String((ctx && ctx.linkedinExtraScrollStopNoProgress) || LINKEDIN_EXTRA_SCROLL_STOP_NO_PROGRESS), 10);
    const minRecords = Number.isNaN(requestedMin) ? LINKEDIN_MIN_RECORDS_PER_PAGE : Math.max(1, requestedMin);
    const maxExtraScrolls = Number.isNaN(requestedExtraScrolls) ? LINKEDIN_EXTRA_SCROLL_ATTEMPTS_WHEN_FEW : Math.max(0, requestedExtraScrolls);
    const noProgressLimit = Number.isNaN(requestedNoProgressLimit) ? LINKEDIN_EXTRA_SCROLL_STOP_NO_PROGRESS : Math.max(1, requestedNoProgressLimit);

    let count = pickLinkedInCards_(documentRef).length;
    if (count >= minRecords || maxExtraScrolls === 0) {
      return;
    }

    let extraScrolls = 0;
    let noProgressRounds = 0;
    let lastCount = count;
    while (count < minRecords && extraScrolls < maxExtraScrolls) {
      await scrollLinkedInListBeforeCollect_(documentRef, ctx, pageNumber);
      extraScrolls++;
      count = pickLinkedInCards_(documentRef).length;
      if (count > lastCount) {
        noProgressRounds = 0;
      } else {
        noProgressRounds++;
      }
      lastCount = count;
      if (noProgressRounds >= noProgressLimit) {
        break;
      }
    }

    if (ctx && ctx.debug && typeof ctx.debug.add === 'function') {
      ctx.debug.add('linkedinEnsureMinRecords', {
        page: pageNumber,
        minRecords: minRecords,
        finalCount: count,
        extraScrolls: extraScrolls,
        noProgressRounds: noProgressRounds
      });
    }
  }

  function pickLinkedInCards_(documentRef) {
    const cardSelectors = [
      'li.scaffold-layout__list-item',
      'li.jobs-search-results__list-item',
      'div.job-card-container'
    ];
    let cards = [];
    for (let i = 0; i < cardSelectors.length; i++) {
      const found = Array.from(documentRef.querySelectorAll(cardSelectors[i]));
      if (found.length > cards.length) {
        cards = found;
      }
    }
    return cards;
  }

  function findCloseButtonForViewedCard_(card) {
    if (!card) return null;
    const closeSelectors = [
      'button#close-small',
      'button[id="close-small"]',
      'button[aria-label*="dismiss" i]',
      'button[aria-label*="hide" i]',
      'button[aria-label*="not interested" i]'
    ];
    for (let s = 0; s < closeSelectors.length; s++) {
      const candidate = card.querySelector(closeSelectors[s]);
      if (!candidate) continue;
      const id = String(candidate.id || '').trim().toLowerCase();
      if (id === 'undo-small') continue;
      if (candidate.disabled) continue;
      const style = root.getComputedStyle ? root.getComputedStyle(candidate) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;
      return candidate;
    }
    return null;
  }

  async function dismissViewedCardsBeforePaging_(documentRef, ctx, pageNumber) {
    if (!(ctx && ctx.scrapeAll === true)) {
      return { viewed: 0, clicked: 0 };
    }

    const cards = pickLinkedInCards_(documentRef);
    if (!cards.length) {
      return { viewed: 0, clicked: 0 };
    }

    const viewedRegex = /\bviewed\b/i;
    let viewedCount = 0;
    let clickedCount = 0;
    const requestedTimeout = parseInt(String((ctx && ctx.linkedinViewedDismissTimeoutMs) || LINKEDIN_VIEWED_DISMISS_TIMEOUT_MS), 10);
    const timeoutMs = Number.isNaN(requestedTimeout) ? LINKEDIN_VIEWED_DISMISS_TIMEOUT_MS : Math.max(500, requestedTimeout);
    const startedAt = Date.now();
    let timedOut = false;

    for (let i = 0; i < cards.length; i++) {
      if (Date.now() - startedAt >= timeoutMs) {
        timedOut = true;
        break;
      }
      const card = cards[i];
      if (!card || !card.isConnected) continue;
      const text = String(card.innerText || card.textContent || '');
      if (!viewedRegex.test(text)) continue;
      viewedCount++;

      const closeButton = findCloseButtonForViewedCard_(card);
      if (!closeButton) continue;

      closeButton.click();
      clickedCount++;
      await sleep(getViewedDismissJitterMs_(ctx));
    }

    if (ctx && ctx.debug && typeof ctx.debug.add === 'function' && viewedCount > 0) {
      ctx.debug.add('linkedinDismissViewedBeforePaging', {
        page: pageNumber,
        viewed: viewedCount,
        clicked: clickedCount,
        timedOut: timedOut
      });
    }

    return { viewed: viewedCount, clicked: clickedCount };
  }

  function getUtils() {
    const utils = root.ScrapeUtils || {};
    const normalizeText = helpers.normalizeText || utils.normalizeText || function (text) {
      return String(text || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const extractJobIdFromUrl = helpers.extractJobIdFromUrl || utils.extractJobIdFromUrl || function (url) {
      if (!url) return '';
      const match = String(url).match(/\/jobs\/view\/(\d+)/i);
      if (match) return match[1];
      return '';
    };
    const createEmptyJob = utils.createEmptyJob || function(overrides) {
      return Object.assign({
        JobUrl: '',
        JobApplyUrl: '',
        JobId: '',
        JobTitle: '',
        JobCompany: '',
        JobLocation: '',
        JobSeniority: '',
        JobModality: '',
        JobSalary: '',
        JobTags: '',
        JobDescription: '',
        JobEasyApplyFlg: '',
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
    return { normalizeText, extractJobIdFromUrl, createEmptyJob };
  }

  function debugLog(ctx, message, data = {}) {
    // Always log to console
    console.log(message, data);

    // Also send to debug events if available
    if (ctx && ctx.debug && typeof ctx.debug.add === 'function') {
      ctx.debug.add('linkedin', { message, ...data });
    }
  }


  function decodeJsonString(value) {
    if (!value) return '';
    try {
      // Basic JSON string unescape
      return JSON.parse('"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
    } catch (e) {
      return String(value)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\//g, '/')
        .replace(/\\"/g, '"');
    }
  }

  function normalizeLinkedInJobUrl(url) {
    if (!url) return '';
    const match = String(url).match(/\/jobs\/view\/(\d+)/i);
    if (!match) return '';
    return `https://www.linkedin.com/jobs/view/${match[1]}/`;
  }

  function extractApplicantsText(text) {
    if (!text) return '';
    const clean = String(text).trim();
    if (!clean) return '';
    if (/applicants?/i.test(clean)) return clean;
    if (/clicked apply/i.test(clean)) return clean;
    return '';
  }

  function extractPostedText(text) {
    if (!text) return '';
    const clean = String(text).trim();
    if (!clean) return '';
    if (/(reposted|posted)\s+\d+\s+\w+\s+ago/i.test(clean)) return clean;
    if (/^\d+\s+\w+\s+ago/i.test(clean)) return clean;
    return '';
  }

  function normalizeLocationToken(text) {
    if (!text) return '';
    const clean = String(text).trim();
    if (!clean) return '';
    if (/applicants?/i.test(clean)) return '';
    if (/clicked apply/i.test(clean)) return '';
    if (/posted|reposted/i.test(clean)) return '';
    const stripped = clean
      .replace(/^Save\s+Apply\s+/i, '')
      .replace(/^(Save|Apply)\s+/i, '')
      .trim();

    const tailLocMatch = stripped.match(/([A-Z][A-Za-z\.\-]+(?:\s+[A-Z][A-Za-z\.\-]+)?)\s*,\s*([A-Z][A-Za-z\.\-]+)\s*$/);
    if (tailLocMatch) {
      return `${tailLocMatch[1]} ${tailLocMatch[2]}`.replace(/\s+/, ' ').replace(/ ,/, ',').trim().replace(/\s+/, ' ');
    }

    const words = stripped.split(/\s+/).filter(Boolean);
    if (words.length >= 4 && !stripped.includes(',')) {
      const stopWords = new Set([
        'Analyst', 'Engineer', 'Developer', 'Manager', 'Specialist', 'Designer',
        'Lead', 'Senior', 'Junior', 'Sr', 'Jr', 'Data', 'Software', 'Full', 'Stack',
        'QA', 'DevOps', 'Product', 'Marketing', 'Sales', 'Support', 'Intern',
        'Director', 'Head', 'Officer', 'Architect', 'Scientist', 'Associate'
      ]);
      const last = words[words.length - 1];
      const prev = words[words.length - 2];
      const isCap = (w) => /^[A-Z][a-zA-Z\.\-]*$/.test(w) && !stopWords.has(w);

      if (isCap(prev) && isCap(last)) {
        return `${prev} ${last}`.trim();
      }
      if (isCap(last)) {
        return last.trim();
      }
    }

    return stripped.trim();
  }

  function isLanguageListText(text) {
    if (!text) return false;
    const markers = [
      'العربية (Arabic)',
      'Español (Spanish)',
      'Deutsch (German)',
      'Русский (Russian)',
      '한국어 (Korean)',
      'Português (Portuguese)',
      '日本語 (Japanese)',
      'Français (French)',
      'Italiano (Italian)'
    ];
    let hits = 0;
    for (const marker of markers) {
      if (text.includes(marker)) hits++;
      if (hits >= 2) return true;
    }
    return false;
  }

  function trimLinkedInDescription(rawText) {
    if (!rawText) return '';
    let text = String(rawText);

    const startMarkers = [
      'About The Role',
      'About the Role',
      'About the job',
      'About the Job'
    ];
    let startIndex = -1;
    for (const marker of startMarkers) {
      const idx = text.indexOf(marker);
      if (idx !== -1) {
        startIndex = idx + marker.length;
        break;
      }
    }

    if (startIndex !== -1) {
      text = text.slice(startIndex);
      text = text.replace(/^[:\s\-–—]+/, '');
    }

    const endMarkers = [
      'Set alert for similar jobs',
      'Job search faster with Premium'
    ];
    let endIndex = -1;
    for (const marker of endMarkers) {
      const idx = text.indexOf(marker);
      if (idx !== -1) {
        endIndex = idx;
        break;
      }
    }

    if (endIndex !== -1) {
      text = text.slice(0, endIndex);
    }

    return text.trim();
  }

  function hasNotificationsPrefix_(text) {
    const value = String(text || '').trim().toLowerCase();
    return value.startsWith('0 notifications');
  }

  async function extractAboutComponentDescription(documentRef, utils, waitMultiplier) {
    const component = documentRef.querySelector('[componentkey^="JobDetails_AboutTheJob_"]');
    if (!component) return '';

    const buttonSelectors = [
      'button[aria-label*="more"]',
      '.see-more-less-list__show-more',
      'button.show-more-button',
      '[class*="show-more"]'
    ];
    let button = null;
    for (const sel of buttonSelectors) {
      button = component.querySelector(sel);
      if (button) break;
    }
    if (!button && component.parentElement) {
      for (const sel of buttonSelectors) {
        button = component.parentElement.querySelector(sel);
        if (button) break;
      }
    }
    if (button && !button.disabled && button.offsetParent !== null) {
      button.click();
      await sleep(Math.max(500, Math.round(500 * (waitMultiplier || 1))));
    }

    const rawText = component.innerText || component.textContent || '';
    if (!rawText) return '';

    const marker = 'About the job';
    let text = rawText;
    const startIdx = text.indexOf(marker);
    if (startIdx !== -1) {
      text = text.slice(startIdx + marker.length);
    }

    const endMarkers = [
      'Set alert for similar jobs',
      'Job search faster with Premium'
    ];
    let endIdx = -1;
    for (const endMarker of endMarkers) {
      const idx = text.indexOf(endMarker);
      if (idx !== -1) {
        endIdx = idx;
        break;
      }
    }
    if (endIdx !== -1) {
      text = text.slice(0, endIdx);
    }

    return utils.normalizeText(text);
  }

  function collectJobUrls(documentRef, debug) {
    const urls = [];
    const origin = (root.location && root.location.origin) ? root.location.origin : 'https://www.linkedin.com';

    const links = helpers.safeQueryAll ? helpers.safeQueryAll(selectors.jobLink, documentRef) : Array.from(documentRef.querySelectorAll(selectors.jobLink));
    links.forEach(link => {
      let href = link.getAttribute('href') || link.href || '';
      if (!href) return;
      if (href.startsWith('/')) {
        href = origin + href;
      }
      const normalized = normalizeLinkedInJobUrl(href);
      if (normalized) {
        urls.push({ url: normalized, node: link });
      }
    });

    if (urls.length === 0) {
      const html = documentRef.documentElement ? documentRef.documentElement.innerHTML : '';
      const idRegex = /urn:li:fsd_jobPosting:(\d+)/g;
      const seenIds = new Set();
      let match;
      while ((match = idRegex.exec(html)) !== null) {
        if (!match[1]) continue;
        if (seenIds.has(match[1])) continue;
        seenIds.add(match[1]);
        urls.push({ url: `https://www.linkedin.com/jobs/view/${match[1]}/`, node: null });
      }
      debug && debug.add('linkedinIdsFromHtml', { count: seenIds.size });
    }

    return urls;
  }

  function createBaseJob(jobUrl, jobId) {
    const utils = getUtils();
    return utils.createEmptyJob({
      JobUrl: jobUrl || '',
      JobId: jobId || '',
      JobEasyApplyFlg: 'FALSE'
    });
  }

  function escapeRegexText_(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getLinkedInApplyCandidates_(documentRef) {
    if (!documentRef) return [];

    const candidateSelectors = [
      '#jobs-apply-button-id',
      'button[id*="jobs-apply"]',
      'a[href*="/jobs/view/"][href*="/apply"]',
      'a[href*="/jobs/"][href*="/apply"]',
      'button[data-view-name*="job-apply-button"]',
      'a[data-view-name*="job-apply-button"]',
      'button[aria-label*="Apply" i]',
      'a[aria-label*="Apply" i]'
    ];

    const candidates = [];
    const seen = new Set();
    for (let s = 0; s < candidateSelectors.length; s++) {
      const nodes = documentRef.querySelectorAll(candidateSelectors[s]);
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (!el || seen.has(el)) continue;
        seen.add(el);
        candidates.push(el);
      }
    }
    return candidates;
  }

  function detectLinkedInEasyApply_(documentRef, jobId) {
    if (!documentRef) return 'FALSE';

    const candidates = getLinkedInApplyCandidates_(documentRef);

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const text = String(el.innerText || el.textContent || '').trim();
      const ariaLabel = String(el.getAttribute('aria-label') || '').trim();
      const href = String(el.getAttribute('href') || '').trim();
      const raw = `${text} ${ariaLabel} ${href}`;
      if (/easy\s*apply/i.test(raw)) {
        return 'TRUE';
      }
      if (/openSDUApplyFlow(?:=|%3D)true/i.test(href)) {
        return 'TRUE';
      }
    }

    const html = String((documentRef.documentElement && documentRef.documentElement.innerHTML) || '');
    if (html) {
      if (jobId) {
        const scopedPattern = new RegExp(
          '/jobs/view/' + escapeRegexText_(jobId) + '/apply/\\?[^"\\\']*openSDUApplyFlow(?:=|%3D)true',
          'i'
        );
        if (scopedPattern.test(html)) {
          return 'TRUE';
        }
      }
      if (/\/jobs\/view\/\d+\/apply\/\?[^"']*openSDUApplyFlow(?:=|%3D)true/i.test(html)) {
        return 'TRUE';
      }
    }

    const bodyText = String((documentRef.body && (documentRef.body.innerText || documentRef.body.textContent)) || '');
    if (/\bEasy\s*Apply\b/i.test(bodyText)) {
      return 'TRUE';
    }
    return 'FALSE';
  }

  function decodeUriComponentSafe_(value) {
    try {
      return decodeURIComponent(String(value || ''));
    } catch (error) {
      return String(value || '');
    }
  }

  function decodeLinkedInRedirectTarget_(value) {
    let current = String(value || '').trim();
    if (!current) return '';

    for (let i = 0; i < 4; i++) {
      if (!/%[0-9A-F]{2}/i.test(current)) {
        break;
      }
      const decoded = decodeUriComponentSafe_(current);
      if (!decoded || decoded === current) {
        break;
      }
      current = decoded;
    }
    return current;
  }

  function extractLinkedInApplyHrefFromNode_(el) {
    if (!el) return '';
    const directHref = String(el.getAttribute('href') || '').trim();
    if (directHref) {
      return directHref;
    }
    if (typeof el.closest === 'function') {
      const anchor = el.closest('a[href]');
      if (anchor) {
        return String(anchor.getAttribute('href') || '').trim();
      }
    }
    return '';
  }

  function normalizeLinkedInApplyUrl_(rawHref, documentRef) {
    const href = String(rawHref || '').trim();
    if (!href || href === '#' || /^javascript:/i.test(href)) {
      return '';
    }

    const baseUrl = (documentRef && documentRef.location && documentRef.location.href)
      ? documentRef.location.href
      : ((root.location && root.location.href) ? root.location.href : 'https://www.linkedin.com/');

    let parsed = null;
    try {
      parsed = new URL(href, baseUrl);
    } catch (error) {
      return '';
    }

    if (!/^https?:$/i.test(parsed.protocol)) {
      return '';
    }

    const redirectParams = ['url', 'redirect', 'target', 'dest', 'destination', 'redirectUrl'];
    for (let i = 0; i < redirectParams.length; i++) {
      const rawTarget = String(parsed.searchParams.get(redirectParams[i]) || '').trim();
      if (!rawTarget) {
        continue;
      }
      const decodedTarget = decodeLinkedInRedirectTarget_(rawTarget);
      if (/^https?:\/\//i.test(decodedTarget)) {
        return decodedTarget;
      }
      try {
        const nested = new URL(decodedTarget, parsed.origin);
        if (/^https?:$/i.test(nested.protocol)) {
          return nested.toString();
        }
      } catch (error) {
        // Ignore malformed nested target and keep searching.
      }
    }

    return parsed.toString();
  }

  function getLinkedInApplyCandidateScore_(raw, resolvedUrl, jobId) {
    let score = 0;
    const combined = String(raw || '') + ' ' + String(resolvedUrl || '');
    if (/openSDUApplyFlow(?:=|%3D)true/i.test(combined)) score += 12;
    if (/\/jobs\/view\/\d+\/apply\//i.test(resolvedUrl)) score += 10;
    if (/\/redir\/redirect\/\?/i.test(resolvedUrl)) score += 8;
    if (/apply\s+on\s+company\s+website/i.test(combined)) score += 7;
    if (/easy\s*apply/i.test(combined)) score += 6;
    if (/\bapply\b/i.test(combined)) score += 4;
    if (jobId) {
      const scopedPattern = new RegExp('/jobs/view/' + escapeRegexText_(jobId) + '/apply/', 'i');
      if (scopedPattern.test(resolvedUrl)) score += 6;
    }
    if (/\b(save|follow|job\s*tracker|alert)\b/i.test(combined)) score -= 8;
    return score;
  }

  function extractLinkedInApplyUrl_(documentRef, jobId) {
    if (!documentRef) return '';

    const candidates = getLinkedInApplyCandidates_(documentRef);
    let bestUrl = '';
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const text = String(el.innerText || el.textContent || '').trim();
      const ariaLabel = String(el.getAttribute('aria-label') || '').trim();
      const href = extractLinkedInApplyHrefFromNode_(el);
      const raw = `${text} ${ariaLabel} ${href}`;

      if (!/\bapply\b/i.test(raw) && !/openSDUApplyFlow(?:=|%3D)true/i.test(raw) && !/\/apply\//i.test(href)) {
        continue;
      }

      const resolvedUrl = normalizeLinkedInApplyUrl_(href, documentRef);
      if (!resolvedUrl) {
        continue;
      }

      const score = getLinkedInApplyCandidateScore_(raw, resolvedUrl, jobId);
      if (score > bestScore) {
        bestScore = score;
        bestUrl = resolvedUrl;
      }
    }

    if (bestUrl) {
      return bestUrl;
    }

    const html = String((documentRef.documentElement && documentRef.documentElement.innerHTML) || '');
    if (!html) {
      return '';
    }

    if (jobId) {
      const scopedPattern = new RegExp('/jobs/view/' + escapeRegexText_(jobId) + '/apply/\\?[^"\\\'\\s<]+', 'i');
      const scopedMatch = html.match(scopedPattern);
      if (scopedMatch && scopedMatch[0]) {
        const normalizedMatch = scopedMatch[0]
          .replace(/&amp;/gi, '&')
          .replace(/\\u0026/gi, '&')
          .replace(/\\\//g, '/');
        return normalizeLinkedInApplyUrl_(normalizedMatch, documentRef);
      }
    }

    const redirectMatch = html.match(/https?:\/\/www\.linkedin\.com\/redir\/redirect\/\?url=[^"'\s<]+/i);
    if (redirectMatch && redirectMatch[0]) {
      const normalizedMatch = redirectMatch[0]
        .replace(/&amp;/gi, '&')
        .replace(/\\u0026/gi, '&')
        .replace(/\\\//g, '/');
      return normalizeLinkedInApplyUrl_(normalizedMatch, documentRef);
    }

    return '';
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seenUrls = new Set();
    const currentUrl = (ctx && ctx.url) ? ctx.url : window.location.href;

    // CRITICAL FIX: If on a specific job page, scrape ONLY that job (Detailed)
    // Otherwise we might scrape "Similar Jobs" from the sidebar which lack descriptions
    if (currentUrl.includes('/jobs/view/') || currentUrl.includes('/jobs/details/')) {
      console.log('[linkedin] Detected Single Job Page. Delegating to scrapeDetail...');
      const detailJob = await scrapeDetail(documentRef, ctx);
      return [detailJob];
    }

    let page = 0;
    const maxPages = 40;

    while (page < maxPages) {
      await sleep(800);

      if (documentRef.querySelector(selectors.noJobs)) {
        debug && debug.add('linkedinNoJobs', { page: page + 1 });
        break;
      }

      // Requested order:
      // 1) scroll
      // 2) collect urls
      // 3) dismiss viewed
      // 4) paginate
      await scrollLinkedInListBeforeCollect_(documentRef, ctx, page + 1);
      await ensureMinRecordsBeforeCollect_(documentRef, ctx, page + 1);

      const pageUrls = collectJobUrls(documentRef, debug);
      pageUrls.forEach(item => {
        const normalized = normalizeLinkedInJobUrl(item.url);
        if (!normalized || seenUrls.has(normalized)) return;
        seenUrls.add(normalized);

        const jobId = utils.extractJobIdFromUrl(normalized);
        const job = createBaseJob(normalized, jobId);

        // No artificial limit on job count

        if (item.node) {
          const card = item.node.closest(selectors.jobCard);
          if (card) {
            const titleEl = card.querySelector('h3, h4, [class*="title"], [data-job-title]');
            const companyEl = card.querySelector('[class*="company"], [data-job-company]');
            const locationEl = card.querySelector('[class*="location"], [data-job-location]');
            if (titleEl) job.JobTitle = utils.normalizeText(titleEl.textContent || '');
            if (companyEl) job.JobCompany = utils.normalizeText(companyEl.textContent || '');
            if (locationEl) job.JobLocation = utils.normalizeText(locationEl.textContent || '');
          }
        }

        jobs.push(job);
      });

      debug && debug.add('linkedinListPage', { page: page + 1, found: pageUrls.length, total: seenUrls.size });

      // Before dismiss/pagination, force-scroll list until ~25 cards (or stop on no progress).
      await ensureMinRecordsBeforeCollect_(documentRef, ctx, page + 1);
      await dismissViewedCardsBeforePaging_(documentRef, ctx, page + 1);

      if (page + 1 >= maxPages) {
        debug && debug.add('linkedinPaginationStop', { page: page + 1, reason: 'max_pages' });
        break;
      }

      const nextButton = documentRef.querySelector(selectors.nextButton);
      if (!nextButton) {
        debug && debug.add('linkedinPaginationStop', { page: page + 1, reason: 'next_missing' });
        break;
      }
      const isDisabled = nextButton.disabled || nextButton.getAttribute('aria-disabled') === 'true';
      if (isDisabled) {
        debug && debug.add('linkedinPaginationStop', { page: page + 1, reason: 'next_disabled' });
        break;
      }

      nextButton.click();
      const jitterMs = getNextClickJitterMs_(ctx);
      debug && debug.add('linkedinNextJitter', { page: page + 1, waitMs: jitterMs });
      await sleep(jitterMs);
      page++;
    }

    if (jobs.length === 0) {
      // Fallback: If list scraping yielded nothing, check if the page contains a single job detail 
      debug && debug.add('linkedinListFallback', { message: 'Attempting specific job scrape as fallback' });

      // Re-use scrapeDetail logic which checks DOM selectors, Legacy JSON, and RSC
      const detailJob = await scrapeDetail(documentRef, ctx);

      if (detailJob && (detailJob.JobTitle || detailJob.JobDescription)) {
        debug && debug.add('linkedinListFallback', { success: true, title: detailJob.JobTitle });

        // If we have a title or description, treat it as a success
        jobs.push(detailJob);

        // DEBUG: Check for user text in the extracted job
        const targetText = "Advise business streams";
        if (detailJob.JobDescription && detailJob.JobDescription.includes(targetText)) {
          console.log(`[linkedin] 🟢 CRITICAL: Fallback (scrapeDetail) found target text in Description!`);
        } else {
          console.log(`[linkedin] 🔴 Fallback (scrapeDetail) did NOT find target text in Description.`);
          if (detailJob.JobDescription) {
            console.log(`[linkedin] Description extracted length: ${detailJob.JobDescription.length}`);
          } else {
            console.log(`[linkedin] Description is EMPTY.`);
          }
        }
      } else {
        console.log('[linkedin] Fallback (scrapeDetail) returned no useful data.');
      }
    }

    debug && debug.add('linkedinListDone', { pages: page + 1, total: jobs.length });
    return jobs;
  }

  function extractFromHtml(html, jobId, utils) {
    if (!html) return null;

    const token = jobId ? `urn:li:fsd_jobPosting:${jobId}` : 'urn:li:fsd_jobPosting:';
    const idx = html.indexOf(token);
    if (idx === -1) return null;

    const sliceStart = Math.max(0, idx - 4000);
    const sliceEnd = Math.min(html.length, idx + 12000);
    const block = html.slice(sliceStart, sliceEnd);

    const titleMatch = block.match(/\"title\":\"([^\"]+)\"/);
    const companyMatch = block.match(/\"companyName\":\"([^\"]+)\"/) ||
      block.match(/\"name\":\"([^\"]+)\"/);
    const locationMatch = block.match(/\"formattedLocation\":\"([^\"]+)\"/) ||
      block.match(/\"locationName\":\"([^\"]+)\"/);
    const descriptionMatch = block.match(/\"description\":\"([\s\S]*?)\"[,}]/);

    return {
      title: titleMatch ? decodeJsonString(titleMatch[1]) : '',
      company: companyMatch ? decodeJsonString(companyMatch[1]) : '',
      location: locationMatch ? decodeJsonString(locationMatch[1]) : '',
      description: descriptionMatch ? decodeJsonString(descriptionMatch[1]) : ''
    };
  }

  function extractFromComoRehydration(html) {
    if (!html) return null;
    try {
      const startToken = 'window.__como_rehydration__ = [';
      const startIdx = html.indexOf(startToken);
      if (startIdx === -1) return null;

      const scriptEndIdx = html.indexOf('</script>', startIdx);
      if (scriptEndIdx === -1) return null;

      let jsonCandidate = html.substring(startIdx + 'window.__como_rehydration__ = '.length, scriptEndIdx);
      jsonCandidate = jsonCandidate.trim();
      if (jsonCandidate.endsWith(';')) {
        jsonCandidate = jsonCandidate.slice(0, -1).trim();
      }

      const data = JSON.parse(jsonCandidate);
      if (!Array.isArray(data)) return null;

      let result = {};
      console.log('[linkedin] Parsing RSC stream items:', data.length);

      const targetText2 = "Advise business streams";

      for (const item of data) {
        if (typeof item !== 'string') continue;

        if (item.includes(targetText2)) {
          console.log('[linkedin] 🟢 Found target text in RSC item!');
          // console.log('[linkedin] Item content:', item.substring(0, 200) + '...');
        }

        // Strategy 1: Look for Schema.org JobPosting (most reliable)
        if (item.includes('"@type":"JobPosting"') || item.includes('"@type": "JobPosting"')) {
          const dateMatch = item.match(/"datePosted":"([^"]+)"/);
          if (dateMatch) result.datePosted = dateMatch[1];

          const descMatch = item.match(/"description":"((?:[^"\\]|\\.)*)"/);
          if (descMatch) result.description = decodeJsonString(descMatch[1]);

          const locMatch = item.match(/"addressLocality":"([^"]+)"/);
          if (locMatch) result.location = decodeJsonString(locMatch[1]);

          const titleMatch = item.match(/"title":"([^"]+)"/);
          if (titleMatch) result.title = decodeJsonString(titleMatch[1]);

          const compMatch = item.match(/"hiringOrganization".*?"name":"([^"]+)"/);
          if (compMatch) result.company = decodeJsonString(compMatch[1]);
        }

        // Strategy 2: Look for specific UI components (TopCard)
        if (item.includes('com.linkedin.sdui.impl.jobseeker.jobdetails.components.topcard.topCard')) {
          // Extract all text children: children":["Text"]
          const textMatches = Array.from(item.matchAll(/\"children\":\[\"([^\"]+)\"\]/g), m => m[1]);

          // Heuristic Mapping
          textMatches.forEach((text, idx) => {
            const clean = decodeJsonString(text).trim();
            if (!clean) return;

            // Date Posted: "2 weeks ago"
            if (/^(\d+|a|an)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.test(clean) ||
                /(reposted|posted)\s+\d+\s+\w+\s+ago/i.test(clean)) {
              if (!result.datePosted) result.datePosted = clean;

              // Location heuristic: Often precedes date
              if (!result.location && idx > 0) {
                const prev = decodeJsonString(textMatches[idx - 1]).trim();
                if (prev && prev.length > 2 && !prev.includes('·')) {
                  result.location = prev;
                }
              }
            }

            // Location fallback regex (City, Country)
            if (!result.location && /^\s*[A-Z][a-zA-Z\s\.\-]+\s*,\s*[A-Z][a-zA-Z\s\.\-]+\s*$/.test(clean)) {
              result.location = clean;
            }

            if (!result.applicants && extractApplicantsText(clean)) {
              result.applicants = extractApplicantsText(clean);
            }
          });

          // Fallback: First text if it looks like location
          if (!result.location && textMatches.length > 0) {
            const potentialLoc = decodeJsonString(textMatches[0]).trim();
            if (potentialLoc.length > 2 && !potentialLoc.includes('ago') && !potentialLoc.includes('applicant')) {
              result.location = potentialLoc;
            }
          }

          if (!result.applicants) {
            const applicantsMatch = textMatches
              .map(item => decodeJsonString(item).trim())
              .find(extractApplicantsText);
            if (applicantsMatch) {
              result.applicants = applicantsMatch;
            }
          }
        }

        // Strategy 3: Description - Look for any large text block with "description" key
        if (!result.description) {
          const descMatch = item.match(/"description":"((?:[^"\\]|\\.)*)"/);
          if (descMatch && descMatch[1].length > 200) {
            const content = decodeJsonString(descMatch[1]);
            // Filter out error messages
            if (!content.includes('problem loading the content') && !content.includes('enabled')) {
              result.description = content;
              // console.log('[linkedin] Found likely description length:', result.description.length);
            }
          }
        }
      }

      return Object.keys(result).length > 0 ? result : null;
    } catch (e) {
      console.error('[scrape] Error parsing como_rehydration', e);
    }
    return null;
  }

  async function scrapeDetail(doc, ctx) {
    const documentRef = doc || document;
    const utils = getUtils();
    const timeoutMultiplier = Math.max(1, Number((ctx && ctx.linkedinTimeoutMultiplier) || 1));
    const detailWaitMs = Math.max(1050, Math.round(1050 * timeoutMultiplier));
    const expandWaitMs = Math.max(500, Math.round(500 * timeoutMultiplier));
    const pageUrl = (ctx && ctx.url) ? ctx.url : (root.location ? root.location.href : '');
    const normalizedUrl = normalizeLinkedInJobUrl(pageUrl) || pageUrl.split('#')[0].split('?')[0];
    const jobId = utils.extractJobIdFromUrl(normalizedUrl);
    const job = createBaseJob(normalizedUrl, jobId);

    // ALWAYS log this to verify function is called
    debugLog(ctx, `[linkedin] 🚀 v1.1.17 scrapeDetail START`, { url: pageUrl, hasDebug: !!(ctx && ctx.debug) });

    for (let i = 0; i < 6; i++) {
      const readyTitle = documentRef.querySelector('h1') ||
        documentRef.querySelector('.job-details-jobs-unified-top-card__job-title') ||
        documentRef.querySelector('.top-card-layout__title');
      const readyMeta = documentRef.querySelector('.job-details-jobs-unified-top-card__primary-description') ||
        documentRef.querySelector('.job-details-jobs-unified-top-card__primary-description-without-context') ||
        documentRef.querySelector('.jobs-unified-top-card__primary-description') ||
        documentRef.querySelector('.top-card-layout__first-subline') ||
        documentRef.querySelector('.top-card-layout__subtitle');
      const readyDesc = documentRef.querySelector('.jobs-description__content') ||
        documentRef.querySelector('.jobs-description-content__text') ||
        documentRef.querySelector('.show-more-less-html__markup');

      if (readyTitle || readyMeta || readyDesc) break;
      await sleep(detailWaitMs);
    }

    // 1. Try standard selectors (HTML fallback)
    const titleEl = documentRef.querySelector('h1') ||
      documentRef.querySelector('.job-details-jobs-unified-top-card__job-title') ||
      documentRef.querySelector('.top-card-layout__title');
    if (titleEl) {
      job.JobTitle = utils.normalizeText(titleEl.textContent || '');
    }

    // 1b. Fallback: Parse <title> tag
    // Format: "Job Title | Company | LinkedIn" or "Job Title at Company"
    if (!job.JobTitle) {
      const titleTag = documentRef.querySelector('title');
      if (titleTag) {
        const fullTitle = titleTag.textContent.trim();
        // Try splitting by " | "
        const parts = fullTitle.split(' | ');
        if (parts.length >= 2) {
          job.JobTitle = utils.normalizeText(parts[0]);
          if (!job.JobCompany && parts.length > 2) {
            job.JobCompany = utils.normalizeText(parts[1]);
          }
        } else {
          // Try " at "
          const atParts = fullTitle.split(' at ');
          if (atParts.length >= 2) {
            job.JobTitle = utils.normalizeText(atParts[0]);
            // Company might be messy "at Company | LinkedIn"
            let comp = atParts[1].split(' | ')[0];
            if (!job.JobCompany) job.JobCompany = utils.normalizeText(comp);
          }
        }
      }
    }

    const companyEl = documentRef.querySelector('.job-details-jobs-unified-top-card__company-name') ||
      documentRef.querySelector('.top-card-layout__company-name') ||
      documentRef.querySelector('[data-test-company-name]');
    if (companyEl) {
      job.JobCompany = utils.normalizeText(companyEl.textContent || '');
    }

    const locationEl = documentRef.querySelector('.job-details-jobs-unified-top-card__bullet') ||
      documentRef.querySelector('.jobs-unified-top-card__bullet') ||
      documentRef.querySelector('.top-card-layout__first-subline') ||
      documentRef.querySelector('[data-test-job-location]');
    if (locationEl) {
      const loc = normalizeLocationToken(utils.normalizeText(locationEl.textContent || ''));
      if (loc) job.JobLocation = loc;
    }

    const applicantsEl = documentRef.querySelector('.job-details-jobs-unified-top-card__applicant-count') ||
      documentRef.querySelector('.jobs-unified-top-card__applicant-count') ||
      documentRef.querySelector('span._85593dc5 > strong:nth-child(1)');
    if (applicantsEl && !job.JobTags) {
      const applicants = extractApplicantsText(utils.normalizeText(applicantsEl.textContent || ''));
      if (applicants) job.JobTags = applicants;
    }

    const metaLineEl = documentRef.querySelector('.job-details-jobs-unified-top-card__primary-description') ||
      documentRef.querySelector('.job-details-jobs-unified-top-card__primary-description-without-context') ||
      documentRef.querySelector('.jobs-unified-top-card__primary-description') ||
      documentRef.querySelector('.top-card-layout__first-subline') ||
      documentRef.querySelector('.top-card-layout__subtitle');
    if (metaLineEl) {
      const metaText = utils.normalizeText(metaLineEl.textContent || '');
      const parts = metaText.split(/[·•]/).map(part => part.trim()).filter(Boolean);
      parts.forEach(part => {
        if (!job.JobLocation) {
          const loc = normalizeLocationToken(part);
          if (loc) job.JobLocation = loc;
        }
        if (!job.JobPostedDttm) {
          const posted = extractPostedText(part);
          if (posted) job.JobPostedDttm = posted;
        }
        if (!job.JobTags) {
          const applicants = extractApplicantsText(part);
          if (applicants) job.JobTags = applicants;
        }
      });
    }

    const aboutDesc = await extractAboutComponentDescription(documentRef, utils, timeoutMultiplier);
    if (aboutDesc) {
      job.JobDescription = aboutDesc;
    }

    // Apply URL used by downstream autofill can differ from JobUrl.
    // Prefer the explicit Apply control link from detail page.
    job.JobApplyUrl = extractLinkedInApplyUrl_(documentRef, job.JobId);

    // Explicit LinkedIn enrichment flag:
    // TRUE when Easy Apply control exists, otherwise FALSE.
    job.JobEasyApplyFlg = detectLinkedInEasyApply_(documentRef, job.JobId);

    // 2. Try description selectors
    const descEl = documentRef.querySelector('.jobs-description__content') ||
      documentRef.querySelector('.jobs-description-content__text') ||
      documentRef.querySelector('.show-more-less-html__markup') ||
      documentRef.querySelector('[data-job-description]') ||
      // New obfuscated classes seen in fixtures
      documentRef.querySelector('div.jobs-box__html-content') ||
      documentRef.querySelector('#job-details') ||
      documentRef.querySelector('.job-view-layout .description') ||
      // Discovered via debug trace (v1.0.5)
      documentRef.querySelector('ul._34ae1d2d') ||
      documentRef.querySelector('ul._456e2a20');

    if (descEl && !job.JobDescription) {
      const extractedDesc = utils.normalizeText(descEl.innerText || descEl.textContent || '');
      job.JobDescription = extractedDesc;

      debugLog(ctx, `[linkedin] 📄 DOM selector found description`, {
        selector: descEl.className || descEl.id || descEl.tagName,
        length: job.JobDescription.length,
        preview: job.JobDescription.substring(0, 200)
      });

      // If description is suspiciously short, it might be only one section
      // Let heuristic try to find the full container
      if (job.JobDescription.length < 1500) {
        debugLog(ctx, `[linkedin] ⚠️ DOM description too short (${job.JobDescription.length} chars), trying heuristic for full content`);
        // Don't return yet, let heuristic try to find better version
        // Store as backup
        const domBackup = job.JobDescription;
        job.JobDescription = ''; // Clear to allow heuristic to run

        // The heuristic will run below, and if it fails, we'll restore the backup
        // by checking at the end of scrapeDetail
      }
    } else {
      debugLog(ctx, '[linkedin] ⚠️ DOM selectors found NO description element');
    }

    // 2b. Structural Heuristic Fallback: Find "About the job" or similar headers 
    // IMPROVED: Find the PARENT container of ALL description sections
    if (!job.JobDescription) {
      const keywords = ["About the job", "About the Job", "Job description", "Job Description", "Responsibilities", "Who we are"];
      try {
        for (const keyword of keywords) {
          // XPath to find text node containing the keyword
          const xpath = `//*[contains(text(), '${keyword}')]`;
          const iterator = documentRef.evaluate(xpath, documentRef, null, 9, null); // 9 = FIRST_ORDERED_NODE_TYPE
          const node = iterator.singleNodeValue;

          if (node) {
            debugLog(ctx, `[linkedin] 🔍 v1.1.17: Found '${keyword}' in <${node.tagName || 'text'}>`);
            let headerEl = node.nodeType === 3 ? node.parentElement : node; // Get element if text node

            // 1. Click "Show more" button to expand full content
            const buttonSelectors = ['button[aria-label*="more"]', '.see-more-less-list__show-more', 'button.show-more-button', '[class*="show-more"]'];
            let container = headerEl.parentElement;

            let button = null;
            for (let i = 0; i < 5; i++) {
              if (!container) break;
              for (const sel of buttonSelectors) {
                const btn = container.querySelector(sel);
                if (btn && !btn.disabled && btn.offsetParent !== null) {
                  button = btn;
                  break;
                }
              }
              if (button) break;

              const buttons = container.querySelectorAll('button');
              for (const btn of buttons) {
                const btnText = (btn.textContent || '').toLowerCase();
                if (btnText.includes('more') && btnText.includes('show')) {
                  button = btn;
                  break;
                }
              }
              if (button) break;
              container = container.parentElement;
            }

            if (button) {
              debugLog(ctx, '[linkedin] 🔘 Clicked Show more');
              button.click();
              await sleep(expandWaitMs); // Wait for expansion
            }

            // 2. Find the PARENT container that holds ALL description sections
            // Walk up the tree to find a container large enough to contain multiple sections
            let descriptionContainer = headerEl.parentElement;
            let foundFullContainer = false;

            for (let depth = 0; depth < 6; depth++) {
              if (!descriptionContainer) break;

              const containerText = descriptionContainer.innerText || descriptionContainer.textContent || '';

              // Check if this container has multiple section keywords
              let keywordMatches = 0;
              const allKeywords = ["About the job", "Responsibilities", "Requirements", "Nice to have", "We offer", "Qualifications", "Benefits"];
              for (const kw of allKeywords) {
                if (containerText.includes(kw)) keywordMatches++;
              }

              // If we found a container with 2+ section headers, use it
              if (keywordMatches >= 2) {
                debugLog(ctx, `[linkedin] 📦 Container: depth=${depth}, sections=${keywordMatches}, tag=<${descriptionContainer.tagName}>`);
                foundFullContainer = true;
                break;
              }

              descriptionContainer = descriptionContainer.parentElement;
            }

            if (foundFullContainer && descriptionContainer) {
              const extractedText = descriptionContainer.innerText || descriptionContainer.textContent || '';
              const cleanText = utils.normalizeText(extractedText);

              if (cleanText.length > 100) {
                debugLog(ctx, `[linkedin] ✅ SUCCESS: ${cleanText.length} chars`, { preview: cleanText.substring(0, 200) });
                job.JobDescription = cleanText;
                break;
              }
            } else {
              // Fallback: Extract from header's parent (old logic)
              debugLog(ctx, '[linkedin] ⚠️ Multi-section NOT found, fallback');
              let sibling = headerEl.nextElementSibling;
              let foundText = '';

              while (sibling) {
                if (sibling.tagName !== 'BUTTON' && !sibling.className.includes('show-more')) {
                  foundText += (sibling.innerText || sibling.textContent || '') + '\n';
                }
                sibling = sibling.nextElementSibling;
              }

              if (foundText.length < 100) {
                const contentContainer = headerEl.parentElement;
                const fullText = contentContainer.innerText || contentContainer.textContent || '';
                foundText = fullText.replace(headerEl.innerText || '', '').trim();
              }

              if (foundText.length > 50) {
                debugLog(ctx, `[linkedin] ⚠️ Single-section: ${foundText.length} chars`);
                job.JobDescription = utils.normalizeText(foundText);
                break;
              }
            }
          }
          if (job.JobDescription) break;
        }
      } catch (e) {
        debugLog(ctx, `[linkedin] ❌ Heuristic error: ${e.message}`);
      }
    }

    // 2c. Nuclear Fallback: Find the element with the most text on the page
    // This is a "last resort" to ensure we get SOMETHING.
    if (!job.JobDescription || job.JobDescription.length < 50) {
      console.log('[linkedin] 🟡 Attempts failed. Trying Nuclear Fallback (longest text block)...');
      try {
        const allDivs = documentRef.querySelectorAll('div, section, article');
        let maxLen = 0;
        let bestEl = null;

        for (const el of allDivs) {
          // Skip script/style containers and hidden elements
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH'].includes(el.tagName)) continue;
          if (el.offsetParent === null) continue; // Hidden

          const text = el.innerText || el.textContent || '';
          // Avoid capturing the entire body or main wrapper
          // We want a leaf-ish node, so we check if it has too many children
          if (el.children.length > 20) continue;

          if (text.length > maxLen) {
            maxLen = text.length;
            bestEl = el;
          }
        }

        if (bestEl && maxLen > 200) {
          console.log(`[linkedin] 🟢 Nuclear: Found longest text block (${maxLen} chars) in <${bestEl.tagName} class="${bestEl.className}">`);
          job.JobDescription = utils.normalizeText(bestEl.innerText || bestEl.textContent || '');
        }
      } catch (e) {
        console.log('[linkedin] Nuclear search failed:', e);
      }
    }

    // 3. Fallback: Extract from Scripts/JSON
    if (!job.JobTitle || !job.JobDescription || job.JobDescription.length < 50) {
      const html = documentRef.documentElement ? documentRef.documentElement.innerHTML : '';

      // Try old method
      let extracted = extractFromHtml(html, job.JobId, utils);

      // Try new method (como_rehydration)
      if (!extracted || !extracted.description) {
        const newExtracted = extractFromComoRehydration(html);
        if (newExtracted) {
          extracted = extracted || {};
          if (newExtracted.title) extracted.title = newExtracted.title;
          if (newExtracted.company) extracted.company = newExtracted.company;
          if (newExtracted.description) extracted.description = newExtracted.description;
          if (newExtracted.location) extracted.location = newExtracted.location;
          if (newExtracted.datePosted) extracted.datePosted = newExtracted.datePosted;
          if (newExtracted.applicants) extracted.applicants = newExtracted.applicants;
        }
      }

      if (extracted) {
        if (!job.JobTitle && extracted.title) job.JobTitle = utils.normalizeText(extracted.title);
        if (!job.JobCompany && extracted.company) job.JobCompany = utils.normalizeText(extracted.company);
        if (!job.JobLocation && extracted.location) job.JobLocation = utils.normalizeText(extracted.location);
        if ((!job.JobDescription || job.JobDescription.length < 50) && extracted.description) {
          job.JobDescription = utils.normalizeText(extracted.description);
        }
        if (!job.JobPostedDttm && extracted.datePosted) {
          job.JobPostedDttm = extracted.datePosted;
        }
        if (!job.JobTags && extracted.applicants) {
          job.JobTags = extracted.applicants;
        }
      }
    }

    if (!job.JobTags) {
      const bodyText = utils.normalizeText((documentRef.body && (documentRef.body.innerText || documentRef.body.textContent)) || '');
      const applicantsMatch = bodyText.match(/(Over\s+\d+[^.]*clicked apply|\d+\s+applicants?[^.]*apply)/i);
      if (applicantsMatch) {
        job.JobTags = applicantsMatch[1].trim();
      }
    }

    if (!job.JobPostedDttm) {
      const bodyText = utils.normalizeText((documentRef.body && (documentRef.body.innerText || documentRef.body.textContent)) || '');
      const postedMatch = bodyText.match(/((Reposted|Posted)\s+\d+\s+\w+\s+ago|\d+\s+\w+\s+ago)/i);
      if (postedMatch) {
        job.JobPostedDttm = postedMatch[1].trim();
      }
    }

    if (!job.JobLocation) {
      const bodyText = utils.normalizeText((documentRef.body && (documentRef.body.innerText || documentRef.body.textContent)) || '');
      const headerLineMatch = bodyText.match(/([A-Z][A-Za-z\s\.\-]+(?:,\s*[A-Z][A-Za-z\s\.\-]+)?)\s+·\s+(Reposted|Posted|\d+\s+\w+\s+ago)/);
      if (headerLineMatch) {
        const loc = normalizeLocationToken(headerLineMatch[1]);
        if (loc) job.JobLocation = loc;
      }
    }

    if (!job.JobDescription || job.JobDescription.length < 50) {
      const bodyText = utils.normalizeText((documentRef.body && (documentRef.body.innerText || documentRef.body.textContent)) || '');
      const hasStartMarker = /About the job|About The Role|About the Role|About the Job/.test(bodyText);
      const hasEndMarker = /Set alert for similar jobs|Job search faster with Premium/.test(bodyText);
      if (!isLanguageListText(bodyText) && (hasStartMarker || hasEndMarker)) {
        const trimmed = trimLinkedInDescription(bodyText);
        if (trimmed && trimmed.length > 100) {
          job.JobDescription = utils.normalizeText(trimmed);
        }
      }
    }

    if (job.JobDescription) {
      const trimmed = trimLinkedInDescription(job.JobDescription);
      if (trimmed) {
        job.JobDescription = utils.normalizeText(trimmed);
      }
    }

    // LinkedIn can occasionally return UI shell text ("0 notifications ...") instead of real description.
    // Mark such result so background pipeline can reload tab and retry with stronger timeouts.
    if (hasNotificationsPrefix_(job.JobDescription)) {
      job.__linkedinNotificationShell = true;
      debugLog(ctx, '[linkedin] Notification shell detected in description', {
        prefix: String(job.JobDescription || '').slice(0, 120),
        timeoutMultiplier: timeoutMultiplier
      });
    } else {
      job.__linkedinNotificationShell = false;
    }

    return job;
  }

  try {
    const source = {
      id: 'linkedin',
      name: 'LinkedIn',
      match: function (url) {
        const value = String(url || '');
        return value.includes('linkedin.com/jobs');
      },
      scrapeList: scrapeList,
      scrapeDetail: scrapeDetail
    };

    if (typeof root.registerScrapeSource === 'function') {
      console.log('[scrape] Calling registerScrapeSource for LinkedIn');
      root.registerScrapeSource(source);
    } else {
      console.error('[scrape] registerScrapeSource not found!');
      // Fallback: manually push if registry exists
      if (root.ScrapeSources && Array.isArray(root.ScrapeSources)) {
        root.ScrapeSources.push(source);
        console.log('[scrape] Manually pushed LinkedIn to ScrapeSources');
      }
    }
  } catch (error) {
    console.error('[scrape] Error initializing LinkedIn source:', error);
  }
})();
