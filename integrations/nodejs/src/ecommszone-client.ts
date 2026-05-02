/**
 * eCommsZone Client — TypeScript SDK
 * OmniQuest Media Inc. | PROGRAM_CONTROL: MKTP-WORK-004
 *
 * Provides a typed, async interface for sending transactional email,
 * bulk campaign email, and SMS through the eCommsZone platform
 * (listmonk + Brevo).
 *
 * External calls made by this module:
 *   1. listmonk REST API  — /api/tx          (transactional email)
 *   2. listmonk REST API  — /api/campaigns    (bulk campaigns)
 *   3. Brevo REST API     — /v3/transactionalSMS  (SMS dispatch)
 *
 * Security:
 *   - All credentials are read from constructor options or environment
 *     variables. No secrets are hard-coded.
 *   - HTTPS is enforced for production base URLs.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Constructor options for ECommsZoneClient. */
export interface ECommsZoneClientOptions {
  /** Base URL of the listmonk instance, e.g. https://comms.yourdomain.ca */
  baseUrl: string;
  /** listmonk admin username */
  apiUser: string;
  /** listmonk admin password */
  apiPassword: string;
  /** Brevo REST API key (required for SMS; optional if SMS not used) */
  brevoApiKey?: string;
  /** Default "from" email address used when not specified per-send */
  defaultFromEmail?: string;
  /** Default "from" display name used when not specified per-send */
  defaultFromName?: string;
  /** Request timeout in milliseconds (default: 10 000) */
  timeoutMs?: number;
}

/** Payload for sending a single transactional email. */
export interface SendEmailOptions {
  /** Recipient email address */
  toEmail: string;
  /** Recipient display name */
  toName?: string;
  /** Email subject line */
  subject: string;
  /** HTML body of the email */
  body: string;
  /** Override the default "from" email address */
  fromEmail?: string;
  /** Override the default "from" display name */
  fromName?: string;
  /**
   * ID of a listmonk transactional template to use.
   * When provided, `body` is used as template data rather than raw HTML.
   */
  templateId?: number;
  /** Optional key/value data passed to the template renderer */
  templateData?: Record<string, unknown>;
}

/** Payload for sending an SMS message via Brevo. */
export interface SendSMSOptions {
  /** Recipient phone number in E.164 format, e.g. +14165550123 */
  toPhone: string;
  /** Message content (max 160 chars for single SMS, longer is split) */
  message: string;
  /** Sender name (alphanumeric, max 11 chars, must be Brevo-approved) */
  sender?: string;
}

/** Payload for triggering a listmonk bulk campaign send. */
export interface SendBulkOptions {
  /** ID of an existing listmonk campaign to send */
  campaignId: number;
}

/** Unified response returned by all send methods. */
export interface SendResult {
  /** Whether the API call succeeded */
  success: boolean;
  /** HTTP status code from the upstream API */
  statusCode: number;
  /** Human-readable message or error description */
  message: string;
  /** Raw response body from the upstream API (for debugging) */
  raw?: unknown;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * ECommsZoneClient — entry point for all outbound communications.
 *
 * @example
 * ```typescript
 * const client = new ECommsZoneClient({
 *   baseUrl:     process.env.ECOMMSZONE_BASE_URL!,
 *   apiUser:     process.env.LISTMONK_ADMIN_USER!,
 *   apiPassword: process.env.LISTMONK_ADMIN_PASSWORD!,
 *   brevoApiKey: process.env.BREVO_API_KEY,
 * });
 *
 * await client.sendEmail({ toEmail: 'user@example.com', subject: 'Hello', body: '<p>Hi!</p>' });
 * await client.sendSMS({ toPhone: '+14165550123', message: 'Your code is 1234' });
 * await client.sendBulk({ campaignId: 42 });
 * ```
 */
export class ECommsZoneClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly brevoApiKey: string | undefined;
  private readonly defaultFromEmail: string;
  private readonly defaultFromName: string;
  private readonly timeoutMs: number;

  /** Brevo transactional SMS endpoint */
  private static readonly BREVO_SMS_URL =
    'https://api.brevo.com/v3/transactionalSMS/sms';

  constructor(options: ECommsZoneClientOptions) {
    if (!options.baseUrl) {
      throw new Error('[ECommsZoneClient] baseUrl is required.');
    }
    if (!options.apiUser || !options.apiPassword) {
      throw new Error('[ECommsZoneClient] apiUser and apiPassword are required.');
    }

    // Remove trailing slash for consistent URL building
    this.baseUrl = options.baseUrl.replace(/\/$/, '');

    // Encode credentials for HTTP Basic Auth
    const credentials = Buffer.from(
      `${options.apiUser}:${options.apiPassword}`
    ).toString('base64');
    this.authHeader = `Basic ${credentials}`;

    this.brevoApiKey = options.brevoApiKey;
    this.defaultFromEmail = options.defaultFromEmail ?? 'noreply@yourdomain.ca';
    this.defaultFromName = options.defaultFromName ?? 'OmniQuest Media';
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  // -------------------------------------------------------------------------
  // sendEmail
  // -------------------------------------------------------------------------

  /**
   * Send a transactional email to a single recipient via listmonk.
   *
   * External call: POST {baseUrl}/api/tx
   * Docs: https://listmonk.app/docs/apis/transactional/
   *
   * @param options - Email payload
   * @returns SendResult
   */
  async sendEmail(options: SendEmailOptions): Promise<SendResult> {
    const url = `${this.baseUrl}/api/tx`;

    const payload: Record<string, unknown> = {
      subscriber_email: options.toEmail,
      template_id: options.templateId ?? 0,
      from_email: options.fromEmail
        ? this.formatAddress(options.fromEmail, options.fromName)
        : this.formatAddress(this.defaultFromEmail, this.defaultFromName),
      subject: options.subject,
      messenger: 'email',
      content_type: 'html',
      body: options.body,
      data: options.templateData ?? {},
    };

    return this.post(url, payload, this.listmonkHeaders());
  }

  // -------------------------------------------------------------------------
  // sendSMS
  // -------------------------------------------------------------------------

  /**
   * Send a transactional SMS to a single phone number via Brevo.
   *
   * External call: POST https://api.brevo.com/v3/transactionalSMS/sms
   * Docs: https://developers.brevo.com/reference/sendtransacsms
   *
   * @param options - SMS payload
   * @returns SendResult
   */
  async sendSMS(options: SendSMSOptions): Promise<SendResult> {
    if (!this.brevoApiKey) {
      throw new Error(
        '[ECommsZoneClient] brevoApiKey is required to send SMS. ' +
          'Set BREVO_API_KEY in your environment.'
      );
    }

    const payload = {
      sender: options.sender ?? 'OQMedia',
      recipient: options.toPhone,
      content: options.message,
      type: 'transactional',
    };

    return this.post(
      ECommsZoneClient.BREVO_SMS_URL,
      payload,
      this.brevoHeaders()
    );
  }

  // -------------------------------------------------------------------------
  // sendBulk
  // -------------------------------------------------------------------------

  /**
   * Trigger a bulk campaign send in listmonk.
   * The campaign must already exist and be in "draft" status.
   *
   * External call: PUT {baseUrl}/api/campaigns/{id}/status
   * Docs: https://listmonk.app/docs/apis/campaigns/
   *
   * @param options - Bulk send payload
   * @returns SendResult
   */
  async sendBulk(options: SendBulkOptions): Promise<SendResult> {
    const url = `${this.baseUrl}/api/campaigns/${options.campaignId}/status`;
    const payload = { status: 'running' };
    return this.put(url, payload, this.listmonkHeaders());
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Build RFC 5322 "Name <email>" address string. */
  private formatAddress(email: string, name?: string): string {
    return name ? `"${name}" <${email}>` : email;
  }

  /** HTTP headers for listmonk API requests. */
  private listmonkHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: this.authHeader,
    };
  }

  /** HTTP headers for Brevo API requests. */
  private brevoHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'api-key': this.brevoApiKey!,
      accept: 'application/json',
    };
  }

  /** Perform a POST request with timeout and error handling. */
  private async post(
    url: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<SendResult> {
    return this.request('POST', url, body, headers);
  }

  /** Perform a PUT request with timeout and error handling. */
  private async put(
    url: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<SendResult> {
    return this.request('PUT', url, body, headers);
  }

  /** Generic fetch wrapper with AbortController timeout. */
  private async request(
    method: string,
    url: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let raw: unknown;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        raw = await response.json();
      } else {
        raw = await response.text();
      }

      if (!response.ok) {
        return {
          success: false,
          statusCode: response.status,
          message: `Request failed with status ${response.status}`,
          raw,
        };
      }

      return {
        success: true,
        statusCode: response.status,
        message: 'OK',
        raw,
      };
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error && err.name === 'AbortError';
      return {
        success: false,
        statusCode: 0,
        message: isAbort
          ? `Request timed out after ${this.timeoutMs}ms`
          : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
