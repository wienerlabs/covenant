import { spawn } from "child_process";
import * as path from "path";
import type { ProofResult } from "./types";

const DEFAULT_BINARY = path.resolve(__dirname, "..", "bin", "covenant-prover");
const PROVER_BINARY = process.env.COVENANT_PROVER_PATH || DEFAULT_BINARY;

/**
 * Generate a ZK word-count proof using the SP1 prover binary.
 *
 * @param text     - The full text (private witness, not revealed on-chain)
 * @param minWords - Minimum word count to prove
 * @returns ProofResult with proof bytes and public values bytes
 * @throws Error if proof generation fails (e.g. word count too low)
 */
export async function generateWordCountProof(
  text: string,
  minWords: number,
): Promise<ProofResult> {
  const input = JSON.stringify({ text, min_words: minWords });

  return new Promise<ProofResult>((resolve, reject) => {
    const child = spawn(PROVER_BINARY, ["--prove"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    const chunks: Buffer[] = [];
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code: number) => {
      if (code !== 0) {
        reject(
          new Error(
            `Proof generation failed (exit code ${code}): ${stderr.trim()}`,
          ),
        );
        return;
      }

      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (!raw) {
        reject(new Error("Proof generation returned empty output"));
        return;
      }

      try {
        const parsed = JSON.parse(raw) as {
          proof: string;
          public_values: string;
        };

        const proof = Uint8Array.from(Buffer.from(parsed.proof, "hex"));
        const publicValues = Uint8Array.from(
          Buffer.from(parsed.public_values, "hex"),
        );

        resolve({ proof, publicValues });
      } catch (e: any) {
        reject(new Error(`Failed to parse prover output: ${e.message}`));
      }
    });

    child.on("error", (err: Error) => {
      reject(
        new Error(
          `Failed to spawn prover binary "${PROVER_BINARY}": ${err.message}`,
        ),
      );
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
