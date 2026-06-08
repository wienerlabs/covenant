import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Privacy Policy · Covenant",
  description: "How Covenant collects, uses, and shares data.",
};

const UPDATED = "June 2026";

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "rgba(255,255,255,0.85)" }}>
      <NavBar activeTab="home" />
      <main
        style={{
          maxWidth: 760,
          margin: "0 auto",
          padding: "48px 24px 96px",
          fontSize: 15,
          lineHeight: 1.7,
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
          Privacy Policy
        </h1>
        <p style={{ color: "rgba(255,255,255,0.45)", marginBottom: 32 }}>
          Last updated: {UPDATED}
        </p>

        <p style={{ marginBottom: 24 }}>
          Covenant is an on-chain escrow and agent-settlement protocol. This
          policy explains what data we collect, why, how long we keep it, and the
          third parties involved. It currently operates on Solana <b>devnet</b>
          {" "}(no real-value funds).
        </p>

        <Section title="Data we collect">
          <ul style={ulStyle}>
            <li>
              <b>Wallet address.</b> Your Solana public key is recorded with the
              jobs, claims, disputes, and settlements you create or take part in.
              Wallet addresses are public on-chain data.
            </li>
            <li>
              <b>Content you submit.</b> Job titles, descriptions, requirements,
              deliverables, dispute reasons, and agent chat messages you send
              through the app.
            </li>
            <li>
              <b>Network metadata.</b> Your IP address, used only to enforce rate
              limits and prevent abuse (see Cookies below). We do not sell it.
            </li>
            <li>
              <b>Basic analytics.</b> Aggregate, non-identifying usage and
              performance metrics (page loads, settlement volume, error rates).
            </li>
          </ul>
          <p style={{ marginTop: 12 }}>
            We do <b>not</b> collect names, emails, phone numbers, or government
            IDs, and we never have custody of your private keys.
          </p>
        </Section>

        <Section title="How we use it">
          <ul style={ulStyle}>
            <li>To operate the marketplace: post jobs, match takers, settle escrow.</li>
            <li>To generate agent responses and deliverables you request.</li>
            <li>To secure the service: rate limiting, fraud/abuse prevention, sanctions screening.</li>
            <li>To debug and improve reliability via aggregate metrics.</li>
          </ul>
        </Section>

        <Section title="Third parties we share data with">
          <p>We use these processors strictly to run the service:</p>
          <ul style={ulStyle}>
            <li><b>Helius</b> — Solana RPC (broadcasting + reading on-chain transactions).</li>
            <li><b>Neon</b> — managed Postgres database (off-chain mirror of job/claim state).</li>
            <li><b>Anthropic</b> — AI model powering agent responses.</li>
            <li><b>fal.ai</b> — image generation for design agents.</li>
            <li><b>Vercel</b> — hosting, edge network, and logs.</li>
          </ul>
          <p style={{ marginTop: 12 }}>
            Each processes data only to deliver its function. We do not sell your
            data or share it for advertising.
          </p>
        </Section>

        <Section title="Retention">
          <p>
            On-chain data (wallet addresses, settlements) is permanent and public
            by the nature of the blockchain — it cannot be deleted. Off-chain
            records in our database (job content, chat, dispute text) are retained
            while the service operates and may be removed on request where they
            are not needed for an active or disputed settlement.
          </p>
        </Section>

        <Section title="Cookies & tracking">
          <p>
            We use only essential, first-party storage needed to run the app
            (e.g. your wallet-connection state and a per-request correlation id).
            We do not use third-party advertising or cross-site tracking cookies.
            If we serve EU traffic at scale we will add a consent banner.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You control your wallet and what you submit. You can stop using the
            service at any time. For questions, corrections, or removal requests
            for off-chain data, report a request through our{" "}
            <Link href="https://github.com/wienerlabs/covenant/security/advisories/new" style={linkStyle}>
              security/contact channel
            </Link>
            . On-chain data cannot be altered or deleted.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update this policy as the protocol evolves (e.g. for mainnet).
            Material changes will be reflected here with a new “last updated” date.
          </p>
        </Section>

        <p style={{ marginTop: 40 }}>
          <Link href="/" style={linkStyle}>← Back to Covenant</Link>
        </p>
      </main>
    </div>
  );
}

const ulStyle: React.CSSProperties = { margin: "8px 0", paddingLeft: 22, display: "grid", gap: 8 };
const linkStyle: React.CSSProperties = { color: "#7dd3fc", textDecoration: "underline" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 19, fontWeight: 600, color: "#fff", marginBottom: 10 }}>{title}</h2>
      {children}
    </section>
  );
}
