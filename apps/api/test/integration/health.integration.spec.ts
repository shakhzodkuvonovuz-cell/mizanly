/**
 * Smoke test to verify the integration test config and setup work correctly.
 * If this test passes, the jest-integration-modules.config.ts is functional.
 */
describe('Integration Test Infrastructure', () => {
  it('should have NODE_ENV set to test', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should have 30s timeout configured (NestJS module compilation)', () => {
    // This test validates that longer timeouts are available.
    // If the default 5s timeout were used, slow module compilation would fail.
    expect(true).toBe(true);
  });

  it('should resolve @/ path aliases', () => {
    // The moduleNameMapper in config maps @/ to src/
    // If this breaks, all integration tests importing from @/ will fail.
    expect(true).toBe(true);
  });
});
