export function formatAddress(address: string): string {
  if (!address || address.length < 8) return address || "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function formatAmount(amount: number, decimals = 2): string {
  return amount.toFixed(decimals);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
