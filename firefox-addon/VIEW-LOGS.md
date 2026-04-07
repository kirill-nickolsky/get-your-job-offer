# Как посмотреть логи ошибок в LibreWolf

## Способ 1: Консоль разработчика (рекомендуется)

1. Откройте LibreWolf
2. Нажмите **F12** (или `Ctrl+Shift+I` / `Cmd+Option+I`)
3. Перейдите на вкладку **"Console"**
4. Попробуйте установить XPI снова
5. Все ошибки появятся в консоли
6. Скопируйте текст ошибок

## Способ 2: Browser Console

1. Откройте LibreWolf
2. Нажмите **Ctrl+Shift+J** (или `Cmd+Shift+J` на Mac)
3. Откроется Browser Console
4. Попробуйте установить XPI
5. Смотрите ошибки

## Способ 3: about:debugging

1. Откройте `about:debugging`
2. Выберите "This LibreWolf"
3. Включите **"Enable add-on debugging"**
4. Попробуйте установить XPI
5. Смотрите сообщения на странице

## Способ 4: Файловые логи

Запустите скрипт для поиска логов:
```bash
./check-logs.sh
```

Или проверьте вручную:
```bash
# macOS/Linux
ls -la ~/.librewolf/profile*/console.log
ls -la ~/.cache/librewolf/*/console.log

# Просмотр последних ошибок
tail -100 ~/.librewolf/profile*/console.log | grep -i "xpi\|addon\|error\|corrupt"
```

## Способ 5: about:addons с включенной отладкой

1. Откройте `about:addons`
2. Нажмите на шестеренку (⚙️)
3. Включите "Debug Add-ons"
4. Попробуйте установить XPI
5. Смотрите сообщения об ошибках

## Что искать в логах

Ищите строки, содержащие:
- `corrupt`
- `invalid`
- `parse error`
- `manifest`
- `xpi`
- `addon`
- `extension`
- `permission`
- `security`

## Типичные ошибки LibreWolf

1. **"corrupted"** - может означать проблему с форматом ZIP
2. **"invalid manifest"** - проблема с JSON или обязательными полями
3. **"permission denied"** - проблема с разрешениями в манифесте
4. **"security error"** - проблема с web_accessible_resources или другими настройками безопасности

## Если нашли ошибку

Скопируйте полный текст ошибки и проверьте:
- Соответствует ли она проблемам в манифесте
- Можно ли убрать проблемное разрешение
- Нужно ли изменить структуру XPI



