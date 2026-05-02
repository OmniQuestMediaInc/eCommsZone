import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

import emailRouter from './routes/email';
import smsRouter from './routes/sms';
import webhookRouter from './routes/webhook';
import healthRouter from './routes/health';

const app = express();

// ── Security & parsing ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined'));

// ── Global rate limiter for public/unauthenticated routes ─────────────────────
const publicRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

// ── Public routes (no tenant auth required) ───────────────────────────────────
app.use('/health', publicRateLimiter, healthRouter);
app.use('/webhook', publicRateLimiter, webhookRouter);

// ── Authenticated routes ──────────────────────────────────────────────────────
app.use(authMiddleware);
app.use(rateLimiter);

app.use('/email', emailRouter);
app.use('/sms', smsRouter);

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
