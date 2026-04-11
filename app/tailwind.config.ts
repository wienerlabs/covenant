import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // --font-pixelify now maps to PPMondwest (see app/app/layout.tsx).
        // Fallback chain matches globals.css so a hydration-time swap
        // doesn't shift layouts.
        sans: ["var(--font-pixelify)", "Courier New", "monospace"],
        mono: ["var(--font-pixelify)", "Courier New", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
