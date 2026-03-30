"use client";

import { useState } from "react";

interface SubmitWorkModalProps {
  jobId: string;
  minWords: number;
  takerWallet: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SubmitWorkModal({
  jobId,
  minWords,
  takerWallet,
  onClose,
  onSuccess,
}: SubmitWorkModalProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const meetsMinWords = wordCount >= minWords;
  const progress = Math.min((wordCount / minWords) * 100, 100);

  const handleSubmit = async () => {
    if (!meetsMinWords) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          takerWallet,
          text,
          wordCount,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit work");
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit work");
    } finally {
      setIsSubmitting(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#555555",
    marginBottom: "4px",
    display: "block",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        fontFamily: "inherit",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "600px",
          maxHeight: "90vh",
          overflowY: "auto",
          backgroundColor: "#ffffff",
          border: "1px solid #000000",
          borderRadius: "12px",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid #000000",
          }}
        >
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              margin: 0,
            }}
          >
            Submit Work
          </h3>
          <button
            onClick={onClose}
            style={{
              fontFamily: "inherit",
              fontSize: "16px",
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: "0 4px",
              color: "#000000",
            }}
          >
            {"\u2715"}
          </button>
        </div>

        {/* Job info strip */}
        <div
          style={{
            display: "flex",
            gap: "24px",
            padding: "12px 20px",
            borderBottom: "1px solid #000000",
            backgroundColor: "rgba(0,0,0,0.02)",
          }}
        >
          <div>
            <span style={{ ...labelStyle, marginBottom: "0", marginRight: "8px" }}>
              Job
            </span>
            <span style={{ fontSize: "12px" }}>
              {jobId.slice(0, 8)}...{jobId.slice(-4)}
            </span>
          </div>
          <div>
            <span style={{ ...labelStyle, marginBottom: "0", marginRight: "8px" }}>
              Min Words
            </span>
            <span style={{ fontSize: "12px" }}>{minWords.toLocaleString()}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {/* Textarea */}
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Your Work</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste or type your deliverable here..."
              style={{
                width: "100%",
                minHeight: "200px",
                border: "1px solid #000000",
                borderRadius: "8px",
                padding: "12px",
                fontSize: "13px",
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
                backgroundColor: "#ffffff",
                color: "#000000",
              }}
              onFocus={(e) => {
                e.target.style.boxShadow = "2px 2px 0px #000000";
              }}
              onBlur={(e) => {
                e.target.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Word count + progress bar */}
          <div style={{ marginBottom: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontSize: "11px", color: "#555555" }}>
                {wordCount.toLocaleString()} / {minWords.toLocaleString()} words
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: meetsMinWords ? "#000000" : "#999999",
                  fontWeight: meetsMinWords ? 600 : 400,
                }}
              >
                {meetsMinWords ? "REQUIREMENT MET" : `${Math.floor(progress)}%`}
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: "4px",
                border: "1px solid #000000",
                borderRadius: "2px",
                backgroundColor: "#ffffff",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  backgroundColor: "#000000",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div
              style={{
                border: "1px solid #000000",
                borderRadius: "6px",
                padding: "8px 12px",
                fontSize: "12px",
                color: "#000000",
                marginBottom: "16px",
                backgroundColor: "#fff0f0",
              }}
            >
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!meetsMinWords || isSubmitting}
            style={{
              fontFamily: "inherit",
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "8px 20px",
              cursor: meetsMinWords && !isSubmitting ? "pointer" : "not-allowed",
              border: "1px solid #000000",
              borderRadius: "6px",
              backgroundColor:
                meetsMinWords && !isSubmitting ? "#000000" : "#cccccc",
              color: meetsMinWords && !isSubmitting ? "#ffffff" : "#999999",
              width: "100%",
              transition: "all 0.15s ease",
              borderColor:
                meetsMinWords && !isSubmitting ? "#000000" : "#cccccc",
            }}
            onMouseEnter={(e) => {
              if (meetsMinWords && !isSubmitting) {
                e.currentTarget.style.backgroundColor = "#ffffff";
                e.currentTarget.style.color = "#000000";
              }
            }}
            onMouseLeave={(e) => {
              if (meetsMinWords && !isSubmitting) {
                e.currentTarget.style.backgroundColor = "#000000";
                e.currentTarget.style.color = "#ffffff";
              }
            }}
          >
            {isSubmitting ? "Submitting..." : "Submit Work"}
          </button>
        </div>
      </div>
    </div>
  );
}
