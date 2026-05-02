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
