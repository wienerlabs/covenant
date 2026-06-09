#!/usr/bin/env node
/**
 * C-142 — verify every relative Markdown link in the docs resolves.
 *
 * Scans the top-level README, every docs/*.md, and the SDK + MCP READMEs for
 * `[text](target)` links. Relative file links must point at an existing file or
 * directory. Skipped: absolute URLs (http/https/mailto), runtime routes (links
 * starting with "/", e.g. /api/openapi), and pure "#anchor" links.
 *
 * Exit code 0 = all links resolve; 1 = at least one is broken.
 *
 *   node scripts/check-doc-links.mjs
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const docFiles = readdirSync(resolve(ROOT, "docs"))
  .filter((f) => f.endsWith(".md"))
  .map((f) => `docs/${f}`);
const FILES = ["README.md", "sdk/README.md", "mcp/README.md", ...docFiles];

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

function isExternalOrRuntime(target) {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("#") ||
    target.startsWith("/") || // runtime route (e.g. /api/openapi), not a repo file
    target.includes("://")
  );
}

let checked = 0;
const broken = [];

for (const rel of FILES) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) {
    broken.push(`${rel} — listed file does not exist`);
    continue;
  }
  const src = readFileSync(abs, "utf8");
  const baseDir = dirname(abs);
  let m;
  while ((m = LINK_RE.exec(src)) !== null) {
    let target = m[1].trim();
    if (!target || isExternalOrRuntime(target)) continue;
    // Drop a trailing #anchor and any title: [x](path "title")
    target = target.split("#")[0].split(/\s+/)[0];
    if (!target) continue;
    checked++;
    if (!existsSync(resolve(baseDir, target))) {
      broken.push(`${rel} → ${target}`);
    }
  }
}

if (broken.length > 0) {
  console.error(`✖ ${broken.length} broken doc link(s):`);
  for (const b of broken) console.error(`  ${b}`);
  process.exit(1);
}
console.log(`✓ all ${checked} relative doc links resolve (${FILES.length} files)`);
