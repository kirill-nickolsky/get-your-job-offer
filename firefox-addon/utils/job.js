(function() {
  'use strict';

  const root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  const utils = root.ScrapeUtils = root.ScrapeUtils || {};

  const EMPTY_JOB_TEMPLATE = {
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
  };

  if (!utils.createEmptyJob) {
    utils.createEmptyJob = function(overrides) {
      const patch = (overrides && typeof overrides === 'object') ? overrides : {};
      return Object.assign({}, EMPTY_JOB_TEMPLATE, patch);
    };
  }
})();
