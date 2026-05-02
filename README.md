# eCommsZone

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
