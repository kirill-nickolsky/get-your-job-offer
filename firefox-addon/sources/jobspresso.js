/**
 * Source: Jobspresso (jobspresso.co)
 * List: remote-work / jobs archive (Load more listings button).
 * Detail: /job/<slug>/ pages (JSON-LD JobPosting).
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));

  const selectors = {
    listContainer: 'ul.job_listings',
    listItem: 'ul.job_listings li.job_listing, ul.job_listings li.type-job_listing',
    jobLink: 'a.job_listing-clickbox, a[href*="/job/"]',
    loadMore: 'a.load_more_jobs',
    title: '.position h3, .position strong, h1.entry-title, .entry-title, .job_listing-title',
    company: '.company, .job_listing-company, .company strong, .job_listing-company strong',
    location: '.location, .job_listing-location, .job-location',
    jobType: '.job-type, .job_listing-type, .job-types',
    jsonLd: 'script[type="application/ld+json"]',
    canonical: 'link[rel="canonical"]'
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
      const match = String(url).match(/jobspresso\.co\/job\/([^\/\?#]+)/i);
      if (match) return match[1];
      const postMatch = String(url).match(/[?&]p=(\d+)/);
      if (postMatch) return postMatch[1];
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

  function normalizeJobspressoUrl(rawUrl) {
    if (!rawUrl) return '';
    let url = String(rawUrl).trim();
    if (!url) return '';
    if (url.startsWith('/')) {
      const origin = (root.location && root.location.origin) ? root.location.origin : 'https://jobspresso.co';
      url = origin + url;
    }
    url = url.split('#')[0].split('?')[0];
    const match = url.match(/https?:\/\/(?:www\.)?jobspresso\.co\/job\/[^\/\?#]+\/?/i);
    if (match) {
      url = match[0];
    }
    if (!/jobspresso\.co\/job\//i.test(url)) {
      return '';
    }
    if (url.length > 1 && url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  function htmlToText(html, normalizeText) {
    if (!html) return '';
    try {
      const container = (root.document || document).createElement('div');
      container.innerHTML = html;
      return normalizeText(container.textContent || container.innerText || '');
    } catch (error) {
      return normalizeText(String(html).replace(/<[^>]*>/g, ' '));
    }
  }

  function parseJobPostingLd(documentRef) {
    const scripts = documentRef.querySelectorAll(selectors.jsonLd);
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      if (!script || !script.textContent) continue;
      try {
        const data = JSON.parse(script.textContent);
        if (Array.isArray(data)) {
          const found = data.find(item => item && item['@type'] === 'JobPosting');
          if (found) return found;
        } else if (data && data['@type'] === 'JobPosting') {
          return data;
        }
      } catch (error) {
        // ignore invalid JSON-LD
      }
    }
    return null;
  }

  function createBaseJob(jobUrl, jobId) {
    const utils = getUtils();
    return utils.createEmptyJob({
      JobUrl: jobUrl || '',
      JobId: jobId || ''
    });
  }

  function parseRssItems(xmlDoc, utils, debug) {
    if (!xmlDoc) return [];
    const items = Array.from(xmlDoc.querySelectorAll('item'));
    debug && debug.add('jobspressoRss', { count: items.length });
    return items.map(item => {
      const linkEl = item.querySelector('link');
      const titleEl = item.querySelector('title');
      const companyEl = item.getElementsByTagName('job_listing:company')[0];
      const locationEl = item.getElementsByTagName('job_listing:location')[0];
      const link = linkEl ? linkEl.textContent : '';
      const normalizedUrl = normalizeJobspressoUrl(link);
      return utils.createEmptyJob({
        JobUrl: normalizedUrl || link || '',
        JobId: utils.extractJobIdFromUrl(normalizedUrl || link || ''),
        JobTitle: utils.normalizeText(titleEl ? titleEl.textContent : '') || 'Untitled',
        JobCompany: utils.normalizeText(companyEl ? companyEl.textContent : ''),
        JobLocation: utils.normalizeText(locationEl ? locationEl.textContent : ''),
        JobTags: ''
      });
    }).filter(job => job.JobUrl);
  }

  function isRssDocument(documentRef, url) {
    if (!documentRef || !documentRef.documentElement) return false;
    const tag = String(documentRef.documentElement.tagName || '').toLowerCase();
    if (tag === 'rss' || tag === 'feed') return true;
    const contentType = (documentRef.contentType || '').toLowerCase();
    if (contentType.includes('xml') || contentType.includes('rss')) return true;
    return String(url || '').includes('feed=');
  }

  function extractJobsFromList(documentRef, utils, debug) {
    const jobs = [];
    const seenUrls = new Set();
    const seenKeys = new Set();

    const items = documentRef.querySelectorAll(selectors.listItem);
    debug && debug.add('jobspressoListItems', { count: items.length });

    const processLink = (linkEl, fallbackNode) => {
      let href = linkEl ? (linkEl.getAttribute('href') || linkEl.href) : '';
      const normalizedUrl = normalizeJobspressoUrl(href);
      if (!normalizedUrl) return;
      if (seenUrls.has(normalizedUrl)) return;
      seenUrls.add(normalizedUrl);

      const jobId = utils.extractJobIdFromUrl(normalizedUrl);
      const dedupKey = jobId ? `id|${jobId}` : `url|${normalizedUrl}`;
      if (seenKeys.has(dedupKey)) return;
      seenKeys.add(dedupKey);

      const container = fallbackNode || (linkEl ? linkEl.closest('li') : null);
      const titleEl = container ? container.querySelector(selectors.title) : null;
      const companyEl = container ? container.querySelector(selectors.company) : null;
      const locationEl = container ? container.querySelector(selectors.location) : null;
      const typeEl = container ? container.querySelector(selectors.jobType) : null;

      const jobTitle = utils.normalizeText(titleEl ? titleEl.textContent : (linkEl ? linkEl.textContent : '')) || 'Untitled';
      const jobCompany = utils.normalizeText(companyEl ? companyEl.textContent : '');
      const jobLocation = utils.normalizeText(locationEl ? locationEl.textContent : '');
      const jobTags = utils.normalizeText(typeEl ? typeEl.textContent : '');

      jobs.push(utils.createEmptyJob({
        JobUrl: normalizedUrl,
        JobId: jobId || '',
        JobTitle: jobTitle,
        JobCompany: jobCompany,
        JobLocation: jobLocation,
        JobTags: jobTags
      }));
    };

    if (items.length > 0) {
      items.forEach(item => {
        const linkEl = item.querySelector(selectors.jobLink);
        if (linkEl) {
          processLink(linkEl, item);
        }
      });
    } else {
      const links = documentRef.querySelectorAll(selectors.jobLink);
      links.forEach(link => processLink(link, link.closest('li')));
    }

    return jobs;
  }

  async function waitForListGrowth(documentRef, previousCount, debug) {
    const maxWaitMs = 10000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await sleep(400);
      const count = documentRef.querySelectorAll(selectors.listItem).length;
      if (count > previousCount) {
        debug && debug.add('jobspressoListGrowth', { from: previousCount, to: count });
        return true;
      }
    }
    debug && debug.add('jobspressoListGrowth', { from: previousCount, to: previousCount, timeout: true });
    return false;
  }

  function isLoadMoreVisible(button) {
    if (!button) return false;
    if (button.getAttribute('aria-disabled') === 'true') return false;
    if (button.classList.contains('disabled')) return false;
    const style = root.getComputedStyle ? root.getComputedStyle(button) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    if (button.style && button.style.display === 'none') return false;
    return true;
  }

  async function clickLoadMoreTimes(documentRef, debug, times) {
    let clicks = 0;
    for (let i = 0; i < times; i++) {
      const button = documentRef.querySelector(selectors.loadMore);
      if (!isLoadMoreVisible(button)) {
        debug && debug.add('jobspressoLoadMore', { round: i + 1, clicked: false, reason: 'not-visible' });
        break;
      }
      const before = documentRef.querySelectorAll(selectors.listItem).length;
      button.click();
      clicks += 1;
      debug && debug.add('jobspressoLoadMore', { round: i + 1, clicked: true, before: before });
      await waitForListGrowth(documentRef, before, debug);
      await sleep(500 + Math.floor(Math.random() * 500));
    }
    return clicks;
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const pageUrl = (ctx && ctx.url) ? ctx.url : (root.location ? root.location.href : '');

    if (isRssDocument(documentRef, pageUrl)) {
      return parseRssItems(documentRef, utils, debug);
    }

    await sleep(1200);

    const initialCount = documentRef.querySelectorAll(selectors.listItem).length;
    debug && debug.add('jobspressoInitial', { count: initialCount });

    await clickLoadMoreTimes(documentRef, debug, 3);

    let jobs = extractJobsFromList(documentRef, utils, debug);

    if (!jobs || jobs.length === 0) {
      const rssLink = documentRef.querySelector('link[type="application/rss+xml"][href*="job_feed"], link[type="application/rss+xml"][href*="/remote-work/feed"]');
      if (rssLink && rssLink.href) {
        try {
          const response = await fetch(rssLink.href, { credentials: 'include' });
          if (response.ok) {
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
            jobs = parseRssItems(xmlDoc, utils, debug);
          }
        } catch (error) {
          debug && debug.add('jobspressoRssError', { message: error.toString() });
        }
      }
    }

    return jobs || [];
  }

  async function scrapeDetail(doc, ctx) {
    const documentRef = doc || document;
    const utils = getUtils();
    const debug = ctx && ctx.debug;
    const pageUrl = (ctx && ctx.url) ? ctx.url : (root.location ? root.location.href : '');

    const canonical = documentRef.querySelector(selectors.canonical);
    const canonicalUrl = canonical ? canonical.getAttribute('href') : '';
    const normalizedUrl = normalizeJobspressoUrl(canonicalUrl || pageUrl) || pageUrl;
    const job = createBaseJob(normalizedUrl, utils.extractJobIdFromUrl(normalizedUrl));

    const ld = parseJobPostingLd(documentRef);
    if (ld) {
      job.JobTitle = ld.title || job.JobTitle;
      job.JobCompany = (ld.hiringOrganization && ld.hiringOrganization.name) || job.JobCompany;
      job.JobPostedDttm = ld.datePosted || job.JobPostedDttm;
      job.JobDescription = htmlToText(ld.description || '', utils.normalizeText);

      const loc = ld.jobLocation;
      if (loc) {
        if (typeof loc === 'string') {
          job.JobLocation = utils.normalizeText(loc);
        } else if (loc.address) {
          if (typeof loc.address === 'string') {
            job.JobLocation = utils.normalizeText(loc.address);
          } else if (loc.address.addressLocality) {
            job.JobLocation = utils.normalizeText(loc.address.addressLocality);
          }
        }
      }

      if (ld.jobLocationType === 'TELECOMMUTE') {
        job.JobModality = 'Remote';
      }

      if (!job.JobId && ld.identifier && ld.identifier.value) {
        const match = String(ld.identifier.value).match(/[?&]p=(\d+)/);
        if (match) {
          job.JobId = match[1];
        }
      }
    }

    if (!job.JobTitle) {
      const titleEl = documentRef.querySelector(selectors.title) || documentRef.querySelector('title');
      if (titleEl) {
        job.JobTitle = utils.normalizeText(titleEl.textContent || titleEl.innerText || '');
      }
    }

    if (!job.JobCompany) {
      const companyEl = documentRef.querySelector(selectors.company);
      if (companyEl) {
        job.JobCompany = utils.normalizeText(companyEl.textContent || '');
      }
    }

    if (!job.JobLocation) {
      const locationEl = documentRef.querySelector(selectors.location);
      if (locationEl) {
        job.JobLocation = utils.normalizeText(locationEl.textContent || '');
      }
    }

    if (!job.JobDescription) {
      const descEl = documentRef.querySelector('.job_description, .job_listing-description, .entry-content');
      if (descEl) {
        job.JobDescription = utils.normalizeText(descEl.textContent || '');
      }
    }

    debug && debug.add('jobspressoDetail', { title: job.JobTitle, company: job.JobCompany });
    return job;
  }

  const source = {
    id: 'jobspresso',
    name: 'Jobspresso',
    match(url) {
      return String(url || '').includes('jobspresso.co');
    },
    scrapeList: scrapeList,
    scrapeDetail: scrapeDetail
  };

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource(source);
  }
})();
