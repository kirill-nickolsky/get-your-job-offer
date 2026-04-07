#!/bin/bash

# Comprehensive XPI debugging script

XPI_PATH="dist/hrscrape2mart.xpi"

echo "═══════════════════════════════════════════════════════════"
echo "  ДИАГНОСТИКА XPI ДЛЯ LIBREWOLF"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ ! -f "$XPI_PATH" ]; then
    echo "✗ XPI файл не найден: $XPI_PATH"
    exit 1
fi

echo "1. Базовая информация о файле:"
echo "   Размер: $(ls -lh "$XPI_PATH" | awk '{print $5}')"
echo "   Тип: $(file "$XPI_PATH")"
echo ""

echo "2. Проверка ZIP структуры:"
if unzip -t "$XPI_PATH" > /dev/null 2>&1; then
    echo "   ✓ Валидный ZIP архив"
else
    echo "   ✗ НЕ валидный ZIP архив!"
    unzip -t "$XPI_PATH"
    exit 1
fi

echo ""
echo "3. Содержимое архива:"
unzip -l "$XPI_PATH" | head -10

echo ""
echo "4. Проверка manifest.json:"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

unzip -q "$XPI_PATH" -d "$TEMP_DIR"

if [ -f "$TEMP_DIR/manifest.json" ]; then
    echo "   ✓ manifest.json найден"
    
    # Validate JSON
    if python3 -m json.tool "$TEMP_DIR/manifest.json" > /dev/null 2>&1; then
        echo "   ✓ Валидный JSON"
        
        # Check manifest content
        echo ""
        echo "   Содержимое manifest.json:"
        python3 -m json.tool "$TEMP_DIR/manifest.json" | head -20
        
        # Check for common issues
        echo ""
        echo "   Проверка на проблемы:"
        
        if grep -q "clipboardWrite" "$TEMP_DIR/manifest.json"; then
            echo "   ⚠ Найдено разрешение 'clipboardWrite' (может быть проблемой)"
        fi
        
        if grep -q "web_accessible_resources" "$TEMP_DIR/manifest.json"; then
            echo "   ⚠ Найдено 'web_accessible_resources' (может быть проблемой)"
        fi
        
    else
        echo "   ✗ НЕ валидный JSON!"
        cat "$TEMP_DIR/manifest.json"
    fi
else
    echo "   ✗ manifest.json НЕ найден!"
fi

echo ""
echo "5. Проверка всех файлов:"
for file in background.js content-list.js content-job.js popup.html popup.js; do
    if [ -f "$TEMP_DIR/$file" ]; then
        size=$(stat -f%z "$TEMP_DIR/$file" 2>/dev/null || stat -c%s "$TEMP_DIR/$file" 2>/dev/null)
        echo "   ✓ $file ($size байт)"
    else
        echo "   ✗ $file ОТСУТСТВУЕТ!"
    fi
done

echo ""
echo "6. Проверка на специальные символы в именах файлов:"
unzip -l "$XPI_PATH" | grep -E "[^[:print:]]" && echo "   ⚠ Найдены непечатаемые символы!" || echo "   ✓ Имена файлов чистые"

echo ""
echo "7. Hex dump первых байтов (должно быть 'PK'):"
hexdump -C "$XPI_PATH" | head -3

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  РЕКОМЕНДАЦИИ:"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Если XPI все еще не работает:"
echo ""
echo "1. Откройте LibreWolf"
echo "2. Нажмите F12 (консоль разработчика)"
echo "3. Перейдите на вкладку 'Console'"
echo "4. Попробуйте установить XPI"
echo "5. Скопируйте все ошибки из консоли"
echo ""
echo "Или установите напрямую через manifest.json:"
echo "  about:debugging → This LibreWolf → Load Temporary Add-on"
echo "  Выберите: $(pwd)/manifest.json"
echo ""
echo "═══════════════════════════════════════════════════════════"



