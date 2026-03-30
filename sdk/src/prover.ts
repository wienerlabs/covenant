import { spawn } from "child_process";

const PROVER_BINARY = process.env.COVENANT_PROVER_PATH || "covenant-prover";

/**
 * Generate a ZK word-count proof using the SP1 prover binary.
 *
 * @param text     - The full text (private witness, not revealed on-chain)
 * @param minWords - Minimum word count to prove
 * @returns Raw proof bytes as Uint8Array
 * @throws Error if proof generation fails (e.g. word count too low)
 */
export async function generateWordCountProof(
  text: string,
  minWords: number,
): Promise<Uint8Array> {
  const input = JSON.stringify({ text, min_words: minWords });

  return new Promise<Uint8Array>((resolve, reject) => {
    const child = spawn(PROVER_BINARY, [], {
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
      const proofBytes = Buffer.concat(chunks);
      if (proofBytes.length === 0) {
        reject(new Error("Proof generation returned empty output"));
        return;
      }
      resolve(new Uint8Array(proofBytes));
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
