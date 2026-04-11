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
        // Body face — Pixelify Sans via --font-pixelify.
        sans: ["var(--font-pixelify)", "Pixelify Sans", "sans-serif"],
        // Display face — PPMondwest via --font-display, used on h1-h6
        // and anything tagged `.font-display`.
        display: ["var(--font-display)", "Courier New", "monospace"],
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
