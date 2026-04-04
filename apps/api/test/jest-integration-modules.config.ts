import type { Config } from 'jest';

/**
 * Jest config for API module integration tests.
 *
 * These tests boot real NestJS modules via supertest and verify
 * cross-module wiring, auth guard behavior, and HTTP response shapes.
 * Providers are mocked (Prisma, Redis) but the NestJS DI container
 * and HTTP pipeline (pipes, interceptors, guards) are real.
 *
 * Separate from jest-integration.json which targets integration-db/
 * tests that run against a real PostgreSQL database.
 *
 * Usage:
 *   cd apps/api && npx jest --config test/jest-integration-modules.config.ts
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '..',
  testRegex: 'test/integration/.*\\.integration\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: '../coverage-integration-modules',
  testEnvironment: 'node',
  // Longer timeout: NestJS module compilation can be slow
  testTimeout: 30000,
  // Run in band: shared NestJS app instances
  maxWorkers: 1,
  setupFiles: ['<rootDir>/test/setup-integration.ts'],
};

export default config;
