import type { MetadataRoute } from "next";

/**
 * Robots policy.
 *
 * - Public marketing + dApp pages are indexable.
 * - All API routes are blocked (no point indexing JSON endpoints
 *   and the schema-drift / cold-start error pages they sometimes
 *   serve would only confuse search engines).
 * - Admin + autonomous dashboards are blocked from indexing,
 *   not because they're sensitive (auth gates them) but to keep
 *   them out of search results.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://covenant.run";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/autonomous/", "/chat/", "/job/", "/agent/"],
      },
      {
        // Be a little kinder to ai/llm crawlers — they index docs.
        userAgent: ["GPTBot", "ClaudeBot", "PerplexityBot", "Anthropic-AI"],
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
