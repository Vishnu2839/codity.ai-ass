const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with realistic test data...');

  // 1. Get or Create a User
  let user = await prisma.user.findFirst({
    where: { email: 'test@example.com' }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: await bcrypt.hash('password123', 10)
      }
    });
  }

  // 2. Create Organizations (if none)
  let org = await prisma.organization.findFirst();
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'Acme Corp' }
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { organizationId: org.id }
    });
  }

  // 3. Create Projects
  const projectsData = [
    { name: 'Data Pipeline', description: 'ETL and data processing jobs' },
    { name: 'Email Marketing', description: 'Batch email dispatching' },
    { name: 'Video Processing', description: 'Encoding and transcoding queues' },
    { name: 'Report Generation', description: 'Daily and monthly PDF reports' },
    { name: 'E-commerce Async Tasks', description: 'Order processing and webhooks' }
  ];

  const projects = [];
  for (const p of projectsData) {
    const project = await prisma.project.create({
      data: {
        name: p.name,
        description: p.description,
        userId: user.id,
        organizationId: org.id
      }
    });
    projects.push(project);
  }
  console.log(`Created ${projects.length} projects`);

  // 4. Create Queues for each project
  const queues = [];
  for (const project of projects) {
    for (let i = 1; i <= 3; i++) {
      const queue = await prisma.queue.create({
        data: {
          name: `${project.name} - Queue ${i}`,
          projectId: project.id,
          priority: Math.floor(Math.random() * 10),
          concurrency: Math.floor(Math.random() * 5) + 1,
          retryPolicyType: ['fixed', 'exponential', 'linear'][Math.floor(Math.random() * 3)],
          maxRetries: 3
        }
      });
      queues.push(queue);
    }
  }
  console.log(`Created ${queues.length} queues`);

  // 5. Create Jobs and Executions
  // We want to generate ~500 jobs with realistic timestamps over the last 7 days
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  let jobCount = 0;

  for (let i = 0; i < 500; i++) {
    const queue = queues[Math.floor(Math.random() * queues.length)];
    const isFailed = Math.random() < 0.1; // 10% failure rate
    const isRunning = Math.random() < 0.05; // 5% currently running
    const isDeadLetter = Math.random() < 0.05; // 5% dead letter
    const isQueued = Math.random() < 0.1; // 10% queued
    
    let status = 'completed';
    if (isDeadLetter) status = 'dead_letter';
    else if (isFailed) status = 'failed';
    else if (isRunning) status = 'running';
    else if (isQueued) status = 'queued';

    const type = ['immediate', 'delayed', 'scheduled', 'recurring', 'batch'][Math.floor(Math.random() * 5)];
    
    // Spread createdAt over the last 7 days
    const createdAtMs = now - (Math.random() * 7 * ONE_DAY);
    const createdAt = new Date(createdAtMs);
    
    let runAtMs = createdAtMs;
    if (type === 'delayed' || type === 'scheduled') {
      runAtMs += Math.random() * ONE_DAY;
    }
    const runAt = new Date(runAtMs);

    const job = await prisma.job.create({
      data: {
        type,
        status,
        payload: JSON.stringify({ taskData: `Auto generated task ${i}` }),
        runAt,
        createdAt,
        queueId: queue.id,
        retryCount: status === 'dead_letter' ? queue.maxRetries : (status === 'failed' ? Math.floor(Math.random() * queue.maxRetries) : 0),
        maxRetries: queue.maxRetries,
      }
    });

    // Create execution history for realism
    const executions = [];
    executions.push({
      jobId: job.id,
      fromStatus: 'scheduled',
      toStatus: 'queued',
      message: 'Job enqueued',
      createdAt: createdAt
    });

    if (status !== 'queued') {
      const claimedAt = new Date(createdAtMs + 1000 + Math.random() * 5000); // Claimed shortly after
      executions.push({
        jobId: job.id,
        fromStatus: 'queued',
        toStatus: 'claimed',
        message: 'Job claimed by worker',
        createdAt: claimedAt
      });
      executions.push({
        jobId: job.id,
        fromStatus: 'claimed',
        toStatus: 'running',
        message: 'Job started executing',
        createdAt: new Date(claimedAt.getTime() + 100)
      });

      if (status === 'completed') {
        executions.push({
          jobId: job.id,
          fromStatus: 'running',
          toStatus: 'completed',
          message: 'Job completed successfully',
          createdAt: new Date(claimedAt.getTime() + 5000 + Math.random() * 60000) // Takes a bit to run
        });
      } else if (status === 'failed') {
        executions.push({
          jobId: job.id,
          fromStatus: 'running',
          toStatus: 'failed',
          message: 'Error: Simulated deterministic failure',
          createdAt: new Date(claimedAt.getTime() + 2000 + Math.random() * 10000)
        });
      } else if (status === 'dead_letter') {
        // Simulate a few retries
        executions.push({
          jobId: job.id,
          fromStatus: 'running',
          toStatus: 'failed',
          message: 'Error: Failed on attempt 1',
          createdAt: new Date(claimedAt.getTime() + 1000)
        });
        executions.push({
          jobId: job.id,
          fromStatus: 'failed',
          toStatus: 'dead_letter',
          message: 'Max retries exhausted',
          createdAt: new Date(claimedAt.getTime() + 2000)
        });
      }
    }

    for (const exec of executions) {
      await prisma.execution.create({ data: exec });
    }

    jobCount++;
    if (jobCount % 100 === 0) {
      console.log(`Created ${jobCount} jobs...`);
    }
  }

  console.log('Seeding complete! Refresh your dashboard.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
