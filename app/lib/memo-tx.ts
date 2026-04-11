import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { MEMO_PROGRAM_ID, DEVNET_ENDPOINT } from "./constants";

/**
 * Build an unsigned memo transaction for a wallet to sign.
 *
 * Used for delivery commitments and any other audit-trail signing path
 * where we want the user's wallet to pop up and prove their consent
 * without moving any tokens. The tx contains a single SPL Memo
 * instruction carrying the supplied UTF-8 message; the tx is otherwise
 * empty (no transfers, no program calls).
 *
 * Fee: ~5000 lamports, paid by the signer.
 */
export async function buildMemoTransaction(
  walletAddress: string,
  memo: string,
): Promise<Transaction> {
  const connection = new Connection(DEVNET_ENDPOINT, "confirmed");
  const wallet = new PublicKey(walletAddress);

  const memoIx = new TransactionInstruction({
    keys: [{ pubkey: wallet, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });

  const tx = new Transaction().add(memoIx);
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = wallet;

  return tx;
}
