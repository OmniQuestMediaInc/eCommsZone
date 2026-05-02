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
# eCommsZone — Deployment Guide

> OmniQuest Media Inc. | PROGRAM_CONTROL: MKTP-WORK-004
>
> Step-by-step guide for deploying eCommsZone on a Canadian VPS
> (Hetzner Montréal, OVH BHS, or RunCloud-managed server).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Provision the VPS](#2-provision-the-vps)
3. [Secure the Server](#3-secure-the-server)
4. [Install Docker](#4-install-docker)
5. [Clone the Repository](#5-clone-the-repository)
6. [Configure Environment Variables](#6-configure-environment-variables)
7. [Start the Stack](#7-start-the-stack)
8. [Configure Brevo SMTP in listmonk](#8-configure-brevo-smtp-in-listmonk)
9. [Set Up a Reverse Proxy with TLS](#9-set-up-a-reverse-proxy-with-tls)
10. [Verify the Deployment](#10-verify-the-deployment)
11. [Set Up Database Backups](#11-set-up-database-backups)
12. [Ongoing Operations](#12-ongoing-operations)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 20 GB SSD | 40 GB SSD |
| Docker | 24.x | latest stable |
| Domain name | required | required |

You will also need:
- A **Brevo** account with SMTP credentials and API key
- A domain name with DNS pointed to your VPS

---

## 2. Provision the VPS

### Hetzner (recommended for Canada)

1. Log in to [Hetzner Cloud Console](https://console.hetzner.cloud/).
2. Click **New Server**.
3. Select **Location: Montréal (CA-EAST)**.
4. Choose **Ubuntu 24.04** as the OS image.
5. Select **CX22** (2 vCPU, 4 GB RAM) or larger.
6. Add your SSH public key.
7. Click **Create & Buy**.

### OVH (alternative)

1. Log in to [OVH Control Panel](https://www.ovh.com/manager/).
2. Order a **VPS** in region **BHS (Beauharnois, QC)**.
3. Select **Ubuntu 24.04**.
4. Add your SSH key during provisioning.

### RunCloud

1. Provision a VPS on any supported provider with a Canadian data centre.
2. Install the RunCloud agent on the server per RunCloud documentation.
3. Follow steps 4–12 below (RunCloud manages Nginx for you; skip step 9).

---

## 3. Secure the Server

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Create a non-root deploy user
sudo adduser deploy
sudo usermod -aG sudo deploy
# Note: 'docker' group is added in step 4 after Docker is installed

# Disable root SSH login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Configure UFW firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 4. Install Docker

```bash
# Install Docker using the official convenience script
curl -fsSL https://get.docker.com | sudo sh

# Add deploy user to the docker group
sudo usermod -aG docker deploy

# Log out and log back in for group change to take effect, then verify:
docker --version
docker compose version
```

---

## 5. Clone the Repository

```bash
# As the deploy user
cd /opt
sudo mkdir ecommszone && sudo chown deploy:deploy ecommszone
cd ecommszone
git clone https://github.com/OmniQuestMediaInc/eCommsZone.git .
```

---

## 6. Configure Environment Variables

```bash
cp .env.example .env
nano .env   # or use your preferred editor
```

Fill in every value marked `<CHANGE_ME>`:

| Variable | Where to find the value |
|---|---|
| `LISTMONK_ADMIN_USER` | Choose a username (e.g., `admin`) |
| `LISTMONK_ADMIN_PASSWORD` | Generate: `openssl rand -base64 24` |
| `POSTGRES_USER` | Choose (e.g., `listmonk`) |
| `POSTGRES_PASSWORD` | Generate: `openssl rand -base64 24` |
| `POSTGRES_DB` | Choose (e.g., `listmonk`) |
| `BREVO_SMTP_USER` | Brevo → Settings → SMTP & API → SMTP login |
| `BREVO_SMTP_PASSWORD` | Brevo → Settings → SMTP & API → SMTP key |
| `BREVO_API_KEY` | Brevo → Settings → SMTP & API → API key v3 |
| `ECOMMSZONE_BASE_URL` | `https://comms.yourdomain.ca` |
| `APP_FROM_EMAIL` | Your verified sender address in Brevo |

> **Security reminder:** the `.env` file is in `.gitignore` and must never be committed.

Update `config/listmonk.toml` with your production `root_url`:

```bash
sed -i 's|https://comms.yourdomain.ca|https://comms.YOURACTUAL.DOMAIN|g' config/listmonk.toml
```

---

## 7. Start the Stack

```bash
# Pull images and start in detached mode
docker compose up -d

# Check status
docker compose ps

# Follow logs
docker compose logs -f listmonk
```

The PostgreSQL container starts first (health-checked). Once healthy, listmonk starts and runs its database migrations automatically.

---

## 8. Configure Brevo SMTP in listmonk

1. Open `http://<your-server-ip>:9000` (before reverse proxy is configured).
2. Log in with the admin credentials from your `.env`.
3. Go to **Settings → SMTP servers**.
4. Click **+ Add SMTP server** and enter:

   | Field | Value |
   |---|---|
   | Host | `smtp-relay.brevo.com` |
   | Port | `587` |
   | Auth protocol | `LOGIN` |
   | Username | `<BREVO_SMTP_USER>` |
   | Password | `<BREVO_SMTP_PASSWORD>` |
   | TLS | STARTTLS |
   | Max connections | `10` |

5. Click **Save** and then **Test** to send a test email.

---

## 9. Set Up a Reverse Proxy with TLS

### Option A — Caddy (simplest, auto-TLS)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Create `/etc/caddy/Caddyfile`:

```
comms.yourdomain.ca {
    reverse_proxy localhost:9000
}
```

```bash
sudo systemctl reload caddy
```

Caddy automatically provisions and renews a Let's Encrypt TLS certificate.

### Option B — Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Create site config
sudo tee /etc/nginx/sites-available/ecommszone << 'EOF'
server {
    listen 80;
    server_name comms.yourdomain.ca;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/ecommszone /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Obtain TLS certificate
sudo certbot --nginx -d comms.yourdomain.ca
```

---

## 10. Verify the Deployment

```bash
# Health check
curl -s https://comms.yourdomain.ca/health

# Expected response:
# {"status":"OK"}

# Check listmonk API
curl -s -u admin:<PASSWORD> https://comms.yourdomain.ca/api/health
```

Send a test transactional email from the listmonk UI:
**Campaigns → Transactional → Send test**

---

## 11. Set Up Database Backups

```bash
# Install a daily backup cron job
sudo tee /etc/cron.daily/ecommszone-backup << 'EOF'
#!/bin/bash
set -euo pipefail
BACKUP_DIR="/opt/ecommszone/backups"
DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
docker exec ecommszone_db \
  pg_dump -U listmonk listmonk | \
  gzip > "$BACKUP_DIR/listmonk-${DATE}.sql.gz"
# Keep last 30 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
EOF
sudo chmod +x /etc/cron.daily/ecommszone-backup
```

For off-site backups, pipe the dump to an S3-compatible bucket (Backblaze B2, Cloudflare R2, or AWS S3 `ca-central-1`):

```bash
# Example: upload to S3 with AWS CLI
aws s3 cp "$BACKUP_DIR/listmonk-${DATE}.sql.gz" s3://your-bucket/ecommszone/
```

---

## 12. Ongoing Operations

### Update listmonk

```bash
# Edit docker-compose.yml, update the image tag
# Then:
docker compose pull listmonk
docker compose up -d listmonk
```

### Restart services

```bash
docker compose restart listmonk
docker compose restart db
```

### View logs

```bash
docker compose logs -f --tail=100 listmonk
docker compose logs -f --tail=100 db
```

### Stop the stack

```bash
docker compose down
# To also remove volumes (WARNING: deletes all data):
docker compose down -v
```

---

## 13. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| listmonk not starting | DB not ready | Check `docker compose logs db`; ensure health check passes |
| "connection refused" on port 9000 | Port not exposed or firewall | Verify `docker compose ps`; check UFW rules |
| SMTP test fails | Wrong Brevo credentials | Re-check SMTP user/password in listmonk Settings |
| TLS certificate not issued | DNS not propagated | Wait 5–10 min; verify with `dig comms.yourdomain.ca` |
| Campaigns stuck in "sending" | Worker not running | Restart listmonk: `docker compose restart listmonk` |

---

*For issues not covered here, open a GitHub Issue and reference `MKTP-WORK-004`.*
