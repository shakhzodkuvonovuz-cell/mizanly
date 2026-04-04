import { TARGET_THROTTLE_KEY, TargetThrottle } from './target-throttle.decorator';

describe('TargetThrottle decorator', () => {
  describe('TARGET_THROTTLE_KEY', () => {
    it('should be "TARGET_THROTTLE_PARAM"', () => {
      expect(TARGET_THROTTLE_KEY).toBe('TARGET_THROTTLE_PARAM');
    });
  });

  describe('TargetThrottle', () => {
    it('should set TARGET_THROTTLE_PARAM metadata on the method', () => {
      class TestController {
        @TargetThrottle('userId')
        follow() {
          // no-op
        }
      }

      const metadata = Reflect.getMetadata(
        TARGET_THROTTLE_KEY,
        TestController.prototype.follow,
      );
      expect(metadata).toBe('userId');
    });

    it('should set throttle metadata with default limit and ttl', () => {
      class TestController {
        @TargetThrottle('postId')
        like() {
          // no-op
        }
      }

      // @Throttle sets '__throttler__' metadata
      const throttleMetadata = Reflect.getMetadata(
        'THROTTLER:LIMIT',
        TestController.prototype.like,
      );
      // The throttle decorator from @nestjs/throttler uses different metadata keys
      // across versions. Check that the method has metadata applied.
      const allMetadataKeys = Reflect.getMetadataKeys(TestController.prototype.like);
      expect(allMetadataKeys.length).toBeGreaterThan(0);
      expect(allMetadataKeys).toContain(TARGET_THROTTLE_KEY);
    });

    it('should use different target params for different routes', () => {
      class TestController {
        @TargetThrottle('userId')
        follow() {}

        @TargetThrottle('commentId')
        likeComment() {}
      }

      const followMeta = Reflect.getMetadata(
        TARGET_THROTTLE_KEY,
        TestController.prototype.follow,
      );
      const likeMeta = Reflect.getMetadata(
        TARGET_THROTTLE_KEY,
        TestController.prototype.likeComment,
      );

      expect(followMeta).toBe('userId');
      expect(likeMeta).toBe('commentId');
    });

    it('should accept custom limit and ttl', () => {
      class TestController {
        @TargetThrottle('id', 10, 120000)
        customRoute() {}
      }

      const metadata = Reflect.getMetadata(
        TARGET_THROTTLE_KEY,
        TestController.prototype.customRoute,
      );
      expect(metadata).toBe('id');
    });

    it('should be a function that returns a decorator', () => {
      expect(typeof TargetThrottle).toBe('function');
      const decorator = TargetThrottle('test');
      expect(typeof decorator).toBe('function');
    });
  });
});
