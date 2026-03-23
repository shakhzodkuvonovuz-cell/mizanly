import { getImageUrl, getResponsiveImageUrls, IMAGE_PRESETS } from './image';

describe('getImageUrl', () => {
  const baseUrl = 'https://media.mizanly.app/posts/user123/abc.jpg';

  describe('basic transformation', () => {
    it('should insert CDN transform params after domain', () => {
      const result = getImageUrl(baseUrl, { width: 400 });
      expect(result).toBe('https://media.mizanly.app/cdn-cgi/image/width=400/posts/user123/abc.jpg');
    });

    it('should support width and height', () => {
      const result = getImageUrl(baseUrl, { width: 400, height: 300 });
      expect(result).toContain('width=400');
      expect(result).toContain('height=300');
    });

    it('should support quality', () => {
      const result = getImageUrl(baseUrl, { quality: 80 });
      expect(result).toContain('quality=80');
    });

    it('should support format', () => {
      const result = getImageUrl(baseUrl, { format: 'webp' });
      expect(result).toContain('format=webp');
    });

    it('should support fit', () => {
      const result = getImageUrl(baseUrl, { fit: 'cover' });
      expect(result).toContain('fit=cover');
    });

    it('should support gravity', () => {
      const result = getImageUrl(baseUrl, { gravity: 'auto' });
      expect(result).toContain('gravity=auto');
    });

    it('should combine multiple params with commas', () => {
      const result = getImageUrl(baseUrl, { width: 400, quality: 80, format: 'webp' });
      expect(result).toContain('width=400,quality=80,format=webp');
    });
  });

  describe('edge cases', () => {
    it('should return empty string for empty URL', () => {
      expect(getImageUrl('', { width: 400 })).toBe('');
    });

    it('should return original URL for non-image files', () => {
      const videoUrl = 'https://media.mizanly.app/videos/test.mp4';
      expect(getImageUrl(videoUrl, { width: 400 })).toBe(videoUrl);
    });

    it('should not double-transform already-transformed URLs', () => {
      const transformed = 'https://media.mizanly.app/cdn-cgi/image/width=200/posts/abc.jpg';
      expect(getImageUrl(transformed, { width: 400 })).toBe(transformed);
    });

    it('should return original URL when no options have values', () => {
      expect(getImageUrl(baseUrl, {})).toBe(baseUrl);
    });

    it('should handle invalid URL gracefully', () => {
      const result = getImageUrl('not-a-url.jpg', { width: 400 });
      // Should return the original since URL parsing fails
      expect(result).toBe('not-a-url.jpg');
    });
  });

  describe('image extension detection', () => {
    it('should transform .jpg files', () => {
      expect(getImageUrl('https://cdn.test.com/photo.jpg', { width: 100 })).toContain('cdn-cgi');
    });

    it('should transform .jpeg files', () => {
      expect(getImageUrl('https://cdn.test.com/photo.jpeg', { width: 100 })).toContain('cdn-cgi');
    });

    it('should transform .png files', () => {
      expect(getImageUrl('https://cdn.test.com/photo.png', { width: 100 })).toContain('cdn-cgi');
    });

    it('should transform .gif files', () => {
      expect(getImageUrl('https://cdn.test.com/photo.gif', { width: 100 })).toContain('cdn-cgi');
    });

    it('should transform .webp files', () => {
      expect(getImageUrl('https://cdn.test.com/photo.webp', { width: 100 })).toContain('cdn-cgi');
    });

    it('should transform .avif files', () => {
      expect(getImageUrl('https://cdn.test.com/photo.avif', { width: 100 })).toContain('cdn-cgi');
    });

    it('should NOT transform .mp4 files', () => {
      expect(getImageUrl('https://cdn.test.com/video.mp4', { width: 100 })).not.toContain('cdn-cgi');
    });

    it('should NOT transform .pdf files', () => {
      expect(getImageUrl('https://cdn.test.com/doc.pdf', { width: 100 })).not.toContain('cdn-cgi');
    });
  });
});

describe('IMAGE_PRESETS', () => {
  it('should have all expected presets', () => {
    expect(IMAGE_PRESETS.avatarSm).toBeDefined();
    expect(IMAGE_PRESETS.avatarMd).toBeDefined();
    expect(IMAGE_PRESETS.avatarLg).toBeDefined();
    expect(IMAGE_PRESETS.thumbnail).toBeDefined();
    expect(IMAGE_PRESETS.feedCard).toBeDefined();
    expect(IMAGE_PRESETS.feedFull).toBeDefined();
    expect(IMAGE_PRESETS.coverSm).toBeDefined();
    expect(IMAGE_PRESETS.coverLg).toBeDefined();
    expect(IMAGE_PRESETS.videoThumb).toBeDefined();
    expect(IMAGE_PRESETS.videoThumbLg).toBeDefined();
    expect(IMAGE_PRESETS.blurPlaceholder).toBeDefined();
  });

  it('should use webp format for all presets', () => {
    Object.values(IMAGE_PRESETS).forEach(preset => {
      expect(preset.format).toBe('webp');
    });
  });

  it('should have avatar sizes as squares', () => {
    expect(IMAGE_PRESETS.avatarSm.width).toBe(IMAGE_PRESETS.avatarSm.height);
    expect(IMAGE_PRESETS.avatarMd.width).toBe(IMAGE_PRESETS.avatarMd.height);
    expect(IMAGE_PRESETS.avatarLg.width).toBe(IMAGE_PRESETS.avatarLg.height);
  });

  it('should have blur placeholder as tiny for base64 inlining', () => {
    expect(IMAGE_PRESETS.blurPlaceholder.width).toBeLessThanOrEqual(20);
    expect(IMAGE_PRESETS.blurPlaceholder.quality).toBeLessThanOrEqual(20);
  });

  it('should increase quality for larger sizes', () => {
    expect(IMAGE_PRESETS.thumbnail.quality).toBeLessThan(IMAGE_PRESETS.feedFull.quality!);
  });
});

describe('getResponsiveImageUrls', () => {
  const original = 'https://media.mizanly.app/posts/abc.jpg';

  it('should return all original URLs when CF resizing is disabled', () => {
    delete process.env.CF_IMAGE_RESIZING_ENABLED;
    const result = getResponsiveImageUrls(original);
    expect(result.thumbnail).toBe(original);
    expect(result.small).toBe(original);
    expect(result.medium).toBe(original);
    expect(result.large).toBe(original);
    expect(result.original).toBe(original);
  });

  it('should return transformed URLs when CF resizing is enabled', () => {
    process.env.CF_IMAGE_RESIZING_ENABLED = 'true';
    const result = getResponsiveImageUrls(original);
    expect(result.thumbnail).toContain('cdn-cgi/image');
    expect(result.small).toContain('cdn-cgi/image');
    expect(result.medium).toContain('cdn-cgi/image');
    expect(result.large).toContain('cdn-cgi/image');
    expect(result.original).toBe(original);
    delete process.env.CF_IMAGE_RESIZING_ENABLED;
  });

  it('should always return original URL unchanged', () => {
    process.env.CF_IMAGE_RESIZING_ENABLED = 'true';
    const result = getResponsiveImageUrls(original);
    expect(result.original).toBe(original);
    delete process.env.CF_IMAGE_RESIZING_ENABLED;
  });
});
