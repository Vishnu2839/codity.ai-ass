const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * POST /api/projects
 * Create a new project for the authenticated user
 */
async function createProject(req, res) {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  try {
    const project = await prisma.project.create({
      data: { name, description: description || null, userId: req.userId },
    });
    return res.status(201).json({ project });
  } catch (err) {
    console.error('[createProject]', err);
    return res.status(500).json({ error: 'Failed to create project' });
  }
}

/**
 * GET /api/projects
 * List all projects owned by the authenticated user
 */
async function listProjects(req, res) {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.userId },
      include: { _count: { select: { queues: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ projects });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch projects' });
  }
}

/**
 * GET /api/projects/:id
 * Get a single project (must belong to authenticated user)
 */
async function getProject(req, res) {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { queues: { orderBy: { priority: 'desc' } } },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json({ project });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch project' });
  }
}

/**
 * PATCH /api/projects/:id
 * Update a project (name/description). User ownership enforced.
 */
async function updateProject(req, res) {
  const { name, description } = req.body;
  try {
    // Check ownership first
    const existing = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { name: name ?? existing.name, description: description ?? existing.description },
    });
    return res.json({ project });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update project' });
  }
}

/**
 * DELETE /api/projects/:id
 * Delete a project and cascade-delete its queues and jobs
 */
async function deleteProject(req, res) {
  try {
    const existing = await prisma.project.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    await prisma.project.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Project deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete project' });
  }
}

module.exports = { createProject, listProjects, getProject, updateProject, deleteProject };
