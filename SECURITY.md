# Security Policy

Covenant is an on-chain escrow + agent-payment protocol (Solana Anchor program
+ Next.js API + SDK/MCP). Funds move through a deployed program, so we take
vulnerability reports seriously and welcome coordinated disclosure.

> **Status:** the program is currently deployed on **devnet only**
> (`5hstj5grBUL1BeSaPLYpgkD6n3ALasmbseRvKRFfCVNT`). No real-value funds are at
> risk today. This policy is the standing process we will carry into mainnet.

## Reporting a vulnerability

**Preferred — GitHub private advisory:**
[Report a vulnerability](https://github.com/wienerlabs/covenant/security/advisories/new).
This opens a private channel visible only to the maintainers; please use it for
anything sensitive.

**Email (alternative):** `security@wienerlabs.com`. PGP available on request.
Use this only if you cannot file a GitHub advisory.

Please include:
- A description of the issue and the **impact** (what an attacker gains).
- **Reproduction steps** or a proof-of-concept (a failing test, a transaction,
  or a request/response trace).
- The affected component + version/commit (program, API route, SDK, MCP).
- Any suggested remediation.

**Do not** open a public issue, PR, or social-media post for a security bug
before it is fixed and disclosed.

## Scope

**In scope**
- The Anchor program under `programs/covenant/` — instruction logic, account
  validation, PDA derivation, arithmetic, state-transition guards.
- The web API under `app/app/api/**` — auth, payment verification (x402),
  webhook signing/verification, admin endpoints, rate limiting, SSRF.
- The SDK (`app/lib/sdk.ts`, published package) and the MCP server.
- Settlement / reconciliation logic that mirrors chain state into the DB.

**Out of scope**
- Anything requiring a compromised user device, wallet, or stolen private key.
- Social engineering, phishing, or physical attacks.
- Denial of service / volumetric attacks against public RPC or the demo site.
- Vulnerabilities only reproducible against **devnet test funds** with no
  mainnet analogue, or that require devnet-faucet abuse.
- Findings in third-party dependencies already tracked by `npm audit` /
  `cargo audit` (report upstream; we monitor these in CI — see
  `.github/workflows/security.yml`).
- Missing best-practice headers with no demonstrated impact.

## Severity

We triage with a CVSS-style rubric tailored to an escrow protocol:

| Severity | Example |
|----------|---------|
| **Critical** | Drain or lock of escrowed funds; unauthorized `finalize`/`resolve`; minting settlement without payment; signature/account checks bypassable on a real instruction. |
| **High** | Bypassing server-side tx verification or x402 payment verification; forging a webhook signature; privilege escalation on an admin endpoint; replay that double-pays. |
| **Medium** | DB↔chain drift that the reconciler does **not** heal; rate-limit bypass; SSRF reaching internal targets; information disclosure of another user's data. |
| **Low** | Sensitive logging, missing hardening, non-exploitable input validation gaps. |

## Disclosure process

1. **Acknowledge** — we aim to respond within **3 business days**.
2. **Triage** — we confirm, assign a severity, and agree on a fix window with
   you (typically ≤30 days for Critical/High, ≤90 days otherwise).
3. **Fix + verify** — the fix lands with a regression test so the issue cannot
   silently reopen (see `app/tests/unit/`, security regression suite).
4. **Disclose** — we publish a GitHub Security Advisory crediting you (unless
   you prefer to stay anonymous) once a fix is released.

## Safe harbor

We will not pursue or support legal action against researchers who:
- Make a good-faith effort to follow this policy,
- Only test against **devnet / localnet** (never mainnet or other users' funds),
- Do not access, modify, or exfiltrate data that is not their own, and
- Give us a reasonable window to remediate before public disclosure.

If in doubt about whether an action is authorized, ask first via the private
advisory channel above.

## Rewards

There is no monetary bug-bounty program while the protocol is devnet-only.
Valid reports are credited in the published advisory and our changelog. A funded
bounty scope will be defined as part of mainnet launch (roadmap C-049/C-050).
