#!/bin/bash

# Validation script for XPI package

XPI_PATH="$1"
if [ -z "$XPI_PATH" ]; then
    XPI_PATH="dist/hrscrape2mart.xpi"
fi

if [ ! -f "$XPI_PATH" ]; then
    echo "Error: XPI file not found: $XPI_PATH"
    exit 1
fi

echo "Validating XPI: $XPI_PATH"
echo ""

# Check if it's a valid ZIP
if ! unzip -t "$XPI_PATH" > /dev/null 2>&1; then
    echo "❌ Error: Not a valid ZIP archive"
    exit 1
fi
echo "✓ Valid ZIP archive"

# Extract and check manifest
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

unzip -q "$XPI_PATH" -d "$TEMP_DIR"

# Check manifest.json exists
if [ ! -f "$TEMP_DIR/manifest.json" ]; then
    echo "❌ Error: manifest.json not found in XPI"
    exit 1
fi
echo "✓ manifest.json found"

# Validate manifest.json is valid JSON
if ! python3 -m json.tool "$TEMP_DIR/manifest.json" > /dev/null 2>&1; then
    echo "❌ Error: manifest.json is not valid JSON"
    exit 1
fi
echo "✓ manifest.json is valid JSON"

# Check required files
REQUIRED_FILES=("background.js" "content-list.js" "content-job.js" "popup.html" "popup.js")
MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$TEMP_DIR/$file" ]; then
        MISSING_FILES+=("$file")
    fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo "❌ Error: Missing required files: ${MISSING_FILES[*]}"
    exit 1
fi
echo "✓ All required files present"

# Check file sizes (should not be empty)
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -s "$TEMP_DIR/$file" ]; then
        echo "⚠ Warning: $file is empty"
    fi
done

echo ""
echo "✅ XPI package is valid and ready for installation!"



