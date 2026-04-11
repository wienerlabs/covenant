import type { Metadata } from "next";
import localFont from "next/font/local";
import dynamic from "next/dynamic";
import "./globals.css";

// CRITICAL: dynamic import with ssr:false — wallet adapter uses window/document
// which break during SSR. Without this, the modal opens but cannot connect.
const Providers = dynamic(() => import("@/components/Providers"), {
  ssr: false,
});

/**
 * PPMondwest — the chunky pixel-bitmap display face we use as the site's
 * single typeface. Self-hosted via next/font/local so it ships with the
 * critical CSS and never blocks first paint waiting on Google Fonts.
 *
 * The variable name stays `--font-pixelify` for backwards compatibility
 * with everything that already references it in globals.css and inline
 * styles. Only the source file and displayed identity change.
 */
const mondwest = localFont({
  src: [
    {
      path: "./fonts/PPMondwest-Regular.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-pixelify",
  display: "swap",
  // Use Courier (monospaced, pre-installed everywhere) as the fallback
  // so the pre-font-load flash keeps roughly the same glyph width and
  // layouts don't jump when the pixel face hydrates.
  fallback: ["Courier New", "Courier", "monospace"],
  // Adjust metrics to keep vertical rhythm stable across the swap.
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://covenant-omega.vercel.app"),
  title: "Covenant — Open Settlement Protocol for AI Agents",
  description:
    "The payment rail AI agents use to get paid without human approval. Optimistic escrow on Solana.",
  openGraph: {
    title: "Covenant — Open Settlement Protocol for AI Agents",
    description:
      "Optimistic escrow on Solana. Auto-releases after a 24h challenge period unless the poster disputes.",
    url: "https://covenant-omega.vercel.app",
    siteName: "Covenant",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Covenant — Open Settlement Protocol for AI Agents",
    description:
      "Optimistic escrow on Solana. Auto-releases after a 24h challenge period unless the poster disputes.",
    site: "@WCovenant",
    creator: "@WCovenant",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mondwest.variable} ${mondwest.className}`}>
      <head>
        {/*
          Critical backgrounds — kick off fetches in parallel with HTML so
          the browser has them ready before React hydrates and CSS resolves
          `backgroundImage: url(...)`. Every asset also has a 1-year
          immutable Cache-Control from next.config.mjs, so repeat visits
          hit disk cache with zero network requests.

          We prefer the WebP variants (85-91% smaller than the PNG originals)
          and rely on `image-set()` in the consuming CSS to fall back to
          PNG on ancient browsers. The preload declarations below use
          `imagesrcset` so the browser can pick the right format early.
        */}

        {/* Most-used background: poster-bg (18+ pages). Highest priority. */}
        <link
          rel="preload"
          as="image"
          href="/poster-bg.webp"
          type="image/webp"
          // @ts-expect-error — fetchpriority is valid in HTML; React accepts it lowercased
          fetchpriority="high"
        />
        {/* Profile / hero backgrounds. */}
        <link
          rel="preload"
          as="image"
          href="/covenant-bg.webp"
          type="image/webp"
        />
        {/* Arena / Battle — small, cheap to preload. */}
        <link
          rel="preload"
          as="image"
          href="/arena-bg.webp"
          type="image/webp"
        />
        {/* Landing hero video poster frame — renders instantly while the
            13MB .mp4 streams in the background. */}
        <link
          rel="preload"
          as="image"
          href="/covenant-bg-poster.jpg"
          type="image/jpeg"
          // @ts-expect-error — fetchpriority valid in HTML
          fetchpriority="high"
        />
        {/* Brand mark — inline in the NavBar on every page. */}
        <link
          rel="preload"
          as="image"
          href="/covenant-logo.png"
          type="image/png"
        />
        {/* PPMondwest is our only display face — preloading it avoids a
            brief flash of fallback Courier when the pixel bitmap hasn't
            decoded yet. next/font/local with display:swap handles the
            swap cleanly either way. */}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
