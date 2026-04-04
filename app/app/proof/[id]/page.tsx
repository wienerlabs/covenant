"use client";

import { useState, useEffect, useRef, use } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import { formatAddress } from "@/lib/format";
import { getCategoryById } from "@/lib/categories";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";

interface ProofData {
  job: {
    id: string;
    status: string;
    amount: number;
    paymentToken: string;
    category: string;
    minWords: number;
    posterWallet: string;
    takerWallet: string | null;
    specJson: Record<string, unknown>;
    createdAt: string;
  };
  proof: {
    wordCount: number;
    textHash: string;
    proofValid: boolean;
    submittedAt: string;
  } | null;
  transactions: Record<string, string>;
}

function SimpleQR({ text, size = 120 }: { text: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Simple visual pattern (not a real QR code, but representative)
    const cellSize = Math.floor(size / 25);
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, size, size);

    // Generate deterministic pattern from text
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }

    // Draw finder patterns (corners)
    const drawFinder = (x: number, y: number) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, cellSize * 7, cellSize * 7);
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(x + cellSize, y + cellSize, cellSize * 5, cellSize * 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + cellSize * 2, y + cellSize * 2, cellSize * 3, cellSize * 3);
    };

    drawFinder(cellSize, cellSize);
    drawFinder(size - cellSize * 8, cellSize);
    drawFinder(cellSize, size - cellSize * 8);

    // Fill data area
    ctx.fillStyle = "#ffffff";
    for (let row = 9; row < 24; row++) {
      for (let col = 9; col < 24; col++) {
        hash = ((hash << 5) - hash + row * col) | 0;
        if (Math.abs(hash) % 3 !== 0) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize - 1, cellSize - 1);
        }
      }
    }
  }, [text, size]);

  return <canvas ref={canvasRef} style={{ borderRadius: "8px", border: "1px solid rgba(255,255,255,0.15)" }} />;
}

export default function ProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ProofData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchProof() {
      try {
        const res = await fetch(`/api/proof/${id}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchProof();
  }, [id]);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  function copyLink() {
    navigator.clipboard.writeText(pageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareOnX() {
    const job = data?.job;
    const text = encodeURIComponent(
      `Job verified by COVENANT on Solana!\n\n${(job?.specJson?.title as string) || "Job"} - $${job?.amount.toFixed(2)} ${job?.paymentToken || "USDC"}\nProof: ${wordCountVerified ? "PASSED" : "FAILED"} (${data?.proof?.wordCount || 0} words)\n\n${pageUrl}`
    );
    window.open(`https://x.com/intent/tweet?text=${text}`, "_blank");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "inherit" }}>
        <div style={{ position: "fixed", inset: 0, backgroundColor: "#0a0a14" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <NavBar activeTab="proof" variant="dark" />
          <div style={{ textAlign: "center", padding: "64px", color: "rgba(255,255,255,0.4)" }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "inherit" }}>
        <div style={{ position: "fixed", inset: 0, backgroundColor: "#0a0a14" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <NavBar activeTab="proof" variant="dark" />
          <div style={{ textAlign: "center", padding: "64px", color: "rgba(255,255,255,0.4)" }}>
            Proof not found. <Link href="/proof" style={{ color: "#42BDFF" }}>Go to ZK Proof page</Link>
          </div>
        </div>
      </div>
    );
  }

  const { job, proof, transactions: txs } = data;
  const cat = getCategoryById(job.category || "text_writing");
  const wordCountVerified = proof ? proof.proofValid : false;
  const completionTx = txs.submit_completion || null;

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, backgroundColor: "#0a0a14" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="proof" variant="dark" />

        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 24px" }}>
          {/* Header badge */}
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <div style={{
              display: "inline-block",
              padding: "6px 16px",
              borderRadius: "20px",
              border: `1px solid ${wordCountVerified ? "rgba(134,239,172,0.4)" : "rgba(252,165,165,0.4)"}`,
              backgroundColor: wordCountVerified ? "rgba(134,239,172,0.1)" : "rgba(252,165,165,0.1)",
              fontSize: "10px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: wordCountVerified ? "#FFE342" : "#fca5a5",
              fontWeight: 600,
            }}>
              {wordCountVerified ? "Verified by COVENANT on Solana" : "Proof Pending"}
            </div>
          </div>

          {/* Job details */}
          <div style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "14px",
            padding: "24px",
            backgroundColor: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(12px)",
            marginBottom: "24px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff" }}>
                  {(job.specJson?.title as string) || `Job ${job.id.slice(0, 8)}`}
                </div>
                <span style={{
                  fontSize: "9px",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "rgba(255,255,255,0.6)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  textTransform: "uppercase",
                }}>
                  {cat.tag} {cat.label}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <img src={job.paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL} alt="" width={20} height={20} style={{ borderRadius: "50%" }} />
                <span style={{ fontSize: "22px", fontWeight: 700, color: "#ffffff" }}>{job.amount.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "20px", fontSize: "11px", flexWrap: "wrap" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Poster</div>
                <div style={{ color: "rgba(255,255,255,0.7)" }}>{formatAddress(job.posterWallet)}</div>
              </div>
              {job.takerWallet && (
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Worker</div>
                  <Link href={`/agent/${job.takerWallet}`} style={{ color: "#5ba4f5", textDecoration: "none" }}>
                    {formatAddress(job.takerWallet)}
                  </Link>
                </div>
              )}
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Status</div>
                <div style={{ color: job.status === "Completed" ? "#FFE342" : "#ffffff" }}>{job.status}</div>
              </div>
            </div>
          </div>

          {/* Proof details */}
          {proof && (
            <div style={{
              border: `1px solid ${wordCountVerified ? "rgba(134,239,172,0.2)" : "rgba(255,255,255,0.12)"}`,
              borderRadius: "14px",
              padding: "24px",
              backgroundColor: wordCountVerified ? "rgba(134,239,172,0.04)" : "rgba(255,255,255,0.04)",
              marginBottom: "24px",
            }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "16px" }}>
                Proof Details
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Word Count</span>
                  <span style={{ color: wordCountVerified ? "#FFE342" : "#fca5a5", fontWeight: 600 }}>
                    {proof.wordCount} / {job.minWords} min {wordCountVerified ? "\u2713" : "\u2717"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Text Hash (SHA-256)</span>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontFamily: "monospace", fontSize: "10px" }}>
                    {proof.textHash.slice(0, 20)}...
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Verified</span>
                  <span style={{ color: proof.proofValid ? "#FFE342" : "#fca5a5" }}>
                    {proof.proofValid ? "YES" : "NO"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Transaction */}
          {completionTx && (
            <div style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "14px",
              padding: "20px",
              backgroundColor: "rgba(255,255,255,0.04)",
              marginBottom: "24px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
                Solana Transaction
              </div>
              <a
                href={`https://explorer.solana.com/tx/${completionTx}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "12px",
                  color: "#5ba4f5",
                  textDecoration: "none",
                  fontFamily: "monospace",
                }}
              >
                {completionTx.slice(0, 20)}...{completionTx.slice(-8)}
              </a>
            </div>
          )}

          {/* QR + Share */}
          <div style={{ display: "flex", gap: "24px", alignItems: "center", justifyContent: "center", marginBottom: "32px" }}>
            <SimpleQR text={pageUrl || id} size={100} />
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                onClick={copyLink}
                style={{
                  fontFamily: "inherit",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "8px 20px",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: "6px",
                  backgroundColor: copied ? "rgba(134,239,172,0.1)" : "transparent",
                  color: copied ? "#FFE342" : "rgba(255,255,255,0.7)",
                  transition: "all 0.15s ease",
                }}
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
              <button
                onClick={shareOnX}
                style={{
                  fontFamily: "inherit",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "8px 20px",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: "6px",
                  backgroundColor: "transparent",
                  color: "rgba(255,255,255,0.7)",
                  transition: "all 0.15s ease",
                }}
              >
                Share on X
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
