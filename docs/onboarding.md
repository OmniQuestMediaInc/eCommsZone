# Onboarding a New Tenant

This guide walks through the steps required to onboard a new downstream service into eCommsZone.

---

## Prerequisites

- Access to the eCommsZone GitHub repository
- Credentials for the Brevo account (to create a new sender identity if needed)
- Access to the listmonk admin UI (`http://listmonk:9000` on internal network)

---

## Step 1 — Create a Tenant Slug

Choose a URL-safe, lowercase slug for the new tenant (e.g., `mynewservice`).

---

## Step 2 — Create the Tenant Config Directory

```bash
mkdir -p integrations/tenants/<slug>
```

Copy the template config:

```bash
cp integrations/tenants/chatnowzone/config.json \
   integrations/tenants/<slug>/config.json
```

Edit `integrations/tenants/<slug>/config.json`:

```json
{
  "tenantId": "<slug>",
  "displayName": "My New Service",
  "listmonk": {
    "defaultListId": null,
    "transactionalTemplateId": null
  },
  "brevo": {
    "senderEmail": "comms@mynewservice.com",
    "senderName": "My New Service",
    "smsSender": "OmniQuest"
  },
  "rateLimit": {
    "emailPerMinute": 60,
    "smsPerMinute": 10
  }
}
```

---

## Step 3 — Generate a Tenant API Key

Run the key-generation script:

```bash
node scripts/generate-tenant-key.js --tenant <slug>
```

This outputs a secure API key. Store it in your secrets manager and provide it to the tenant's engineering team. **Never commit the key.**

Add the key to the deployment environment:

```
TENANT_KEY_<SLUG>=<generated-key>
```

---

## Step 4 — Create listmonk Subscriber Lists

Log in to the listmonk admin UI and create:

1. A **marketing list** for the tenant (e.g., `MyNewService — Marketing`)
2. A **transactional list** (optional, for tracking transactional sends)

Note the numeric list IDs and add them to `config.json`.

---

## Step 5 — Configure Brevo Sender Identity

In the Brevo dashboard:

1. Go to **Senders & IP** → **Senders**
2. Add the tenant's sender email address
3. Complete domain authentication (DKIM/SPF) for the sender domain
4. If the tenant needs SMS: verify the SMS sender ID if required by destination country

---

## Step 6 — Add Email/SMS Templates

Place HTML email templates in `templates/email/<slug>/` and SMS copy in `templates/sms/<slug>/`. Follow the existing naming convention.

Import templates into listmonk via the admin UI if they will be used for campaigns.

---

## Step 7 — Test

1. Use the Postman collection in `docs/postman/` (or curl) to send a test transactional email:

```bash
curl -X POST http://localhost:4000/email/transactional \
  -H "X-Tenant-Key: <key>" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Hello from eCommsZone",
    "html": "<p>Test email</p>"
  }'
```

2. Verify delivery in the Brevo dashboard.
3. Verify the audit log row in PostgreSQL:

```sql
SELECT * FROM audit_log WHERE tenant_id = '<slug>' ORDER BY created_at DESC LIMIT 5;
```

---

## Step 8 — PR & Deploy

Open a PR with:
- `integrations/tenants/<slug>/config.json`
- Any new templates in `templates/`
- Updated `.env.example` with the new `TENANT_KEY_<SLUG>=` placeholder

After merge to `develop`, the staging workflow deploys automatically. Merge to `main` for production.

---

## Checklist

- [ ] Tenant config directory created
- [ ] `config.json` filled in
- [ ] API key generated and stored in secrets manager
- [ ] Environment variable added to deployment
- [ ] listmonk lists created and IDs recorded in config
- [ ] Brevo sender identity verified
- [ ] Test email/SMS sent and confirmed
- [ ] Audit log verified
- [ ] PR merged and deployed
