/**
 * GitHub Actions giris noktasi: push yukunu okur, mesaji kurar, Telegram'a gonderir.
 *
 * Tum I/O disaridan enjekte edilebilir; testler dosya sistemine ve aga dokunmaz.
 * Dogrudan calistirildiginda gercek bagimliliklarla kosar.
 */

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { hasCredentials, readConfig } from './config.mjs';
import { formatPush } from './format.mjs';
import { normalizePushEvent } from './normalize.mjs';
import { sendMessage } from './telegram.mjs';

/** run() sonuclari — cagirici bunlari cikis koduna cevirir. */
export const RESULT = Object.freeze({
  SENT: 'sent',
  SKIPPED_NO_CREDENTIALS: 'skipped:no-credentials',
  SKIPPED_NOT_NOTIFIABLE: 'skipped:not-notifiable',
});

const readEventPayload = async (env, readFileImpl) => {
  if (env.GITHUB_EVENT_PATH) {
    return JSON.parse(await readFileImpl(env.GITHUB_EVENT_PATH, 'utf8'));
  }
  if (env.EVENT) return JSON.parse(env.EVENT);
  throw new Error('Push yuku bulunamadi: GITHUB_EVENT_PATH veya EVENT tanimli olmali.');
};

/**
 * @param {{env?: object, readFileImpl?: Function, sendImpl?: Function,
 *   logger?: object, now?: string}} deps
 * @returns {Promise<string>} RESULT degerlerinden biri
 */
export const run = async ({
  env = process.env,
  readFileImpl = readFile,
  sendImpl = sendMessage,
  logger = console,
  now = new Date().toISOString(),
} = {}) => {
  // Secret tanimlanmamissa job'i kirmiziya dusurmeyiz: baska katkicilarin
  // push'lari hata vermesin.
  if (!hasCredentials(env)) {
    logger.log('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID tanimli degil — bildirim atlandi.');
    return RESULT.SKIPPED_NO_CREDENTIALS;
  }

  const config = readConfig(env);
  const push = normalizePushEvent(await readEventPayload(env, readFileImpl), { now });

  if (push === null) {
    logger.log('Bildirilecek bir push yok (tag, branch silme veya bos push) — atlandi.');
    return RESULT.SKIPPED_NOT_NOTIFIABLE;
  }

  const text = formatPush(push, {
    locale: config.locale,
    timezone: config.timezone,
    maxCommitsShown: config.maxCommitsShown,
    showChangesLink: config.showChangesLink,
  });

  await sendImpl(text, { token: config.token, chatId: config.chatId }, { logger });
  logger.log(`Bildirim gonderildi: ${push.repo}@${push.branch} (${push.totalCommits} commit).`);
  return RESULT.SENT;
};

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    await run();
  } catch (error) {
    // Hata mesaji telegram.mjs tarafinda token'dan arindirilmis olarak gelir.
    console.error(error.message);
    process.exitCode = 1;
  }
}
