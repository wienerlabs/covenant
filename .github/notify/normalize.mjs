/**
 * GitHub push webhook yukunu (payload) normalize eder. Tamamen saf: I/O yok.
 *
 * Bildirim gonderilmeyecek durumlar null dondurur:
 *   - branch disi ref (tag vb.)
 *   - branch silme push'u (deleted: true)
 *   - commit icermeyen push (ornegin bos branch olusturma)
 */

const BRANCH_PREFIX = 'refs/heads/';
const UNKNOWN = 'unknown';

const isBranchRef = (ref) => typeof ref === 'string' && ref.startsWith(BRANCH_PREFIX);

const branchName = (ref) => ref.slice(BRANCH_PREFIX.length);

/**
 * Push'u yapan kisi. cortexgithub ile ayni alan sirasi korunur:
 * once git pusher adi, yoksa GitHub kullanici adi.
 */
const pusherName = (event) => event.pusher?.name?.trim() || event.sender?.login?.trim() || UNKNOWN;

const normalizeCommit = (commit) =>
  Object.freeze({
    sha: commit.id ?? commit.sha ?? '',
    message: commit.message ?? '',
    author: commit.author?.name?.trim() || commit.author?.username?.trim() || UNKNOWN,
  });

/**
 * @param {object} event GitHub `push` webhook yuku
 * @param {{now?: string}} options head_commit zaman damgasi yoksa kullanilacak ISO tarih
 * @returns {Readonly<object> | null} normalize push, ya da bildirilmeyecekse null
 */
export const normalizePushEvent = (event, { now = '' } = {}) => {
  if (!event || typeof event !== 'object') return null;
  if (!isBranchRef(event.ref)) return null;
  if (event.deleted === true) return null;

  const commits = Array.isArray(event.commits) ? event.commits : [];
  if (commits.length === 0) return null;

  return Object.freeze({
    repo: event.repository?.full_name ?? UNKNOWN,
    actor: pusherName(event),
    branch: branchName(event.ref),
    commits: Object.freeze(commits.map(normalizeCommit)),
    // Buyuk push'larda webhook `commits` dizisini 20 ile sinirlar; `size` varsa gercek sayidir.
    totalCommits: Number.isInteger(event.size) ? event.size : commits.length,
    compareUrl: event.compare ?? '',
    createdAt: event.head_commit?.timestamp ?? now,
  });
};
