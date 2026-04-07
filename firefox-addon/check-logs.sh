#!/bin/bash

# Script to find and check LibreWolf logs

echo "Поиск логов LibreWolf..."
echo ""

# Common LibreWolf log locations
LOG_LOCATIONS=(
    "$HOME/.librewolf/profile*/console.log"
    "$HOME/.librewolf/profile*/console-*.log"
    "$HOME/.librewolf/profile*/error.log"
    "$HOME/.librewolf/profile*/browser-console.log"
    "$HOME/.cache/librewolf/*/console.log"
    "$HOME/.local/share/librewolf/profile*/console.log"
)

FOUND_LOGS=()

for pattern in "${LOG_LOCATIONS[@]}"; do
    for log in $pattern; do
        if [ -f "$log" ]; then
            FOUND_LOGS+=("$log")
        fi
    done
done

if [ ${#FOUND_LOGS[@]} -eq 0 ]; then
    echo "Логи не найдены в стандартных местах."
    echo ""
    echo "Попробуйте вручную:"
    echo "1. Откройте LibreWolf"
    echo "2. Нажмите F12 (откроется консоль разработчика)"
    echo "3. Перейдите на вкладку 'Console'"
    echo "4. Попробуйте установить XPI снова"
    echo "5. Смотрите ошибки в консоли"
    echo ""
    echo "Или проверьте:"
    echo "  ~/.librewolf/"
    echo "  ~/.cache/librewolf/"
    exit 0
fi

echo "Найдены логи:"
for log in "${FOUND_LOGS[@]}"; do
    echo "  $log"
done

echo ""
echo "Последние ошибки, связанные с addon/xpi:"
echo ""

for log in "${FOUND_LOGS[@]}"; do
    echo "=== $log ==="
    grep -i "xpi\|addon\|extension\|corrupt\|invalid\|error" "$log" | tail -20
    echo ""
done

echo ""
echo "Для просмотра всех логов:"
for log in "${FOUND_LOGS[@]}"; do
    echo "  tail -f $log"
done



