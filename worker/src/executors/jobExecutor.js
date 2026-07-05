/**
 * Job Executor — simulates real job execution
 * Part 7 of assignment spec (step 4: "Execute" the job)
 *
 * In a real system, this would dispatch to different handlers based on job.type or
 * job.payload.action, e.g.:
 *   - "send_email" → call an SMTP service
 *   - "process_video" → call a transcoding pipeline
 *   - "generate_receipt" → render a PDF and upload to S3
 *
 * For this assignment, we simulate work with a random delay and configurable failure rate.
 */

const FAILURE_RATE = parseFloat(process.env.FAILURE_RATE || '0.2');
const MIN_EXEC_TIME_MS = parseInt(process.env.MIN_EXEC_TIME_MS || '500');
const MAX_EXEC_TIME_MS = parseInt(process.env.MAX_EXEC_TIME_MS || '2000');

/**
 * Sleeps for a random duration between MIN and MAX exec time.
 * Simulates I/O-bound or CPU-bound work.
 */
function simulateWork() {
  const delay = MIN_EXEC_TIME_MS + Math.random() * (MAX_EXEC_TIME_MS - MIN_EXEC_TIME_MS);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Executes a job (simulated).
 * @param {object} job - the full Job record from the database
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function executeJob(job) {
  // Simulate the time it takes to do real work (API call, video encoding, etc.)
  await simulateWork();

  const payload = (() => {
    try {
      return JSON.parse(job.payload || '{}');
    } catch {
      return {};
    }
  })();

  // Deterministically fail if payload says so, else randomly decide based on FAILURE_RATE
  const failed = payload.fail === true || Math.random() < FAILURE_RATE;

  if (failed) {
    // Simulate different kinds of real-world failures
    const errors = [
      'Connection timeout to external service',
      'Upstream API returned 503',
      'Out of memory during processing',
      'Invalid payload format',
      'Rate limit exceeded',
    ];
    const error = errors[Math.floor(Math.random() * errors.length)];
    return {
      success: false,
      message: `Job failed: ${error} (type=${job.type}, id=${job.id})`,
    };
  }

  return {
    success: true,
    message: `Job completed successfully (type=${job.type}, payload keys=${Object.keys(payload).join(',') || 'none'})`,
  };
}

module.exports = { executeJob };
