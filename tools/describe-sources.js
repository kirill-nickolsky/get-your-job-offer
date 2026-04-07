#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (error) {
  try {
    ({ JSDOM } = require(path.join(__dirname, '..', 'firefox-addon', 'node_modules', 'jsdom')));
  } catch (innerError) {
    console.error('Missing jsdom. Run: (cd firefox-addon && npm install)');
    process.exit(1);
  }
}

const rootDir = path.resolve(__dirname, '..', 'firefox-addon');
const sourcesDir = path.join(rootDir, 'sources');
const utilsDir = path.join(rootDir, 'utils');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.com'
});
const { window } = dom;
window.console = {
  log: () => {},
  warn: () => {},
  error: () => {}
};

function loadScript(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const wrapped = `(function(window){\nconst console = window.console || globalThis.console;\n${code}\n})(window);`;
  const script = new Function('window', wrapped);
  script(window);
}

// Load utils first
['normalize.js', 'parse.js', 'schema.js', 'job.js', 'debug.js', 'dom.js', 'source-helpers.js', 'validateSource.js'].forEach(name => {
  loadScript(path.join(utilsDir, name));
});

// Load registry and sources
loadScript(path.join(sourcesDir, 'index.js'));
const sourceFiles = fs.readdirSync(sourcesDir)
  .filter(name => name.endsWith('.js') && !['index.js', 'registry.js'].includes(name))
  .sort();
sourceFiles.forEach(name => {
  try {
    loadScript(path.join(sourcesDir, name));
  } catch (error) {
    console.error(`Failed to load source ${name}: ${error.message}`);
    process.exit(2);
  }
});

const sources = Array.isArray(window.ScrapeSources) ? window.ScrapeSources : [];

console.log('# Sources (generated)');
console.log('');
console.log('| id | name |');
console.log('| --- | --- |');
sources.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
sources.forEach(source => {
  console.log(`| ${source.id} | ${source.name} |`);
});
