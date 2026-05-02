# eCommsZone

> **OmniQuest Media Inc. — Centralized Communications Service Bureau**

eCommsZone is the proprietary, self-hosted email, SMS, and customer-conversation
platform that powers every property in the OmniQuest Media Inc. (OQMI) ecosystem.
It consolidates transactional messaging, marketing campaigns, two-way SMS,
and conversational support behind a single governed service so that every
OQMI brand — eCommZone marketplaces, RRR Rewards, partner sites, and internal
tooling — uses one authoritative communications backbone.

---

## ✨ Purpose

| Goal | Why it matters |
|---|---|
| **Single source of truth** for outbound messaging | Eliminates fragmented per-app SMTP/SMS keys |
| **Governance & compliance** (CAN-SPAM, CASL, GDPR, TCPA) | Centralized suppression lists, consent, and audit trail |
| **Cost control** | One delivery contract (Brevo) negotiated at the holding-company level |
| **Brand consistency** | Shared template library and design tokens across all OQMI brands |
| **Observability** | One set of dashboards for deliverability, bounce, and engagement |

---

## 🏗️ Architecture

eCommsZone is composed of two cooperating layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                       OQMI Applications                         │
│   (eCommZone, RRR Rewards, WordPress sites, internal tooling)   │
└──────────────────────────────┬──────────────────────────────────┘
                               │  HTTPS  (REST + Node.js client)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    eCommsZone Service Bureau                    │
│                                                                 │
│   ┌──────────────────────┐         ┌──────────────────────┐     │
│   │   listmonk (self-    │ ──────► │   Brevo (delivery    │     │
│   │   hosted orchestra-  │         │   provider — SMTP,   │     │
│   │   tor: lists,        │         │   SMS, Conversa-     │     │
│   │   campaigns, tem-    │         │   tions API)         │     │
│   │   plates, audit)     │         └──────────────────────┘     │
│   └──────────┬───────────┘                                      │
│              │                                                  │
│              ▼                                                  │
│   ┌──────────────────────┐                                      │
│   │   PostgreSQL         │   (subscribers, campaigns, logs)     │
│   └──────────────────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
```

* **listmonk** — self-hosted open-source newsletter & messaging manager.
  It owns subscribers, lists, segments, templates, scheduling, and the
  audit trail. Configured via [`config/listmonk.toml`](config/listmonk.toml).
* **Brevo** (formerly Sendinblue) — production delivery provider for
  transactional email, marketing email, transactional SMS, and the
  Conversations inbox. Configured via
  [`config/brevo-config.json`](config/brevo-config.json).
* **PostgreSQL 16** — backing store for listmonk.
* **Node.js client** ([`integrations/nodejs`](integrations/nodejs)) —
  the canonical SDK every OQMI service should use to talk to eCommsZone.
* **WordPress plugin** (`oqmi-ecommszone`) — bridges WordPress / WooCommerce
  events into eCommsZone. Lives in
  [`integrations/wordpress`](integrations/wordpress).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

---

## 🚀 Quick Start

> **Prerequisites:** Docker 24+, Docker Compose v2, a Brevo account with API
> key, and a verified sending domain.

```bash
# 1. Clone & configure
git clone https://github.com/OmniQuestMediaInc/eCommsZone.git
cd eCommsZone
cp .env.example .env
# Edit .env — set DB password, listmonk admin user, BREVO_API_KEY, etc.

# 2. Initialize the listmonk database (first run only)
docker compose run --rm listmonk ./listmonk --install --yes

# 3. Bring the stack up
docker compose up -d

# 4. Verify health
curl -fsS http://localhost:9000/api/health
```

The listmonk admin UI is now available at <http://localhost:9000>.
Continue with the full walkthrough in [`docs/SETUP.md`](docs/SETUP.md).

---

## 📚 Documentation

| Document | Description |
|---|---|
| [`docs/SETUP.md`](docs/SETUP.md)             | End-to-end installation & operations guide |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, data flow, scaling notes |
| [`docs/API.md`](docs/API.md)                 | Public eCommsZone API reference |
| [`docs/TEMPLATES.md`](docs/TEMPLATES.md)     | Authoring & maintaining templates |

---

## 🧭 Governance

This repository operates under OQMI's `PROGRAM_CONTROL` directive system.
The active directive for this work is
[`PROGRAM_CONTROL/DIRECTIVES/QUEUE/MKTP_WORK-004.md`](PROGRAM_CONTROL/DIRECTIVES/QUEUE/MKTP_WORK-004.md).

All contributions must:

1. Pass the ship-gates defined in the directive.
2. Comply with the standards in [`.github/copilot-instructions.md`](.github/copilot-instructions.md).
3. Never commit secrets — use `.env` (gitignored) or a managed secret store.

---

## 🔐 Security

* Secrets are **never** committed. `.env` and any `*.secret.*` files are
  in [`.gitignore`](.gitignore).
* Brevo and listmonk API keys are loaded only from environment variables.
* TLS termination is expected at the OQMI edge (Cloudflare / NGINX).
* Report vulnerabilities privately to `security@omniquestmedia.com`.

---

## 📄 License

Proprietary — © OmniQuest Media Inc. All rights reserved.
See [`LICENSE`](LICENSE).
> **OmniQuest Media Inc — Centralized Communications Service Bureau**

eCommsZone is the single, authoritative communications layer for all OmniQuest Media properties. It orchestrates transactional and marketing email, SMS, and in-app messaging across every tenant service using **listmonk** (self-hosted) as the campaign/subscription orchestration engine and **Brevo** as the multi-channel delivery provider.

---

## Tenants

| Service | Type |
|---|---|
| ChatNowZone | Live-chat platform |
| RedRoomPleasures | Adult content marketplace |
| RedRoomRewards | Loyalty & rewards program |
| SenSync | Senior-care coordination app |
| Cyrano | AI-assisted messaging product |
| OmniQuest Internal | Internal tooling & ops |

---

## Architecture Overview

```
Tenant Service
     │  REST / SDK
     ▼
eCommsZone API Gateway  (Node/TypeScript — port 4000)
     │
     ├──► listmonk  (self-hosted — port 9000)
     │        └──► Brevo SMTP  (email delivery)
     │
     ├──► Brevo API  (SMS / Conversations / transactional email)
     │
     └──► PostgreSQL  (subscribers, events, audit log)
```

Full architecture details: [`docs/architecture.md`](docs/architecture.md)

---

## Quick Start (Local / Docker)

### Prerequisites
- Docker ≥ 24 and Docker Compose v2
- Node.js ≥ 20 (for local API development)

```bash
# 1. Clone and configure
git clone https://github.com/OmniQuestMediaInc/eCommsZone.git
cd eCommsZone
cp .env.example .env
# Edit .env with real credentials

# 2. Start the full stack
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Run listmonk migrations (first run only)
docker compose -f infra/docker/docker-compose.yml exec listmonk \
  ./listmonk --config /listmonk/config.toml --install

# 4. API gateway (development hot-reload)
cd api && npm install && npm run dev
```

The API gateway is available at `http://localhost:4000`.  
The listmonk admin UI is available at `http://localhost:9000`.

---

## Repository Layout

```
eCommsZone/
├── .github/                  GitHub Actions CI/CD + CODEOWNERS
├── api/                      Node/TypeScript API gateway
│   ├── src/
│   │   ├── routes/           HTTP route handlers (email, sms, tenants…)
│   │   ├── middleware/       Auth, rate-limit, validation, logging
│   │   ├── services/         Business logic (listmonk, brevo, audit…)
│   │   └── index.ts          Entry point
│   ├── package.json
│   └── tsconfig.json
├── integrations/
│   ├── brevo/                Brevo API client wrappers
│   └── tenants/              Per-tenant config & overrides
├── listmonk/                 listmonk config + custom template assets
│   └── config.toml
├── infra/
│   ├── docker/               Docker Compose files (dev / prod)
│   ├── nginx/                Reverse-proxy config
│   └── postgres/             DB init scripts
├── templates/
│   ├── email/                Shared HTML/text email templates
│   └── sms/                  SMS copy snippets
├── scripts/                  Ops scripts (setup, backup, seed)
└── docs/                     Extended documentation
> **Enterprise Communications Platform** — OmniQuest Media Inc. (OQMI)

[![PROGRAM_CONTROL](https://img.shields.io/badge/PROGRAM__CONTROL-MKTP--WORK--004-blue)](./MKTP_WORK-004.md)
[![License](https://img.shields.io/badge/license-Proprietary-red)](./LICENSE)
[![Stack](https://img.shields.io/badge/stack-listmonk%20%2B%20Brevo-brightgreen)]()

---

## Overview

**eCommsZone** is OmniQuest Media Inc.'s production-grade communications infrastructure. It provides a unified platform for transactional email, bulk newsletters, and SMS messaging — built on open-source tooling ([listmonk](https://listmonk.app)) with [Brevo](https://brevo.com) as the SMTP/SMS delivery layer.

This system is designed to:
- Send **transactional emails** (receipts, confirmations, alerts) at scale.
- Run **newsletter and marketing campaigns** with full subscriber management.
- Dispatch **SMS notifications** through a single, auditable API surface.
- Integrate seamlessly with the broader OQMI platform via a typed TypeScript client.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     eCommsZone                       │
│                                                     │
│  ┌──────────────┐        ┌───────────────────────┐  │
│  │   listmonk   │◄──────►│   PostgreSQL (db)     │  │
│  │  (port 9000) │        │   (persistent volume) │  │
│  └──────┬───────┘        └───────────────────────┘  │
│         │                                           │
│         │  SMTP / REST API                          │
│         ▼                                           │
│  ┌──────────────┐                                   │
│  │    Brevo     │  (Email + SMS delivery)            │
│  │  (external)  │                                   │
│  └──────────────┘                                   │
│                                                     │
│  ┌──────────────────────────────────────────────┐   │
│  │  TypeScript Client  (integrations/nodejs)    │   │
│  │  sendEmail() · sendSMS() · sendBulk()        │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Components

| Component | Role |
|---|---|
| **listmonk** | Self-hosted newsletter & transactional email manager |
| **PostgreSQL** | Persistent storage for subscribers, campaigns, and logs |
| **Brevo** | Cloud SMTP relay and SMS gateway |
| **TypeScript Client** | Internal SDK for OQMI services to interact with eCommsZone |

---

## Quick Start

### Prerequisites

- Docker ≥ 24 and Docker Compose v2
- A [Brevo](https://brevo.com) account with an API key and SMTP credentials
- A Linux VPS (Hetzner, OVH, or RunCloud recommended — see [docs/SETUP.md](./docs/SETUP.md))

### 1. Clone & configure

```bash
git clone https://github.com/OmniQuestMediaInc/eCommsZone.git
cd eCommsZone
cp .env.example .env
# Edit .env and fill in your secrets
```

### 2. Start services

```bash
docker compose up -d
```

### 3. Access listmonk

Open `http://<your-server-ip>:9000` and log in with the admin credentials set in your `.env`.

### 4. Use the TypeScript client

```typescript
import { ECommsZoneClient } from './integrations/nodejs/src/ecommszone-client';

const client = new ECommsZoneClient({
  baseUrl: process.env.ECOMMSZONE_BASE_URL!,
  apiUser: process.env.LISTMONK_ADMIN_USER!,
  apiPassword: process.env.LISTMONK_ADMIN_PASSWORD!,
});

await client.sendEmail({
  toEmail: 'customer@example.com',
  toName: 'Jane Doe',
  subject: 'Your order is confirmed',
  body: '<p>Thank you for your order!</p>',
});
```

---

## Documentation

- [Architecture](docs/architecture.md)
- [Onboarding a New Tenant](docs/onboarding.md)
- [API Reference](docs/api-reference.md)
- [Tenant Integration Guide](docs/tenant-integration.md)

---

## Contributing

Internal contributors only. See [CODEOWNERS](.github/CODEOWNERS).  
All PRs require review from `@OmniQuestMediaInc/devops-core`.

---

## License

Proprietary — © OmniQuest Media Inc. All rights reserved.
| Document | Description |
|---|---|
| [docs/SETUP.md](./docs/SETUP.md) | Step-by-step VPS deployment guide |
| [MKTP_WORK-004.md](./MKTP_WORK-004.md) | PROGRAM_CONTROL directive and project governance |
| [.github/copilot-instructions.md](./.github/copilot-instructions.md) | OQMI AI coding standards |

---

## Security

- **No secrets in this repository.** All credentials are injected via environment variables (`.env`, never committed).
- Brevo API keys and SMTP passwords are scoped to environment-level secrets.
- See [MKTP_WORK-004.md](./MKTP_WORK-004.md) for GateGuardian compliance requirements.

---

## Governance

This project operates under **PROGRAM_CONTROL** directive `MKTP-WORK-004`. All changes must satisfy the ship-gates defined in that document before merging to `main`.

---

© 2026 OmniQuest Media Inc. — All rights reserved. Proprietary and confidential.
