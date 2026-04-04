"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useConnector } from "@solana/connector/react";
import NavBar from "@/components/NavBar";
import JobList from "@/components/JobList";
import ReputationBadge from "@/components/ReputationBadge";
import AsciiAnimation from "@/components/AsciiAnimation";
import UserAvatar from "@/components/UserAvatar";
import StatusBadge from "@/components/StatusBadge";
import useAvatar from "@/hooks/useAvatar";
import useProtocolStats from "@/hooks/useProtocolStats";
import { USDC_LOGO_URL, SOL_LOGO_URL } from "@/lib/constants";
import { JOB_CATEGORIES, getCategoryById } from "@/lib/categories";
import { formatAddress } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { JobData } from "@/hooks/useJobList";

function PosterAvatarCell({ wallet }: { wallet: string }) {
  const { avatarUrl, avatarSeed } = useAvatar(wallet);
  return <UserAvatar seed={avatarSeed} avatarUrl={avatarUrl} size={20} />;
}

type GridFilter = "all" | "trending" | "new" | "high";

function getDeadlineCountdown(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  const mins = Math.floor(diff / (1000 * 60));
  return `${mins}m left`;
}

export default function TakerPage() {
  const { account } = useConnector();
  const walletPubkey = account || undefined;
  const { stats, loading: statsLoading } = useProtocolStats();
  const [activeFilter, setActiveFilter] = useState<"all" | "mine">("all");
  const [gridFilter, setGridFilter] = useState<GridFilter>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Search & filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Grid data
  const [gridJobs, setGridJobs] = useState<JobData[]>([]);
  const [gridLoading, setGridLoading] = useState(true);

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 500);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Fetch jobs for grid view
  const fetchGridJobs = useCallback(async () => {
    setGridLoading(true);
    try {
      const qp = new URLSearchParams();
      if (selectedCategory) qp.set("category", selectedCategory);
      if (debouncedSearch) qp.set("search", debouncedSearch);
      if (minPrice) qp.set("minAmount", minPrice);
      if (maxPrice) qp.set("maxAmount", maxPrice);

      const res = await fetch(`/api/jobs?${qp.toString()}`);
      if (res.ok) {
        const result = await res.json();
        let data: JobData[] = Array.isArray(result) ? result : (result.jobs || []);

        // Apply grid filters
        if (gridFilter === "new") {
          data = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else if (gridFilter === "high") {
          data = data.filter(j => j.amount > 20);
        } else if (gridFilter === "trending") {
          data = data.filter(j => j.status === "Open" || j.status === "Accepted");
        }

        setGridJobs(data);
      }
    } catch {
      // silent
    } finally {
      setGridLoading(false);
    }
  }, [gridFilter, selectedCategory, debouncedSearch, minPrice, maxPrice]);

  useEffect(() => {
    if (viewMode === "grid") {
      fetchGridJobs();
      const poll = setInterval(fetchGridJobs, 10000);
      return () => clearInterval(poll);
    }
  }, [viewMode, fetchGridJobs]);

  const filterBtnStyle = (
    isActive: boolean
  ): React.CSSProperties => ({
    fontFamily: "inherit",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    padding: "4px 16px",
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "6px",
    backgroundColor: isActive ? "rgba(255,255,255,0.15)" : "transparent",
    color: isActive ? "#ffffff" : "rgba(255,255,255,0.5)",
    backdropFilter: "blur(4px)",
    transition: "all 0.15s ease",
  });

  return (
    <div style={{ minHeight: "100vh", fontFamily: "inherit", position: "relative" }}>
      {/* Full-bleed background */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/poster-bg.png')", backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)" }} />

      {/* Content */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <NavBar activeTab="taker" variant="dark" />

        <div
          className="taker-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 300px",
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "32px 24px",
            gap: "24px",
          }}
        >
        {/* Left column */}
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          {/* View toggle + filter tabs */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setActiveFilter("all")} style={filterBtnStyle(activeFilter === "all")}>
                All Jobs
              </button>
              <button onClick={() => setActiveFilter("mine")} style={filterBtnStyle(activeFilter === "mine")}>
                My Jobs
              </button>
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <button onClick={() => setViewMode("grid")} style={{ ...filterBtnStyle(viewMode === "grid"), padding: "4px 10px" }}>
                Grid
              </button>
              <button onClick={() => setViewMode("list")} style={{ ...filterBtnStyle(viewMode === "list"), padding: "4px 10px" }}>
                List
              </button>
            </div>
          </div>

          {/* Grid filter tabs */}
          {viewMode === "grid" && (
            <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
              {(["all", "trending", "new", "high"] as GridFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setGridFilter(f)}
                  style={{
                    fontFamily: "inherit",
                    fontSize: "10px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "3px 12px",
                    cursor: "pointer",
                    border: gridFilter === f ? "1px solid rgba(255,255,255,0.4)" : "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "20px",
                    backgroundColor: gridFilter === f ? "rgba(255,255,255,0.1)" : "transparent",
                    color: gridFilter === f ? "#ffffff" : "rgba(255,255,255,0.4)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {f === "high" ? "High Reward" : f}
                </button>
              ))}
            </div>
          )}

          {/* Search & Filter Bar */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "20px",
              padding: "12px 16px",
              borderRadius: "10px",
              border: "1px solid rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.05)",
              backdropFilter: "blur(12px)",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              style={{
                flex: "1 1 160px",
                minWidth: "120px",
                padding: "6px 10px",
                fontSize: "11px",
                fontFamily: "inherit",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.2)",
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "#ffffff",
                outline: "none",
              }}
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{
                padding: "6px 10px",
                fontSize: "11px",
                fontFamily: "inherit",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.2)",
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "#ffffff",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="" style={{ backgroundColor: "#1a1a1a" }}>All Categories</option>
              {JOB_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id} style={{ backgroundColor: "#1a1a1a" }}>
                  {cat.label}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <img src={USDC_LOGO_URL} alt="USDC" width={14} height={14} style={{ borderRadius: "50%" }} />
              <input
                type="number"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                style={{
                  width: "60px",
                  padding: "6px 8px",
                  fontSize: "11px",
                  fontFamily: "inherit",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  color: "#ffffff",
                  outline: "none",
                }}
              />
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px" }}>-</span>
              <input
                type="number"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                style={{
                  width: "60px",
                  padding: "6px 8px",
                  fontSize: "11px",
                  fontFamily: "inherit",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.2)",
                  backgroundColor: "rgba(255,255,255,0.08)",
                  color: "#ffffff",
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Grid view */}
          {viewMode === "grid" ? (
            <div>
              {gridLoading ? (
                <div style={{ textAlign: "center", padding: "48px", color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
                  Loading...
                </div>
              ) : gridJobs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px" }}>
                  <AsciiAnimation scene="idle" variant="dark" />
                  <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "12px" }}>
                    No jobs found
                  </div>
                </div>
              ) : (
                <div className="marketplace-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  {gridJobs.map((job) => {
                    const cat = getCategoryById(job.category || "text_writing");
                    const title = (job.specJson?.title as string) || `Job ${job.id.slice(0, 8)}`;
                    return (
                      <Link key={job.id} href={`/job/${job.id}`} style={{ textDecoration: "none" }}>
                        <div
                          style={{
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "12px",
                            padding: "18px",
                            backgroundColor: "rgba(0,0,0,0.3)",
                            backdropFilter: "blur(12px)",
                            transition: "all 0.15s ease",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                            e.currentTarget.style.transform = "translateY(-2px)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                            e.currentTarget.style.transform = "translateY(0)";
                          }}
                        >
                          {/* Top row: category tag + deadline */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{
                              fontSize: "9px",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              border: "1px solid rgba(255,255,255,0.15)",
                              color: "rgba(255,255,255,0.7)",
                              backgroundColor: "rgba(255,255,255,0.06)",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}>
                              {cat.tag} {cat.label}
                            </span>
                            <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)" }}>
                              {getDeadlineCountdown(job.deadline)}
                            </span>
                          </div>

                          {/* Title */}
                          <div style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#ffffff",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}>
                            {title}
                          </div>

                          {/* Amount + poster */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <img
                                src={job.paymentToken === "SOL" ? SOL_LOGO_URL : USDC_LOGO_URL}
                                alt={job.paymentToken || "USDC"}
                                width={18}
                                height={18}
                                style={{ borderRadius: "50%" }}
                              />
                              <span style={{ fontSize: "18px", fontWeight: 700, color: "#ffffff" }}>
                                {job.amount.toFixed(2)}
                              </span>
                              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
                                {job.paymentToken || "USDC"}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <PosterAvatarCell wallet={job.posterWallet} />
                              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)" }}>
                                {formatAddress(job.posterWallet)}
                              </span>
                            </div>
                          </div>

                          {/* Status + apply button */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                            <StatusBadge status={job.status as "Open" | "Accepted" | "Completed" | "Cancelled"} />
                            {job.status === "Open" && (
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!walletPubkey) {
                                    toast("Connect wallet to apply", "error");
                                    return;
                                  }
                                  try {
                                    const res = await fetch(`/api/jobs/${job.id}/accept`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ takerWallet: walletPubkey }),
                                    });
                                    if (res.ok) {
                                      toast("Job accepted!", "success");
                                      fetchGridJobs();
                                    } else {
                                      const data = await res.json();
                                      toast(data.error || "Failed to apply", "error");
                                    }
                                  } catch {
                                    toast("Failed to apply", "error");
                                  }
                                }}
                                style={{
                                  fontFamily: "inherit",
                                  fontSize: "10px",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                  padding: "4px 14px",
                                  borderRadius: "6px",
                                  border: "1px solid rgba(255,255,255,0.3)",
                                  color: "#ffffff",
                                  backgroundColor: "rgba(255,255,255,0.1)",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                Apply
                              </button>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* List view - original JobList */
            <JobList
              filter={activeFilter}
              walletPubkey={walletPubkey}
              variant="dark"
              category={selectedCategory || undefined}
              search={debouncedSearch || undefined}
              minAmount={minPrice ? parseFloat(minPrice) : undefined}
              maxAmount={maxPrice ? parseFloat(maxPrice) : undefined}
            />
          )}
        </div>

        {/* Right column - sticky sidebar */}
        <div style={{ minWidth: 0, overflow: "hidden" }}>
          <div style={{ position: "sticky", top: "24px" }}>
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: "8px",
                }}
              >
                Your Reputation
              </div>
              <ReputationBadge wallet={walletPubkey || null} />
            </div>

            <div
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px",
                padding: "16px",
                marginBottom: "24px",
                backgroundColor: "rgba(255,255,255,0.05)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.5)",
                  marginBottom: "12px",
                }}
              >
                Protocol Stats
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Total Jobs</span>
                  <span style={{ fontWeight: 600, color: "#ffffff" }}>
                    {statsLoading ? "..." : stats.totalJobs}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Total Locked</span>
                  <span style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    {statsLoading ? "..." : (
                      <>
                        <img src={USDC_LOGO_URL} alt="USDC" width={12} height={12} style={{ borderRadius: "50%" }} />
                        {stats.totalLocked.toFixed(2)}
                      </>
                    )}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Completed</span>
                  <span style={{ fontWeight: 600, color: "#ffffff" }}>
                    {statsLoading ? "..." : stats.completed}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Success Rate</span>
                  <span style={{ fontWeight: 600, color: "#ffffff" }}>
                    {statsLoading ? "..." : `${stats.successRate}%`}
                  </span>
                </div>
              </div>
            </div>

            <AsciiAnimation scene="idle" variant="dark" />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
