import { Settings } from '../config.js';

export async function notify(settings: Settings, text: string): Promise<void> {
  const token = settings.secret('TELEGRAM_BOT_TOKEN', false);
  const chatId = settings.secret('TELEGRAM_CHAT_ID', false);

  if (!token || !chatId) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      console.warn(`Telegram notify failed with status ${resp.status}`);
    }
  } catch (err: any) {
    console.warn(`Telegram notify failed: ${err.message}`);
  }
}
