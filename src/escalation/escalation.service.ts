/**
 * EscalationService — HumanContactZone (HCZ) routing for eCommsZone.
 * OmniQuest Media Inc. | PROGRAM_CONTROL: MKTP-WORK-004
 *
 * Responsibilities:
 *   1. Apply the escalation decision matrix (see docs/SENIOR-ENGINEER-NOTE.md §3)
 *      to decide which human tier should handle an inbound issue.
 *   2. Assemble a normalized HCZ context envelope (§5) preserving full
 *      upstream context and a single end-to-end correlationId.
 *   3. Dispatch the envelope to HumanContactZone over HTTPS, signed with
 *      HMAC-SHA256, with timeout + bounded exponential back-off.
 *   4. Write an audit_log row for every decision (success, failure, queued).
 *
 * External calls made by this module:
 *   1. POST  ${HCZ_ENDPOINT}/v1/tickets        (HumanContactZone ingress)
 *      Docs: internal — see HCZ API spec v1.
 *   2. GET   ${RRR_API_BASE}/subscribers/{id}  (RedRoomRewards profile lookup,
 *      performed by an injected SubscriberProvider)
 *      Docs: internal — see RRR API spec.
 *
 * Security:
 *   - All credentials are read from environment variables; nothing is
 *     hard-coded. TLS verification is never disabled.
 *   - Message bodies are never logged at INFO; redacted at DEBUG.
 */

import { createHmac, randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Source system that produced the inbound event. */
export type EscalationSource = 'rrp' | 'cnz' | 'rrr' | 'ecommszone';

/** Human tier inside HumanContactZone. */
export type HumanTier =
  | 'standard_cs'
  | 'diamond_concierge'
  | 'moderation_agent';

/** Priority levels (P0 highest). */
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

/** Subscriber loyalty tier as reported by RedRoomRewards. */
export type LoyaltyTier = 'diamond' | 'gold' | 'silver' | null;

/** Coarse intent labels produced by the AI triage layer. */
export type Intent =
  | 'general_inquiry'
  | 'delivery'
  | 'product_question'
  | 'password_reset'
  | 'account_recovery'
  | 'billing_dispute'
  | 'casl_complaint'
  | 'data_export_request'
  | 'unsubscribe_abuse'
  | 'moderation_flag'
  | 'unknown';

/** Output of the AI triage layer for a single inbound event. */
export interface TriageSignal {
  /** Best-guess intent label. */
  intent: Intent;
  /** Model confidence in `intent`, in [0, 1]. */
  intentConfidence: number;
  /** Sentiment score in [-1, 1]; negative = negative. */
  sentiment: number;
  /** Risk flags raised by safety / compliance classifiers. */
  riskFlags: string[];
  /** Detected language (BCP-47 short code). */
  language: 'en' | 'fr' | string;
  /** AI-generated 1-line summary of the issue. */
  summary: string;
  /** Last few messages in the thread (chronological). */
  lastMessages: Array<{
    ts: string;
    from: 'subscriber' | 'agent' | 'system';
    body: string;
  }>;
  /** Optional monetary amount in CAD relevant to the issue (e.g. dispute). */
  amountCad?: number;
}

/** Subscriber context fetched from RedRoomRewards. */
export interface SubscriberContext {
  id: string;
  displayName: string;
  language: 'en' | 'fr' | string;
  tier: LoyaltyTier;
  lifetimeValueCad: number;
  contactPreference: 'email' | 'sms' | 'chat';
}

/** Links back to source artefacts so HCZ agents land in-context. */
export interface SourceLinks {
  rrpOrderUrl?: string;
  cnzTranscriptUrl?: string;
  rrrRewardUrl?: string;
  /** Filled in after the audit_log row is written. */
  auditLogId?: number;
}

/** Input to {@link EscalationService.handleEvent}. */
export interface EscalationRequest {
  /** Source system. */
  source: EscalationSource;
  /** Tenant id, e.g. `redroompleasures`. */
  tenantId: string;
  /** Subscriber id (RRR canonical id). */
  subscriberId: string;
  /** AI triage output for this event. */
  triage: TriageSignal;
  /** Optional links back to source artefacts. */
  links?: SourceLinks;
  /**
   * Optional caller-supplied correlation id. If omitted, a UUID v4 is
   * generated. Use this when an upstream system (RRP, CNZ) already minted one.
   */
  correlationId?: string;
}

/** Decision produced by the matrix. */
export interface EscalationDecision {
  tier: HumanTier;
  priority: Priority;
  /** Stable machine-readable code for analytics. */
  reasonCode:
    | 'MOD_FLAG'
    | 'COMPLIANCE'
    | 'DIAMOND_TIER'
    | 'CHURN_RISK'
    | 'HIGH_VALUE_DISPUTE'
    | 'ACCOUNT_RECOVERY'
    | 'DEFAULT_HUMAN'
    | 'LOW_AI_CONFIDENCE';
  /** 1-based row number in the matrix that fired. */
  matchedRule: number;
}

/** The signed envelope sent to HumanContactZone. */
export interface HczEnvelope {
  schemaVersion: '1.0';
  correlationId: string;
  tenantId: string;
  source: EscalationSource;
  tier: HumanTier;
  priority: Priority;
  reasonCode: EscalationDecision['reasonCode'];
  matchedRule: number;
  subscriber: SubscriberContext;
  issue: {
    intent: Intent;
    intentConfidence: number;
    sentiment: number;
    riskFlags: string[];
    summary: string;
    lastMessages: TriageSignal['lastMessages'];
  };
  links: SourceLinks;
  createdAt: string;
}

/** Final outcome returned by {@link EscalationService.handleEvent}. */
export interface EscalationResult {
  correlationId: string;
  decision: EscalationDecision;
  dispatch:
    | { status: 'sent'; httpStatus: number }
    | { status: 'queued_for_retry'; lastError: string }
    | { status: 'failed'; lastError: string };
}

// ---------------------------------------------------------------------------
// Dependencies (narrow ports — kept injectable for testability)
// ---------------------------------------------------------------------------

/** Minimal audit-log writer. Matches the existing AuditService surface area. */
export interface AuditLogger {
  log(entry: {
    tenantId: string;
    channel: 'email' | 'sms' | 'campaign' | 'escalation';
    direction: 'outbound' | 'inbound_webhook';
    status: string;
    recipient?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id?: number } | void>;
}

/** Minimal logger surface (winston-compatible). */
export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug?(msg: string, meta?: Record<string, unknown>): void;
}

/** Subscriber-context provider (RedRoomRewards). */
export interface SubscriberProvider {
  fetch(subscriberId: string): Promise<SubscriberContext>;
}

/** Configuration (all values resolved from env in {@link loadEscalationConfig}). */
export interface EscalationConfig {
  hczEndpoint: string;
  hczHmacSecret: string;
  /** Per-call timeout in ms (default 10_000). */
  timeoutMs: number;
  /** Number of dispatch attempts (default 3). */
  maxAttempts: number;
  /** Threshold above which a `billing_dispute` becomes Diamond. */
  highValueDisputeCad: number;
  /** Lifetime value above which any subscriber is treated as Diamond. */
  diamondLtvCad: number;
  /** Sentiment ≤ this counts as "very negative". */
  churnSentimentThreshold: number;
  /** Below this AI confidence we always escalate to a human (Standard). */
  lowConfidenceThreshold: number;
}

/**
 * Build an {@link EscalationConfig} from environment variables.
 *
 * Required env: `HCZ_ENDPOINT`, `HCZ_HMAC_SECRET`.
 * All others have sensible defaults so the matrix can be tuned without code.
 */
export function loadEscalationConfig(
  env: NodeJS.ProcessEnv = process.env,
): EscalationConfig {
  const hczEndpoint = env.HCZ_ENDPOINT;
  const hczHmacSecret = env.HCZ_HMAC_SECRET;
  if (!hczEndpoint || !hczHmacSecret) {
    throw new Error(
      'EscalationService: HCZ_ENDPOINT and HCZ_HMAC_SECRET must be set',
    );
  }
  if (!/^https:\/\//i.test(hczEndpoint)) {
    throw new Error('EscalationService: HCZ_ENDPOINT must use https://');
  }
  return {
    hczEndpoint,
    hczHmacSecret,
    timeoutMs: parseIntEnv(env.HCZ_TIMEOUT_MS, 10_000),
    maxAttempts: parseIntEnv(env.HCZ_MAX_ATTEMPTS, 3),
    highValueDisputeCad: parseIntEnv(env.ESC_HIGH_VALUE_DISPUTE_CAD, 250),
    diamondLtvCad: parseIntEnv(env.ESC_DIAMOND_LTV_CAD, 2_000),
    churnSentimentThreshold: parseFloatEnv(env.ESC_CHURN_SENTIMENT, -0.6),
    lowConfidenceThreshold: parseFloatEnv(env.ESC_LOW_CONFIDENCE, 0.5),
  };
}

function parseIntEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseFloatEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * EscalationService — pure decision + signed dispatch to HumanContactZone.
 *
 * The service is intentionally framework-agnostic: callers (Express routes,
 * webhook handlers, queue workers) construct it with their own logger,
 * audit logger, subscriber provider, and (optionally) a `fetch` impl.
 *
 * @example
 *   const service = new EscalationService({
 *     config: loadEscalationConfig(),
 *     logger,
 *     audit: auditService,
 *     subscribers: rrrSubscriberProvider,
 *   });
 *   const result = await service.handleEvent(req);
 */
export class EscalationService {
  private readonly config: EscalationConfig;
  private readonly logger: Logger;
  private readonly audit: AuditLogger;
  private readonly subscribers: SubscriberProvider;
  private readonly httpFetch: typeof fetch;

  constructor(deps: {
    config: EscalationConfig;
    logger: Logger;
    audit: AuditLogger;
    subscribers: SubscriberProvider;
    /** Override for tests; defaults to global `fetch`. */
    fetchImpl?: typeof fetch;
  }) {
    this.config = deps.config;
    this.logger = deps.logger;
    this.audit = deps.audit;
    this.subscribers = deps.subscribers;
    this.httpFetch = deps.fetchImpl ?? fetch;
  }

  /**
   * Full pipeline: fetch context → decide → package → dispatch → audit.
   */
  async handleEvent(req: EscalationRequest): Promise<EscalationResult> {
    const correlationId = req.correlationId ?? randomUUID();

    const subscriber = await this.subscribers.fetch(req.subscriberId);
    const decision = this.decide(req.triage, subscriber);
    const envelope = this.buildEnvelope({
      req,
      subscriber,
      decision,
      correlationId,
    });

    const dispatch = await this.dispatch(envelope);

    // Audit, regardless of dispatch outcome. Body content is NOT logged here.
    await this.audit.log({
      tenantId: req.tenantId,
      channel: 'escalation',
      direction: 'outbound',
      status:
        dispatch.status === 'sent'
          ? 'sent'
          : dispatch.status === 'queued_for_retry'
            ? 'queued_for_retry'
            : 'failed',
      recipient: decision.tier,
      metadata: {
        correlationId,
        source: req.source,
        tier: decision.tier,
        priority: decision.priority,
        reasonCode: decision.reasonCode,
        matchedRule: decision.matchedRule,
        intent: req.triage.intent,
        intentConfidence: req.triage.intentConfidence,
        // Body intentionally omitted; only structural metadata.
      },
    });

    this.logger.info('escalation.handled', {
      correlationId,
      tenantId: req.tenantId,
      source: req.source,
      tier: decision.tier,
      priority: decision.priority,
      reasonCode: decision.reasonCode,
      dispatchStatus: dispatch.status,
    });

    return { correlationId, decision, dispatch };
  }

  /**
   * Apply the escalation decision matrix.
   * First matching rule wins (top-to-bottom). Pure function; safe to unit-test.
   */
  decide(
    triage: TriageSignal,
    subscriber: SubscriberContext,
  ): EscalationDecision {
    const cfg = this.config;
    const flags = new Set(triage.riskFlags ?? []);
    const isModFlagged =
      triage.intent === 'moderation_flag' ||
      flags.has('csam') ||
      flags.has('threats') ||
      flags.has('self_harm') ||
      flags.has('illegal');

    // Rule 1 — moderation/safety
    if (isModFlagged) {
      return {
        tier: 'moderation_agent',
        priority: 'P0',
        reasonCode: 'MOD_FLAG',
        matchedRule: 1,
      };
    }

    // Rule 2 — compliance
    if (
      triage.intent === 'casl_complaint' ||
      triage.intent === 'data_export_request' ||
      triage.intent === 'unsubscribe_abuse'
    ) {
      return {
        tier: 'moderation_agent',
        priority: 'P1',
        reasonCode: 'COMPLIANCE',
        matchedRule: 2,
      };
    }

    // Rule 3 — Diamond by tier or LTV
    if (
      subscriber.tier === 'diamond' ||
      subscriber.lifetimeValueCad >= cfg.diamondLtvCad
    ) {
      return {
        tier: 'diamond_concierge',
        priority: 'P1',
        reasonCode: 'DIAMOND_TIER',
        matchedRule: 3,
      };
    }

    // Rule 4 — Gold + very negative sentiment (churn risk)
    if (
      subscriber.tier === 'gold' &&
      triage.sentiment <= cfg.churnSentimentThreshold
    ) {
      return {
        tier: 'diamond_concierge',
        priority: 'P2',
        reasonCode: 'CHURN_RISK',
        matchedRule: 4,
      };
    }

    // Rule 5 — high-value billing dispute
    if (
      triage.intent === 'billing_dispute' &&
      (triage.amountCad ?? 0) >= cfg.highValueDisputeCad
    ) {
      return {
        tier: 'diamond_concierge',
        priority: 'P2',
        reasonCode: 'HIGH_VALUE_DISPUTE',
        matchedRule: 5,
      };
    }

    // Rule 6 — account recovery
    if (triage.intent === 'account_recovery') {
      return {
        tier: 'standard_cs',
        priority: 'P2',
        reasonCode: 'ACCOUNT_RECOVERY',
        matchedRule: 6,
      };
    }

    // Rule 7 — default human queue intents
    const defaultHumanIntents: Intent[] = [
      'general_inquiry',
      'delivery',
      'product_question',
      'password_reset',
      'billing_dispute', // low-value dispute
    ];
    if (defaultHumanIntents.includes(triage.intent)) {
      return {
        tier: 'standard_cs',
        priority: 'P3',
        reasonCode: 'DEFAULT_HUMAN',
        matchedRule: 7,
      };
    }

    // Rule 8 — low AI confidence fallback
    if (triage.intentConfidence < cfg.lowConfidenceThreshold) {
      return {
        tier: 'standard_cs',
        priority: 'P3',
        reasonCode: 'LOW_AI_CONFIDENCE',
        matchedRule: 8,
      };
    }

    // Catch-all (treat as default human queue rather than dropping).
    return {
      tier: 'standard_cs',
      priority: 'P3',
      reasonCode: 'DEFAULT_HUMAN',
      matchedRule: 7,
    };
  }

  /**
   * Build the HCZ context envelope. Pure function.
   */
  buildEnvelope(input: {
    req: EscalationRequest;
    subscriber: SubscriberContext;
    decision: EscalationDecision;
    correlationId: string;
  }): HczEnvelope {
    const { req, subscriber, decision, correlationId } = input;
    return {
      schemaVersion: '1.0',
      correlationId,
      tenantId: req.tenantId,
      source: req.source,
      tier: decision.tier,
      priority: decision.priority,
      reasonCode: decision.reasonCode,
      matchedRule: decision.matchedRule,
      subscriber,
      issue: {
        intent: req.triage.intent,
        intentConfidence: req.triage.intentConfidence,
        sentiment: req.triage.sentiment,
        riskFlags: req.triage.riskFlags ?? [],
        summary: req.triage.summary,
        lastMessages: (req.triage.lastMessages ?? []).slice(-5),
      },
      links: req.links ?? {},
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * POST the envelope to HumanContactZone, signed with HMAC-SHA256.
   * Retries 5xx / network errors with exponential back-off up to
   * `config.maxAttempts`.
   */
  async dispatch(envelope: HczEnvelope): Promise<EscalationResult['dispatch']> {
    const url = `${this.config.hczEndpoint.replace(/\/$/, '')}/v1/tickets`;
    const body = JSON.stringify(envelope);
    const signature = this.sign(body);

    let lastError = '';
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs,
      );
      try {
        const res = await this.httpFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OQMI-Signature': signature,
            'X-OQMI-Correlation-Id': envelope.correlationId,
            'X-OQMI-Schema-Version': envelope.schemaVersion,
          },
          body,
          signal: controller.signal,
        });

        if (res.status >= 200 && res.status < 300) {
          return { status: 'sent', httpStatus: res.status };
        }

        if (res.status >= 400 && res.status < 500) {
          // Permanent failure — do not retry; do not leak body.
          lastError = `HCZ rejected with ${res.status}`;
          this.logger.error('escalation.dispatch.client_error', {
            correlationId: envelope.correlationId,
            httpStatus: res.status,
          });
          return { status: 'failed', lastError };
        }

        lastError = `HCZ ${res.status}`;
        this.logger.warn('escalation.dispatch.retryable', {
          correlationId: envelope.correlationId,
          httpStatus: res.status,
          attempt,
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        this.logger.warn('escalation.dispatch.network_error', {
          correlationId: envelope.correlationId,
          error: lastError,
          attempt,
        });
      } finally {
        clearTimeout(timer);
      }

      if (attempt < this.config.maxAttempts) {
        await sleep(backoffMs(attempt));
      }
    }

    // Exhausted retries — caller (or worker) should drain from outbox.
    this.logger.error('escalation.dispatch.queued_for_retry', {
      correlationId: envelope.correlationId,
      lastError,
    });
    return { status: 'queued_for_retry', lastError };
  }

  /** HMAC-SHA256(body) using the configured shared secret. */
  private sign(body: string): string {
    const mac = createHmac('sha256', this.config.hczHmacSecret)
      .update(body)
      .digest('hex');
    return `sha256=${mac}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function backoffMs(attempt: number): number {
  // 250ms, 500ms, 1000ms, ...  capped at 4s.
  return Math.min(4_000, 250 * 2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
