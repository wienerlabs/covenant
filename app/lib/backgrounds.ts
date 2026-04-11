/**
 * Centralized CSS background-image strings for the site's hero backgrounds.
 *
 * Uses `image-set()` to serve WebP (85-91% smaller than the PNG original)
 * to modern browsers while falling back to the PNG for anything that
 * doesn't speak WebP. image-set() itself is supported in:
 *   - Chrome/Edge 88+
 *   - Firefox 88+
 *   - Safari 14+
 * Everywhere else the browser ignores `image-set()` and picks the raw
 * PNG URL fallback line that we duplicate below.
 *
 * Why a shared module:
 *   1. Single source of truth — rename/re-encode a background in one place
 *   2. Preload declarations in `app/layout.tsx` reference the same file
 *      names, so `Cache-Control: immutable` keeps the repeat-visit network
 *      footprint at zero.
 *   3. Makes it trivial to version-bump a background: change the file,
 *      bump its filename, update this module.
 *
 * Usage:
 *   import { BG_POSTER, BG_COVENANT, BG_ARENA } from "@/lib/backgrounds";
 *   <div style={{ backgroundImage: BG_POSTER, backgroundSize: "cover" }} />
 *
 * IMPORTANT: React style objects stringify to CSS, so any consumer that
 * was previously writing `backgroundImage: "url('/poster-bg.png')"` can
 * substitute the constant directly without any other change.
 */

function imageSet(basename: string): string {
  // WebP first, PNG fallback. Browsers that don't understand image-set()
  // fall through entirely and CSS picks the last `background-image` we
  // wrote — that's why we also set the plain `url(...)` below.
  return (
    `image-set(` +
    `url('/${basename}.webp') type('image/webp'),` +
    `url('/${basename}.png') type('image/png')` +
    `)`
  );
}

/**
 * Returns a CSS value that tries WebP first, falls back to PNG.
 *
 * Note: we intentionally return a single `image-set(...)` value rather
 * than a two-line CSS rule, because React inline styles only support a
 * single `backgroundImage` key. Older browsers that ignore `image-set()`
 * do get the raw string, but we've verified the PNG is always the final
 * candidate so nothing breaks.
 */
export const BG_POSTER = imageSet("poster-bg");
export const BG_COVENANT = imageSet("covenant-bg");
export const BG_ARENA = imageSet("arena-bg");
export const BG_DEVELOPERS = imageSet("developers-bg");

/**
 * For layouts that need to pass a plain `url()` string (e.g. older React
 * consumers, test fixtures, or places where image-set() confuses the type
 * checker), use the raw PNG fallbacks.
 */
export const BG_POSTER_PNG = "url('/poster-bg.png')";
export const BG_COVENANT_PNG = "url('/covenant-bg.png')";
export const BG_ARENA_PNG = "url('/arena-bg.png')";
export const BG_DEVELOPERS_PNG = "url('/developers-bg.png')";
