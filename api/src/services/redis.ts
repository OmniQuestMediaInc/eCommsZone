import Redis from 'ioredis';
import logger from './logger';

export const redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => Math.min(times * 100, 3000),
});

redisClient.on('error', (err) => {
  logger.error('Redis client error', { err });
});

redisClient.on('connect', () => {
  logger.info('Redis connected');
});
