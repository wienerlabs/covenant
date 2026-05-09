/**
 * Unit tests for lib/validate.
 *
 * Run with:  npx tsx --test tests/unit/validate.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validate } from "../../lib/validate";

describe("validate — required + types", () => {
  test("rejects non-object body", () => {
    const r = validate(null, { x: { type: "string" } });
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.match(r.message, /JSON object/);
    }
  });

  test("flags missing required field", () => {
    const r = validate({}, { name: { type: "string", required: true } });
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.equal(r.issues.length, 1);
      assert.equal(r.issues[0].path, "name");
    }
  });

  test("accepts when required field is present", () => {
    const r = validate({ name: "alice" }, { name: { type: "string", required: true } });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.name, "alice");
  });

  test("ignores optional fields when missing", () => {
    const r = validate({}, { name: { type: "string" } });
    assert.equal(r.ok, true);
  });
});

describe("validate — string", () => {
  test("rejects non-strings", () => {
    const r = validate({ name: 42 }, { name: { type: "string", required: true } });
    assert.equal(r.ok, false);
  });

  test("enforces minLength + maxLength", () => {
    const r1 = validate(
      { name: "a" },
      { name: { type: "string", required: true, minLength: 3 } },
    );
    assert.equal(r1.ok, false);

    const r2 = validate(
      { name: "abcdef" },
      { name: { type: "string", required: true, maxLength: 3 } },
    );
    assert.equal(r2.ok, false);

    const r3 = validate(
      { name: "abcd" },
      { name: { type: "string", required: true, minLength: 3, maxLength: 5 } },
    );
    assert.equal(r3.ok, true);
  });

  test("trim option strips whitespace", () => {
    const r = validate(
      { name: "  alice  " },
      { name: { type: "string", required: true, trim: true } },
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.name, "alice");
  });

  test("custom predicate runs after type check", () => {
    const r = validate(
      { name: "alice" },
      {
        name: {
          type: "string",
          required: true,
          custom: (v) => (v as string).startsWith("b") || "must start with b",
        },
      },
    );
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.match(r.issues[0].message, /must start with b/);
    }
  });
});

describe("validate — number / integer", () => {
  test("coerces string numbers", () => {
    const r = validate({ n: "42" }, { n: { type: "number", required: true } });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.n, 42);
  });

  test("rejects NaN / Infinity", () => {
    const r1 = validate({ n: "abc" }, { n: { type: "number", required: true } });
    assert.equal(r1.ok, false);

    const r2 = validate({ n: Number.POSITIVE_INFINITY }, { n: { type: "number", required: true } });
    assert.equal(r2.ok, false);
  });

  test("integer rejects floats", () => {
    const r = validate({ n: 3.14 }, { n: { type: "integer", required: true } });
    assert.equal(r.ok, false);
  });

  test("min and max bounds", () => {
    const r1 = validate({ n: 5 }, { n: { type: "number", required: true, min: 10 } });
    assert.equal(r1.ok, false);
    const r2 = validate({ n: 50 }, { n: { type: "number", required: true, max: 10 } });
    assert.equal(r2.ok, false);
    const r3 = validate({ n: 5 }, { n: { type: "number", required: true, min: 1, max: 10 } });
    assert.equal(r3.ok, true);
  });
});

describe("validate — solanaPubkey + hexString", () => {
  test("accepts valid base58 pubkey", () => {
    const r = validate(
      { wallet: "7GpXEwNrf8BVFBGMYjuYHoSmN1FvGFQD1MTtgJk2u7fG" },
      { wallet: { type: "solanaPubkey", required: true } },
    );
    assert.equal(r.ok, true);
  });

  test("rejects malformed pubkey", () => {
    const r = validate(
      { wallet: "definitely-not-base58!!!" },
      { wallet: { type: "solanaPubkey", required: true } },
    );
    assert.equal(r.ok, false);
  });

  test("hexString matches length constraint", () => {
    const r = validate(
      { hash: "ab".repeat(32) },
      { hash: { type: "hexString", required: true, hexLength: 32 } },
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.hash, "ab".repeat(32));
  });

  test("hexString rejects wrong byte length", () => {
    const r = validate(
      { hash: "ab".repeat(20) },
      { hash: { type: "hexString", required: true, hexLength: 32 } },
    );
    assert.equal(r.ok, false);
  });

  test("hexString rejects non-hex chars", () => {
    const r = validate(
      { hash: "zzzz".repeat(16) },
      { hash: { type: "hexString", required: true } },
    );
    assert.equal(r.ok, false);
  });

  test("hexString lowercases the result", () => {
    const r = validate(
      { hash: "ABCDEF" },
      { hash: { type: "hexString", required: true } },
    );
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.data.hash, "abcdef");
  });
});

describe("validate — isoDate + boolean + enum", () => {
  test("isoDate accepts ISO 8601", () => {
    const r = validate(
      { d: "2026-12-31T00:00:00.000Z" },
      { d: { type: "isoDate", required: true } },
    );
    assert.equal(r.ok, true);
  });

  test("isoDate.future flag rejects past dates", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const r = validate(
      { d: past },
      { d: { type: "isoDate", required: true, future: true } },
    );
    assert.equal(r.ok, false);
  });

  test("boolean accepts both literal and string forms", () => {
    const r1 = validate({ x: true }, { x: { type: "boolean", required: true } });
    const r2 = validate({ x: "false" }, { x: { type: "boolean", required: true } });
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    if (r1.ok) assert.equal(r1.data.x, true);
    if (r2.ok) assert.equal(r2.data.x, false);
  });

  test("enum restricts to allowed values", () => {
    const r1 = validate(
      { c: "code_review" },
      { c: { type: "enum", required: true, values: ["text_writing", "code_review"] as const } },
    );
    assert.equal(r1.ok, true);

    const r2 = validate(
      { c: "voodoo" },
      { c: { type: "enum", required: true, values: ["text_writing", "code_review"] as const } },
    );
    assert.equal(r2.ok, false);
  });
});

describe("validate — multi-field aggregation", () => {
  test("collects multiple issues at once", () => {
    const r = validate(
      { name: 42, age: "abc" },
      {
        name: { type: "string", required: true },
        age: { type: "integer", required: true },
      },
    );
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.equal(r.issues.length, 2);
    }
  });
});
