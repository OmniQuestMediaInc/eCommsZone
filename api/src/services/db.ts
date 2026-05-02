import { Pool } from 'pg';
import logger from './logger';

export const db = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  database: process.env.POSTGRES_DB ?? 'ecommszone',
  user: process.env.POSTGRES_USER ?? 'ecommszone',
  password: process.env.POSTGRES_PASSWORD ?? '',
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

db.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { err });
});
