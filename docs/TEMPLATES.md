# eCommsZone — Templates

This document is the canonical reference for authoring, importing, and
maintaining message templates in eCommsZone.

## 1. Where templates live

```
templates/
├── transactional/
│   ├── order-confirmation.html
│   ├── shipping-notification.html
│   ├── rrr-points-alert.html
│   ├── password-reset.html
│   └── 2fa-sms.txt
└── marketing/
    └── (.gitkeep — campaigns ship under MKTP_WORK-005)
```

The files in this repository are the **source of truth**. listmonk's
admin UI is used for runtime, but every published template must be
backed by a file in this repo. PRs that change a template are how
template changes ship.

## 2. Template language

listmonk uses Go's `text/template` syntax with extensions. The most
important constructs you'll use:

| Syntax | Meaning |
|---|---|
| `{{ .Subscriber.FirstName }}`     | Subscriber attribute |
| `{{ .Tx.OrderNumber }}`           | Variable from the API call's `variables` map (transactional) |
| `{{ if eq .Tx.Tier "Gold" }}…{{ end }}` | Conditional |
| `{{ range .Tx.Items }}…{{ end }}` | Loop |
| `{{ UnsubscribeURL }}`            | Auto-injected — required in marketing |
| `{{ TrackingPixel }}`             | Auto-injected when open tracking is enabled |

> **Important:** transactional variables are namespaced under `.Tx`
> (this is an OQMI convention enforced at the API layer), keeping a
> clear separation from subscriber attributes.

## 3. Required tokens by channel

### 3.1 Email — every template
* `{{ UnsubscribeURL }}` somewhere in the footer (mandatory by listmonk
  for marketing; we include it on transactional templates too for
  consistency).
* OQMI physical address in the footer (CAN-SPAM / CASL).
* `<title>` element matching the subject line (helps preview text).

### 3.2 SMS — every template
* "Reply STOP to opt out." literal string at the end (TCPA / CRTC).
* Total length ≤ 160 GSM-7 characters (single segment) when feasible.

## 4. Importing into listmonk

Templates are imported once per environment.

### 4.1 Via UI
1. Sign in at <http://localhost:9000>.
2. **Campaigns → Templates → New**.
3. Paste the file's contents, name it after the file (e.g.
   `order-confirmation`), and save.
4. Note the numeric `template_id` listmonk assigns; record it in
   `config/brevo-config.json` under `templates`.

### 4.2 Via API
```bash
curl -fsS -u "$LISTMONK_ADMIN_USER:$LISTMONK_ADMIN_PASSWORD" \
  -H 'content-type: application/json' \
  -X POST http://localhost:9000/api/templates \
  -d "$(jq -nR --arg name "order-confirmation" \
              --arg body "$(cat templates/transactional/order-confirmation.html)" \
              '{name:$name, type:"tx", body:$body}')"
```

## 5. Variables reference (per template)

| Template | Required variables |
|---|---|
| `order-confirmation`     | `OrderNumber, OrderDate, Items[{Name,Qty,Price}], Subtotal, Shipping, Tax, Total, OrderUrl` |
| `shipping-notification`  | `OrderNumber, Carrier, TrackingNumber, TrackingUrl, EstimatedDelivery, ShipTo` |
| `rrr-points-alert`       | `PointsDelta, PointsBalance, Reason, TierName, NextTierPoints, RedeemUrl` |
| `password-reset`         | `ResetUrl, ExpiresInMinutes, RequestIp, RequestUserAgent, SupportUrl` |
| `2fa-sms`                | `Code, ExpiresInMinutes` |

All templates additionally rely on `Subscriber.FirstName` from the
listmonk subscriber profile. When sending to a non-subscriber (e.g. a
guest checkout) the API auto-creates a transient subscriber record.

## 6. Authoring checklist (PR review)

- [ ] File lives under `templates/transactional/` or `templates/marketing/`.
- [ ] HTML validated (no unbalanced tags); doctype and `lang` attribute set.
- [ ] Mobile-friendly: `<meta name="viewport">` present; max-width 600px.
- [ ] All variables in §5 documented in a comment block at the top.
- [ ] Footer with physical address + unsubscribe link (email).
- [ ] STOP-out language present (SMS).
- [ ] Subject line consistent with brand voice and < 78 chars.
- [ ] Litmus / Mail-tester preview screenshot attached to the PR.
- [ ] No remote tracking pixels other than listmonk's auto-injected one.
- [ ] No inline JavaScript (Gmail / Outlook strip it).

## 7. Localization

`{filename}.{locale}.html` is the convention for additional locales,
e.g. `order-confirmation.fr-CA.html`. The API picks the locale from the
subscriber's `preferred_locale` attribute, falling back to the file
without a locale suffix.

## 8. Versioning & rollback

* Templates are versioned implicitly via Git history.
* listmonk also stores prior versions on each save; the **History** tab
  lets ops roll back without a redeploy in an emergency.
* For a permanent rollback, revert the source file in this repo and
  re-import.
