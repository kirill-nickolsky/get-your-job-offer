import { config, requireConfig } from '../config';

let fakeMessageCounter = 1000;

export async function sendTelegramText(chatId: string, text: string): Promise<string> {
  if (config.telegramMode === 'fake') {
    fakeMessageCounter += 1;
    return String(fakeMessageCounter);
  }

  const token = requireConfig(config.telegramBotToken, 'TELEGRAM_BOT_TOKEN is required');
  const response = await fetch(config.telegramApiBaseUrl.replace(/\/+$/, '') + '/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      disable_web_page_preview: true
    })
  });

  const payload = await response.json() as { ok?: boolean; result?: { message_id?: number }; description?: string };
  if (!response.ok || payload.ok !== true || !payload.result || !payload.result.message_id) {
    throw new Error('Telegram send failed: ' + String(payload.description || response.statusText));
  }
  return String(payload.result.message_id);
}
