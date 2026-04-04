"use client";

import { useState, useRef } from "react";
import { useConnector } from "@solana/connector/react";
import Link from "next/link";
import useProfile from "@/hooks/useProfile";
import useReputation from "@/hooks/useReputation";
import UserAvatar from "@/components/UserAvatar";
import ReputationScore from "@/components/ReputationScore";
import WalletButton from "@/components/WalletButton";
import { USDC_LOGO_URL } from "@/lib/constants";
import { formatAddress } from "@/lib/format";
import DIDBadge from "@/components/DIDBadge";

export default function ProfilePage() {
  const { isConnected, account } = useConnector();
  const wallet = isConnected && account ? account : undefined;
  const { profile, loading, refetch } = useProfile(wallet);
  const { reputation } = useReputation(wallet || null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editRole, setEditRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarToast, setAvatarToast] = useState<string | null>(null);
  const [avatarHover, setAvatarHover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openEdit() {
    if (!profile) return;
    setEditName(profile.displayName || "");
    setEditBio(profile.bio || "");
    setEditRole(profile.role || "taker");
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  async function saveEdit() {
    if (!wallet || !profile) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/profile/${wallet}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: editName,
          bio: editBio,
          role: editRole,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || "Failed to save");
        return;
      }
      setEditing(false);
      if (refetch) refetch();
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      setAvatarToast("Image too large. Max 500KB.");
      setTimeout(() => setAvatarToast(null), 3000);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function saveAvatar() {
    if (!wallet || !avatarPreview) return;
    setUploadingAvatar(true);
    try {
      const res = await fetch(`/api/profile/${wallet}/avatar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: avatarPreview }),
      });
      if (!res.ok) {
        const data = await res.json();
        setAvatarToast(data.error || "Upload failed");
      } else {
        setAvatarToast("Avatar updated!");
        setAvatarPreview(null);
        if (refetch) refetch();
      }
    } catch {
      setAvatarToast("Network error");
    } finally {
      setUploadingAvatar(false);
      setTimeout(() => setAvatarToast(null), 3000);
    }
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: "13px",
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "6px",
    backgroundColor: "rgba(255,255,255,0.07)",
    color: "#fff",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.45)",
    marginBottom: "6px",
    display: "block",
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/covenant-bg.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        {/* Header */}
        <div style={{ height: "48px", borderBottom: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
          <Link href="/" style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", textDecoration: "none", color: "#fff", fontWeight: 700 }}>
            Covenant
          </Link>
          <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)" }}>
            Profile
          </span>
          <WalletButton />
        </div>

        {/* Main */}
        <div style={{ maxWidth: "600px", margin: "48px auto", padding: "0 24px" }}>
          {!isConnected ? (
            <div style={{
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "12px",
              backgroundColor: "rgba(255,255,255,0.07)",
              backdropFilter: "blur(16px)",
              padding: "48px 32px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "14px", color: "rgba(255,255,255,0.5)", marginBottom: "16px" }}>
                Connect your wallet to view your profile.
              </div>
              <WalletButton />
            </div>
          ) : loading ? (
            <div style={{
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "12px",
              backgroundColor: "rgba(255,255,255,0.07)",
              backdropFilter: "blur(16px)",
              padding: "48px",
              textAlign: "center",
              color: "rgba(255,255,255,0.4)",
            }}>
              Loading profile...
            </div>
          ) : !profile ? (
            <div style={{
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "12px",
              backgroundColor: "rgba(255,255,255,0.07)",
              backdropFilter: "blur(16px)",
              padding: "48px 32px",
              textAlign: "center",
              color: "rgba(255,255,255,0.5)",
            }}>
              No profile found. It will be created when you first connect.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Profile card */}
              <div style={{
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "12px",
                backgroundColor: "rgba(255,255,255,0.07)",
                backdropFilter: "blur(16px)",
                padding: "32px",
              }}>
                {editing ? (
                  /* Edit mode */
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "4px" }}>
                      Edit Profile
                    </div>

                    <div>
                      <label style={labelStyle}>Display Name</label>
                      <input
                        style={inputStyle}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Your display name"
                        maxLength={50}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Bio</label>
                      <textarea
                        style={{ ...inputStyle, resize: "vertical", minHeight: "80px" }}
                        value={editBio}
                        onChange={(e) => setEditBio(e.target.value)}
                        placeholder="Short bio (optional)"
                        maxLength={280}
                      />
                    </div>

                    <div>
                      <label style={labelStyle}>Role</label>
                      <select
                        style={{ ...inputStyle, cursor: "pointer" }}
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                      >
                        <option value="poster" style={{ backgroundColor: "#1a1a1a" }}>Poster</option>
                        <option value="taker" style={{ backgroundColor: "#1a1a1a" }}>Taker</option>
                        <option value="both" style={{ backgroundColor: "#1a1a1a" }}>Both</option>
                      </select>
                    </div>

                    {saveError && (
                      <div style={{ fontSize: "12px", color: "rgba(255,100,100,0.8)" }}>
                        {saveError}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        style={{
                          fontFamily: "inherit",
                          fontSize: "12px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "8px 20px",
                          cursor: saving ? "not-allowed" : "pointer",
                          border: "1px solid rgba(255,255,255,0.3)",
                          borderRadius: "6px",
                          backgroundColor: saving ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.12)",
                          color: "#fff",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        style={{
                          fontFamily: "inherit",
                          fontSize: "12px",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          padding: "8px 20px",
                          cursor: "pointer",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: "6px",
                          backgroundColor: "transparent",
                          color: "rgba(255,255,255,0.6)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <>
                    <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/png,image/jpeg,image/gif,image/webp"
                          style={{ display: "none" }}
                          onChange={handleAvatarSelect}
                        />
                        {avatarPreview ? (
                          /* Preview mode */
                          <>
                            <img
                              src={avatarPreview}
                              alt="Preview"
                              style={{ width: 80, height: 80, borderRadius: "8px", objectFit: "cover", border: "2px solid #42BDFF" }}
                            />
                            <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                              <button
                                onClick={saveAvatar}
                                disabled={uploadingAvatar}
                                style={{
                                  fontFamily: "inherit",
                                  fontSize: "9px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  padding: "4px 12px",
                                  cursor: uploadingAvatar ? "not-allowed" : "pointer",
                                  border: "1px solid #42BDFF",
                                  borderRadius: "4px",
                                  backgroundColor: uploadingAvatar ? "rgba(66,189,255,0.08)" : "rgba(66,189,255,0.15)",
                                  color: "#42BDFF",
                                  transition: "all 0.15s ease",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                {uploadingAvatar ? (
                                  <>
                                    <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid rgba(66,189,255,0.3)", borderTopColor: "#42BDFF", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
                                    Saving
                                  </>
                                ) : "Save"}
                              </button>
                              <button
                                onClick={() => setAvatarPreview(null)}
                                style={{
                                  fontFamily: "inherit",
                                  fontSize: "9px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  padding: "4px 12px",
                                  cursor: "pointer",
                                  border: "1px solid rgba(255,255,255,0.15)",
                                  borderRadius: "4px",
                                  backgroundColor: "transparent",
                                  color: "rgba(255,255,255,0.5)",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        ) : (
                          /* Normal avatar with camera overlay on hover */
                          <>
                            <div
                              style={{ position: "relative", cursor: "pointer", borderRadius: "8px", overflow: "hidden" }}
                              onMouseEnter={() => setAvatarHover(true)}
                              onMouseLeave={() => setAvatarHover(false)}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <UserAvatar seed={profile.avatarSeed} avatarUrl={profile.avatarUrl ?? null} size={80} />
                              <div style={{
                                position: "absolute",
                                inset: 0,
                                backgroundColor: "rgba(0,0,0,0.55)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                opacity: avatarHover ? 1 : 0,
                                transition: "opacity 0.2s ease",
                                borderRadius: "8px",
                              }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                  <circle cx="12" cy="13" r="4" />
                                </svg>
                              </div>
                            </div>
                            <button
                              onClick={() => fileInputRef.current?.click()}
                              style={{
                                fontFamily: "inherit",
                                fontSize: "10px",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                                padding: 0,
                                cursor: "pointer",
                                border: "none",
                                backgroundColor: "transparent",
                                color: "rgba(255,255,255,0.4)",
                                transition: "color 0.15s ease",
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = "#42BDFF"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
                            >
                              Change Avatar
                            </button>
                          </>
                        )}
                        {avatarToast && (
                          <div style={{
                            fontSize: "10px",
                            color: avatarToast.includes("updated") ? "#FFE342" : "#FF425E",
                            textAlign: "center",
                            marginTop: "2px",
                          }}>
                            {avatarToast}
                          </div>
                        )}
                        <ReputationScore completed={reputation.jobsCompleted} failed={reputation.jobsFailed} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
                            {profile.displayName}
                          </div>
                          <button
                            onClick={openEdit}
                            style={{
                              fontFamily: "inherit",
                              fontSize: "10px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              padding: "4px 12px",
                              cursor: "pointer",
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: "4px",
                              backgroundColor: "transparent",
                              color: "rgba(255,255,255,0.5)",
                              transition: "all 0.15s ease",
                              flexShrink: 0,
                              marginLeft: "12px",
                            }}
                          >
                            Edit
                          </button>
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "8px", display: "flex", gap: "12px", alignItems: "center" }}>
                          <span>{formatAddress(wallet!)}</span>
                          <span style={{
                            padding: "2px 8px",
                            border: "1px solid rgba(255,255,255,0.2)",
                            borderRadius: "4px",
                            fontSize: "10px",
                            textTransform: "uppercase",
                          }}>
                            {profile.role}
                          </span>
                        </div>
                        <div style={{ marginBottom: "12px" }}>
                          <DIDBadge walletAddress={wallet!} compact />
                        </div>
                        {profile.bio && (
                          <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                            {profile.bio}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: "20px", fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                      Member since {new Date(profile.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </div>
                  </>
                )}
              </div>

              {/* Reputation */}
              <div style={{
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "12px",
                backgroundColor: "rgba(255,255,255,0.07)",
                backdropFilter: "blur(16px)",
                padding: "24px 32px",
              }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)", marginBottom: "16px" }}>
                  Reputation
                </div>
                <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#fff" }}>{reputation.jobsCompleted}</div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: "4px" }}>Completed</div>
                  </div>
                  <div style={{ width: "1px", backgroundColor: "rgba(255,255,255,0.1)" }} />
                  <div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#fff" }}>{reputation.jobsFailed}</div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: "4px" }}>Failed</div>
                  </div>
                  <div style={{ width: "1px", backgroundColor: "rgba(255,255,255,0.1)" }} />
                  <div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#fff", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <img src={USDC_LOGO_URL} alt="USDC" width={18} height={18} style={{ borderRadius: "50%" }} />
                      {reputation.totalEarned.toFixed(2)}
                    </div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginTop: "4px" }}>Earned</div>
                  </div>
                </div>
              </div>

              {/* Quick links */}
              <div style={{ display: "flex", gap: "12px" }}>
                <Link href="/poster" style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                >
                  Post a Job
                </Link>
                <Link href="/taker" style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "12px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: "8px",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color: "#fff",
                  textDecoration: "none",
                  fontSize: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                >
                  Find Work
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
