/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // Run tests serially to avoid DB conflicts
  maxWorkers: 1,
};
