#!/usr/bin/env python3
"""
Python-based XPI builder for maximum LibreWolf/Firefox compatibility
"""

import os
import json
import zipfile
import shutil
import tempfile
from pathlib import Path

ADDON_DIR = Path(__file__).parent
OUTPUT_DIR = ADDON_DIR / "dist"
XPI_NAME = "hrscrape2mart.xpi"
XPI_PATH = OUTPUT_DIR / XPI_NAME

FILES_TO_INCLUDE = [
    "manifest.json",
    "background.js",
    "content-autofill.js",
    "content-list.js",
    "content-job.js",
    "popup.html",
    "popup.js"
]

def build_xpi():
    print("Building Firefox/LibreWolf addon XPI (Python version)...")
    print()
    
    # Create dist directory
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Remove old XPI
    if XPI_PATH.exists():
        XPI_PATH.unlink()
        print("Removed old XPI file")
    
    # Validate manifest.json first
    manifest_path = ADDON_DIR / "manifest.json"
    if not manifest_path.exists():
        print("ERROR: manifest.json not found!")
        return False
    
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        print("✓ manifest.json is valid JSON")
    except json.JSONDecodeError as e:
        print(f"ERROR: manifest.json is not valid JSON: {e}")
        return False
    
    # Create XPI using Python zipfile (most compatible)
    print("Creating XPI archive...")
    
    with zipfile.ZipFile(XPI_PATH, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        # Add all required files
        for file_name in FILES_TO_INCLUDE:
            file_path = ADDON_DIR / file_name
            if file_path.exists():
                # Read file content to ensure it's valid
                with open(file_path, 'rb') as f:
                    content = f.read()
                
                # Write to ZIP with explicit mode (Unix)
                zf.writestr(file_name, content)
                print(f"  ✓ {file_name} ({len(content)} bytes)")
            else:
                print(f"  ✗ ERROR: {file_name} not found!")
                return False

        # Add sources/*.js if present
        sources_dir = ADDON_DIR / "sources"
        if sources_dir.exists():
            for source_file in sorted(sources_dir.glob("*.js")):
                with open(source_file, 'rb') as f:
                    content = f.read()
                source_path = f"sources/{source_file.name}"
                zf.writestr(source_path, content)
                print(f"  ✓ {source_path} ({len(content)} bytes)")

        # Add utils/*.js if present
        utils_dir = ADDON_DIR / "utils"
        if utils_dir.exists():
            for util_file in sorted(utils_dir.glob("*.js")):
                with open(util_file, 'rb') as f:
                    content = f.read()
                util_path = f"utils/{util_file.name}"
                zf.writestr(util_path, content)
                print(f"  ✓ {util_path} ({len(content)} bytes)")
        
        # Add icons if they exist
        icons_dir = ADDON_DIR / "icons"
        if icons_dir.exists():
            icon_files = list(icons_dir.glob("*.png")) + list(icons_dir.glob("*.jpg")) + list(icons_dir.glob("*.svg"))
            if icon_files:
                for icon_file in icon_files:
                    with open(icon_file, 'rb') as f:
                        content = f.read()
                    icon_path = f"icons/{icon_file.name}"
                    zf.writestr(icon_path, content)
                    print(f"  ✓ {icon_path} ({len(content)} bytes)")
    
    # Verify the XPI
    print()
    print("Verifying XPI...")
    try:
        with zipfile.ZipFile(XPI_PATH, 'r') as zf:
            # Check manifest exists
            if 'manifest.json' not in zf.namelist():
                print("ERROR: manifest.json not in XPI!")
                return False
            
            # Validate manifest in XPI
            manifest_content = zf.read('manifest.json').decode('utf-8')
            json.loads(manifest_content)
            print("✓ XPI contains valid manifest.json")
            
            # List all files
            print(f"✓ XPI contains {len(zf.namelist())} files")
            for name in sorted(zf.namelist()):
                info = zf.getinfo(name)
                print(f"    {name} ({info.file_size} bytes)")
    
    except zipfile.BadZipFile:
        print("ERROR: Created XPI is corrupted!")
        return False
    except json.JSONDecodeError:
        print("ERROR: manifest.json in XPI is not valid JSON!")
        return False
    
    file_size = XPI_PATH.stat().st_size
    print()
    print(f"✅ XPI built successfully: {XPI_PATH}")
    print(f"   File size: {file_size / 1024:.1f} KB")
    print()
    print("Ready for installation in LibreWolf/Firefox!")
    
    return True

if __name__ == "__main__":
    success = build_xpi()
    exit(0 if success else 1)
