# eCommsZone — Architecture

## Overview

eCommsZone is a **communications service bureau** that provides a single, multi-tenant API surface for email, SMS, and conversational messaging across all OmniQuest Media Inc properties.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Tenant Services                          │
│  ChatNowZone │ RedRoomPleasures │ RedRoomRewards │          │
│  SenSync     │ Cyrano           │ OmniQuest Int. │          │
└──────────────────────┬──────────────────────────────────────┘
                       │  HTTPS + Tenant API Key
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              eCommsZone API Gateway  (port 4000)            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ /email   │  │ /sms     │  │ /webhook │  │ /health   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────────┘  │
│       │              │              │                        │
│  ┌────▼─────────────▼──────────────▼────────────────────┐  │
│  │                  Service Layer                        │  │
│  │  ListmonkService │ BrevoService │ AuditService        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────┬───────────────────┬─────────────────────────────────┘
       │                   │
       ▼                   ▼
┌────────────┐     ┌──────────────────┐
│  listmonk  │     │   Brevo API      │
│  (port 9000│     │  ┌────────────┐  │
│  internal) │     │  │ Email SMTP │  │
│            │     │  │ SMS API    │  │
│  Campaigns │     │  │ Conversations│ │
│  Lists     │     │  └────────────┘  │
│  Templates │     └──────────────────┘
└─────┬──────┘
      │
      ▼
┌──────────────┐     ┌───────────┐
│  PostgreSQL  │     │   Redis   │
│  (port 5432) │     │ (rate-    │
│              │     │  limiting │
│  Subscribers │     │  / queue) │
│  Events      │     └───────────┘
│  Audit log   │
└──────────────┘
```

---

## Services

### API Gateway (`/api`)
- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express
- **Responsibilities**:
  - Authenticate incoming requests via tenant API key (header `X-Tenant-Key`)
  - Route to the correct listmonk list/campaign or Brevo channel
  - Apply per-tenant rate limiting (Redis-backed)
  - Validate and sanitize all payloads
  - Emit audit events to PostgreSQL
  - Receive and verify inbound webhooks from Brevo (delivery receipts, bounces, unsubscribes)

### listmonk
- **Version**: 4.x (latest stable)
- **Purpose**: Manages subscriber lists, campaign scheduling, transactional email dispatch
- **Access**: Admin UI exposed only on the internal Docker network (not public-facing)
- **Transport**: Brevo SMTP relay

### Brevo
- **Email**: Transactional and marketing email via Brevo SMTP relay
- **SMS**: Programmatic SMS via Brevo Transactional SMS API
- **Conversations**: Live-chat widget integration for ChatNowZone via Brevo Conversations API

### PostgreSQL
- Shared database for listmonk schema + eCommsZone custom tables (`audit_log`, `tenants`)
- Provisioned by `infra/postgres/init.sql`

### Redis
- Per-tenant request rate-limiting
- Future: async job queue for bulk dispatch

---

## Multi-Tenancy Model

Each tenant is identified by a secret API key (`X-Tenant-Key` header). The gateway:
1. Looks up the tenant record to retrieve its listmonk list IDs and Brevo sender identity
2. Enforces rate limits specific to that tenant's tier
3. Tags all outbound messages with the tenant identifier for reporting

Tenant configurations live in `integrations/tenants/<slug>/config.json`.

---

## Data Flow — Transactional Email

```
POST /email/transactional
  →  Auth middleware validates X-Tenant-Key
  →  Rate-limit check (Redis)
  →  BrevoService.sendTransactionalEmail()
        → Brevo Transactional Email API
        → Returns messageId
  →  AuditService.log(event)
  →  200 { messageId }
```

## Data Flow — Campaign / List Email

```
POST /email/campaign  (schedule or trigger a listmonk campaign)
  →  Auth + rate-limit
  →  ListmonkService.triggerCampaign()
        → listmonk REST API  →  queues send via Brevo SMTP
  →  AuditService.log(event)
  →  202 { campaignId }
```

## Data Flow — Inbound Webhook (Brevo → eCommsZone)

```
POST /webhook/brevo
  →  Webhook signature verified (HMAC)
  →  Event type dispatched:
       bounce     → mark subscriber bounced in listmonk + audit
       unsubscribe→ remove from listmonk list + audit
       delivered  → audit log only
```

---

## Security

| Control | Implementation |
|---|---|
| Transport | TLS 1.2+ enforced at Nginx |
| Auth | Per-tenant HMAC API keys (SHA-256) |
| Secrets | Environment variables; never committed |
| Webhook integrity | HMAC-SHA256 signature verification |
| Rate limiting | Per-tenant Redis token bucket |
| DB access | listmonk + API use separate Postgres roles |
| Network | listmonk + Postgres not exposed to public internet |

---

## Environments

| Environment | Branch | Host |
|---|---|---|
| Development | any | `localhost` (Docker Compose) |
| Staging | `develop` | `staging.ecommszone.internal` |
| Production | `main` | `ecommszone.internal` |
