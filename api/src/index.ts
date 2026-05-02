import 'dotenv/config';
import app from './app';
import logger from './services/logger';

const PORT = parseInt(process.env.PORT ?? '4000', 10);

const server = app.listen(PORT, () => {
  logger.info(`eCommsZone API Gateway listening on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export default server;
