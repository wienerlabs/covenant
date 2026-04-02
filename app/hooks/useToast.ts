import { useState, useEffect, useCallback } from "react";
import { onToast, toast as globalToast } from "@/lib/toast";

export interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export default function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsub = onToast((event) => {
      setToasts((prev) => [...prev, event]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== event.id));
      }, 4000);
    });
    return unsub;
  }, []);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "info") => {
      globalToast(message, type);
    },
    []
  );

  return { toasts, showToast };
}
