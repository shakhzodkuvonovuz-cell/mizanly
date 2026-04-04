import { TargetThrottle, TARGET_THROTTLE_KEY } from '../decorators/target-throttle.decorator';

describe('TargetThrottle decorator', () => {
  it('should set TARGET_THROTTLE_KEY metadata on handler', () => {
    class TestController {
      @TargetThrottle('userId', 5, 60000)
      follow() {}
    }

    const instance = new TestController();
    const metadata = Reflect.getMetadata(TARGET_THROTTLE_KEY, instance.follow);
    expect(metadata).toBe('userId');
  });

  it('should set throttle limit metadata via @Throttle', () => {
    class TestController {
      @TargetThrottle('postId', 10, 120000)
      likePost() {}
    }

    const instance = new TestController();
    // @nestjs/throttler v5 uses THROTTLER:LIMIT + throttlerName as metadata key
    const limitMeta = Reflect.getMetadata('THROTTLER:LIMITdefault', instance.likePost);
    const ttlMeta = Reflect.getMetadata('THROTTLER:TTLdefault', instance.likePost);
    expect(limitMeta).toBe(10);
    expect(ttlMeta).toBe(120000);
  });

  it('should use default limit and ttl when not specified', () => {
    class TestController {
      @TargetThrottle('commentId')
      likeComment() {}
    }

    const instance = new TestController();
    const limitMeta = Reflect.getMetadata('THROTTLER:LIMITdefault', instance.likeComment);
    const ttlMeta = Reflect.getMetadata('THROTTLER:TTLdefault', instance.likeComment);
    expect(limitMeta).toBe(5);
    expect(ttlMeta).toBe(60000);
  });

  it('should set target param for different route params', () => {
    class TestController {
      @TargetThrottle('commentId')
      likeComment() {}

      @TargetThrottle('userId')
      follow() {}

      @TargetThrottle('id')
      reactToPost() {}
    }

    const instance = new TestController();
    expect(Reflect.getMetadata(TARGET_THROTTLE_KEY, instance.likeComment)).toBe('commentId');
    expect(Reflect.getMetadata(TARGET_THROTTLE_KEY, instance.follow)).toBe('userId');
    expect(Reflect.getMetadata(TARGET_THROTTLE_KEY, instance.reactToPost)).toBe('id');
  });
});
