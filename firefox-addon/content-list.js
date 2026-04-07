/**
 * Content script for scraping job list page (getonbrd.com/myjobs, hh.ru/search/vacancy)
 */

(function () {
  'use strict';

  // Signal that content script is ready
  console.log('Content script loaded for job list page');

  let lastScrapeDebug = null;
  let activeLinkedInScrollRecording = null;

  const sharedUtils = window.ScrapeUtils || {};
  const safeStringify = sharedUtils.safeStringify || function (value) {
    try {
      const text = JSON.stringify(value);
      if (text && text.length > 500) {
        return text.slice(0, 500) + '...';
      }
      return text;
    } catch (error) {
      return String(value);
    }
  };
  const createDebugCollector = sharedUtils.createDebugCollector || function (site) {
    const entries = [];
    const debug = {
      site: site,
      url: window.location.href,
      entries: entries,
      add(step, data) {
        const payload = data !== undefined ? `${step}: ${safeStringify(data)}` : step;
        entries.push(payload);
        console.log(`[${site} debug] ${payload}`);
      }
    };
    return debug;
  };


  /**
   * Detects which site we're on
   */
  function detectSite() {
    const url = window.location.href;
    if (url.includes('hh.ru') || url.includes('headhunter.ge')) {
      return 'hh';
    } else if (url.includes('getonbrd.com')) {
      return 'getonbrd';
    } else if (url.includes('career.habr.com')) {
      return 'habr';
    } else if (url.includes('trabajo.gallito.com.uy')) {
      return 'gallito';
    } else if (url.includes('jobs.lever.co/')) {
      return 'lever';
    } else if (url.includes('computrabajo.com')) {
      return 'computrabajo';
    } else if (url.includes('jobspresso.co')) {
      return 'jobspresso';
    } else if (url.includes('torc.dev')) {
      return 'torc';
    } else if (url.includes('careers.revelo.com')) {
      return 'revelo';
    } else if (url.includes('workatastartup.com')) {
      return 'workatastartup';
    } else if (url.includes('linkedin.com')) {
      // Guard: If this is a VIEW page, we should NOT be active (content-job.js handles it)
      if (url.includes('/jobs/view/') || url.includes('/jobs/details/')) {
        console.log('[get-your-offer] content-list.js: Detected LinkedIn View page, exiting (deferring to content-job.js)');
        return 'ignore';
      }
      return 'linkedin';
    }
    return 'unknown';
  }

  const normalizeText = sharedUtils.normalizeText || function (text) {
    return String(text || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const sharedExtractHhPublishedInfoFromText = sharedUtils.extractHhPublishedInfoFromText;
  const sharedExtractHhSeniorityFromText = sharedUtils.extractHhSeniorityFromText;
  const sharedDetectHhModality = sharedUtils.detectHhModality;
  const sharedExtractJobIdFromUrl = sharedUtils.extractJobIdFromUrl;
  const sharedParseRelativeDate = sharedUtils.parseRelativeDate;
  const sharedNormalizeJob = sharedUtils.normalizeJob;

  function withDefaultScrapePageName(job) {
    if (!job || typeof job !== 'object') return job;
    if (job.ScrapePageName === undefined) {
      job.ScrapePageName = '';
    }
    return job;
  }

  function applySourceDefaults(job, source) {
    if (!job || typeof job !== 'object') return job;
    const defaults = source && typeof source.defaults === 'object' ? source.defaults : null;
    if (defaults) {
      Object.keys(defaults).forEach(key => {
        const incoming = defaults[key];
        if ((job[key] === undefined || job[key] === null || job[key] === '') && incoming !== undefined) {
          job[key] = incoming;
        }
      });
    }
    if (source && source.defaultScrapePageName) {
      if (!job.ScrapePageName) {
        job.ScrapePageName = source.defaultScrapePageName;
      }
    }
    return job;
  }

  function extractHhPublishedInfoFromText(text) {
    if (sharedExtractHhPublishedInfoFromText) {
      return sharedExtractHhPublishedInfoFromText(text);
    }
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
  }

  function extractHhSeniorityFromText(text) {
    if (sharedExtractHhSeniorityFromText) {
      return sharedExtractHhSeniorityFromText(text);
    }
    const normalized = normalizeText(text);
    const match = normalized.match(/(\d+)\s*[–—-]\s*(\d+)\s*(?:года|лет)/i);
    if (!match) return '';
    return `${match[1]}–${match[2]} года`;
  }

  function detectHhModality(jobTitle, jobSeniority) {
    if (sharedDetectHhModality) {
      return sharedDetectHhModality(jobTitle, jobSeniority);
    }
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
  }

  function exportScrapeUtils() {
    const utils = window.ScrapeUtils = window.ScrapeUtils || {};
    if (!utils.normalizeText) utils.normalizeText = normalizeText;
    if (!utils.extractJobIdFromUrl) utils.extractJobIdFromUrl = extractJobIdFromUrl;
    if (!utils.extractHhPublishedInfoFromText) utils.extractHhPublishedInfoFromText = extractHhPublishedInfoFromText;
    if (!utils.extractHhSeniorityFromText) utils.extractHhSeniorityFromText = extractHhSeniorityFromText;
    if (!utils.detectHhModality) utils.detectHhModality = detectHhModality;
    if (!utils.parseRelativeDate) utils.parseRelativeDate = parseRelativeDate;
  }

  exportScrapeUtils();

  function mergeJobsByUrl(existingJobs, incomingJobs) {
    const merged = [];
    const indexByUrl = new Map();

    (existingJobs || []).forEach(job => {
      if (!job || !job.JobUrl) return;
      indexByUrl.set(job.JobUrl, merged.length);
      merged.push(job);
    });

    (incomingJobs || []).forEach(job => {
      if (!job || !job.JobUrl) return;
      const existingIndex = indexByUrl.get(job.JobUrl);
      if (existingIndex === undefined) {
        indexByUrl.set(job.JobUrl, merged.length);
        merged.push(job);
        return;
      }

      const existing = merged[existingIndex] || {};
      const updated = Object.assign({}, existing);
      Object.keys(job).forEach(key => {
        const newValue = job[key];
        if (updated[key] === '' || updated[key] === null || updated[key] === undefined) {
          if (newValue !== '' && newValue !== null && newValue !== undefined) {
            updated[key] = newValue;
          }
        }
      });
      merged[existingIndex] = updated;
    });

    return merged;
  }

  // Listen for messages from popup/background
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Check if we should ignore this page
    if (detectSite() === 'ignore') {
      return false; // Don't handle messages
    }

    console.log('Received message:', request.action);
    if (request.action === 'scrapeList') {
      console.log('Starting scrape...');
      scrapeJobList(request && request.context ? request.context : null).then(data => {
        console.log(`Scrape completed: ${data.length} jobs found`);
        const debugPayload = lastScrapeDebug
          ? { debug: lastScrapeDebug.entries, debugMeta: { site: lastScrapeDebug.site, url: lastScrapeDebug.url } }
          : {};
        sendResponse({ success: true, data: data, ...debugPayload });
      }).catch(error => {
        console.error('Scrape error:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Will respond asynchronously
    }
    if (request.action === 'loadMoreJobs') {
      console.log('Starting load more jobs...');
      loadMoreJobsUntilOld().then(result => {
        console.log(`Load more completed: ${result.totalJobs} total jobs, found old: ${result.foundOldJobs}`);
        sendResponse({ success: true, ...result });
      }).catch(error => {
        console.error('Load more error:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Will respond asynchronously
    }
    if (request.action === 'clearLinkedInViewed') {
      clearLinkedInViewedOnPage().then(result => {
        sendResponse({ success: true, ...result });
      }).catch(error => {
        console.error('clearLinkedInViewed error:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Will respond asynchronously
    }
    if (request.action === 'startLinkedInScrollRecording') {
      startLinkedInScrollRecordingOnPage_(request && request.durationMs).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Will respond asynchronously
    }
    return false; // Not handling this message
  });

  // Also listen for ping to confirm script is loaded
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping' || request.action === 'pingList') {
      sendResponse({ success: true, ready: true, script: 'content-list' });
      return false;
    }
  });

  /**
   * Scrapes job list from the current page
   */
  async function scrapeJobList(extraContext) {
    const site = detectSite();
    console.log(`Detected site: ${site}`);
    lastScrapeDebug = null;

    let registrySource = (typeof findScrapeSourceByUrl === 'function')
      ? findScrapeSourceByUrl(window.location.href)
      : null;

    // Fallback: use detectSite to find source by ID if URL match failed
    if (!registrySource) {
      const site = detectSite();
      if (site !== 'unknown' && window.ScrapeSources) {
        registrySource = window.ScrapeSources.find(s => s.id === site);
        if (registrySource) {
          console.log(`[scrape] Fallback: matched source by site ID '${site}'`);
        }
      }
    }

    if (registrySource && typeof registrySource.scrapeList === 'function') {
      const debug = createDebugCollector(registrySource.id || 'source');
      const jobs = await registrySource.scrapeList(document, Object.assign({
        debug: debug,
        url: window.location.href
      }, extraContext || {}));
      lastScrapeDebug = debug;
      return (jobs || [])
        .map(withDefaultScrapePageName)
        .map(job => applySourceDefaults(job, registrySource))
        .map(job => sharedNormalizeJob ? sharedNormalizeJob(job) : job);
    }

    throw new Error(`No scraper registered for this site (detected: ${site}). Available sources: ${(window.ScrapeSources || []).map(s => s.id).join(', ')}`);
  }


  /**
   * Extracts job ID from URL
   */
  function extractJobIdFromUrl(url) {
    if (sharedExtractJobIdFromUrl) {
      return sharedExtractJobIdFromUrl(url);
    }
    if (!url) return '';

    // HeadHunter pattern: /vacancy/12345678
    const hhMatch = url.match(/\/vacancy\/(\d+)/);
    if (hhMatch) return hhMatch[1];

    // Habr Career pattern: /vacancies/12345678
    const habrMatch = url.match(/\/vacancies\/(\d+)/);
    if (habrMatch) return habrMatch[1];

    // Lever pattern: jobs.lever.co/company/uuid
    const leverMatch = url.match(/jobs\.lever\.co\/[^\/]+\/([^\/\?]+)/i);
    if (leverMatch) return leverMatch[1];

    // Computrabajo pattern: ...-<ID> at end of slug or oi query param
    if (url.includes('computrabajo.com')) {
      const cbMatch = url.match(/[?&]oi=([A-Za-z0-9]+)/i);
      if (cbMatch) return cbMatch[1];
      const cbSlugMatch = url.match(/-([A-Za-z0-9]{16,})(?:$|[/?#])/);
      if (cbSlugMatch) return cbSlugMatch[1];
    }

    // Get on Board pattern: /jobs/category/job-slug
    const match = url.match(/\/jobs\/[^\/]+\/([^\/\?]+)/);
    if (match) return match[1];

    // Alternative: look for numeric ID
    const numMatch = url.match(/\/(\d+)(?:\/|$|\?)/);
    if (numMatch) return numMatch[1];

    return '';
  }

  /**
   * Parses date from text (e.g., "2 days ago", "1 week ago", "3 months ago", "December 19, 2025")
   * Returns Date object or null if can't parse
   */
  function parseRelativeDate(text) {
    if (sharedParseRelativeDate) {
      return sharedParseRelativeDate(text);
    }
    if (!text) return null;

    const now = new Date();
    const lowerText = text.toLowerCase().trim();

    // Match patterns like "2 days ago", "1 week ago", "3 months ago"
    const dayMatch = lowerText.match(/(\d+)\s*(?:day|days)\s*ago/);
    if (dayMatch) {
      const days = parseInt(dayMatch[1]);
      const date = new Date(now);
      date.setDate(date.getDate() - days);
      return date;
    }

    const weekMatch = lowerText.match(/(\d+)\s*(?:week|weeks)\s*ago/);
    if (weekMatch) {
      const weeks = parseInt(weekMatch[1]);
      const date = new Date(now);
      date.setDate(date.getDate() - (weeks * 7));
      return date;
    }

    const monthMatch = lowerText.match(/(\d+)\s*(?:month|months)\s*ago/);
    if (monthMatch) {
      const months = parseInt(monthMatch[1]);
      const date = new Date(now);
      date.setMonth(date.getMonth() - months);
      return date;
    }

    // Try to parse as absolute date (e.g., "December 19, 2025", "Dec 19, 2025", "19/12/2025")
    // First try native Date parsing
    let parsed = new Date(text);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Try common date formats manually
    // Format: "December 19, 2025" or "Dec 19, 2025"
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'];
    const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
      'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    // Pattern: "MonthName DD, YYYY" or "MonthAbbr DD, YYYY"
    const absoluteMatch = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (absoluteMatch) {
      const monthName = absoluteMatch[1].toLowerCase();
      const day = parseInt(absoluteMatch[2]);
      const year = parseInt(absoluteMatch[3]);

      let monthIndex = monthNames.indexOf(monthName);
      if (monthIndex === -1) {
        monthIndex = monthAbbr.indexOf(monthName);
      }

      if (monthIndex !== -1 && day > 0 && day <= 31 && year > 2000 && year < 2100) {
        const date = new Date(year, monthIndex, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Try format: "DD/MM/YYYY" or "MM/DD/YYYY"
    const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
      const part1 = parseInt(slashMatch[1]);
      const part2 = parseInt(slashMatch[2]);
      const year = parseInt(slashMatch[3]);

      if (year > 2000 && year < 2100) {
        // Try both DD/MM/YYYY and MM/DD/YYYY
        let date = new Date(year, part2 - 1, part1);
        if (!isNaN(date.getTime()) && date.getDate() === part1 && date.getMonth() === part2 - 1) {
          return date;
        }
        date = new Date(year, part1 - 1, part2);
        if (!isNaN(date.getTime()) && date.getDate() === part2 && date.getMonth() === part1 - 1) {
          return date;
        }
      }
    }

    return null;
  }

  /**
   * Checks if any job in the scraped list is older than 1 month
   */
  function hasOldJobs(jobs) {
    if (!jobs || jobs.length === 0) return false;

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Check each job's date
    for (const job of jobs) {
      if (job.JobPostedDttm) {
        const parsedDate = parseRelativeDate(job.JobPostedDttm);
        if (parsedDate && parsedDate < oneMonthAgo) {
          return true;
        }
      }
    }

    // Also check DOM for date indicators
    const jobCards = document.querySelectorAll('article, [class*="job"], [data-job-id]');
    for (const card of jobCards) {
      const dateText = card.textContent || '';

      // Look for "Last checked" or date patterns
      const datePatterns = [
        /last\s+checked\s+(\d+\s*(?:day|days|week|weeks|month|months)\s*ago)/i,
        /(\d+)\s*(?:month|months)\s*ago/i,
        /(\d+)\s*(?:week|weeks)\s*ago/i
      ];

      for (const pattern of datePatterns) {
        const match = dateText.match(pattern);
        if (match) {
          const parsedDate = parseRelativeDate(match[0]);
          if (parsedDate) {
            // If it's 1 month or more, stop
            if (parsedDate < oneMonthAgo) {
              return true;
            }
            // Also stop if it says "X months ago" where X >= 1
            const monthsMatch = match[0].match(/(\d+)\s*(?:month|months)/i);
            if (monthsMatch && parseInt(monthsMatch[1]) >= 1) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Finds and clicks "Load more" button or scrolls to load more
   * Returns: {clicked: boolean, hasButton: boolean}
   */
  async function clickLoadMore() {
    // Try to find button by text content
    const allButtons = document.querySelectorAll('button, a[href*="#"], [role="button"]');
    for (const btn of allButtons) {
      const text = (btn.textContent || btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
      const hasLoadMore = text.includes('load more') || text.includes('show more') || text.includes('ver más') || text.includes('cargar más');
      const hasPositions = text.includes('positions') || text.includes('posiciones') || text.includes('vacancies') || text.includes('vacantes');
      if (hasLoadMore || (hasPositions && text.includes('more'))) {
        // Check if button is visible and enabled
        const style = window.getComputedStyle(btn);
        if (style.display !== 'none' && style.visibility !== 'hidden' && !btn.disabled) {
          btn.click();
          return { clicked: true, hasButton: true };
        }
      }
    }

    // If no button found, try scrolling to bottom to trigger infinite scroll
    const scrollHeight = document.documentElement.scrollHeight;
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    window.scrollTo(0, scrollHeight);

    return { clicked: false, hasButton: false }; // Return false if we used scroll instead of button
  }

  /**
   * Checks if page has jobs older than 1 month
   * Returns: {hasOld: boolean, oldestDate: Date|null, details: string}
   */
  function checkForOldJobs() {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Look for all job links and their containers
    const jobLinks = document.querySelectorAll('a[href*="/jobs/"], a[href*="/job/"]');
    console.log(`Checking ${jobLinks.length} job links for old dates...`);

    let oldestDate = null;
    let oldestText = '';
    let checkedCount = 0;
    let foundDates = [];

    for (const link of jobLinks) {
      // Find the parent card/container - try multiple selectors
      let card = link.closest('article');
      if (!card) card = link.closest('div[class*="job"]');
      if (!card) card = link.closest('[data-job-id]');
      if (!card) card = link.closest('[class*="card"]');
      if (!card) card = link.parentElement;
      if (!card) {
        // Try to get more context by going up the DOM tree
        let parent = link.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          if (parent.textContent && parent.textContent.length > 50) {
            card = parent;
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
      }
      if (!card) continue;

      checkedCount++;
      const cardText = card.textContent || '';

      // Also check data attributes for dates
      const dataDate = card.getAttribute('data-date') ||
        card.getAttribute('data-posted') ||
        card.getAttribute('data-checked') ||
        card.querySelector('[data-date]')?.getAttribute('data-date') ||
        card.querySelector('[data-posted]')?.getAttribute('data-posted');
      if (dataDate) {
        const date = parseRelativeDate(dataDate);
        if (date) {
          foundDates.push({ text: `data: ${dataDate}`, date: date });
          if (!oldestDate || date < oldestDate) {
            oldestDate = date;
            oldestText = dataDate;
          }
          if (date < oneMonthAgo) {
            console.log(`FOUND OLD JOB (data attr): "${dataDate}" = ${date}, oneMonthAgo = ${oneMonthAgo}`);
            return {
              hasOld: true,
              oldestDate: date,
              details: `Found date in data attribute "${dataDate}" - older than 1 month`
            };
          }
        }
      }

      // Look for "Last checked" text - this is the main pattern on getonbrd
      // Pattern: "Last checked yesterday" or "Last checked X days/weeks/months ago"
      const lastCheckedMatch = cardText.match(/last\s+checked\s+(yesterday|(\d+)\s*(day|days|week|weeks|month|months)\s*ago)/i);
      if (lastCheckedMatch) {
        let date = null;
        if (lastCheckedMatch[1].toLowerCase() === 'yesterday') {
          date = new Date();
          date.setDate(date.getDate() - 1);
        } else {
          date = parseRelativeDate(lastCheckedMatch[0]);
        }

        if (date) {
          foundDates.push({ text: lastCheckedMatch[0], date: date });
          if (!oldestDate || date < oldestDate) {
            oldestDate = date;
            oldestText = lastCheckedMatch[0];
          }
          if (date < oneMonthAgo) {
            console.log(`FOUND OLD JOB: "${lastCheckedMatch[0]}" = ${date}, oneMonthAgo = ${oneMonthAgo}`);
            return {
              hasOld: true,
              oldestDate: date,
              details: `Found "Last checked ${lastCheckedMatch[0]}" - older than 1 month`
            };
          }
        }
      }

      // Also check for standalone "X months ago" pattern (more direct)
      const monthsMatch = cardText.match(/(\d+)\s*(?:month|months)\s*ago/i);
      if (monthsMatch) {
        const months = parseInt(monthsMatch[1]);
        if (months >= 1) {
          const date = parseRelativeDate(monthsMatch[0]);
          if (date) {
            foundDates.push({ text: monthsMatch[0], date: date });
            if (!oldestDate || date < oldestDate) {
              oldestDate = date;
              oldestText = monthsMatch[0];
            }
            if (date < oneMonthAgo) {
              console.log(`FOUND OLD JOB: "${monthsMatch[0]}" = ${date}, oneMonthAgo = ${oneMonthAgo}`);
              return {
                hasOld: true,
                oldestDate: date,
                details: `Found "${monthsMatch[0]}" - older than 1 month`
              };
            }
          }
        }
      }

      // Check for weeks (4+ weeks = 1 month)
      const weeksMatch = cardText.match(/(\d+)\s*(?:week|weeks)\s*ago/i);
      if (weeksMatch) {
        const weeks = parseInt(weeksMatch[1]);
        if (weeks >= 4) {
          const date = parseRelativeDate(weeksMatch[0]);
          if (date) {
            foundDates.push({ text: weeksMatch[0], date: date });
            if (!oldestDate || date < oldestDate) {
              oldestDate = date;
              oldestText = weeksMatch[0];
            }
            if (date < oneMonthAgo) {
              console.log(`FOUND OLD JOB: "${weeksMatch[0]}" = ${date}, oneMonthAgo = ${oneMonthAgo}`);
              return {
                hasOld: true,
                oldestDate: date,
                details: `Found "${weeksMatch[0]}" (${weeks} weeks) - older than 1 month`
              };
            }
          }
        }
      }

      // Also check days (30+ days = 1 month)
      const daysMatch = cardText.match(/(\d+)\s*(?:day|days)\s*ago/i);
      if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        if (days >= 30) {
          const date = parseRelativeDate(daysMatch[0]);
          if (date) {
            foundDates.push({ text: daysMatch[0], date: date });
            if (!oldestDate || date < oldestDate) {
              oldestDate = date;
              oldestText = daysMatch[0];
            }
            if (date < oneMonthAgo) {
              console.log(`FOUND OLD JOB: "${daysMatch[0]}" = ${date}, oneMonthAgo = ${oneMonthAgo}`);
              return {
                hasOld: true,
                oldestDate: date,
                details: `Found "${daysMatch[0]}" (${days} days) - older than 1 month`
              };
            }
          }
        }
      }

      // Check for absolute dates (e.g., "December 19, 2025", "Dec 19, 2025")
      const absoluteDatePatterns = [
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/i,
        /\d{1,2}\/\d{1,2}\/\d{4}/
      ];

      for (const pattern of absoluteDatePatterns) {
        const match = cardText.match(pattern);
        if (match) {
          const date = parseRelativeDate(match[0]);
          if (date) {
            foundDates.push({ text: match[0], date: date });
            if (!oldestDate || date < oldestDate) {
              oldestDate = date;
              oldestText = match[0];
            }
            if (date < oneMonthAgo) {
              console.log(`FOUND OLD JOB (absolute date): "${match[0]}" = ${date}, oneMonthAgo = ${oneMonthAgo}`);
              return {
                hasOld: true,
                oldestDate: date,
                details: `Found absolute date "${match[0]}" - older than 1 month`
              };
            }
          }
        }
      }
    }

    console.log(`Checked ${checkedCount} cards, found ${foundDates.length} dates. Oldest: ${oldestText || 'none'}`);
    if (foundDates.length > 0) {
      console.log('Sample dates found:', foundDates.slice(0, 5).map(d => `${d.text} -> ${d.date}`));
    } else {
      // Debug: show sample card text to understand structure
      if (jobLinks.length > 0) {
        const firstLink = jobLinks[0];
        let card = firstLink.closest('article') || firstLink.closest('div[class*="job"]') || firstLink.parentElement;
        if (card) {
          const sampleText = card.textContent?.substring(0, 300) || 'No text';
          console.log('Sample card text (first 300 chars):', sampleText);
        }
      }
    }

    return {
      hasOld: false,
      oldestDate: oldestDate,
      details: oldestDate ? `Oldest found: ${oldestText || 'unknown'} (${oldestDate.toISOString()})` : `No dates found in ${checkedCount} cards, ${jobLinks.length} job links total`
    };
  }

  /**
   * Loads more jobs until jobs older than 1 month are found
   */
  async function loadMoreJobsUntilOld() {
    const site = detectSite();
    if (site === 'hh' || site === 'habr' || site === 'lever' || site === 'computrabajo') {
      const currentJobs = await scrapeJobList();
      const stored = await browser.storage.local.get('jobsData');
      const existingJobs = stored.jobsData || [];
      const mergedJobs = mergeJobsByUrl(existingJobs, currentJobs);
      const addedCount = Math.max(0, mergedJobs.length - existingJobs.length);

      await browser.storage.local.set({
        jobsData: mergedJobs,
        loadMoreProgress: {
          status: `Page scraped. Added ${addedCount} new, total ${mergedJobs.length}.`,
          attempts: 1,
          totalJobs: mergedJobs.length
        }
      });

      return {
        totalJobs: mergedJobs.length,
        foundOldJobs: false,
        attempts: 1
      };
    }

    const maxAttempts = 50; // Safety limit
    let attempts = 0;
    let foundOldJobs = false;
    let previousJobCount = 0;
    let noProgressCount = 0;
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // First, scrape current page
    let allJobs = await scrapeJobList();
    previousJobCount = allJobs.length;

    console.log(`Initial scrape: ${allJobs.length} jobs`);

    // Update status
    await browser.storage.local.set({
      loadMoreProgress: {
        status: `Initial: ${allJobs.length} jobs`,
        attempts: 0,
        totalJobs: allJobs.length
      }
    });

    while (attempts < maxAttempts && !foundOldJobs) {
      // FIRST: Check if we already have old jobs BEFORE loading more
      const oldJobsCheck = checkForOldJobs();
      if (oldJobsCheck.hasOld) {
        foundOldJobs = true;
        console.log('STOPPING: Found old jobs before loading more:', oldJobsCheck.details);
        break;
      }

      attempts++;
      console.log(`Attempt ${attempts}: Loading more jobs... (oldest so far: ${oldJobsCheck.details})`);

      // Update status
      await browser.storage.local.set({
        loadMoreProgress: {
          status: `Attempt ${attempts}: Checking dates, then loading...`,
          attempts: attempts,
          totalJobs: allJobs.length
        }
      });

      // Check if there's a "Load more" button before trying
      const loadMoreResult = await clickLoadMore();

      // If no button and we've scrolled, check if we're at the end
      if (!loadMoreResult.hasButton && !loadMoreResult.clicked) {
        // Check if we're already at the bottom
        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const clientHeight = document.documentElement.clientHeight;

        // If we're at the bottom and no button, might be end of page
        if (scrollTop + clientHeight >= scrollHeight - 10) {
          noProgressCount++;
          if (noProgressCount >= 2) {
            console.log('No button found and at bottom - likely end of jobs');
            break;
          }
        }
      }

      // Wait for new content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if new jobs appeared
      const currentJobs = await scrapeJobList();
      const currentCount = currentJobs.length;

      console.log(`After load attempt: ${currentCount} jobs (was ${previousJobCount})`);

      // Check if we made progress
      if (currentCount > previousJobCount) {
        noProgressCount = 0;
        previousJobCount = currentCount;
        allJobs = currentJobs;

        // Check again for old jobs after loading new content
        const newOldJobsCheck = checkForOldJobs();
        if (newOldJobsCheck.hasOld) {
          foundOldJobs = true;
          console.log('STOPPING: Found old jobs after loading:', newOldJobsCheck.details);
          break;
        }
      } else {
        noProgressCount++;
        // If no progress for 2 attempts and no button, stop
        if (noProgressCount >= 2 && !loadMoreResult.hasButton) {
          console.log('No progress and no button - stopping');
          break;
        }

        // If no progress for 3 attempts, try scrolling more
        if (noProgressCount >= 3) {
          console.log('No progress, trying to scroll more...');
          await browser.storage.local.set({
            loadMoreProgress: {
              status: `No progress, scrolling...`,
              attempts: attempts,
              totalJobs: allJobs.length
            }
          });
          for (let i = 0; i < 3; i++) {
            window.scrollTo(0, document.documentElement.scrollHeight);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          // After scrolling, check one more time
          const afterScrollJobs = await scrapeJobList();
          if (afterScrollJobs.length <= previousJobCount) {
            console.log('No new jobs after scrolling - stopping');
            break;
          }
          noProgressCount = 0;
        }
      }

      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Save all scraped jobs via background script
    if (allJobs.length > 0) {
      try {
        await browser.runtime.sendMessage({
          action: 'saveScrapedJobs',
          data: allJobs
        });
      } catch (e) {
        console.error('Error saving jobs:', e);
      }
    }

    // Clear progress
    await browser.storage.local.remove('loadMoreProgress');

    return {
      totalJobs: allJobs.length,
      foundOldJobs: foundOldJobs,
      attempts: attempts
    };
  }

  function randomInt_(minValue, maxValue) {
    const min = Math.max(0, parseInt(minValue, 10) || 0);
    const max = Math.max(min, parseInt(maxValue, 10) || min);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickLinkedInCards_() {
    const cardSelectors = [
      'li.scaffold-layout__list-item',
      'li.jobs-search-results__list-item',
      'div.job-card-container'
    ];
    let cards = [];
    for (let i = 0; i < cardSelectors.length; i++) {
      const found = Array.from(document.querySelectorAll(cardSelectors[i]));
      if (found.length > cards.length) {
        cards = found;
      }
    }
    return cards;
  }

  function getLinkedInCardKey_(card, fallbackIndex) {
    if (!card) {
      return `card:${fallbackIndex}`;
    }
    const link = card.querySelector('a[href*="/jobs/view/"]');
    if (link) {
      const href = String(link.getAttribute('href') || link.href || '').split('#')[0].split('?')[0];
      if (href) return `url:${href}`;
    }
    const dataJobId = String(card.getAttribute('data-occludable-job-id') || card.getAttribute('data-job-id') || '').trim();
    if (dataJobId) {
      return `id:${dataJobId}`;
    }
    const title = String((card.querySelector('a') && card.querySelector('a').textContent) || '').trim();
    if (title) {
      return `title:${title.slice(0, 120)}`;
    }
    return `idx:${fallbackIndex}`;
  }

  function resolveLinkedInScrollContainer_() {
    const selectors = [
      '.scaffold-layout__list',
      '.jobs-search-results-list__list',
      '.jobs-search-results-list',
      '.scaffold-layout__list-container',
      '[data-results-list-container]'
    ];
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < selectors.length; i++) {
      const nodes = Array.from(document.querySelectorAll(selectors[i]));
      for (let j = 0; j < nodes.length; j++) {
        const el = nodes[j];
        if (!el) continue;
        const score = Math.max(0, (el.scrollHeight || 0) - (el.clientHeight || 0));
        if (score > bestScore) {
          best = el;
          bestScore = score;
        }
      }
    }

    if (best) return best;
    return document.scrollingElement || document.documentElement || document.body;
  }

  function getLinkedInScrollTop_(container) {
    if (!container) {
      return 0;
    }
    if (container === document.body || container === document.documentElement || container === document.scrollingElement) {
      return Math.max(
        0,
        (document.scrollingElement && document.scrollingElement.scrollTop) || 0,
        window.pageYOffset || 0,
        document.documentElement ? document.documentElement.scrollTop || 0 : 0
      );
    }
    return Math.max(0, container.scrollTop || 0);
  }

  function normalizeLinkedInRecordedScrollSteps_(events) {
    const source = Array.isArray(events) ? events : [];
    const steps = [];
    for (let i = 0; i < source.length; i++) {
      const item = source[i] || {};
      const delta = parseInt(String(item.delta || 0), 10);
      const waitMs = parseInt(String(item.waitMs || 0), 10);
      if (!Number.isFinite(delta) || !Number.isFinite(waitMs)) continue;
      if (delta <= 0) continue;
      const clampedDelta = Math.max(20, Math.min(delta, 2600));
      const clampedWait = Math.max(10, Math.min(waitMs, 2500));

      if (steps.length > 0 && clampedWait <= 35) {
        const prev = steps[steps.length - 1];
        prev.delta = Math.max(20, Math.min(prev.delta + clampedDelta, 2600));
        prev.waitMs = Math.max(10, Math.min(prev.waitMs + clampedWait, 2500));
      } else {
        steps.push({ delta: clampedDelta, waitMs: clampedWait });
      }
    }

    if (steps.length > 180) {
      const sampled = [];
      const stride = Math.ceil(steps.length / 180);
      for (let i = 0; i < steps.length; i += stride) {
        sampled.push(steps[i]);
      }
      return sampled;
    }
    return steps;
  }

  function buildFallbackLinkedInRecordedSteps_(container, durationMs) {
    const duration = Math.max(3000, Math.min(parseInt(String(durationMs || 5000), 10) || 5000, 120000));
    const viewport = Math.max(
      300,
      (container && container.clientHeight) || 0,
      window.innerHeight || 0
    );
    const baseDelta = Math.max(120, Math.round(viewport * 0.72));
    const targetSteps = Math.max(10, Math.min(28, Math.round(duration / 260)));
    const baseWait = Math.max(60, Math.min(800, Math.round(duration / targetSteps)));
    const steps = [];

    for (let i = 0; i < targetSteps; i++) {
      const deltaScale = 0.82 + ((i % 5) * 0.07); // small natural variance
      const waitScale = 0.86 + ((i % 4) * 0.08);
      const delta = Math.max(60, Math.round(baseDelta * deltaScale));
      const waitMs = Math.max(35, Math.round(baseWait * waitScale));
      steps.push({ delta: delta, waitMs: waitMs });
    }

    return steps;
  }

  async function startLinkedInScrollRecordingOnPage_(durationMs) {
    const site = detectSite();
    if (site !== 'linkedin') {
      throw new Error('This action is available only on LinkedIn jobs pages');
    }

    if (activeLinkedInScrollRecording && activeLinkedInScrollRecording.active) {
      return { success: false, error: 'Recording is already running' };
    }

    const parsedDuration = parseInt(String(durationMs || ''), 10);
    const effectiveDuration = Number.isNaN(parsedDuration) ? 5000 : Math.max(3000, Math.min(parsedDuration, 120000));
    const startedAt = Date.now();
    const initialContainer = resolveLinkedInScrollContainer_();
    let lastTs = startedAt;
    let lastTop = getLinkedInScrollTop_(initialContainer);
    let lastWheelTs = startedAt;
    const rawEvents = [];
    const rawWheelEvents = [];
    let totalPositiveDelta = 0;
    let sampleTicks = 0;
    let lastContainerTag = '';

    const captureSample = function() {
      const now = Date.now();
      const container = resolveLinkedInScrollContainer_();
      const top = getLinkedInScrollTop_(container);
      const delta = top - lastTop;
      const waitMs = now - lastTs;
      if (delta > 0) {
        totalPositiveDelta += delta;
      }
      if (delta >= 1 && waitMs >= 5 && waitMs <= 5000) {
        rawEvents.push({
          delta: Math.round(delta),
          waitMs: Math.round(waitMs)
        });
      }
      if (container && container.tagName) {
        lastContainerTag = String(container.tagName || '').toLowerCase();
      }
      lastTop = top;
      lastTs = now;
      sampleTicks++;
    };

    const onScroll = function() {
      captureSample();
    };
    const onWheel = function() {
      const evt = arguments && arguments.length > 0 ? arguments[0] : null;
      if (evt && typeof evt.deltaY === 'number') {
        const now = Date.now();
        let deltaPx = evt.deltaY;
        if (evt.deltaMode === 1) {
          deltaPx = deltaPx * 16;
        } else if (evt.deltaMode === 2) {
          deltaPx = deltaPx * Math.max(300, window.innerHeight || 0);
        }
        const waitMs = now - lastWheelTs;
        if (deltaPx > 0 && waitMs >= 5 && waitMs <= 5000) {
          rawWheelEvents.push({
            delta: Math.round(deltaPx),
            waitMs: Math.round(waitMs)
          });
        }
        lastWheelTs = now;
      }
      captureSample();
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('wheel', onWheel, { passive: true, capture: true });
    window.addEventListener('touchmove', onWheel, { passive: true, capture: true });

    const sampleIntervalMs = 90;
    const sampleTimer = setInterval(captureSample, sampleIntervalMs);

    captureSample();
    activeLinkedInScrollRecording = {
      active: true,
      startedAt: startedAt,
      stop: async function() {
        if (!activeLinkedInScrollRecording || !activeLinkedInScrollRecording.active) {
          return;
        }
        clearInterval(sampleTimer);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('wheel', onWheel, true);
        window.removeEventListener('touchmove', onWheel, true);
        captureSample();
        const finishedAt = Date.now();
        const duration = Math.max(0, finishedAt - startedAt);
        const stepsFromScroll = normalizeLinkedInRecordedScrollSteps_(rawEvents);
        const stepsFromWheel = normalizeLinkedInRecordedScrollSteps_(rawWheelEvents);
        const resolvedContainer = resolveLinkedInScrollContainer_();
        let steps = stepsFromScroll;
        let captureMethod = 'scrollTop';
        let fallbackGenerated = false;
        let fallbackReason = '';
        if (steps.length === 0 && stepsFromWheel.length > 0) {
          steps = stepsFromWheel;
          captureMethod = 'wheel';
        }
        if (steps.length === 0) {
          steps = buildFallbackLinkedInRecordedSteps_(resolvedContainer, duration || effectiveDuration);
          captureMethod = 'fallback-default';
          fallbackGenerated = true;
          fallbackReason = 'No reliable scroll deltas captured; generated fallback profile';
        }

        const payload = steps.length > 0
          ? {
              success: true,
              profile: {
                durationMs: duration,
                steps: steps
              },
              captureMethod: captureMethod,
              fallbackGenerated: fallbackGenerated,
              fallbackReason: fallbackReason,
              rawEventsCount: rawEvents.length,
              rawWheelEventsCount: rawWheelEvents.length,
              sampleTicks: sampleTicks,
              totalPositiveDelta: Math.round(totalPositiveDelta),
              lastContainerTag: lastContainerTag
            }
          : {
              success: false,
              error: 'No scroll movement captured. Scroll the LinkedIn jobs list while recording is active.',
              rawEventsCount: rawEvents.length,
              rawWheelEventsCount: rawWheelEvents.length,
              sampleTicks: sampleTicks,
              totalPositiveDelta: Math.round(totalPositiveDelta),
              lastContainerTag: lastContainerTag
            };

        activeLinkedInScrollRecording = null;
        try {
          await browser.runtime.sendMessage({
            action: 'linkedinScrollRecordingFinished',
            data: payload
          });
        } catch (error) {
          console.error('Failed to deliver LinkedIn recording result:', error);
        }
      }
    };

    setTimeout(() => {
      if (activeLinkedInScrollRecording && activeLinkedInScrollRecording.active) {
        activeLinkedInScrollRecording.stop();
      }
    }, effectiveDuration);

    return {
      success: true,
      started: true,
      durationMs: effectiveDuration
    };
  }

  async function clearLinkedInViewedOnPage() {
    const site = detectSite();
    if (site !== 'linkedin') {
      throw new Error('This action is available only on LinkedIn jobs pages');
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const viewedRegex = /\bviewed\b/i;
    const closeSelectors = [
      'button#close-small',
      'button[id="close-small"]',
      'button[aria-label*="dismiss" i]',
      'button[aria-label*="hide" i]',
      'button[aria-label*="not interested" i]'
    ];

    let viewedFound = 0;
    let clicked = 0;
    let skipped = 0;
    const seenViewedKeys = new Set();
    const skippedKeys = new Set();
    const clickedKeys = new Set();

    const processVisibleCards = async () => {
      const cards = pickLinkedInCards_();
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!card || !card.isConnected) continue;

        const cardKey = getLinkedInCardKey_(card, i);
        const text = String(card.innerText || card.textContent || '');
        if (!viewedRegex.test(text)) continue;

        if (!seenViewedKeys.has(cardKey)) {
          seenViewedKeys.add(cardKey);
          viewedFound++;
        }

        if (clickedKeys.has(cardKey)) {
          continue;
        }

        let closeButton = null;
        for (let s = 0; s < closeSelectors.length; s++) {
          const candidate = card.querySelector(closeSelectors[s]);
          if (!candidate) continue;
          const id = String(candidate.id || '').trim().toLowerCase();
          if (id === 'undo-small') {
            continue;
          }
          closeButton = candidate;
          break;
        }

        if (!closeButton || closeButton.disabled) {
          if (!skippedKeys.has(cardKey)) {
            skippedKeys.add(cardKey);
            skipped++;
          }
          continue;
        }

        const style = window.getComputedStyle(closeButton);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        if (!isVisible) {
          if (!skippedKeys.has(cardKey)) {
            skippedKeys.add(cardKey);
            skipped++;
          }
          continue;
        }

        closeButton.click();
        clickedKeys.add(cardKey);
        clicked++;
        await sleep(randomInt_(180, 760));
      }
    };

    const scrollContainer = resolveLinkedInScrollContainer_();
    const maxScrollPasses = 220;
    let endHits = 0;
    let noProgressHits = 0;
    let lastSeenCount = 0;

    for (let pass = 0; pass < maxScrollPasses; pass++) {
      await processVisibleCards();

      const maxTop = Math.max(0, (scrollContainer.scrollHeight || 0) - (scrollContainer.clientHeight || 0));
      const prevTop = scrollContainer.scrollTop || 0;
      const stepBase = Math.max(200, Math.round((scrollContainer.clientHeight || window.innerHeight || 700) * 0.85));
      const step = Math.max(120, stepBase + randomInt_(-120, 220));
      const nextTop = Math.min(maxTop, prevTop + step);

      if (nextTop <= prevTop + 1) {
        endHits++;
        await sleep(randomInt_(260, 700));
      } else {
        endHits = 0;
        scrollContainer.scrollTop = nextTop;
        await sleep(randomInt_(180, 560));
      }

      const seenNow = seenViewedKeys.size;
      if (seenNow === lastSeenCount) {
        noProgressHits++;
      } else {
        noProgressHits = 0;
      }
      lastSeenCount = seenNow;

      if (endHits >= 3) {
        break;
      }
      if (noProgressHits >= 8 && endHits >= 1) {
        break;
      }
    }

    await processVisibleCards();

    return {
      viewedFound: viewedFound,
      clicked: clicked,
      skipped: skipped
    };
  }

  // Auto-scrape on page load if requested
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Store page URL for reference
      browser.storage.local.set({
        currentListUrl: window.location.href
      });
    });
  } else {
    browser.storage.local.set({
      currentListUrl: window.location.href
    });
  }
})();
