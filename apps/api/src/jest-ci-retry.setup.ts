/**
 * CI-only Jest setup: retry flaky tests up to 2 times.
 * Jest-circus (default in Jest 29) supports jest.retryTimes().
 * Only active when JEST_RETRY=true (set in CI workflow).
 *
 * This handles transient failures from DB connections, Redis timeouts,
 * and other infrastructure flakiness in CI containers.
 */
if (process.env.JEST_RETRY === 'true') {
  jest.retryTimes(2, { logErrorsBeforeRetry: true });
}
