export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testTimeout: 10000,
  collectCoverage: true,
  collectCoverageFrom: [
    '**/src/**/*.ts', // Include files that are not covered by tests.
    '!**/src/**/*.d.ts', // Don't show d.ts files on code coverage overview.
  ],
  coverageReporters: ['json-summary', 'text'],
  coverageThreshold: {
    global: {
      lines: 31.37,
      statements: 31.06,
      branches: 21.62,
      functions: 38.09,
    },
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};
