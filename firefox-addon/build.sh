#!/bin/bash

# Fixed build script for LibreWolf/Firefox compatibility

set -e

ADDON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$ADDON_DIR/dist"
XPI_NAME="hrscrape2mart.xpi"
XPI_PATH="$OUTPUT_DIR/$XPI_NAME"

echo "Building Firefox/LibreWolf addon XPI (fixed version)..."

# Create dist directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Remove old XPI if exists
if [ -f "$XPI_PATH" ]; then
    rm "$XPI_PATH"
    echo "Removed old XPI file"
fi

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy all necessary files to temp directory
echo "Copying files..."
for file in manifest.json background.js content-autofill.js content-list.js content-job.js popup.html popup.js; do
    if [ -f "$ADDON_DIR/$file" ]; then
        cp "$ADDON_DIR/$file" "$TEMP_DIR/"
        echo "  ✓ $file"
    else
        echo "  ✗ ERROR: $file not found!"
        exit 1
    fi
done

# Copy sources directory if it exists
if [ -d "$ADDON_DIR/sources" ]; then
    mkdir -p "$TEMP_DIR/sources"
    find "$ADDON_DIR/sources" -type f -name "*.js" -exec cp {} "$TEMP_DIR/sources/" \;
    echo "  ✓ sources/"
fi

# Copy utils directory if it exists
if [ -d "$ADDON_DIR/utils" ]; then
    mkdir -p "$TEMP_DIR/utils"
    find "$ADDON_DIR/utils" -type f -name "*.js" -exec cp {} "$TEMP_DIR/utils/" \;
    echo "  ✓ utils/"
fi

# Copy icons if they exist (only actual image files)
if [ -d "$ADDON_DIR/icons" ]; then
    ICON_FILES=$(find "$ADDON_DIR/icons" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.svg" \) 2>/dev/null)
    if [ -n "$ICON_FILES" ]; then
        mkdir -p "$TEMP_DIR/icons"
        find "$ADDON_DIR/icons" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.svg" \) -exec cp {} "$TEMP_DIR/icons/" \;
        echo "  ✓ icons/"
    fi
fi

# Create XPI using proper ZIP format for Firefox/LibreWolf
# Use -X to exclude extra file attributes, -r for recursive, -9 for best compression
cd "$TEMP_DIR"

# First, ensure all files have proper permissions
chmod 644 *.js *.json *.html 2>/dev/null || true
find . -type f -exec chmod 644 {} \;

# Create ZIP with explicit options for Firefox/LibreWolf compatibility
# -X: exclude extra file attributes (macOS resource forks, Unix timestamps, etc.)
# -r: recursive
# -0: store (no compression) - better compatibility
# -q: quiet mode
zip -X -r -0 "$XPI_PATH" . -q

# Verify the ZIP
if ! unzip -t "$XPI_PATH" > /dev/null 2>&1; then
    echo "ERROR: Created XPI is corrupted!"
    exit 1
fi

# Check manifest is at root
if ! unzip -l "$XPI_PATH" | grep -q "manifest.json"; then
    echo "ERROR: manifest.json not found in XPI!"
    exit 1
fi

echo ""
echo "✓ XPI built successfully: $XPI_PATH"
echo "  File size: $(du -h "$XPI_PATH" | cut -f1)"
echo ""
echo "Contents:"
unzip -l "$XPI_PATH" | grep -E "\.(js|json|html)$|^Archive:|^Length|^---"
