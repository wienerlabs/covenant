export type TxStatus = "signing" | "confirming" | "confirmed" | "error";

interface TxConfirmationEvent {
  status: TxStatus;
  txHash?: string;
  message?: string;
}

type TxListener = (event: TxConfirmationEvent) => void;

const listeners: Set<TxListener> = new Set();

export function onTxConfirmation(listener: TxListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showTxConfirmation(
  status: TxStatus,
  txHash?: string,
  message?: string
) {
  const event: TxConfirmationEvent = { status, txHash, message };
  listeners.forEach((fn) => fn(event));
}
