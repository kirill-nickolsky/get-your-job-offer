#!/bin/bash

# Script to help install addon directly via manifest.json (bypassing XPI)

echo "=========================================="
echo "Установка расширения напрямую (без XPI)"
echo "=========================================="
echo ""
echo "Этот способ обходит проблему с коррумпированным XPI."
echo ""
echo "Инструкция:"
echo "1. Откройте LibreWolf"
echo "2. Перейдите в: about:debugging"
echo "3. В левом меню выберите: 'This LibreWolf'"
echo "4. Нажмите: 'Load Temporary Add-on...'"
echo "5. Выберите файл: $(pwd)/manifest.json"
echo ""
echo "Путь к manifest.json:"
echo "$(pwd)/manifest.json"
echo ""
echo "Нажмите Enter, когда будете готовы открыть файл..."
read

# Try to open file manager (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open -R manifest.json
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open . 2>/dev/null || nautilus . 2>/dev/null || echo "Откройте файловый менеджер вручную"
fi



