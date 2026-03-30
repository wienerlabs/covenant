"use client";

import { useConnector } from "@solana/connector/react";
import Link from "next/link";
import useProfile from "@/hooks/useProfile";
import useReputation from "@/hooks/useReputation";
import PixelAvatar from "@/components/PixelAvatar";
import WalletButton from "@/components/WalletButton";
import { USDC_LOGO_URL } from "@/lib/constants";
import { formatAddress } from "@/lib/format";

export default function ProfilePage() {
  const { isConnected, account } = useConnector();
  const wallet = isConnected && account ? account : undefined;
  const { profile, loading } = useProfile(wallet);
  const { reputation } = useReputation(wallet || null);

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
                <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                  <PixelAvatar seed={profile.avatarSeed} size={80} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
                      {profile.displayName}
                    </div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "12px", display: "flex", gap: "12px", alignItems: "center" }}>
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
