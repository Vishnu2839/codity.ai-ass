/**
 * Retry policy functions — Part 6 of assignment spec
 *
 * All functions take (retryBaseDelaySeconds, retryCount) and return
 * the number of seconds to wait before the next retry attempt.
 *
 * These are pure functions with no side effects, making them easy to unit-test
 * without needing a database or any external state.
 */

/**
 * Fixed retry policy: always wait the same amount of time.
 * Example: base=10 → always 10s between retries
 * @param {number} retryBaseDelaySeconds
 * @param {number} retryCount - current retry count (unused for fixed)
 * @returns {number} delay in seconds
 */
function fixedDelay(retryBaseDelaySeconds, retryCount) {
  return retryBaseDelaySeconds;
}

/**
 * Linear retry policy: wait grows linearly with retryCount.
 * next retry after retryBaseDelaySeconds * retryCount
 * Example: base=10 → 10s, 20s, 30s, 40s...
 * @param {number} retryBaseDelaySeconds
 * @param {number} retryCount - how many times already retried (1-indexed on first retry)
 * @returns {number} delay in seconds
 */
function linearDelay(retryBaseDelaySeconds, retryCount) {
  // Use Math.max(1, retryCount) so the first retry still produces base delay
  return retryBaseDelaySeconds * Math.max(1, retryCount);
}

/**
 * Exponential backoff retry policy: delay doubles with each retry.
 * next retry after retryBaseDelaySeconds * 2^(retryCount - 1)
 * Example: base=10 → 10s, 20s, 40s, 80s...
 * @param {number} retryBaseDelaySeconds
 * @param {number} retryCount - current retry count (1-indexed)
 * @returns {number} delay in seconds
 */
function exponentialDelay(retryBaseDelaySeconds, retryCount) {
  return retryBaseDelaySeconds * Math.pow(2, Math.max(0, retryCount - 1));
}

/**
 * Dispatcher: given a queue's retryPolicyType, returns the correct delay.
 * @param {string} policyType - "fixed" | "linear" | "exponential"
 * @param {number} retryBaseDelaySeconds
 * @param {number} retryCount
 * @returns {number} delay in seconds
 */
function getRetryDelay(policyType, retryBaseDelaySeconds, retryCount) {
  switch (policyType) {
    case 'linear':
      return linearDelay(retryBaseDelaySeconds, retryCount);
    case 'exponential':
      return exponentialDelay(retryBaseDelaySeconds, retryCount);
    case 'fixed':
    default:
      return fixedDelay(retryBaseDelaySeconds, retryCount);
  }
}

module.exports = { fixedDelay, linearDelay, exponentialDelay, getRetryDelay };
