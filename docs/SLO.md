# Service Level Objectives & Error Budget (C-114)

What "healthy" means for Covenant, in numbers — so reliability is a tracked
target, not a vibe. Every indicator below maps to a series already exposed by
[`/api/metrics`](../app/app/api/metrics/route.ts) (Prometheus format) or the
[`/api/health`](../app/app/api/health/route.ts) endpoint, so these SLOs are
**measurable today**, not aspirational.

> **Status:** devnet. The targets below are the standing policy we carry into
> mainnet; the *numbers* are initial objectives to be tuned once we have a few
> weeks of production data. Dashboards (C-111) and alerting (C-112) visualize
> and page on these; this document defines them.

## Service Level Indicators (SLIs)

| # | SLI | How it is measured (real series) |
|---|-----|----------------------------------|
| 1 | **API availability** | `/api/health` returns `ok:true` (db + schema + env all green). Uptime probe hits it on an interval. |
| 2 | **Database availability** | `covenant_db_up` gauge (`1` = reachable). |
| 3 | **API/DB latency** | `covenant_query_slow_total` / `covenant_query_very_slow_total` over `covenant_query_total`; `covenant_query_avg_duration_ms`. |
| 4 | **Error rate** | `covenant_error_buffer_count` (recent unhandled errors) + HTTP 5xx ratio at the edge. |
| 5 | **Settlement integrity** | No job stuck in a non-terminal `covenant_jobs_by_status{status}` bucket beyond its SLA; the reconciler (C-021/C-137) reports zero unhealed drift. |
| 6 | **Cache health** | `covenant_cache_hits_total` / `covenant_cache_misses_total` hit ratio; `covenant_cache_errors_total`. |

## Objectives (SLOs)

Measured over a **rolling 30-day window** unless noted.

| SLI | Objective |
|-----|-----------|
| API availability (#1) | **≥ 99.5%** of probes return `ok:true` (~3.6 h/month budget). Cold-start roundtrips < 5 s are not counted as down. |
| Database availability (#2) | `covenant_db_up == 1` **≥ 99.5%** of scrapes. |
| Latency (#3) | **< 1%** of queries are "slow" (`covenant_query_slow_total / covenant_query_total`); **0** sustained `covenant_query_very_slow_total` growth. API p95 < 800 ms, p99 < 2 s (excluding cold starts). |
| Error rate (#4) | HTTP 5xx **< 0.5%** of requests; `covenant_error_buffer_count` trends to 0 (no standing unhandled errors). |
| Settlement integrity (#5) | **100%** — no funds double-paid, no escrow stuck past SLA, reconciler heals all drift (proven by the C-136 chaos + C-137 reconciliation suites). This is a **hard** objective: it has no error budget. |
| Cache health (#6) | Hit ratio **≥ 80%** in steady state; `covenant_cache_errors_total` flat. |

### SLA windows for "stuck escrow" (#5)

| Transition | Expected to complete within |
|------------|-----------------------------|
| `Delivered → Finalized` (auto-release crank) | 1 h after the dispute window closes |
| `Disputed → Resolved` (multisig) | per governance SLA (manual) |
| DB mirror vs chain drift | healed within one reconciler pass (≤ 5 min cron) |

## Error budget

For every SLO with a budget, **error budget = 1 − objective** over the window.

| SLO | Budget (30 d) |
|-----|---------------|
| API availability 99.5% | ~3.6 hours of "not ok" |
| Database availability 99.5% | ~3.6 hours of `db_up == 0` |
| Error rate < 0.5% | 0.5% of total requests may be 5xx |

**Burn-rate policy** (consumed via alerting, C-112):

- **Fast burn** — ≥ 2% of the 30-day budget spent in 1 hour → **page** on-call.
- **Slow burn** — ≥ 10% spent in 6 hours → open a ticket, investigate same day.
- **Budget exhausted** — freeze non-reliability changes (no new features to the
  affected surface) until the SLO recovers and a postmortem lands.
- **Settlement integrity (#5)** has no budget: any confirmed double-pay or
  stuck-escrow incident is a Sev-1, halts settlement-touching deploys, and
  triggers an immediate postmortem.

## How it is tracked

1. **Scrape** `/api/metrics` with Prometheus / Grafana Agent / Datadog (no
   pushgateway needed — it is already Prometheus exposition format).
2. **Probe** `/api/health` from an external uptime monitor for SLI #1.
3. **Dashboard** (C-111) renders these series; **alerts** (C-112) implement the
   burn-rate policy above.
4. **Review** the SLOs monthly; tune the numbers against real data and record
   changes here.

## Known gaps (follow-ups, not blockers)

These would tighten measurement; tracked separately so this doc stays honest:

- `/api/health` currently checks **db + schema + env**. RPC reachability,
  program reachability, and crank liveness land with **C-113** — SLO #1 expands
  to include them then.
- A dedicated `covenant_settlement_total{result="ok|failed"}` counter would let
  SLI #5 be a direct success ratio instead of a derived "nothing stuck" check.
  Recommended alongside the real auto-release crank (C-014/C-015).
- p95/p99 latency is approximated from the slow-query buckets until a histogram
  series is added.
