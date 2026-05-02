/**
 * eCommsZone Node.js / TypeScript client.
 *
 * The canonical SDK every OmniQuest service uses to talk to the eCommsZone
 * service bureau. Wraps the public HTTP API (see `docs/API.md`) and provides
 * three primary methods:
 *
 *   - sendEmail()  — single transactional email
 *   - sendSMS()    — single transactional SMS
 *   - sendBulk()   — fan-out send to a list / segment / array of recipients
 *
 * Design goals:
 *   - Zero runtime dependencies (uses the global `fetch` available in
 *     Node.js >= 18.17).
 *   - Strict TypeScript types for compile-time safety in calling services.
 *   - Built-in retry with exponential backoff and jitter for transient
 *     failures (HTTP 429 / 5xx / network errors).
 *   - Idempotency keys to make retries safe.
 *   - Never logs message bodies or PII at info level.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Configuration accepted by {@link ECommsZoneClient}. */
export interface ECommsZoneClientOptions {
  /** Base URL of the eCommsZone API (e.g. `https://comms.omniquestmedia.com`). */
  baseUrl: string;
  /** Bearer token issued by eCommsZone for the calling service. */
  apiToken: string;
  /** Logical name of the calling service, e.g. `"ecommzone-marketplace"`. */
  serviceName: string;
  /** Per-request timeout in milliseconds. Default: 10_000. */
  timeoutMs?: number;
  /** Retry configuration. */
  retry?: RetryOptions;
  /** Optional structured logger. Defaults to a no-op. */
  logger?: Logger;
  /** Optional `fetch` override (useful for tests). */
  fetchImpl?: typeof fetch;
}

export interface RetryOptions {
  /** Max attempts including the first. Default: 3. */
  maxAttempts?: number;
  /** Initial backoff in ms. Default: 500. */
  initialDelayMs?: number;
  /** Max backoff cap in ms. Default: 8_000. */
  maxDelayMs?: number;
  /** Apply +/- 50% jitter. Default: true. */
  jitter?: boolean;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/** A single email recipient. */
export interface EmailRecipient {
  email: string;
  name?: string;
}

/** Payload for {@link ECommsZoneClient.sendEmail}. */
export interface SendEmailRequest {
  /** OQMI logical template ID, e.g. `"order-confirmation"`. */
  templateId: string;
  /** Single recipient (use {@link sendBulk} for multi-recipient sends). */
  to: EmailRecipient;
  /** Optional override of the configured default sender. */
  from?: EmailRecipient;
  /** Optional reply-to address. */
  replyTo?: EmailRecipient;
  /** Merge variables substituted into the template at render time. */
  variables?: Record<string, unknown>;
  /** Optional subject override (otherwise template-defined). */
  subject?: string;
  /** Free-form tags for analytics; max 10 tags, each <= 64 chars. */
  tags?: string[];
  /** Optional idempotency key. Auto-generated if omitted. */
  idempotencyKey?: string;
  /** Mark as `marketing` to route through marketing suppression rules. */
  category?: 'transactional' | 'marketing';
}

/** Payload for {@link ECommsZoneClient.sendSMS}. */
export interface SendSMSRequest {
  /** E.164 phone number, e.g. `"+14165551234"`. */
  to: string;
  /** Either a templateId + variables OR a raw message body. */
  templateId?: string;
  /** Variables for the template (ignored when `body` is provided). */
  variables?: Record<string, unknown>;
  /** Raw message body. Mutually exclusive with `templateId`. */
  body?: string;
  /** Sender ID override (default: configured `BREVO_SMS_SENDER`). */
  sender?: string;
  /** Tags for analytics. */
  tags?: string[];
  idempotencyKey?: string;
  category?: 'transactional' | 'marketing';
}

/** Payload for {@link ECommsZoneClient.sendBulk}. */
export interface SendBulkRequest {
  /** Channel for the bulk send. */
  channel: 'email' | 'sms';
  /** OQMI template ID. */
  templateId: string;
  /**
   * Audience selector. Provide exactly one of:
   *   - `recipients`  inline list (max 1,000 per request)
   *   - `listId`      a listmonk list ID
   *   - `segmentId`   a listmonk dynamic segment ID
   */
  recipients?: BulkRecipient[];
  listId?: number;
  segmentId?: number;
  /** Variables applied to every recipient (merged with per-recipient vars). */
  globalVariables?: Record<string, unknown>;
  /** ISO-8601 timestamp; if set, the send is queued for that time. */
  scheduledAt?: string;
  tags?: string[];
  idempotencyKey?: string;
  category?: 'transactional' | 'marketing';
}

export interface BulkRecipient {
  /** Required for `channel: "email"`. */
  email?: string;
  /** Required for `channel: "sms"` (E.164). */
  phone?: string;
  name?: string;
  /** Per-recipient merge variables (override globals). */
  variables?: Record<string, unknown>;
}

/** Response envelope returned by every send method. */
export interface SendResult {
  /** Server-assigned message ID (or batch ID for bulk). */
  messageId: string;
  /** `queued` for async/bulk; `sent` for sync transactional. */
  status: 'queued' | 'sent' | 'scheduled';
  /** Echo of the idempotency key used. */
  idempotencyKey: string;
  /** Optional provider-side reference (Brevo message ID). */
  providerRef?: string;
  /** Recipient count for bulk; 1 for single sends. */
  recipientCount: number;
}

/** Thrown for any non-success response (after retries are exhausted). */
export class ECommsZoneError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ECommsZoneError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 8_000,
  jitter: true,
};

const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Official client for the eCommsZone communications service bureau.
 *
 * @example
 * ```ts
 * const client = new ECommsZoneClient({
 *   baseUrl:     process.env.ECOMMSZONE_API_BASE_URL!,
 *   apiToken:    process.env.ECOMMSZONE_API_TOKEN!,
 *   serviceName: "ecommzone-marketplace",
 * });
 *
 * await client.sendEmail({
 *   templateId: "order-confirmation",
 *   to: { email: "buyer@example.com", name: "Pat" },
 *   variables: { OrderNumber: "1234", Total: "$42.00" },
 * });
 * ```
 */
export class ECommsZoneClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly serviceName: string;
  private readonly timeoutMs: number;
  private readonly retry: Required<RetryOptions>;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ECommsZoneClientOptions) {
    if (!opts.baseUrl) throw new Error('ECommsZoneClient: baseUrl is required');
    if (!opts.apiToken) throw new Error('ECommsZoneClient: apiToken is required');
    if (!opts.serviceName) throw new Error('ECommsZoneClient: serviceName is required');

    // Strip trailing slashes without using a regex (avoids polynomial-ReDoS
    // patterns when the input contains many repeated slashes).
    let baseUrl = opts.baseUrl;
    while (baseUrl.length > 0 && baseUrl.charCodeAt(baseUrl.length - 1) === 47 /* '/' */) {
      baseUrl = baseUrl.slice(0, -1);
    }
    this.baseUrl = baseUrl;
    this.apiToken = opts.apiToken;
    this.serviceName = opts.serviceName;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = { ...DEFAULT_RETRY, ...(opts.retry ?? {}) };
    this.logger = opts.logger ?? NOOP_LOGGER;

    const f = opts.fetchImpl ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new Error(
        'ECommsZoneClient: global fetch is unavailable. Use Node.js >= 18.17 or pass `fetchImpl`.',
      );
    }
    this.fetchImpl = f.bind(globalThis);
  }

  /** Send a single transactional email. */
  public async sendEmail(req: SendEmailRequest): Promise<SendResult> {
    if (!req.templateId) throw new Error('sendEmail: templateId is required');
    if (!req.to?.email) throw new Error('sendEmail: to.email is required');

    const body = {
      ...req,
      idempotencyKey: req.idempotencyKey ?? generateIdempotencyKey(),
      category: req.category ?? 'transactional',
    };
    return this.request<SendResult>('POST', '/v1/messages/email', body);
  }

  /** Send a single transactional SMS. */
  public async sendSMS(req: SendSMSRequest): Promise<SendResult> {
    if (!req.to) throw new Error('sendSMS: to is required');
    if (!req.body && !req.templateId) {
      throw new Error('sendSMS: either body or templateId is required');
    }
    if (req.body && req.templateId) {
      throw new Error('sendSMS: body and templateId are mutually exclusive');
    }
    if (!isE164(req.to)) {
      throw new Error(`sendSMS: "to" must be an E.164 phone number, got "${req.to}"`);
    }

    const body = {
      ...req,
      idempotencyKey: req.idempotencyKey ?? generateIdempotencyKey(),
      category: req.category ?? 'transactional',
    };
    return this.request<SendResult>('POST', '/v1/messages/sms', body);
  }

  /**
   * Bulk send to a list, segment, or inline recipient array.
   * Returns once the batch is accepted by eCommsZone — actual delivery is
   * asynchronous and reported via webhooks.
   */
  public async sendBulk(req: SendBulkRequest): Promise<SendResult> {
    if (!req.channel) throw new Error('sendBulk: channel is required');
    if (!req.templateId) throw new Error('sendBulk: templateId is required');

    const audienceSources = [req.recipients, req.listId, req.segmentId].filter(
      (x) => x !== undefined && x !== null,
    );
    if (audienceSources.length !== 1) {
      throw new Error(
        'sendBulk: provide exactly one of recipients, listId, or segmentId',
      );
    }
    if (req.recipients && req.recipients.length > 1000) {
      throw new Error('sendBulk: inline recipients capped at 1000 per request');
    }

    const body = {
      ...req,
      idempotencyKey: req.idempotencyKey ?? generateIdempotencyKey(),
      category: req.category ?? 'transactional',
    };
    return this.request<SendResult>('POST', '/v1/messages/bulk', body);
  }

  // -------------------------------------------------------------------------
  // Internal: HTTP with retry / timeout
  // -------------------------------------------------------------------------

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const payload = body === undefined ? undefined : JSON.stringify(body);

    let lastErr: unknown;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiToken}`,
            'user-agent': `ecommszone-node/${this.serviceName}`,
            'x-oqmi-service': this.serviceName,
          },
          body: payload,
          signal: controller.signal,
        });

        const requestId = res.headers.get('x-request-id') ?? undefined;

        if (res.ok) {
          return (await res.json()) as T;
        }

        // Parse error envelope (best-effort).
        let errCode = `HTTP_${res.status}`;
        let errMsg = `eCommsZone request failed: ${res.status} ${res.statusText}`;
        try {
          const errBody = (await res.json()) as { code?: string; message?: string };
          if (errBody.code) errCode = errBody.code;
          if (errBody.message) errMsg = errBody.message;
        } catch {
          /* response wasn't JSON; keep defaults */
        }

        // Retry on 429 / 5xx; surface 4xx immediately.
        if (res.status === 429 || res.status >= 500) {
          lastErr = new ECommsZoneError(errMsg, res.status, errCode, requestId);
          this.logger.warn('eCommsZone retryable error', {
            attempt,
            status: res.status,
            code: errCode,
            requestId,
          });
        } else {
          throw new ECommsZoneError(errMsg, res.status, errCode, requestId);
        }
      } catch (err) {
        if (err instanceof ECommsZoneError && err.status < 500 && err.status !== 429) {
          throw err; // non-retryable
        }
        lastErr = err;
        this.logger.warn('eCommsZone request error', {
          attempt,
          error: (err as Error)?.message,
        });
      } finally {
        clearTimeout(timer);
      }

      if (attempt < this.retry.maxAttempts) {
        await sleep(this.computeBackoff(attempt));
      }
    }

    if (lastErr instanceof Error) throw lastErr;
    throw new Error('eCommsZone request failed after retries');
  }

  private computeBackoff(attempt: number): number {
    const base = Math.min(
      this.retry.maxDelayMs,
      this.retry.initialDelayMs * 2 ** (attempt - 1),
    );
    if (!this.retry.jitter) return base;
    const jitter = base * 0.5 * (Math.random() * 2 - 1); // +/- 50%
    return Math.max(0, Math.round(base + jitter));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lightweight E.164 sanity check (not a full validator). */
function isE164(input: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(input);
}

/**
 * Generate an idempotency key. Prefers `crypto.randomUUID` (Node >= 19,
 * available behind the `node:crypto` module on 18.17+); falls back to a
 * timestamp + random suffix.
 */
function generateIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export default ECommsZoneClient;
