/**
 * Worker Poller — the heart of the distributed job scheduler
 * Part 7 of assignment spec
 *
 * This is a SEPARATE NODE PROCESS from the Express API. Both processes communicate
 * exclusively through the SQLite database. This is the "distributed" architecture:
 *   - API writes jobs to DB
 *   - Worker reads jobs from DB, processes them, writes results back to DB
 *   - They share no in-process state, no function calls, no message queues
 *
 * Run with: npm run worker (in a separate terminal from the API)
 */

const path = require('path');
const os = require('os');

// Load .env from worker/ directory (one level up from worker/src/)
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Resolve DATABASE_URL to an absolute path if it's relative.
// Prisma resolves relative "file:..." paths relative to the schema.prisma file location,
// not the process cwd. We override it here with an absolute path to avoid confusion.
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
  const rawPath = process.env.DATABASE_URL.slice(5); // strip "file:"
  if (!path.isAbsolute(rawPath)) {
    // Resolve relative to the project root (two levels up: worker/src/ → worker/ → project root)
    const projectRoot = path.resolve(__dirname, '../../');
    // Handle paths like "../backend/prisma/dev.db" → strip the leading "../"
    const cleanPath = rawPath.replace(/^\.\.\//, '');
    const absolutePath = path.resolve(projectRoot, cleanPath);
    process.env.DATABASE_URL = `file:${absolutePath}`;
  }
}

const { PrismaClient } = require('@prisma/client');
const { executeJob } = require('./executors/jobExecutor');
const { getRetryDelay } = require('./retryPolicies');
const cronParser = require('cron-parser');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '2000');
const API_URL = process.env.API_URL || 'http://localhost:3001/api';
const workerId = process.env.WORKER_ID || `worker-${os.hostname()}-${process.pid}`;
const hostname = os.hostname();

// In-memory concurrency tracker: { queueId -> count of currently running jobs }
// This is reset on worker restart — acceptable for a single-worker setup.
// See FUTURE_WORK.md for distributed locking strategy when running multiple workers.
const runningCounts = {};

function getRunning(queueId) {
  return runningCounts[queueId] || 0;
}
function incrementRunning(queueId) {
  runningCounts[queueId] = (runningCounts[queueId] || 0) + 1;
}
function decrementRunning(queueId) {
  runningCounts[queueId] = Math.max(0, (runningCounts[queueId] || 1) - 1);
}

/**
 * Log a status transition to the Execution table.
 */
async function logTransition(jobId, fromStatus, toStatus, message) {
  await prisma.execution.create({
    data: { jobId, fromStatus, toStatus, message: message || null },
  });
}

/**
 * Promote scheduled/delayed jobs whose runAt has passed to "queued" status.
 * This runs every poll cycle before the main job fetch.
 */
async function promoteScheduledJobs() {
  const now = new Date();
  const eligible = await prisma.job.findMany({
    where: { status: 'scheduled', runAt: { lte: now } },
  });

  for (const job of eligible) {
    await prisma.job.update({ where: { id: job.id }, data: { status: 'queued' } });
    await logTransition(job.id, 'scheduled', 'queued', 'runAt reached — promoted to queued');
    console.log(`[PROMOTE] Job ${job.id} (${job.type}) promoted from scheduled → queued`);
  }
}

/**
 * Process a single job: claim → run → success/failure → retry/dead_letter
 * Implements the full state machine from Part 5 of the assignment spec.
 */
async function processJob(job, queue) {
  const jobId = job.id;
  incrementRunning(queue.id);

  try {
    // ── Step 1: Claim the job (scheduled → claimed)
    // The WHERE status='queued' check prevents double-claiming if two workers race.
    const claimed = await prisma.job.updateMany({
      where: { id: jobId, status: 'queued' },
      data: { status: 'claimed' },
    });

    if (claimed.count === 0) {
      // Another worker (or a race) already claimed this job — skip it
      console.log(`[SKIP] Job ${jobId} already claimed by another worker`);
      return;
    }
    await logTransition(jobId, 'queued', 'claimed', 'Worker claimed the job');

    // ── Step 2: Mark as running
    await prisma.job.update({ where: { id: jobId }, data: { status: 'running' } });
    await logTransition(jobId, 'claimed', 'running', 'Worker started execution');
    console.log(`[RUN] Job ${jobId} (${job.type}) → running`);

    // ── Step 3: Execute the job (simulated — see jobExecutor.js for details)
    const result = await executeJob(job);

    if (result.success) {
      // ── Step 4a: Success path
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'completed' },
      });
      await logTransition(jobId, 'running', 'completed', result.message);
      console.log(`[DONE] Job ${jobId} → completed`);

      // ── Step 4b: Recurring jobs — schedule the next occurrence
      if (job.type === 'recurring' && job.cronExpression) {
        try {
          const interval = cronParser.parseExpression(job.cronExpression);
          const nextRunAt = interval.next().toDate();

          const nextJob = await prisma.job.create({
            data: {
              queueId: job.queueId,
              type: 'recurring',
              payload: job.payload,
              status: 'scheduled',
              runAt: nextRunAt,
              cronExpression: job.cronExpression,
              maxRetries: job.maxRetries,
            },
          });
          await logTransition(
            nextJob.id,
            'created',
            'scheduled',
            `Next occurrence of recurring job (parent: ${jobId})`
          );
          console.log(`[RECUR] Scheduled next occurrence of ${jobId} at ${nextRunAt.toISOString()}`);
        } catch (err) {
          console.error(`[RECUR ERROR] Could not schedule next occurrence: ${err.message}`);
        }
      }
    } else {
      // ── Step 5: Failure path — implements retry policy state machine
      const currentRetryCount = job.retryCount;
      const maxRetries = job.maxRetries;

      if (currentRetryCount < maxRetries) {
        // Calculate next runAt based on the queue's retry policy
        const delaySecs = getRetryDelay(
          queue.retryPolicyType,
          queue.retryBaseDelaySeconds,
          currentRetryCount + 1
        );
        const retryAt = new Date(Date.now() + delaySecs * 1000);

        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'scheduled', // Will be promoted to "queued" when retryAt is reached
            runAt: retryAt,
            retryCount: { increment: 1 },
          },
        });
        await logTransition(
          jobId,
          'running',
          'scheduled',
          `${result.message} | Retry ${currentRetryCount + 1}/${maxRetries} in ${delaySecs}s (policy: ${queue.retryPolicyType})`
        );
        console.log(
          `[RETRY] Job ${jobId} → retry ${currentRetryCount + 1}/${maxRetries} in ${delaySecs}s`
        );
      } else {
        // Max retries exceeded → dead letter
        await prisma.job.update({
          where: { id: jobId },
          data: { status: 'dead_letter' },
        });
        await logTransition(
          jobId,
          'running',
          'dead_letter',
          `${result.message} | Max retries (${maxRetries}) exceeded`
        );
        console.log(`[DEAD] Job ${jobId} → dead_letter after ${maxRetries} retries`);
      }
    }
  } catch (err) {
    // Unexpected worker error — mark job as failed so it can be retried manually
    console.error(`[WORKER ERROR] Job ${jobId}:`, err.message);
    try {
      await prisma.job.update({ where: { id: jobId }, data: { status: 'failed' } });
      await logTransition(jobId, 'running', 'failed', `Worker error: ${err.message}`);
    } catch (innerErr) {
      console.error(`[WORKER ERROR] Could not update job status:`, innerErr.message);
    }
  } finally {
    decrementRunning(queue.id);
  }
}

/**
 * Main poll cycle — runs every POLL_INTERVAL_MS.
 * Implements Part 7 of the assignment spec.
 */
async function poll() {
  try {
    // First, promote any scheduled jobs whose time has come
    await promoteScheduledJobs();

    const now = new Date();

    // Fetch eligible jobs: queued + runAt <= now + queue not paused
    // Ordered by queue priority (desc) then runAt (asc) — highest priority first
    const jobs = await prisma.job.findMany({
      where: {
        status: 'queued',
        runAt: { lte: now },
        queue: { isPaused: false }, // Implements queue pause — Part 3 of spec
      },
      include: { queue: true },
      orderBy: [{ queue: { priority: 'desc' } }, { runAt: 'asc' }],
      take: 50, // Limit batch size per poll cycle
    });

    if (jobs.length === 0) return;

    // Filter jobs that respect concurrency limits
    const toProcess = [];
    for (const job of jobs) {
      const queue = job.queue;
      if (getRunning(queue.id) < queue.concurrency) {
        toProcess.push(job);
        incrementRunning(queue.id); // Reserve the slot before async processing starts
        decrementRunning(queue.id); // We'll re-increment inside processJob
      }
    }

    // Process jobs concurrently (each processJob manages its own concurrency slot)
    await Promise.all(toProcess.map((job) => processJob(job, job.queue)));
  } catch (err) {
    console.error('[POLL ERROR]', err.message);
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
console.log(`[WORKER] Starting — polling every ${POLL_INTERVAL_MS}ms`);
console.log(`[WORKER] Failure rate: ${(parseFloat(process.env.FAILURE_RATE || '0.2') * 100).toFixed(0)}%`);
console.log(`[WORKER] Database: ${process.env.DATABASE_URL}`);

async function registerWorker() {
  try {
    await fetch(`${API_URL}/workers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: workerId, hostname })
    });
    console.log(`[WORKER] Registered with backend as ${workerId}`);
  } catch (err) {
    console.error(`[WORKER] Failed to register: ${err.message}`);
  }
}

async function sendHeartbeat() {
  try {
    await fetch(`${API_URL}/workers/${workerId}/heartbeat`, { method: 'POST' });
  } catch (err) {
    // Ignore to avoid log spam
  }
}

let pollInterval;
let heartbeatInterval;

registerWorker().then(() => {
  // Initial poll immediately, then on interval
  poll();
  pollInterval = setInterval(poll, POLL_INTERVAL_MS);
  heartbeatInterval = setInterval(sendHeartbeat, 10000); // 10s heartbeat
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[WORKER] Shutting down gracefully...');
  clearInterval(pollInterval);
  clearInterval(heartbeatInterval);
  // Optional: Mark worker as offline in DB here via API
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  clearInterval(pollInterval);
  clearInterval(heartbeatInterval);
  await prisma.$disconnect();
  process.exit(0);
});
