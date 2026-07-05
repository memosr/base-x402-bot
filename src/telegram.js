const TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Sends a plain-text message to the configured Telegram chat via the Bot API.
 * The bot token is read from the environment and NEVER logged; error messages
 * are sanitized so the token can't leak through the request URL.
 *
 * @param {string} text - Message text (1-4096 chars).
 * @returns {Promise<void>}
 */
export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set in .env",
    );
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) {
    // Telegram error payloads ({ok:false, description}) never contain the
    // token, so surfacing the description is safe.
    const description = body?.description || `HTTP ${response.status}`;
    throw new Error(`Telegram sendMessage failed: ${description}`);
  }
}
