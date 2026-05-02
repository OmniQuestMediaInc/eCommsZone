# Tenant Integration Guide

This guide is for engineers at tenant services integrating with eCommsZone.

---

## Getting Started

You will receive from the OmniQuest DevOps team:
- Your **Tenant API Key** (`X-Tenant-Key`)
- The **eCommsZone base URL** for each environment
- Your **listmonk list IDs** (for subscription management)
- Your **Brevo template IDs** (if using Brevo-managed templates)

---

## Environments

| Environment | Base URL |
|---|---|
| Development (local) | `http://localhost:4000` |
| Staging | `https://staging-api.ecommszone.internal` |
| Production | `https://api.ecommszone.internal` |

---

## Authentication

Include your tenant API key in every request:

```
X-Tenant-Key: <your-key>
Content-Type: application/json
```

---

## Sending a Transactional Email

```bash
curl -X POST https://api.ecommszone.internal/email/transactional \
  -H "X-Tenant-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "user@example.com",
    "subject": "Welcome!",
    "html": "<p>Thanks for signing up.</p>"
  }'
```

### Using a Brevo Template

If you have a template configured in Brevo (ask DevOps for the template ID):

```json
{
  "to": "user@example.com",
  "toName": "Jane Doe",
  "templateId": 12,
  "templateParams": {
    "firstName": "Jane",
    "activationLink": "https://app.example.com/activate?token=abc123"
  }
}
```

---

## Sending an SMS

```bash
curl -X POST https://api.ecommszone.internal/sms/send \
  -H "X-Tenant-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+15551234567",
    "message": "Your code is 993841",
    "type": "transactional"
  }'
```

---

## Managing Subscriptions

### Subscribe a user to your marketing list

```json
POST /email/subscribe
{
  "email": "user@example.com",
  "name": "Jane Doe",
  "listIds": [3]
}
```

### Unsubscribe a user

Always honor unsubscribe requests within your product UI. Propagate them to eCommsZone immediately:

```json
DELETE /email/unsubscribe
{
  "email": "user@example.com",
  "listIds": [3]
}
```

---

## Handling Bounce & Unsubscribe Events

eCommsZone processes delivery events from Brevo and automatically updates subscriber status in listmonk. You do **not** need to handle Brevo webhooks directly.

If your application needs to react to delivery events (e.g., disable an account when email hard-bounces), contact the DevOps team to set up forwarding from eCommsZone's webhook processor to your service.

---

## Node.js SDK Example

```typescript
import axios from 'axios';

const ecomms = axios.create({
  baseURL: process.env.ECOMMSZONE_URL,
  headers: {
    'X-Tenant-Key': process.env.ECOMMSZONE_TENANT_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 10_000,
});

export async function sendWelcomeEmail(to: string, firstName: string) {
  const res = await ecomms.post('/email/transactional', {
    to,
    templateId: 12,
    templateParams: { firstName },
  });
  return res.data;
}

export async function sendVerificationSms(phone: string, code: string) {
  const res = await ecomms.post('/sms/send', {
    to: phone,
    message: `Your verification code is ${code}. Valid for 10 minutes.`,
    type: 'transactional',
  });
  return res.data;
}
```

---

## Rate Limits

| Channel | Default limit | Behavior when exceeded |
|---|---|---|
| Email | 60 req/min | `429 Too Many Requests` + `Retry-After` header |
| SMS | 10 req/min | `429 Too Many Requests` + `Retry-After` header |

Implement exponential back-off with jitter for retries.

---

## Support

Open an issue in the [eCommsZone repository](https://github.com/OmniQuestMediaInc/eCommsZone) or contact `#devops` in Slack.
