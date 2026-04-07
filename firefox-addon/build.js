#!/usr/bin/env node

/**
 * Node.js build script for Firefox addon XPI package
 * Cross-platform alternative to build.sh
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ADDON_DIR = __dirname;
const OUTPUT_DIR = path.join(ADDON_DIR, 'dist');
const XPI_NAME = 'hrscrape2mart.xpi';
const XPI_PATH = path.join(OUTPUT_DIR, XPI_NAME);

// Files to include in XPI
const FILES_TO_INCLUDE = [
  'manifest.json',
  'background.js',
  'content-autofill.js',
  'content-list.js',
  'content-job.js',
  'popup.html',
  'popup.js'
];

console.log('Building Firefox addon XPI...');

// Create dist directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Remove old XPI if exists
if (fs.existsSync(XPI_PATH)) {
  fs.unlinkSync(XPI_PATH);
  console.log('Removed old XPI file');
}

// Create temporary directory for packaging
const os = require('os');
const TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'xpi-build-'));
const cleanup = () => {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
};

process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(1);
});

// Copy all necessary files to temp directory
console.log('Copying files...');
FILES_TO_INCLUDE.forEach(file => {
  const srcPath = path.join(ADDON_DIR, file);
  const destPath = path.join(TEMP_DIR, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
  } else {
    console.warn(`Warning: ${file} not found, skipping...`);
  }
});

// Copy sources directory if it exists
const sourcesDir = path.join(ADDON_DIR, 'sources');
if (fs.existsSync(sourcesDir)) {
  const destSourcesDir = path.join(TEMP_DIR, 'sources');
  fs.mkdirSync(destSourcesDir, { recursive: true });
  fs.readdirSync(sourcesDir)
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
      fs.copyFileSync(
        path.join(sourcesDir, file),
        path.join(destSourcesDir, file)
      );
    });
}

// Copy utils directory if it exists
const utilsDir = path.join(ADDON_DIR, 'utils');
if (fs.existsSync(utilsDir)) {
  const destUtilsDir = path.join(TEMP_DIR, 'utils');
  fs.mkdirSync(destUtilsDir, { recursive: true });
  fs.readdirSync(utilsDir)
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
      fs.copyFileSync(
        path.join(utilsDir, file),
        path.join(destUtilsDir, file)
      );
    });
}

// Copy icons directory if it exists (only image files)
const iconsDir = path.join(ADDON_DIR, 'icons');
if (fs.existsSync(iconsDir)) {
  const iconFiles = fs.readdirSync(iconsDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.svg'].includes(ext);
  });
  
  if (iconFiles.length > 0) {
    const destIconsDir = path.join(TEMP_DIR, 'icons');
    fs.mkdirSync(destIconsDir, { recursive: true });
    iconFiles.forEach(file => {
      fs.copyFileSync(
        path.join(iconsDir, file),
        path.join(destIconsDir, file)
      );
    });
  }
}

// Create XPI (ZIP file)
console.log('Creating XPI archive...');
try {
  // Try to use zip command if available (use store method for compatibility)
  execSync(`cd "${TEMP_DIR}" && zip -r "${XPI_PATH}" . -q -0`, {
    stdio: 'inherit'
  });
} catch (error) {
  // Fallback to Node.js zip library if zip command is not available
  console.log('zip command not found, trying Node.js alternative...');
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFolder(TEMP_DIR);
    zip.writeZip(XPI_PATH);
  } catch (zipError) {
    console.error('Error: Could not create ZIP file.');
    console.error('Please install zip utility or adm-zip package:');
    console.error('  npm install -g adm-zip');
    console.error('  or');
    console.error('  macOS: zip is pre-installed');
    console.error('  Linux: sudo apt-get install zip');
    cleanup();
    process.exit(1);
  }
}

// Get file size
const stats = fs.statSync(XPI_PATH);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log(`✓ XPI built successfully: ${XPI_PATH}`);
console.log(`  File size: ${fileSizeMB} MB`);

cleanup();
