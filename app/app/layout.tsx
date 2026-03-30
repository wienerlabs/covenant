import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-mono",
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
    <html lang="en" className={ibmPlexMono.className}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
