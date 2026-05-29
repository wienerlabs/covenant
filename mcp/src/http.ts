/**
 * Minimal HTTP client for the Covenant API.
 *
 * All read tools go through here. No wallet, no signing, no SDK weight.
 * The agent can read the entire market with zero credentials.
 */

import type { CovenantMcpConfig } from "./config.js";

export class CovenantHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "CovenantHttpError";
  }
}

export class CovenantHttp {
  constructor(private readonly config: CovenantMcpConfig) {}

  async get<T = unknown>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        throw new CovenantHttpError(
          `GET ${url.pathname} failed with ${res.status}`,
          res.status,
          text.slice(0, 500),
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new CovenantHttpError(
          `GET ${url.pathname} returned non-JSON response`,
          res.status,
          text.slice(0, 500),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
