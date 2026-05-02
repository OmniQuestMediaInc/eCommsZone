# eCommsZone — Public API

> **Base URL (production):** `https://comms.omniquestmedia.com`
> **Auth:** `Authorization: Bearer <ECOMMSZONE_API_TOKEN>`
> **Service identification:** `X-OQMI-Service: <calling-service-name>`
> **Content type:** `application/json`

All endpoints are versioned under `/v1`. Breaking changes ship under a
new prefix (e.g. `/v2`).

---

## Conventions

* **Idempotency:** every write endpoint accepts an `idempotencyKey` field
  (string, ≤128 chars). Repeating a request with the same key is a no-op
  and returns the original response. Clients SHOULD always set one; the
  Node.js client does so automatically.
* **Errors:** non-2xx responses follow this shape:
  ```json
  { "code": "INVALID_REQUEST", "message": "to.email is required", "requestId": "req_…" }
  ```
* **Rate limits:** 429 responses include `Retry-After` (seconds). Default
  shared limit is 100 req/s per service token.
* **Categories:** `transactional` (default) bypasses marketing
  suppression; `marketing` honours the marketing opt-in flag.

---

## `GET /api/health`

Liveness probe used by Docker, Kubernetes, and uptime monitors.
Returns `200 OK` with `{ "data": true }` when listmonk and the DB are
reachable.

---

## `POST /v1/messages/email`

Send a single transactional email.

**Request**

| Field | Type | Required | Notes |
|---|---|---|---|
| `templateId`     | string                | yes | OQMI template ID, e.g. `order-confirmation` |
| `to`             | `{ email, name? }`    | yes | Single recipient |
| `from`           | `{ email, name? }`    | no  | Overrides default sender |
| `replyTo`        | `{ email, name? }`    | no  | |
| `variables`      | object                | no  | Template merge variables |
| `subject`        | string                | no  | Overrides template subject |
| `tags`           | string[]              | no  | ≤10 tags, ≤64 chars each |
| `idempotencyKey` | string                | no  | Auto-generated if omitted |
| `category`       | `transactional` \| `marketing` | no | Default `transactional` |

**Response 202 Accepted**
```json
{
  "messageId":      "msg_01HZX…",
  "status":         "queued",
  "idempotencyKey": "9f1f…",
  "providerRef":    "<brevo-id>",
  "recipientCount": 1
}
```

---

## `POST /v1/messages/sms`

Send a single transactional SMS.

**Request**

| Field | Type | Required | Notes |
|---|---|---|---|
| `to`             | string  | yes | E.164 (e.g. `+14165551234`) |
| `templateId`     | string  | †   | Mutually exclusive with `body` |
| `variables`      | object  | no  | Required when using `templateId` |
| `body`           | string  | †   | Raw message; mutually exclusive with `templateId` |
| `sender`         | string  | no  | Overrides default sender ID |
| `tags`           | string[]| no  | |
| `idempotencyKey` | string  | no  | |
| `category`       | enum    | no  | |

† Exactly one of `templateId` or `body` must be provided.

**Response 202 Accepted** — same shape as email.

---

## `POST /v1/messages/bulk`

Fan-out send to a list, segment, or inline recipient array. Returns
once the batch is accepted; delivery is asynchronous.

**Request**

| Field | Type | Required | Notes |
|---|---|---|---|
| `channel`         | `email` \| `sms` | yes | |
| `templateId`      | string           | yes | |
| `recipients`      | `BulkRecipient[]`| †   | ≤1000 inline recipients |
| `listId`          | number           | †   | listmonk list ID |
| `segmentId`       | number           | †   | listmonk dynamic segment ID |
| `globalVariables` | object           | no  | Merged into every recipient's vars |
| `scheduledAt`     | ISO-8601 string  | no  | Future timestamp to schedule |
| `tags`            | string[]         | no  | |
| `idempotencyKey`  | string           | no  | |
| `category`        | enum             | no  | |

† Exactly one of `recipients`, `listId`, or `segmentId`.

`BulkRecipient` shape:
```ts
{
  email?: string;     // required for channel:"email"
  phone?: string;     // required for channel:"sms" (E.164)
  name?: string;
  variables?: Record<string, unknown>;
}
```

**Response 202 Accepted**
```json
{
  "messageId":      "batch_01HZY…",
  "status":         "queued",
  "idempotencyKey": "…",
  "recipientCount": 4287
}
```

---

## Webhooks (inbound from Brevo)

These endpoints are NOT part of the caller-facing API. They are
documented here for completeness.

| Path | Posted by | Purpose |
|---|---|---|
| `POST /webhooks/brevo/email`   | Brevo | Email delivery / bounce / open / click events |
| `POST /webhooks/brevo/sms`     | Brevo | SMS delivery / failure / reply events |
| `POST /webhooks/brevo/inbound` | Brevo | Inbound mail (parsed) |

Each webhook MUST include the Brevo-provided HMAC signature header,
which eCommsZone verifies before processing.

---

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED`    | 401 | Missing/invalid bearer token |
| `FORBIDDEN`          | 403 | Token lacks the required scope |
| `INVALID_REQUEST`    | 400 | Validation failure — see `message` |
| `TEMPLATE_NOT_FOUND` | 404 | `templateId` not registered |
| `RECIPIENT_BLOCKED`  | 422 | Recipient is on the suppression list |
| `RATE_LIMITED`       | 429 | Slow down — see `Retry-After` |
| `PROVIDER_UNAVAILABLE` | 502 | Brevo upstream failed; retry later |
| `INTERNAL`           | 500 | Unexpected error; `requestId` for support |
