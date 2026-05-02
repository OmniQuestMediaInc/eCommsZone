# MKTP-WORK-004 — PROGRAM_CONTROL Directive

> **Project:** eCommsZone — Enterprise Communications Platform
> **Organization:** OmniQuest Media Inc. (OQMI)
> **Directive Type:** PROGRAM_CONTROL
> **Status:** ACTIVE
> **Target Production Date:** 10–14 days from directive activation

---

## 1. Directive Summary

This PROGRAM_CONTROL directive governs the design, build, deployment, and ongoing operation of **eCommsZone** — OQMI's unified communications infrastructure for email and SMS delivery.

All contributors, automated agents, and CI/CD pipelines operating on this repository are bound by the rules and ship-gates defined herein.

---

## 2. Objectives

| # | Objective | Success Criteria |
|---|---|---|
| O-1 | Self-hosted email & newsletter infrastructure | listmonk running in Docker, reachable via HTTPS |
| O-2 | Brevo SMTP/SMS integration | Transactional email and SMS delivered via Brevo API |
| O-3 | TypeScript SDK for internal services | `ecommszone-client.ts` with `sendEmail`, `sendSMS`, `sendBulk` |
| O-4 | Security-first configuration | No secrets in repo; `.env` pattern enforced; GateGuardian scan passes |
| O-5 | Operational documentation | `docs/SETUP.md` covers end-to-end VPS deployment |
| O-6 | PROGRAM_CONTROL compliance | All PRs reference this directive; ship-gates enforced before merge to `main` |

---

## 3. Scope

### In Scope

- Docker Compose stack (listmonk + PostgreSQL)
- Brevo SMTP relay configuration within listmonk
- Brevo REST API integration for transactional email and SMS
- TypeScript client library (`integrations/nodejs/`)
- Deployment documentation for Canadian VPS providers (Hetzner, OVH, RunCloud)
- CI/CD GitHub Actions pipeline with secret scanning

### Out of Scope

- Custom email template design (delegated to Marketing)
- Subscriber import from legacy system (separate workstream)
- Mobile push notifications

---

## 4. Architecture Decisions

| Decision | Rationale |
|---|---|
| **listmonk over SaaS** | Full data sovereignty; no per-send cost; PIPEDA-compliant data residency |
| **Brevo as SMTP relay** | High deliverability, Canadian IP range available, generous free tier |
| **PostgreSQL 16** | listmonk requirement; Alpine image minimizes attack surface |
| **TypeScript client** | Type safety for internal callers; auto-documenting via JSDoc |
| **Bind port to 127.0.0.1** | listmonk not exposed directly; Nginx/Caddy reverse proxy required |

---

## 5. Ship-Gates

All gates must pass before any merge to `main` and before production deployment.

### Gate 1 — Security

- [ ] `git-secrets` or `gitleaks` scan passes (no credentials in history)
- [ ] `.env` is listed in `.gitignore`
- [ ] No hard-coded API keys, passwords, or tokens in any source file
- [ ] GateGuardian security review completed (if applicable)
- [ ] Docker images pinned to specific digest or semver tag (no `latest`)

### Gate 2 — Functionality

- [ ] `docker compose up -d` succeeds on a clean VPS
- [ ] listmonk health endpoint returns HTTP 200
- [ ] Brevo SMTP test email delivered successfully
- [ ] TypeScript client compiles without errors (`tsc --noEmit`)
- [ ] `sendEmail()`, `sendSMS()`, and `sendBulk()` return success responses in integration test

### Gate 3 — Documentation

- [ ] `docs/SETUP.md` reviewed by a second team member
- [ ] `README.md` reviewed and approved
- [ ] All environment variables documented in `.env.example`

### Gate 4 — Operations

- [ ] PostgreSQL volume backup procedure documented
- [ ] Reverse proxy (Nginx or Caddy) configured with TLS
- [ ] Health check endpoints verified

---

## 6. Deliverables

| Deliverable | Owner | Due |
|---|---|---|
| `docker-compose.yml` | Engineering | Day 2 |
| `.env.example` | Engineering | Day 2 |
| `config/listmonk.toml` | Engineering | Day 3 |
| `integrations/nodejs/src/ecommszone-client.ts` | Engineering | Day 5 |
| `docs/SETUP.md` | Engineering | Day 7 |
| Brevo SMTP integration test | Engineering | Day 8 |
| Brevo SMS integration test | Engineering | Day 9 |
| Production deployment | DevOps | Day 12 |
| Post-deployment smoke test | QA | Day 14 |

---

## 7. Timeline

```
Day  1-2  : Repository scaffold, Docker Compose, .env.example
Day  3-4  : listmonk config, SMTP relay validated end-to-end
Day  5-6  : TypeScript client implementation + unit tests
Day  7-8  : docs/SETUP.md + Brevo email integration test
Day  9-10 : SMS integration test + security gate review
Day 11-12 : VPS production deployment (Hetzner/OVH/RunCloud)
Day 13-14 : Smoke tests, monitoring setup, handoff to Operations
```

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Brevo account not approved for SMS | Medium | High | Apply for SMS approval on Day 1; have fallback (Twilio) ready |
| Docker volume data loss | Low | High | Daily `pg_dump` to S3-compatible object storage |
| listmonk new version breaking changes | Low | Medium | Pin image to specific semver tag; review changelog before upgrade |
| Credentials accidentally committed | Medium | Critical | `gitleaks` in pre-commit hook + CI scan |

---

## 9. Compliance & Governance

- **PIPEDA / Quebec Law 25:** Subscriber data stored in Canada (Hetzner Montréal or OVH BHS). No personal data leaves Canada without explicit consent.
- **CAN-SPAM / CASL:** listmonk's built-in unsubscribe handling satisfies CASL requirements. All bulk sends must include a physical mailing address and one-click unsubscribe.
- **Change Management:** All changes to production configuration require a PR, peer review, and reference to this directive number (`MKTP-WORK-004`) in the PR description.

---

## 10. Contacts

| Role | Name | Responsibility |
|---|---|---|
| Program Owner | OQMI Engineering Lead | Final approval on ship-gates |
| DevOps | TBD | VPS provisioning, Docker deployment |
| Security | GateGuardian / OQMI SecOps | Gate 1 sign-off |

---

*This directive is active and binding. Any deviation requires written approval from the Program Owner and must be recorded as an amendment below.*

---

### Amendments

| Date | Author | Change |
|---|---|---|
| — | — | — |
