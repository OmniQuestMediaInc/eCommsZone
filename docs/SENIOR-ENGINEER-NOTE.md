# Senior Engineer Integration Note — HumanContactZone Escalation

> **Author:** Senior Coding Engineer, OmniQuest Media Inc. (OQMI)
> **Repository:** eCommsZone
> **Document Type:** Senior Engineer Integration Note
> **PROGRAM_CONTROL:** MKTP-WORK-004
> **Status:** Draft for review
> **Last Updated:** 2026-05-02

---

## 1. Purpose

This note defines how **eCommsZone** routes customer service issues from automated
channels (email, SMS, on-site chat) to the correct **human tier** inside
**HumanContactZone (HCZ)**, with full upstream context preserved.

It establishes:

- The escalation **decision matrix** used by the AI triage layer.
- The **handoff contract** between AI triage and human agents.
- The **integration points** with RedRoomPleasures (RRP), ChatNowZone (CNZ), and
  RedRoomRewards (RRR).
- **ROI** and **governance** controls required by PROGRAM_CONTROL.

The implementation companion files are:

- `src/escalation/escalation.service.ts` — TypeScript escalation service.
- `integrations/wordpress/oqmi-humancontact-hook.php` — WordPress hook example
  for RRP.

---

## 2. Architecture Overview

```
              ┌────────────────────────────────────────────────────┐
              │                   eCommsZone                       │
              │  (listmonk + Brevo + API gateway + audit_log)      │
              └───────────────┬────────────────────────────────────┘
                              │
   ┌──────────────────────────┼─────────────────────────────────┐
   │                          │                                 │
   ▼                          ▼                                 ▼
RRP (WordPress)         CNZ (Live Chat)                 RRR (Rewards)
  │                         │                                  │
  │ contact form,           │ chat session events,             │ reward
  │ SMS reply,              │ AI triage classifications        │ disputes,
  │ campaign reply          │                                  │ tier issues
  │                         │                                  │
  └──────────────┬──────────┴───────────────┬──────────────────┘
                 │                          │
                 ▼                          ▼
        ┌──────────────────────────────────────────┐
        │   AI Triage Layer (eCommsZone API)       │
        │   - intent classification                │
        │   - sentiment / risk scoring             │
        │   - tenant + tier lookup                 │
        │   - PII / compliance pre-check           │
        └─────────────────┬────────────────────────┘
                          │   EscalationDecision
                          ▼
        ┌──────────────────────────────────────────┐
        │   EscalationService (this note)          │
        │   - applies decision matrix              │
        │   - assembles HCZ context envelope       │
        │   - persists to audit_log                │
        │   - dispatches to HumanContactZone       │
        └─────────────────┬────────────────────────┘
                          │   HCZ Ticket (HTTPS, signed)
                          ▼
        ┌──────────────────────────────────────────┐
        │            HumanContactZone              │
        │  Tier 1: Standard CS                     │
        │  Tier 2: Diamond Concierge               │
        │  Tier 3: Moderation Agent                │
        └──────────────────────────────────────────┘
```

### Components

| Component | Role |
|---|---|
| **AI Triage Layer** | Classifies inbound messages (intent, sentiment, risk, language) and produces a structured `TriageSignal`. |
| **EscalationService** | Pure decision + dispatch service. Stateless apart from `audit_log` writes. Owns the decision matrix. |
| **HumanContactZone (HCZ)** | External system that receives signed ticket payloads and assigns them to a human queue (Standard CS / Diamond Concierge / Moderation Agent). |
| **audit_log** | Existing eCommsZone Postgres table; every escalation writes a row for traceability. |

### Why a separate service

- Keeps tier logic out of route handlers and tenant-specific code.
- Provides a **single, auditable choke-point** for any human handoff.
- Allows the decision matrix to evolve without touching RRP / CNZ / RRR plugins.

---

## 3. Escalation Decision Matrix

The matrix is evaluated **top-to-bottom**; the first matching row wins. This
makes governance / moderation rules dominant over commercial tier rules.

| # | Condition (any of) | Tier | Priority | Rationale |
|---|---|---|---|---|
| 1 | Content flagged by moderation classifier (CSAM, threats, self-harm, illegal) | **Moderation Agent** | P0 | Legal & safety obligation; bypasses all commercial routing. |
| 2 | CASL / PIPEDA / Law 25 complaint, unsubscribe abuse, data-export request | **Moderation Agent** | P1 | Regulatory; must be handled by trained agents. |
| 3 | Subscriber tier = `diamond` OR lifetime value ≥ CAD $2 000 | **Diamond Concierge** | P1 | Premium SLA: 15-min first response. |
| 4 | Subscriber tier = `gold` AND sentiment ≤ -0.6 (very negative) | **Diamond Concierge** | P2 | Churn-risk save path. |
| 5 | Intent = `billing_dispute` AND amount ≥ CAD $250 | **Diamond Concierge** | P2 | High-revenue protection. |
| 6 | Intent = `account_recovery` AND multiple failed attempts | **Standard CS** | P2 | Standard but elevated priority. |
| 7 | Intent ∈ { `general_inquiry`, `delivery`, `product_question`, `password_reset` } | **Standard CS** | P3 | Default human queue. |
| 8 | AI confidence < 0.50 on intent **and** none of the above | **Standard CS** | P3 | Default to human when AI is unsure. |

Notes:

- Tier identification draws from RRR (`rewards.tier`, `rewards.lifetime_value_cad`).
- Sentiment scores are produced by the AI triage layer on the range `[-1, 1]`.
- All thresholds are **environment-driven** (see `escalation.service.ts`) so they
  can be tuned without redeploying.

---

## 4. AI + Human Handoff Process

The handoff is a five-step pipeline. Each step has a unique `correlationId`
that flows end-to-end and is logged on every hop.

1. **Capture.** Inbound event arrives via RRP webhook, CNZ chat event, or RRR
   ticket. The capturing integration generates the `correlationId` (UUID v4).
2. **Triage.** AI triage layer enriches the event into a `TriageSignal`
   (intent, confidence, sentiment, risk flags, language).
3. **Decide.** `EscalationService.decide()` walks the matrix and returns an
   `EscalationDecision { tier, priority, reasonCode, matchedRule }`.
4. **Package.** `EscalationService.buildEnvelope()` assembles a normalized
   **HCZ context envelope** (see §5) including:
   - subscriber profile slice (tier, language, contact preferences),
   - last 5 messages (redacted of PII not needed by the tier),
   - source artifact links (RRP order, CNZ transcript, RRR reward record).
5. **Dispatch.** `EscalationService.dispatch()` POSTs the envelope to HCZ,
   signed with HMAC-SHA256 (key from env `HCZ_HMAC_SECRET`), with a 10 s
   timeout, exponential back-off (3 attempts) on 5xx/network errors, and
   writes an `audit_log` row regardless of outcome.

**Failure mode.** If HCZ is unreachable after retries, the envelope is queued in
the `escalation_outbox` table (existing pattern in eCommsZone) and the
`audit_log` entry is marked `status = 'queued_for_retry'`. A worker drains
the outbox.

---

## 5. HCZ Context Envelope

Stable, versioned JSON contract sent to HumanContactZone.

```jsonc
{
  "schemaVersion": "1.0",
  "correlationId": "5e4b2c…",           // end-to-end trace id
  "tenantId": "redroompleasures",
  "source": "rrp" | "cnz" | "rrr" | "ecommszone",
  "tier": "standard_cs" | "diamond_concierge" | "moderation_agent",
  "priority": "P0" | "P1" | "P2" | "P3",
  "reasonCode": "MOD_FLAG" | "DIAMOND_TIER" | "CHURN_RISK" | "…",
  "matchedRule": 3,                     // matrix row that fired
  "subscriber": {
    "id": "sub_…",
    "displayName": "…",
    "language": "en" | "fr",
    "tier": "diamond" | "gold" | "silver" | null,
    "lifetimeValueCad": 0,
    "contactPreference": "email" | "sms" | "chat"
  },
  "issue": {
    "intent": "billing_dispute",
    "intentConfidence": 0.92,
    "sentiment": -0.71,
    "riskFlags": ["pii_present"],
    "summary": "AI-generated 1-line summary",
    "lastMessages": [ { "ts": "…", "from": "subscriber", "body": "…" } ]
  },
  "links": {
    "rrpOrderUrl": "https://…",
    "cnzTranscriptUrl": "https://…",
    "rrrRewardUrl": "https://…",
    "auditLogId": 12345
  },
  "createdAt": "2026-05-02T10:00:00Z"
}
```

Signature is sent in the `X-OQMI-Signature` header as
`sha256=<hex(HMAC_SHA256(secret, body))>`.

---

## 6. Integration Points

### 6.1 RedRoomPleasures (RRP) — WordPress

- File: `integrations/wordpress/oqmi-humancontact-hook.php`.
- Hooks: `wpforms_process_complete`, `woocommerce_order_status_failed`,
  custom action `oqmi_rrp_escalate`.
- Calls eCommsZone API endpoint `POST /v1/escalation` with the raw event;
  the API server invokes `EscalationService`.
- Authenticates with the per-tenant API key stored in
  `wp_options` under `oqmi_ecommszone_api_key` (encrypted at rest).

### 6.2 ChatNowZone (CNZ) — Live Chat

- CNZ already emits chat events to eCommsZone via the existing webhook route.
- Add an `intent: 'request_human'` handler that calls
  `EscalationService.handleEvent({ source: 'cnz', … })`.
- Transcript URL is included in the envelope so HCZ agents land in-context.

### 6.3 RedRoomRewards (RRR) — Loyalty

- RRR is the **source of truth** for `subscriber.tier` and
  `lifetimeValueCad`. `EscalationService.fetchSubscriberContext()` reads
  from RRR via its internal API (`GET /rrr/subscribers/:id`) with a 3 s
  timeout and a 60 s in-memory cache to avoid stampedes.
- Reward disputes raised in RRR call the same escalation endpoint with
  `source: 'rrr'`.

---

## 7. ROI Tracking Recommendations

We recommend tracking these KPIs in the Looker / Metabase dashboard already
used for eCommsZone. All can be computed from `audit_log` joined with HCZ's
ticket-resolution feed.

| KPI | Definition | Target |
|---|---|---|
| **Auto-resolve rate** | % of inbound issues resolved without human escalation | ≥ 60% |
| **Correct-tier rate** | % of escalations not re-routed by HCZ to a different tier | ≥ 95% |
| **Time to first human response** | median seconds, by tier | Diamond ≤ 15 min; Standard ≤ 4 h |
| **Diamond churn save rate** | % of Diamond tier escalations that retain subscription 30 d later | ≥ 80% |
| **Cost per contact** | (HCZ labour cost) / (escalations) | trending down 5%/quarter |
| **Moderation precision** | % of Tier-3 escalations confirmed as policy violations | ≥ 85% |

The `reasonCode` and `matchedRule` fields are designed to make these queries
trivial; do not drop them from the audit log.

---

## 8. Governance & Compliance

- **PROGRAM_CONTROL:** every PR touching escalation code references
  `MKTP-WORK-004` and must satisfy all ship-gates in `MKTP_WORK-004.md`.
- **Secrets:** `HCZ_ENDPOINT`, `HCZ_HMAC_SECRET`, `RRR_API_BASE`, and
  `RRR_API_KEY` are read from environment only; placeholders go in
  `.env.example`. Never logged.
- **CASL / PIPEDA / Law 25:**
  - Subscriber data stays in Canada (HCZ is hosted in Hetzner Montréal).
  - Envelopes redact fields not needed by the receiving tier
    (e.g. payment method details never leave eCommsZone).
  - Right-to-erasure: `audit_log` rows referencing erased subscribers are
    pseudonymized, not deleted, to preserve the ship-gate audit trail.
- **Logging:** never log message bodies at INFO. DEBUG logging of bodies is
  permitted only when `LOG_LEVEL=debug` and `NODE_ENV !== 'production'`.
- **GateGuardian:** secret-scan must pass; HIGH/CRITICAL findings block merge.
- **TLS:** HTTPS enforced on all HCZ calls; certificate verification is
  **never** disabled.
- **Input validation:** envelope is validated with `zod` before dispatch and
  on receipt at HCZ; reject on schema violation.
- **Rate limiting:** escalations are rate-limited per tenant (default 60/min)
  to protect HCZ from upstream abuse loops.

---

## 9. Operational Notes

- Roll out behind feature flag `escalation.v1.enabled` per tenant.
- Runbook lives in `docs/runbooks/escalation.md` (to be added in a follow-up
  PR; out of scope for this directive).
- On-call: same rotation as eCommsZone API gateway.

---

## 10. Open Questions

1. Should Tier-2 (Diamond) auto-page on P1 outside business hours, or queue?
   *Pending product decision; service supports both via env flag.*
2. Do we need French/English language-based routing inside Standard CS?
   *Possible v1.1; envelope already carries `language`.*

---

*End of Senior Engineer Integration Note — HumanContactZone Escalation.*
