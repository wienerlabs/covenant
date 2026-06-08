# Acceptable Use Policy (C-103)

Covenant is an escrow + settlement layer for real work between people and
agents. To keep the marketplace lawful and safe, certain jobs and agent
listings are **prohibited**. Posting them is a breach of this policy and grounds
for removal.

This policy is enforced at two layers:
1. **Automated gate** at job creation — a deterministic moderation hook
   (`app/lib/moderation.ts`) rejects postings that clearly solicit a prohibited
   category. See "Enforcement" below.
2. **Manual review + takedown** — anything the automated gate misses, or a
   contested removal, is handled by the maintainers (report via `SECURITY.md`'s
   contact or the support channel).

## Prohibited categories

You may **not** post jobs or list agents that solicit, facilitate, or deliver:

- **Child sexual abuse material (CSAM)** or any sexualization of minors — zero
  tolerance, reported to authorities.
- **Violence for hire** — soliciting anyone to kill, assault, or physically harm
  a person; "hitman" services.
- **Illegal drugs** — buying, selling, sourcing, or trafficking controlled
  substances.
- **Illegal weapons** — ghost guns, untraceable firearms, 3D-printed firearms,
  or explosive devices.
- **Cyber-attacks** — DDoS-for-hire, deploying malware/ransomware/botnets
  against a target, or unauthorized access to a specific person's accounts or
  devices. *(Defensive security work — detection, prevention, audits,
  pentesting with authorization, red/blue-team, CTF, forensics, research — is
  explicitly allowed.)*
- **Fraud & financial crime** — stolen/cloned payment instruments, carding,
  money-laundering services, or forged identity documents for sale.

This list is not exhaustive; anything illegal in the operating jurisdiction or
that endangers people is prohibited.

## Explicitly allowed

To be unambiguous, the following are **allowed** even though they touch sensitive
topics — the moderation hook is tuned not to block them:

- Security research, malware **detection/analysis**, DDoS **mitigation**, fraud
  **detection**, penetration testing **with authorization**, red/blue-team
  exercises, CTF challenges, forensics.
- Legitimate creative writing and games that depict crime fictionally.
- Drug-discovery / pharmacology research, defensive/educational content.

## Enforcement

- **At creation:** `POST /api/jobs` runs `moderateJobContent(...)` over the job's
  title + description + requirements. A prohibited posting is rejected with HTTP
  **400** and a reason naming the category; nothing is written to the DB or
  chain.
- **Tiers:** child-sexual-abuse and violence-for-hire are blocked unconditionally;
  drugs / weapons / cyber-attack / fraud are blocked only when soliciting and
  *not* framed defensively (to avoid blocking legitimate security/research work).
- **Operator tuning:** additional prohibited terms can be added without a deploy
  via the `MODERATION_EXTRA_TERMS` env var (comma-separated).
- **Appeals & takedown:** a wrongly-blocked legitimate job, or a prohibited job
  that slipped through, can be raised with the maintainers for manual review.

## Limitations

The automated gate is a conservative, deterministic first line — it favors **low
false positives** over perfect recall, so determined abuse may pass the gate and
rely on manual takedown. A higher-recall AI/vendor moderation pass can be layered
on top of `moderateText` later without changing call sites.
