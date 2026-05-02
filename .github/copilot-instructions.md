# Copilot / AI-Assistant Instructions — eCommsZone

These instructions apply to **every** AI assistant, contributor, and
automated tool that proposes changes to this repository. They encode
OmniQuest Media Inc.'s ("OQMI") engineering standards.

## 1. PROGRAM_CONTROL compliance

* This repository is governed by `PROGRAM_CONTROL/DIRECTIVES/QUEUE/`.
* Every non-trivial change MUST cite the directive it is executing
  (e.g. `MKTP_WORK-004`) in the PR description.
* Ship-gates listed in the directive are non-negotiable — do not merge
  unless every gate passes.
* New work that is not covered by an existing directive MUST be added to
  the queue first, then implemented.

## 2. Security-first

* **NEVER** commit secrets — API keys, passwords, tokens, certificates.
  Use `.env` (gitignored) or the OQMI managed secret store.
* **NEVER** weaken authentication, signature verification, or TLS in any
  code path, even temporarily.
* Treat user-supplied data as hostile: validate, escape, and bound every
  input — especially merge variables that flow into HTML templates.
* Prefer parameterized queries; never concatenate user input into SQL,
  shell commands, or template strings used outside the listmonk renderer.
* When adding dependencies, check the GitHub Advisory Database first.
* Webhooks MUST verify the provider's HMAC signature before processing.

## 3. Privacy & compliance

* eCommsZone routes regulated communications. Every change MUST preserve:
  * CAN-SPAM / CASL footer (physical address + unsubscribe link) on
    every email template.
  * TCPA / CRTC opt-out language ("Reply STOP …") on every SMS template.
  * GDPR data-subject endpoints (`export`, `delete`, `wipe`).
* Do not log message bodies, recipient PII, or auth tokens at `info` or
  higher. Debug-level logging of PII is allowed only when redacted.
* Do not introduce third-party tracking pixels or analytics into
  templates. listmonk's first-party tracking pixel is the only one
  permitted.

## 4. Code quality

* TypeScript: `strict: true` everywhere. No `any` without a written
  justification comment.
* Public APIs (the Node.js client, HTTP API) MUST be fully typed and
  documented with JSDoc/TSDoc.
* Preserve existing code style; do not reformat unrelated files.
* Do not introduce new linters, build tools, or testing frameworks
  without an accompanying directive.
* Keep changes minimal and surgical — fix only what the directive asks.

## 5. Templates

* Source-of-truth lives in `templates/`. Any change to a published
  template MUST update the file in this repo.
* Authors must satisfy the checklist in `docs/TEMPLATES.md` §6.
* Do not embed inline JavaScript. Many email clients strip it.
* Variables must be namespaced (`{{ .Tx.* }}` for transactional) and
  documented in a header comment.

## 6. Operational hygiene

* Changes to `docker-compose.yml` MUST preserve health checks and
  restart policies.
* Pin image tags (e.g. `listmonk:v3.0.0`) — never use `:latest` in
  production assets.
* Postgres MUST NOT be exposed on the host network in production.
* Adding env vars: update `.env.example` and `docs/SETUP.md` in the
  same change.

## 7. Documentation

* Every behavioural change updates the relevant doc:
  * Public API → `docs/API.md`
  * Architecture / data flow → `docs/ARCHITECTURE.md`
  * Setup / ops → `docs/SETUP.md`
  * Templates → `docs/TEMPLATES.md`
* Keep `README.md` accurate as the entry point.

## 8. Commits & PRs

* Conventional Commit style is preferred:
  `feat(client): add sendBulk recipient validation` (MKTP_WORK-004).
* PR titles include the directive ID.
* PR descriptions list which ship-gates the change advances.
* Squash-merge into `main`; keep history linear.

## 9. Things AI assistants MUST NOT do

* Do not invent API endpoints, environment variables, or template names
  that are not already declared in this repo or its directives.
* Do not introduce a second delivery provider, SaaS dependency, or
  third-party SDK without a directive sanctioning it.
* Do not bypass listmonk to call Brevo directly from an OQMI service.
  All sends go through eCommsZone.
* Do not modify files under `PROGRAM_CONTROL/DIRECTIVES/` unless the
  task is explicitly to author or amend a directive.
* Do not echo or commit the contents of `.env`, even partially.

## 10. When in doubt

Stop and ask. Quietly guessing in a system that sends regulated
communications to millions of people is unacceptable. Cite the
directive, propose the smallest possible change, and request review.
# GitHub Copilot Instructions — OmniQuest Media Inc. (OQMI)

> These instructions apply to all AI-assisted coding in the **eCommsZone** repository.
> They encode OQMI engineering standards and **PROGRAM_CONTROL** governance requirements.

---

## 1. PROGRAM_CONTROL Compliance

- Every PR description **must** reference the active directive number (e.g., `MKTP-WORK-004`).
- Ship-gates defined in `MKTP_WORK-004.md` must all pass before any merge to `main`.
- If you are uncertain whether a change falls within scope, stop and ask the program owner.

---

## 2. Security Standards

### Absolute prohibitions

- **Never** hard-code API keys, passwords, tokens, connection strings, or any secret in source files.
- **Never** commit `.env` files. Only `.env.example` (with placeholder values) is allowed.
- **Never** disable TLS/certificate verification in production code.
- **Never** log sensitive data (passwords, API keys, PII) at any log level.

### Required practices

- All secrets must be read from environment variables at runtime.
- Validate and sanitize all inputs before passing them to external APIs or SQL queries.
- Pin Docker image tags to a specific semver version — never use `:latest`.
- Use `AbortController` (or equivalent) to enforce request timeouts on all HTTP calls.

### GateGuardian

When GateGuardian tooling is available in the OQMI workflow:
- Run a GateGuardian secret scan on every PR before review.
- Address all HIGH and CRITICAL findings before requesting approval.
- MEDIUM findings must be acknowledged with a documented rationale.

---

## 3. Code Style

- **TypeScript**: strict mode (`"strict": true`); no `any` except where explicitly justified with a comment.
- **Async**: prefer `async/await` over raw Promises and callbacks.
- **Error handling**: always handle promise rejections; never use empty `catch {}` blocks.
- **Comments**: use JSDoc for all exported functions, classes, and types. Inline comments for non-obvious logic only.
- **Imports**: use named imports; avoid wildcard (`import * as`) imports.
- **Naming**: `camelCase` for variables/functions, `PascalCase` for classes/types/interfaces, `SCREAMING_SNAKE_CASE` for module-level constants.

---

## 4. External API Calls

All external HTTP calls must:
1. Be clearly documented with a comment listing the endpoint and link to upstream docs.
2. Have a configurable timeout (default ≤ 10 seconds).
3. Return a typed result object — never throw raw HTTP errors to callers.
4. Be retried with exponential back-off for transient failures (5xx, network errors) where appropriate.

Document every external dependency in the relevant source file header, e.g.:

```typescript
// External call: POST https://api.brevo.com/v3/transactionalSMS/sms
// Docs: https://developers.brevo.com/reference/sendtransacsms
```

---

## 5. Docker & Infrastructure

- Use `docker compose` (v2 syntax), not `docker-compose` (v1).
- Bind sensitive ports to `127.0.0.1` only; expose via reverse proxy.
- Define health checks for every service.
- Use named volumes for all persistent data.
- Label all resources with `com.oqmi.project`, `com.oqmi.service`, and `com.oqmi.managed-by`.

---

## 6. Privacy & Compliance (CASL / PIPEDA / Quebec Law 25)

- Subscriber data must remain in Canada (Hetzner Montréal or OVH BHS).
- All bulk sends must include a physical mailing address and one-click unsubscribe.
- Do not send to subscribers without confirmed opt-in status.
- Support data export and erasure requests as required by PIPEDA.

---

## 7. Pull Request Checklist

Before requesting review, verify:

- [ ] No secrets in any committed file
- [ ] `.env.example` updated if new variables were added
- [ ] All new exported functions/types have JSDoc
- [ ] External API calls documented in source header
- [ ] Docker images pinned to specific tags
- [ ] PR description references `MKTP-WORK-004` (or the current active directive)
- [ ] All ship-gates in `MKTP_WORK-004.md` remain satisfiable

---

## 8. Commit Message Format

```
<type>(<scope>): <short summary>

[optional body]

PROGRAM_CONTROL: MKTP-WORK-004
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`

Example:
```
feat(client): add sendBulk() method to TypeScript client

Adds a sendBulk() method that triggers a listmonk campaign by updating
its status to "running" via PUT /api/campaigns/{id}/status.

PROGRAM_CONTROL: MKTP-WORK-004
```
