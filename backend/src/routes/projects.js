const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
} = require('../controllers/projectsController');

const router = Router();

// All project routes require authentication
router.use(authenticate);

router.post('/', createProject);
router.get('/', listProjects);
router.get('/:id', getProject);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);

module.exports = router;
