"use client";

import { useState } from "react";
import { useConnector } from "@solana/connector/react";
import AsciiAnimation from "./AsciiAnimation";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import { JOB_CATEGORIES, type CategoryId } from "@/lib/categories";

interface CreateJobFormProps {
  variant?: "light" | "dark";
  onJobCreated?: () => void;
}

export default function CreateJobForm({ variant = "light", onJobCreated }: CreateJobFormProps) {
  const isDark = variant === "dark";
  const { account } = useConnector();
  const [category, setCategory] = useState<CategoryId>("text_writing");
  const [paymentToken, setPaymentToken] = useState<"USDC" | "SOL">("USDC");
  const [amount, setAmount] = useState("");
  const [minWords, setMinWords] = useState("");
  const [deadline, setDeadline] = useState("");
  const [sourceLang, setSourceLang] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [minItems, setMinItems] = useState("");
  const [severity, setSeverity] = useState("");
  const [deliverableType, setDeliverableType] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: isDark ? "rgba(255,255,255,0.5)" : "#555555",
    marginBottom: "4px",
    display: "block",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    border: isDark ? "1px solid rgba(255,255,255,0.25)" : "1px solid #000000",
    borderRadius: "6px",
    padding: "8px 12px",
    fontSize: "13px",
    fontFamily: "inherit",
    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#ffffff",
    color: isDark ? "#ffffff" : "#000000",
    outline: "none",
    transition: "box-shadow 0.15s ease",
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = isDark ? "0 0 0 1px rgba(255,255,255,0.3)" : "2px 2px 0px #000000";
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.boxShadow = "none";
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

    try {
      const posterWallet = account || "anonymous";
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posterWallet,
          amount: parseFloat(amount),
          minWords: parseInt(minWords),
          language: "en",
          deadline: new Date(deadline).toISOString(),
          category,
          paymentToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create job");
      }

      const job = await response.json();
      setSuccess(job.id);
      onJobCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCategory("text_writing");
    setAmount("");
    setMinWords("");
    setDeadline("");
    setSourceLang("");
    setTargetLang("");
    setMinItems("");
    setSeverity("");
    setDeliverableType("");
    setSuccess(null);
    setError(null);
  };

  const selectedCategoryRaw = JOB_CATEGORIES.find(c => c.id === category) || JOB_CATEGORIES[0];
  const categoryFields = selectedCategoryRaw.fields as readonly string[];

  if (success) {
    return (
      <div style={{ textAlign: "center", padding: "16px 0" }}>
        <div style={{ fontSize: "32px", marginBottom: "16px", color: isDark ? "#fff" : "#000" }}>{"\u2713"}</div>
        <div
          style={{
            fontSize: "11px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: isDark ? "rgba(255,255,255,0.6)" : "#555555",
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
            border: isDark ? "1px solid rgba(255,255,255,0.25)" : "1px solid #000000",
            borderRadius: "6px",
            display: "inline-block",
            marginBottom: "24px",
            color: isDark ? "#fff" : "#000",
            wordBreak: "break-all",
          }}
        >
          {success}
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
            border: isDark ? "1px solid rgba(255,255,255,0.3)" : "1px solid #000000",
            borderRadius: "6px",
            backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "#ffffff",
            color: isDark ? "#ffffff" : "#000000",
            transition: "all 0.15s ease",
          }}
        >
          Post Another
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        border: isDark ? "none" : "1px solid #000000",
        padding: isDark ? "0" : "24px",
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
            color: isDark ? "#ffffff" : "#000000",
          }}
        >
          New Job
        </h2>
        <AsciiAnimation scene="mint" width="120px" height="60px" variant={isDark ? "dark" : "light"} />
      </div>

      <form onSubmit={handleSubmit}>
        {/* Category selector */}
        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>Category</label>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "8px",
            marginTop: "6px",
          }}>
            {JOB_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id as CategoryId)}
                style={{
                  fontFamily: "inherit",
                  fontSize: "11px",
                  padding: "10px 8px",
                  cursor: "pointer",
                  border: category === cat.id
                    ? (isDark ? "1px solid #ffffff" : "1px solid #000000")
                    : (isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #ccc"),
                  borderRadius: "8px",
                  backgroundColor: isDark
                    ? (category === cat.id ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)")
                    : (category === cat.id ? "#f5f5f5" : "#ffffff"),
                  color: isDark ? "#ffffff" : "#000000",
                  backdropFilter: isDark ? "blur(8px)" : "none",
                  transition: "all 0.15s ease",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.05em" }}>{cat.tag}</span>
                <span style={{ fontWeight: category === cat.id ? 600 : 400 }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category-specific fields */}
        {categoryFields.includes("sourceLang") && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div>
              <label style={labelStyle}>Source Language</label>
              <input
                type="text"
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="English"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Target Language</label>
              <input
                type="text"
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="Spanish"
                style={inputStyle}
              />
            </div>
          </div>
        )}
        {categoryFields.includes("minItems") && (
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Minimum Items to Label</label>
            <input
              type="number"
              step="1"
              min="1"
              value={minItems}
              onChange={(e) => setMinItems(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="100"
              style={inputStyle}
            />
          </div>
        )}
        {categoryFields.includes("severity") && (
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Minimum Severity</label>
            <input
              type="text"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Critical, High, Medium, Low"
              style={inputStyle}
            />
          </div>
        )}
        {categoryFields.includes("deliverableType") && (
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Deliverable Type</label>
            <input
              type="text"
              value={deliverableType}
              onChange={(e) => setDeliverableType(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Logo, UI Mockup, Icon Set..."
              style={inputStyle}
            />
          </div>
        )}

        {/* Payment Token Selector */}
        <div style={{ marginBottom: "16px" }}>
          <label style={labelStyle}>Payment Token</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["USDC", "SOL"] as const).map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => setPaymentToken(token)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "10px",
                  border: paymentToken === token
                    ? (isDark ? "1px solid rgba(255,255,255,0.5)" : "1px solid #000")
                    : (isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid #ddd"),
                  borderRadius: "8px",
                  backgroundColor: paymentToken === token
                    ? (isDark ? "rgba(255,255,255,0.12)" : "#f0f0f0")
                    : (isDark ? "rgba(255,255,255,0.04)" : "#fff"),
                  color: isDark ? "#fff" : "#000",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  fontWeight: paymentToken === token ? 600 : 400,
                  transition: "all 0.15s ease",
                }}
              >
                <img
                  src={token === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL}
                  alt={token}
                  width={20}
                  height={20}
                  style={{ borderRadius: "50%" }}
                />
                {token}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "6px" }}>
            <img src={paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL} alt={paymentToken} width={14} height={14} style={{ borderRadius: "50%" }} />
            Payment Amount ({paymentToken})
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="number"
              step={paymentToken === "SOL" ? "0.001" : "0.01"}
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="0.00"
              style={{ ...inputStyle, paddingRight: "60px" }}
            />
            <span style={{
              position: "absolute",
              right: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "11px",
              color: isDark ? "rgba(255,255,255,0.4)" : "#999",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}>
              <img src={paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL} alt={paymentToken} width={12} height={12} style={{ borderRadius: "50%" }} />
              {paymentToken}
            </span>
          </div>
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
              border: isDark ? "1px solid rgba(255,255,255,0.3)" : "1px solid #000000",
              padding: "8px 12px",
              fontSize: "12px",
              color: isDark ? "#ffffff" : "#000000",
              marginBottom: "16px",
              backgroundColor: isDark ? "rgba(255,0,0,0.15)" : "#ffffff",
              borderRadius: "6px",
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
            border: isDark ? "1px solid rgba(255,255,255,0.3)" : "1px solid #000000",
            borderRadius: "6px",
            backgroundColor: isDark ? "rgba(255,255,255,0.15)" : "#000000",
            color: "#ffffff",
            width: "100%",
            transition: "all 0.15s ease",
            opacity: isSubmitting ? 0.7 : 1,
            backdropFilter: isDark ? "blur(4px)" : "none",
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.backgroundColor = isDark ? "rgba(255,255,255,0.25)" : "#ffffff";
              e.currentTarget.style.color = isDark ? "#ffffff" : "#000000";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting) {
              e.currentTarget.style.backgroundColor = isDark ? "rgba(255,255,255,0.15)" : "#000000";
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
