/**
 * x402 HTTP 402 Payment Protocol — Covenant implementation.
 *
 * Real on-chain verification. A payment is valid only when an actual
 * **confirmed** Solana transaction transferred at least the required
 * amount of the required USDC mint to the creator's wallet. There are
 * no bypass tokens and no "the signature exists ⇒ valid" shortcuts.
 *
 * Roadmap coverage:
 *   - C-030: no `x402:<ts>:<wallet>` bypass, no `len>10 ⇒ valid` fallback.
 *   - C-031: assert amount ≥ required, mint == required, recipient == payTo.
 *   - C-033: validate the Payment-Signature / Payment-Required header shapes
 *            against the x402 schema; the Solana "exact" scheme is supported
 *            exactly (declared scheme/network/asset must match what we quote).
 *   - C-034: require `confirmed` commitment before granting access.
 *
 * The advertised asset is the platform's canonical USDC mint
 * (`lib/network.ts`), so a payment made with faucet/test USDC verifies
 * against the same mint the rest of the app uses.
 */

import { USDC_MINT, USDC_DECIMALS } from "./constants";
import { createFailoverConnection } from "./rpc-failover";

/** CAIP-2 network id for Solana devnet (genesis-hash prefix). */
export const SOLANA_DEVNET_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

/**
 * Canonical platform USDC mint, as base58. Single source of truth is
 * `lib/network.ts`; this re-export keeps the x402 advertised asset and
 * the rest of the app (faucet, escrow) on the same mint.
 */
export const USDC_DEVNET_MINT = USDC_MINT.toBase58();

export interface PaymentRequired {
  x402Version: number;
  error: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    maxTimeoutSeconds: number;
  }>;
}

/**
 * Build a PaymentRequired response for an agent's chat endpoint.
 */
export function buildPaymentRequired(
  agentId: string,
  agentName: string,
  pricePerPrompt: number,
  payTo: string,
): PaymentRequired {
  return {
    x402Version: 2,
    error: "Payment required to use this agent",
    resource: {
      url: `/api/hosted-agents/${agentId}/chat`,
      description: `Chat with ${agentName} — ${pricePerPrompt} USDC per prompt`,
      mimeType: "application/json",
    },
    accepts: [{
      scheme: "exact",
      network: SOLANA_DEVNET_NETWORK,
      asset: USDC_DEVNET_MINT,
      amount: String(Math.round(pricePerPrompt * 10 ** USDC_DECIMALS)),
      payTo,
      maxTimeoutSeconds: 120,
    }],
  };
}

/**
 * Encode PaymentRequired as base64 header value.
 */
export function encodePaymentRequiredHeader(pr: PaymentRequired): string {
  const json = JSON.stringify(pr);
  // Use Buffer for server-side encoding (always available in Node).
  return Buffer.from(json).toString("base64");
}

/* ------------------------------------------------------------------ */
/*  C-033 — Payment-Signature parsing + schema validation              */
/* ------------------------------------------------------------------ */

export interface ParsedPaymentSignature {
  /** The Solana transaction signature that settled the payment. */
  txSignature: string;
  /** Declared scheme (e.g. "exact"), when the client sends one. */
  scheme?: string;
  /** Declared CAIP-2 network, when the client sends one. */
  network?: string;
  /** Declared asset (mint), when the client sends one. */
  asset?: string;
}

/** Base58 alphabet (Bitcoin/Solana variant — no 0, O, I, l). */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Whether a string is structurally a Solana transaction signature: a
 * base58 string of the right length (64-byte signature ⇒ 86-88 chars).
 *
 * This alone rejects the legacy `x402:<ts>:<wallet>` token (contains
 * ":") and arbitrary short strings, before any RPC call (C-030).
 */
export function isPlausibleTxSignature(sig: unknown): sig is string {
  return (
    typeof sig === "string" &&
    sig.length >= 64 &&
    sig.length <= 90 &&
    BASE58_RE.test(sig)
  );
}

/**
 * Decode a Payment-Signature header into a JSON object. The header may
 * be raw JSON, base64-encoded JSON, URI-encoded JSON, or base64 of
 * URI-encoded JSON (the encoding the in-app client uses). Returns null
 * when no JSON object can be recovered.
 */
function decodeToJson(header: string): Record<string, unknown> | null {
  const attempts: Array<() => string> = [
    () => header,
    () => Buffer.from(header, "base64").toString("utf-8"),
    () => decodeURIComponent(header),
    () => decodeURIComponent(Buffer.from(header, "base64").toString("utf-8")),
  ];
  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try the next decoding */
    }
  }
  return null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Parse a Payment-Signature header into a normalized shape. Accepts the
 * standard x402 PaymentPayload (`{ x402Version, scheme, network, payload }`)
 * as well as the in-app envelope (`{ accepted, payload: { transaction } }`)
 * and a bare transaction signature string. Returns null when no
 * transaction signature can be extracted.
 */
export function parsePaymentSignature(
  header: string | null | undefined,
): ParsedPaymentSignature | null {
  if (typeof header !== "string" || header.trim().length === 0) return null;
  const trimmed = header.trim();

  const obj = decodeToJson(trimmed);
  if (obj) {
    const payload = (obj.payload ?? {}) as Record<string, unknown>;
    const accepted = (obj.accepted ?? {}) as Record<string, unknown>;
    const txSignature =
      str(payload.transaction) ??
      str(obj.transaction) ??
      str(payload.txHash) ??
      str(obj.txHash);
    if (!txSignature) return null;
    return {
      txSignature,
      scheme: str(obj.scheme) ?? str(accepted.scheme) ?? str(payload.scheme),
      network: str(obj.network) ?? str(accepted.network) ?? str(payload.network),
      asset: str(obj.asset) ?? str(accepted.asset) ?? str(payload.asset),
    };
  }

  // Not JSON — treat the header itself as a bare transaction signature.
  return { txSignature: trimmed };
}

export interface PaymentSchemaIssue {
  field: string;
  message: string;
}

/**
 * Validate a parsed Payment-Signature against the requirement we quoted.
 * When the client declares a scheme / network / asset, each must match
 * the advertised value exactly ("support the Solana scheme exactly",
 * C-033). Declared fields are optional so a minimal client still works,
 * but the on-chain checks downstream are not optional.
 */
export function validatePaymentSchema(
  parsed: ParsedPaymentSignature,
  accept: PaymentRequired["accepts"][number],
): PaymentSchemaIssue[] {
  const issues: PaymentSchemaIssue[] = [];
  if (parsed.scheme != null && parsed.scheme !== accept.scheme) {
    issues.push({
      field: "scheme",
      message: `unsupported payment scheme '${parsed.scheme}' (expected '${accept.scheme}')`,
    });
  }
  if (parsed.network != null && parsed.network !== accept.network) {
    issues.push({
      field: "network",
      message: `wrong network '${parsed.network}' (expected '${accept.network}')`,
    });
  }
  if (parsed.asset != null && parsed.asset !== accept.asset) {
    issues.push({
      field: "asset",
      message: `wrong asset '${parsed.asset}' (expected '${accept.asset}')`,
    });
  }
  return issues;
}

/* ------------------------------------------------------------------ */
/*  C-031 — on-chain transfer inspection                               */
/* ------------------------------------------------------------------ */

/** Minimal shape of a token balance entry from `getTransaction`. */
export interface TokenBalanceLike {
  accountIndex: number;
  mint: string;
  owner?: string | null;
  uiTokenAmount: { amount: string };
}

/** Minimal shape of the fetched transaction we need to verify a payment. */
export interface TxMetaLike {
  /** Non-null when the transaction failed on chain. */
  err: unknown | null;
  meta: {
    preTokenBalances?: TokenBalanceLike[] | null;
    postTokenBalances?: TokenBalanceLike[] | null;
  } | null;
}

interface RecipientCredit {
  amountAtomic: bigint;
  payer: string;
}

/**
 * For a given recipient owner, compute the net positive atomic amount
 * credited per mint, and a representative payer (the owner whose balance
 * of that mint decreased the most). Works off pre/post token balances so
 * it is agnostic to transfer / transferChecked / CPI shapes.
 */
export function summarizeCreditsToRecipient(
  meta: TxMetaLike["meta"],
  recipientOwner: string,
): Map<string, RecipientCredit> {
  const pre = meta?.preTokenBalances ?? [];
  const post = meta?.postTokenBalances ?? [];

  const preByIndex = new Map<number, TokenBalanceLike>();
  for (const b of pre) preByIndex.set(b.accountIndex, b);
  const postByIndex = new Map<number, TokenBalanceLike>();
  for (const b of post) postByIndex.set(b.accountIndex, b);

  // Per-mint running totals: credit to the recipient, and the largest debit.
  const credit = new Map<string, bigint>();
  const biggestDebit = new Map<string, { amount: bigint; owner: string }>();

  const indices = new Set<number>([
    ...preByIndex.keys(),
    ...postByIndex.keys(),
  ]);

  for (const idx of indices) {
    const p = postByIndex.get(idx);
    const q = preByIndex.get(idx);
    const entry = p ?? q;
    if (!entry) continue;
    const mint = entry.mint;
    const owner = p?.owner ?? q?.owner ?? "";
    const postAmount = p ? BigInt(p.uiTokenAmount.amount) : 0n;
    const preAmount = q ? BigInt(q.uiTokenAmount.amount) : 0n;
    const delta = postAmount - preAmount;

    if (delta > 0n && owner === recipientOwner) {
      credit.set(mint, (credit.get(mint) ?? 0n) + delta);
    }
    if (delta < 0n) {
      const debit = -delta;
      const cur = biggestDebit.get(mint);
      if (!cur || debit > cur.amount) {
        biggestDebit.set(mint, { amount: debit, owner });
      }
    }
  }

  const result = new Map<string, RecipientCredit>();
  for (const [mint, amountAtomic] of credit) {
    result.set(mint, {
      amountAtomic,
      payer: biggestDebit.get(mint)?.owner ?? "",
    });
  }
  return result;
}

export interface TransferRequirement {
  mint: string;
  payTo: string;
  minAmountAtomic: bigint;
}

export type TransferCheck =
  | { ok: true; amountAtomic: bigint; payer: string }
  | { ok: false; reason: string };

/**
 * Decide whether the transfers in a transaction satisfy the payment
 * requirement: the recipient received ≥ the required amount of the
 * required mint (C-031). Distinguishes wrong-recipient, wrong-mint and
 * underpayment so the caller can report a precise reason.
 */
export function verifyTransfer(
  meta: TxMetaLike["meta"],
  req: TransferRequirement,
): TransferCheck {
  const credits = summarizeCreditsToRecipient(meta, req.payTo);
  if (credits.size === 0) {
    return { ok: false, reason: "no token transfer to the creator wallet" };
  }
  const credit = credits.get(req.mint);
  if (!credit || credit.amountAtomic <= 0n) {
    return { ok: false, reason: "payment was made in the wrong mint" };
  }
  if (credit.amountAtomic < req.minAmountAtomic) {
    return {
      ok: false,
      reason: `underpayment: paid ${credit.amountAtomic} of required ${req.minAmountAtomic}`,
    };
  }
  return { ok: true, amountAtomic: credit.amountAtomic, payer: credit.payer };
}

/* ------------------------------------------------------------------ */
/*  Orchestration — verifyPayment                                      */
/* ------------------------------------------------------------------ */

export interface VerifyPaymentResult {
  valid: boolean;
  txHash: string;
  payer: string;
  /** Atomic amount actually paid, when valid. */
  amountAtomic?: string;
  /** Human-readable rejection reason, when invalid. */
  reason?: string;
}

export interface VerifyPaymentDeps {
  /**
   * Fetch a transaction by signature at `confirmed` commitment. Injected
   * in tests; defaults to a failover RPC read.
   */
  fetchTransaction?: (sig: string) => Promise<TxMetaLike | null>;
}

/**
 * Default transaction fetch: failover RPC, `confirmed` commitment (C-034).
 * A transaction that is only `processed` (could still be dropped/forked)
 * is treated as not-found and does not grant access.
 */
async function defaultFetchTransaction(sig: string): Promise<TxMetaLike | null> {
  const connection = createFailoverConnection("confirmed");
  const tx = await connection.getTransaction(sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return null;
  return {
    err: tx.meta?.err ?? null,
    meta: {
      preTokenBalances: (tx.meta?.preTokenBalances ?? null) as
        | TokenBalanceLike[]
        | null,
      postTokenBalances: (tx.meta?.postTokenBalances ?? null) as
        | TokenBalanceLike[]
        | null,
    },
  };
}

/**
 * Verify an x402 payment against the requirement we advertised.
 *
 * Returns `valid: true` only after: the header parses to a real Solana
 * signature (C-030/C-033), the declared scheme/network/asset match
 * (C-033), the transaction is found at `confirmed` commitment and did
 * not fail (C-034), and it transferred ≥ the required amount of the
 * required mint to the creator wallet (C-031).
 */
export async function verifyPayment(
  paymentSignatureHeader: string | null | undefined,
  paymentRequired: PaymentRequired,
  deps: VerifyPaymentDeps = {},
): Promise<VerifyPaymentResult> {
  const accept = paymentRequired.accepts?.[0];
  if (!accept) {
    return { valid: false, txHash: "", payer: "", reason: "no payment requirements" };
  }

  const parsed = parsePaymentSignature(paymentSignatureHeader);
  if (!parsed) {
    return {
      valid: false,
      txHash: "",
      payer: "",
      reason: "malformed Payment-Signature header",
    };
  }

  const schemaIssues = validatePaymentSchema(parsed, accept);
  if (schemaIssues.length > 0) {
    return {
      valid: false,
      txHash: parsed.txSignature,
      payer: "",
      reason: schemaIssues[0].message,
    };
  }

  // C-030: a real on-chain signature is mandatory — no bypass tokens.
  if (!isPlausibleTxSignature(parsed.txSignature)) {
    return {
      valid: false,
      txHash: parsed.txSignature,
      payer: "",
      reason: "not a valid Solana transaction signature",
    };
  }

  const fetchTransaction = deps.fetchTransaction ?? defaultFetchTransaction;
  let tx: TxMetaLike | null;
  try {
    tx = await fetchTransaction(parsed.txSignature);
  } catch (err) {
    console.error("[x402] transaction fetch failed:", err);
    return {
      valid: false,
      txHash: parsed.txSignature,
      payer: "",
      reason: "could not fetch transaction from RPC",
    };
  }

  // C-034: not found at `confirmed` ⇒ not (yet) settled ⇒ no access.
  if (!tx) {
    return {
      valid: false,
      txHash: parsed.txSignature,
      payer: "",
      reason: "transaction not found at confirmed commitment",
    };
  }
  if (tx.err) {
    return {
      valid: false,
      txHash: parsed.txSignature,
      payer: "",
      reason: "transaction failed on chain",
    };
  }

  // C-031: amount / recipient / mint.
  const check = verifyTransfer(tx.meta, {
    mint: accept.asset,
    payTo: accept.payTo,
    minAmountAtomic: BigInt(accept.amount),
  });
  if (!check.ok) {
    return {
      valid: false,
      txHash: parsed.txSignature,
      payer: "",
      reason: check.reason,
    };
  }

  return {
    valid: true,
    txHash: parsed.txSignature,
    payer: check.payer,
    amountAtomic: check.amountAtomic.toString(),
  };
}
