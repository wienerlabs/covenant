type ToastType = "success" | "error" | "info";

interface ToastEvent {
  message: string;
  type: ToastType;
  id: string;
}

type ToastListener = (event: ToastEvent) => void;

const listeners: Set<ToastListener> = new Set();

export function onToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let counter = 0;

export function toast(message: string, type: ToastType = "info") {
  const event: ToastEvent = { message, type, id: `toast-${++counter}-${Date.now()}` };
  listeners.forEach((fn) => fn(event));
}
