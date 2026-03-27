import { sanitizeText } from './sanitize';

describe('sanitizeText', () => {
  describe('null byte stripping', () => {
    it('should strip null bytes from text', () => {
      expect(sanitizeText('hello\0world')).toBe('helloworld');
    });

    it('should strip multiple null bytes', () => {
      expect(sanitizeText('\0\0hello\0\0')).toBe('hello');
    });
  });

  describe('control character stripping', () => {
    it('should strip ASCII control chars 0x01-0x08', () => {
      expect(sanitizeText('a\x01b\x02c\x08d')).toBe('abcd');
    });

    it('should strip 0x0B (vertical tab)', () => {
      expect(sanitizeText('a\x0Bb')).toBe('ab');
    });

    it('should strip 0x0C (form feed)', () => {
      expect(sanitizeText('a\x0Cb')).toBe('ab');
    });

    it('should strip 0x0E-0x1F', () => {
      expect(sanitizeText('a\x0Eb\x1Fc')).toBe('abc');
    });

    it('should preserve newlines (0x0A)', () => {
      expect(sanitizeText('line1\nline2')).toBe('line1\nline2');
    });

    it('should preserve carriage return (0x0D)', () => {
      expect(sanitizeText('line1\rline2')).toBe('line1\rline2');
    });

    it('should preserve tabs (0x09)', () => {
      expect(sanitizeText('col1\tcol2')).toBe('col1\tcol2');
    });
  });

  describe('HTML stripping', () => {
    it('should strip basic HTML tags', () => {
      expect(sanitizeText('<b>bold</b>')).toBe('bold');
    });

    it('should strip script tags (XSS prevention)', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe('alert("xss")');
    });

    it('should strip img tags with onerror (XSS)', () => {
      expect(sanitizeText('<img src=x onerror=alert(1)>')).toBe('');
    });

    it('should strip nested HTML tags', () => {
      expect(sanitizeText('<div><p>hello</p></div>')).toBe('hello');
    });

    it('should strip self-closing tags', () => {
      expect(sanitizeText('text<br/>more')).toBe('textmore');
    });

    it('should strip tags with attributes', () => {
      expect(sanitizeText('<a href="http://evil.com" onclick="steal()">link</a>')).toBe('link');
    });

    it('should handle angle brackets that are not HTML tags', () => {
      expect(sanitizeText('5 > 3 and 2 < 4')).toBe('5 > 3 and 2 < 4');
    });

    it('should strip svg tags', () => {
      expect(sanitizeText('<svg onload=alert(1)></svg>')).toBe('');
    });

    it('should strip iframe tags', () => {
      expect(sanitizeText('<iframe src="evil.com"></iframe>')).toBe('');
    });

    it('should handle encoded HTML entities', () => {
      expect(sanitizeText('&lt;script&gt;')).toBe('&lt;script&gt;');
    });

    it('should strip unclosed/partial HTML tags (XSS prevention)', () => {
      expect(sanitizeText('<script>alert(1)')).toBe('alert(1)');
      expect(sanitizeText('<img src=x onerror=alert(1)')).toBe('');
      expect(sanitizeText('text<iframe src=evil')).toBe('text');
      expect(sanitizeText('hello</script')).toBe('hello');
    });
  });

  describe('newline collapsing', () => {
    it('should collapse 3+ newlines to 2', () => {
      expect(sanitizeText('a\n\n\nb')).toBe('a\n\nb');
    });

    it('should collapse 5 newlines to 2', () => {
      expect(sanitizeText('a\n\n\n\n\nb')).toBe('a\n\nb');
    });

    it('should preserve exactly 2 newlines', () => {
      expect(sanitizeText('a\n\nb')).toBe('a\n\nb');
    });

    it('should preserve single newline', () => {
      expect(sanitizeText('a\nb')).toBe('a\nb');
    });
  });

  describe('trimming', () => {
    it('should trim leading whitespace', () => {
      expect(sanitizeText('  hello')).toBe('hello');
    });

    it('should trim trailing whitespace', () => {
      expect(sanitizeText('hello  ')).toBe('hello');
    });

    it('should trim both sides', () => {
      expect(sanitizeText('  hello  ')).toBe('hello');
    });
  });

  describe('combined operations', () => {
    it('should handle XSS with control chars', () => {
      expect(sanitizeText('\x01<script>\x02alert(1)\x03</script>\x04')).toBe('alert(1)');
    });

    it('should handle empty string', () => {
      expect(sanitizeText('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(sanitizeText('   \n\n\n  ')).toBe('');
    });

    it('should handle normal text unchanged', () => {
      const text = 'Assalamu Alaikum! 🕌 Beautiful day. #mizanly @user123';
      expect(sanitizeText(text)).toBe(text);
    });

    it('should handle Arabic text', () => {
      expect(sanitizeText('بسم الله الرحمن الرحيم')).toBe('بسم الله الرحمن الرحيم');
    });

    it('should handle emoji', () => {
      expect(sanitizeText('hello 🌙🕌')).toBe('hello 🌙🕌');
    });

    it('should handle realistic bio with mixed content', () => {
      const bio = '  <b>Muslim Developer</b>\n\n\nBuilding for the Ummah 🌍\n\n\n\nFollow me!  ';
      expect(sanitizeText(bio)).toBe('Muslim Developer\n\nBuilding for the Ummah 🌍\n\nFollow me!');
    });
  });
});
