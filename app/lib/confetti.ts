type ConfettiListener = () => void;

const listeners: Set<ConfettiListener> = new Set();

export function onConfetti(listener: ConfettiListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function fireConfetti() {
  listeners.forEach((fn) => fn());
}
