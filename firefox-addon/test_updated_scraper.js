const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Import the actual scraper from the built sources
const linkedinSource = require('./sources/linkedin.js');

const fixturesDir = '../fixtures';
const files = fs.readdirSync(fixturesDir).filter(f => f.startsWith('linkedIn_job') && f.endsWith('.html'));

console.log('\n=== TESTING UPDATED LINKEDIN SCRAPER ===\n');

files.forEach(file => {
    const filePath = path.join(fixturesDir, file);
    const html = fs.readFileSync(filePath, 'utf8');

    const dom = new JSDOM(html, { url: `https://www.linkedin.com/jobs/view/4362344641/` });
    const doc = dom.window.document;

    // Run scraper
    const result = linkedinSource.scrapeDetail(doc, { url: `https://www.linkedin.com/jobs/view/4362344641/` });

    console.log(`📄 ${file}`);
    console.log(`   JobTitle:        ${result.JobTitle ? '✅' : '❌'} ${result.JobTitle ? `"${result.JobTitle.substring(0, 50)}..."` : 'MISSING'}`);
    console.log(`   JobCompany:      ${result.JobCompany ? '✅' : '❌'} ${result.JobCompany || 'MISSING'}`);
    console.log(`   JobLocation:     ${result.JobLocation ? '✅' : '❌'} ${result.JobLocation || 'MISSING'}`);
    console.log(`   JobDescription:  ${result.JobDescription ? '✅' : '❌'} ${result.JobDescription ? `${result.JobDescription.length} chars` : 'MISSING'}`);
    console.log(`   Overall:         ${result.JobTitle && result.JobCompany && result.JobLocation ? '✅ PASS' : '❌ FAIL'}\n`);
});
