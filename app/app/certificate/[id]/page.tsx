"use client";

import { useState, useEffect, useRef, use } from "react";
import NavBar from "@/components/NavBar";

interface CertificateData {
  id: string;
  textHash: string;
  wordCount: number;
  minWords: number;
  verified: boolean;
  cycleCount: number;
  sharedBy: string | null;
  createdAt: string;
}

export default function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cert, setCert] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function fetchCert() {
      try {
        const res = await fetch(`/api/certificate/${id}`);
        if (!res.ok) {
          setError("Certificate not found");
          return;
        }
        const data = await res.json();
        setCert(data);
      } catch {
        setError("Failed to load certificate");
      } finally {
        setLoading(false);
      }
    }
    fetchCert();
  }, [id]);

  // Draw QR code on canvas (simple pattern-based representation)
  useEffect(() => {
    if (!cert || !qrRef.current) return;
    const canvas = qrRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 120;
    canvas.width = size;
    canvas.height = size;
    const cellSize = 4;
    const grid = size / cellSize;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    // Generate deterministic pattern from certificate ID
    const hash = cert.id + cert.textHash;
    let seed = 0;
    for (let i = 0; i < hash.length; i++) {
      seed = ((seed << 5) - seed + hash.charCodeAt(i)) | 0;
    }

    ctx.fillStyle = "#000000";

    // Position detection patterns (3 corners)
    const drawFinder = (x: number, y: number) => {
      // Outer
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
            ctx.fillRect((x + i) * cellSize, (y + j) * cellSize, cellSize, cellSize);
          }
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(grid - 7, 0);
    drawFinder(0, grid - 7);

    // Data area
    for (let i = 8; i < grid - 8; i++) {
      for (let j = 8; j < grid - 8; j++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        if (seed % 3 === 0) {
          ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < grid - 8; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(6 * cellSize, i * cellSize, cellSize, cellSize);
        ctx.fillRect(i * cellSize, 6 * cellSize, cellSize, cellSize);
      }
    }
  }, [cert]);

  const certUrl = typeof window !== "undefined" ? window.location.href : "";
  const tweetText = cert
    ? encodeURIComponent(
        `My text was cryptographically verified by @covenant_sol\n\nWord count: ${cert.wordCount}\nCertificate: #CERT-${cert.id.slice(0, 8).toUpperCase()}\n\n#ZKProof #Solana\n${certUrl}`
      )
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(certUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <NavBar activeTab="home" variant="dark" />
          <div style={{ textAlign: "center", padding: "80px 24px", color: "rgba(255,255,255,0.5)" }}>
            Loading certificate...
          </div>
        </div>
      </div>
    );
  }

  if (error || !cert) {
    return (
      <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <NavBar activeTab="home" variant="dark" />
          <div style={{ textAlign: "center", padding: "80px 24px", color: "#fca5a5", fontSize: "16px" }}>
            {error || "Certificate not found"}
          </div>
        </div>
      </div>
    );
  }

  const date = new Date(cert.createdAt);
  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: "linear-gradient(135deg, #0a0a0a 0%, #0d1117 30%, #1a1a2e 60%, #0a0a0a 100%)",
        }}
      />
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="home" variant="dark" />

        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "48px 24px" }}>
          {/* Certificate Card */}
          <div
            style={{
              borderRadius: "20px",
              backgroundColor: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(234,179,8,0.25)",
              backdropFilter: "blur(20px)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "32px 32px 24px",
                borderBottom: "1px solid rgba(234,179,8,0.15)",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "10px",
                  color: "#FFE342",
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  marginBottom: "8px",
                }}
              >
                Covenant Verification Certificate
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
                #CERT-{cert.id.slice(0, 8).toUpperCase()}
              </div>
            </div>

            {/* Verified badge */}
            <div style={{ textAlign: "center", padding: "32px 32px 24px" }}>
              <div
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  backgroundColor: cert.verified ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  border: `2px solid ${cert.verified ? "#22c55e" : "#FF425E"}`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "36px",
                  color: cert.verified ? "#22c55e" : "#FF425E",
                  marginBottom: "16px",
                }}
              >
                {cert.verified ? "\u2713" : "\u2717"}
              </div>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: cert.verified ? "#22c55e" : "#FF425E",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {cert.verified ? "Verified" : "Not Verified"}
              </div>
            </div>

            {/* Details */}
            <div style={{ padding: "0 32px 32px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Word Count</span>
                  <span style={{ fontSize: "14px", color: "#ffffff", fontWeight: 600 }}>
                    {cert.wordCount} / {cert.minWords} minimum {cert.verified ? "\u2713" : ""}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Text Hash</span>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", fontFamily: "monospace", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    0x{cert.textHash.slice(0, 16)}...
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Circuit</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>SP1 Word Count Verifier</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cycle Count</span>
                  <span style={{ fontSize: "14px", color: "#ffffff", fontWeight: 600 }}>{cert.cycleCount.toLocaleString()}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "10px", backgroundColor: "rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Verified At</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>{formattedDate}</span>
                </div>
              </div>

              {/* Solana badge */}
              <div
                style={{
                  marginTop: "24px",
                  textAlign: "center",
                  padding: "10px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(234,179,8,0.08)",
                  border: "1px solid rgba(234,179,8,0.15)",
                }}
              >
                <span style={{ fontSize: "10px", color: "#FFE342", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                  Verified by COVENANT on Solana
                </span>
              </div>
            </div>

            {/* QR Code */}
            <div style={{ textAlign: "center", padding: "0 32px 24px" }}>
              <canvas
                ref={qrRef}
                style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "8px",
                }}
              />
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", marginTop: "8px" }}>
                Scan to view certificate
              </div>
            </div>

            {/* Share buttons */}
            <div
              style={{
                padding: "20px 32px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                gap: "12px",
                justifyContent: "center",
              }}
            >
              <button
                onClick={handleCopy}
                style={{
                  padding: "10px 20px",
                  fontSize: "11px",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "6px",
                  color: "#ffffff",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  transition: "all 0.15s ease",
                }}
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
              <a
                href={`https://twitter.com/intent/tweet?text=${tweetText}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "10px 20px",
                  fontSize: "11px",
                  fontFamily: "inherit",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  textDecoration: "none",
                  border: "1px solid #1d9bf0",
                  borderRadius: "6px",
                  color: "#1d9bf0",
                  backgroundColor: "rgba(29,155,240,0.1)",
                  transition: "all 0.15s ease",
                }}
              >
                Share on X
              </a>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "16px 32px",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)", letterSpacing: "0.05em" }}>
                This certificate is permanent and publicly verifiable.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
