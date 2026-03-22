import { Logger } from '@nestjs/common';
import { UserThrottlerGuard } from './user-throttler.guard';

describe('UserThrottlerGuard', () => {
  let guard: UserThrottlerGuard;

  beforeEach(() => {
    // UserThrottlerGuard extends ThrottlerGuard which needs DI
    // We test the getTracker method directly via reflection
    guard = Object.create(UserThrottlerGuard.prototype);
    // Attach a logger mock since the guard now logs warnings
    (guard as any).logger = { warn: jest.fn() } as unknown as Logger;
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

    it('should use header fingerprint when no IP can be determined', async () => {
      const req = { headers: { 'user-agent': 'TestBrowser/1.0' } };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toMatch(/^fingerprint:[a-f0-9]{32}$/);
      expect((guard as any).logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No IP or user for rate limiting'),
      );
    });

    it('should produce different fingerprints for different user-agents', async () => {
      const req1 = { headers: { 'user-agent': 'Chrome/1.0' } };
      const req2 = { headers: { 'user-agent': 'Firefox/2.0' } };
      const t1 = await (guard as any).getTracker(req1);
      const t2 = await (guard as any).getTracker(req2);
      expect(t1).not.toBe(t2);
    });

    it('should prefer user ID over IP when both available', async () => {
      const req = { user: { id: 'user-456' }, ip: '10.0.0.1', headers: {} };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user-456');
    });
  });
});
