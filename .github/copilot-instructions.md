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
