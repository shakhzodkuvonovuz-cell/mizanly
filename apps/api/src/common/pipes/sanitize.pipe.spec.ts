import { SanitizePipe } from './sanitize.pipe';
import { ArgumentMetadata } from '@nestjs/common';

describe('SanitizePipe', () => {
  let pipe: SanitizePipe;

  beforeEach(() => {
    pipe = new SanitizePipe();
  });

  const bodyMeta: ArgumentMetadata = { type: 'body', metatype: Object, data: '' };
  const queryMeta: ArgumentMetadata = { type: 'query', metatype: Object, data: '' };
  const paramMeta: ArgumentMetadata = { type: 'param', metatype: String, data: 'id' };
  const customMeta: ArgumentMetadata = { type: 'custom', metatype: Object, data: '' };

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  describe('body sanitization', () => {
    it('should sanitize string fields in body object', () => {
      const input = { name: '<script>alert("xss")</script>Hello', bio: 'Normal text' };
      const result = pipe.transform(input, bodyMeta) as Record<string, unknown>;

      expect(result.name).toBe('alert("xss")Hello');
      expect(result.bio).toBe('Normal text');
    });

    it('should strip null bytes from strings', () => {
      const input = { text: 'hello\0world' };
      const result = pipe.transform(input, bodyMeta) as Record<string, unknown>;

      expect(result.text).toBe('helloworld');
    });

    it('should strip control characters but keep newlines and tabs', () => {
      const input = { text: 'line1\nline2\ttab\x01control' };
      const result = pipe.transform(input, bodyMeta) as Record<string, unknown>;

      // \x01 stripped, but the text after it remains
      expect(result.text).toBe('line1\nline2\ttabcontrol');
    });

    it('should collapse multiple newlines to max 2', () => {
      const input = { text: 'line1\n\n\n\n\nline2' };
      const result = pipe.transform(input, bodyMeta) as Record<string, unknown>;

      expect(result.text).toBe('line1\n\nline2');
    });

    it('should preserve non-string values unchanged', () => {
      const input = { count: 42, active: true, date: new Date('2026-01-01') };
      const result = pipe.transform(input, bodyMeta) as Record<string, unknown>;

      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.date).toBeInstanceOf(Date);
    });

    it('should sanitize strings inside arrays', () => {
      const input = { tags: ['<b>bold</b>', 'normal', '<img src=x onerror=alert(1)>'] };
      const result = pipe.transform(input, bodyMeta) as Record<string, unknown>;

      expect((result.tags as string[])[0]).toBe('bold');
      expect((result.tags as string[])[1]).toBe('normal');
      expect((result.tags as string[])[2]).toBe('');
    });

    it('should recursively sanitize nested objects', () => {
      const input = {
        user: {
          name: '<script>xss</script>Ahmad',
          nested: {
            bio: '<h1>Title</h1>Content',
          },
        },
      };
      const result = pipe.transform(input, bodyMeta) as any;

      expect(result.user.name).toBe('xssAhmad');
      expect(result.user.nested.bio).toBe('TitleContent');
    });

    it('should handle nested objects inside arrays', () => {
      const input = { items: [{ title: '<b>Bold</b>' }, { title: 'Plain' }] };
      const result = pipe.transform(input, bodyMeta) as any;

      expect(result.items[0].title).toBe('Bold');
      expect(result.items[1].title).toBe('Plain');
    });

    it('should preserve non-string items in arrays', () => {
      const input = { values: [1, true, null, 'text<br>here'] };
      const result = pipe.transform(input, bodyMeta) as any;

      expect(result.values[0]).toBe(1);
      expect(result.values[1]).toBe(true);
      expect(result.values[2]).toBe(null);
      expect(result.values[3]).toBe('texthere');
    });
  });

  describe('query sanitization', () => {
    it('should sanitize query object strings', () => {
      const input = { search: '<script>xss</script>cats' };
      const result = pipe.transform(input, queryMeta) as Record<string, unknown>;

      expect(result.search).toBe('xsscats');
    });
  });

  describe('param sanitization', () => {
    it('should sanitize string param values directly', () => {
      const result = pipe.transform('<b>test</b>', paramMeta);

      expect(result).toBe('test');
    });

    it('should pass through non-string param values', () => {
      const result = pipe.transform(123, paramMeta);
      expect(result).toBe(123);
    });
  });

  describe('passthrough cases', () => {
    it('should pass through non-object body values', () => {
      expect(pipe.transform('raw string', bodyMeta)).toBe('raw string');
      expect(pipe.transform(42, bodyMeta)).toBe(42);
      expect(pipe.transform(null, bodyMeta)).toBe(null);
    });

    it('should pass through custom metadata type', () => {
      const input = '<script>alert("xss")</script>';
      expect(pipe.transform(input, customMeta)).toBe(input);
    });
  });

  describe('edge cases', () => {
    it('should handle empty object', () => {
      const result = pipe.transform({}, bodyMeta);
      expect(result).toEqual({});
    });

    it('should handle empty string values', () => {
      const input = { name: '', bio: '' };
      const result = pipe.transform(input, bodyMeta) as Record<string, unknown>;

      expect(result.name).toBe('');
      expect(result.bio).toBe('');
    });

    it('should strip unclosed HTML tags', () => {
      const input = { text: 'before<script src="evil.js" after' };
      const result = pipe.transform(input, bodyMeta) as Record<string, unknown>;

      expect(result.text).toBe('before');
    });
  });
});
