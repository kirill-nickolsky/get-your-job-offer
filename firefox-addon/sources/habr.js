/**
 * Source: Habr Career (career.habr.com)
 * List: vacancies search page (list items with title/company/location).
 * Detail: vacancy page /vacancies/* (description + tags).
 * Notes: qid parameter controls seniority presets.
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const selectors = {
    listItem: '.vacancy-card',
    listTags: '.vacancy-card__skills a'
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
      const habrMatch = url.match(/\/vacancies\/(\d+)/);
      if (habrMatch) return habrMatch[1];
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

  function parseHabrSsrState(documentRef) {
    const el = documentRef.querySelector('script[type="application/json"][data-ssr-state="true"]');
    if (!el) return null;
    try {
      return JSON.parse(el.textContent || el.innerText || '{}');
    } catch (error) {
      console.error('Failed to parse Habr SSR state:', error);
      return null;
    }
  }

  function normalizeHabrChipText(text, normalizeText) {
    return normalizeText(text).toLowerCase();
  }

  function parseHabrJobPostingLd(documentRef) {
    const el = documentRef.querySelector('script[type="application/ld+json"]');
    if (!el) return null;
    try {
      const data = JSON.parse(el.textContent || '{}');
      if (Array.isArray(data)) {
        return data.find(item => item && item['@type'] === 'JobPosting') || null;
      }
      if (data && data['@type'] === 'JobPosting') {
        return data;
      }
    } catch (error) {
      console.error('Failed to parse Habr JSON-LD:', error);
    }
    return null;
  }

  function htmlToText(html, normalizeText) {
    if (!html) return '';
    const container = document.createElement('div');
    container.innerHTML = html;
    return normalizeText(container.textContent || container.innerText || '');
  }

  function toAbsoluteUrl(href, baseUrl) {
    if (!href) return '';
    try {
      return new URL(String(href), String(baseUrl || '')).href;
    } catch (error) {
      return '';
    }
  }

  function parsePageNumber(url) {
    try {
      const parsed = new URL(String(url || ''));
      const raw = parsed.searchParams.get('page') || '1';
      const value = parseInt(String(raw), 10);
      return Number.isNaN(value) || value < 1 ? 1 : value;
    } catch (error) {
      return 1;
    }
  }

  function buildPageUrl(url, pageNumber) {
    try {
      const parsed = new URL(String(url || ''));
      if (pageNumber <= 1) {
        parsed.searchParams.delete('page');
      } else {
        parsed.searchParams.set('page', String(pageNumber));
      }
      return parsed.href;
    } catch (error) {
      return '';
    }
  }

  function getTotalPagesFromSsr(ssrState) {
    try {
      const raw = ssrState &&
        ssrState.vacancies &&
        ssrState.vacancies.meta &&
        ssrState.vacancies.meta.totalPages;
      const total = parseInt(String(raw || ''), 10);
      return Number.isNaN(total) || total < 1 ? 1 : total;
    } catch (error) {
      return 1;
    }
  }

  function getNextPageUrl(documentRef, currentUrl) {
    const anchors = Array.from(documentRef.querySelectorAll('a[href]'));
    if (anchors.length === 0) return '';

    // 1) Prefer explicit rel=next / next labels.
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const rel = String(anchor.getAttribute('rel') || '').toLowerCase();
      const aria = String(anchor.getAttribute('aria-label') || '').toLowerCase();
      const text = String(anchor.textContent || '').trim().toLowerCase();
      if (rel.includes('next') || aria.includes('next') || aria.includes('след') || text === 'next' || text.includes('след')) {
        const abs = toAbsoluteUrl(anchor.getAttribute('href') || anchor.href, currentUrl);
        if (abs) return abs;
      }
    }

    // 2) Fallback: find smallest page>N link.
    const currentPage = parsePageNumber(currentUrl);
    let bestUrl = '';
    let bestPage = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const abs = toAbsoluteUrl(anchor.getAttribute('href') || anchor.href, currentUrl);
      if (!abs) continue;
      let parsed = null;
      try {
        parsed = new URL(abs);
      } catch (error) {
        continue;
      }
      if (!parsed.searchParams.has('page')) continue;
      const page = parsePageNumber(abs);
      if (page > currentPage && page < bestPage) {
        bestPage = page;
        bestUrl = abs;
      }
    }
    return bestUrl;
  }

  function addJobsFromSsrList(list, origin, utils, seenUrls, jobs) {
    list.forEach(item => {
      try {
        const href = item.href ? new URL(item.href, origin).href : '';
        if (!href || seenUrls.has(href)) return;
        seenUrls.add(href);

        const jobId = item.id || utils.extractJobIdFromUrl(href);
        const jobTitle = item.title || 'Untitled';
        const jobCompany = (item.company && item.company.title) ? item.company.title : '';
        const jobPostedDttm = item.publishedDate ? (item.publishedDate.title || item.publishedDate.date || '') : '';
        const jobSalary = (item.salary && item.salary.formatted) ||
          (item.predictedSalary && item.predictedSalary.formatted) || '';
        const jobTags = Array.isArray(item.skills)
          ? item.skills.map(skill => skill && skill.title).filter(Boolean).join(', ')
          : '';
        const locations = Array.isArray(item.locations)
          ? item.locations.map(loc => loc && loc.title).filter(Boolean)
          : [];
        const jobLocation = locations.join(', ');
        const jobSeniority = item.qualification || (item.salaryQualification && item.salaryQualification.title) || '';
        const jobModality = item.remoteWork ? 'Remote' : '';

        jobs.push(utils.createEmptyJob({
          JobUrl: href,
          JobId: jobId || '',
          JobTitle: jobTitle,
          JobCompany: jobCompany,
          JobLocation: jobLocation,
          JobSeniority: jobSeniority,
          JobModality: jobModality,
          JobSalary: jobSalary,
          JobTags: jobTags,
          JobPostedDttm: jobPostedDttm
        }));
      } catch (error) {
        console.error('Error processing Habr vacancy item:', error);
      }
    });
  }

  function addJobsFromCards(documentRef, origin, utils, seenUrls, jobs) {
    const cards = documentRef.querySelectorAll(selectors.listItem);
    cards.forEach(card => {
      try {
        const linkEl = card.querySelector('.vacancy-card__title-link') ||
          card.querySelector('.vacancy-card__backdrop-link');
        let href = linkEl ? (linkEl.getAttribute('href') || linkEl.href) : '';
        if (!href) return;
        if (href.startsWith('/')) {
          href = origin + href;
        }
        if (seenUrls.has(href)) return;
        seenUrls.add(href);

        const jobId = utils.extractJobIdFromUrl(href);
        const jobTitle = utils.normalizeText(linkEl ? linkEl.textContent : '') || 'Untitled';
        const companyEl = card.querySelector('.vacancy-card__company a');
        const jobCompany = utils.normalizeText(companyEl ? companyEl.textContent : '');

        const dateEl = card.querySelector('.vacancy-card__date time');
        const jobPostedDttm = dateEl
          ? (dateEl.getAttribute('datetime') || utils.normalizeText(dateEl.textContent || ''))
          : '';

        const salaryEl = card.querySelector('.vacancy-card__salary');
        const jobSalary = utils.normalizeText(salaryEl ? salaryEl.textContent : '');

        let jobLocation = '';
        const locationIcon = card.querySelector('.svg-icon--icon-placemark');
        if (locationIcon) {
          const locationChip = locationIcon.closest('.basic-chip');
          jobLocation = utils.normalizeText(locationChip ? locationChip.textContent : '');
        }

        let jobSeniority = '';
        const gradeIcon = card.querySelector('.svg-icon--icon-grade');
        if (gradeIcon) {
          const gradeChip = gradeIcon.closest('.basic-chip');
          jobSeniority = utils.normalizeText(gradeChip ? gradeChip.textContent : '');
        }

        let jobModality = '';
        const formatIcon = card.querySelector('.svg-icon--icon-format');
        if (formatIcon) {
          const formatChip = formatIcon.closest('.basic-chip');
          const formatText = normalizeHabrChipText(formatChip ? formatChip.textContent : '', utils.normalizeText);
          if (formatText.includes('удал')) {
            jobModality = 'Remote';
          }
        }

        const tagEls = card.querySelectorAll(selectors.listTags);
        const jobTags = Array.from(tagEls)
          .map(el => utils.normalizeText(el.textContent))
          .filter(Boolean)
          .join(', ');

        jobs.push(utils.createEmptyJob({
          JobUrl: href,
          JobId: jobId || '',
          JobTitle: jobTitle,
          JobCompany: jobCompany,
          JobLocation: jobLocation,
          JobSeniority: jobSeniority,
          JobModality: jobModality,
          JobSalary: jobSalary,
          JobTags: jobTags,
          JobPostedDttm: jobPostedDttm
        }));
      } catch (error) {
        console.error('Error processing Habr vacancy card:', error);
      }
    });
    return cards.length;
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seenUrls = new Set();
    const origin = (root.location && root.location.origin) ? root.location.origin : '';

    await sleep(500);

    const ssrState = parseHabrSsrState(documentRef);
    const list = ssrState && ssrState.vacancies && Array.isArray(ssrState.vacancies.list)
      ? ssrState.vacancies.list
      : [];

    debug && debug.add('habrSsrList', {count: list.length});

    if (list.length > 0) {
      addJobsFromSsrList(list, origin, utils, seenUrls, jobs);
    } else {
      const cardsCount = addJobsFromCards(documentRef, origin, utils, seenUrls, jobs);
      debug && debug.add('habrCards', {count: cardsCount});
    }

    // Follow pagination and collect extra pages.
    // Prefer explicit page numbers from SSR state; fallback to "Next" arrow/link.
    const maxPages = 20;
    let currentPageUrl = (ctx && ctx.url) ? String(ctx.url) : ((root.location && root.location.href) ? root.location.href : '');
    let currentPage = parsePageNumber(currentPageUrl);
    const totalPages = getTotalPagesFromSsr(ssrState);
    let nextPageUrl = '';
    if (totalPages > currentPage) {
      nextPageUrl = buildPageUrl(currentPageUrl, currentPage + 1);
    } else {
      nextPageUrl = getNextPageUrl(documentRef, currentPageUrl);
    }
    const visitedPages = new Set();
    if (currentPageUrl) {
      visitedPages.add(currentPageUrl);
    }

    while (nextPageUrl && visitedPages.size < maxPages) {
      if (visitedPages.has(nextPageUrl)) {
        break;
      }
      visitedPages.add(nextPageUrl);
      const pageNumber = parsePageNumber(nextPageUrl);

      debug && debug.add('habrNextPage', {page: pageNumber, url: nextPageUrl});

      try {
        const resp = await fetch(nextPageUrl, {credentials: 'include'});
        if (!resp.ok) {
          debug && debug.add('habrNextPageError', {page: pageNumber, status: resp.status});
          break;
        }

        const html = await resp.text();
        const parser = new DOMParser();
        const nextDoc = parser.parseFromString(html, 'text/html');
        const nextSsrState = parseHabrSsrState(nextDoc);
        const nextList = nextSsrState && nextSsrState.vacancies && Array.isArray(nextSsrState.vacancies.list)
          ? nextSsrState.vacancies.list
          : [];

        if (nextList.length > 0) {
          debug && debug.add('habrSsrList', {page: pageNumber, count: nextList.length});
          addJobsFromSsrList(nextList, origin, utils, seenUrls, jobs);
        } else {
          const cardsCount = addJobsFromCards(nextDoc, origin, utils, seenUrls, jobs);
          debug && debug.add('habrCards', {page: pageNumber, count: cardsCount});
          if (cardsCount === 0) {
            break;
          }
        }

        currentPageUrl = nextPageUrl;
        currentPage = pageNumber;
        const nextTotalPages = getTotalPagesFromSsr(nextSsrState);
        if (nextTotalPages > currentPage) {
          nextPageUrl = buildPageUrl(currentPageUrl, currentPage + 1);
        } else {
          nextPageUrl = getNextPageUrl(nextDoc, currentPageUrl);
        }
        await sleep(200);
      } catch (error) {
        debug && debug.add('habrNextPageError', {page: pageNumber, error: error.message || String(error)});
        break;
      }
    }

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

    const ssrState = parseHabrSsrState(documentRef);
    const vacancy = ssrState && ssrState.vacancy ? ssrState.vacancy : null;

    if (vacancy) {
      job.JobId = vacancy.id || job.JobId;
      job.JobTitle = vacancy.title || job.JobTitle;
      job.JobCompany = (vacancy.company && vacancy.company.title) ? vacancy.company.title : job.JobCompany;
      job.JobPostedDttm = vacancy.publishedDate ? (vacancy.publishedDate.title || vacancy.publishedDate.date || '') : '';
      job.JobSeniority = vacancy.qualification || (vacancy.salaryQualification && vacancy.salaryQualification.title) || '';
      job.JobSalary = (vacancy.salary && vacancy.salary.formatted) ||
        (vacancy.predictedSalary && vacancy.predictedSalary.formatted) || '';
      job.JobTags = Array.isArray(vacancy.skills)
        ? vacancy.skills.map(skill => skill && skill.title).filter(Boolean).join(', ')
        : '';
      const locations = Array.isArray(vacancy.locations)
        ? vacancy.locations.map(loc => loc && loc.title).filter(Boolean)
        : [];
      job.JobLocation = vacancy.humanCityNames || locations.join(', ');
      job.JobModality = vacancy.remoteWork ? 'Remote' : (vacancy.employmentType || '');
      job.JobDescription = htmlToText(vacancy.description, utils.normalizeText);
    }

    if (!job.JobTitle || !job.JobDescription) {
      const ld = parseHabrJobPostingLd(documentRef);
      if (ld) {
        job.JobTitle = job.JobTitle || ld.title || '';
        job.JobCompany = job.JobCompany || (ld.hiringOrganization && ld.hiringOrganization.name) || '';
        job.JobPostedDttm = job.JobPostedDttm || ld.datePosted || '';
        job.JobDescription = job.JobDescription || htmlToText(ld.description || '', utils.normalizeText);
        if (!job.JobId && ld.identifier && ld.identifier.value) {
          job.JobId = ld.identifier.value;
        }
        if (!job.JobLocation && Array.isArray(ld.jobLocation)) {
          const locs = ld.jobLocation
            .map(loc => {
              if (!loc) return '';
              if (typeof loc === 'string') return loc;
              if (typeof loc.address === 'string') return loc.address;
              if (loc.address && typeof loc.address.addressLocality === 'string') {
                return loc.address.addressLocality;
              }
              return '';
            })
            .filter(Boolean);
          job.JobLocation = locs.join(', ');
        }
        if (!job.JobModality && ld.jobLocationType === 'TELECOMMUTE') {
          job.JobModality = 'Remote';
        }
      }
    }

    if (job.JobDescription && job.JobDescription.length > 10000) {
      job.JobDescription = job.JobDescription.substring(0, 10000) + '...';
    }

    debug && debug.add('habrDetail', {title: job.JobTitle, company: job.JobCompany});
    return job;
  }

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource({
      id: 'habr',
      name: 'Habr Career',
      match(url) {
        return String(url || '').includes('career.habr.com/vacancies');
      },
      scrapeList: scrapeList,
      scrapeDetail: scrapeDetail
    });
  }
})();
