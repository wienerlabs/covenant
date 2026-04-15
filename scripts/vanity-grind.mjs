import { Keypair } from "@solana/web3.js";
import { writeFileSync } from "fs";

const TARGET_SUFFIX = "CVNT";
const BATCH_SIZE = 10000;
let attempts = 0;
const startTime = Date.now();

console.log(`Grinding for address ending with "${TARGET_SUFFIX}"...`);
console.log(`Using single thread (Node.js). M4 Max should find in ~5-15 min.\n`);

function tryBatch() {
  for (let i = 0; i < BATCH_SIZE; i++) {
    attempts++;
    const kp = Keypair.generate();
    const addr = kp.publicKey.toBase58();

    if (addr.endsWith(TARGET_SUFFIX)) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\nFOUND after ${attempts.toLocaleString()} attempts (${elapsed}s)!`);
      console.log(`Address: ${addr}`);

      // Save keypair
      const keypairPath = `/tmp/vanity-${TARGET_SUFFIX}.json`;
      writeFileSync(keypairPath, JSON.stringify(Array.from(kp.secretKey)));
      console.log(`Keypair saved to: ${keypairPath}`);

      return true;
    }

    if (attempts % 500000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = Math.round(attempts / (Date.now() - startTime) * 1000);
      console.log(`  ${(attempts / 1000000).toFixed(1)}M attempts | ${elapsed}s | ${rate.toLocaleString()}/sec`);
    }
  }
  return false;
}

// Run in batches to not block event loop
function run() {
  if (!tryBatch()) {
    setImmediate(run);
  }
}

run();
