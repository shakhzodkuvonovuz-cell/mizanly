/**
 * Setup file for integration tests.
 *
 * Module integration tests (test/integration/): use mock providers,
 * so they only need NODE_ENV set.
 *
 * DB integration tests (test/integration-db/): need real DATABASE_URL
 * and REDIS_URL — those are set in CI or local .env.test.
 */
process.env.NODE_ENV = 'test';

// Suppress noisy NestJS logs during tests
process.env.LOG_LEVEL = 'silent';
