const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Helper: verify that a queue's parent project belongs to req.userId
 * Prevents cross-user access to queues.
 */
async function verifyQueueOwnership(queueId, userId) {
  const queue = await prisma.queue.findFirst({
    where: { id: queueId, project: { userId } },
    include: { project: true },
  });
  return queue;
}

/**
 * POST /api/queues
 * Body: { projectId, name, priority, retryPolicyType, retryBaseDelaySeconds, maxRetries, concurrency }
 */
async function createQueue(req, res) {
  const {
    projectId,
    name,
    priority = 0,
    retryPolicyType = 'fixed',
    retryBaseDelaySeconds = 30,
    maxRetries = 3,
    concurrency = 1,
  } = req.body;

  if (!projectId || !name) {
    return res.status(400).json({ error: 'projectId and name are required' });
  }

  const validPolicies = ['fixed', 'linear', 'exponential'];
  if (!validPolicies.includes(retryPolicyType)) {
    return res.status(400).json({ error: 'retryPolicyType must be fixed, linear, or exponential' });
  }

  try {
    // Verify the project belongs to this user
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const queue = await prisma.queue.create({
      data: {
        projectId,
        name,
        priority: Number(priority),
        retryPolicyType,
        retryBaseDelaySeconds: Number(retryBaseDelaySeconds),
        maxRetries: Number(maxRetries),
        concurrency: Number(concurrency),
      },
    });
    return res.status(201).json({ queue });
  } catch (err) {
    console.error('[createQueue]', err);
    return res.status(500).json({ error: 'Failed to create queue' });
  }
}

/**
 * GET /api/queues?projectId=...
 * List queues for a project (user-scoped)
 */
async function listQueues(req, res) {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId query param is required' });

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const queues = await prisma.queue.findMany({
      where: { projectId },
      include: { _count: { select: { jobs: true } } },
      orderBy: { priority: 'desc' },
    });
    return res.json({ queues });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch queues' });
  }
}

/**
 * GET /api/queues/:id
 */
async function getQueue(req, res) {
  try {
    const queue = await verifyQueueOwnership(req.params.id, req.userId);
    if (!queue) return res.status(404).json({ error: 'Queue not found' });
    return res.json({ queue });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch queue' });
  }
}

/**
 * PATCH /api/queues/:id
 * Update queue settings including pause/resume
 */
async function updateQueue(req, res) {
  try {
    const existing = await verifyQueueOwnership(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Queue not found' });

    const {
      name,
      priority,
      retryPolicyType,
      retryBaseDelaySeconds,
      maxRetries,
      concurrency,
      isPaused,
    } = req.body;

    const queue = await prisma.queue.update({
      where: { id: req.params.id },
      data: {
        name: name ?? existing.name,
        priority: priority !== undefined ? Number(priority) : existing.priority,
        retryPolicyType: retryPolicyType ?? existing.retryPolicyType,
        retryBaseDelaySeconds:
          retryBaseDelaySeconds !== undefined
            ? Number(retryBaseDelaySeconds)
            : existing.retryBaseDelaySeconds,
        maxRetries: maxRetries !== undefined ? Number(maxRetries) : existing.maxRetries,
        concurrency: concurrency !== undefined ? Number(concurrency) : existing.concurrency,
        isPaused: isPaused !== undefined ? Boolean(isPaused) : existing.isPaused,
      },
    });
    return res.json({ queue });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update queue' });
  }
}

/**
 * DELETE /api/queues/:id
 * Cascade-deletes all jobs in the queue
 */
async function deleteQueue(req, res) {
  try {
    const existing = await verifyQueueOwnership(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Queue not found' });

    await prisma.queue.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Queue deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete queue' });
  }
}

/**
 * GET /api/queues/:id/stats
 * Returns counts of jobs grouped by status
 */
async function getQueueStats(req, res) {
  try {
    const queue = await verifyQueueOwnership(req.params.id, req.userId);
    if (!queue) return res.status(404).json({ error: 'Queue not found' });

    const grouped = await prisma.job.groupBy({
      by: ['status'],
      where: { queueId: req.params.id },
      _count: { status: true },
    });

    // Build a complete map with all possible statuses
    const statusCounts = {
      scheduled: 0,
      queued: 0,
      claimed: 0,
      running: 0,
      completed: 0,
      failed: 0,
      dead_letter: 0,
    };
    for (const row of grouped) {
      statusCounts[row.status] = row._count.status;
    }

    const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    return res.json({ stats: { ...statusCounts, total } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch queue stats' });
  }
}

module.exports = {
  createQueue,
  listQueues,
  getQueue,
  updateQueue,
  deleteQueue,
  getQueueStats,
};
