/**
 * Normalize push nesnesini Telegram HTML mesajina cevirir. Tamamen saf fonksiyonlar.
 *
 * Hedef bicim:
 *
 *   Push to wienerlabs/covenant
 *
 *   Author: MuhammedAkinci
 *   Branch: main
 *   Commits: 1 commit
 *
 *   e234e96  fix(api): handle empty payload  (MuhammedAkinci)
 *
 *   Time: Jul 21, 2026, 3:06 PM
 *
 * Not: takma ad (alias) kullanilmaz — push'u kim attiysa adi oldugu gibi yazilir.
 * "View changes" linki varsayilan olarak KAPALI; Telegram ciplak URL'leri otomatik
 * tiklanabilir yaptigi icin commit mesajlarindaki URL'ler de temizlenir.
 */

const SHA_LENGTH = 7;
const MESSAGE_MAX_LENGTH = 100;
const SEP = '  '; // iki bosluklu ayirici
const URL_PLACEHOLDER = '[link]';
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;' });

export const escapeHtml = (value) => String(value).replace(/[&<>]/g, (char) => HTML_ESCAPES[char]);

export const shortSha = (sha) => String(sha).slice(0, SHA_LENGTH);

export const firstLine = (message) => String(message).split('\n')[0].trim();

export const truncate = (text, maxLength = MESSAGE_MAX_LENGTH) =>
  text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;

/** Telegram ciplak URL'leri otomatik linkler; commit mesajindakileri temizle. */
export const stripUrls = (text) => String(text).replace(URL_PATTERN, URL_PLACEHOLDER);

/** "Jul 21, 2026, 3:06 PM" — ICU surum farklarindan etkilenmemesi icin parca parca kurulur. */
export const formatTime = (isoDate, { locale = 'en-US', timezone = 'UTC' } = {}) => {
  if (typeof isoDate !== 'string' || isoDate === '') return 'unknown';

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'unknown';

  const parts = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone,
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('month')} ${get('day')}, ${get('year')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
};

const pluralizeCommits = (count) => `${count} ${count === 1 ? 'commit' : 'commits'}`;

const formatCommitLine = (commit) => {
  const sha = `<code>${escapeHtml(shortSha(commit.sha))}</code>`;
  const message = escapeHtml(truncate(stripUrls(firstLine(commit.message))));
  return `${sha}${SEP}${message}${SEP}(${escapeHtml(commit.author)})`;
};

const formatCommitBlock = (push, maxCommitsShown) => {
  const shown = push.commits.slice(-maxCommitsShown);
  const lines = shown.map(formatCommitLine);

  const hidden = push.totalCommits - shown.length;
  if (hidden > 0) lines.push(`…and ${pluralizeCommits(hidden)} more`);

  return lines.join('\n');
};

/**
 * @param {Readonly<object>} push normalizePushEvent ciktisi
 * @param {{locale?: string, timezone?: string, maxCommitsShown?: number,
 *   showChangesLink?: boolean}} options
 * @returns {string} Telegram parse_mode=HTML mesaji
 */
export const formatPush = (
  push,
  { locale = 'en-US', timezone = 'UTC', maxCommitsShown = 10, showChangesLink = false } = {},
) =>
  [
    `<b>Push to ${escapeHtml(push.repo)}</b>`,
    '',
    `Author: ${escapeHtml(push.actor)}`,
    `Branch: ${escapeHtml(push.branch)}`,
    `Commits: ${pluralizeCommits(push.totalCommits)}`,
    '',
    formatCommitBlock(push, maxCommitsShown),
    '',
    ...(showChangesLink ? [`<a href="${escapeHtml(push.compareUrl)}">View changes</a>`] : []),
    `Time: ${formatTime(push.createdAt, { locale, timezone })}`,
  ].join('\n');
