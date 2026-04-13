"use client";

/**
 * Category-specific delivery renderer. Parses structured JSON from
 * contentPreview and renders a rich, category-appropriate UI.
 *
 * Each category's agent produces a JSON object with a `type` field
 * matching the category. The renderer switches on this type and
 * renders the appropriate visualization.
 *
 * Fallback: if JSON parsing fails, renders the raw text preview.
 */

interface CategoryDeliveryRendererProps {
  category: string;
  contentPreview?: string | null;
  imageUrl?: string | null;
  deliveryUri?: string;
  isDark?: boolean;
}

interface Finding {
  severity: string;
  title: string;
  description?: string;
  file?: string;
  line?: number;
}

export default function CategoryDeliveryRenderer({
  category,
  contentPreview,
  imageUrl,
  deliveryUri,
  isDark = true,
}: CategoryDeliveryRendererProps) {
  const card: React.CSSProperties = {
    padding: "16px",
    borderRadius: "8px",
    backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fafafa",
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e0e0e0",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  };

  const label: React.CSSProperties = {
    fontSize: "10px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#fffeb2",
    fontWeight: 700,
  };

  const muted: React.CSSProperties = {
    fontSize: "11px",
    color: isDark ? "rgba(255,255,255,0.5)" : "#666",
  };

  // Try parsing structured JSON
  let data: Record<string, unknown> | null = null;
  if (contentPreview) {
    try {
      const parsed = JSON.parse(contentPreview);
      if (typeof parsed === "object" && parsed !== null) {
        data = parsed;
      }
    } catch {
      // Not JSON — render as raw text
    }
  }

  // ---- Design ----
  if (category === "design") {
    return (
      <div style={card}>
        <div style={label}>Design Delivery</div>
        {imageUrl && (
          <div style={{ borderRadius: "8px", overflow: "hidden", border: isDark ? "1px solid rgba(255,254,178,0.2)" : "1px solid #e0d090" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Generated design" style={{ width: "100%", height: "auto", display: "block", maxHeight: "400px", objectFit: "contain", backgroundColor: isDark ? "#0a0a0f" : "#f5f5f5" }} />
          </div>
        )}
        {data && data.style ? <div style={muted}>Style: {String(data.style)}</div> : null}
        {data && data.colors ? (
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={muted}>Palette:</span>
            {(Array.isArray(data.colors) ? data.colors : []).map((c: string, i: number) => (
              <div key={i} style={{ width: "20px", height: "20px", borderRadius: "4px", backgroundColor: c, border: "1px solid rgba(255,255,255,0.1)" }} title={c} />
            ))}
          </div>
        ) : null}
        {!imageUrl && contentPreview ? <RawPreview text={contentPreview} isDark={isDark} /> : null}
      </div>
    );
  }

  // ---- Code Review ----
  if (category === "code_review" && data) {
    const findings = (Array.isArray(data.findings) ? data.findings : []) as Finding[];
    const score = typeof data.score === "number" ? data.score : null;
    const filesAnalyzed = typeof data.filesAnalyzed === "number" ? data.filesAnalyzed : null;
    const summary = typeof data.summary === "string" ? data.summary : null;

    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={label}>Code Review Report</div>
          {score !== null && (
            <div style={{
              padding: "4px 12px",
              borderRadius: "12px",
              backgroundColor: score >= 8 ? "rgba(30,158,95,0.15)" : score >= 5 ? "rgba(255,254,178,0.15)" : "rgba(255,68,68,0.15)",
              color: score >= 8 ? "#1E9E5F" : score >= 5 ? "#fffeb2" : "#FF4444",
              fontSize: "14px",
              fontWeight: 700,
            }}>
              {score.toFixed(1)} / 10
            </div>
          )}
        </div>
        {filesAnalyzed && <div style={muted}>{filesAnalyzed} files analyzed</div>}
        {findings.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {findings.map((f, i) => (
              <div key={i} style={{
                display: "flex",
                gap: "8px",
                alignItems: "flex-start",
                padding: "8px 10px",
                borderRadius: "6px",
                backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff",
                border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid #eee",
              }}>
                <SeverityBadge severity={f.severity} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: isDark ? "#fff" : "#000" }}>{f.title}</div>
                  {f.description && <div style={{ ...muted, marginTop: "2px" }}>{f.description}</div>}
                  {f.file && <div style={{ ...muted, fontFamily: "ui-monospace, monospace", marginTop: "2px" }}>{f.file}{f.line ? `:${f.line}` : ""}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
        {summary && <div style={{ ...muted, lineHeight: 1.5 }}>{summary}</div>}
      </div>
    );
  }

  // ---- Translation ----
  if (category === "translation" && data) {
    const source = typeof data.source === "string" ? data.source : "";
    const target = typeof data.target === "string" ? data.target : "";
    const sourceLang = typeof data.sourceLang === "string" ? data.sourceLang : "Source";
    const targetLang = typeof data.targetLang === "string" ? data.targetLang : "Target";
    const confidence = typeof data.confidence === "number" ? data.confidence : null;

    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={label}>Translation {sourceLang} → {targetLang}</div>
          {confidence !== null && <div style={{ ...muted, color: "#1E9E5F" }}>{confidence}% confidence</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <div style={{
            padding: "10px 12px",
            borderRadius: "6px",
            backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "#f9f9f9",
            border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #eee",
          }}>
            <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: isDark ? "rgba(255,255,255,0.4)" : "#999", marginBottom: "6px" }}>{sourceLang}</div>
            <div style={{ fontSize: "12px", lineHeight: 1.6, color: isDark ? "rgba(255,255,255,0.7)" : "#444" }}>{source.slice(0, 500)}</div>
          </div>
          <div style={{
            padding: "10px 12px",
            borderRadius: "6px",
            backgroundColor: isDark ? "rgba(255,254,178,0.03)" : "rgba(255,254,178,0.08)",
            border: isDark ? "1px solid rgba(255,254,178,0.15)" : "1px solid #e0d090",
          }}>
            <div style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#fffeb2", marginBottom: "6px" }}>{targetLang}</div>
            <div style={{ fontSize: "12px", lineHeight: 1.6, color: isDark ? "#fff" : "#000" }}>{target.slice(0, 500)}</div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Data Labeling ----
  if (category === "data_labeling" && data) {
    const items = Array.isArray(data.items) ? data.items : [];
    const distribution = typeof data.distribution === "object" && data.distribution ? data.distribution as Record<string, number> : {};
    const totalItems = items.length || (typeof data.totalItems === "number" ? data.totalItems : 0);
    const maxCount = Math.max(...Object.values(distribution), 1);

    return (
      <div style={card}>
        <div style={label}>Data Labeling Report</div>
        <div style={muted}>{totalItems} items labeled</div>
        {Object.keys(distribution).length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {Object.entries(distribution).map(([labelName, count]) => {
              const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0;
              return (
                <div key={labelName} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ width: "80px", fontSize: "11px", color: isDark ? "rgba(255,255,255,0.6)" : "#555", textAlign: "right" }}>{labelName}</div>
                  <div style={{ flex: 1, height: "12px", backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#eee", borderRadius: "6px", overflow: "hidden" }}>
                    <div style={{ width: `${(count / maxCount) * 100}%`, height: "100%", backgroundColor: "#fffeb2", borderRadius: "6px", transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ width: "40px", fontSize: "10px", color: isDark ? "rgba(255,255,255,0.4)" : "#999" }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---- Bug Bounty ----
  if (category === "bug_bounty" && data) {
    const severity = typeof data.severity === "string" ? data.severity : "unknown";
    const vulnType = typeof data.type === "string" ? data.type : "";
    const component = typeof data.component === "string" ? data.component : "";
    const finding = typeof data.finding === "string" ? data.finding : "";
    const poc = typeof data.poc === "string" ? data.poc : "";
    const fix = typeof data.fix === "string" ? data.fix : "";

    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={label}>Security Report</div>
          <SeverityBadge severity={severity} />
        </div>
        {vulnType && <div style={{ fontSize: "13px", fontWeight: 600, color: isDark ? "#fff" : "#000" }}>{vulnType}</div>}
        {component && <div style={{ ...muted, fontFamily: "ui-monospace, monospace" }}>Component: {component}</div>}
        {finding && (
          <div style={{ padding: "10px 12px", borderRadius: "6px", backgroundColor: isDark ? "rgba(255,68,68,0.06)" : "rgba(255,68,68,0.05)", border: isDark ? "1px solid rgba(255,68,68,0.15)" : "1px solid #f5c0c0" }}>
            <div style={{ fontSize: "9px", textTransform: "uppercase", color: "#FF4444", marginBottom: "4px" }}>Finding</div>
            <div style={{ fontSize: "12px", lineHeight: 1.5, color: isDark ? "rgba(255,255,255,0.8)" : "#333" }}>{finding}</div>
          </div>
        )}
        {poc && (
          <pre style={{ margin: 0, padding: "10px", borderRadius: "6px", backgroundColor: isDark ? "rgba(0,0,0,0.4)" : "#f5f5f5", fontSize: "11px", fontFamily: "ui-monospace, monospace", color: isDark ? "rgba(255,255,255,0.7)" : "#333", overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {poc}
          </pre>
        )}
        {fix && (
          <div style={{ padding: "10px 12px", borderRadius: "6px", backgroundColor: isDark ? "rgba(30,158,95,0.06)" : "rgba(30,158,95,0.05)", border: isDark ? "1px solid rgba(30,158,95,0.15)" : "1px solid #b0dfc0" }}>
            <div style={{ fontSize: "9px", textTransform: "uppercase", color: "#1E9E5F", marginBottom: "4px" }}>Recommendation</div>
            <div style={{ fontSize: "12px", lineHeight: 1.5, color: isDark ? "rgba(255,255,255,0.8)" : "#333" }}>{fix}</div>
          </div>
        )}
      </div>
    );
  }

  // ---- Text Writing (default) ----
  if (category === "text_writing" && data) {
    const wordCount = typeof data.wordCount === "number" ? data.wordCount : null;
    const readability = typeof data.readability === "string" ? data.readability : null;

    return (
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={label}>Content Delivery</div>
          <div style={{ display: "flex", gap: "8px" }}>
            {wordCount !== null && <span style={{ ...muted, color: "#1E9E5F" }}>{wordCount} words</span>}
            {readability && <span style={muted}>{readability}</span>}
          </div>
        </div>
        {typeof data.content === "string" && <RawPreview text={data.content} isDark={isDark} />}
      </div>
    );
  }

  // ---- Fallback: raw text preview ----
  if (contentPreview) {
    return (
      <div style={card}>
        <div style={label}>Delivery</div>
        <RawPreview text={contentPreview} isDark={isDark} />
      </div>
    );
  }

  return null;
}

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  const colors: Record<string, { bg: string; text: string }> = {
    critical: { bg: "rgba(255,68,68,0.15)", text: "#FF4444" },
    high: { bg: "rgba(255,140,0,0.15)", text: "#FF8C00" },
    warning: { bg: "rgba(255,254,178,0.15)", text: "#fffeb2" },
    medium: { bg: "rgba(255,254,178,0.15)", text: "#fffeb2" },
    low: { bg: "rgba(30,158,95,0.15)", text: "#1E9E5F" },
    info: { bg: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.5)" },
  };
  const c = colors[s] || colors.info;

  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "9px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      backgroundColor: c.bg,
      color: c.text,
      whiteSpace: "nowrap",
    }}>
      {severity}
    </span>
  );
}

function RawPreview({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <pre style={{
      margin: 0,
      padding: "10px",
      borderRadius: "6px",
      backgroundColor: isDark ? "rgba(0,0,0,0.3)" : "#f5f5f5",
      fontSize: "11px",
      fontFamily: "ui-monospace, monospace",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: "300px",
      overflowY: "auto",
      color: isDark ? "rgba(255,255,255,0.7)" : "#333",
      lineHeight: 1.6,
    }}>
      {text}
    </pre>
  );
}
