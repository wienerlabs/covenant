"use client";

import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import { DEVNET_ENDPOINT } from "./constants";

/**
 * Wallet-signing helper.
 *
 * The @solana/connector library exposes the user-facing wallet through a
 * wallet-standard Wallet object on `useConnector().selectedWallet`. That
 * object has a `features` dictionary keyed by the wallet-standard feature
 * name (e.g. "solana:signAndSendTransaction"). We call that feature
 * directly here; the library itself doesn't wrap the call for us.
 *
 * If the wallet-standard path is unavailable (older wallets or weird
 * configurations) we fall back to the injected `window.solana` provider
 * used by Phantom and most browser wallets.
 *
 * Both paths return a base58 transaction signature that the caller can
 * pass to `connection.confirmTransaction(sig)`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWallet = any;

function toBase58(bytes: Uint8Array): string {
  // Minimal base58 encoder to avoid pulling in a runtime dep for one call.
  // Works fine for 64-byte Ed25519 signatures.
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (const byte of bytes) num = (num << 8n) + BigInt(byte);
  let out = "";
  while (num > 0n) {
    const rem = Number(num % 58n);
    num = num / 58n;
    out = ALPHABET[rem] + out;
  }
  // Leading zero bytes -> leading '1's
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out || "1";
}

/**
 * Sign and send a legacy Transaction via the user's connected wallet.
 * Returns the confirmed signature (base58).
 *
 * @param selectedWallet - the wallet-standard Wallet object from useConnector()
 * @param account        - the user's public key (base58)
 * @param tx             - a recent-blockhash-set Transaction with feePayer set
 * @param connection     - optional Connection; defaults to devnet endpoint
 */
export async function signAndSendTransaction(
  selectedWallet: AnyWallet,
  account: string,
  tx: Transaction,
  connection?: Connection,
): Promise<string> {
  const rpc = connection ?? new Connection(DEVNET_ENDPOINT, "confirmed");

  // --- Path 1: wallet-standard solana:signAndSendTransaction ---
  const sasFeature =
    selectedWallet?.features?.["solana:signAndSendTransaction"];
  if (sasFeature && typeof sasFeature.signAndSendTransaction === "function") {
    const serialized = tx.serialize({ requireAllSignatures: false });
    const accountObj =
      selectedWallet.accounts?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => a.address === account,
      ) ?? selectedWallet.accounts?.[0];
    if (!accountObj) {
      throw new Error("Wallet has no accounts to sign with");
    }
    const result = await sasFeature.signAndSendTransaction({
      transaction: new Uint8Array(serialized),
      account: accountObj,
      chain: "solana:devnet",
    });
    const first = Array.isArray(result) ? result[0] : result;
    if (!first?.signature) {
      throw new Error("Wallet returned no signature");
    }
    const sig = toBase58(new Uint8Array(first.signature));
    await rpc.confirmTransaction(sig, "confirmed");
    return sig;
  }

  // --- Path 2: wallet-standard solana:signTransaction + manual submit ---
  const signFeature = selectedWallet?.features?.["solana:signTransaction"];
  if (signFeature && typeof signFeature.signTransaction === "function") {
    const serialized = tx.serialize({ requireAllSignatures: false });
    const accountObj =
      selectedWallet.accounts?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any) => a.address === account,
      ) ?? selectedWallet.accounts?.[0];
    if (!accountObj) throw new Error("Wallet has no accounts to sign with");
    const result = await signFeature.signTransaction({
      transaction: new Uint8Array(serialized),
      account: accountObj,
      chain: "solana:devnet",
    });
    const signedBytes = Array.isArray(result)
      ? result[0]?.signedTransaction
      : result?.signedTransaction;
    if (!signedBytes) throw new Error("Wallet returned no signed transaction");
    const sig = await rpc.sendRawTransaction(new Uint8Array(signedBytes), {
      skipPreflight: false,
    });
    await rpc.confirmTransaction(sig, "confirmed");
    return sig;
  }

  // --- Path 3: window.solana (Phantom injected provider fallback) ---
  if (typeof window !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const injected = (window as any).solana;
    if (injected?.signAndSendTransaction) {
      const result = await injected.signAndSendTransaction(tx);
      const sig = result?.signature ?? result;
      if (typeof sig !== "string") {
        throw new Error("Phantom returned unexpected signature shape");
      }
      await rpc.confirmTransaction(sig, "confirmed");
      return sig;
    }
    if (injected?.signTransaction) {
      const signed: Transaction = await injected.signTransaction(tx);
      const sig = await rpc.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      await rpc.confirmTransaction(sig, "confirmed");
      return sig;
    }
  }

  throw new Error(
    "Connected wallet does not expose a transaction signing feature",
  );
}

/**
 * Deserialize a base64-encoded transaction (as returned by
 * /api/escrow/build) into a Transaction object ready for signing.
 */
export function deserializeTx(base64: string): Transaction {
  const buf =
    typeof window === "undefined"
      ? Buffer.from(base64, "base64")
      : Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return Transaction.from(buf);
}

// Keeps VersionedTransaction import live for future v0 message support.
export type _VT = VersionedTransaction;
