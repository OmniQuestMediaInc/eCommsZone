import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../services/db';
import logger from '../services/logger';
import { AppError } from './errorHandler';

export interface TenantContext {
  tenantId: string;
  displayName: string;
  config: Record<string, unknown>;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const rawKey = req.headers['x-tenant-key'];

  if (!rawKey || typeof rawKey !== 'string') {
    return next(new AppError(401, 'UNAUTHORIZED', 'Missing X-Tenant-Key header'));
  }

  const keyHash = crypto.createHmac('sha256', process.env.JWT_SECRET ?? 'secret')
    .update(rawKey)
    .digest('hex');

  try {
    const result = await db.query(
      `SELECT slug, display_name, config
         FROM tenants
        WHERE api_key_hash = $1
          AND is_active = TRUE
        LIMIT 1`,
      [keyHash],
    );

    if (result.rowCount === 0) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Invalid tenant API key'));
    }

    const row = result.rows[0];
    req.tenant = {
      tenantId: row.slug as string,
      displayName: row.display_name as string,
      config: row.config as Record<string, unknown>,
    };

    next();
  } catch (err) {
    logger.error('Auth middleware DB error', { err });
    next(new AppError(500, 'INTERNAL_ERROR', 'Authentication service unavailable'));
  }
}
