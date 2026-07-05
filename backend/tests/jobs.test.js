/**
 * Integration tests for Job endpoints
 * Tests: all 5 job types, runAt computation, pagination, filtering
 */

process.env.DATABASE_URL = 'file:./test.db';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PORT = '3099';
process.env.CORS_ORIGIN = 'http://localhost:5173';

const request = require('supertest');
const { PrismaClient } = require('@prisma/client');
const app = require('../src/app');

const prisma = new PrismaClient();

let token, projectId, queueId;

beforeAll(async () => {
  // Register a user and create a project + queue
  const regRes = await request(app).post('/api/auth/register').send({
    name: 'Job Test User',
    email: `jobs_${Date.now()}@example.com`,
    password: 'password123',
  });
  token = regRes.body.token;

  const projRes = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Job Test Project' });
  projectId = projRes.body.project.id;

  const queueRes = await request(app)
    .post('/api/queues')
    .set('Authorization', `Bearer ${token}`)
    .send({
      projectId,
      name: 'Test Queue',
      retryPolicyType: 'exponential',
      retryBaseDelaySeconds: 10,
      maxRetries: 3,
      concurrency: 2,
    });
  queueId = queueRes.body.queue.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Job creation — all 5 types', () => {
  it('creates an IMMEDIATE job with runAt = now', async () => {
    const before = new Date();
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ queueId, type: 'immediate', payload: { action: 'send_email' } });

    expect(res.status).toBe(201);
    expect(res.body.job.status).toBe('queued');
    const runAt = new Date(res.body.job.runAt);
    // runAt should be very close to now
    expect(runAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(runAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('creates a DELAYED job with runAt = now + delaySeconds', async () => {
    const delay = 60; // 60 seconds
    const before = new Date();
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ queueId, type: 'delayed', delaySeconds: delay, payload: { action: 'process_video' } });

    expect(res.status).toBe(201);
    expect(res.body.job.status).toBe('scheduled');
    const runAt = new Date(res.body.job.runAt);
    const expectedRunAt = before.getTime() + delay * 1000;
    // Allow 2 seconds tolerance
    expect(runAt.getTime()).toBeGreaterThanOrEqual(expectedRunAt - 2000);
    expect(runAt.getTime()).toBeLessThanOrEqual(expectedRunAt + 2000);
  });

  it('creates a SCHEDULED job with explicit runAt', async () => {
    const scheduledTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ queueId, type: 'scheduled', runAt: scheduledTime, payload: { action: 'generate_report' } });

    expect(res.status).toBe(201);
    expect(res.body.job.status).toBe('scheduled');
    const runAt = new Date(res.body.job.runAt);
    expect(runAt.toISOString().slice(0, 16)).toBe(scheduledTime.slice(0, 16)); // Match to minute
  });

  it('creates a RECURRING job with a cron expression', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        queueId,
        type: 'recurring',
        cronExpression: '*/5 * * * *', // Every 5 minutes
        payload: { action: 'health_check' },
      });

    expect(res.status).toBe(201);
    expect(res.body.job.cronExpression).toBe('*/5 * * * *');
    // runAt should be in the future
    const runAt = new Date(res.body.job.runAt);
    expect(runAt.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('creates a BATCH of jobs sharing a batchId', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        queueId,
        type: 'batch',
        jobs: [
          { payload: { item: 'A' } },
          { payload: { item: 'B' } },
          { payload: { item: 'C' } },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(3);
    expect(res.body.batchId).toBeDefined();
    // All jobs should share the same batchId
    const batchIds = new Set(res.body.jobs.map((j) => j.batchId));
    expect(batchIds.size).toBe(1);
  });

  it('rejects a recurring job without cronExpression', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ queueId, type: 'recurring', payload: {} });
    expect(res.status).toBe(400);
  });

  it('rejects a scheduled job without runAt', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ queueId, type: 'scheduled', payload: {} });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/jobs — pagination and filtering', () => {
  it('returns paginated results', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .query({ queueId, page: 1, limit: 2 });

    expect(res.status).toBe(200);
    expect(res.body.jobs.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 2 });
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('filters by status', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .query({ queueId, status: 'scheduled' });

    expect(res.status).toBe(200);
    res.body.jobs.forEach((j) => expect(j.status).toBe('scheduled'));
  });

  it('filters by type', async () => {
    const res = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .query({ queueId, type: 'recurring' });

    expect(res.status).toBe(200);
    res.body.jobs.forEach((j) => expect(j.type).toBe('recurring'));
  });
});

describe('PATCH /api/jobs/:id/retry', () => {
  it('can manually retry a failed job', async () => {
    // Create a job and manually set it to failed
    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ queueId, type: 'immediate', payload: { test: true } });
    const jobId = createRes.body.job.id;

    // Directly update to failed status
    await prisma.job.update({ where: { id: jobId }, data: { status: 'failed' } });

    const retryRes = await request(app)
      .patch(`/api/jobs/${jobId}/retry`)
      .set('Authorization', `Bearer ${token}`);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.job.status).toBe('queued');
  });

  it('rejects retry on a running job', async () => {
    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ queueId, type: 'immediate', payload: {} });
    const jobId = createRes.body.job.id;
    // Job is currently "queued", not "failed" or "dead_letter"
    const retryRes = await request(app)
      .patch(`/api/jobs/${jobId}/retry`)
      .set('Authorization', `Bearer ${token}`);
    expect(retryRes.status).toBe(400);
  });
});
