import crypto from "crypto";

/**
 * Computed metrics for a work delivery.
 *
 * In the pivot to optimistic settlement, we no longer verify work via ZK.
 * Instead we compute a deterministic commitment (work_hash) + objective
 * metrics (wordCount, quantityPass) that the frontend displays for context.
 * The actual "verification" is now the 24h challenge period — if the poster
 * is unhappy, they raise a dispute and an arbitrator decides.
 */
export interface WorkMetrics {
  /** Whether the computed metrics pass the minimum threshold */
  verified: boolean;
  /** Job category (text_writing, translation, code_review, etc.) */
  category: string;
  /** Word or item count depending on category */
  wordCount: number;
  /** Minimum threshold from the job spec */
  minWords: number;
  /** Hex-encoded SHA-256 of the submitted content (the on-chain work_hash) */
  workHash: string;
  /** Same as workHash, kept for backwards compat with existing UI */
  textHash: string;
  /** Same as workHash (legacy field) */
  computedHash: string;
  hashMatch: boolean;
  quantityPass: boolean;
  /** Human-readable description for UI */
  categoryProof: string;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Public metadata that gets committed to the chain via work_hash */
  publicValues: {
    minWords: number;
    workHash: string;
    category: string;
  };
}

/**
 * Compute work metrics for a delivery.
 *
 * This is NOT a ZK proof. It is a deterministic hash + metric calculation
 * that both parties can reproduce locally. The hash becomes the on-chain
 * `work_hash` in `submit_work`. The metrics are displayed in the UI as
 * context for the poster during the challenge period.
 *
 * Previously this function wrapped an SP1 zkVM circuit; after the pivot
 * to optimistic settlement it is a plain local computation.
 */
export function computeWorkMetrics(
  text: string,
  minWords: number,
  category: string = "text_writing",
): WorkMetrics {
  const startTime = performance.now();

  const workHash = crypto.createHash("sha256").update(text, "utf8").digest("hex");
  const hashMatch = true;

  let wordCount: number;
  let quantityPass: boolean;
  let categoryProof: string;

  switch (category) {
    case "data_labeling": {
      try {
        const parsed = JSON.parse(text);
        wordCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      } catch {
        wordCount = text.trim().split("\n").filter(l => l.trim()).length;
      }
      quantityPass = wordCount >= minWords;
      categoryProof = `Committed ${wordCount} labeled items >= ${minWords} minimum`;
      break;
    }
    case "translation": {
      wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      quantityPass = wordCount >= minWords;
      categoryProof = `Committed translated output with ${wordCount} words >= ${minWords} minimum`;
      break;
    }
    case "code_review": {
      wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      quantityPass = wordCount >= minWords;
      categoryProof = `Committed code review analysis with ${wordCount} words >= ${minWords} minimum`;
      break;
    }
    case "bug_bounty": {
      wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      quantityPass = wordCount >= minWords;
      categoryProof = `Committed security report with ${wordCount} words >= ${minWords} minimum`;
      break;
    }
    case "design": {
      wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      quantityPass = wordCount >= minWords;
      categoryProof = `Committed design deliverable description with ${wordCount} words >= ${minWords} minimum`;
      break;
    }
    default: { // text_writing
      wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      quantityPass = wordCount >= minWords;
      categoryProof = `Committed text output with ${wordCount} words >= ${minWords} minimum`;
      break;
    }
  }

  const verified = hashMatch && quantityPass;
  const executionTime = performance.now() - startTime;

  return {
    verified,
    category,
    wordCount,
    minWords,
    workHash,
    textHash: workHash,
    computedHash: workHash,
    hashMatch,
    quantityPass,
    categoryProof,
    executionTime: Math.round(executionTime * 100) / 100,
    publicValues: { minWords, workHash, category },
  };
}

/**
 * @deprecated use `computeWorkMetrics` — kept as an alias so existing
 * callers in the battle/arena/agent routes still compile during the
 * Phase 1 cleanup. To be removed after Phase 5 frontend rewrite.
 */
export const executeCircuit = computeWorkMetrics;

/** @deprecated use `WorkMetrics` */
export type SP1ExecutionResult = WorkMetrics;
