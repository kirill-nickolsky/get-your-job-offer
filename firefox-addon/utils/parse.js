(function() {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  const utils = root.ScrapeUtils = root.ScrapeUtils || {};
  const normalizeText = utils.normalizeText || function(text) {
    return String(text || '')
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  if (!utils.extractJobIdFromUrl) {
    utils.extractJobIdFromUrl = function(url) {
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
    };
  }

  if (!utils.extractHhPublishedInfoFromText) {
    utils.extractHhPublishedInfoFromText = function(text) {
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
  }

  if (!utils.extractHhSeniorityFromText) {
    utils.extractHhSeniorityFromText = function(text) {
      const normalized = normalizeText(text);
      const match = normalized.match(/(\d+)\s*[–—-]\s*(\d+)\s*(?:года|лет)/i);
      if (!match) return '';
      return `${match[1]}–${match[2]} года`;
    };
  }

  if (!utils.detectHhModality) {
    utils.detectHhModality = function(jobTitle, jobSeniority) {
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
  }

  if (!utils.parseRelativeDate) {
    utils.parseRelativeDate = function(text) {
      if (!text) return null;

      const now = new Date();
      const lowerText = String(text).toLowerCase().trim();

      const dayMatch = lowerText.match(/(\d+)\s*(?:day|days)\s*ago/);
      if (dayMatch) {
        const days = parseInt(dayMatch[1], 10);
        const date = new Date(now);
        date.setDate(date.getDate() - days);
        return date;
      }

      const weekMatch = lowerText.match(/(\d+)\s*(?:week|weeks)\s*ago/);
      if (weekMatch) {
        const weeks = parseInt(weekMatch[1], 10);
        const date = new Date(now);
        date.setDate(date.getDate() - (weeks * 7));
        return date;
      }

      const monthMatch = lowerText.match(/(\d+)\s*(?:month|months)\s*ago/);
      if (monthMatch) {
        const months = parseInt(monthMatch[1], 10);
        const date = new Date(now);
        date.setMonth(date.getMonth() - months);
        return date;
      }

      let parsed = new Date(text);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }

      const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
      ];
      const monthAbbr = [
        'jan', 'feb', 'mar', 'apr', 'may', 'jun',
        'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
      ];

      const absoluteMatch = text.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/i);
      if (absoluteMatch) {
        const monthName = absoluteMatch[1].toLowerCase();
        const day = parseInt(absoluteMatch[2], 10);
        const year = parseInt(absoluteMatch[3], 10);

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

      const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (slashMatch) {
        const part1 = parseInt(slashMatch[1], 10);
        const part2 = parseInt(slashMatch[2], 10);
        const year = parseInt(slashMatch[3], 10);

        if (year > 2000 && year < 2100) {
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
    };
  }
})();
