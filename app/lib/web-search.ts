/**
 * Simple web search using DuckDuckGo Instant Answer API (free, no key needed).
 * Returns top results as text for injection into agent context.
 */
export async function webSearch(query: string, maxResults = 5): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return "";

    const data = await res.json();
    const results: string[] = [];

    // Abstract (main answer)
    if (data.Abstract) {
      results.push(`Answer: ${data.Abstract}`);
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, maxResults)) {
        if (topic.Text) {
          results.push(topic.Text);
        }
      }
    }

    return results.length > 0
      ? `[Web Search Results for "${query}"]\n${results.join("\n\n")}`
      : "";
  } catch {
    return "";
  }
}
