/**
 * Source: HeadHunter (hh.ru / headhunter.ge)
 * List: search results on /search/vacancy (cards + meta fields).
 * Detail: vacancy page /vacancy/* (title/company/description).
 * Notes: parses Russian date text, infers modality from title/seniority.
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;

  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const selectors = {
    listItem: '[data-qa=\"vacancy-serp__vacancy\"]',
    detailTags: '[data-qa=\"bloko-tag__text\"]'
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
      const hhMatch = url.match(/\/vacancy\/(\d+)/);
      if (hhMatch) return hhMatch[1];
      const numMatch = url.match(/\/(\d+)(?:\/|$|\?)/);
      if (numMatch) return numMatch[1];
      return '';
    };
    const extractHhPublishedInfoFromText = utils.extractHhPublishedInfoFromText || function(text) {
      if (!text) return null;
      const normalized = normalizeText(text);
      const match = normalized.match(
        /Вакансия опубликована\s+(\d{1,2}\s+[А-Яа-яЁё]+(?:\s+\d{4})?)\s+в\s+(.+?)(?:\s+[•·–—-]|$)/
      );
      if (!match) return null;
      return {
        posted: match[1].trim(),
        location: match[2].trim()
      };
    };
    const extractHhSeniorityFromText = utils.extractHhSeniorityFromText || function(text) {
      const normalized = normalizeText(text);
      const match = normalized.match(/(\d+)\s*[–—-]\s*(\d+)\s*(?:года|лет)/i);
      if (!match) return '';
      return `${match[1]}–${match[2]} года`;
    };
    const detectHhModality = utils.detectHhModality || function(jobTitle, jobSeniority) {
      const title = (jobTitle || '').toLowerCase();
      if (/\binternship\b|\bintern\b/.test(title)) return 'Intern';
      if (/\bjunior\b/.test(title)) return 'Junior';
      if (/\bmiddle\b/.test(title)) return 'Middle';
      if (/\bsenior\b/.test(title)) return 'Senior';
      if (/\blead\b/.test(title)) return 'Lead';

      const normalized = normalizeText(jobSeniority || '');
      const rangeMatch = normalized.match(/(\d+)\s*[–—-]\s*(\d+)/);
      if (rangeMatch) {
        const from = parseInt(rangeMatch[1], 10);
        const to = parseInt(rangeMatch[2], 10);
        if (from === 1 && to === 3) return 'Middle';
        if (from === 3 && to === 6) return 'Senior';
      }

      return '';
    };

    return {
      normalizeText,
      extractJobIdFromUrl,
      extractHhPublishedInfoFromText,
      extractHhSeniorityFromText,
      detectHhModality,
      createEmptyJob: utils.createEmptyJob || function(overrides) {
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
      }
    };
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seenUrls = new Set();
    const origin = (root.location && root.location.origin) ? root.location.origin : '';

    await sleep(9000);

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await sleep(3000);
      }

      const vacancyCards = documentRef.querySelectorAll(selectors.listItem);
      debug && debug.add('hhCards', {attempt: attempt + 1, count: vacancyCards.length});

      vacancyCards.forEach(card => {
        try {
          const link = card.querySelector('a[href*="/vacancy/"]');
          if (!link) return;

          let href = link.href || link.getAttribute('href');
          if (!href) return;

          if (href.startsWith('/')) {
            href = origin + href;
          }

          if (seenUrls.has(href)) return;
          seenUrls.add(href);

          const jobId = utils.extractJobIdFromUrl(href);

          let jobTitle = '';
          const titleEl = card.querySelector('[data-qa="vacancy-serp__vacancy-title"]') ||
            card.querySelector('a[href*="/vacancy/"]');
          if (titleEl) {
            jobTitle = titleEl.textContent?.trim() || '';
          }

          let jobCompany = '';
          const companyEl = card.querySelector('[data-qa="vacancy-serp__vacancy-employer"]') ||
            card.querySelector('a[href*="/employer/"]');
          if (companyEl) {
            jobCompany = companyEl.textContent?.trim() || '';
          }

          let jobLocation = '';
          const locationEl = card.querySelector('[data-qa="vacancy-serp__vacancy-address"]');
          if (locationEl) {
            jobLocation = locationEl.textContent?.trim() || '';
          }

          let jobSalary = '';
          const salaryEl = card.querySelector('[data-qa="vacancy-serp__vacancy-compensation"]');
          if (salaryEl) {
            jobSalary = salaryEl.textContent?.trim() || '';
          }

          let jobPostedDttm = '';
          const dateEl = card.querySelector('[data-qa="vacancy-serp__vacancy-date"]');
          if (dateEl) {
            jobPostedDttm = dateEl.textContent?.trim() || '';
          }

          const cardText = card.innerText || card.textContent || '';
          const publishedInfo = utils.extractHhPublishedInfoFromText(cardText);
          if (publishedInfo && publishedInfo.location) {
            jobLocation = publishedInfo.location;
          }
          if (publishedInfo && publishedInfo.posted) {
            jobPostedDttm = publishedInfo.posted;
          }

          const jobSeniority = utils.extractHhSeniorityFromText(cardText);
          const modality = utils.detectHhModality(jobTitle, jobSeniority);

          jobs.push(utils.createEmptyJob({
            JobUrl: href,
            JobId: jobId || '',
            JobTitle: jobTitle || 'Untitled',
            JobCompany: jobCompany,
            JobLocation: jobLocation,
            JobSeniority: jobSeniority,
            JobModality: modality,
            JobSalary: jobSalary,
            JobPostedDttm: jobPostedDttm
          }));
        } catch (error) {
          console.error('Error processing HH vacancy card:', error);
        }
      });

      if (jobs.length > 0 && attempt > 0) {
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

    const waitForAnySelector = utils.waitForAnySelector || (async function(selectors, timeoutMs, intervalMs = 100) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        for (const selector of selectors) {
          if (documentRef.querySelector(selector)) {
            return true;
          }
        }
        await sleep(intervalMs);
      }
      return false;
    });

    await waitForAnySelector([
      '[data-qa="vacancy-title"]',
      'h1',
      '[data-qa="vacancy-description"]'
    ], 1200);

    const publishedInfo = utils.extractHhPublishedInfoFromText(documentRef.body ? (documentRef.body.innerText || '') : '');

    const titleEl = documentRef.querySelector('[data-qa="vacancy-title"]') ||
      documentRef.querySelector('h1') ||
      documentRef.querySelector('title');
    if (titleEl) {
      job.JobTitle = (titleEl.textContent || titleEl.content || '').trim();
      job.JobTitle = job.JobTitle.replace(/\s*\|\s*hh\.ru.*$/i, '').trim();
    }

    const companyEl = documentRef.querySelector('[data-qa="vacancy-company-name"]') ||
      documentRef.querySelector('a[data-qa="vacancy-company-logo"]') ||
      documentRef.querySelector('a[href*="/employer/"]');
    if (companyEl) {
      job.JobCompany = (companyEl.textContent || '').trim();
    }

    const locationEl = documentRef.querySelector('[data-qa="vacancy-view-location"]') ||
      documentRef.querySelector('[data-qa="vacancy-view-raw-address"]');
    if (locationEl) {
      job.JobLocation = (locationEl.textContent || '').trim();
    }
    if (publishedInfo && publishedInfo.location) {
      job.JobLocation = publishedInfo.location;
    }

    const salaryEl = documentRef.querySelector('[data-qa="vacancy-salary"]');
    if (salaryEl) {
      job.JobSalary = (salaryEl.textContent || '').trim();
    }

    const experienceEl = documentRef.querySelector('[data-qa="vacancy-experience"]');
    if (experienceEl) {
      job.JobSeniority = (experienceEl.textContent || '').trim();
    }

    const employmentEl = documentRef.querySelector('[data-qa="vacancy-view-employment-mode"]');
    if (employmentEl) {
      job.JobModality = (employmentEl.textContent || '').trim();
    }

    const descriptionEl = documentRef.querySelector('[data-qa="vacancy-description"]') ||
      documentRef.querySelector('.vacancy-description') ||
      documentRef.querySelector('.g-user-content');
    if (descriptionEl) {
      let desc = descriptionEl.textContent || descriptionEl.innerText || '';
      desc = desc.replace(/\s+/g, ' ').trim();
      if (desc.length > 10000) {
        desc = desc.substring(0, 10000) + '...';
      }
      job.JobDescription = desc;
    }

    const tagElements = documentRef.querySelectorAll(selectors.detailTags);
    const tags = Array.from(tagElements)
      .map(el => el.textContent ? el.textContent.trim() : '')
      .filter(Boolean)
      .filter((tag, index, arr) => arr.indexOf(tag) === index);
    job.JobTags = tags.join(', ');

    const dateEl = documentRef.querySelector('[data-qa="vacancy-creation-date-redesigned"]') ||
      documentRef.querySelector('[data-qa="vacancy-creation-date"]');
    if (dateEl) {
      job.JobPostedDttm = (dateEl.textContent || '').trim();
    }
    if (publishedInfo && publishedInfo.posted) {
      job.JobPostedDttm = publishedInfo.posted;
    }

    job.JobModality = utils.detectHhModality(job.JobTitle, job.JobSeniority) || job.JobModality;

    debug && debug.add('hhDetail', {title: job.JobTitle, company: job.JobCompany});
    return job;
  }

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource({
      id: 'hh',
      name: 'HeadHunter',
      match(url) {
        const value = String(url || '');
        return value.includes('hh.ru') || value.includes('headhunter.ge');
      },
      scrapeList: scrapeList,
      scrapeDetail: scrapeDetail
    });
  }
})();
