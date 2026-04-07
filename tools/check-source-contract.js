#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES_DIR = path.join(ROOT, 'firefox-addon', 'sources');

const SKIP = new Set(['index.js', 'registry.js']);
const REQUIRED_PATTERNS = [
  { key: 'id', re: /\bid\s*:\s*['"][a-z0-9_-]+['"]/i },
  { key: 'name', re: /\bname\s*:\s*['"][^'"]+['"]/i },
  { key: 'match', re: /\bmatch\s*\(/ },
  { key: 'scrapeList', re: /\bscrapeList\s*\(/ },
  { key: 'scrapeDetail', re: /\bscrapeDetail\s*\(/ },
  { key: 'register', re: /registerScrapeSource\s*\(/ }
];

function listSourceFiles() {
  return fs.readdirSync(SOURCES_DIR)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => !SKIP.has(f))
    .sort();
}

function validateFile(fileName) {
  const abs = path.join(SOURCES_DIR, fileName);
  const text = fs.readFileSync(abs, 'utf8');
  const missing = REQUIRED_PATTERNS
    .filter((item) => !item.re.test(text))
    .map((item) => item.key);

  return {
    fileName,
    ok: missing.length === 0,
    missing
  };
}

function main() {
  const files = listSourceFiles();
  if (files.length === 0) {
    console.error('No source files found');
    process.exit(1);
  }

  const results = files.map(validateFile);
  const failed = results.filter((r) => !r.ok);

  console.log('Source contract check');
  console.log(`Files: ${results.length}`);
  for (const result of results) {
    if (result.ok) {
      console.log(`OK   ${result.fileName}`);
    } else {
      console.log(`FAIL ${result.fileName} -> missing: ${result.missing.join(', ')}`);
    }
  }

  if (failed.length > 0) {
    process.exit(2);
  }
}

main();
