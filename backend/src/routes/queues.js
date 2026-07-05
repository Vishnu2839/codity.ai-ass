const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createQueue,
  listQueues,
  getQueue,
  updateQueue,
  deleteQueue,
  getQueueStats,
} = require('../controllers/queuesController');

const router = Router();

router.use(authenticate);

router.post('/', createQueue);
router.get('/', listQueues);
router.get('/:id', getQueue);
router.patch('/:id', updateQueue);
router.delete('/:id', deleteQueue);
router.get('/:id/stats', getQueueStats);

module.exports = router;
