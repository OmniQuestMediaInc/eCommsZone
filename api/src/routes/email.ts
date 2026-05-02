import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { brevoService } from '../services/brevo';
import { listmonkService } from '../services/listmonk';
import { auditService } from '../services/audit';
import logger from '../services/logger';

const router = Router();

// ── Schema definitions ────────────────────────────────────────────────────────

const transactionalEmailSchema = z.object({
  to: z.string().email(),
  toName: z.string().optional(),
  subject: z.string().min(1).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  replyTo: z.string().email().optional(),
  templateId: z.number().int().positive().optional(),
  templateParams: z.record(z.unknown()).optional(),
  attachments: z
    .array(z.object({ name: z.string(), content: z.string() }))
    .optional(),
}).refine(
  (d) => d.templateId !== undefined || (d.subject && (d.html || d.text)),
  { message: 'Either templateId or subject + html/text is required' },
);

const campaignTriggerSchema = z.object({
  campaignId: z.number().int().positive(),
  sendAt: z.string().datetime().optional(),
});

const subscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  listIds: z.array(z.number().int().positive()),
  attributes: z.record(z.unknown()).optional(),
});

const unsubscribeSchema = z.object({
  email: z.string().email(),
  listIds: z.array(z.number().int().positive()).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.post(
  '/transactional',
  validate(transactionalEmailSchema),
  async (req: Request, res: Response, next) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const result = await brevoService.sendTransactionalEmail(req.body, tenantId);
      await auditService.log({
        tenantId,
        channel: 'email',
        direction: 'outbound',
        status: 'sent',
        providerMessageId: result.messageId,
        recipient: req.body.to,
      });
      res.status(202).json(result);
    } catch (err) {
      logger.error('Transactional email error', { err });
      next(err);
    }
  },
);

router.post(
  '/campaign',
  validate(campaignTriggerSchema),
  async (req: Request, res: Response, next) => {
    try {
      const tenantId = req.tenant!.tenantId;
      const result = await listmonkService.triggerCampaign(req.body.campaignId, req.body.sendAt);
      await auditService.log({
        tenantId,
        channel: 'campaign',
        direction: 'outbound',
        status: 'scheduled',
        metadata: { campaignId: req.body.campaignId },
      });
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/subscribe',
  validate(subscribeSchema),
  async (req: Request, res: Response, next) => {
    try {
      const result = await listmonkService.subscribe(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/unsubscribe',
  validate(unsubscribeSchema),
  async (req: Request, res: Response, next) => {
    try {
      await listmonkService.unsubscribe(req.body.email, req.body.listIds);
      res.status(200).json({ unsubscribed: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
