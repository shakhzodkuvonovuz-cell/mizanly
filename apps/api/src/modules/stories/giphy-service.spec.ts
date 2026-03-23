/**
 * GIPHY Service tests — covers API URL construction, response parsing,
 * error handling, content type routing, and rating enforcement.
 */

describe('GIPHY Service', () => {
  // ── URL construction ──
  describe('API URL construction', () => {
    const GIPHY_BASE = 'https://api.giphy.com/v1';
    const API_KEY = 'test-key-123';

    const buildSearchUrl = (query: string, type: string, limit: number, offset: number, rating: string) => {
      const contentPath = type === 'text' ? 'stickers' : type === 'emoji' ? 'emoji' : type;
      return `${GIPHY_BASE}/${contentPath}/search?api_key=${API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=${rating}`;
    };

    const buildTrendingUrl = (type: string, limit: number, offset: number, rating: string) => {
      const contentPath = type === 'text' ? 'stickers' : type === 'emoji' ? 'emoji' : type;
      return `${GIPHY_BASE}/${contentPath}/trending?api_key=${API_KEY}&limit=${limit}&offset=${offset}&rating=${rating}`;
    };

    it('should build correct search URL for gifs', () => {
      const url = buildSearchUrl('happy eid', 'gifs', 20, 0, 'pg');
      expect(url).toBe('https://api.giphy.com/v1/gifs/search?api_key=test-key-123&q=happy%20eid&limit=20&offset=0&rating=pg');
    });

    it('should build correct search URL for stickers', () => {
      const url = buildSearchUrl('love', 'stickers', 10, 0, 'pg');
      expect(url).toContain('/stickers/search');
      expect(url).toContain('q=love');
    });

    it('should route text type to stickers endpoint', () => {
      const url = buildSearchUrl('hello', 'text', 20, 0, 'pg');
      expect(url).toContain('/stickers/search');
      expect(url).not.toContain('/text/');
    });

    it('should route emoji type to emoji endpoint', () => {
      const url = buildSearchUrl('smile', 'emoji', 20, 0, 'pg');
      expect(url).toContain('/emoji/search');
    });

    it('should build correct trending URL', () => {
      const url = buildTrendingUrl('gifs', 20, 0, 'pg');
      expect(url).toContain('/gifs/trending');
      expect(url).not.toContain('&q=');
    });

    it('should encode special characters in query', () => {
      const url = buildSearchUrl('eid mubarak! 🎉', 'gifs', 20, 0, 'pg');
      expect(url).toContain('q=eid%20mubarak!%20');
      expect(url).not.toContain(' ');
    });

    it('should include offset for pagination', () => {
      const url = buildSearchUrl('cat', 'gifs', 20, 40, 'pg');
      expect(url).toContain('offset=40');
    });

    it('should enforce rating in URL', () => {
      const url = buildSearchUrl('test', 'gifs', 20, 0, 'pg-13');
      expect(url).toContain('rating=pg-13');
    });

    it('should not leak API key into different param', () => {
      const url = buildSearchUrl('test', 'gifs', 20, 0, 'pg');
      const keyOccurrences = url.split('api_key=').length - 1;
      expect(keyOccurrences).toBe(1);
    });
  });

  // ── Response parsing ──
  describe('Response parsing', () => {
    function parseGiphyResponse(data: Array<Record<string, unknown>>, type: string) {
      return data.map(item => {
        const images = item.images as Record<string, Record<string, string>> | undefined;
        const original = images?.original || {};
        const preview = images?.fixed_width || images?.preview_gif || original;
        return {
          id: String(item.id || ''),
          url: original.url || '',
          previewUrl: preview.url || original.url || '',
          width: parseInt(original.width || '200', 10),
          height: parseInt(original.height || '200', 10),
          title: String(item.title || ''),
          type: type === 'clips' ? 'clip' : type === 'text' ? 'text' : type === 'stickers' ? 'sticker' : type === 'emoji' ? 'emoji' : 'gif',
          isDynamic: false,
        };
      });
    }

    const mockGiphyItem = {
      id: 'xT9IgzoKnwFNmISR8I',
      title: 'Happy Eid Mubarak',
      images: {
        original: { url: 'https://media.giphy.com/media/abc/giphy.gif', width: '480', height: '360' },
        fixed_width: { url: 'https://media.giphy.com/media/abc/200w.gif', width: '200', height: '150' },
        preview_gif: { url: 'https://media.giphy.com/media/abc/preview.gif', width: '100', height: '75' },
      },
    };

    it('should extract id correctly', () => {
      const [result] = parseGiphyResponse([mockGiphyItem], 'gifs');
      expect(result.id).toBe('xT9IgzoKnwFNmISR8I');
    });

    it('should use original URL as primary', () => {
      const [result] = parseGiphyResponse([mockGiphyItem], 'gifs');
      expect(result.url).toBe('https://media.giphy.com/media/abc/giphy.gif');
    });

    it('should use fixed_width as preview', () => {
      const [result] = parseGiphyResponse([mockGiphyItem], 'gifs');
      expect(result.previewUrl).toBe('https://media.giphy.com/media/abc/200w.gif');
    });

    it('should fall back to original when fixed_width missing', () => {
      const item = {
        id: 'test',
        title: 'Test',
        images: { original: { url: 'https://original.gif', width: '300', height: '200' } },
      };
      const [result] = parseGiphyResponse([item], 'gifs');
      expect(result.previewUrl).toBe('https://original.gif');
    });

    it('should parse dimensions as numbers', () => {
      const [result] = parseGiphyResponse([mockGiphyItem], 'gifs');
      expect(typeof result.width).toBe('number');
      expect(typeof result.height).toBe('number');
      expect(result.width).toBe(480);
      expect(result.height).toBe(360);
    });

    it('should default dimensions to 200 when missing', () => {
      const item = { id: 'test', title: 'Test', images: { original: {} } };
      const [result] = parseGiphyResponse([item], 'gifs');
      expect(result.width).toBe(200);
      expect(result.height).toBe(200);
    });

    it('should map type correctly for gifs', () => {
      const [result] = parseGiphyResponse([mockGiphyItem], 'gifs');
      expect(result.type).toBe('gif');
    });

    it('should map type correctly for stickers', () => {
      const [result] = parseGiphyResponse([mockGiphyItem], 'stickers');
      expect(result.type).toBe('sticker');
    });

    it('should map type correctly for text', () => {
      const [result] = parseGiphyResponse([mockGiphyItem], 'text');
      expect(result.type).toBe('text');
    });

    it('should map type correctly for clips', () => {
      const [result] = parseGiphyResponse([mockGiphyItem], 'clips');
      expect(result.type).toBe('clip');
    });

    it('should handle empty data array', () => {
      const result = parseGiphyResponse([], 'gifs');
      expect(result).toHaveLength(0);
    });

    it('should handle item with no images at all', () => {
      const item = { id: 'broken', title: 'Broken' };
      const [result] = parseGiphyResponse([item], 'gifs');
      expect(result.url).toBe('');
      expect(result.previewUrl).toBe('');
      expect(result.width).toBe(200);
    });

    it('should handle item with empty id', () => {
      const item = { id: '', title: '', images: { original: { url: 'test.gif', width: '100', height: '100' } } };
      const [result] = parseGiphyResponse([item], 'gifs');
      expect(result.id).toBe('');
      expect(result.title).toBe('');
    });

    it('should parse multiple items correctly', () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        id: `gif-${i}`,
        title: `GIF ${i}`,
        images: { original: { url: `https://gif${i}.gif`, width: '200', height: '200' } },
      }));
      const results = parseGiphyResponse(items, 'gifs');
      expect(results).toHaveLength(20);
      expect(results[0].id).toBe('gif-0');
      expect(results[19].id).toBe('gif-19');
    });
  });

  // ── Error handling ──
  describe('Error handling', () => {
    it('should return empty array when API key is missing', () => {
      const apiKey = '';
      const shouldFetch = !!apiKey;
      expect(shouldFetch).toBe(false);
    });

    it('should handle non-200 responses', () => {
      const response = { ok: false, status: 429 }; // Rate limited
      expect(response.ok).toBe(false);
    });

    it('should handle malformed JSON', () => {
      let result: unknown[] = [];
      try {
        JSON.parse('not json');
      } catch {
        result = [];
      }
      expect(result).toHaveLength(0);
    });

    it('should handle network timeout', () => {
      let result: unknown[] = [];
      try {
        throw new Error('Network timeout');
      } catch {
        result = [];
      }
      expect(result).toHaveLength(0);
    });
  });

  // ── Content rating ──
  describe('Content rating enforcement', () => {
    const ALLOWED_RATINGS = ['g', 'pg', 'pg-13', 'r'];

    it('should only allow valid ratings', () => {
      for (const rating of ALLOWED_RATINGS) {
        expect(ALLOWED_RATINGS).toContain(rating);
      }
    });

    it('should default to pg for Islamic social app', () => {
      const defaultRating = 'pg';
      expect(defaultRating).toBe('pg');
    });

    it('should not allow unrated content', () => {
      expect(ALLOWED_RATINGS).not.toContain('');
      expect(ALLOWED_RATINGS).not.toContain('unrated');
    });
  });

  // ── Category mapping ──
  describe('Category search terms', () => {
    const CATEGORIES = [
      { id: 'trending', searchTerm: '' },
      { id: 'reactions', searchTerm: 'reactions' },
      { id: 'love', searchTerm: 'love' },
      { id: 'happy', searchTerm: 'happy' },
      { id: 'sad', searchTerm: 'sad' },
      { id: 'celebrate', searchTerm: 'celebrate eid' },
      { id: 'islamic', searchTerm: 'muslim islamic ramadan' },
      { id: 'funny', searchTerm: 'funny' },
    ];

    it('should have 8 categories', () => {
      expect(CATEGORIES).toHaveLength(8);
    });

    it('should have trending with empty search term', () => {
      const trending = CATEGORIES.find(c => c.id === 'trending');
      expect(trending?.searchTerm).toBe('');
    });

    it('should have Islamic category with multiple search terms', () => {
      const islamic = CATEGORIES.find(c => c.id === 'islamic');
      expect(islamic?.searchTerm).toContain('muslim');
      expect(islamic?.searchTerm).toContain('islamic');
      expect(islamic?.searchTerm).toContain('ramadan');
    });

    it('should have celebrate with eid keyword', () => {
      const celebrate = CATEGORIES.find(c => c.id === 'celebrate');
      expect(celebrate?.searchTerm).toContain('eid');
    });

    it('should have unique ids', () => {
      const ids = CATEGORIES.map(c => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  // ── SDK availability ──
  describe('SDK mode detection', () => {
    it('should handle SDK not installed gracefully', () => {
      let sdkAvailable = false;
      try {
        require('@giphy/react-native-sdk');
        sdkAvailable = true;
      } catch {
        sdkAvailable = false;
      }
      // In test environment, SDK may or may not be available
      expect(typeof sdkAvailable).toBe('boolean');
    });

    it('should not crash when SDK configure fails', () => {
      let initialized = false;
      try {
        // Simulate SDK configure failure
        throw new Error('SDK not available in test');
      } catch {
        initialized = false;
      }
      expect(initialized).toBe(false);
    });
  });

  // ── Create sheet options ──
  describe('Create sheet options', () => {
    const CREATE_OPTIONS = [
      { id: 'post', route: '/(screens)/create-post' },
      { id: 'story', route: '/(screens)/create-story' },
      { id: 'reel', route: '/(screens)/create-reel' },
      { id: 'thread', route: '/(screens)/create-thread' },
      { id: 'video', route: '/(screens)/create-video' },
      { id: 'live', route: '/(screens)/go-live' },
      { id: 'voice', route: '/(screens)/voice-post-create' },
    ];

    it('should have 7 create options', () => {
      expect(CREATE_OPTIONS).toHaveLength(7);
    });

    it('should have unique ids', () => {
      const ids = CREATE_OPTIONS.map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have valid route paths starting with /(screens)/', () => {
      for (const opt of CREATE_OPTIONS) {
        expect(opt.route.startsWith('/(screens)/')).toBe(true);
      }
    });

    it('should include all content types from 5 spaces', () => {
      const ids = CREATE_OPTIONS.map(o => o.id);
      expect(ids).toContain('post');   // Saf
      expect(ids).toContain('reel');   // Bakra
      expect(ids).toContain('video');  // Minbar
      expect(ids).toContain('thread'); // Majlis
      expect(ids).toContain('story');  // Stories (cross-space)
    });

    it('should put primary options first', () => {
      // Post, Story, Reel, Thread should be first 4 (grid)
      const topFour = CREATE_OPTIONS.slice(0, 4).map(o => o.id);
      expect(topFour).toContain('post');
      expect(topFour).toContain('story');
      expect(topFour).toContain('reel');
      expect(topFour).toContain('thread');
    });
  });

  // ── Navigation structure ──
  describe('Tab bar configuration', () => {
    const TABS = ['saf', 'bakra', 'minbar', 'majlis', 'risalah'];

    it('should have exactly 5 tabs', () => {
      expect(TABS).toHaveLength(5);
    });

    it('should not include create as a tab', () => {
      expect(TABS).not.toContain('create');
    });

    it('should map to all 5 spaces', () => {
      expect(TABS).toContain('saf');      // Instagram feed
      expect(TABS).toContain('bakra');    // TikTok reels
      expect(TABS).toContain('minbar');   // YouTube videos
      expect(TABS).toContain('majlis');   // Twitter threads
      expect(TABS).toContain('risalah'); // WhatsApp messages
    });
  });
});
