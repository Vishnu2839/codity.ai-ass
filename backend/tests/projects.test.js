/**
 * Integration tests for Project endpoints
 * Tests: CRUD operations and ownership isolation between users
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

let userAToken, userBToken, projectAId;

beforeAll(async () => {
  // Create two users
  const resA = await request(app).post('/api/auth/register').send({
    name: 'User A',
    email: `usera_${Date.now()}@example.com`,
    password: 'password123',
  });
  userAToken = resA.body.token;

  const resB = await request(app).post('/api/auth/register').send({
    name: 'User B',
    email: `userb_${Date.now()}@example.com`,
    password: 'password123',
  });
  userBToken = resB.body.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/projects', () => {
  it('creates a project for authenticated user', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'Project Alpha', description: 'Test project' });

    expect(res.status).toBe(201);
    expect(res.body.project).toMatchObject({ name: 'Project Alpha' });
    projectAId = res.body.project.id;
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ description: 'No name' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Unauthorized' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/projects — ownership isolation', () => {
  it("User A can see their own projects", async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.projects.some((p) => p.id === projectAId)).toBe(true);
  });

  it("User B CANNOT see User A's projects", async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${userBToken}`);
    expect(res.status).toBe(200);
    // User B's list must not include User A's project
    expect(res.body.projects.some((p) => p.id === projectAId)).toBe(false);
  });

  it("User B CANNOT access User A's project by ID", async () => {
    const res = await request(app)
      .get(`/api/projects/${projectAId}`)
      .set('Authorization', `Bearer ${userBToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/projects/:id', () => {
  it('updates the project name', async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectAId}`)
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ name: 'Project Alpha Updated' });
    expect(res.status).toBe(200);
    expect(res.body.project.name).toBe('Project Alpha Updated');
  });

  it("User B cannot update User A's project", async () => {
    const res = await request(app)
      .patch(`/api/projects/${projectAId}`)
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/projects/:id', () => {
  it("User B cannot delete User A's project", async () => {
    const res = await request(app)
      .delete(`/api/projects/${projectAId}`)
      .set('Authorization', `Bearer ${userBToken}`);
    expect(res.status).toBe(404);
  });

  it('User A can delete their project', async () => {
    const res = await request(app)
      .delete(`/api/projects/${projectAId}`)
      .set('Authorization', `Bearer ${userAToken}`);
    expect(res.status).toBe(200);
  });
});
