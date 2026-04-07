const fs = require('fs');
const path = require('path');

// Mock utils
const utils = {
    normalizeText: (text) => String(text || '').replace(/\s+/g, ' ').trim()
};

function decodeJsonString(value) {
    if (!value) return '';
    try {
        // Handle escaped quotes inside the string 
        // e.g. "foo \"bar\"" -> foo "bar"
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
        console.log(`[debug] Parsed array with ${data.length} items`);

        for (const item of data) {
            if (typeof item !== 'string') continue;

            // Strategy 1: Look for Schema.org JobPosting (most reliable)
            if (item.includes('"@type":"JobPosting"') || item.includes('"@type": "JobPosting"')) {
                const dateMatch = item.match(/"datePosted":"([^"]+)"/);
                if (dateMatch) {
                    result.datePosted = dateMatch[1];
                    console.log('[debug] Found Schema datePosted:', result.datePosted);
                }

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

                    // Date Posted
                    if (/^(\d+|a|an)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.test(clean)) {
                        console.log('[debug] Found heuristic date:', clean);
                        if (!result.datePosted) result.datePosted = clean;

                        // Location heuristic: Often precedes date
                        if (!result.location && idx > 0) {
                            const prev = decodeJsonString(textMatches[idx - 1]).trim();
                            if (prev && prev.length > 2 && !prev.includes('·')) {
                                result.location = prev;
                                console.log('[debug] Found heuristic location (prev):', result.location);
                            }
                        }
                    }

                    // Location fallback regex (City, Country)
                    if (!result.location && /^\s*[A-Z][a-zA-Z\s\.\-]+\s*,\s*[A-Z][a-zA-Z\s\.\-]+\s*$/.test(clean)) {
                        result.location = clean;
                        console.log('[debug] Found heuristic location (regex):', result.location);
                    }
                });

                // Fallback: First text if it looks like location
                if (!result.location && textMatches.length > 0) {
                    const potentialLoc = decodeJsonString(textMatches[0]).trim();
                    if (potentialLoc.length > 2 && !potentialLoc.includes('ago') && !potentialLoc.includes('applicant')) {
                        // Start with specific list of invalid words if needed
                        result.location = potentialLoc;
                        console.log('[debug] Found heuristic location (first item):', result.location);
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
                        console.log('[debug] Found generic description match, length:', content.length);
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

const files = ['linkedIn_job2.html', 'linkedIn_job.html'];

files.forEach(file => {
    const fixturePath = path.join(__dirname, '../fixtures/' + file);
    if (fs.existsSync(fixturePath)) {
        console.log(`\n--- Testing ${file} ---`);
        const html = fs.readFileSync(fixturePath, 'utf8');
        const result = extractFromComoRehydration(html);
        if (result) {
            console.log('Result:', {
                location: result.location,
                datePosted: result.datePosted,
                descriptionLen: result.description ? result.description.length : 0,
            });
        } else {
            console.log('No result found.');
        }
    }
});
