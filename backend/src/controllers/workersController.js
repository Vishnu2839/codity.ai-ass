const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// In a real system, you'd secure these endpoints (e.g. with a shared secret or JWT for workers)
// For this assignment, we will leave them accessible to the internal network (localhost)

async function registerWorker(req, res, next) {
  try {
    const { id, hostname } = req.body;
    if (!id || !hostname) {
      return res.status(400).json({ error: 'Missing worker id or hostname' });
    }

    const worker = await prisma.worker.upsert({
      where: { id },
      update: {
        status: 'active',
        hostname,
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
      create: {
        id,
        hostname,
        status: 'active',
      },
    });

    res.json({ message: 'Worker registered', worker });
  } catch (err) {
    next(err);
  }
}

async function heartbeat(req, res, next) {
  try {
    const { id } = req.params;

    const worker = await prisma.worker.update({
      where: { id },
      data: {
        status: 'active',
        lastHeartbeatAt: new Date(),
      },
    });

    res.json({ message: 'Heartbeat received', worker });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Worker not found' });
    }
    next(err);
  }
}

async function getWorkers(req, res, next) {
  try {
    const workers = await prisma.worker.findMany({
      orderBy: { lastHeartbeatAt: 'desc' },
    });

    // Mark workers as offline if no heartbeat for > 30 seconds
    const now = new Date();
    const mapped = workers.map(w => {
      const isOffline = (now - new Date(w.lastHeartbeatAt)) > 30000;
      return {
        ...w,
        status: isOffline ? 'offline' : w.status,
      };
    });

    res.json({ workers: mapped });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerWorker,
  heartbeat,
  getWorkers,
};
