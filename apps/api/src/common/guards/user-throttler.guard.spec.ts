import { UserThrottlerGuard } from './user-throttler.guard';

describe('UserThrottlerGuard', () => {
  let guard: UserThrottlerGuard;

  beforeEach(() => {
    // UserThrottlerGuard extends ThrottlerGuard which needs DI
    // We test the getTracker method directly via reflection
    guard = Object.create(UserThrottlerGuard.prototype);
  });

  describe('getTracker', () => {
    it('should use user:id when authenticated', async () => {
      const req = { user: { id: 'user-123' }, headers: {} };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user-123');
    });

    it('should use ip:address when unauthenticated', async () => {
      const req = { ip: '192.168.1.1', headers: {} };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('ip:192.168.1.1');
    });

    it('should use x-forwarded-for IP when behind proxy', async () => {
      const req = { ip: '10.0.0.1', headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' } };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('ip:203.0.113.50');
    });

    it('should throw when no IP can be determined', async () => {
      const req = { headers: {} };
      await expect((guard as any).getTracker(req)).rejects.toThrow('Unable to identify request source');
    });

    it('should prefer user ID over IP when both available', async () => {
      const req = { user: { id: 'user-456' }, ip: '10.0.0.1', headers: {} };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user-456');
    });
  });
});
