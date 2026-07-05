const express = require('express');
const router = express.Router();
const { registerWorker, heartbeat, getWorkers } = require('../controllers/workersController');

router.post('/register', registerWorker);
router.post('/:id/heartbeat', heartbeat);
router.get('/', getWorkers);

module.exports = router;
