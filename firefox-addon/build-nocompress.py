#!/usr/bin/env python3
"""
XPI builder with NO compression (store method) for maximum compatibility
"""

import os
import json
import zipfile
import shutil
from pathlib import Path

ADDON_DIR = Path(__file__).parent
OUTPUT_DIR = ADDON_DIR / "dist"
XPI_NAME = "hrscrape2mart.xpi"
XPI_PATH = OUTPUT_DIR / XPI_NAME

FILES_TO_INCLUDE = [
    "manifest.json",
    "background.js",
    "content-list.js",
    "content-job.js",
    "popup.html",
    "popup.js"
]

def build_xpi():
    print("Building XPI with NO compression (store method)...")
    print()
    
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    if XPI_PATH.exists():
        XPI_PATH.unlink()
    
    # Validate manifest
    manifest_path = ADDON_DIR / "manifest.json"
    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    print("✓ manifest.json is valid")
    
    # Create XPI with ZIP_STORED (no compression)
    print("Creating XPI (no compression)...")
    
    with zipfile.ZipFile(XPI_PATH, 'w', zipfile.ZIP_STORED) as zf:
        for file_name in FILES_TO_INCLUDE:
            file_path = ADDON_DIR / file_name
            if file_path.exists():
                with open(file_path, 'rb') as f:
                    content = f.read()
                zf.writestr(zipfile.ZipInfo(file_name), content)
                print(f"  ✓ {file_name}")

        sources_dir = ADDON_DIR / "sources"
        if sources_dir.exists():
            for source_file in sorted(sources_dir.glob("*.js")):
                with open(source_file, 'rb') as f:
                    content = f.read()
                source_path = f"sources/{source_file.name}"
                zf.writestr(zipfile.ZipInfo(source_path), content)
                print(f"  ✓ {source_path}")

        utils_dir = ADDON_DIR / "utils"
        if utils_dir.exists():
            for util_file in sorted(utils_dir.glob("*.js")):
                with open(util_file, 'rb') as f:
                    content = f.read()
                util_path = f"utils/{util_file.name}"
                zf.writestr(zipfile.ZipInfo(util_path), content)
                print(f"  ✓ {util_path}")
    
    print()
    print(f"✅ XPI created: {XPI_PATH}")
    print(f"   Size: {XPI_PATH.stat().st_size / 1024:.1f} KB")
    return True

if __name__ == "__main__":
    build_xpi()
