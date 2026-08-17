/**
 * Telegram Bot API istemcisi. Sadece transport: mesaj icerigi burada uretilmez.
 *
 * fetch ve sleep disaridan enjekte edilir; testler ne aga cikar ne de bekler.
 */

/** Telegram tek mesajda en fazla 4096 karakter kabul eder. */
export const TELEGRAM_MAX_LENGTH = 4096;

const API_BASE = 'https://api.telegram.org';
const DEFAULT_MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 1000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uzun mesaji satir siniri korunarak kirpar. Her satirin HTML etiketleri
 * kendi icinde kapali oldugu icin satir basindan kesmek bicimi bozmaz.
 */
export const clampMessage = (text, maxLength = TELEGRAM_MAX_LENGTH) => {
  if (text.length <= maxLength) return text;

  const suffix = '\n…';
  const budget = maxLength - suffix.length;
  const cut = text.slice(0, budget);
  const lastNewline = cut.lastIndexOf('\n');

  return `${(lastNewline > 0 ? cut.slice(0, lastNewline) : cut).trimEnd()}${suffix}`;
};

/**
 * Token'i log/hata metinlerinden temizler. CI loglari repoya erisimi olan
 * herkese aciktir; API yanitini ham basmak token sizdirabilir.
 */
export const redact = (text, token) =>
  token ? String(text).split(token).join('***') : String(text);

const parseBody = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const retryDelayMs = (response, body, attempt) => {
  const retryAfter = body?.parameters?.retry_after ?? Number(response.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return BACKOFF_BASE_MS * 2 ** (attempt - 1);
};

/**
 * @param {string} text parse_mode=HTML mesaj govdesi
 * @param {{token: string, chatId: string}} credentials
 * @param {{fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void>,
 *   maxAttempts?: number, logger?: {warn: Function}}} deps
 * @returns {Promise<object>} Telegram `result` nesnesi
 * @throws {Error} kalici hatada veya denemeler bitince (mesaj token'dan arindirilmis)
 */
export const sendMessage = async (
  text,
  { token, chatId },
  { fetchImpl = fetch, sleepImpl = sleep, maxAttempts = DEFAULT_MAX_ATTEMPTS, logger = console } = {},
) => {
  const url = `${API_BASE}/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: clampMessage(text),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  let lastError = 'bilinmeyen hata';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await parseBody(response);
    if (response.ok && body?.ok) return body.result;

    lastError = redact(body?.description ?? `HTTP ${response.status}`, token);

    if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
      throw new Error(`Telegram gonderimi basarisiz (HTTP ${response.status}): ${lastError}`);
    }

    const waitMs = retryDelayMs(response, body, attempt);
    logger.warn?.(`Telegram ${response.status} — ${waitMs} ms sonra tekrar denenecek (${attempt}/${maxAttempts - 1}).`);
    await sleepImpl(waitMs);
  }

  throw new Error(`Telegram gonderimi basarisiz: ${lastError}`);
};
