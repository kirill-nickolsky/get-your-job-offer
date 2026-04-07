# Установка в LibreWolf

LibreWolf более строгий в проверке XPI файлов. Используйте Python-версию сборки для максимальной совместимости.

## Сборка для LibreWolf

### Рекомендуемый способ (Python):

```bash
python3 build-python.py
```

### Альтернативные способы:

```bash
# Исправленная bash версия
./build.sh

# Или через npm
npm run build
```

## Установка

1. Откройте LibreWolf
2. Перейдите в `about:debugging`
3. В левом меню выберите **"This LibreWolf"** (не "This Firefox")
4. Нажмите **"Load Temporary Add-on..."**
5. Выберите файл `dist/hrscrape2mart.xpi`

## Если все еще говорит "corrupted"

1. **Проверьте XPI:**
   ```bash
   node test-xpi.js
   ```

2. **Пересоздайте XPI с Python:**
   ```bash
   rm dist/hrscrape2mart.xpi
   python3 build-python.py
   ```

3. **Проверьте версию LibreWolf:**
   - Откройте `about:about` в LibreWolf
   - Убедитесь, что версия достаточно новая (рекомендуется последняя)

4. **Попробуйте установить через файловый менеджер:**
   - Откройте `about:addons` в LibreWolf
   - Нажмите на шестеренку (⚙️)
   - Выберите "Install Add-on From File..."
   - Выберите `dist/hrscrape2mart.xpi`

5. **Проверьте консоль LibreWolf:**
   - Откройте `about:debugging`
   - Включите "Enable add-on debugging"
   - Попробуйте установить снова
   - Проверьте консоль на ошибки (F12)

## Отладка

Если XPI все еще не устанавливается, проверьте:

```bash
# Проверка структуры
unzip -l dist/hrscrape2mart.xpi

# Проверка манифеста
unzip -p dist/hrscrape2mart.xpi manifest.json | python3 -m json.tool

# Полная валидация
./validate-xpi.sh
node test-xpi.js
```

## Альтернатива: Установка без XPI

Если XPI не работает, можно установить расширение напрямую:

1. Откройте `about:debugging`
2. Выберите "This LibreWolf"
3. Нажмите "Load Temporary Add-on..."
4. **Выберите файл `manifest.json`** (не XPI)
5. Расширение будет установлено из исходников



