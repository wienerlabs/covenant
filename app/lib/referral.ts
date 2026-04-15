export function generateReferralCode(wallet: string): string {
  // Take first 3 + last 3 chars of wallet, uppercase
  return (wallet.slice(0, 3) + wallet.slice(-3)).toUpperCase();
}
