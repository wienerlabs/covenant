"use client";

import { useState, useEffect, useCallback } from "react";
import { onTxConfirmation, type TxStatus } from "@/lib/txConfirmation";
import TxConfirmation from "./TxConfirmation";

export default function TxConfirmationContainer() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<TxStatus>("signing");
  const [txHash, setTxHash] = useState<string | undefined>();

  useEffect(() => {
    const unsub = onTxConfirmation((event) => {
      setStatus(event.status);
      setTxHash(event.txHash);
      setVisible(true);
    });
    return unsub;
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible) return null;

  return <TxConfirmation status={status} txHash={txHash} onDismiss={handleDismiss} />;
}
