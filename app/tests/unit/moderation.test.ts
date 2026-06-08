/**
 * Unit tests for the C-103 content moderation hook (lib/moderation).
 *
 * Heavy on FALSE-POSITIVE coverage: a dev/security/research marketplace must not
 * block legitimate jobs that merely mention security/abuse topics. Plus
 * true-positive coverage for unambiguous abuse and the Tier-2 defensive
 * exemption.
 *
 * Run with:  npx tsx --test tests/unit/moderation.test.ts
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { moderateText, moderateJobContent } from "../../lib/moderation";

const ALLOWED = (t: string) => assert.equal(moderateText(t).allowed, true, `should allow: ${t}`);
const BLOCKED = (t: string) => assert.equal(moderateText(t).allowed, false, `should block: ${t}`);

describe("C-103 · allows legitimate jobs (no false positives)", () => {
  test("ordinary dev / creative / data jobs", () => {
    for (const t of [
      "Write a blog post about Solana escrow design",
      "Build a Next.js dashboard with charts",
      "Translate this README into Turkish",
      "Design a logo for a coffee brand",
      "Refactor this Rust module and add tests",
    ]) ALLOWED(t);
  });

  test("dev slang / verbs that overlap prohibited words", () => {
    for (const t of [
      "kill -9 the stuck process and restart the worker",
      "hack together a quick prototype this weekend",
      "growth hacking strategy for our SaaS",
      "we need to attack this performance bug aggressively",
      "recover access to my hacked Instagram account",
    ]) ALLOWED(t);
  });

  test("legitimate security / fraud / research work (defensive framing)", () => {
    for (const t of [
      "Build a ransomware detection tool for our SOC",
      "DDoS attack mitigation and rate-limiting service",
      "Fraud detection ML model for transactions",
      "Counterfeit currency detection research",
      "Penetration test our API and write a report",
      "Red team simulation against our staging environment",
      "Money laundering detection for AML compliance",
      "Drug discovery research data pipeline",
      "Write a thriller novel featuring a hitman",
    ]) ALLOWED(t);
  });
});

describe("C-103 · blocks unambiguous abuse (true positives)", () => {
  test("Tier 1 — always blocked", () => {
    BLOCKED("Looking for CSAM, will pay well");
    BLOCKED("create child porn images");
    BLOCKED("hire a hitman to take care of a problem");
    BLOCKED("pay someone to kill my business rival");
  });

  test("Tier 2 — blocked when soliciting (no defensive framing)", () => {
    BLOCKED("I want to buy fentanyl in bulk, ship discreetly");
    BLOCKED("need files to 3d-printed gun, untraceable firearm");
    BLOCKED("ddos for hire, take down a competitor site");
    BLOCKED("selling stolen credit cards, cvv shop access");
    BLOCKED("hack into my ex's account for me");
  });
});

describe("C-103 · Tier-2 defensive exemption", () => {
  test("the same Tier-2 term flips allow/block on defensive context", () => {
    assert.equal(moderateText("launch a ddos against their server").allowed, false);
    assert.equal(moderateText("detect and prevent a ddos against our server").allowed, true);
  });

  test("Tier 1 is NOT exempted by defensive context", () => {
    // CSAM stays blocked even with 'detection' framing — manual review only.
    assert.equal(moderateText("child porn detection classifier").allowed, false);
  });
});

describe("C-103 · moderateJobContent + env extension", () => {
  test("combines title + description + requirements", () => {
    assert.equal(
      moderateJobContent({ title: "Quick task", description: "hack into my ex's email", requirements: "" }).allowed,
      false,
    );
    assert.equal(
      moderateJobContent({ title: "Write docs", description: "API reference for the SDK", requirements: "Markdown" }).allowed,
      true,
    );
  });

  test("a clean job returns no category/reason", () => {
    const r = moderateJobContent({ title: "Build a website", description: "marketing site", requirements: "React" });
    assert.equal(r.allowed, true);
    assert.equal(r.category, undefined);
  });

  afterEach(() => delete process.env.MODERATION_EXTRA_TERMS);
  test("MODERATION_EXTRA_TERMS extends the denylist at runtime", () => {
    assert.equal(moderateText("sell widgetcoin pump scheme").allowed, true);
    process.env.MODERATION_EXTRA_TERMS = "widgetcoin pump";
    assert.equal(moderateText("sell widgetcoin pump scheme").allowed, false);
  });
});
