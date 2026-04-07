/**
 * Source: Gallito Trabajo (trabajo.gallito.com.uy)
 * List: server-rendered cards on /buscar pages.
 * Detail: server-rendered job pages on /anuncio/<slug>.
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;
  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};

  const selectors = {
    listItem: 'a.post-cuadro',
    listTitle: '.bloque-start-text-origin h2',
    listCompany: '.bloque-start-nombre',
    listSnippet: '.bloque-start-texto',
    listPosted: '.bloque-start-time .time-text',
    listTags: '.bloque-start-time .link-post',
    listCompanyImage: '.contenedor-post-movile img, .contendor-img-post img',
    canonical: 'link[rel="canonical"]',
    title: '.title-puesto h1, h1',
    company: '.subtitle-puesto',
    posted: '.bloque-start-time .time-text',
    salaryBlocks: '.span-ofertas',
    sections: '.cuadro-aviso',
    sectionTitle: '.cuadro-aviso-title',
    sectionBody: '.cuadro-aviso-text',
    breadcrumb: '.breadcrumb-ficha li a, .breadcrumb-ficha li.active',
    metaCategory: 'meta[name="cXenseParse:recs:categories"], meta[name="cXenseParse:eps-categories"]',
    metaJobId: 'meta[name="cXenseParse:eps-cod_aviso"]',
    metaDescription: 'meta[property="og:description"], meta[name="description"]',
    jsonLd: 'script[type="application/ld+json"]'
  };

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
    return { normalizeText, createEmptyJob };
  }

  function toAbsoluteUrl(href, baseUrl) {
    if (!href) return '';
    try {
      return new URL(String(href), baseUrl || (root.location ? root.location.href : 'https://trabajo.gallito.com.uy/')).href;
    } catch (error) {
      return '';
    }
  }

  function extractJobIdFromUrl(url) {
    const match = String(url || '').match(/\/anuncio\/([^\/?#]+)/i);
    return match ? match[1] : '';
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

  function normalizeMultilineText(text) {
    return String(text || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\r/g, '')
      .split('\n')
      .map(line => line.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  function htmlFragmentToText(html) {
    if (!html) return '';
    const documentRef = root.document || document;
    const container = documentRef.createElement('div');
    container.innerHTML = String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '</p>\n')
      .replace(/<\/div>/gi, '</div>\n')
      .replace(/<\/li>/gi, '</li>\n');
    return normalizeMultilineText(container.textContent || container.innerText || '');
  }

  function getMetaContent(documentRef, selector) {
    const node = documentRef.querySelector(selector);
    return node ? String(node.getAttribute('content') || '').trim() : '';
  }

  function getMetaContents(documentRef, selector) {
    return Array.from(documentRef.querySelectorAll(selector))
      .map(node => String(node.getAttribute('content') || '').trim())
      .filter(Boolean);
  }

  function parseCategoryMetaValue(value, normalizeText) {
    const placeholder = '__GALLITO_SLASH__';
    const preserved = String(value || '').replace(/\s\/\s/g, placeholder);
    return preserved.split('/')
      .map(part => normalizeText(part.replace(new RegExp(placeholder, 'g'), ' / ')))
      .filter(Boolean);
  }

  function parseLocationFromMeta(text, normalizeText) {
    const normalized = normalizeText(text || '');
    const match = normalized.match(/Gallito\.com\.uy\s*-\s*([^.]+)\./i);
    return match ? normalizeText(match[1]) : '';
  }

  function parseJobPostingJsonLd(documentRef) {
    const scripts = documentRef.querySelectorAll(selectors.jsonLd);
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      if (!script || !script.textContent) continue;
      try {
        const data = JSON.parse(script.textContent);
        if (data && data['@type'] === 'JobPosting') {
          return data;
        }
        if (Array.isArray(data)) {
          const found = data.find(item => item && item['@type'] === 'JobPosting');
          if (found) return found;
        }
      } catch (error) {
        // Ignore invalid JSON-LD blocks.
      }
    }
    return null;
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const origin = (root.location && root.location.origin) ? root.location.origin : 'https://trabajo.gallito.com.uy';
    const cards = Array.from(documentRef.querySelectorAll(selectors.listItem));
    const seenUrls = new Set();
    const jobs = [];

    debug && debug.add('gallitoCards', { count: cards.length });

    cards.forEach(card => {
      const href = toAbsoluteUrl(card.getAttribute('href') || card.href || '', origin);
      if (!href || seenUrls.has(href)) return;
      seenUrls.add(href);

      const title = utils.normalizeText((card.querySelector(selectors.listTitle) || {}).textContent || '') || 'Untitled';
      const companyText = utils.normalizeText((card.querySelector(selectors.listCompany) || {}).textContent || '');
      const companyImage = card.querySelector(selectors.listCompanyImage);
      const company = companyText || utils.normalizeText(companyImage ? companyImage.getAttribute('alt') : '');
      const description = utils.normalizeText((card.querySelector(selectors.listSnippet) || {}).textContent || '');
      const posted = utils.normalizeText((card.querySelector(selectors.listPosted) || {}).textContent || '');
      const tags = uniqueList(Array.from(card.querySelectorAll(selectors.listTags)).map(node => utils.normalizeText(node.textContent || '')));

      jobs.push(utils.createEmptyJob({
        JobUrl: href,
        JobId: extractJobIdFromUrl(href) || href,
        JobTitle: title,
        JobCompany: company,
        JobDescription: description,
        JobPostedDttm: posted,
        JobTags: tags.join(', '),
        JobSeniority: tags.length > 1 ? tags[1] : ''
      }));
    });

    return jobs;
  }

  async function scrapeDetail(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const canonicalUrl = getMetaContent(documentRef, selectors.canonical);
    const pageUrl = canonicalUrl || (ctx && ctx.url) || (root.location ? root.location.href : '');
    const metaJobId = getMetaContent(documentRef, selectors.metaJobId);
    const jobPosting = parseJobPostingJsonLd(documentRef);
    const metaDescription = getMetaContent(documentRef, selectors.metaDescription);
    const job = utils.createEmptyJob({
      JobUrl: pageUrl,
      JobId: metaJobId || extractJobIdFromUrl(pageUrl) || pageUrl
    });

    const titleSelectors = ['.title-puesto h1', '.cuadro-puesto h1', 'h1'];
    for (let i = 0; i < titleSelectors.length; i++) {
      const titleNode = documentRef.querySelector(titleSelectors[i]);
      const value = utils.normalizeText(titleNode ? (titleNode.textContent || titleNode.innerText || '') : '');
      if (value) {
        job.JobTitle = value;
        break;
      }
    }
    if (!job.JobTitle) {
      job.JobTitle = utils.normalizeText(jobPosting && jobPosting.title) || 'Untitled';
    }
    job.JobCompany = utils.normalizeText((documentRef.querySelector(selectors.company) || {}).textContent || '') ||
      utils.normalizeText(jobPosting && jobPosting.hiringOrganization && jobPosting.hiringOrganization.name);
    job.JobPostedDttm = utils.normalizeText((documentRef.querySelector(selectors.posted) || {}).textContent || '') ||
      utils.normalizeText(jobPosting && jobPosting.datePosted);

    const salaryBlocks = Array.from(documentRef.querySelectorAll(selectors.salaryBlocks));
    for (let i = 0; i < salaryBlocks.length; i++) {
      const text = utils.normalizeText(salaryBlocks[i].textContent || '');
      const match = text.match(/Remuneración:\s*(.+)$/i);
      if (match) {
        job.JobSalary = utils.normalizeText(match[1]);
        break;
      }
    }

    const locationSelectors = [
      '[itemprop="addressLocality"]',
      '.job-location',
      '.ubicacion',
      '.location',
      '[data-location]'
    ];
    for (let i = 0; i < locationSelectors.length; i++) {
      const node = documentRef.querySelector(locationSelectors[i]);
      const value = utils.normalizeText(node ? (node.textContent || node.innerText || '') : '');
      if (value) {
        job.JobLocation = value;
        break;
      }
    }
    if (!job.JobLocation && jobPosting && jobPosting.jobLocation && jobPosting.jobLocation.address) {
      job.JobLocation = utils.normalizeText(jobPosting.jobLocation.address.addressLocality || '');
    }
    if (!job.JobLocation) {
      job.JobLocation = parseLocationFromMeta(metaDescription, utils.normalizeText);
    }

    const sections = Array.from(documentRef.querySelectorAll(selectors.sections));
    const descriptionParts = [];
    sections.forEach(section => {
      const title = utils.normalizeText((section.querySelector(selectors.sectionTitle) || {}).textContent || '');
      const body = htmlFragmentToText((section.querySelector(selectors.sectionBody) || {}).innerHTML || '');
      if (!title && !body) return;
      if (title && body) {
        descriptionParts.push(title + '\n' + body);
      } else {
        descriptionParts.push(title || body);
      }
    });
    job.JobDescription = descriptionParts.join('\n\n') ||
      htmlFragmentToText(jobPosting && jobPosting.description ? jobPosting.description : '');

    const breadcrumbTags = Array.from(documentRef.querySelectorAll(selectors.breadcrumb))
      .map(node => utils.normalizeText(node.textContent || ''))
      .filter(Boolean)
      .filter(value => !/^inicio$/i.test(value))
      .filter(value => value !== job.JobTitle);
    const metaTags = getMetaContents(documentRef, selectors.metaCategory)
      .flatMap(value => parseCategoryMetaValue(value, utils.normalizeText));
    const combinedTags = uniqueList(breadcrumbTags.concat(metaTags));
    job.JobTags = combinedTags.join(', ');
    if (!job.JobSeniority) {
      const seniorityTag = combinedTags.find(value => /t[eé]cnico\s*\/\s*especialista/i.test(value));
      if (seniorityTag) {
        job.JobSeniority = seniorityTag;
      }
    }

    debug && debug.add('gallitoDetail', {
      title: job.JobTitle,
      company: job.JobCompany,
      location: job.JobLocation,
      hasDescription: job.JobDescription.length > 0
    });

    return job;
  }

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource({
      id: 'gallito',
      name: 'Gallito',
      match(url) {
        return String(url || '').includes('trabajo.gallito.com.uy');
      },
      scrapeList: scrapeList,
      scrapeDetail: scrapeDetail
    });
  }
})();
