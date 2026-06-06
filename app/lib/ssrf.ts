/**
 * SSRF guard (C-093).
 *
 * Blocks requests to internal / private / reserved network targets. Used
 * wherever the app stores or fetches a user-supplied URL — agent endpoint
 * registration, avatar URLs, and outbound webhook delivery.
 *
 * Two layers:
 *   - `checkUrlSync`   — pure, synchronous: protocol, embedded credentials,
 *                        and IP-literal ranges including numeric-encoded
 *                        IPv4 (e.g. http://2130706433 == 127.0.0.1) and
 *                        IPv6 forms. Safe to call on every request.
 *   - `assertPublicUrl`— the sync check PLUS a DNS resolution that requires
 *                        every resolved address to be public (defeats DNS
 *                        rebinding, where a public hostname points at a
 *                        private IP). The resolver is injectable for tests.
 */

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export interface UrlCheck {
  ok: boolean;
  reason?: string;
}

/* ------------------------------------------------------------------ */
/*  IPv4                                                               */
/* ------------------------------------------------------------------ */

/** Parse a single inet_aton part: decimal, 0x-hex, or 0-octal. */
function parsePart(s: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^0[0-7]+$/.test(s)) return parseInt(s, 8);
  if (/^[0-9]+$/.test(s)) return parseInt(s, 10);
  return null;
}

/**
 * Parse a hostname as a "loose" IPv4 the way inet_aton / browsers / curl do:
 * 1–4 dot-separated parts, each decimal / hex / octal, with the trailing
 * part absorbing the remaining bytes. Returns dotted-quad or null when the
 * host is not numeric (i.e. a real hostname).
 *
 * This catches the classic SSRF bypasses: http://2130706433,
 * http://0x7f000001, http://0177.0.0.1, http://127.1.
 */
export function parseLooseIPv4(host: string): string | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = parsePart(p);
    if (n === null || n < 0) return null;
    nums.push(n);
  }

  let value: bigint;
  const b = nums.map((n) => BigInt(n));
  switch (nums.length) {
    case 1:
      value = b[0];
      break;
    case 2:
      if (nums[0] > 0xff || nums[1] > 0xffffff) return null;
      value = (b[0] << 24n) | b[1];
      break;
    case 3:
      if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) return null;
      value = (b[0] << 24n) | (b[1] << 16n) | b[2];
      break;
    default:
      if (nums.some((n) => n > 0xff)) return null;
      value = (b[0] << 24n) | (b[1] << 16n) | (b[2] << 8n) | b[3];
  }
  if (value < 0n || value > 0xffffffffn) return null;
  const v = Number(value);
  return `${(v >>> 24) & 0xff}.${(v >>> 16) & 0xff}.${(v >>> 8) & 0xff}.${v & 0xff}`;
}

/** Whether a dotted-quad IPv4 is private / loopback / reserved / metadata. */
export function isPrivateIPv4(ip: string): boolean {
  const o = ip.split(".").map((x) => Number(x));
  if (o.length !== 4 || o.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) {
    return true; // malformed — fail closed
  }
  const [a, b, c] = o;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0/24 IETF protocol
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255
  return false;
}

/* ------------------------------------------------------------------ */
/*  IPv6                                                               */
/* ------------------------------------------------------------------ */

/** Whether an IPv6 literal is loopback / unspecified / ULA / link-local. */
export function isPrivateIPv6(ip: string): boolean {
  const h = ip.toLowerCase().split("%")[0]; // strip zone id
  if (h === "::1" || h === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // fe80::/10 link-local
  // IPv4-mapped / -embedded (::ffff:127.0.0.1, ::127.0.0.1)
  const embedded = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (embedded) return isPrivateIPv4(embedded[1]);
  return false;
}

/** Whether a raw IP literal (v4 or v6) is a blocked target. */
export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isPrivateIPv4(ip);
  if (fam === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP — fail closed
}

/* ------------------------------------------------------------------ */
/*  URL checks                                                         */
/* ------------------------------------------------------------------ */

const BLOCKED_SUFFIXES = [".local", ".localhost", ".internal"];

function hostnameOf(url: URL): string {
  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return host;
}

/**
 * Synchronous SSRF screen: protocol, embedded credentials, and IP-literal
 * ranges (including numeric-encoded IPv4 and IPv6). Does NOT resolve DNS —
 * a bare hostname that passes here must still go through `assertPublicUrl`
 * before it is trusted.
 */
export function checkUrlSync(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `blocked protocol '${url.protocol}'` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials in URL not allowed" };
  }

  const host = hostnameOf(url);
  if (!host) return { ok: false, reason: "missing host" };
  if (host === "localhost") return { ok: false, reason: "loopback host" };
  for (const suffix of BLOCKED_SUFFIXES) {
    if (host.endsWith(suffix)) return { ok: false, reason: `blocked host suffix '${suffix}'` };
  }

  const fam = isIP(host);
  if (fam === 4) {
    return isPrivateIPv4(host)
      ? { ok: false, reason: `private/reserved IPv4 ${host}` }
      : { ok: true };
  }
  if (fam === 6) {
    return isPrivateIPv6(host)
      ? { ok: false, reason: `private/reserved IPv6 ${host}` }
      : { ok: true };
  }

  // Numeric-encoded IPv4 (decimal / hex / octal) that isn't dotted-quad.
  const loose = parseLooseIPv4(host);
  if (loose) {
    return isPrivateIPv4(loose)
      ? { ok: false, reason: `private/reserved IPv4 ${loose}` }
      : { ok: true };
  }

  return { ok: true }; // real hostname — caller must DNS-check it
}

export interface SsrfDeps {
  /** Resolve a hostname to its IP addresses. Injected in tests. */
  resolve?: (host: string) => Promise<string[]>;
}

async function defaultResolve(host: string): Promise<string[]> {
  const records = await lookup(host, { all: true });
  return records.map((r) => r.address);
}

/**
 * Full SSRF guard: the synchronous screen plus a DNS resolution that
 * requires every resolved address to be public. This defeats DNS
 * rebinding, where a public hostname resolves to a private/internal IP.
 * Call this wherever a user-supplied URL enters the system.
 */
export async function assertPublicUrl(
  raw: string,
  deps: SsrfDeps = {},
): Promise<UrlCheck> {
  const sync = checkUrlSync(raw);
  if (!sync.ok) return sync;

  const url = new URL(raw);
  const host = hostnameOf(url);

  // Already an IP literal or numeric IPv4: the sync screen verified it.
  if (isIP(host) || parseLooseIPv4(host)) return { ok: true };

  let addresses: string[];
  try {
    addresses = await (deps.resolve ?? defaultResolve)(host);
  } catch {
    return { ok: false, reason: "DNS resolution failed" };
  }
  if (addresses.length === 0) {
    return { ok: false, reason: "host did not resolve" };
  }
  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      return { ok: false, reason: `host resolves to blocked address ${addr}` };
    }
  }
  return { ok: true };
}
