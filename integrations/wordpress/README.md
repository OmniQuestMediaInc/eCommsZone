# oqmi-ecommszone (WordPress plugin — placeholder)

This directory will host the **`oqmi-ecommszone`** WordPress / WooCommerce
plugin: the canonical bridge between OQMI WordPress properties and the
eCommsZone service bureau.

> **Status:** Placeholder. Implementation is tracked under a separate
> directive (see `PROGRAM_CONTROL/DIRECTIVES/QUEUE/MKTP_WORK-004.md`,
> §5 *Out of Scope*). The directive that delivers the plugin will be
> filed as `MKTP_WORK-006`.

## Planned scope

* Hook into WooCommerce events (`woocommerce_thankyou`,
  `woocommerce_order_status_completed`, `woocommerce_new_customer_note`, …).
* Hook into WordPress core events (`user_register`,
  `retrieve_password_message`, `comment_post`, …).
* Forward those events to the eCommsZone HTTP API using the
  `ECOMMSZONE_API_TOKEN` shared secret.
* Provide a settings screen for sender identity, template overrides per
  event, and a per-site test-send tool.
* Ship with translations (en_CA, fr_CA) and WP-CLI commands for ops.

## Layout (when implemented)

```
oqmi-ecommszone/
├── oqmi-ecommszone.php          # plugin bootstrap
├── includes/
│   ├── class-client.php         # thin HTTP client around eCommsZone API
│   ├── class-woocommerce.php    # WooCommerce event subscribers
│   ├── class-core-events.php    # WP core event subscribers
│   └── class-settings.php
├── languages/
└── readme.txt
```

## Contracts

* The plugin MUST NOT contain any provider (Brevo) credentials. It only
  ever talks to the eCommsZone API.
* The plugin MUST honour the OQMI suppression list returned by the API.
* The plugin MUST NOT send a marketing message without verifying the
  user has an `ecommszone_marketing_optin` flag of `true`.
