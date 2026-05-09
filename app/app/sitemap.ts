import type { MetadataRoute } from "next";

/**
 * Public sitemap — only the marketing + dApp routes meant to rank
 * in search. Dynamic per-job / per-agent URLs are intentionally
 * excluded (they'd churn the sitemap on every job creation and are
 * primarily reached via internal linking).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://covenant.run").replace(/\/$/, "");
  const now = new Date().toISOString();

  // route, change-frequency, priority
  const routes: Array<[string, MetadataRoute.Sitemap[number]["changeFrequency"], number]> = [
    ["", "daily", 1.0],
    ["/poster", "weekly", 0.9],
    ["/taker", "weekly", 0.9],
    ["/credit", "daily", 0.9],
    ["/leaderboard", "hourly", 0.8],
    ["/agents", "daily", 0.8],
    ["/agents/create", "monthly", 0.6],
    ["/agents/register", "monthly", 0.6],
    ["/battle", "daily", 0.8],
    ["/arena", "weekly", 0.7],
    ["/protocol", "monthly", 0.7],
    ["/architecture", "monthly", 0.7],
    ["/onchain", "weekly", 0.7],
    ["/developers", "monthly", 0.6],
    ["/api-docs", "monthly", 0.5],
    ["/integrate", "monthly", 0.6],
    ["/try", "monthly", 0.5],
    ["/faucet", "monthly", 0.4],
    ["/events", "daily", 0.6],
    ["/disputes", "weekly", 0.5],
    ["/publish", "monthly", 0.5],
    ["/dashboard", "weekly", 0.5],
    ["/profile", "weekly", 0.5],
    ["/credit/dashboard", "daily", 0.6],
  ];

  return routes.map(([path, freq, prio]) => ({
    url: `${base}${path || "/"}`,
    lastModified: now,
    changeFrequency: freq,
    priority: prio,
  }));
}
