const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * GET /api/dashboard
 * Returns a comprehensive overview of the user's entire system:
 * - Global job counts by status
 * - Project + queue summary
 * - Upcoming scheduled jobs (next 10 to run)
 * - Recent activity (last 10 completed/failed/dead_letter)
 */
async function getDashboard(req, res, next) {
  try {
    const userId = req.userId;

    // Get all project IDs owned by user
    const projects = await prisma.project.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        queues: {
          select: {
            id: true,
            name: true,
            isPaused: true,
            priority: true,
            concurrency: true,
            retryPolicyType: true,
            _count: { select: { jobs: true } },
          },
        },
        _count: { select: { queues: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const queueIds = projects.flatMap((p) => p.queues.map((q) => q.id));

    // Global job counts by status
    const statusGroups = await prisma.job.groupBy({
      by: ['status'],
      where: { queueId: { in: queueIds } },
      _count: { id: true },
    });

    const byStatus = {
      scheduled: 0,
      queued: 0,
      claimed: 0,
      running: 0,
      completed: 0,
      failed: 0,
      dead_letter: 0,
    };
    let totalJobs = 0;
    for (const g of statusGroups) {
      byStatus[g.status] = g._count.id;
      totalJobs += g._count.id;
    }

    // Upcoming scheduled jobs — next 10 that will run soonest
    const upcomingJobs = await prisma.job.findMany({
      where: {
        queueId: { in: queueIds },
        status: 'scheduled',
      },
      orderBy: { runAt: 'asc' },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        runAt: true,
        cronExpression: true,
        retryCount: true,
        maxRetries: true,
        queue: { select: { id: true, name: true, project: { select: { name: true } } } },
      },
    });

    // Recent activity — last 15 completed, failed, or dead_letter jobs
    const recentActivity = await prisma.job.findMany({
      where: {
        queueId: { in: queueIds },
        status: { in: ['completed', 'failed', 'dead_letter'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 15,
      select: {
        id: true,
        type: true,
        status: true,
        runAt: true,
        updatedAt: true,
        retryCount: true,
        queue: { select: { id: true, name: true, project: { select: { name: true } } } },
      },
    });

    // Currently running jobs
    const runningJobs = await prisma.job.findMany({
      where: {
        queueId: { in: queueIds },
        status: { in: ['running', 'claimed'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        type: true,
        status: true,
        updatedAt: true,
        queue: { select: { id: true, name: true, project: { select: { name: true } } } },
      },
    });

    // Per-queue live job counts for quick display
    const queueJobCounts = await prisma.job.groupBy({
      by: ['queueId', 'status'],
      where: { queueId: { in: queueIds } },
      _count: { id: true },
    });

    // Build a map: queueId → { queued, running, failed, completed, ... }
    const queueStats = {};
    for (const row of queueJobCounts) {
      if (!queueStats[row.queueId]) queueStats[row.queueId] = {};
      queueStats[row.queueId][row.status] = row._count.id;
    }

    // Active Workers
    const activeWorkersCount = await prisma.worker.count({
      where: {
        lastHeartbeatAt: {
          gte: new Date(Date.now() - 30000) // Heartbeat in last 30 seconds
        }
      }
    });

    // DLQ Count
    const dlqCount = byStatus['dead_letter'] || 0;

    // Retry Jobs
    const retryJobsCount = await prisma.job.count({
      where: {
        queueId: { in: queueIds },
        retryCount: { gt: 0 },
        status: { notIn: ['completed', 'failed', 'dead_letter'] }
      }
    });

    // Avg Exec Time (simplification: time between createdAt and updatedAt for completed jobs)
    const completedJobs = await prisma.job.findMany({
      where: { queueId: { in: queueIds }, status: 'completed' },
      select: { createdAt: true, updatedAt: true },
      take: 100 // Sample size
    });
    
    let avgExecTimeMs = 0;
    if (completedJobs.length > 0) {
      const totalMs = completedJobs.reduce((acc, job) => acc + (new Date(job.updatedAt) - new Date(job.createdAt)), 0);
      avgExecTimeMs = totalMs / completedJobs.length;
    }
    const avgExecTime = (avgExecTimeMs / 1000).toFixed(1) + 's';

    // Throughput (jobs completed in last 60 minutes)
    const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000);
    const completedLastHour = await prisma.job.count({
      where: {
        queueId: { in: queueIds },
        status: 'completed',
        updatedAt: { gte: sixtyMinsAgo }
      }
    });
    const throughput = (completedLastHour / 60).toFixed(2) + '/min';

    // Success Rate
    const totalFinished = (byStatus['completed'] || 0) + (byStatus['failed'] || 0) + dlqCount;
    const successRate = totalFinished > 0 
      ? ((byStatus['completed'] || 0) / totalFinished * 100).toFixed(2) + '%'
      : '0.00%';

    // Active Executions (similar to running jobs but joined with worker if possible. Currently jobs don't store workerId, so we mock worker info or leave it blank)
    const activeExecutions = runningJobs.map((job, idx) => ({
      id: `#${job.id.substring(0,4)}`,
      jobId: `#${job.id.substring(4,8)}`,
      worker: `Worker #${300 + idx}`, // Mocked worker ID for now as Job doesn't have workerId
      attempt: `Attempt #${job.retryCount || 1}`,
      startedAt: job.updatedAt
    }));

    res.json({
      stats: {
        projects: projects.length,
        queues: queueIds.length,
        totalJobs,
        byStatus,
        activeWorkers: activeWorkersCount,
        dlqCount,
        retryJobs: retryJobsCount,
        queueHealth: '100%', // Mock for now
        avgExecTime,
        throughput,
        successRate
      },
      activeExecutions,
      upcomingJobs,
      recentActivity,
      runningJobs,
      projects: projects.map((p) => ({
        ...p,
        queues: p.queues.map((q) => ({
          ...q,
          jobStats: queueStats[q.id] || {},
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard };
