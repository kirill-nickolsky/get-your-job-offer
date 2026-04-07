#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs', 'CODEMAP.generated.md');

const AREAS = [
  {
    name: 'Addon Core',
    base: 'firefox-addon',
    files: [
      'manifest.json',
      'background.js',
      'popup.js',
      'popup.html',
      'content-list.js',
      'content-job.js'
    ]
  },
  {
    name: 'Addon Sources',
    base: 'firefox-addon/sources',
    dynamic: true,
    filter: (file) => file.endsWith('.js')
  },
  {
    name: 'Addon Utils',
    base: 'firefox-addon/utils',
    dynamic: true,
    filter: (file) => file.endsWith('.js')
  },
  {
    name: 'Apps Script Core',
    base: 'appsscript',
    files: [
      'Code.gs',
      'WebApp.gs',
      'IncrementLoader.gs',
      'RowMover.gs',
      'SimpleRater.gs',
      'MediumRater.gs',
      'DataFunnel.gs',
      'Settings.gs',
      'ScrapeSources.gs',
      'ScrapeLog.gs',
      'Utils.gs',
      'Validators.gs',
      'StageValidator.gs'
    ]
  },
  {
    name: 'Cloud Core',
    base: 'cloud',
    files: [
      'package.json',
      'Dockerfile',
      'src/index.ts',
      'src/config.ts',
      'src/auth.ts',
      'src/firestore.ts',
      'src/tasks.ts',
      'src/session-auth.ts'
    ]
  },
  {
    name: 'Cloud Routes',
    base: 'cloud/src/routes',
    dynamic: true,
    filter: (file) => file.endsWith('.ts')
  },
  {
    name: 'Cloud Services',
    base: 'cloud/src/services',
    dynamic: true,
    filter: (file) => file.endsWith('.ts')
  },
  {
    name: 'Infra (Terraform)',
    base: 'infra/terraform',
    files: [
      'main.tf',
      'run.tf',
      'tasks.tf',
      'scheduler.tf',
      'secrets.tf',
      'bigquery.tf',
      'firestore-indexes.tf',
      'terraform.tfvars.example'
    ]
  },
  {
    name: 'Deploy',
    base: '.',
    files: [
      'cloudbuild.yaml'
    ]
  },
  {
    name: 'Docs (Context)',
    base: 'docs',
    files: [
      'LLM_CONTEXT.md',
      'ACTIVE_FILES.md',
      'ARCHITECTURE.md',
      'CONTRACTS.md',
      'SETTINGS.md',
      'DEPLOY_GCP.md',
      'BACKLOG.md',
      'ADDING_SOURCE.md',
      'APPS_SCRIPT_FLOW.md',
      'ERROR_CODES.md',
      'SOURCES.md',
      'SOURCES.generated.md'
    ]
  }
];

function exists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function firstCommentLine(absPath) {
  if (!exists(absPath)) return '';
  const ext = path.extname(absPath).toLowerCase();
  if (!['.js', '.gs', '.ts'].includes(ext)) return '';
  const text = fs.readFileSync(absPath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const line of lines.slice(0, 40)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      return trimmed.replace(/^\/\/\s*/, '').trim();
    }
    if (trimmed.startsWith('*')) {
      return trimmed.replace(/^\*\s*/, '').trim();
    }
  }
  return '';
}

function roleGuess(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (p.includes('/sources/')) return 'Source module';
  if (p.includes('/utils/')) return 'Shared helper';
  if (p.endsWith('background.js')) return 'Addon orchestrator';
  if (p.endsWith('content-list.js')) return 'List scraping entrypoint';
  if (p.endsWith('content-job.js')) return 'Detail scraping entrypoint';
  if (p.endsWith('WebApp.gs')) return 'HTTP endpoint for addon';
  if (p.endsWith('IncrementLoader.gs')) return 'Stage -> NewJobs loader';
  if (p.endsWith('DataFunnel.gs')) return 'Source status funnel';
  if (p.endsWith('SimpleRater.gs')) return 'Simple rating stage';
  if (p.endsWith('MediumRater.gs')) return 'Medium rating stage';
  if (p.endsWith('RowMover.gs')) return 'Archive/move logic';
  if (p.endsWith('manifest.json')) return 'Extension permissions and scripts';
  if (p.endsWith('cloud/src/index.ts')) return 'Cloud Run entrypoint';
  if (p.endsWith('cloud/src/config.ts')) return 'Cloud config/env parsing';
  if (p.endsWith('cloud/src/auth.ts')) return 'Addon/task auth';
  if (p.endsWith('cloud/src/firestore.ts')) return 'Firestore/memory backend adapter';
  if (p.endsWith('cloud/src/tasks.ts')) return 'Cloud Tasks enqueue helper';
  if (p.endsWith('cloud/src/session-auth.ts')) return 'Mini App bearer session auth';
  if (p.includes('cloud/src/routes/')) return 'Cloud HTTP route';
  if (p.includes('cloud/src/services/')) return 'Cloud service logic';
  if (p.endsWith('cloud/package.json')) return 'Cloud package manifest';
  if (p.endsWith('cloud/Dockerfile')) return 'Cloud Run image build';
  if (p.endsWith('cloudbuild.yaml')) return 'Cloud Build deploy pipeline';
  if (p.endsWith('.tf')) return 'Terraform resource definition';
  if (p.endsWith('terraform.tfvars.example')) return 'Terraform variables example';
  return 'Project file';
}

function collectAreaFiles(area) {
  const absBase = path.join(ROOT, area.base);
  if (!exists(absBase)) return [];

  if (area.dynamic) {
    return fs.readdirSync(absBase)
      .filter((f) => !f.startsWith('.'))
      .filter((f) => (area.filter ? area.filter(f) : true))
      .sort();
  }

  return (area.files || []).filter((f) => exists(path.join(absBase, f)));
}

function renderTableRows(area) {
  const files = collectAreaFiles(area);
  const rows = [];

  for (const file of files) {
    const rel = path.join(area.base, file).replace(/\\/g, '/');
    const abs = path.join(ROOT, rel);
    const role = roleGuess(rel);
    const note = firstCommentLine(abs);
    rows.push(`| \`${rel}\` | ${role} | ${note || '-'} |`);
  }

  return rows;
}

const now = new Date().toISOString();
const out = [];
out.push('# CODEMAP (generated)');
out.push('');
out.push(`Generated at: \`${now}\``);
out.push('');
out.push('Этот файл генерируется скриптом `tools/generate-codemap.js`.');
out.push('Редактировать вручную не нужно.');
out.push('');

for (const area of AREAS) {
  const rows = renderTableRows(area);
  out.push(`## ${area.name}`);
  out.push('');
  out.push('| File | Role | Note |');
  out.push('| --- | --- | --- |');
  if (rows.length === 0) {
    out.push('| - | - | - |');
  } else {
    out.push(...rows);
  }
  out.push('');
}

fs.writeFileSync(OUTPUT, `${out.join('\n')}\n`, 'utf8');
console.log(`Generated ${path.relative(ROOT, OUTPUT)}`);
