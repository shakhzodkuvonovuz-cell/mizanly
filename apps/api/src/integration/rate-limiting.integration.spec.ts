import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  THROTTLER_LIMIT,
  THROTTLER_TTL,
} from '@nestjs/throttler/dist/throttler.constants';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { AppModule } from '../app.module';

// Controllers under test
import { PostsController } from '../modules/posts/posts.controller';
import { AiController } from '../modules/ai/ai.controller';
import { UploadController } from '../modules/upload/upload.controller';
import { AuthController } from '../modules/auth/auth.controller';
import { StickersController } from '../modules/stickers/stickers.controller';
import { ModerationController } from '../modules/moderation/moderation.controller';
import { FeedController } from '../modules/feed/feed.controller';

/**
 * Helper: read throttle metadata from a class (class-level @Throttle).
 * @nestjs/throttler stores metadata as THROTTLER:LIMIT + throttlerName on the class constructor.
 * The default throttler name is 'default'.
 */
function getClassThrottle(controller: Function): { limit: number; ttl: number } | null {
  const limit = Reflect.getMetadata(THROTTLER_LIMIT + 'default', controller);
  const ttl = Reflect.getMetadata(THROTTLER_TTL + 'default', controller);
  if (limit === undefined && ttl === undefined) return null;
  return { limit, ttl };
}

/**
 * Helper: read throttle metadata from a specific method.
 * @nestjs/throttler sets metadata on descriptor.value (the method function itself).
 */
function getMethodThrottle(
  controller: Function,
  methodName: string,
): { limit: number; ttl: number } | null {
  const method = controller.prototype[methodName];
  if (!method) return null;
  const limit = Reflect.getMetadata(THROTTLER_LIMIT + 'default', method);
  const ttl = Reflect.getMetadata(THROTTLER_TTL + 'default', method);
  if (limit === undefined && ttl === undefined) return null;
  return { limit, ttl };
}

describe('Rate Limiting Integration', () => {
  // ─── Module Configuration ───────────────────────────────────────────

  describe('AppModule configuration', () => {
    it('should import ThrottlerModule with 100 req/60s default', () => {
      // ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]) is called in AppModule imports.
      // We verify by inspecting the module metadata for the ThrottlerModule import.
      const imports: any[] = Reflect.getMetadata('imports', AppModule) || [];
      const hasThrottlerModule = imports.some((imp: any) => {
        // forRoot returns a DynamicModule with module: ThrottlerModule
        if (imp && imp.module && imp.module.name === 'ThrottlerModule') return true;
        // Or it could be the class directly
        if (imp && imp.name === 'ThrottlerModule') return true;
        return false;
      });
      expect(hasThrottlerModule).toBe(true);
    });

    it('should register UserThrottlerGuard as global APP_GUARD', () => {
      const providers: any[] = Reflect.getMetadata('providers', AppModule) || [];
      const guardProvider = providers.find(
        (p: any) => p && p.provide === APP_GUARD,
      );
      expect(guardProvider).toBeDefined();
      expect(guardProvider.useClass).toBe(UserThrottlerGuard);
    });

    it('UserThrottlerGuard should extend ThrottlerGuard', () => {
      expect(UserThrottlerGuard.prototype).toBeInstanceOf(ThrottlerGuard);
    });
  });

  // ─── AuthController ─────────────────────────────────────────────────

  describe('AuthController throttle metadata', () => {
    it('register should be throttled at 5 req / 5 min (300000ms)', () => {
      const throttle = getMethodThrottle(AuthController, 'register');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(5);
      expect(throttle!.ttl).toBe(300000);
    });

    it('me should be throttled at 10 req / 60s', () => {
      const throttle = getMethodThrottle(AuthController, 'me');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(10);
      expect(throttle!.ttl).toBe(60000);
    });

    it('checkUsername should be throttled at 10 req / 60s', () => {
      const throttle = getMethodThrottle(AuthController, 'checkUsername');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(10);
      expect(throttle!.ttl).toBe(60000);
    });
  });

  // ─── PostsController ────────────────────────────────────────────────

  describe('PostsController throttle metadata', () => {
    it('create should be throttled at 10 req / 60s', () => {
      const throttle = getMethodThrottle(PostsController, 'create');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(10);
      expect(throttle!.ttl).toBe(60000);
    });

    it('react should be throttled at 5 req / 60s (per-post target throttle)', () => {
      const throttle = getMethodThrottle(PostsController, 'react');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(5);
      expect(throttle!.ttl).toBe(60000);
    });

    it('report should be throttled at 10 req / 60s', () => {
      const throttle = getMethodThrottle(PostsController, 'report');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(10);
      expect(throttle!.ttl).toBe(60000);
    });
  });

  // ─── AiController ──────────────────────────────────────────────────

  describe('AiController throttle metadata', () => {
    it('moderate should be throttled at 5 req / 60s', () => {
      const throttle = getMethodThrottle(AiController, 'moderate');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(5);
      expect(throttle!.ttl).toBe(60000);
    });

    it('suggestCaptions should be throttled at 10 req / 60s', () => {
      const throttle = getMethodThrottle(AiController, 'suggestCaptions');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(10);
      expect(throttle!.ttl).toBe(60000);
    });

    it('translate should be throttled at 30 req / 60s', () => {
      const throttle = getMethodThrottle(AiController, 'translate');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(30);
      expect(throttle!.ttl).toBe(60000);
    });

    it('generateAvatar should be throttled at 5 req / 60s', () => {
      const throttle = getMethodThrottle(AiController, 'generateAvatar');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(5);
      expect(throttle!.ttl).toBe(60000);
    });
  });

  // ─── UploadController ──────────────────────────────────────────────

  describe('UploadController throttle metadata', () => {
    it('getPresignedUrl should be throttled at 20 req / 60s', () => {
      const throttle = getMethodThrottle(UploadController, 'getPresignedUrl');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(20);
      expect(throttle!.ttl).toBe(60000);
    });
  });

  // ─── StickersController ────────────────────────────────────────────

  describe('StickersController throttle metadata', () => {
    it('createPack should be throttled at 5 req / 60s', () => {
      const throttle = getMethodThrottle(StickersController, 'createPack');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(5);
      expect(throttle!.ttl).toBe(60000);
    });

    it('generate should be throttled at 10 req / day (86400000ms)', () => {
      const throttle = getMethodThrottle(StickersController, 'generate');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(10);
      expect(throttle!.ttl).toBe(86400000);
    });
  });

  // ─── ModerationController ──────────────────────────────────────────

  describe('ModerationController throttle metadata', () => {
    it('should have class-level throttle of 30 req / 60s', () => {
      const throttle = getClassThrottle(ModerationController);
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(30);
      expect(throttle!.ttl).toBe(60000);
    });

    it('checkText should override to 5 req / 60s', () => {
      const throttle = getMethodThrottle(ModerationController, 'checkText');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(5);
      expect(throttle!.ttl).toBe(60000);
    });

    it('checkImage should override to 5 req / 60s', () => {
      const throttle = getMethodThrottle(ModerationController, 'checkImage');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(5);
      expect(throttle!.ttl).toBe(60000);
    });
  });

  // ─── FeedController ────────────────────────────────────────────────

  describe('FeedController throttle metadata', () => {
    it('log (interaction) should be throttled at 60 req / 60s', () => {
      const throttle = getMethodThrottle(FeedController, 'log');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(60);
      expect(throttle!.ttl).toBe(60000);
    });

    it('getPersonalized should be throttled at 30 req / 60s', () => {
      const throttle = getMethodThrottle(FeedController, 'getPersonalized');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(30);
      expect(throttle!.ttl).toBe(60000);
    });

    it('trending feed should be throttled at 30 req / 60s', () => {
      const throttle = getMethodThrottle(FeedController, 'getTrending');
      expect(throttle).not.toBeNull();
      expect(throttle!.limit).toBe(30);
      expect(throttle!.ttl).toBe(60000);
    });
  });

  // ─── UserThrottlerGuard behavior ───────────────────────────────────

  describe('UserThrottlerGuard tracker logic', () => {
    let guard: UserThrottlerGuard;

    beforeEach(() => {
      // Create instance with minimal deps — getTracker is a standalone method.
      // We must also set the private logger since fingerprint path calls this.logger.warn().
      guard = Object.create(UserThrottlerGuard.prototype);
      (guard as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    });

    it('should return user-based tracker when userId is present', async () => {
      const req = { user: { id: 'user_abc123' } } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user_abc123');
    });

    it('should return IP-based tracker for unauthenticated requests', async () => {
      const req = { ip: '192.168.1.1' } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('ip:192.168.1.1');
    });

    it('should use req.ip and ignore x-forwarded-for (trust proxy handles resolution)', async () => {
      // SECURITY: The guard must NOT read x-forwarded-for directly — clients can spoof it.
      // Express 'trust proxy' resolves req.ip correctly from the first trusted proxy hop.
      const req = {
        ip: '10.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' },
      } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      // Should use req.ip, NOT parse x-forwarded-for
      expect(tracker).toBe('ip:10.0.0.1');
    });

    it('should prefer userId over IP when both are present', async () => {
      const req = {
        user: { id: 'user_xyz' },
        ip: '192.168.1.1',
        headers: { 'x-forwarded-for': '203.0.113.50' },
      } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user:user_xyz');
    });

    it('should return fingerprint-based tracker when no user or IP', async () => {
      const req = {
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip',
        },
      } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toMatch(/^fingerprint:[a-f0-9]{32}$/);
    });

    it('should produce different fingerprints for different user-agents', async () => {
      const req1 = {
        headers: { 'user-agent': 'Chrome/120', 'accept-language': 'en', 'accept-encoding': 'gzip' },
      } as Record<string, unknown>;
      const req2 = {
        headers: { 'user-agent': 'Firefox/121', 'accept-language': 'en', 'accept-encoding': 'gzip' },
      } as Record<string, unknown>;
      const t1 = await (guard as any).getTracker(req1);
      const t2 = await (guard as any).getTracker(req2);
      expect(t1).not.toBe(t2);
    });

    it('should handle completely empty request gracefully', async () => {
      const req = {} as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      // Falls through to fingerprint since no user, no IP, no headers
      expect(tracker).toMatch(/^fingerprint:[a-f0-9]{32}$/);
    });
  });
});
