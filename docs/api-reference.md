# eCommsZone API Reference

Base URL: `https://ecommszone.internal` (production) | `http://localhost:4000` (development)

All requests must include the tenant API key header:

```
X-Tenant-Key: <your-tenant-api-key>
```

---

## Authentication

eCommsZone uses opaque per-tenant API keys. Keys are passed via the `X-Tenant-Key` HTTP header. Invalid or missing keys return `401 Unauthorized`.

---

## Rate Limits

Rate limits are per-tenant and per-channel. Exceeding them returns `429 Too Many Requests` with a `Retry-After` header.

Default limits (configurable per tenant in `config.json`):

| Channel | Default |
|---|---|
| Email | 60 req/min |
| SMS | 10 req/min |

---

## Endpoints

### Health

#### `GET /health`

Returns service health status.

**Response `200`**
```json
{
  "status": "ok",
  "uptime": 3600,
  "listmonk": "reachable",
  "brevo": "reachable",
  "postgres": "reachable"
}
```

---

### Email

#### `POST /email/transactional`

Send a single transactional email immediately via Brevo.

**Request body**
```json
{
  "to": "recipient@example.com",
  "toName": "Jane Doe",
  "subject": "Your order confirmation",
  "html": "<p>Hello Jane, your order #1234 has been confirmed.</p>",
  "text": "Hello Jane, your order #1234 has been confirmed.",
  "replyTo": "support@example.com",
  "templateId": 42,
  "templateParams": {
    "firstName": "Jane",
    "orderId": "1234"
  },
  "attachments": [
    {
      "name": "invoice.pdf",
      "content": "<base64-encoded-content>"
    }
  ]
}
```

Either `html`/`text` or `templateId` is required. `templateId` refers to a Brevo template ID.

**Response `202`**
```json
{
  "messageId": "brevo-message-id",
  "auditId": "uuid"
}
```

---

#### `POST /email/campaign`

Trigger or schedule a listmonk campaign.

**Request body**
```json
{
  "campaignId": 7,
  "sendAt": "2025-06-01T09:00:00Z"
}
```

`sendAt` is optional — omit to send immediately.

**Response `202`**
```json
{
  "campaignId": 7,
  "status": "scheduled"
}
```

---

#### `POST /email/subscribe`

Subscribe an email address to a listmonk list.

**Request body**
```json
{
  "email": "user@example.com",
  "name": "Jane Doe",
  "listIds": [3, 5],
  "attributes": {
    "plan": "premium"
  }
}
```

**Response `201`**
```json
{
  "subscriberId": 1042,
  "status": "enabled"
}
```

---

#### `DELETE /email/unsubscribe`

Unsubscribe an email address from one or all lists.

**Request body**
```json
{
  "email": "user@example.com",
  "listIds": [3]
}
```

Omit `listIds` to unsubscribe from all tenant lists.

**Response `200`**
```json
{
  "unsubscribed": true
}
```

---

### SMS

#### `POST /sms/send`

Send a transactional SMS via Brevo.

**Request body**
```json
{
  "to": "+15551234567",
  "message": "Your verification code is 483920. Expires in 10 minutes.",
  "sender": "OmniQuest",
  "type": "transactional"
}
```

`type` is `transactional` (default) or `marketing`.

**Response `202`**
```json
{
  "messageId": "brevo-sms-id",
  "auditId": "uuid"
}
```

---

### Webhooks

#### `POST /webhook/brevo`

Endpoint for Brevo delivery event webhooks. Configure this URL in the Brevo dashboard under **Webhooks**.

Authentication: HMAC-SHA256 signature verified via `X-Brevo-Signature` header.

eCommsZone processes these event types:
- `delivered`
- `soft_bounce` / `hard_bounce`
- `unsubscribe`
- `spam`

**Response `200`** on successful processing.

---

## Error Responses

All error responses follow this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": {}
  }
}
```

| HTTP Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request payload failed validation |
| 401 | `UNAUTHORIZED` | Missing or invalid tenant API key |
| 429 | `RATE_LIMITED` | Per-tenant rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 502 | `UPSTREAM_ERROR` | listmonk or Brevo unreachable |

---

## Changelog

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | TBD | Initial release |
