const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const cronParser = require('cron-parser');

const prisma = new PrismaClient();

/**
 * Verifies that a queue belongs to the authenticated user via the project chain.
 * Enforces ownership at the DB level — not just in the frontend.
 */
async function verifyQueueOwnership(queueId, userId) {
  return prisma.queue.findFirst({
    where: { id: queueId, project: { userId } },
  });
}

/**
 * Computes the initial runAt datetime based on job type.
 * Implements Part 4 of the assignment spec (job creation logic).
 */
function computeRunAt(type, body) {
  const now = new Date();

  switch (type) {
    case 'immediate':
      // immediate → runAt = now
      return now;

    case 'delayed': {
      // delayed → runAt = now + delaySeconds
      const delay = Number(body.delaySeconds || 0);
      if (delay < 0) throw new Error('delaySeconds must be >= 0');
      return new Date(now.getTime() + delay * 1000);
    }

    case 'scheduled': {
      // scheduled → runAt provided directly by the client
      if (!body.runAt) throw new Error('runAt is required for scheduled jobs');
      const dt = new Date(body.runAt);
      if (isNaN(dt.getTime())) throw new Error('Invalid runAt datetime');
      return dt;
    }

    case 'recurring': {
      // recurring → compute next run from cronExpression
      if (!body.cronExpression) throw new Error('cronExpression is required for recurring jobs');
      try {
        const interval = cronParser.parseExpression(body.cronExpression);
        return interval.next().toDate();
      } catch {
        throw new Error('Invalid cronExpression');
      }
    }

    case 'batch':
      // batch jobs get immediate runAt; batchId groups them
      return now;

    default:
      throw new Error(`Unknown job type: ${type}`);
  }
}

/**
 * POST /api/jobs
 * Create a job or a batch of jobs.
 * For batch type, client sends { type: "batch", jobs: [...] }
 */
async function createJob(req, res) {
  const { queueId, type } = req.body;

  if (!queueId || !type) {
    return res.status(400).json({ error: 'queueId and type are required' });
  }

  try {
    const queue = await verifyQueueOwnership(queueId, req.userId);
    if (!queue) return res.status(404).json({ error: 'Queue not found' });

    // ── Batch job: create multiple jobs in one transaction ─────────────────
    if (type === 'batch') {
      const { jobs: jobsPayload } = req.body;
      if (!Array.isArray(jobsPayload) || jobsPayload.length === 0) {
        return res.status(400).json({ error: 'jobs array is required for batch type' });
      }

      const batchId = uuidv4();
      const runAt = new Date();
      const initialStatus = 'queued';

      const created = await prisma.$transaction(
        jobsPayload.map((jp) =>
          prisma.job.create({
            data: {
              queueId,
              type: 'batch',
              payload: JSON.stringify(jp.payload || {}),
              status: initialStatus,
              runAt,
              maxRetries: jp.maxRetries !== undefined ? Number(jp.maxRetries) : queue.maxRetries,
              batchId,
            },
          })
        )
      );

      // Log the creation for each job
      await prisma.$transaction(
        created.map((job) =>
          prisma.execution.create({
            data: {
              jobId: job.id,
              fromStatus: 'created',
              toStatus: 'queued',
              message: `Batch job created (batchId: ${batchId})`,
            },
          })
        )
      );

      return res.status(201).json({ batchId, jobs: created, count: created.length });
    }

    // ── Single job ─────────────────────────────────────────────────────────
    let runAt;
    try {
      runAt = computeRunAt(type, req.body);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // Scheduled/delayed jobs start in "scheduled" status; others start "queued"
    const initialStatus = type === 'scheduled' || type === 'delayed' ? 'scheduled' : 'queued';

    const job = await prisma.job.create({
      data: {
        queueId,
        type,
        payload: JSON.stringify(req.body.payload || {}),
        status: initialStatus,
        runAt,
        cronExpression: type === 'recurring' ? req.body.cronExpression : null,
        maxRetries:
          req.body.maxRetries !== undefined ? Number(req.body.maxRetries) : queue.maxRetries,
      },
    });

    // Log the creation transition
    await prisma.execution.create({
      data: {
        jobId: job.id,
        fromStatus: 'created',
        toStatus: initialStatus,
        message: `Job created (type: ${type})`,
      },
    });

    return res.status(201).json({ job });
  } catch (err) {
    console.error('[createJob]', err);
    return res.status(500).json({ error: 'Failed to create job' });
  }
}

/**
 * GET /api/jobs
 * Supports pagination (page, limit) and filtering (status, queueId, type)
 * Only returns jobs from queues the user owns.
 */
async function listJobs(req, res) {
  const { queueId, status, type, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  // Build where clause — always scope to user's queues
  const where = {
    queue: { project: { userId: req.userId } },
  };
  if (queueId) where.queueId = queueId;
  if (status) where.status = status;
  if (type) where.type = type;

  try {
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: { queue: { select: { name: true, priority: true } } },
      }),
      prisma.job.count({ where }),
    ]);

    return res.json({
      jobs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch jobs' });
  }
}

/**
 * GET /api/jobs/:id
 */
async function getJob(req, res) {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, queue: { project: { userId: req.userId } } },
      include: { queue: true, executions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json({ job });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch job' });
  }
}

/**
 * GET /api/jobs/:id/logs
 * Returns execution history for a job
 */
async function getJobLogs(req, res) {
  try {
    // Verify ownership first
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, queue: { project: { userId: req.userId } } },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const logs = await prisma.execution.findMany({
      where: { jobId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
}

/**
 * PATCH /api/jobs/:id/retry
 * Manually re-queues a failed or dead_letter job.
 * Resets status to "queued" and sets runAt to now, keeping retryCount.
 */
async function retryJob(req, res) {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, queue: { project: { userId: req.userId } } },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (!['failed', 'dead_letter'].includes(job.status)) {
      return res.status(400).json({ error: 'Only failed or dead_letter jobs can be retried' });
    }

    const prevStatus = job.status;
    const updated = await prisma.job.update({
      where: { id: job.id },
      data: { status: 'queued', runAt: new Date() },
    });

    await prisma.execution.create({
      data: {
        jobId: job.id,
        fromStatus: prevStatus,
        toStatus: 'queued',
        message: 'Manually re-queued via API',
      },
    });

    return res.json({ job: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retry job' });
  }
}

/**
 * GET /api/jobs/throughput?queueId=...&buckets=12&bucketMinutes=5
 * Returns completed job counts grouped into time buckets for the chart
 */
async function getThroughput(req, res) {
  const { queueId, buckets = '12', bucketMinutes = '5' } = req.query;

  try {
    if (queueId) {
      const queue = await verifyQueueOwnership(queueId, req.userId);
      if (!queue) return res.status(404).json({ error: 'Queue not found' });
    }

    const numBuckets = parseInt(buckets);
    const minsPerBucket = parseInt(bucketMinutes);
    const now = new Date();
    const result = [];

    for (let i = numBuckets - 1; i >= 0; i--) {
      const bucketEnd = new Date(now.getTime() - i * minsPerBucket * 60000);
      const bucketStart = new Date(bucketEnd.getTime() - minsPerBucket * 60000);

      const where = {
        status: 'completed',
        updatedAt: { gte: bucketStart, lt: bucketEnd },
      };
      if (queueId) where.queueId = queueId;
      else where.queue = { project: { userId: req.userId } };

      const count = await prisma.job.count({ where });
      result.push({
        label: bucketStart.toISOString(),
        count,
      });
    }

    return res.json({ throughput: result });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch throughput' });
  }
}

module.exports = { createJob, listJobs, getJob, getJobLogs, retryJob, getThroughput };
