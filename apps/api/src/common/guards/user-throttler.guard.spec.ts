import { Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserThrottlerGuard } from './user-throttler.guard';
import { TARGET_THROTTLE_KEY } from '../decorators/target-throttle.decorator';

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
      const tracker = await (guard as any).getTracker(req, undefined);
      expect(tracker).toBe('user:user-123');
    });

    it('should use ip:address when unauthenticated', async () => {
      const req = { ip: '192.168.1.1', headers: {} };
      const tracker = await (guard as any).getTracker(req, undefined);
      expect(tracker).toBe('ip:192.168.1.1');
    });

    it('should use x-forwarded-for IP when behind proxy', async () => {
      const req = { ip: '10.0.0.1', headers: { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' } };
      const tracker = await (guard as any).getTracker(req, undefined);
      expect(tracker).toBe('ip:203.0.113.50');
    });

    it('should use header fingerprint when no IP can be determined', async () => {
      const req = { headers: { 'user-agent': 'TestBrowser/1.0' } };
      const tracker = await (guard as any).getTracker(req, undefined);
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
      const tracker = await (guard as any).getTracker(req, undefined);
      expect(tracker).toBe('user:user-456');
    });
  });

  describe('getTracker with @TargetThrottle (#122)', () => {
    let reflector: Reflector;

    const makeContext = (handler: () => void) => ({
      getHandler: () => handler,
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({ header: jest.fn() }),
      }),
    } as any);

    beforeEach(() => {
      reflector = new Reflector();
      // Inject the reflector so getReflector() finds it
      (guard as any).reflector = reflector;
    });

    it('should compose key from user and target param when both available', async () => {
      const handler = () => {};
      Reflect.defineMetadata(TARGET_THROTTLE_KEY, 'userId', handler);

      const req = {
        user: { id: 'actor-1' },
        params: { userId: 'target-2' },
        headers: {},
      };
      const context = makeContext(handler);
      const tracker = await (guard as any).getTracker(req, context);
      expect(tracker).toBe('user:actor-1:target:target-2');
    });

    it('should fall back to actor-only when no target metadata', async () => {
      const handler = () => {};
      // No TARGET_THROTTLE_KEY metadata set

      const req = {
        user: { id: 'actor-1' },
        params: { userId: 'target-2' },
        headers: {},
      };
      const context = makeContext(handler);
      const tracker = await (guard as any).getTracker(req, context);
      expect(tracker).toBe('user:actor-1');
    });

    it('should fall back to actor-only when target param not in route', async () => {
      const handler = () => {};
      Reflect.defineMetadata(TARGET_THROTTLE_KEY, 'targetId', handler);

      const req = {
        user: { id: 'actor-1' },
        params: {},
        headers: {},
      };
      const context = makeContext(handler);
      const tracker = await (guard as any).getTracker(req, context);
      expect(tracker).toBe('user:actor-1');
    });

    it('should produce different keys for same actor different targets', async () => {
      const handler = () => {};
      Reflect.defineMetadata(TARGET_THROTTLE_KEY, 'userId', handler);
      const context = makeContext(handler);

      const req1 = { user: { id: 'actor-1' }, params: { userId: 'target-A' }, headers: {} };
      const req2 = { user: { id: 'actor-1' }, params: { userId: 'target-B' }, headers: {} };

      const t1 = await (guard as any).getTracker(req1, context);
      const t2 = await (guard as any).getTracker(req2, context);

      expect(t1).not.toBe(t2);
      expect(t1).toBe('user:actor-1:target:target-A');
      expect(t2).toBe('user:actor-1:target:target-B');
    });

    it('should produce different keys for different actors same target', async () => {
      const handler = () => {};
      Reflect.defineMetadata(TARGET_THROTTLE_KEY, 'userId', handler);
      const context = makeContext(handler);

      const req1 = { user: { id: 'actor-1' }, params: { userId: 'target-X' }, headers: {} };
      const req2 = { user: { id: 'actor-2' }, params: { userId: 'target-X' }, headers: {} };

      const t1 = await (guard as any).getTracker(req1, context);
      const t2 = await (guard as any).getTracker(req2, context);

      expect(t1).not.toBe(t2);
    });

    it('should compose IP + target for unauthenticated requests with target', async () => {
      const handler = () => {};
      Reflect.defineMetadata(TARGET_THROTTLE_KEY, 'userId', handler);

      const req = {
        ip: '10.0.0.1',
        params: { userId: 'target-2' },
        headers: {},
      };
      const context = makeContext(handler);
      const tracker = await (guard as any).getTracker(req, context);
      // Even unauthenticated requests get per-target throttling (IP + target)
      expect(tracker).toBe('ip:10.0.0.1:target:target-2');
    });
  });
});
