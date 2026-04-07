/**
 * Source: Wellfound (wellfound.com)
 * List: /jobs infinite scroll (collect job links).
 * Detail: /company/<slug>/jobs/<id>-<slug> pages (fallback to __NEXT_DATA__).
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));

  const selectors = {
    jobLinks: 'a[class*="jobLink"][href*="/jobs/"], a[href*="/company/"][href*="/jobs/"]',
    jobTitle: 'h1, h2, [data-test*="JobTitle"], [class*="job-title"], [class*="jobTitle"]',
    companyName: 'a[href*="/company/"], [data-test*="Company"], [class*="company"]',
    location: '[data-test*="Location"], [class*="location"], [class*="Location"]',
    description: '[data-test*="JobDescription"], [class*="job-description"], [class*="description"], [class*="Description"]',
    endMarker: '.jobs-search-results-list__no-jobs-available-card'
  };

  function getUtils() {
    const utils = root.ScrapeUtils || {};
    const normalizeText = helpers.normalizeText || utils.normalizeText || function(text) {
      return String(text || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const extractJobIdFromUrl = helpers.extractJobIdFromUrl || utils.extractJobIdFromUrl || function(url) {
      if (!url) return '';
      const match = url.match(/\/jobs\/(\d+)(?:-|\/|$|\?)/);
      if (match) return match[1];
      const numMatch = url.match(/\/(\d+)(?:\/|$|\?)/);
      if (numMatch) return numMatch[1];
      return '';
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
    return { normalizeText, extractJobIdFromUrl, createEmptyJob };
  }

  function normalizeWellfoundJobUrl(href) {
    if (!href) return '';
    let url = String(href);
    if (url.startsWith('/')) {
      const origin = (root.location && root.location.origin) ? root.location.origin : 'https://wellfound.com';
      url = origin + url;
    }
    url = url.split('#')[0].split('?')[0];
    const match = url.match(/https?:\/\/[^\/]*wellfound\.com\/(?:company\/[^\/]+\/jobs\/\d+(?:-[^\/?#]+)?|jobs\/\d+(?:-[^\/?#]+)?)/);
    if (match) {
      return match[0];
    }
    return '';
  }

  function htmlToText(html, utils) {
    if (!html) return '';
    try {
      const tmp = (root.document || document).createElement('div');
      tmp.innerHTML = html;
      return utils.normalizeText(tmp.textContent || '');
    } catch (error) {
      return utils.normalizeText(String(html).replace(/<[^>]*>/g, ' '));
    }
  }

  function isGenericTitle(title) {
    if (!title) return false;
    const lower = String(title).toLowerCase();
    return lower.includes('careers') || lower.includes('jobs at') || lower === 'jobs';
  }

  function isIgnoredTitle(title) {
    if (!title) return false;
    const lower = String(title).toLowerCase().replace(/\s+/g, ' ').trim();
    const blacklist = [
      'home',
      'profile',
      'jobs',
      'applications',
      'recommended jobs',
      'messages',
      'search for jobs',
      'on-demand jobs',
      'discover'
    ];
    return blacklist.includes(lower);
  }

  function parseNextData(documentRef) {
    const script = documentRef.querySelector('#__NEXT_DATA__');
    if (!script || !script.textContent) return null;
    try {
      return JSON.parse(script.textContent);
    } catch (error) {
      return null;
    }
  }

  function extractApolloState(nextData) {
    return nextData &&
      nextData.props &&
      nextData.props.pageProps &&
      nextData.props.pageProps.apolloState &&
      nextData.props.pageProps.apolloState.data
      ? nextData.props.pageProps.apolloState.data
      : null;
  }

  function extractJobsFromApollo(apolloState) {
    if (!apolloState) return [];
    const startups = {};
    Object.keys(apolloState).forEach(key => {
      if (key.startsWith('Startup:')) {
        const startup = apolloState[key];
        if (startup && startup.slug) {
          startups[key] = startup;
        }
      }
    });

    const jobs = [];
    Object.keys(apolloState).forEach(key => {
      if (!key.startsWith('JobListing:')) return;
      const listing = apolloState[key];
      if (!listing || !listing.title) return;
      const id = listing.id || key.split(':')[1] || '';
      const startupRef = listing.startup && listing.startup.__ref;
      const startup = startupRef ? startups[startupRef] : null;
      jobs.push({
        id: id,
        slug: listing.slug || '',
        title: listing.title || '',
        descriptionSnippet: listing.descriptionSnippet || '',
        locationNames: Array.isArray(listing.locationNames) ? listing.locationNames : [],
        acceptedRemoteLocationNames: Array.isArray(listing.acceptedRemoteLocationNames)
          ? listing.acceptedRemoteLocationNames
          : [],
        companyName: startup ? startup.name : '',
        companySlug: startup ? startup.slug : ''
      });
    });

    return jobs;
  }

  function buildJobUrl(companySlug, jobId, jobSlug) {
    if (!companySlug || !jobId) return '';
    const slugPart = jobSlug ? `-${jobSlug}` : '';
    return `https://wellfound.com/company/${companySlug}/jobs/${jobId}${slugPart}`;
  }

  function createBaseJob(jobUrl, jobId) {
    const utils = getUtils();
    return utils.createEmptyJob({
      JobUrl: jobUrl || '',
      JobId: jobId || ''
    });
  }

  function collectJobLinks(documentRef) {
    const links = documentRef.querySelectorAll(selectors.jobLinks);
    const urls = [];
    links.forEach(link => {
      if (link.closest('nav,[data-test="CandidateLeftNav"],header')) return;
      let href = link.getAttribute('href') || link.href || '';
      if (!href) return;
      if (!/\/jobs\/\d+/.test(href)) return;
      const normalized = normalizeWellfoundJobUrl(href);
      if (normalized) urls.push(normalized);
    });
    return urls;
  }

  const WELLFOUND_SCROLL_MAX_ROUNDS = 30;
  const WELLFOUND_SCROLL_BASE_WAIT_MS = 1800;
  const WELLFOUND_SCROLL_JITTER_MS = 1200;
  const WELLFOUND_SCROLL_STABLE_ROUNDS = 5;

  async function scrollUntilStable(documentRef, debug) {
    if (!root || !root.scrollTo || !documentRef || !documentRef.body) return;
    let lastCount = 0;
    let stableRounds = 0;
    const maxRounds = WELLFOUND_SCROLL_MAX_ROUNDS;

    for (let i = 0; i < maxRounds; i++) {
      root.scrollTo(0, documentRef.body.scrollHeight);
      await sleep(WELLFOUND_SCROLL_BASE_WAIT_MS + Math.floor(Math.random() * WELLFOUND_SCROLL_JITTER_MS));

      const count = collectJobLinks(documentRef).length;
      debug && debug.add('wellfoundScroll', { round: i + 1, count });

      if (documentRef.querySelector(selectors.endMarker)) {
        debug && debug.add('wellfoundEndMarker', { found: true });
        break;
      }

      if (count <= lastCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }
      lastCount = count;

      if (stableRounds >= WELLFOUND_SCROLL_STABLE_ROUNDS) {
        break;
      }
    }
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seen = new Set();

    await scrollUntilStable(documentRef, debug);

    const urls = collectJobLinks(documentRef);
    debug && debug.add('wellfoundLinks', { count: urls.length });

    urls.forEach(url => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      const jobId = utils.extractJobIdFromUrl(url);
      const job = createBaseJob(url, jobId);
      const shortUrl = url.replace('https://wellfound.com', '');
      const anchor = documentRef.querySelector(`a[href="${shortUrl}"]`) ||
        documentRef.querySelector(`a[href="${url}"]`);
      if (anchor) {
        const card = anchor.closest('[data-test*="JobCard"], [class*="jobCard"], [class*="job-card"], article, li');
        if (card) {
          const titleEl = card.querySelector('h1, h2, h3, [data-test*="title"], [class*="title"]');
          if (titleEl) job.JobTitle = utils.normalizeText(titleEl.textContent || '');
          const companyEl = card.querySelector('a[href*="/company/"]');
          if (companyEl) job.JobCompany = utils.normalizeText(companyEl.textContent || '');
          const locEl = card.querySelector('[class*="location"], [data-test*="location"]');
          if (locEl) job.JobLocation = utils.normalizeText(locEl.textContent || '');
        }
        if (!job.JobTitle) {
          const anchorText = utils.normalizeText(anchor.textContent || '');
          if (!isIgnoredTitle(anchorText)) {
            job.JobTitle = anchorText;
          }
        }
      }
      if (!job.JobTitle || isIgnoredTitle(job.JobTitle)) job.JobTitle = 'Untitled';
      jobs.push(job);
    });

    if (jobs.length === 0) {
      const nextData = parseNextData(documentRef);
      const apolloState = extractApolloState(nextData);
      const apolloJobs = extractJobsFromApollo(apolloState);
      debug && debug.add('wellfoundApolloJobs', { count: apolloJobs.length });
      apolloJobs.forEach(item => {
        const url = buildJobUrl(item.companySlug, item.id, item.slug);
        if (!url || seen.has(url)) return;
        seen.add(url);
        const job = createBaseJob(url, item.id);
        job.JobTitle = utils.normalizeText(item.title || '');
        job.JobCompany = utils.normalizeText(item.companyName || '');
        const location = item.locationNames.length
          ? item.locationNames.join(', ')
          : (item.acceptedRemoteLocationNames.length ? 'Remote' : '');
        job.JobLocation = utils.normalizeText(location);
        jobs.push(job);
      });
    }

    return jobs;
  }

  async function scrapeDetail(doc, ctx) {
    const documentRef = doc || document;
    const utils = getUtils();
    const pageUrl = (ctx && ctx.url) || (root.location ? root.location.href : '');
    const normalizedUrl = normalizeWellfoundJobUrl(pageUrl);
    const jobId = utils.extractJobIdFromUrl(normalizedUrl);
    const job = createBaseJob(normalizedUrl, jobId);

    const titleEl = documentRef.querySelector(selectors.jobTitle);
    if (titleEl) job.JobTitle = utils.normalizeText(titleEl.textContent || '');
    if (isGenericTitle(job.JobTitle)) {
      job.JobTitle = '';
    }

    const companyEl = documentRef.querySelector(selectors.companyName);
    if (companyEl) job.JobCompany = utils.normalizeText(companyEl.textContent || '');

    const locationEl = documentRef.querySelector(selectors.location);
    if (locationEl) job.JobLocation = utils.normalizeText(locationEl.textContent || '');

    const descEl = documentRef.querySelector(selectors.description);
    if (descEl) {
      const text = descEl.innerText || descEl.textContent || '';
      job.JobDescription = utils.normalizeText(text);
    }

    if (!job.JobTitle || !job.JobDescription) {
      const nextData = parseNextData(documentRef);
      const apolloState = extractApolloState(nextData);
      const apolloJobs = extractJobsFromApollo(apolloState);
      let match = null;
      if (jobId) {
        match = apolloJobs.find(item => String(item.id) === String(jobId));
      }
      if (!match && apolloJobs.length > 0) {
        match = apolloJobs[0];
      }
      if (match) {
        if (!job.JobTitle) job.JobTitle = utils.normalizeText(match.title || '');
        if (!job.JobCompany) job.JobCompany = utils.normalizeText(match.companyName || '');
        if (!job.JobLocation) {
          const location = match.locationNames.length
            ? match.locationNames.join(', ')
            : (match.acceptedRemoteLocationNames.length ? 'Remote' : '');
          job.JobLocation = utils.normalizeText(location);
        }
        if (!job.JobDescription && match.descriptionSnippet) {
          job.JobDescription = htmlToText(match.descriptionSnippet, utils);
        }
        if (!job.JobUrl) {
          const url = buildJobUrl(match.companySlug, match.id, match.slug);
          if (url) job.JobUrl = url;
        }
      }
    }

    if (!job.JobTitle) job.JobTitle = 'Untitled';
    return job;
  }

  const source = {
    id: 'wellfound',
    name: 'Wellfound',
    match: function(url) {
      return typeof url === 'string' && url.includes('wellfound.com');
    },
    scrapeList: scrapeList,
    scrapeDetail: scrapeDetail,
    defaults: {
      ScrapePageName: 'wellfound'
    }
  };

  if (root.registerScrapeSource) {
    root.registerScrapeSource(source);
  } else {
    console.warn('[scrape] registerScrapeSource not found for wellfound');
  }
})();
