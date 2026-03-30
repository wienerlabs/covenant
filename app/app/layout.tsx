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
  title: "COVENANT",
  description: "Trustless job escrow on Solana.",
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
