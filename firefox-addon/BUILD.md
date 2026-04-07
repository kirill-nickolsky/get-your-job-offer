# Сборка Firefox Addon

## Ручная сборка

Для создания XPI файла вручную:

```bash
./build.sh
```

XPI файл будет создан в папке `dist/hrscrape2mart.xpi`

## Автоматическая пересборка (watch mode)

Для автоматической пересборки при изменении файлов:

```bash
./watch.sh
```

Или используя npm:

```bash
npm run watch
```

Скрипт будет отслеживать изменения в файлах `.js`, `.json`, `.html` и автоматически пересобирать XPI.

## Требования для watch mode

- **macOS**: `brew install fswatch`
- **Linux**: `sudo apt-get install inotify-tools`

## Установка XPI в Firefox

1. Откройте Firefox
2. Перейдите в `about:debugging`
3. Выберите "This Firefox"
4. Нажмите "Load Temporary Add-on"
5. Выберите файл `dist/hrscrape2mart.xpi`

## Структура файлов в XPI

XPI файл содержит:
- manifest.json
- background.js
- content-list.js
- content-job.js
- popup.html
- popup.js
- icons/ (если есть)



