/**
 * Unit tests for lib/spec — canonical job spec hashing.
 *
 * Critical because client + server agree on the JobEscrow PDA only
 * if both compute the same SHA-256 over the same canonical bytes.
 * Any drift (key order, whitespace, missing optional handling)
 * breaks PDA derivation and the on-chain job becomes unreachable.
 *
 * Run with:  npx tsx --test tests/unit/spec.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildJobSpec, hashJobSpec, hashJobSpecBytes } from "../../lib/spec";

describe("buildJobSpec", () => {
  test("preserves required key order", () => {
    const spec = buildJobSpec({
      posterWallet: "Wallet1",
      amount: 5,
      minWords: 100,
      deadline: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const keys = Object.keys(spec);
    // Fixed prefix order — any drift would change the hash.
    assert.deepEqual(keys.slice(0, 9), [
      "posterWallet",
      "amount",
      "minWords",
      "language",
      "deadline",
      "createdAt",
      "title",
      "description",
      "requirements",
    ]);
  });

  test("defaults language to English when omitted", () => {
    const spec = buildJobSpec({
      posterWallet: "Wallet1",
      amount: 1,
      minWords: 50,
      deadline: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    assert.equal(spec.language, "English");
  });

  test("defaults missing title/description/requirements to empty string", () => {
    const spec = buildJobSpec({
      posterWallet: "Wallet1",
      amount: 1,
      minWords: 50,
      deadline: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    assert.equal(spec.title, "");
    assert.equal(spec.description, "");
    assert.equal(spec.requirements, "");
  });

  test("only spreads optional fields when truthy", () => {
    const withSrc = buildJobSpec({
      posterWallet: "W",
      amount: 1,
      minWords: 50,
      deadline: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
      sourceText: "translate this",
    });
    assert.equal(withSrc.sourceText, "translate this");
    assert.equal("repoUrl" in withSrc, false, "repoUrl should not be present when undefined");
    assert.equal("targetUrl" in withSrc, false);
    assert.equal("stylePreference" in withSrc, false);
  });
});

describe("hashJobSpec", () => {
  test("produces deterministic hex (64 chars)", async () => {
    const spec = buildJobSpec({
      posterWallet: "DeterministicWallet",
      amount: 5,
      minWords: 100,
      deadline: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const a = await hashJobSpec(spec);
    const b = await hashJobSpec(spec);
    assert.equal(a, b, "same input must hash identically");
    assert.equal(a.length, 64, "SHA-256 hex is 64 chars");
    assert.match(a, /^[0-9a-f]+$/, "lowercase hex only");
  });

  test("different specs produce different hashes", async () => {
    const a = await hashJobSpec(
      buildJobSpec({
        posterWallet: "W",
        amount: 5,
        minWords: 100,
        deadline: "2026-12-31T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
      }),
    );
    const b = await hashJobSpec(
      buildJobSpec({
        posterWallet: "W",
        amount: 6, // ← only difference
        minWords: 100,
        deadline: "2026-12-31T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
      }),
    );
    assert.notEqual(a, b);
  });

  test("createdAt drift produces a different hash", async () => {
    const a = await hashJobSpec(
      buildJobSpec({
        posterWallet: "W",
        amount: 1,
        minWords: 50,
        deadline: "2026-12-31T00:00:00.000Z",
        createdAt: "2026-05-01T10:00:00.000Z",
      }),
    );
    const b = await hashJobSpec(
      buildJobSpec({
        posterWallet: "W",
        amount: 1,
        minWords: 50,
        deadline: "2026-12-31T00:00:00.000Z",
        createdAt: "2026-05-01T10:00:01.000Z",
      }),
    );
    assert.notEqual(a, b, "1 second of createdAt drift must change the hash");
  });
});

describe("hashJobSpecBytes", () => {
  test("returns exactly 32 bytes", async () => {
    const bytes = await hashJobSpecBytes(
      buildJobSpec({
        posterWallet: "W",
        amount: 1,
        minWords: 50,
        deadline: "2026-12-31T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
      }),
    );
    assert.equal(bytes.length, 32);
    assert.ok(bytes instanceof Uint8Array);
  });

  test("byte representation matches hex hash", async () => {
    const spec = buildJobSpec({
      posterWallet: "W",
      amount: 1,
      minWords: 50,
      deadline: "2026-12-31T00:00:00.000Z",
      createdAt: "2026-05-01T00:00:00.000Z",
    });
    const hex = await hashJobSpec(spec);
    const bytes = await hashJobSpecBytes(spec);
    const reHex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    assert.equal(reHex, hex);
  });
});
