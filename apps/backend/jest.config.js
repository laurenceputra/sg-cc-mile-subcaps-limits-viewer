export default {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/__tests__/**',
    '!src/cloudflare-worker.js', // Cloudflare-specific
    '!src/node-server.js' // Server entry point
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000, // 30 seconds for load tests
  maxWorkers: '50%', // Use half of available CPUs
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/jest.setup.js']
};
