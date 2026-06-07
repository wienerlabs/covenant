/**
 * C-103 — content moderation hook for job creation.
 *
 * An *enforceable, deterministic* first-line gate that rejects job postings
 * whose text clearly solicits a prohibited category from the Acceptable Use
 * Policy (`docs/ACCEPTABLE_USE.md`). Two tiers keep false positives near zero:
 *
 *   - **Tier 1 (always block):** content with no legitimate use whatsoever —
 *     child sexual abuse material, contract violence.
 *   - **Tier 2 (block unless clearly defensive/research):** drugs, weapons,
 *     cyber-attacks, fraud. These terms appear in legitimate security,
 *     detection, prevention and research work, so a Tier-2 match is allowed
 *     when the posting is framed defensively (detect / prevent / audit /
 *     research / simulation / educational / CTF / red-team …).
 *
 * This is a hook, not a perfect classifier: it catches obvious abuse cheaply
 * with zero external dependency, and the AUP + manual takedown handle the rest.
 * A higher-recall AI/vendor moderation pass can layer on top of
 * `moderateText` later without touching call sites.
 *
 * Pure + dependency-free → unit-testable and safe to import anywhere.
 */

export type ProhibitedCategory =
  | "child-sexual-abuse"
  | "violence"
  | "drugs"
  | "weapons"
  | "cyber-attack"
  | "fraud";

export interface ModerationResult {
  allowed: boolean;
  category?: ProhibitedCategory;
  /** Human-readable reason, safe to surface to the client. */
  reason?: string;
}

interface Rule {
  category: ProhibitedCategory;
  patterns: RegExp[];
}

/** No legitimate use — blocked regardless of framing. */
const TIER1: Rule[] = [
  {
    category: "child-sexual-abuse",
    patterns: [
      /\bcsam\b/i,
      /\bchild\s+(porn|pornography|sexual\s+abuse|exploitation)\b/i,
      /\b(under\s?age|minor)s?\s+(nudes?|sexual|porn)\b/i,
    ],
  },
  {
    category: "violence",
    patterns: [
      /\b(hire|need|find|looking\s+for)\s+(a\s+)?hit\s?man\b/i,
      /\b(hire|pay|find)\s+(me\s+|us\s+)?(a\s+person\s+|someone\s+)?to\s+(kill|murder|assassinate)\s+(a\s+(person|man|woman|guy|human)|someone|him|her|them|my\s+\w+)\b/i,
    ],
  },
];

/** Prohibited when soliciting, but allowed in clearly defensive/research framing. */
const TIER2: Rule[] = [
  {
    category: "drugs",
    patterns: [
      /\b(sell|buy|ship|source|deal(ing)?|traffic(king)?)\s+(me\s+|us\s+)?(of\s+)?(cocaine|heroin|meth(amphetamine)?|fentanyl|mdma)\b/i,
    ],
  },
  {
    category: "weapons",
    patterns: [
      /\b(ghost\s?gun|untraceable\s+(gun|firearm)|3d[\s-]?printed\s+(gun|firearm))\b/i,
    ],
  },
  {
    category: "cyber-attack",
    patterns: [
      /\bddos\s+(for\s?hire|a\s+(site|website|server|competitor|target))\b/i,
      /\b(launch|perform|run)\s+(a\s+)?ddos\b/i,
      /\bhack\s+(into\s+)?(someone\s?else'?s?|a\s+specific|the\s+target'?s?|my\s+ex'?s?)\s+(account|email|phone|device)\b/i,
      /\b(deploy|spread)\s+(ransomware|a\s+botnet)\s+(to|against)\b/i,
    ],
  },
  {
    category: "fraud",
    patterns: [
      /\b(stolen|cloned)\s+(credit\s?cards?|bank\s?accounts?)\b/i,
      /\b(carding|cvv\s+shop|money\s?launder(ing)?\s+service)\b/i,
      /\b(fake|forged|counterfeit)\s+(passports?|drivers?\s?licen[sc]es?)\s+(for\s+sale|service)\b/i,
    ],
  },
];

/** Defensive / research / educational framing that exempts a Tier-2 match. */
const DEFENSIVE_CONTEXT =
  /\b(detect(ion)?|prevent(ion)?|protect(ion)?|defen[sc]e|defensive|mitigat|research|educational|awareness|simulation|simulat|audit|pentest|penetration\s+test|red[\s-]?team|blue[\s-]?team|ctf|forensics?|analy[sz])/i;

/** Extra prohibited substrings from env (comma-separated), matched verbatim. */
function extraTerms(): string[] {
  return (process.env.MODERATION_EXTRA_TERMS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function blocked(category: ProhibitedCategory): ModerationResult {
  return {
    allowed: false,
    category,
    reason: `This posting was blocked by the Acceptable Use Policy (prohibited category: ${category}). See docs/ACCEPTABLE_USE.md.`,
  };
}

/** Moderate a blob of text. Returns the first prohibited match, or allowed. */
export function moderateText(text: string): ModerationResult {
  if (!text) return { allowed: true };

  for (const rule of TIER1) {
    if (rule.patterns.some((p) => p.test(text))) return blocked(rule.category);
  }

  const defensive = DEFENSIVE_CONTEXT.test(text);
  for (const rule of TIER2) {
    if (rule.patterns.some((p) => p.test(text)) && !defensive) {
      return blocked(rule.category);
    }
  }

  const lower = text.toLowerCase();
  if (extraTerms().some((t) => lower.includes(t))) return blocked("fraud");

  return { allowed: true };
}

/**
 * Moderate a job's user-supplied content (title + description + requirements).
 * Wire at job creation; reject with HTTP 400 + `result.reason` when not allowed.
 */
export function moderateJobContent(job: {
  title?: string | null;
  description?: string | null;
  requirements?: string | null;
}): ModerationResult {
  const text = [job.title, job.description, job.requirements]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join("\n");
  return moderateText(text);
}
