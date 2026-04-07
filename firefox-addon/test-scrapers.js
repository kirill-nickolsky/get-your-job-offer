#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

let JSDOM = null;
let VirtualConsole = null;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (error) {
  console.error('Missing dependency: jsdom');
  console.error('Install with: npm install --save-dev jsdom');
  process.exit(1);
}

const ADDON_DIR = __dirname;
const ROOT_DIR = path.join(ADDON_DIR, '..');
const FIXTURES_DIR = path.join(ROOT_DIR, 'fixtures');
const UTILS_DIR = path.join(ADDON_DIR, 'utils');
const SOURCES_DIR = path.join(ADDON_DIR, 'sources');

const SOURCE_URLS = {
  hh: 'https://hh.ru/search/vacancy',
  getonbrd: 'https://www.getonbrd.com/myjobs',
  habr: 'https://career.habr.com/vacancies',
  gallito: 'https://trabajo.gallito.com.uy/buscar/fecha-publicacion/hace-2-dias/nivel/tecnico-especialista',
  lever: 'https://jobs.lever.co/dlocal',
  computrabajo: 'https://www.computrabajo.com/empleos',
  wellfound: 'https://wellfound.com/jobs',
  jobspresso: 'https://jobspresso.co/remote-work/',
  torc: 'https://platform.torc.dev/#/jobs/matches',
  revelo: 'https://app.careers.revelo.com/home',
  workatastartup: 'https://www.workatastartup.com/companies'
};

const FIXTURE_ID_ALIASES = {
  gettonbrd: 'getonbrd',
  Torc: 'torc',
  ycombinator: 'workatastartup'
};
const ALLOW_EMPTY_LIST = new Set(['getonbrd', 'wellfound', 'jobspresso', 'torc', 'revelo', 'workatastartup']);
const ALLOW_EMPTY_DETAIL_TITLE = new Set(['torc', 'revelo']);

function normalizeSourceId(id) {
  return FIXTURE_ID_ALIASES[id] || id;
}

function readScript(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function loadScripts(window, scripts) {
  scripts.forEach(scriptPath => {
    const code = readScript(scriptPath);
    window.eval(code);
  });
}

function getScriptPaths() {
  const scripts = [];
  if (fs.existsSync(UTILS_DIR)) {
    fs.readdirSync(UTILS_DIR)
      .filter(file => file.endsWith('.js'))
      .sort()
      .forEach(file => scripts.push(path.join(UTILS_DIR, file)));
  }

  scripts.push(path.join(SOURCES_DIR, 'index.js'));

  fs.readdirSync(SOURCES_DIR)
    .filter(file => file.endsWith('.js') && file !== 'index.js')
    .sort()
    .forEach(file => scripts.push(path.join(SOURCES_DIR, file)));

  return scripts;
}

function loadFixtures() {
  if (!fs.existsSync(FIXTURES_DIR)) {
    return {};
  }
  const files = fs.readdirSync(FIXTURES_DIR);
  const fixtures = {};
  files.forEach(file => {
    const match = file.match(/^(.*)_(list|job)\.html$/);
    if (!match) return;
    const id = match[1];
    const type = match[2];
    fixtures[id] = fixtures[id] || {};
    fixtures[id][type] = path.join(FIXTURES_DIR, file);
  });
  return fixtures;
}

function createDom(html, url) {
  const virtualConsole = VirtualConsole ? new VirtualConsole() : null;
  if (virtualConsole) {
    virtualConsole.on('jsdomError', () => {});
  }
  return new JSDOM(html, {
    url: url || 'https://example.com',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: virtualConsole || undefined
  });
}

async function runListTest(id, fixturePath) {
  const url = SOURCE_URLS[id] || 'https://example.com';
  const html = readScript(fixturePath);
  const dom = createDom(html, url);
  loadScripts(dom.window, getScriptPaths());

  const source = dom.window.findScrapeSourceByUrl
    ? dom.window.findScrapeSourceByUrl(url)
    : null;

  if (!source || typeof source.scrapeList !== 'function') {
    throw new Error(`No scrapeList found for ${id}`);
  }

  const jobs = await source.scrapeList(dom.window.document, { url: url });
  const count = Array.isArray(jobs) ? jobs.length : 0;
  const sample = count > 0 ? jobs[0] : null;
  if (count === 0 && !ALLOW_EMPTY_LIST.has(id)) {
    throw new Error('Expected jobs > 0');
  }
  if (sample) {
    if (!sample.JobTitle) {
      throw new Error('Expected sample JobTitle');
    }
    if (!sample.JobUrl) {
      throw new Error('Expected sample JobUrl');
    }
  }
  if (dom.window && typeof dom.window.close === 'function') {
    dom.window.close();
  }
  return { count, sample };
}

async function runDetailTest(id, fixturePath) {
  const url = SOURCE_URLS[id] || 'https://example.com';
  const html = readScript(fixturePath);
  const dom = createDom(html, url);
  loadScripts(dom.window, getScriptPaths());

  const source = dom.window.findScrapeSourceByUrl
    ? dom.window.findScrapeSourceByUrl(url)
    : null;

  if (!source || typeof source.scrapeDetail !== 'function') {
    throw new Error(`No scrapeDetail found for ${id}`);
  }

  const job = await source.scrapeDetail(dom.window.document, { url: url });
  const sample = job || null;
  if (!sample) {
    throw new Error('Expected detail job');
  }
  if (!sample.JobTitle && !ALLOW_EMPTY_DETAIL_TITLE.has(id)) {
    throw new Error('Expected detail JobTitle');
  }
  if (dom.window && typeof dom.window.close === 'function') {
    dom.window.close();
  }
  return { sample };
}

async function main() {
  const fixtures = loadFixtures();
  const ids = Object.keys(fixtures).sort();

  if (ids.length === 0) {
    console.log('No fixtures found. Add files like <id>_list.html or <id>_job.html in fixtures/.');
    return;
  }

  console.log('Running scraper tests...');

  let failures = 0;
  for (const id of ids) {
    const entry = fixtures[id];
    const sourceId = normalizeSourceId(id);
    const label = sourceId !== id ? `${id} -> ${sourceId}` : id;
    console.log(`\nSource: ${label}`);

    if (entry.list) {
      try {
        const result = await runListTest(sourceId, entry.list);
        console.log(`  list: ${result.count} jobs`);
        if (result.sample) {
          console.log(`    sample.title: ${result.sample.JobTitle || ''}`);
          console.log(`    sample.url: ${result.sample.JobUrl || ''}`);
        }
      } catch (error) {
        console.log(`  list: ERROR - ${error.message}`);
        failures += 1;
      }
    } else {
      console.log('  list: (no fixture)');
    }

    if (entry.job) {
      try {
        const result = await runDetailTest(sourceId, entry.job);
        const sample = result.sample || {};
        console.log('  detail: ok');
        console.log(`    title: ${sample.JobTitle || ''}`);
        console.log(`    company: ${sample.JobCompany || ''}`);
        console.log(`    location: ${sample.JobLocation || ''}`);
      } catch (error) {
        console.log(`  detail: ERROR - ${error.message}`);
        failures += 1;
      }
    } else {
      console.log('  detail: (no fixture)');
    }
  }

  if (failures > 0) {
    console.error(`\\nTests failed: ${failures}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
