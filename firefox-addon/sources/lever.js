/**
 * Source: Lever (jobs.lever.co)
 * List: Lever postings list on jobs.lever.co/<company>.
 * Detail: Lever posting page (description + metadata).
 * Notes: Lever HTML is mostly static, selectors are stable.
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const selectors = {
    jsonLd: 'script[type=\"application/ld+json\"]',
    listItem: '.posting'
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
      const leverMatch = url.match(/jobs\.lever\.co\/[^\/]+\/([^\/\?]+)/i);
      if (leverMatch) return leverMatch[1];
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
    return {normalizeText, extractJobIdFromUrl, createEmptyJob};
  }

  function getLeverCompanyName(documentRef, normalizeText) {
    const metaTitle = documentRef.querySelector('meta[property="og:title"]');
    const raw = normalizeText(metaTitle ? metaTitle.getAttribute('content') : documentRef.title);
    return raw.replace(/\s+jobs$/i, '').trim();
  }

  function parseLeverJobPostingLd(documentRef) {
    const scripts = documentRef.querySelectorAll(selectors.jsonLd);
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      try {
        const data = JSON.parse(script.textContent || '{}');
        if (Array.isArray(data)) {
          const found = data.find(item => item && item['@type'] === 'JobPosting');
          if (found) return found;
        } else if (data && data['@type'] === 'JobPosting') {
          return data;
        }
      } catch (error) {
        // Ignore invalid JSON-LD blocks
      }
    }
    return null;
  }

  function htmlToText(html, normalizeText) {
    if (!html) return '';
    const container = document.createElement('div');
    container.innerHTML = html;
    return normalizeText(container.textContent || container.innerText || '');
  }

  function normalizeLeverUrl(rawUrl, origin) {
    if (!rawUrl) return '';
    let url = String(rawUrl).trim();
    if (!url) return '';
    if (url.startsWith('/')) {
      url = (origin || '') + url;
    }
    url = url.split('#')[0].split('?')[0];
    if (url.length > 1 && url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    return url;
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seenUrls = new Set();
    const seenKeys = new Set();
    const origin = (root.location && root.location.origin) ? root.location.origin : '';
    const companyName = getLeverCompanyName(documentRef, utils.normalizeText);

    await sleep(300);

    const postings = documentRef.querySelectorAll(selectors.listItem);
    debug && debug.add('leverPostings', {count: postings.length});

    postings.forEach(posting => {
      try {
        const linkEl = posting.querySelector('a.posting-title') ||
          posting.querySelector('a[href*="jobs.lever.co/"]');
        let href = linkEl ? (linkEl.getAttribute('href') || linkEl.href) : '';
        if (!href) return;
        href = normalizeLeverUrl(href, origin);
        if (!href) return;
        if (seenUrls.has(href)) return;
        seenUrls.add(href);

        const jobId = posting.getAttribute('data-qa-posting-id') || utils.extractJobIdFromUrl(href);
        const dedupKey = jobId ? `id|${jobId}` : `url|${href}`;
        if (seenKeys.has(dedupKey)) return;
        seenKeys.add(dedupKey);
        const titleEl = posting.querySelector('[data-qa="posting-name"]');
        const jobTitle = utils.normalizeText(titleEl ? titleEl.textContent : (linkEl ? linkEl.textContent : '')) || 'Untitled';
        const locationEl = posting.querySelector('.posting-category.location');
        const jobLocation = utils.normalizeText(locationEl ? locationEl.textContent : '');

        const commitmentEl = posting.querySelector('.posting-category.commitment');
        const commitmentText = utils.normalizeText(commitmentEl ? commitmentEl.textContent : '');

        const workplaceEl = posting.querySelector('.workplaceTypes');
        const workplaceText = utils.normalizeText(workplaceEl ? workplaceEl.textContent : '')
          .replace(/[-–—]\s*$/, '')
          .trim();

        const groupTitleEl = posting.closest('.postings-group')
          ? posting.closest('.postings-group').querySelector('.posting-category-title')
          : null;
        const groupTitle = utils.normalizeText(groupTitleEl ? groupTitleEl.textContent : '');

        let jobModality = '';
        const modalityText = `${workplaceText} ${commitmentText}`.toLowerCase();
        if (modalityText.includes('remote')) {
          jobModality = 'Remote';
        } else if (modalityText.includes('hybrid')) {
          jobModality = 'Hybrid';
        } else if (modalityText.includes('on-site') || modalityText.includes('onsite')) {
          jobModality = 'Onsite';
        } else {
          jobModality = workplaceText || commitmentText;
        }

        jobs.push(utils.createEmptyJob({
          JobUrl: href,
          JobId: jobId || '',
          JobTitle: jobTitle,
          JobCompany: companyName,
          JobLocation: jobLocation,
          JobModality: jobModality,
          JobTags: groupTitle,
        }));
      } catch (error) {
        console.error('Error processing Lever posting:', error);
      }
    });

    return jobs;
  }

  function createBaseJob(jobUrl, jobId) {
    const utils = getUtils();
    return utils.createEmptyJob({
      JobUrl: jobUrl || '',
      JobId: jobId || ''
    });
  }

  async function scrapeDetail(doc, ctx) {
    const documentRef = doc || document;
    const utils = getUtils();
    const debug = ctx && ctx.debug;
    const pageUrl = (ctx && ctx.url) ? ctx.url : (root.location ? root.location.href : '');
    const job = createBaseJob(pageUrl, utils.extractJobIdFromUrl(pageUrl));

    const ld = parseLeverJobPostingLd(documentRef);
    if (ld) {
      job.JobTitle = ld.title || job.JobTitle;
      job.JobCompany = (ld.hiringOrganization && ld.hiringOrganization.name) || job.JobCompany;
      job.JobPostedDttm = ld.datePosted || job.JobPostedDttm;
      job.JobDescription = htmlToText(ld.description || '', utils.normalizeText);

      const locEntries = Array.isArray(ld.jobLocation)
        ? ld.jobLocation
        : (ld.jobLocation ? [ld.jobLocation] : []);
      const locations = [];
      locEntries.forEach(loc => {
        if (!loc) return;
        if (typeof loc === 'string') {
          locations.push(loc);
          return;
        }
        const address = loc.address;
        if (typeof address === 'string') {
          locations.push(address);
          return;
        }
        if (address && typeof address.addressLocality === 'string') {
          locations.push(address.addressLocality);
        }
      });
      if (locations.length > 0) {
        job.JobLocation = locations.join(', ');
      }

      const locationText = locations.join(' ').toLowerCase();
      if (locationText.includes('remote')) {
        job.JobModality = 'Remote';
      } else if (ld.jobLocationType === 'TELECOMMUTE') {
        job.JobModality = 'Remote';
      } else if (ld.employmentType) {
        job.JobModality = ld.employmentType;
      }

      if (!job.JobId && ld.identifier && ld.identifier.value) {
        job.JobId = ld.identifier.value;
      }
    }

    if (!job.JobTitle) {
      const titleEl = documentRef.querySelector('h2') || documentRef.querySelector('h1') || documentRef.querySelector('title');
      if (titleEl) {
        job.JobTitle = utils.normalizeText(titleEl.textContent || titleEl.innerText || '');
        job.JobTitle = job.JobTitle.replace(/^[^-]+-\s*/i, '').trim();
      }
    }

    if (!job.JobCompany) {
      const titleText = utils.normalizeText(documentRef.title || '');
      const companyMatch = titleText.match(/^([^-]+)\s*-/);
      if (companyMatch) {
        job.JobCompany = utils.normalizeText(companyMatch[1]);
      }
    }

    if (!job.JobLocation) {
      const locationMeta = documentRef.querySelector('meta[name="twitter:data1"]');
      if (locationMeta) {
        job.JobLocation = utils.normalizeText(locationMeta.getAttribute('content') || '');
      }
    }

    if (!job.JobTags) {
      const teamMeta = documentRef.querySelector('meta[name="twitter:data2"]');
      if (teamMeta) {
        job.JobTags = utils.normalizeText(teamMeta.getAttribute('content') || '');
      }
    }

    if (!job.JobDescription) {
      const descMeta = documentRef.querySelector('meta[name="twitter:description"]') ||
        documentRef.querySelector('meta[property="og:description"]');
      if (descMeta) {
        job.JobDescription = utils.normalizeText(descMeta.getAttribute('content') || '');
      }
    }

    if (job.JobDescription && job.JobDescription.length > 10000) {
      job.JobDescription = job.JobDescription.substring(0, 10000) + '...';
    }

    debug && debug.add('leverDetail', {title: job.JobTitle, company: job.JobCompany});
    return job;
  }

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource({
      id: 'lever',
      name: 'Lever',
      match(url) {
        return String(url || '').includes('jobs.lever.co/');
      },
      scrapeList: scrapeList,
      scrapeDetail: scrapeDetail
    });
  }
})();
