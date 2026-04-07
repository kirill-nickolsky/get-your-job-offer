(function() {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  const utils = root.ScrapeUtils = root.ScrapeUtils || {};

  const JOB_FIELDS = [
    'JobId',
    'JobTitle',
    'JobCompany',
    'JobLocation',
    'JobModality',
    'JobSalary',
    'JobTags',
    'JobDescription',
    'JobUrl',
    'JobApplyUrl',
    'JobPostedDttm',
    'JobRateNum',
    'JobRateDesc',
    'JobRateShortDesc',
    'JobRateDttm',
    'RatedModelName',
    'Status',
    'ScrapePageName',
    'LoadDttm'
  ];

  if (!utils.JOB_FIELDS) {
    utils.JOB_FIELDS = JOB_FIELDS;
  }

  if (!utils.normalizeJob) {
    utils.normalizeJob = function(job) {
      const normalized = {};
      const input = job && typeof job === 'object' ? job : {};
      for (let i = 0; i < JOB_FIELDS.length; i++) {
        const key = JOB_FIELDS[i];
        const value = input[key];
        if (value === undefined || value === null) {
          normalized[key] = '';
        } else if (typeof value === 'string') {
          normalized[key] = value.replace(/\s+/g, ' ').trim();
        } else {
          normalized[key] = value;
        }
      }

      Object.keys(input).forEach(key => {
        if (normalized[key] === undefined) {
          normalized[key] = input[key];
        }
      });

      return normalized;
    };
  }
})();
