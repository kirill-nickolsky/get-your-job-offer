const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Copy the actual scraper logic from linkedin.js
function normalizeText(text) {
    return String(text || '')
        .replace(/\u00A0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractJobIdFromUrl(url) {
    if (!url) return '';
    const match = String(url).match(/\/jobs\/view\/(\d+)/i);
    if (match) return match[1];
    return '';
}

function decodeJsonString(value) {
    if (!value) return '';
    try {
        return JSON.parse('"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
    } catch (e) {
        return String(value)
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"');
    }
}

function extractFromHtml(html, jobId) {
    if (!html) return null;

    const token = jobId ? `urn:li:fsd_jobPosting:${jobId}` : 'urn:li:fsd_jobPosting:';
    const idx = html.indexOf(token);
    if (idx === -1) return null;

    const sliceStart = Math.max(0, idx - 4000);
    const sliceEnd = Math.min(html.length, idx + 12000);
    const block = html.slice(sliceStart, sliceEnd);

    const titleMatch = block.match(/\"title\":\"([^\"]+)\"/);
    const companyMatch = block.match(/\"companyName\":\"([^\"]+)\"/) ||
        block.match(/\"name\":\"([^\"]+)\"/);
    const locationMatch = block.match(/\"formattedLocation\":\"([^\"]+)\"/) ||
        block.match(/\"locationName\":\"([^\"]+)\"/);
    const descriptionMatch = block.match(/\"description\":\"([\s\S]*?)\"[,}]/);

    return {
        title: titleMatch ? decodeJsonString(titleMatch[1]) : '',
        company: companyMatch ? decodeJsonString(companyMatch[1]) : '',
        location: locationMatch ? decodeJsonString(locationMatch[1]) : '',
        description: descriptionMatch ? decodeJsonString(descriptionMatch[1]) : ''
    };
}

function extractFromComoRehydration(html) {
    if (!html) return null;
    try {
        const startToken = 'window.__como_rehydration__ = [';
        const startIdx = html.indexOf(startToken);
        if (startIdx === -1) return null;

        const scriptEndIdx = html.indexOf('</script>', startIdx);
        if (scriptEndIdx === -1) return null;

        let jsonCandidate = html.substring(startIdx + 'window.__como_rehydration__ = '.length, scriptEndIdx);
        jsonCandidate = jsonCandidate.trim();
        if (jsonCandidate.endsWith(';')) {
            jsonCandidate = jsonCandidate.slice(0, -1).trim();
        }

        const data = JSON.parse(jsonCandidate);
        if (!Array.isArray(data)) return null;

        let result = {};
        console.log(`[debug] Parsed array with ${data.length} items (inside extractFromComoRehydration)`);

        for (const item of data) {
            if (typeof item !== 'string') continue;

            // Strategy 1: Look for Schema.org JobPosting (most reliable)
            if (item.includes('"@type":"JobPosting"') || item.includes('"@type": "JobPosting"')) {
                const dateMatch = item.match(/"datePosted":"([^"]+)"/);
                if (dateMatch) result.datePosted = dateMatch[1];

                const descMatch = item.match(/"description":"((?:[^"\\]|\\.)*)"/);
                if (descMatch) result.description = decodeJsonString(descMatch[1]);

                const locMatch = item.match(/"addressLocality":"([^"]+)"/);
                if (locMatch) result.location = decodeJsonString(locMatch[1]);

                const titleMatch = item.match(/"title":"([^"]+)"/);
                if (titleMatch) result.title = decodeJsonString(titleMatch[1]);

                const compMatch = item.match(/"hiringOrganization".*?"name":"([^"]+)"/);
                if (compMatch) result.company = decodeJsonString(compMatch[1]);
            }

            // Strategy 2: Look for specific UI components (TopCard)
            if (item.includes('com.linkedin.sdui.impl.jobseeker.jobdetails.components.topcard.topCard')) {
                console.log('[debug] Found TopCard component');
                // Extract all text children: children":["Text"]
                const textMatches = Array.from(item.matchAll(/\"children\":\[\"([^\"]+)\"\]/g), m => m[1]);

                // Heuristic Mapping
                textMatches.forEach((text, idx) => {
                    const clean = decodeJsonString(text).trim();
                    if (!clean) return;

                    // Date Posted: "2 weeks ago"
                    if (/^(\d+|a|an)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.test(clean)) {
                        console.log('[debug] Date matched:', clean);
                        if (!result.datePosted) result.datePosted = clean;

                        // Location heuristic: Often precedes date
                        if (!result.location && idx > 0) {
                            const prev = decodeJsonString(textMatches[idx - 1]).trim();
                            if (prev && prev.length > 2 && !prev.includes('·')) {
                                result.location = prev;
                                console.log('[debug] Loc matched (prev):', prev);
                            }
                        }
                    }

                    // Location fallback regex (City, Country)
                    if (!result.location && /^\s*[A-Z][a-zA-Z\s\.\-]+\s*,\s*[A-Z][a-zA-Z\s\.\-]+\s*$/.test(clean)) {
                        result.location = clean;
                        console.log('[debug] Loc matched (regex):', clean);
                    }
                });

                // Fallback: First text if it looks like location
                if (!result.location && textMatches.length > 0) {
                    const potentialLoc = decodeJsonString(textMatches[0]).trim();
                    if (potentialLoc.length > 2 && !potentialLoc.includes('ago') && !potentialLoc.includes('applicant')) {
                        result.location = potentialLoc;
                        // console.log('[debug] Loc matched (fallback):', potentialLoc);
                    }
                }
            }

            // Strategy 3: Description - Look for any large text block with "description" key
            if (!result.description) {
                const descMatch = item.match(/"description":"((?:[^"\\]|\\.)*)"/);
                if (descMatch && descMatch[1].length > 200) {
                    const content = decodeJsonString(descMatch[1]);
                    // Filter out error messages
                    if (!content.includes('problem loading the content') && !content.includes('enabled')) {
                        result.description = content;
                    }
                }
            }
        }

        return Object.keys(result).length > 0 ? result : null;
    } catch (e) {
        console.error('[scrape] Error parsing como_rehydration', e);
    }
    return null;
}

function scrapeDetail(html, url) {
    const dom = new JSDOM(html);
    const documentRef = dom.window.document;
    const jobId = extractJobIdFromUrl(url);

    const job = {
        JobUrl: url || '',
        JobId: jobId || '',
        JobTitle: '',
        JobCompany: '',
        JobLocation: '',
        JobDescription: '',
        JobPostedDttm: ''
    };

    // 1. Try standard selectors
    const titleEl = documentRef.querySelector('h1') ||
        documentRef.querySelector('.job-details-jobs-unified-top-card__job-title') ||
        documentRef.querySelector('.top-card-layout__title');
    if (titleEl) {
        job.JobTitle = normalizeText(titleEl.textContent || '');
    }

    // 1b. Fallback: Parse <title> tag
    if (!job.JobTitle) {
        const titleTag = documentRef.querySelector('title');
        if (titleTag) {
            const fullTitle = titleTag.textContent.trim();
            const parts = fullTitle.split(' | ');
            if (parts.length >= 2) {
                job.JobTitle = normalizeText(parts[0]);
                if (!job.JobCompany && parts.length > 2) {
                    job.JobCompany = normalizeText(parts[1]);
                }
            }
        }
    }

    const companyEl = documentRef.querySelector('.job-details-jobs-unified-top-card__company-name') ||
        documentRef.querySelector('.top-card-layout__company-name') ||
        documentRef.querySelector('[data-test-company-name]');
    if (companyEl) {
        job.JobCompany = normalizeText(companyEl.textContent || '');
    }

    const locationEl = documentRef.querySelector('.job-details-jobs-unified-top-card__bullet') ||
        documentRef.querySelector('.top-card-layout__first-subline') ||
        documentRef.querySelector('[data-test-job-location]');
    if (locationEl) {
        job.JobLocation = normalizeText(locationEl.textContent || '');
    }

    // 2. Try description selectors
    const descEl = documentRef.querySelector('.jobs-description__content') ||
        documentRef.querySelector('.jobs-description-content__text') ||
        documentRef.querySelector('.show-more-less-html__markup') ||
        documentRef.querySelector('[data-job-description]') ||
        documentRef.querySelector('div.jobs-box__html-content') ||
        documentRef.querySelector('#job-details') ||
        documentRef.querySelector('.job-view-layout .description');

    if (descEl) {
        job.JobDescription = normalizeText(descEl.innerText || descEl.textContent || '');
    }

    // 3. Fallback: Extract from Scripts/JSON
    if (!job.JobTitle || !job.JobDescription || job.JobDescription.length < 50) {
        let extracted = extractFromHtml(html, job.JobId);

        if (!extracted || !extracted.description) {
            console.log('[debug] Calling extractFromComoRehydration from scrapeDetail');
            const newExtracted = extractFromComoRehydration(html);
            if (newExtracted) {
                console.log('[debug] extractFromComoRehydration returned result:', newExtracted);
                extracted = extracted || {};
                if (newExtracted.title) extracted.title = newExtracted.title;
                if (newExtracted.company) extracted.company = newExtracted.company;
                if (newExtracted.description) extracted.description = newExtracted.description;
                if (newExtracted.location) extracted.location = newExtracted.location;
                if (newExtracted.datePosted) extracted.datePosted = newExtracted.datePosted;
            } else {
                console.log('[debug] extractFromComoRehydration returned NULL');
            }
        }

        if (extracted) {
            if (!job.JobTitle && extracted.title) job.JobTitle = normalizeText(extracted.title);
            if (!job.JobCompany && extracted.company) job.JobCompany = normalizeText(extracted.company);
            if (!job.JobLocation && extracted.location) job.JobLocation = normalizeText(extracted.location);
            if ((!job.JobDescription || job.JobDescription.length < 50) && extracted.description) {
                job.JobDescription = normalizeText(extracted.description);
            }
            if (!job.JobPostedDttm && extracted.datePosted) {
                job.JobPostedDttm = extracted.datePosted;
            }
        }
    }

    return job;
}

// Test all fixtures
const files = ['linkedIn_job.html', 'linkedIn_job2.html', 'linkedIn_job3.html', 'linkedIn_job4.html'];

console.log('\n=== TESTING LINKEDIN SCRAPER AGAINST ALL FIXTURES ===\n');

files.forEach(file => {
    const fixturePath = path.join(__dirname, '../fixtures/' + file);
    if (!fs.existsSync(fixturePath)) {
        console.log(`❌ ${file}: FILE NOT FOUND`);
        return;
    }

    const html = fs.readFileSync(fixturePath, 'utf8');
    const url = `https://www.linkedin.com/jobs/view/12345/`;
    const result = scrapeDetail(html, url);

    console.log(`\n📄 ${file}`);
    console.log(`   JobTitle:        ${result.JobTitle ? '✅' : '❌'} ${result.JobTitle ? `"${result.JobTitle.substring(0, 50)}..."` : 'MISSING'}`);
    console.log(`   JobCompany:      ${result.JobCompany ? '✅' : '❌'} ${result.JobCompany || 'MISSING'}`);
    console.log(`   JobLocation:     ${result.JobLocation ? '✅' : '❌'} ${result.JobLocation || 'MISSING'}`);
    console.log(`   JobDescription:  ${result.JobDescription && result.JobDescription.length > 50 ? '✅' : '❌'} ${result.JobDescription ? `${result.JobDescription.length} chars` : 'MISSING'}`);
    console.log(`   JobPostedDttm:   ${result.JobPostedDttm ? '✅' : '⚠️'} ${result.JobPostedDttm || 'NOT IMPLEMENTED'}`);
    console.log(`   JobTags:         ${result.JobTags ? '✅' : '⚠️'} ${result.JobTags || 'NOT IMPLEMENTED'}`);

    if (file === 'linkedIn_job2.html') {
        const desc = result.JobDescription || '';
        const hasPrivacy = desc.includes('Please read our privacy policy here.');
        const hasAlertBlock = desc.includes('Set alert for similar jobs');
        const hasPremiumBlock = desc.includes('Job search faster with Premium');
        const hasAboutHeader = desc.includes('About the job') || desc.includes('About The Role');

        console.log(`   DescTrim:        ${hasPrivacy && !hasAlertBlock && !hasPremiumBlock ? '✅' : '❌'} privacy=${hasPrivacy} alert=${hasAlertBlock} premium=${hasPremiumBlock} header=${hasAboutHeader}`);
    }

    const allRequired = result.JobTitle && result.JobCompany && result.JobLocation;
    console.log(`   Overall:         ${allRequired ? '✅ PASS' : '❌ FAIL'}`);
});

console.log('\n');
