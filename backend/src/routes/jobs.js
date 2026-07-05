const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createJob,
  listJobs,
  getJob,
  getJobLogs,
  retryJob,
  getThroughput,
} = require('../controllers/jobsController');

const router = Router();

router.use(authenticate);

router.post('/', createJob);
router.get('/', listJobs);
router.get('/throughput', getThroughput);
router.get('/:id', getJob);
router.get('/:id/logs', getJobLogs);
router.patch('/:id/retry', retryJob);

module.exports = router;
