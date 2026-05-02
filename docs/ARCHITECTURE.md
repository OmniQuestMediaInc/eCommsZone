# eCommsZone — Architecture

## 1. One-paragraph summary

eCommsZone is the OQMI-wide communications service bureau. It is a small,
well-bounded service composed of **listmonk** (orchestration, audience,
templates, audit) and **PostgreSQL** (durable storage), fronted by a thin
HTTP API and a first-class Node.js client. All actual delivery — SMTP,
SMS, conversations — is performed by **Brevo**. OQMI applications never
talk to Brevo directly; they always go through eCommsZone.

## 2. Components

```
            ┌─────────────────────────────┐
            │   OQMI applications         │
            │   (eCommZone, RRR, WP, …)   │
            └────────────┬────────────────┘
                         │ Bearer token (ECOMMSZONE_API_TOKEN)
                         ▼
       ┌───────────────────────────────────────────┐
       │           eCommsZone API                  │
       │   (listmonk public API + OQMI shims)      │
       └───────┬───────────────────────────┬───────┘
               │                           │
               ▼                           ▼
       ┌──────────────┐            ┌───────────────┐
       │  listmonk    │            │ Webhook ingress│
       │  (Go)        │            │ /webhooks/brevo│
       └──────┬───────┘            └────────┬──────┘
              │                             │
              ▼                             │
       ┌──────────────┐                     │
       │ PostgreSQL   │◄────────────────────┘
       │ (durable)    │
       └──────────────┘

              ▲
              │ SMTP / HTTPS
              ▼
       ┌──────────────┐
       │   Brevo      │  Email · SMS · Conversations
       └──────────────┘
```

## 3. Data flow

### 3.1 Transactional email
1. Caller invokes `client.sendEmail({ templateId, to, variables })`.
2. eCommsZone authenticates the caller via the bearer token.
3. eCommsZone looks up the template in listmonk, renders it with merge
   variables, and submits to listmonk's transactional endpoint
   (`POST /api/tx`).
4. listmonk relays the rendered MIME message via SMTP to Brevo.
5. Brevo delivers and posts events to `/webhooks/brevo/email`.
6. The webhook ingress updates suppression and the audit log in Postgres.

### 3.2 Transactional SMS
Identical flow, but step 4 calls Brevo's transactional SMS API
(`/v3/transactionalSMS/sms`) instead of SMTP. Templates are stored as
`.txt` files and rendered server-side.

### 3.3 Bulk send (campaign or fan-out)
1. Caller invokes `client.sendBulk({ channel, templateId, listId | recipients, … })`.
2. eCommsZone creates (or reuses) a listmonk campaign or transactional
   batch, assigns the audience, and schedules it.
3. listmonk's worker pool dispatches messages at the configured rate
   (`config/listmonk.toml: app.message_rate`).
4. Delivery and event tracking proceed as in 3.1 / 3.2.

## 4. Key design decisions

| Decision | Rationale |
|---|---|
| **Self-host listmonk** | We need durable audit logs, lists, templates, and segmentation we own. SaaS replacements would force lock-in and reduce auditability. |
| **Brevo is the sole delivery provider** | Negotiated pricing at the holding-company level, single deliverability surface to monitor. Pluggable — we can add a fallback provider later behind the same API. |
| **PostgreSQL** | listmonk's only supported store; also matches the rest of OQMI's stack. |
| **Single shared API token per service** | Simpler than mTLS in v1; rotated regularly. v2 may move to OAuth client credentials. |
| **Idempotency keys on every send** | Required so retries (network, queue) never produce duplicate messages. |
| **No PII in logs** | Body and recipient details logged at debug only; default level is info. |

## 5. Compliance & privacy

* GDPR / CCPA: subscribers can be exported and wiped via listmonk's
  privacy endpoints (`/api/profile/export`, `/api/subscribers/<id>` DELETE).
  See `config/listmonk.toml: [privacy]`.
* CASL / CAN-SPAM: every marketing email includes the OQMI physical
  address and a one-click unsubscribe link (RFC 8058).
* TCPA / CRTC: every SMS includes "Reply STOP to opt out" — the value
  is enforced in templates (`templates/transactional/2fa-sms.txt`) and at
  the API layer for ad-hoc sends.
* Suppression lists are bidirectional: Brevo events feed listmonk, and
  listmonk's blocklist is propagated to Brevo on a 5-minute schedule.

## 6. Scaling considerations

| Dimension | Plan |
|---|---|
| Throughput | Tune `concurrency` and `message_rate` in `listmonk.toml`. Brevo's quota is far higher than our peak. |
| Postgres | Vertical scale first (more RAM); shard subscribers by brand only if we exceed 50M rows. |
| HA | Run listmonk in stateless mode behind a load balancer; Postgres uses managed HA (e.g. Aurora / RDS Multi-AZ). |
| DR | Point-in-time recovery on Postgres + nightly logical backup off-region. |

## 7. Failure modes & mitigations

| Failure | Behaviour | Mitigation |
|---|---|---|
| Brevo API outage | listmonk retries; queue grows | Alert at queue depth > N; standby SMTP provider planned. |
| Postgres outage | listmonk refuses writes; API returns 503 | Multi-AZ; read replica for analytics. |
| Webhook flood | DoS risk on `/webhooks/brevo/*` | Cloudflare rate-limits; signature verification. |
| Template render error | Send rejected at API layer | Strong template tests in CI; fail closed. |
| Token leak | Unauthorized sends | Rotate via `ECOMMSZONE_API_TOKEN`; audit `x-oqmi-service` header. |
