"use client";

import { useState } from "react";
import AsciiAnimation from "./AsciiAnimation";
import { formatAddress } from "@/lib/format";

export default function CreateJobForm() {
  const [amount, setAmount] = useState("");
  const [minWords, setMinWords] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: "#555555",
    marginBottom: "4px",
    display: "block",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid #000000",
    borderRadius: "6px",
    padding: "8px 12px",
    fontSize: "13px",
    fontFamily: "inherit",
    backgroundColor: "#ffffff",
    color: "#000000",
    outline: "none",
    transition: "box-shadow 0.15s ease",
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = "2px 2px 0px #000000";
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = "none";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!amount || parseFloat(amount) <= 0) {
      setError("Payment amount must be greater than 0.");
      return;
    }
    if (!minWords || parseInt(minWords) <= 0) {
      setError("Minimum word count must be greater than 0.");
      return;
    }
    if (!deadline) {
      setError("Deadline is required.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSuccess("Cv7t2X9kFpHq3mNbRz1YWd4AeJcLn8Uf6GsKoQ5vBxT");
    }, 1500);
  };

  const resetForm = () => {
    setAmount("");
    setMinWords("");
    setDeadline("");
    setSuccess(null);
    setError(null);
  };

  if (success) {
    return (
      <div
        style={{
          border: "1px solid #000000",
          padding: "32px",
          borderRadius: "10px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>{"\u2713"}</div>
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#555555",
              marginBottom: "8px",
            }}
          >
            Job Created
          </div>
          <div
            style={{
              fontSize: "13px",
              fontFamily: "inherit",
              padding: "8px 12px",
              border: "1px solid #000000",
              display: "inline-block",
              marginBottom: "24px",
            }}
          >
            {formatAddress(success)}
          </div>
          <br />
          <button
            onClick={resetForm}
            style={{
              fontFamily: "inherit",
              fontSize: "13px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "8px 20px",
              cursor: "pointer",
              border: "1px solid #000000",
              borderRadius: "6px",
              backgroundColor: "#ffffff",
              color: "#000000",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#000000";
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#ffffff";
              e.currentTarget.style.color = "#000000";
            }}
          >
            Post Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid #000000",
        padding: "24px",
        borderRadius: "10px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
        }}
      >
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            margin: 0,
          }}
        >
          New Job
        </h2>
        <AsciiAnimation scene="escrow" width="120px" height="60px" />
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Payment Amount (USDC)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="0.00"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Minimum Word Count</label>
          <input
            type="number"
            step="1"
            min="0"
            value={minWords}
            onChange={(e) => setMinWords(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="1000"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label style={labelStyle}>Deadline</label>
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            style={inputStyle}
          />
        </div>

        {error && (
          <div
            style={{
              border: "1px solid #000000",
              padding: "8px 12px",
              fontSize: "12px",
              color: "#000000",
              marginBottom: "16px",
              backgroundColor: "#ffffff",
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            fontFamily: "inherit",
            fontSize: "13px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "8px 20px",
            cursor: isSubmitting ? "wait" : "pointer",
            border: "1px solid #000000",
            borderRadius: "6px",
            backgroundColor: "#000000",
            color: "#ffffff",
            width: "100%",
            transition: "all 0.15s ease",
            opacity: isSubmitting ? 0.7 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.backgroundColor = "#ffffff";
              e.currentTarget.style.color = "#000000";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.backgroundColor = "#000000";
              e.currentTarget.style.color = "#ffffff";
            }
          }}
        >
          {isSubmitting ? "Creating..." : "Create Job"}
        </button>
      </form>
    </div>
  );
}
