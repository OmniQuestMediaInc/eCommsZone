# eCommsZone — Setup Guide

This guide takes a fresh machine to a working eCommsZone stack capable of
sending a real test email through Brevo.

## 1. Prerequisites

| Requirement | Version |
|---|---|
| Docker Engine | 24.x or newer |
| Docker Compose | v2 (bundled with Docker Desktop / `docker compose`) |
| `git` | any modern version |
| Brevo account | with a verified sending domain and an API key |
| DNS access | to add SPF, DKIM, and DMARC records for your sending domain |

> **Why Brevo verification matters:** unverified domains will land mail in
> spam at best, and trigger Brevo to suspend the account at worst.

## 2. Clone & configure

```bash
git clone https://github.com/OmniQuestMediaInc/eCommsZone.git
cd eCommsZone
cp .env.example .env
```

Edit `.env` and set, at minimum:

* `POSTGRES_PASSWORD`
* `LISTMONK_ADMIN_USER`, `LISTMONK_ADMIN_PASSWORD`
* `BREVO_API_KEY`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASSWORD`
* `BREVO_FROM_EMAIL` (must be a verified sender in Brevo)
* `ECOMMSZONE_API_TOKEN` (a long random string — generate with
  `openssl rand -hex 32`)

**Never commit `.env`.** It is listed in `.gitignore`.

## 3. First-run install

listmonk requires a one-time schema install on a fresh database:

```bash
docker compose run --rm listmonk ./listmonk --install --yes
```

You should see the message `Setup complete`.

## 4. Bring the stack up

```bash
docker compose up -d
docker compose ps
```

Both `ecommszone-db` and `ecommszone-listmonk` should report `healthy`
within ~30 seconds.

Verify the API is responding:

```bash
curl -fsS http://localhost:9000/api/health
```

## 5. Log in and sanity-check

1. Open <http://localhost:9000>.
2. Sign in with `LISTMONK_ADMIN_USER` / `LISTMONK_ADMIN_PASSWORD`.
3. Confirm: **Settings → SMTP** lists the Brevo relay and the connection
   test passes (the form has a "Test connection" button).
4. **Settings → General** — set the public URL to your production URL
   (e.g. `https://comms.omniquestmedia.com`).

## 6. Send a test email

```bash
curl -fsS -u "$LISTMONK_ADMIN_USER:$LISTMONK_ADMIN_PASSWORD" \
  -H 'content-type: application/json' \
  -X POST http://localhost:9000/api/tx \
  -d '{
    "subscriber_email": "you@example.com",
    "template_id": 1,
    "data": { "name": "QA" }
  }'
```

Replace `template_id` with a template you've imported from
`templates/transactional/`. See [`TEMPLATES.md`](TEMPLATES.md) for the
import workflow.

## 7. Wire up Brevo webhooks (closed-loop suppression)

In the Brevo dashboard → **Transactional → Settings → Webhooks**, add:

| Event group | URL |
|---|---|
| Email events | `https://comms.omniquestmedia.com/webhooks/brevo/email` |
| SMS events   | `https://comms.omniquestmedia.com/webhooks/brevo/sms`   |
| Inbound mail | `https://comms.omniquestmedia.com/webhooks/brevo/inbound` |

This lets eCommsZone honour Brevo bounces and complaints in its own
suppression list automatically (see `config/brevo-config.json`).

## 8. DNS records

Add the following to the sending domain (`omniquestmedia.com`) — exact
values are shown in the Brevo dashboard:

* SPF: `v=spf1 include:spf.brevo.com -all`
* DKIM: 2 CNAMEs provided by Brevo
* DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@omniquestmedia.com`

## 9. Production deployment

* Place eCommsZone behind the OQMI edge (Cloudflare or NGINX) that
  terminates TLS and provides WAF rules.
* Bind Postgres only to the internal Docker network (the default in
  `docker-compose.yml`).
* Back up the `ecommszone_db-data` volume nightly.
* Pin `listmonk` to a specific tagged version (`v3.0.0` here); test
  upgrades in staging first.

## 10. Backups & disaster recovery

```bash
# Logical backup
docker compose exec db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > listmonk-$(date +%F).sql.gz

# Restore
gunzip -c listmonk-YYYY-MM-DD.sql.gz | \
  docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `listmonk` keeps restarting | DB not yet healthy | Check `docker compose logs db` |
| `Setup complete` not printed | Schema already exists | Skip `--install`, or run `--upgrade` |
| 535 SMTP authentication failed | Wrong `BREVO_SMTP_USER`/`PASSWORD` | Regenerate in Brevo dashboard |
| Mail lands in spam | Missing SPF/DKIM/DMARC | Re-verify DNS |
