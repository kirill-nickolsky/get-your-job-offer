/**
 * Source: Get on Board (getonbrd.com)
 * List: /myjobs cards (title/company/tags/salary/location).
 * Detail: /jobs/* page (description + metadata).
 * Notes: list page may require retries due to lazy loading.
 */
(function() {
  'use strict';

  const root = typeof window !== 'undefined' ? window : this;

  const helpers = (root.ScrapeUtils && root.ScrapeUtils.SourceHelpers) ? root.ScrapeUtils.SourceHelpers : {};
  const sleep = helpers.sleep || ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  const selectors = {
    jobLink: 'a[href*=\"/jobs/\"]',
    tagList: '.tag, [class*=\"tag\"], .skill, [class*=\"skill\"]',
    tagDetail: '.tag, [class*=\"tag\"], .skill, [class*=\"skill\"], .badge',
    dataJob: '[data-job-id], [data-job-url], [data-job-title]',
    scripts: 'script[type=\"application/json\"], script'
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
      const match = url.match(/\/jobs\/[^\/]+\/([^\/\?]+)/);
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
    return {normalizeText, extractJobIdFromUrl, createEmptyJob};
  }

  async function scrapeList(doc, ctx) {
    const documentRef = doc || document;
    const debug = ctx && ctx.debug;
    const utils = getUtils();
    const jobs = [];
    const seenUrls = new Set();
    const origin = (root.location && root.location.origin) ? root.location.origin : '';

    await sleep(2000);

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await sleep(1000);
      }

      const allLinks = documentRef.querySelectorAll(selectors.jobLink);
      debug && debug.add('getonbrdLinks', {attempt: attempt + 1, count: allLinks.length});

      try {
        const windowKeys = Object.keys(root);
        for (const key of windowKeys) {
          if (key.toLowerCase().includes('job') || key.toLowerCase().includes('webpro')) {
            const data = root[key];
            if (data && typeof data === 'object') {
              console.log(`Found potential job data in window.${key}`);
            }
          }
        }
      } catch (e) {
        // Ignore
      }

      allLinks.forEach(link => {
        try {
          let href = link.href || link.getAttribute('href');
          if (!href) return;

          if (href.startsWith('/')) {
            href = origin + href;
          }

          if (href.includes('/jobs/') &&
            !href.includes('/applications/') &&
            !href.includes('/apply') &&
            !seenUrls.has(href)) {

            seenUrls.add(href);
            const jobId = utils.extractJobIdFromUrl(href);

            let jobTitle = link.textContent?.trim() || '';
            if (!jobTitle || jobTitle.length < 3) {
              const parent = link.closest('article, div, li, tr');
              if (parent) {
                const titleEl = parent.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"]');
                if (titleEl) {
                  jobTitle = titleEl.textContent?.trim() || '';
                }
              }
            }

            let jobCompany = '';
            const companyLink = link.closest('article, div, li, tr')?.querySelector('a[href*="/companies/"]');
            if (companyLink) {
              jobCompany = companyLink.textContent?.trim() || '';
            }

            let jobLocation = '';
            const locationEl = link.closest('article, div, li, tr')?.querySelector('[class*="location"], [class*="remote"], [data-location]');
            if (locationEl) {
              jobLocation = locationEl.textContent?.trim() || '';
            }

            let jobSeniority = '';
            const seniorityEl = link.closest('article, div, li, tr')?.querySelector('[itemprop="qualifications"], [data-seniority], [class*="seniority"]');
            if (seniorityEl) {
              jobSeniority = seniorityEl.textContent?.trim() || seniorityEl.getAttribute('data-seniority') || '';
            }

            jobs.push(utils.createEmptyJob({
              JobUrl: href,
              JobId: jobId || '',
              JobTitle: jobTitle || 'Untitled',
              JobCompany: jobCompany,
              JobLocation: jobLocation,
              JobSeniority: jobSeniority,
            }));
          }
        } catch (error) {
          console.error('Error processing link:', error);
        }
      });

      if (jobs.length > 0 && attempt > 0) {
        break;
      }
    }

    if (jobs.length < 5) {
      const jobSelectors = [
        'article[data-job-id]',
        '.job-card',
        '[data-controller*="job"]',
        '.gb-job-card',
        'div[data-job-id]',
        '[class*="job-card"]',
        '[class*="job-item"]'
      ];

      let jobElements = [];
      for (const selector of jobSelectors) {
        jobElements = documentRef.querySelectorAll(selector);
        if (jobElements.length > 0) break;
      }

      if (jobElements.length > 0) {
        jobElements.forEach((element) => {
          try {
            const jobUrl = element.querySelector('a[href*="/jobs/"]')?.href ||
              element.closest('a[href*="/jobs/"]')?.href || '';

            if (!jobUrl) return;

            const jobId = utils.extractJobIdFromUrl(jobUrl);

            const titleSelectors = [
              'h2', 'h3', '.job-title', '[class*="title"]',
              'a[href*="/jobs/"]', '.gb-job-title'
            ];
            let jobTitle = '';
            for (const sel of titleSelectors) {
              const titleEl = element.querySelector(sel);
              if (titleEl) {
                jobTitle = titleEl.textContent?.trim() || '';
                if (jobTitle) break;
              }
            }

            const companySelectors = [
              '.company', '[class*="company"]', '.gb-company',
              'a[href*="/companies/"]'
            ];
            let jobCompany = '';
            for (const sel of companySelectors) {
              const companyEl = element.querySelector(sel);
              if (companyEl) {
                jobCompany = companyEl.textContent?.trim() || '';
                if (jobCompany) break;
              }
            }

            const locationSelectors = [
              '.location', '[class*="location"]', '.gb-location',
              '[data-location]', '.remote'
            ];
            let jobLocation = '';
            for (const sel of locationSelectors) {
              const locationEl = element.querySelector(sel);
              if (locationEl) {
                jobLocation = locationEl.textContent?.trim() || '';
                if (jobLocation) break;
              }
            }

            const senioritySelectors = [
              '[itemprop="qualifications"]',
              '[data-seniority]',
              '[class*="seniority"]'
            ];
            let jobSeniority = '';
            for (const sel of senioritySelectors) {
              const seniorityEl = element.querySelector(sel);
              if (seniorityEl) {
                jobSeniority = seniorityEl.textContent?.trim() || seniorityEl.getAttribute('data-seniority') || '';
                if (jobSeniority) break;
              }
            }

            const tagElements = element.querySelectorAll(selectors.tagList);
            const tags = Array.from(tagElements).map(el => el.textContent?.trim()).filter(Boolean);
            const jobTags = tags.join(', ');

            jobs.push(utils.createEmptyJob({
              JobUrl: jobUrl,
              JobId: jobId || '',
              JobTitle: jobTitle,
              JobCompany: jobCompany,
              JobLocation: jobLocation,
              JobSeniority: jobSeniority,
              JobTags: jobTags
            }));

            if (jobUrl) seenUrls.add(jobUrl);
          } catch (error) {
            console.error('Error scraping job element:', error);
          }
        });
      }
    }

    const uniqueJobs = [];
    const urlSet = new Set();
    for (const job of jobs) {
      if (job.JobUrl && !urlSet.has(job.JobUrl)) {
        urlSet.add(job.JobUrl);
        uniqueJobs.push(job);
      }
    }

    if (uniqueJobs.length === 0) {
      const dataElements = documentRef.querySelectorAll(selectors.dataJob);
      debug && debug.add('getonbrdDataElements', {count: dataElements.length});
      dataElements.forEach(el => {
        try {
          const jobUrl = el.getAttribute('data-job-url') ||
            el.querySelector('a[href*="/jobs/"]')?.href || '';
          if (jobUrl && jobUrl.includes('/jobs/') && !seenUrls.has(jobUrl)) {
            seenUrls.add(jobUrl);
            const jobSeniority = el.getAttribute('data-seniority') ||
              el.querySelector('[itemprop="qualifications"]')?.textContent?.trim() || '';
            uniqueJobs.push(utils.createEmptyJob({
              JobUrl: jobUrl,
              JobId: el.getAttribute('data-job-id') || utils.extractJobIdFromUrl(jobUrl),
              JobTitle: el.getAttribute('data-job-title') || el.textContent?.trim() || 'Untitled',
              JobSeniority: jobSeniority
            }));
          }
        } catch (e) {
          console.error('Error processing data element:', e);
        }
      });

      const scripts = documentRef.querySelectorAll(selectors.scripts);
      for (const script of scripts) {
        try {
          const text = script.textContent || '';
          if (text.includes('job') || text.includes('Job') || text.includes('/jobs/')) {
            const urlMatches = text.match(/https?:\/\/[^\s"']*\/jobs\/[^\s"']*/g);
            if (urlMatches) {
              urlMatches.forEach(url => {
                if (!seenUrls.has(url) && !url.includes('/applications/')) {
                  seenUrls.add(url);
                  uniqueJobs.push(utils.createEmptyJob({
                    JobUrl: url,
                    JobId: utils.extractJobIdFromUrl(url),
                    JobTitle: 'Untitled'
                  }));
                }
              });
            }

            const jsonMatch = text.match(/\{[\s\S]{20,}\}/);
            if (jsonMatch) {
              try {
                const data = JSON.parse(jsonMatch[0]);
                if (data.jobs || data.data || Array.isArray(data)) {
                  const jobData = data.jobs || data.data || data;
                  if (Array.isArray(jobData)) {
                    jobData.forEach(job => {
                      if (job && (job.url || job.href || job.link)) {
                        const url = job.url || job.href || job.link;
                        if (!seenUrls.has(url)) {
                          seenUrls.add(url);
                          uniqueJobs.push(utils.createEmptyJob({
                            JobUrl: url,
                            JobId: job.id || utils.extractJobIdFromUrl(url),
                            JobTitle: job.title || job.name || '',
                            JobCompany: job.company || job.company_name || '',
                            JobLocation: job.location || '',
                            JobSeniority: job.seniority || '',
                            JobModality: job.modality || job.type || '',
                            JobSalary: job.salary || '',
                            JobTags: Array.isArray(job.tags) ? job.tags.join(', ') : (job.tags || ''),
                            JobDescription: job.description || '',
                            JobPostedDttm: job.posted_at || job.created_at || ''
                          }));
                        }
                      }
                    });
                  }
                }
              } catch (e) {
                // Not valid JSON, continue
              }
            }
          }
        } catch (e) {
          // Continue to next script
        }
      }
    }

    return uniqueJobs.length > 0 ? uniqueJobs : jobs;
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

    const titleSelectors = [
      'h1', '.job-title', '[class*="job-title"]',
      'title', 'meta[property="og:title"]'
    ];
    for (const sel of titleSelectors) {
      const el = documentRef.querySelector(sel);
      if (el) {
        job.JobTitle = (el.textContent || el.content || '').trim();
        if (job.JobTitle) {
          job.JobTitle = job.JobTitle.replace(/\s*\|\s*Get on Board.*$/i, '').trim();
          break;
        }
      }
    }

    const companySelectors = [
      '.company', '[class*="company"]', '.gb-company',
      'a[href*="/companies/"]', '[itemprop="hiringOrganization"]'
    ];
    for (const sel of companySelectors) {
      const el = documentRef.querySelector(sel);
      if (el) {
        job.JobCompany = (el.textContent || '').trim();
        if (job.JobCompany) break;
      }
    }

    const locationSelectors = [
      '.location', '[class*="location"]', '.gb-location',
      '[data-location]', '.remote', '[itemprop="jobLocation"]'
    ];
    for (const sel of locationSelectors) {
      const el = documentRef.querySelector(sel);
      if (el) {
        job.JobLocation = (el.textContent || '').trim();
        if (job.JobLocation) break;
      }
    }

    const senioritySelectors = [
      '[itemprop="qualifications"]',
      '[data-seniority]', '.seniority', '[class*="seniority"]',
      '.level', '[class*="level"]'
    ];
    for (const sel of senioritySelectors) {
      const el = documentRef.querySelector(sel);
      if (el) {
        job.JobSeniority = (el.textContent || el.getAttribute('data-seniority') || '').trim();
        if (job.JobSeniority) break;
      }
    }

    const modalitySelectors = [
      '.modality', '[class*="modality"]', '.type',
      '[data-modality]', '.remote', '.perk-remote_full'
    ];
    for (const sel of modalitySelectors) {
      const el = documentRef.querySelector(sel);
      if (el) {
        const text = (el.textContent || el.getAttribute('data-modality') || '').trim();
        if (text) {
          job.JobModality = text;
          break;
        }
      }
    }
    if (!job.JobModality) {
      if (documentRef.querySelector('.perk-remote_full, [class*="remote"]')) {
        job.JobModality = 'Remote';
      }
    }

    const salarySelectors = [
      '.salary', '[class*="salary"]', '.compensation',
      '[data-salary]', '[itemprop="baseSalary"]'
    ];
    for (const sel of salarySelectors) {
      const el = documentRef.querySelector(sel);
      if (el) {
        job.JobSalary = (el.textContent || el.getAttribute('data-salary') || '').trim();
        if (job.JobSalary) break;
      }
    }

    const tagElements = documentRef.querySelectorAll(selectors.tagDetail);
    const tags = Array.from(tagElements)
      .map(el => (el.textContent || '').trim())
      .filter(Boolean)
      .filter((tag, index, arr) => arr.indexOf(tag) === index);
    job.JobTags = tags.join(', ');

    const descriptionSelectors = [
      '#job-body', '[itemprop="description"]', '.job-description',
      '[class*="description"]', '.gb-rich-txt'
    ];
    for (const sel of descriptionSelectors) {
      const el = documentRef.querySelector(sel);
      if (el) {
        let desc = el.textContent || el.innerText || '';
        desc = desc.replace(/\s+/g, ' ').trim();
        if (desc.length > 10000) {
          desc = desc.substring(0, 10000) + '...';
        }
        job.JobDescription = desc;
        if (job.JobDescription) break;
      }
    }

    const dateSelectors = [
      '[data-posted]', '.posted', '[class*="posted"]',
      'time[datetime]', '[itemprop="datePosted"]'
    ];
    for (const sel of dateSelectors) {
      const el = documentRef.querySelector(sel);
      if (el) {
        job.JobPostedDttm = el.getAttribute('datetime') ||
          el.getAttribute('data-posted') ||
          (el.textContent || '').trim() || '';
        if (job.JobPostedDttm) break;
      }
    }

    const jobIdMatch = (documentRef.body ? documentRef.body.textContent : '').match(/GETONBRD Job ID:\s*(\d+)/i);
    if (jobIdMatch && !job.JobId) {
      job.JobId = jobIdMatch[1];
    }

    const metaJobId = documentRef.querySelector('meta[property="og:url"]');
    if (metaJobId && !job.JobId) {
      job.JobId = utils.extractJobIdFromUrl(metaJobId.content || '');
    }

    debug && debug.add('getonbrdDetail', {title: job.JobTitle, company: job.JobCompany});
    return job;
  }

  if (typeof root.registerScrapeSource === 'function') {
    root.registerScrapeSource({
      id: 'getonbrd',
      name: 'Get on Board',
      match(url) {
        const value = String(url || '');
        return value.includes('getonbrd.com');
      },
      scrapeList: scrapeList,
      scrapeDetail: scrapeDetail
    });
  }
})();
