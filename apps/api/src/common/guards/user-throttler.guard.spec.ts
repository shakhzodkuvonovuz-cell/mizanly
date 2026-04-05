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

  describe('getTracker (no context / no target)', () => {
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

    it('should use req.ip even when x-forwarded-for is present (trust proxy handles resolution)', async () => {
      // SECURITY: The guard must NOT read x-forwarded-for directly.
      // Express 'trust proxy' resolves req.ip correctly. If the guard
      // read x-forwarded-for, attackers could spoof IPs to bypass rate limiting.
      const req = { ip: '10.0.0.1', headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' } };
      const tracker = await (guard as any).getTracker(req);
      // Should use req.ip (10.0.0.1), NOT the x-forwarded-for value (203.0.113.50)
      expect(tracker).toBe('ip:10.0.0.1');
    });

    it('should NOT be bypassable by spoofing x-forwarded-for', async () => {
      // An attacker sends a spoofed x-forwarded-for header with a random IP
      // The guard should ignore it and use req.ip which Express resolves safely
      const req = { ip: '1.2.3.4', headers: { 'x-forwarded-for': '99.99.99.99' } };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('ip:1.2.3.4');
      expect(tracker).not.toContain('99.99.99.99');
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
      const t1 = await (guard as any).getTracker(req1, undefined);
      const t2 = await (guard as any).getTracker(req2, undefined);
      expect(t1).not.toBe(t2);
    });

    it('should prefer user ID over IP when both available', async () => {
      const req = { user: { id: 'user-456' }, ip: '10.0.0.1', headers: {} };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user-456');
    });
  });

  describe('getTracker with _throttleTargetId (#122)', () => {
    it('should compose key from user and target when _throttleTargetId set', async () => {
      const req = {
        user: { id: 'actor-1' },
        _throttleTargetId: 'target-2',
        headers: {},
      };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:actor-1:target:target-2');
    });

    it('should fall back to actor-only when no _throttleTargetId', async () => {
      const req = {
        user: { id: 'actor-1' },
        headers: {},
      };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:actor-1');
    });

    it('should produce different keys for same actor different targets', async () => {
      const req1 = { user: { id: 'actor-1' }, _throttleTargetId: 'target-A', headers: {} } as any;
      const req2 = { user: { id: 'actor-1' }, _throttleTargetId: 'target-B', headers: {} } as any;

      const t1 = await (guard as any).getTracker(req1);
      const t2 = await (guard as any).getTracker(req2);

      expect(t1).not.toBe(t2);
      expect(t1).toBe('user:actor-1:target:target-A');
      expect(t2).toBe('user:actor-1:target:target-B');
    });

    it('should compose IP + target for unauthenticated requests with target', async () => {
      const req = {
        ip: '10.0.0.1',
        _throttleTargetId: 'target-2',
        headers: {},
      };
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('ip:10.0.0.1:target:target-2');
    });
  });
});
