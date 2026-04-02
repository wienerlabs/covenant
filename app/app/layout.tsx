import type { Metadata } from "next";
import { Pixelify_Sans } from "next/font/google";
import dynamic from "next/dynamic";
import "./globals.css";

// CRITICAL: dynamic import with ssr:false — wallet adapter uses window/document
// which break during SSR. Without this, the modal opens but cannot connect.
const Providers = dynamic(() => import("@/components/Providers"), {
  ssr: false,
});

const pixelifySans = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pixelify",
});

export const metadata: Metadata = {
  title: "COVENANT — Trustless Work Delivery on Solana",
  description: "Trustless job escrow on Solana.",
  openGraph: {
    title: "COVENANT — Trustless Work Delivery on Solana",
    description: "Lock payment on-chain. Prove work with zero-knowledge proofs. Get paid automatically.",
    url: "https://covenant-omega.vercel.app",
    siteName: "COVENANT",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "COVENANT — Trustless Work Delivery on Solana",
    description: "Lock payment on-chain. Prove work with zero-knowledge proofs. Get paid automatically.",
    site: "@covenant_sol",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${pixelifySans.variable} ${pixelifySans.className}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
