#!/bin/bash

# Watch script that rebuilds XPI on file changes

ADDON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_SCRIPT="$ADDON_DIR/build.sh"

# Check if inotifywait (Linux) or fswatch (macOS) is available
if command -v fswatch &> /dev/null; then
    echo "Watching for changes (using fswatch)..."
    echo "Press Ctrl+C to stop"
    
    # Initial build
    bash "$BUILD_SCRIPT"
    
    # Watch for changes
    fswatch -o "$ADDON_DIR" \
        --exclude='.*' \
        --include='\.(js|json|html)$' \
        --include='manifest\.json' \
        --exclude='dist/' \
        --exclude='node_modules/' \
        --exclude='\.git/' | while read f; do
        echo ""
        echo "Change detected, rebuilding..."
        bash "$BUILD_SCRIPT"
    done
    
elif command -v inotifywait &> /dev/null; then
    echo "Watching for changes (using inotifywait)..."
    echo "Press Ctrl+C to stop"
    
    # Initial build
    bash "$BUILD_SCRIPT"
    
    # Watch for changes
    inotifywait -m -r -e modify,create,delete "$ADDON_DIR" --format '%w%f' --exclude '\.(xpi|log)$' | while read file; do
        if [[ "$file" =~ \.(js|json|html|css)$ ]] || [[ "$file" == *"manifest.json" ]]; then
            echo ""
            echo "Change detected in $file, rebuilding..."
            bash "$BUILD_SCRIPT"
        fi
    done
    
else
    echo "Error: Neither fswatch (macOS) nor inotifywait (Linux) is installed."
    echo "Please install one of them:"
    echo "  macOS: brew install fswatch"
    echo "  Linux: sudo apt-get install inotify-tools"
    exit 1
fi

