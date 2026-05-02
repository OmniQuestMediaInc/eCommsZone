import axios, { AxiosInstance } from 'axios';
import logger from './logger';
import { AppError } from '../middleware/errorHandler';

interface TransactionalEmailPayload {
  to: string;
  toName?: string;
  subject?: string;
  html?: string;
  text?: string;
  replyTo?: string;
  templateId?: number;
  templateParams?: Record<string, unknown>;
  attachments?: Array<{ name: string; content: string }>;
}

interface SmsPayload {
  to: string;
  message: string;
  sender?: string;
  type?: 'transactional' | 'marketing';
}

interface SendResult {
  messageId: string;
  auditId?: string;
}

class BrevoService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.brevo.com/v3',
      headers: {
        'api-key': process.env.BREVO_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  async sendTransactionalEmail(
    payload: TransactionalEmailPayload,
    tenantId: string,
  ): Promise<SendResult> {
    const body: Record<string, unknown> = {
      to: [{ email: payload.to, name: payload.toName }],
      replyTo: payload.replyTo ? { email: payload.replyTo } : undefined,
      tags: [tenantId],
    };

    if (payload.templateId) {
      body['templateId'] = payload.templateId;
      body['params'] = payload.templateParams ?? {};
    } else {
      body['subject'] = payload.subject;
      body['htmlContent'] = payload.html;
      body['textContent'] = payload.text;
    }

    if (payload.attachments?.length) {
      body['attachment'] = payload.attachments.map((a) => ({
        name: a.name,
        content: a.content,
      }));
    }

    try {
      const res = await this.client.post('/smtp/email', body);
      const messageId = (res.data as { messageId?: string }).messageId ?? '';
      logger.info('Brevo transactional email sent', { messageId, tenantId });
      return { messageId };
    } catch (err) {
      logger.error('Brevo transactional email error', { err });
      throw new AppError(502, 'UPSTREAM_ERROR', 'Failed to send email via Brevo');
    }
  }

  async sendSms(payload: SmsPayload, tenantId: string): Promise<SendResult> {
    const body = {
      sender: payload.sender ?? process.env.BREVO_SMS_SENDER ?? 'OmniQuest',
      recipient: payload.to,
      content: payload.message,
      type: payload.type ?? 'transactional',
      tag: tenantId,
    };

    try {
      const res = await this.client.post('/transactionalSMS/sms', body);
      const messageId = String((res.data as { reference?: string }).reference ?? '');
      logger.info('Brevo SMS sent', { messageId, tenantId });
      return { messageId };
    } catch (err) {
      logger.error('Brevo SMS error', { err });
      throw new AppError(502, 'UPSTREAM_ERROR', 'Failed to send SMS via Brevo');
    }
  }
}

export const brevoService = new BrevoService();
