/**
 * Tests for retry policy functions — Part 6 of assignment spec
 * These are pure unit tests — no database, no server needed.
 */

const { fixedDelay, linearDelay, exponentialDelay, getRetryDelay } = require('../../worker/src/retryPolicies');

describe('Retry Policies — Unit Tests', () => {
  describe('fixedDelay', () => {
    it('always returns the base delay regardless of retryCount', () => {
      expect(fixedDelay(10, 1)).toBe(10);
      expect(fixedDelay(10, 2)).toBe(10);
      expect(fixedDelay(10, 5)).toBe(10);
      expect(fixedDelay(30, 1)).toBe(30);
    });

    it('works with zero base delay', () => {
      expect(fixedDelay(0, 3)).toBe(0);
    });
  });

  describe('linearDelay', () => {
    it('grows linearly: base * retryCount', () => {
      // base=10 → 10, 20, 30, 40
      expect(linearDelay(10, 1)).toBe(10);
      expect(linearDelay(10, 2)).toBe(20);
      expect(linearDelay(10, 3)).toBe(30);
      expect(linearDelay(10, 4)).toBe(40);
    });

    it('uses at least 1x base for retryCount=0 edge case', () => {
      expect(linearDelay(10, 0)).toBe(10); // Math.max(1, 0) = 1
    });
  });

  describe('exponentialDelay', () => {
    it('doubles each time: base * 2^(retryCount-1)', () => {
      // base=10 → 10, 20, 40, 80
      expect(exponentialDelay(10, 1)).toBe(10);
      expect(exponentialDelay(10, 2)).toBe(20);
      expect(exponentialDelay(10, 3)).toBe(40);
      expect(exponentialDelay(10, 4)).toBe(80);
    });

    it('uses base delay for retryCount=0 edge case', () => {
      expect(exponentialDelay(10, 0)).toBe(10); // 2^max(0,-1) = 2^0 = 1
    });
  });

  describe('getRetryDelay dispatcher', () => {
    it('dispatches to fixed policy', () => {
      expect(getRetryDelay('fixed', 10, 3)).toBe(10);
    });

    it('dispatches to linear policy', () => {
      expect(getRetryDelay('linear', 10, 3)).toBe(30);
    });

    it('dispatches to exponential policy', () => {
      expect(getRetryDelay('exponential', 10, 3)).toBe(40);
    });

    it('defaults to fixed for unknown policy', () => {
      expect(getRetryDelay('unknown', 10, 3)).toBe(10);
    });
  });
});
