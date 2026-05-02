import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { brevoService } from '../services/brevo';
import { auditService } from '../services/audit';
import logger from '../services/logger';

const router = Router();

const sendSmsSchema = z.object({
  to: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Must be E.164 format e.g. +15551234567'),
  message: z.string().min(1).max(1600),
  sender: z.string().optional(),
  type: z.enum(['transactional', 'marketing']).default('transactional'),
});

router.post(
  '/send',
  validate(sendSmsSchema),
  async (req: Request, res: Response, next) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const result = await brevoService.sendSms(req.body, tenantId);
      await auditService.log({
        tenantId,
        channel: 'sms',
        direction: 'outbound',
        status: 'sent',
        providerMessageId: result.messageId,
        recipient: req.body.to,
      });
      res.status(202).json(result);
    } catch (err) {
      logger.error('SMS send error', { err });
      next(err);
    }
  },
);

export default router;
