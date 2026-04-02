"use client";

import { useState, useEffect, useCallback } from "react";
import { onConfetti } from "@/lib/confetti";
import Confetti from "./Confetti";

export default function ConfettiContainer() {
  const [trigger, setTrigger] = useState(false);

  const handleFire = useCallback(() => {
    setTrigger(false);
    // Force re-trigger on next tick
    requestAnimationFrame(() => setTrigger(true));
  }, []);

  useEffect(() => {
    const unsub = onConfetti(handleFire);
    return unsub;
  }, [handleFire]);

  return <Confetti trigger={trigger} />;
}
