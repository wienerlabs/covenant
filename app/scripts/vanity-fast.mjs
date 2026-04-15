import { Worker, isMainThread, parentPort } from "worker_threads";
import { Keypair } from "@solana/web3.js";
import { writeFileSync } from "fs";
import { cpus } from "os";

const TARGET = "CVNT";
const NUM_WORKERS = cpus().length; // M4 Max = 14-16 cores

if (!isMainThread) {
  // Worker thread
  let count = 0;
  while (true) {
    count++;
    const kp = Keypair.generate();
    const addr = kp.publicKey.toBase58();
    if (addr.endsWith(TARGET)) {
      parentPort.postMessage({ found: true, addr, secret: Array.from(kp.secretKey), count });
      break;
    }
    if (count % 100000 === 0) {
      parentPort.postMessage({ found: false, count });
    }
  }
} else {
  console.log(`Grinding for "${TARGET}" suffix with ${NUM_WORKERS} threads...`);
  const start = Date.now();
  let totalAttempts = 0;

  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = new Worker(new URL(import.meta.url));
    worker.on("message", (msg) => {
      if (msg.found) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`\nFOUND in ${elapsed}s! (${(totalAttempts + msg.count).toLocaleString()} total attempts)`);
        console.log(`Address: ${msg.addr}`);
        const path = `/tmp/vanity-${TARGET}.json`;
        writeFileSync(path, JSON.stringify(msg.secret));
        console.log(`Keypair: ${path}`);
        process.exit(0);
      } else {
        totalAttempts += msg.count;
        msg.count = 0; // reset for next report
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = Math.round(totalAttempts / ((Date.now() - start) / 1000));
        process.stdout.write(`\r  ${(totalAttempts/1e6).toFixed(1)}M | ${elapsed}s | ${(rate/1000).toFixed(0)}K/sec`);
      }
    });
  }
}
