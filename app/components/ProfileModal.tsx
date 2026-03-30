"use client";

import { useState } from "react";

interface ProfileModalProps {
  walletAddress: string;
  onComplete: () => void;
  onClose: () => void;
}

export default function ProfileModal({
  walletAddress,
  onComplete,
  onClose,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [role, setRole] = useState<"poster" | "taker" | "both">("both");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleFocus = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    e.target.style.boxShadow = "2px 2px 0px #000000";
  };

  const handleBlur = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    e.target.style.boxShadow = "none";
  };

  const handleSubmit = async () => {
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          displayName: displayName.trim(),
          bio: bio.trim(),
          role,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create profile");
      }

      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleButtonStyle = (
    value: "poster" | "taker" | "both"
  ): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "6px 14px",
    cursor: "pointer",
    border: "1px solid #000000",
    borderRadius: "6px",
    backgroundColor: role === value ? "#000000" : "#ffffff",
    color: role === value ? "#ffffff" : "#000000",
    transition: "all 0.15s ease",
    flex: 1,
  });

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
          width: "440px",
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
            Create Profile
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

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {/* Display Name */}
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Display Name *</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Enter your display name"
              style={inputStyle}
            />
          </div>

          {/* Bio */}
          <div style={{ marginBottom: "16px" }}>
            <label style={labelStyle}>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              placeholder="Tell us about yourself..."
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
              }}
            />
          </div>

          {/* Role */}
          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Role</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setRole("poster")}
                style={roleButtonStyle("poster")}
              >
                Poster
              </button>
              <button
                type="button"
                onClick={() => setRole("taker")}
                style={roleButtonStyle("taker")}
              >
                Taker
              </button>
              <button
                type="button"
                onClick={() => setRole("both")}
                style={roleButtonStyle("both")}
              >
                Both
              </button>
            </div>
          </div>

          {/* Error */}
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

          {/* Submit */}
          <button
            onClick={handleSubmit}
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
            {isSubmitting ? "Creating..." : "Create Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
