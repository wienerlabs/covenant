/**
 * Ortam degiskenlerini okuyup dogrular. Sistemin tek sinir noktasi:
 * baska hicbir modul process.env'e bakmaz.
 *
 * Hatalar tek tek firlatilmaz — hepsi toplanip tek mesajda bildirilir,
 * boylece eksik yapilandirmayi tek seferde gorursunuz.
 */

const DEFAULT_TIMEZONE = 'Europe/Istanbul';
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_MAX_COMMITS = 10;
const MAX_COMMITS_LIMIT = 50;

/** Token/chat id hic verilmemis mi? (Actions'ta secret yoksa job'i kirmiziya dusurmeyiz.) */
export const hasCredentials = (env) =>
  Boolean(env.TELEGRAM_BOT_TOKEN?.trim()) && Boolean(env.TELEGRAM_CHAT_ID?.trim());

const readRequired = (env, key, errors) => {
  const value = env[key]?.trim() ?? '';
  if (value === '') errors.push(`${key} zorunlu ama bos.`);
  return value;
};

const readTimezone = (env, errors) => {
  const value = env.TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
  } catch {
    errors.push(`TIMEZONE gecersiz: "${value}" (ornek: Europe/Istanbul).`);
  }
  return value;
};

const readLocale = (env, errors) => {
  const value = env.LOCALE?.trim() || DEFAULT_LOCALE;
  try {
    new Intl.DateTimeFormat(value);
  } catch {
    errors.push(`LOCALE gecersiz: "${value}" (ornek: en-US).`);
  }
  return value;
};

const readMaxCommits = (env, errors) => {
  const raw = env.MAX_COMMITS_SHOWN?.trim();
  if (!raw) return DEFAULT_MAX_COMMITS;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_COMMITS_LIMIT) {
    errors.push(`MAX_COMMITS_SHOWN 1-${MAX_COMMITS_LIMIT} arasi tam sayi olmali, gelen: "${raw}".`);
    return DEFAULT_MAX_COMMITS;
  }
  return value;
};

const readBoolean = (env, key, fallback, errors) => {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  errors.push(`${key} yalnizca "true" veya "false" olabilir, gelen: "${raw}".`);
  return fallback;
};

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Readonly<{token: string, chatId: string, timezone: string, locale: string,
 *   maxCommitsShown: number, showChangesLink: boolean}>}
 * @throws {Error} tum dogrulama hatalarini tek mesajda toplayarak
 */
export const readConfig = (env) => {
  const errors = [];

  const config = Object.freeze({
    token: readRequired(env, 'TELEGRAM_BOT_TOKEN', errors),
    chatId: readRequired(env, 'TELEGRAM_CHAT_ID', errors),
    timezone: readTimezone(env, errors),
    locale: readLocale(env, errors),
    maxCommitsShown: readMaxCommits(env, errors),
    showChangesLink: readBoolean(env, 'SHOW_CHANGES_LINK', false, errors),
  });

  if (errors.length > 0) {
    throw new Error(`Yapilandirma hatali:\n- ${errors.join('\n- ')}`);
  }
  return config;
};
