import { validate } from 'class-validator';
import {
  IsStorageUrl,
  isAllowedStorageHostname,
  resetHostnameCache,
  STATIC_ALLOWED_HOSTNAMES,
  ALLOWED_HOSTNAME_SUFFIXES,
} from './is-storage-url.validator';

// ── Test DTO for decorator validation ──

class TestDto {
  @IsStorageUrl()
  url: string;
}

class TestArrayDto {
  @IsStorageUrl({ each: true })
  urls: string[];
}

describe('IsStorageUrl validator', () => {
  beforeEach(() => {
    resetHostnameCache();
  });

  // ── isAllowedStorageHostname (pure function) ──

  describe('isAllowedStorageHostname', () => {
    it('should allow media.mizanly.app', () => {
      expect(isAllowedStorageHostname('media.mizanly.app')).toBe(true);
    });

    it('should allow R2 cloudflarestorage subdomain', () => {
      expect(isAllowedStorageHostname('abc123.r2.cloudflarestorage.com')).toBe(true);
    });

    it('should allow R2 dev subdomain', () => {
      expect(isAllowedStorageHostname('pub-abc123.r2.dev')).toBe(true);
    });

    it('should reject random external domain', () => {
      expect(isAllowedStorageHostname('evil.com')).toBe(false);
    });

    it('should reject domain that contains allowed domain as substring', () => {
      // "media.mizanly.app.evil.com" should NOT match
      expect(isAllowedStorageHostname('media.mizanly.app.evil.com')).toBe(false);
    });

    it('should reject localhost', () => {
      expect(isAllowedStorageHostname('localhost')).toBe(false);
    });

    it('should reject IP addresses', () => {
      expect(isAllowedStorageHostname('192.168.1.1')).toBe(false);
      expect(isAllowedStorageHostname('127.0.0.1')).toBe(false);
    });

    it('should pick up R2_PUBLIC_URL from env', () => {
      process.env.R2_PUBLIC_URL = 'https://custom-cdn.example.com';
      resetHostnameCache();
      expect(isAllowedStorageHostname('custom-cdn.example.com')).toBe(true);
      delete process.env.R2_PUBLIC_URL;
    });

    it('should handle malformed R2_PUBLIC_URL gracefully', () => {
      process.env.R2_PUBLIC_URL = 'not-a-url';
      resetHostnameCache();
      // Should still work with static list
      expect(isAllowedStorageHostname('media.mizanly.app')).toBe(true);
      expect(isAllowedStorageHostname('not-a-url')).toBe(false);
      delete process.env.R2_PUBLIC_URL;
    });
  });

  // ── Decorator validation via class-validator ──

  describe('@IsStorageUrl() decorator', () => {
    it('should pass for valid R2 URL', async () => {
      const dto = new TestDto();
      dto.url = 'https://media.mizanly.app/posts/user123/abc.jpg';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass for R2 storage URL', async () => {
      const dto = new TestDto();
      dto.url = 'https://abc123.r2.cloudflarestorage.com/bucket/key.jpg';
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail for HTTP (non-HTTPS)', async () => {
      const dto = new TestDto();
      dto.url = 'http://media.mizanly.app/posts/user123/abc.jpg';
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isStorageUrl');
    });

    it('should fail for external URL', async () => {
      const dto = new TestDto();
      dto.url = 'https://example.com/image.jpg';
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
    });

    it('should fail for non-string value', async () => {
      const dto = new TestDto();
      (dto as any).url = 12345;
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
    });

    it('should fail for invalid URL string', async () => {
      const dto = new TestDto();
      dto.url = 'not-a-url';
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
    });

    it('should fail for empty string', async () => {
      const dto = new TestDto();
      dto.url = '';
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
    });

    it('should include helpful error message', async () => {
      const dto = new TestDto();
      dto.url = 'https://evil.com/payload.jpg';
      const errors = await validate(dto);
      expect(errors[0].constraints?.isStorageUrl).toContain('application-owned storage');
    });
  });

  // ── Array validation (each: true) ──

  describe('@IsStorageUrl({ each: true })', () => {
    it('should pass when all URLs are valid storage URLs', async () => {
      const dto = new TestArrayDto();
      dto.urls = [
        'https://media.mizanly.app/posts/u1/a.jpg',
        'https://media.mizanly.app/posts/u1/b.jpg',
      ];
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should fail when any URL is external', async () => {
      const dto = new TestArrayDto();
      dto.urls = [
        'https://media.mizanly.app/posts/u1/a.jpg',
        'https://evil.com/payload.jpg',
      ];
      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
    });
  });

  // ── Static exports ──

  describe('exports', () => {
    it('should export STATIC_ALLOWED_HOSTNAMES', () => {
      expect(STATIC_ALLOWED_HOSTNAMES).toContain('media.mizanly.app');
    });

    it('should export ALLOWED_HOSTNAME_SUFFIXES', () => {
      expect(ALLOWED_HOSTNAME_SUFFIXES).toContain('.r2.cloudflarestorage.com');
      expect(ALLOWED_HOSTNAME_SUFFIXES).toContain('.r2.dev');
    });
  });
});
