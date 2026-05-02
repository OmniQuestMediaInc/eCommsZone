# MKTP_WORK-004 — eCommsZone Initial Framework

| Field             | Value |
|-------------------|-------|
| **Directive ID**  | `MKTP_WORK-004` |
| **Program**       | OQMI Marketplace & Communications |
| **Repository**    | `OmniQuestMediaInc/eCommsZone` |
| **Status**        | `IN_PROGRESS` |
| **Priority**      | `P1` (foundational — blocks downstream comms work) |
| **Owner**         | Senior Backend & DevOps Engineer |
| **Stakeholders**  | CTO, Marketplace Lead, RRR Rewards Lead, Compliance |
| **Issued**        | 2026-05-02 |
| **Target Ship**   | 2026-05-23 (T+3 weeks) |

---

## 1. Mission

Establish `eCommsZone` as the **single, governed, OQMI-wide communications
service bureau**. Every OmniQuest property — marketplaces, RRR Rewards,
WordPress sites, internal tooling — must route email, SMS, and conversational
traffic through this service. The framework delivered by this directive must
be production-ready, auditable, and extensible.

---

## 2. Strategic Objectives

1. **Consolidate** all outbound messaging behind a single self-hosted
   listmonk instance backed by Brevo for delivery.
2. **Standardize** transactional templates (order confirmation, shipping,
   RRR points, password reset, 2FA SMS) so every brand renders consistently.
3. **Govern** the contract surface: a documented HTTP API and a first-class
   Node.js client (`integrations/nodejs`) that all OQMI services consume.
4. **Comply** with CAN-SPAM, CASL, GDPR, and TCPA out of the box —
   suppression, consent capture, and unsubscribe headers are non-optional.
5. **Operate** with observability: health checks, delivery webhooks, and
   structured logs from day one.

---

## 3. Deliverables

| # | Deliverable | Path | Definition of Done |
|---|---|---|---|
| D1 | Repository skeleton | (root) | All folders/files in §4 of the problem statement exist and are committed. |
| D2 | Container stack | `docker-compose.yml` | `docker compose up -d` brings up healthy listmonk + Postgres locally. |
| D3 | listmonk config | `config/listmonk.toml` | Boots cleanly; SMTP relay points at Brevo via env vars. |
| D4 | Brevo config descriptor | `config/brevo-config.json` | Declares channels, webhooks, compliance, suppression. No secrets. |
| D5 | Transactional templates | `templates/transactional/*` | 4× HTML + 1× SMS (`.txt`) drafted with merge tokens documented in `docs/TEMPLATES.md`. |
| D6 | Node.js client | `integrations/nodejs/src/ecommszone-client.ts` | Exposes `sendEmail`, `sendSMS`, `sendBulk`; typed; documented; lint-clean. |
| D7 | WordPress placeholder | `integrations/wordpress/` | README placeholder for `oqmi-ecommszone` plugin. |
| D8 | Documentation set | `docs/{SETUP,ARCHITECTURE,API,TEMPLATES}.md` | Each doc covers its scope end-to-end for a new engineer. |
| D9 | Governance & standards | `.github/copilot-instructions.md`, this directive | Standards file enforces PROGRAM_CONTROL, no secrets, security-first. |
| D10| Licensing & hygiene | `LICENSE`, `.gitignore`, `.env.example` | Proprietary license + `.env` ignored + example provided. |

---

## 4. Ship-Gates (must all pass before status → `SHIPPED`)

- [ ] **G1 — Structure**: Every file/folder enumerated in the problem
      statement exists at the exact path specified.
- [ ] **G2 — Build**: `docker compose config` validates without error.
- [ ] **G3 — Boot**: `docker compose up -d` reaches healthy state for both
      `db` and `listmonk` services within 90s on a clean machine.
- [ ] **G4 — Secrets hygiene**: No API keys, passwords, or tokens are
      committed. `git grep` for `xkeysib-`, `BREVO_API_KEY=` (with a value),
      etc. returns zero matches outside `.env.example` placeholders.
- [ ] **G5 — Client typing**: `integrations/nodejs` compiles under
      `tsc --noEmit` with `strict: true`.
- [ ] **G6 — Compliance**: Every transactional template includes the
      mandated unsubscribe / physical address footer (email) or STOP-to-opt-out
      language (SMS), per `config/brevo-config.json:compliance`.
- [ ] **G7 — Documentation**: SETUP.md walks an engineer from clone → first
      successful test send. ARCHITECTURE.md, API.md, TEMPLATES.md complete.
- [ ] **G8 — Governance**: `.github/copilot-instructions.md` references this
      directive and the OQMI standards.

---

## 5. Out of Scope (explicitly deferred)

* Production deployment to OQMI infrastructure (separate directive).
* Implementation of the WordPress plugin (`oqmi-ecommszone`) — only a
  placeholder is created here.
* Migration of existing per-app SMTP integrations — tracked under
  `MKTP_WORK-005` (Cutover).
* Marketing campaign templates (only `templates/marketing/.gitkeep`).

---

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Brevo throughput throttle during cutover | Delayed transactional mail | Stagger app cutover (MKTP_WORK-005); pre-warm IPs. |
| Secret leakage during scaffolding | Sev-1 incident | `.gitignore` + secret-scanning + `.env.example` only. |
| listmonk schema migration on upgrade | Downtime | Pin `listmonk:v3.0.0`; document upgrade path in SETUP.md. |
| Template drift across brands | Inconsistent UX | Canonical templates in `templates/`; brands extend, not fork. |

---

## 7. Timeline

| Milestone | Target | Owner |
|---|---|---|
| M1 — Skeleton & docker stack boots locally  | T+3 days   | Backend |
| M2 — Templates + Brevo config landed        | T+8 days   | Backend |
| M3 — Node.js client + docs                  | T+15 days  | Backend |
| M4 — Compliance review + ship-gates pass    | T+21 days  | Compliance + Backend |

---

## 8. Approvals

| Role | Name | Sign-off |
|---|---|---|
| Engineering Lead | _pending_ | ☐ |
| Compliance       | _pending_ | ☐ |
| Security         | _pending_ | ☐ |

---

## 9. References

* OQMI PROGRAM_CONTROL Handbook
* listmonk: <https://listmonk.app/docs/>
* Brevo API: <https://developers.brevo.com/>
* Related directives: `MKTP_WORK-005` (Cutover), `RRR_WORK-012` (Rewards comms)
