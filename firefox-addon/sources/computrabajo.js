/**
 * Source: Computrabajo
 * List: search page cards (title/company/location).
 * Detail: job posting pages (description + metadata).
 * Notes: multiple domains and path variants across countries.
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;

  function getUtils() {
    const utils = root.ScrapeUtils || {};
    const helpers = utils.SourceHelpers || {};
    const normalizeText = helpers.normalizeText || utils.normalizeText || function(text) {
      return String(text || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    const extractJobIdFromUrl = helpers.extractJobIdFromUrl || utils.extractJobIdFromUrl || function(url) {
      if (!url) return '';
      const cleaned = String(url).split('#')[0];
      const queryMatch = cleaned.match(/[?&]oi=([A-Za-z0-9]+)/i);
      if (queryMatch) return queryMatch[1];
      const slugMatch = cleaned.match(/-([A-Za-z0-9]{16,})(?:$|[/?#])/);
      if (slugMatch) return slugMatch[1];
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

  const selectors = {
    listItem: 'article.box_offer[data-offers-grid-offer-item-container]'
  };

  function toAbsoluteUrl(href, origin) {
    if (!href) return '';
    try {
      return new URL(href, origin).href;
    } catch (error) {
      if (href.startsWith('/')) {
        return origin + href;
      }
      return href;
    }
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seenUrls = new Set();
    const origin = (root.location && root.location.origin) ? root.location.origin : '';

    const cards = documentRef.querySelectorAll(selectors.listItem);
    debug && debug.add('computrabajoCards', {count: cards.length});

    cards.forEach(card => {
      try {
        const linkEl = card.querySelector('a.js-o-link');
        if (!linkEl) return;

        let href = linkEl.getAttribute('href') || linkEl.href || '';
        if (!href) return;
        href = toAbsoluteUrl(href, origin);
        if (href.includes('#')) {
          href = href.split('#')[0];
        }

        if (seenUrls.has(href)) return;
        seenUrls.add(href);

        const jobId = card.getAttribute('data-id') ||
          card.getAttribute('id') ||
          utils.extractJobIdFromUrl(href);

        const jobTitle = utils.normalizeText(linkEl.textContent || '') || 'Untitled';

        const companyEl = card.querySelector('[offer-grid-article-company-url]') ||
          card.querySelector('p.dFlex a');
        const jobCompany = utils.normalizeText(companyEl ? companyEl.textContent : '');

        const locationEl = card.querySelector('p.fs16.fc_base.mt5 span') ||
          card.querySelector('p.fs16.fc_base.mt5');
        const jobLocation = utils.normalizeText(locationEl ? locationEl.textContent : '');

        const postedEl = card.querySelector('p.fs13.fc_aux.mt15');
        const jobPostedDttm = utils.normalizeText(postedEl ? postedEl.textContent : '');

        jobs.push(utils.createEmptyJob({
          JobUrl: href,
          JobId: jobId || '',
          JobTitle: jobTitle,
          JobCompany: jobCompany,
          JobLocation: jobLocation,
          JobPostedDttm: jobPostedDttm
        }));
      } catch (error) {
        console.error('Error processing Computrabajo card:', error);
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

    const titleEl = documentRef.querySelector('h1.fwB.fs24') || documentRef.querySelector('h1');
    if (titleEl) {
      job.JobTitle = utils.normalizeText(titleEl.textContent || titleEl.innerText || '');
    }

    const subTitleEl = titleEl ? titleEl.nextElementSibling : documentRef.querySelector('p.fs16');
    if (subTitleEl) {
      const subtitle = utils.normalizeText(subTitleEl.textContent || subTitleEl.innerText || '');
      if (subtitle.includes(' - ')) {
        const parts = subtitle.split(' - ');
        job.JobCompany = utils.normalizeText(parts[0]);
        job.JobLocation = utils.normalizeText(parts.slice(1).join(' - '));
      } else if (!job.JobCompany) {
        job.JobCompany = subtitle;
      }
    }

    if (!job.JobCompany) {
      const companyEl = documentRef.querySelector('a.dIB.fs16.js-o-link') ||
        documentRef.querySelector('a.js-o-link[href^=\"/\"]');
      if (companyEl) {
        job.JobCompany = utils.normalizeText(companyEl.textContent || companyEl.innerText || '');
      }
    }

    const offerBlock = documentRef.querySelector('div[div-link=\"oferta\"]');
    if (offerBlock) {
      const descEl = offerBlock.querySelector('p.mbB');
      let desc = '';
      if (descEl) {
        desc = descEl.textContent || descEl.innerText || '';
      } else {
        desc = offerBlock.textContent || offerBlock.innerText || '';
      }
      job.JobDescription = utils.normalizeText(desc);

      const postedEl = offerBlock.querySelector('p.fc_aux.fs13');
      if (postedEl) {
        job.JobPostedDttm = utils.normalizeText(postedEl.textContent || postedEl.innerText || '');
      }
    }

    if (job.JobDescription && job.JobDescription.length > 10000) {
      job.JobDescription = job.JobDescription.substring(0, 10000) + '...';
    }

    debug && debug.add('computrabajoDetail', {title: job.JobTitle, company: job.JobCompany});
    return job;
  }

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource({
      id: 'computrabajo',
      name: 'Computrabajo',
      match(url) {
        return String(url || '').includes('computrabajo.com');
      },
      scrapeList: scrapeList,
      scrapeDetail: scrapeDetail
    });
  }
})();
