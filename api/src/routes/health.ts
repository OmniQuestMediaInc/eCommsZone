import { Router, Request, Response } from 'express';
import { db } from '../services/db';
import { redisClient } from '../services/redis';
import axios from 'axios';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const [pgOk, redisOk, listmonkOk] = await Promise.allSettled([
    db.query('SELECT 1'),
    redisClient.ping(),
    axios.get(`${process.env.LISTMONK_BASE_URL ?? 'http://listmonk:9000'}/api/health`, {
      timeout: 3000,
    }),
  ]);

  const status = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    postgres: pgOk.status === 'fulfilled' ? 'reachable' : 'unreachable',
    redis: redisOk.status === 'fulfilled' ? 'reachable' : 'unreachable',
    listmonk: listmonkOk.status === 'fulfilled' ? 'reachable' : 'unreachable',
  };

  const allOk = status.postgres === 'reachable'
    && status.redis === 'reachable'
    && status.listmonk === 'reachable';

  res.status(allOk ? 200 : 503).json(status);
});

export default router;
