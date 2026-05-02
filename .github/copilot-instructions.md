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
