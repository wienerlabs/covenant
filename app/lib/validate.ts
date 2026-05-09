/**
 * Lightweight, dependency-free request validator.
 *
 * Every existing route hand-rolls its own `if (!body.x) return 400`
 * block. That's verbose, easy to forget, and produces inconsistent
 * error messages. This module gives one shared shape:
 *
 *   const v = validate(body, {
 *     posterWallet: { type: "solanaPubkey", required: true },
 *     amount:       { type: "number", required: true, min: 0.000001, max: 1_000_000 },
 *     deadline:     { type: "isoDate",   required: true, future: true },
 *     category:     { type: "enum",      values: JOB_CATEGORIES },
 *     title:        { type: "string",    maxLength: 200 },
 *   });
 *   if (!v.ok) return failFromError(v); // -> 400 invalid_input with issues[]
 *   const { posterWallet, amount, deadline, category, title } = v.data;
 *
 * Why not zod? It's a 50KB dependency for what's essentially 12
 * `if` statements, and adding a new package risks breaking the
 * Vercel install graph mid-deploy.
 */

import { PublicKey } from "@solana/web3.js";

type FieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "isoDate"
  | "solanaPubkey"
  | "hexString"
  | "enum"
  | "object"
  | "array";

interface FieldRule<T = unknown> {
  type: FieldType;
  required?: boolean;
  /** number / integer / array length lower bound (inclusive). */
  min?: number;
  /** number / integer / array length upper bound (inclusive). */
  max?: number;
  /** string upper length bound. */
  maxLength?: number;
  /** string lower length bound. */
  minLength?: number;
  /** hexString expected byte length (e.g. 32 for sha256). */
  hexLength?: number;
  /** isoDate must be in the future relative to `now`. */
  future?: boolean;
  /** enum allowed values. */
  values?: readonly T[];
  /** Custom predicate run after type checks. Return true on valid. */
  custom?: (v: T) => boolean | string;
  /** Trim whitespace before validating (string only). */
  trim?: boolean;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationOk<T> {
  ok: true;
  data: T;
}

export interface ValidationFail {
  ok: false;
  issues: ValidationIssue[];
  /** ZodError-like .issues for failFromError() compatibility. */
  message: string;
}

export type ValidationResult<T> = ValidationOk<T> | ValidationFail;

type Schema = Record<string, FieldRule>;

/**
 * Validate `input` against `schema`, returning either parsed data or
 * a list of issues. Coerces strings → numbers / dates where the
 * field type permits.
 */
export function validate<T extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  schema: Schema,
): ValidationResult<T> {
  const issues: ValidationIssue[] = [];

  if (!input || typeof input !== "object") {
    return {
      ok: false,
      issues: [{ path: "$", message: "Body must be a JSON object." }],
      message: "Body must be a JSON object.",
    };
  }

  const out: Record<string, unknown> = {};

  for (const [key, rule] of Object.entries(schema)) {
    const raw = input[key];
    const has = raw !== undefined && raw !== null && raw !== "";

    if (!has) {
      if (rule.required) {
        issues.push({ path: key, message: `${key} is required.` });
      }
      continue;
    }

    const checked = checkField(key, raw, rule, issues);
    if (checked !== undefined) out[key] = checked;
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      message: issues.map((i) => `${i.path}: ${i.message}`).join("; "),
    };
  }

  return { ok: true, data: out as T };
}

function checkField(
  path: string,
  raw: unknown,
  rule: FieldRule,
  issues: ValidationIssue[],
): unknown {
  switch (rule.type) {
    case "string": {
      if (typeof raw !== "string") {
        issues.push({ path, message: "Must be a string." });
        return undefined;
      }
      let v = rule.trim ? raw.trim() : raw;
      if (rule.minLength !== undefined && v.length < rule.minLength) {
        issues.push({ path, message: `Min length is ${rule.minLength}.` });
        return undefined;
      }
      if (rule.maxLength !== undefined && v.length > rule.maxLength) {
        issues.push({ path, message: `Max length is ${rule.maxLength}.` });
        return undefined;
      }
      if (rule.values && !(rule.values as readonly string[]).includes(v)) {
        issues.push({
          path,
          message: `Must be one of: ${(rule.values as readonly string[]).join(", ")}.`,
        });
        return undefined;
      }
      if (rule.custom) {
        const r = rule.custom(v as never);
        if (r !== true) {
          issues.push({ path, message: typeof r === "string" ? r : "Failed custom check." });
          return undefined;
        }
      }
      return v;
    }
    case "number":
    case "integer": {
      const n = typeof raw === "string" ? Number(raw) : raw;
      if (typeof n !== "number" || Number.isNaN(n) || !Number.isFinite(n)) {
        issues.push({ path, message: "Must be a finite number." });
        return undefined;
      }
      if (rule.type === "integer" && !Number.isInteger(n)) {
        issues.push({ path, message: "Must be an integer." });
        return undefined;
      }
      if (rule.min !== undefined && n < rule.min) {
        issues.push({ path, message: `Must be >= ${rule.min}.` });
        return undefined;
      }
      if (rule.max !== undefined && n > rule.max) {
        issues.push({ path, message: `Must be <= ${rule.max}.` });
        return undefined;
      }
      return n;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      issues.push({ path, message: "Must be true or false." });
      return undefined;
    }
    case "isoDate": {
      if (typeof raw !== "string") {
        issues.push({ path, message: "Must be an ISO 8601 date string." });
        return undefined;
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        issues.push({ path, message: "Not a valid date." });
        return undefined;
      }
      if (rule.future && d.getTime() <= Date.now()) {
        issues.push({ path, message: "Must be in the future." });
        return undefined;
      }
      return d.toISOString();
    }
    case "solanaPubkey": {
      if (typeof raw !== "string") {
        issues.push({ path, message: "Must be a base58 pubkey string." });
        return undefined;
      }
      try {
        new PublicKey(raw);
      } catch {
        issues.push({ path, message: "Not a valid Solana pubkey." });
        return undefined;
      }
      return raw;
    }
    case "hexString": {
      if (typeof raw !== "string") {
        issues.push({ path, message: "Must be a hex string." });
        return undefined;
      }
      if (!/^[0-9a-fA-F]+$/.test(raw)) {
        issues.push({ path, message: "Hex string contains non-hex characters." });
        return undefined;
      }
      if (rule.hexLength !== undefined && raw.length !== rule.hexLength * 2) {
        issues.push({
          path,
          message: `Hex string must encode exactly ${rule.hexLength} bytes.`,
        });
        return undefined;
      }
      return raw.toLowerCase();
    }
    case "enum": {
      if (!rule.values || !rule.values.includes(raw as never)) {
        issues.push({
          path,
          message: `Must be one of: ${(rule.values ?? []).map((x) => String(x)).join(", ")}.`,
        });
        return undefined;
      }
      return raw;
    }
    case "object": {
      if (typeof raw !== "object" || Array.isArray(raw) || raw === null) {
        issues.push({ path, message: "Must be a JSON object." });
        return undefined;
      }
      return raw;
    }
    case "array": {
      if (!Array.isArray(raw)) {
        issues.push({ path, message: "Must be an array." });
        return undefined;
      }
      if (rule.min !== undefined && raw.length < rule.min) {
        issues.push({ path, message: `Min length is ${rule.min}.` });
        return undefined;
      }
      if (rule.max !== undefined && raw.length > rule.max) {
        issues.push({ path, message: `Max length is ${rule.max}.` });
        return undefined;
      }
      return raw;
    }
  }
}

/**
 * Convenience wrapper for routes: parse JSON body + validate +
 * return parsed data or throw a Response that callers can return.
 *
 *   const v = await parseAndValidate(req, { ... });
 *   if (!v.ok) return failFromError(v);
 *   const { ... } = v.data;
 */
export async function parseAndValidate<T extends Record<string, unknown>>(
  req: Request,
  schema: Schema,
): Promise<ValidationResult<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      issues: [{ path: "$", message: "Body is not valid JSON." }],
      message: "Body is not valid JSON.",
    };
  }
  return validate<T>(body, schema);
}
