<?php
/**
 * Plugin Name: OQMI HumanContact Hook (RRP)
 * Description: Bridges RedRoomPleasures (WordPress) events to the
 *              eCommsZone /v1/escalation endpoint, which routes the issue
 *              to the correct HumanContactZone tier (Standard CS,
 *              Diamond Concierge, or Moderation Agent).
 * Author:      OmniQuest Media Inc.
 * Version:     1.0.0
 * License:     Proprietary — internal OQMI use only.
 *
 * PROGRAM_CONTROL: MKTP-WORK-004
 *
 * External call:
 *   POST {ECOMMSZONE_API_BASE}/v1/escalation
 *   Docs: docs/SENIOR-ENGINEER-NOTE.md, docs/api-reference.md
 *
 * Security:
 *   - The eCommsZone API key is read from the `OQMI_ECOMMSZONE_API_KEY`
 *     constant (defined in wp-config.php) or, as a fallback, the encrypted
 *     `oqmi_ecommszone_api_key` option. It is NEVER hard-coded here.
 *   - All requests use HTTPS with a 10-second timeout.
 *   - Signed with HMAC-SHA256 using `OQMI_ECOMMSZONE_HMAC_SECRET`.
 *
 * @package OQMI\HumanContact
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Block direct access.
}

/**
 * Build the eCommsZone /v1/escalation request body for a given event.
 *
 * Triage fields here are intentionally minimal stubs; the eCommsZone
 * API enriches them with the AI triage classifier before the
 * EscalationService matrix runs.
 *
 * @param string $intent      Coarse intent (e.g. 'billing_dispute').
 * @param string $summary     Human-readable 1-line summary.
 * @param array  $context     Subscriber + source context.
 * @return array              Request payload.
 */
function oqmi_rrp_build_payload( $intent, $summary, array $context ) {
    $correlation_id = wp_generate_uuid4();

    return array(
        'source'         => 'rrp',
        'tenantId'       => 'redroompleasures',
        'subscriberId'   => isset( $context['subscriber_id'] ) ? (string) $context['subscriber_id'] : '',
        'correlationId'  => $correlation_id,
        'triage'         => array(
            'intent'           => $intent,
            'intentConfidence' => 0.6, // Pre-AI; eCommsZone will refine.
            'sentiment'        => isset( $context['sentiment'] ) ? (float) $context['sentiment'] : 0.0,
            'riskFlags'        => isset( $context['risk_flags'] ) ? (array) $context['risk_flags'] : array(),
            'language'         => isset( $context['language'] ) ? (string) $context['language'] : 'en',
            'summary'          => (string) $summary,
            'lastMessages'     => isset( $context['last_messages'] ) ? (array) $context['last_messages'] : array(),
            'amountCad'        => isset( $context['amount_cad'] ) ? (float) $context['amount_cad'] : null,
        ),
        'links'          => array(
            'rrpOrderUrl' => isset( $context['order_url'] ) ? esc_url_raw( $context['order_url'] ) : null,
        ),
    );
}

/**
 * Resolve the eCommsZone API base URL, API key, and HMAC secret.
 *
 * @return array{base:string, key:string, secret:string}|null  null if misconfigured.
 */
function oqmi_rrp_get_credentials() {
    $base   = defined( 'OQMI_ECOMMSZONE_API_BASE' ) ? OQMI_ECOMMSZONE_API_BASE : '';
    $key    = defined( 'OQMI_ECOMMSZONE_API_KEY' )
        ? OQMI_ECOMMSZONE_API_KEY
        : (string) get_option( 'oqmi_ecommszone_api_key', '' );
    $secret = defined( 'OQMI_ECOMMSZONE_HMAC_SECRET' )
        ? OQMI_ECOMMSZONE_HMAC_SECRET
        : (string) get_option( 'oqmi_ecommszone_hmac_secret', '' );

    if ( empty( $base ) || empty( $key ) || empty( $secret ) ) {
        return null;
    }
    if ( 0 !== stripos( $base, 'https://' ) ) {
        return null; // Refuse non-HTTPS endpoints.
    }
    return array(
        'base'   => rtrim( $base, '/' ),
        'key'    => $key,
        'secret' => $secret,
    );
}

/**
 * POST the payload to eCommsZone /v1/escalation, signed with HMAC-SHA256.
 *
 * Failures are logged via `error_log` (no PII) and never thrown to the
 * caller; the source action (form submission, order failure, …) must not
 * be blocked by an HCZ outage.
 *
 * @param array $payload  Already built by oqmi_rrp_build_payload().
 * @return bool           True on 2xx, false otherwise.
 */
function oqmi_rrp_dispatch_escalation( array $payload ) {
    $creds = oqmi_rrp_get_credentials();
    if ( null === $creds ) {
        error_log( '[OQMI] RRP escalation skipped: missing or invalid credentials.' );
        return false;
    }

    $body      = wp_json_encode( $payload );
    $signature = 'sha256=' . hash_hmac( 'sha256', $body, $creds['secret'] );

    $response = wp_remote_post(
        $creds['base'] . '/v1/escalation',
        array(
            'timeout'   => 10,
            'sslverify' => true, // Never disable in production.
            'headers'   => array(
                'Content-Type'           => 'application/json',
                'Authorization'          => 'Bearer ' . $creds['key'],
                'X-OQMI-Signature'       => $signature,
                'X-OQMI-Correlation-Id'  => isset( $payload['correlationId'] ) ? $payload['correlationId'] : '',
                'X-OQMI-Tenant'          => 'redroompleasures',
            ),
            'body'      => $body,
        )
    );

    if ( is_wp_error( $response ) ) {
        error_log(
            sprintf(
                '[OQMI] RRP escalation transport error (correlationId=%s): %s',
                isset( $payload['correlationId'] ) ? $payload['correlationId'] : '',
                $response->get_error_message()
            )
        );
        return false;
    }

    $status = (int) wp_remote_retrieve_response_code( $response );
    if ( $status >= 200 && $status < 300 ) {
        return true;
    }

    error_log(
        sprintf(
            '[OQMI] RRP escalation rejected (correlationId=%s): HTTP %d',
            isset( $payload['correlationId'] ) ? $payload['correlationId'] : '',
            $status
        )
    );
    return false;
}

/**
 * Hook: WPForms contact-form completion.
 * Treat as a `general_inquiry` with low AI confidence so eCommsZone's
 * AI triage layer can refine the intent before the matrix runs.
 *
 * @param array $fields    Submitted field values.
 * @param array $entry     Entry data.
 * @param array $form_data Form configuration.
 * @param int   $entry_id  Entry id.
 * @return void
 */
function oqmi_rrp_on_wpforms_complete( $fields, $entry, $form_data, $entry_id ) {
    unset( $entry, $form_data, $entry_id ); // Unused.

    $email   = '';
    $message = '';
    if ( is_array( $fields ) ) {
        foreach ( $fields as $field ) {
            if ( ! is_array( $field ) || ! isset( $field['type'] ) ) {
                continue;
            }
            if ( 'email' === $field['type'] && isset( $field['value'] ) ) {
                $email = sanitize_email( (string) $field['value'] );
            }
            if ( 'textarea' === $field['type'] && isset( $field['value'] ) ) {
                $message = sanitize_textarea_field( (string) $field['value'] );
            }
        }
    }

    $payload = oqmi_rrp_build_payload(
        'general_inquiry',
        wp_trim_words( $message, 25, '…' ),
        array(
            'subscriber_id' => $email, // eCommsZone resolves to RRR id.
            'language'      => substr( (string) get_locale(), 0, 2 ),
            'last_messages' => array(
                array(
                    'ts'   => gmdate( 'c' ),
                    'from' => 'subscriber',
                    'body' => $message,
                ),
            ),
        )
    );

    oqmi_rrp_dispatch_escalation( $payload );
}
add_action( 'wpforms_process_complete', 'oqmi_rrp_on_wpforms_complete', 10, 4 );

/**
 * Hook: WooCommerce order failed.
 * Routes a `billing_dispute` candidate to eCommsZone with the order amount
 * so the matrix can promote to Diamond Concierge if ≥ threshold.
 *
 * @param int $order_id Order id.
 * @return void
 */
function oqmi_rrp_on_order_failed( $order_id ) {
    if ( ! function_exists( 'wc_get_order' ) ) {
        return;
    }
    $order = wc_get_order( (int) $order_id );
    if ( ! $order ) {
        return;
    }

    $payload = oqmi_rrp_build_payload(
        'billing_dispute',
        sprintf( 'Order #%d failed at checkout', (int) $order_id ),
        array(
            'subscriber_id' => (string) $order->get_billing_email(),
            'amount_cad'    => (float) $order->get_total(),
            'language'      => substr( (string) get_locale(), 0, 2 ),
            'order_url'     => $order->get_edit_order_url(),
        )
    );

    oqmi_rrp_dispatch_escalation( $payload );
}
add_action( 'woocommerce_order_status_failed', 'oqmi_rrp_on_order_failed', 10, 1 );

/**
 * Custom action: do_action( 'oqmi_rrp_escalate', $intent, $summary, $context )
 *
 * Lets other RRP plugins / themes raise an escalation directly:
 *
 *   do_action(
 *       'oqmi_rrp_escalate',
 *       'account_recovery',
 *       'Subscriber failed 3x login attempts',
 *       array( 'subscriber_id' => $email, 'language' => 'en' )
 *   );
 *
 * @param string $intent  Intent label.
 * @param string $summary Human-readable summary.
 * @param array  $context Optional context (subscriber_id, amount_cad, etc.).
 * @return void
 */
function oqmi_rrp_on_custom_escalate( $intent, $summary, $context = array() ) {
    if ( ! is_string( $intent ) || '' === $intent ) {
        return;
    }
    $payload = oqmi_rrp_build_payload(
        sanitize_key( $intent ),
        sanitize_text_field( (string) $summary ),
        is_array( $context ) ? $context : array()
    );
    oqmi_rrp_dispatch_escalation( $payload );
}
add_action( 'oqmi_rrp_escalate', 'oqmi_rrp_on_custom_escalate', 10, 3 );
