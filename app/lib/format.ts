import { USDC_DECIMALS } from "./constants";

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr || "";
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function formatUsdc(lamports: number): string {
  const value = lamports / Math.pow(10, USDC_DECIMALS);
  return value.toFixed(2);
}

export function formatDate(unix: number): string {
  const date = new Date(unix * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
