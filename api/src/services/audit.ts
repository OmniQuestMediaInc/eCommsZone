import { db } from './db';
import logger from './logger';

export interface AuditEntry {
  tenantId: string;
  channel: 'email' | 'sms' | 'campaign';
  direction: 'outbound' | 'inbound_webhook';
  status: string;
  providerMessageId?: string;
  recipient?: string;
  metadata?: Record<string, unknown>;
}

class AuditService {
  async log(entry: AuditEntry): Promise<void> {
    try {
      await db.query(
        `INSERT INTO audit_log
           (tenant_id, channel, direction, status, provider_message_id, recipient, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.tenantId,
          entry.channel,
          entry.direction,
          entry.status,
          entry.providerMessageId ?? null,
          entry.recipient ?? null,
          JSON.stringify(entry.metadata ?? {}),
        ],
      );
    } catch (err) {
      logger.error('Failed to write audit log entry', { err, entry });
    }
  }
}

export const auditService = new AuditService();
