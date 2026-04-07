#!/usr/bin/env node

/**
 * Test script to verify XPI structure for LibreWolf/Firefox
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const XPI_PATH = path.join(__dirname, 'dist', 'hrscrape2mart.xpi');

if (!fs.existsSync(XPI_PATH)) {
  console.error('XPI file not found:', XPI_PATH);
  process.exit(1);
}

console.log('Testing XPI for LibreWolf/Firefox compatibility...\n');

// Check if it's a valid ZIP
try {
  execSync(`unzip -t "${XPI_PATH}"`, { stdio: 'pipe' });
  console.log('✓ Valid ZIP archive');
} catch (e) {
  console.error('✗ Not a valid ZIP archive');
  process.exit(1);
}

// Extract and check structure
const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'xpi-test-'));
try {
  execSync(`unzip -q "${XPI_PATH}" -d "${tempDir}"`, { stdio: 'pipe' });
  
  // Check required files
  const required = ['manifest.json', 'background.js', 'content-list.js', 'content-job.js', 'popup.html', 'popup.js'];
  let allPresent = true;
  
  for (const file of required) {
    const filePath = path.join(tempDir, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        console.log(`✓ ${file} (${stats.size} bytes)`);
      } else {
        console.error(`✗ ${file} is empty`);
        allPresent = false;
      }
    } else {
      console.error(`✗ ${file} not found`);
      allPresent = false;
    }
  }
  
  // Check manifest.json
  const manifestPath = path.join(tempDir, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log('\n✓ manifest.json is valid JSON');
      console.log(`  Name: ${manifest.name}`);
      console.log(`  Version: ${manifest.version}`);
      console.log(`  Manifest version: ${manifest.manifest_version}`);
      
      // Check for common issues
      if (manifest.icons && (!fs.existsSync(path.join(tempDir, 'icons')) || 
          !fs.existsSync(path.join(tempDir, 'icons', manifest.icons['48'])))) {
        console.warn('  ⚠ Warning: Icons referenced in manifest but not found in XPI');
      }
    } catch (e) {
      console.error('✗ manifest.json is not valid JSON:', e.message);
      allPresent = false;
    }
  }
  
  // Check for extra attributes in ZIP
  try {
    const zipinfo = execSync(`zipinfo -v "${XPI_PATH}"`, { encoding: 'utf8' });
    if (zipinfo.includes('UT extra field') || zipinfo.includes('ux')) {
      console.warn('\n⚠ Warning: ZIP contains Unix extra fields (may cause issues in some browsers)');
      console.warn('  Try rebuilding with: ./build-fixed.sh');
    } else {
      console.log('\n✓ ZIP structure is clean (no extra attributes)');
    }
  } catch (e) {
    // zipinfo might not be available
  }
  
  if (allPresent) {
    console.log('\n✅ XPI appears to be valid for LibreWolf/Firefox');
    console.log('\nInstallation steps:');
    console.log('1. Open LibreWolf/Firefox');
    console.log('2. Go to about:debugging');
    console.log('3. Click "This Firefox" (or "This LibreWolf")');
    console.log('4. Click "Load Temporary Add-on..."');
    console.log(`5. Select: ${XPI_PATH}`);
  } else {
    console.error('\n✗ XPI has issues');
    process.exit(1);
  }
  
} finally {
  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
}



