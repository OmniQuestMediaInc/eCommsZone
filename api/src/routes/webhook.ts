import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { auditService } from '../services/audit';
import { listmonkService } from '../services/listmonk';
import logger from '../services/logger';

const router = Router();

function verifyBrevoSignature(req: Request): boolean {
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('BREVO_WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }
  const signature = req.headers['x-brevo-signature'] as string | undefined;
  if (!signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

router.post('/brevo', async (req: Request, res: Response) => {
  if (!verifyBrevoSignature(req)) {
    logger.warn('Invalid Brevo webhook signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const events: unknown[] = Array.isArray(req.body) ? req.body : [req.body];

  for (const event of events) {
    const evt = event as Record<string, unknown>;
    const eventType = evt['event'] as string | undefined;
    const email = evt['email'] as string | undefined;

    logger.info('Brevo webhook event received', { eventType, email });

    try {
      switch (eventType) {
        case 'hard_bounce':
        case 'soft_bounce':
          if (email) {
            await listmonkService.blocklistSubscriber(email);
            await auditService.log({
              tenantId: 'system',
              channel: 'email',
              direction: 'inbound_webhook',
              status: eventType,
              recipient: email,
              metadata: { raw: evt },
            });
          }
          break;

        case 'unsubscribe':
          if (email) {
            await listmonkService.unsubscribe(email);
            await auditService.log({
              tenantId: 'system',
              channel: 'email',
              direction: 'inbound_webhook',
              status: 'unsubscribed',
              recipient: email,
              metadata: { raw: evt },
            });
          }
          break;

        case 'delivered':
          await auditService.log({
            tenantId: 'system',
            channel: 'email',
            direction: 'inbound_webhook',
            status: 'delivered',
            recipient: email,
            metadata: { raw: evt },
          });
          break;

        default:
          logger.debug('Unhandled Brevo event type', { eventType });
      }
    } catch (err) {
      logger.error('Error processing Brevo webhook event', { err, evt });
    }
  }

  res.status(200).json({ received: true });
});

export default router;
