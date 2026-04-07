/**
 * Source: Work at a Startup (workatastartup.com)
 * List: /companies (infinite scroll; collect companies with jobs, then fetch company pages for job links).
 * Detail: /jobs/<id> (data-page JSON in ApplyButton-react-component).
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));

  const selectors = {
    companyLink: 'a[href^="/companies/"]',
    companyData: 'div[id^="FullCompanyProfile-react-component"][data-page]',
    applyData: 'div[id^="ApplyButton-react-component"][data-page]'
  };

  const NO_JOBS_PHRASE = 'No specific jobs listed. You can still apply and we\'ll let the founders know.';
  const WAAS_INITIAL_LIST_READY_TIMEOUT_MS = 15000;
  const WAAS_INITIAL_LIST_READY_POLL_MS = 350;
  const WAAS_INITIAL_LIST_STABLE_ROUNDS = 2;

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
      const match = String(url).match(/\/jobs\/(\d+)/i);
      if (match) return match[1];
      const numMatch = String(url).match(/\/(\d+)(?:\/|$|\?)/);
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

  function decodeHtmlEntities(value, documentRef) {
    if (!value) return '';
    try {
      const doc = documentRef || (root.document || document);
      const textarea = doc.createElement('textarea');
      textarea.innerHTML = value;
      return textarea.value;
    } catch (error) {
      return String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }
  }

  function htmlToText(html, normalizeText, documentRef) {
    if (!html) return '';
    try {
      const doc = documentRef || (root.document || document);
      const container = doc.createElement('div');
      container.innerHTML = html;
      return normalizeText(container.textContent || container.innerText || '');
    } catch (error) {
      return normalizeText(String(html).replace(/<[^>]*>/g, ' '));
    }
  }

  function normalizeWaasUrl(rawUrl) {
    if (!rawUrl) return '';
    let url = String(rawUrl).trim();
    if (!url) return '';
    if (url.startsWith('/')) {
      const origin = (root.location && root.location.origin) ? root.location.origin : 'https://www.workatastartup.com';
      url = origin + url;
    }
    url = url.split('#')[0].split('?')[0];
    return url;
  }

  function parseDataPageElement(element, documentRef, debug) {
    if (!element) return null;
    const raw = element.getAttribute('data-page');
    if (!raw) return null;
    const decoded = decodeHtmlEntities(raw, documentRef);
    try {
      return JSON.parse(decoded);
    } catch (error) {
      debug && debug.add('waasDataPageParseError', { message: error.message });
      return null;
    }
  }

  function isVisaOnly(job, normalizeText) {
    const text = normalizeText(job && (job.pretty_sponsors_visa || job.visa || job.pretty_visa || ''));
    const lower = text.toLowerCase();
    return lower.includes('us citizen/visa only') || lower.includes('us citizens only') ||
      lower.includes('visa only') || lower.includes('citizen only') || lower.includes('citizenship');
  }

  function mapJobFromCompanyJob(job, company, utils, documentRef, includeDescription) {
    if (!job) return null;
    const jobUrl = normalizeWaasUrl(job.show_path || job.showPath || job.url || '');
    const jobId = job.id ? String(job.id) : utils.extractJobIdFromUrl(jobUrl);
    const jobTitle = utils.normalizeText(job.title || '');

    let jobLocation = utils.normalizeText(job.pretty_location_or_remote || '');
    if (!jobLocation && Array.isArray(job.locations) && job.locations.length > 0) {
      jobLocation = utils.normalizeText(job.locations.join(', '));
    }
    if (!jobLocation && job.location) {
      jobLocation = utils.normalizeText(job.location);
    }

    let jobSalary = utils.normalizeText(job.pretty_salary_range || '');
    if (!jobSalary && (job.salary_min || job.salary_max)) {
      const min = job.salary_min || '';
      const max = job.salary_max || '';
      jobSalary = utils.normalizeText(`${min}${min && max ? ' - ' : ''}${max}`);
    }

    const jobSeniority = utils.normalizeText(job.pretty_min_experience || '');
    const jobTags = utils.normalizeText(job.pretty_role || job.pretty_eng_type || job.pretty_sub_type || '');
    const jobPostedDttm = utils.normalizeText(job.pretty_updated_at || '');

    let jobModality = '';
    const locLower = String(jobLocation || '').toLowerCase();
    if (locLower.includes('remote') || job.remote === 'yes' || job.remote === true) {
      jobModality = 'Remote';
    } else {
      jobModality = utils.normalizeText(job.pretty_job_type || '');
    }

    const companyName = utils.normalizeText((company && (company.name || company.company_name)) || '');

    const description = includeDescription ? htmlToText(job.description || '', utils.normalizeText, documentRef) : '';

    return utils.createEmptyJob({
      JobUrl: jobUrl,
      JobId: jobId || '',
      JobTitle: jobTitle,
      JobCompany: companyName,
      JobLocation: jobLocation,
      JobSeniority: jobSeniority,
      JobModality: jobModality,
      JobSalary: jobSalary,
      JobTags: jobTags,
      JobPostedDttm: jobPostedDttm,
      JobDescription: description
    });
  }

  function extractCompanyJobsFromHtml(html, utils, debug) {
    if (!html) return { company: null, jobs: [] };
    const parser = root.DOMParser ? new root.DOMParser() : null;
    if (!parser) return { company: null, jobs: [] };
    const doc = parser.parseFromString(html, 'text/html');
    const dataEl = doc.querySelector(selectors.companyData);
    const dataPage = parseDataPageElement(dataEl, doc, debug);
    const props = dataPage && dataPage.props ? dataPage.props : null;
    const company = props && props.rawCompany ? props.rawCompany : null;
    const jobs = company && Array.isArray(company.jobs) ? company.jobs : [];
    return { company, jobs };
  }

  function collectCompanyLinks(documentRef, utils) {
    const links = Array.from(documentRef.querySelectorAll(selectors.companyLink));
    const urls = [];
    const seen = new Set();

    links.forEach(link => {
      const href = link.getAttribute('href') || link.href || '';
      if (!href) return;
      if (href.includes('/companies?') || href === '/companies') return;
      if (!/\/companies\/[A-Za-z0-9\-]+/.test(href)) return;

      const normalized = normalizeWaasUrl(href);
      if (!normalized) return;
      if (seen.has(normalized)) return;

      const card = link.closest('article') || link.closest('li') || link.closest('div');
      const cardText = utils.normalizeText(card ? card.textContent : link.textContent || '');
      if (cardText.includes(NO_JOBS_PHRASE)) return;

      seen.add(normalized);
      urls.push(normalized);
    });

    return urls;
  }

  async function scrollCompaniesUntilStable(documentRef, debug) {
    if (!root || typeof root.scrollTo !== 'function' || !documentRef || !documentRef.body) return;
    let lastCount = collectCompanyLinks(documentRef, getUtils()).length;
    let noNewRounds = 0;
    let round = 0;

    while (noNewRounds < 3) {
      round++;
      root.scrollTo(0, documentRef.body.scrollHeight);
      await sleep(1200 + Math.floor(Math.random() * 600));

      const count = collectCompanyLinks(documentRef, getUtils()).length;
      debug && debug.add('waasScroll', { round: round, count });

      if (count > lastCount) {
        noNewRounds = 0;
        lastCount = count;
      } else {
        noNewRounds += 1;
      }
    }
  }

  function getWaasListReadyTimeoutMs_(ctx) {
    const rawMultiplier = parseFloat(String((ctx && ctx.waasListReadyTimeoutMultiplier) || '1'));
    const multiplier = Number.isNaN(rawMultiplier) ? 1 : Math.max(1, rawMultiplier);
    return Math.max(1000, Math.round(WAAS_INITIAL_LIST_READY_TIMEOUT_MS * multiplier));
  }

  async function waitForCompaniesListReady_(documentRef, debug, ctx) {
    const timeoutMs = getWaasListReadyTimeoutMs_(ctx);
    const startedAt = Date.now();
    let polls = 0;
    let stableRounds = 0;
    let lastCount = -1;

    while (Date.now() - startedAt < timeoutMs) {
      const readyState = String(documentRef && documentRef.readyState ? documentRef.readyState : '');
      const count = collectCompanyLinks(documentRef, getUtils()).length;

      if (count > 0 && count === lastCount) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      // Start scrolling only after list is visible and not changing immediately.
      if (count > 0 && (readyState === 'complete' || stableRounds >= WAAS_INITIAL_LIST_STABLE_ROUNDS)) {
        debug && debug.add('waasListReady', {
          ready: true,
          timeoutMs: timeoutMs,
          waitMs: Date.now() - startedAt,
          polls: polls,
          count: count,
          readyState: readyState
        });
        return { ready: true, count: count };
      }

      lastCount = count;
      polls += 1;
      await sleep(WAAS_INITIAL_LIST_READY_POLL_MS);
    }

    const finalCount = collectCompanyLinks(documentRef, getUtils()).length;
    debug && debug.add('waasListReady', {
      ready: false,
      timeoutMs: timeoutMs,
      waitMs: Date.now() - startedAt,
      polls: polls,
      count: finalCount,
      readyState: documentRef && documentRef.readyState ? documentRef.readyState : ''
    });
    return { ready: finalCount > 0, count: finalCount };
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seenUrls = new Set();

    const readiness = await waitForCompaniesListReady_(documentRef, debug, ctx || {});
    if (!readiness.ready && readiness.count === 0) {
      debug && debug.add('waasListEmptyAfterReadyTimeout', {
        timeoutMs: getWaasListReadyTimeoutMs_(ctx || {}),
        retryAttempt: parseInt(String((ctx && ctx.waasListRetryAttempt) || '0'), 10) || 0
      });
      return jobs;
    }

    await scrollCompaniesUntilStable(documentRef, debug);

    const companyUrls = collectCompanyLinks(documentRef, utils);
    debug && debug.add('waasCompanies', { count: companyUrls.length });

    if (typeof root.fetch !== 'function') {
      debug && debug.add('waasFetchMissing', { message: 'fetch not available' });
      return [];
    }

    for (let i = 0; i < companyUrls.length; i++) {
      const companyUrl = companyUrls[i];
      try {
        const response = await root.fetch(companyUrl, { credentials: 'include' });
        if (!response.ok) {
          debug && debug.add('waasCompanyFetch', { url: companyUrl, status: response.status });
          continue;
        }
        const html = await response.text();
        const parsed = extractCompanyJobsFromHtml(html, utils, debug);
        const company = parsed.company;
        const companyJobs = parsed.jobs;
        debug && debug.add('waasCompanyJobs', { url: companyUrl, count: companyJobs.length });

        companyJobs.forEach(rawJob => {
          if (isVisaOnly(rawJob, utils.normalizeText)) return;
          const mapped = mapJobFromCompanyJob(rawJob, company, utils, documentRef, false);
          if (!mapped || !mapped.JobUrl) return;
          if (seenUrls.has(mapped.JobUrl)) return;
          seenUrls.add(mapped.JobUrl);
          jobs.push(mapped);
        });
      } catch (error) {
        debug && debug.add('waasCompanyError', { url: companyUrl, message: error.message });
      }

      if (i % 5 === 0) {
        await sleep(200 + Math.floor(Math.random() * 200));
      }
    }

    return jobs;
  }

  function extractJobFromApplyData(documentRef, jobId, pageUrl, utils, debug) {
    const dataEl = documentRef.querySelector(selectors.applyData);
    const dataPage = parseDataPageElement(dataEl, documentRef, debug);
    const props = dataPage && dataPage.props ? dataPage.props : null;
    const company = props && props.company ? props.company : null;
    const jobs = company && Array.isArray(company.jobs) ? company.jobs : [];
    if (jobs.length === 0) return { company: company, job: null };

    const job = jobs.find(item => String(item.id) === String(jobId)) ||
      jobs.find(item => item.show_path && normalizeWaasUrl(item.show_path) === normalizeWaasUrl(pageUrl)) ||
      jobs.find(item => item.show_path && String(item.show_path).includes(`/jobs/${jobId}`)) ||
      jobs[0];

    return { company: company, job: job };
  }

  function extractDescriptionFromDom(documentRef, utils) {
    const headings = Array.from(documentRef.querySelectorAll('.company-section span'));
    const aboutRole = headings.find(el => utils.normalizeText(el.textContent).toLowerCase() === 'about the role');
    if (aboutRole) {
      const container = aboutRole.closest('.company-section');
      const next = container ? container.nextElementSibling : null;
      if (next) {
        return utils.normalizeText(next.textContent || next.innerText || '');
      }
    }
    const prose = documentRef.querySelector('.prose');
    if (prose) {
      return utils.normalizeText(prose.textContent || prose.innerText || '');
    }
    return '';
  }

  async function scrapeDetail(doc, ctx) {
    const documentRef = doc || document;
    const utils = getUtils();
    const debug = ctx && ctx.debug;
    const pageUrl = (ctx && ctx.url) ? ctx.url : (root.location ? root.location.href : '');
    const jobId = utils.extractJobIdFromUrl(pageUrl);

    const parsed = extractJobFromApplyData(documentRef, jobId, pageUrl, utils, debug);
    if (parsed.job) {
      const mapped = mapJobFromCompanyJob(parsed.job, parsed.company, utils, documentRef, true);
      if (mapped) {
        mapped.JobUrl = normalizeWaasUrl(pageUrl) || mapped.JobUrl;
        if (!mapped.JobId && jobId) mapped.JobId = jobId;
        return mapped;
      }
    }

    const titleEl = documentRef.querySelector('h1') || documentRef.querySelector('title');
    const companyLink = documentRef.querySelector('a[href^="/companies/"]');
    const job = utils.createEmptyJob({
      JobUrl: normalizeWaasUrl(pageUrl),
      JobId: jobId || ''
    });
    if (titleEl) job.JobTitle = utils.normalizeText(titleEl.textContent || titleEl.innerText || '');
    if (companyLink) job.JobCompany = utils.normalizeText(companyLink.textContent || companyLink.innerText || '');
    if (!job.JobDescription) {
      job.JobDescription = extractDescriptionFromDom(documentRef, utils);
    }
    const locationEl = documentRef.querySelector('.fa-map-marker')
      ? documentRef.querySelector('.fa-map-marker').closest('span')
      : null;
    if (locationEl) {
      job.JobLocation = utils.normalizeText(locationEl.textContent || locationEl.innerText || '');
    }
    return job;
  }

  const source = {
    id: 'workatastartup',
    name: 'Work at a Startup (YC)',
    match(url) {
      return String(url || '').includes('workatastartup.com');
    },
    scrapeList,
    scrapeDetail,
    defaults: {
      ScrapePageName: 'workatastartup'
    }
  };

  if (typeof registerScrapeSource === 'function') {
    registerScrapeSource(source);
  } else if (root && typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource(source);
  }
})();
