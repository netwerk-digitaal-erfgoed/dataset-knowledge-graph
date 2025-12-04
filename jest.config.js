export default {
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 10000,
  collectCoverage: true,
  collectCoverageFrom: [
    '**/src/**/*.ts', // Include files that are not covered by tests.
    '!**/src/**/*.d.ts', // Don't show d.ts files on code coverage overview.
  ],
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 75.37,
      statements: 75.37,
      branches: 62.3,
      functions: 76.08,
    },
  },
  transform: {
    '^.+\\.ts$': '@swc/jest',
  },
};
