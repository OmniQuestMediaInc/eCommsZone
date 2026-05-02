import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const formatted = (result.error as ZodError).flatten();
      next(
        new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', formatted),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
