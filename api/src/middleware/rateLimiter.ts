import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../services/redis';

export const rateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const tenantId = req.tenant?.tenantId ?? 'anonymous';
    const channel = req.path.split('/')[1] ?? 'default';
    return `rate:${tenantId}:${channel}`;
  },
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please retry after the indicated time.',
      },
    });
  },
});
