import request from 'supertest';
import app from '../app';

// Mock external dependencies to avoid real connections in unit tests
jest.mock('../services/db', () => ({
  db: { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) },
}));

jest.mock('../services/redis', () => ({
  redisClient: {
    ping: jest.fn().mockResolvedValue('PONG'),
    call: jest.fn(),
  },
}));

jest.mock('axios');

describe('GET /health', () => {
  it('returns a JSON status object', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBeLessThan(600);
    expect(res.body).toHaveProperty('uptime');
  });
});

describe('POST /email/transactional (unauthenticated)', () => {
  it('returns 401 when X-Tenant-Key is missing', async () => {
    const res = await request(app)
      .post('/email/transactional')
      .send({ to: 'test@example.com', subject: 'Hi', html: '<p>Hi</p>' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /sms/send (unauthenticated)', () => {
  it('returns 401 when X-Tenant-Key is missing', async () => {
    const res = await request(app)
      .post('/sms/send')
      .send({ to: '+15551234567', message: 'Hello' });
    expect(res.status).toBe(401);
  });
});
