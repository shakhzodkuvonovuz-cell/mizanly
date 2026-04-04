import { checkText, TextCheckResult } from './word-filter';

describe('word-filter', () => {
  describe('checkText', () => {
    describe('clean text', () => {
      it('should not flag normal text', () => {
        const result = checkText('Hello, how are you today?');
        expect(result.flagged).toBe(false);
        expect(result.categories).toHaveLength(0);
        expect(result.matches).toHaveLength(0);
      });

      it('should not flag empty string', () => {
        const result = checkText('');
        expect(result.flagged).toBe(false);
        expect(result.categories).toHaveLength(0);
      });

      it('should not flag Arabic text', () => {
        const result = checkText('بسم الله الرحمن الرحيم');
        expect(result.flagged).toBe(false);
      });

      it('should not flag URLs (legitimate link sharing)', () => {
        const result = checkText('Check out https://example.com/article');
        expect(result.flagged).toBe(false);
      });

      it('should not flag normal conversation', () => {
        const result = checkText('I really liked this post about cooking');
        expect(result.flagged).toBe(false);
      });
    });

    describe('hate speech detection', () => {
      it('should flag racial slurs with high severity', () => {
        const result = checkText('You are a n1gger');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('hate_speech');
        expect(result.severity).toBe('high');
      });

      it('should flag white supremacist phrases', () => {
        const result = checkText('heil hitler is wrong');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('hate_speech');
        expect(result.severity).toBe('high');
      });

      it('should flag 1488 as hate speech', () => {
        const result = checkText('1488 forever');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('hate_speech');
      });

      it('should flag takfiri language with medium severity', () => {
        const result = checkText('He is a kafir and murtad');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('hate_speech');
        expect(result.severity).toBe('medium');
      });
    });

    describe('spam detection', () => {
      it('should flag repeated characters (10+)', () => {
        const result = checkText('hellooooooooooo');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('spam');
        expect(result.severity).toBe('low');
      });

      it('should not flag fewer than 10 repeated characters', () => {
        const result = checkText('hellooooo');
        expect(result.flagged).toBe(false);
      });

      it('should flag known spam phrases', () => {
        const result = checkText('buy followers now');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('spam');
        expect(result.severity).toBe('medium');
      });

      it('should flag instagram growth spam', () => {
        const result = checkText('try our instagram growth service');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('spam');
      });
    });

    describe('NSFW text detection', () => {
      it('should flag explicit NSFW terms with high severity', () => {
        const result = checkText('sending nudes');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('nsfw_text');
        expect(result.severity).toBe('high');
      });

      it('should flag profanity with medium severity', () => {
        const result = checkText('what the fuck');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('nsfw_text');
        expect(result.severity).toBe('medium');
      });

      it('should detect leet speak variants', () => {
        const result = checkText('p0rn site');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('nsfw_text');
      });
    });

    describe('harassment detection', () => {
      it('should flag death threats with high severity', () => {
        const result = checkText('kill yourself right now');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('harassment');
        expect(result.severity).toBe('high');
      });

      it('should flag KYS abbreviation', () => {
        const result = checkText('just kys already');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('harassment');
      });

      it('should flag violent threats', () => {
        const result = checkText("i'll kill you");
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('harassment');
        expect(result.severity).toBe('high');
      });
    });

    describe('self-harm detection', () => {
      it('should flag self-harm language with high severity', () => {
        const result = checkText('I want to end my life');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('self_harm');
        expect(result.severity).toBe('high');
      });

      it('should flag cutting references', () => {
        const result = checkText('I have been cutting myself');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('self_harm');
      });

      it('should flag suicidal ideation', () => {
        const result = checkText('I feel suicidal today');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('self_harm');
      });
    });

    describe('bullying detection', () => {
      it('should flag direct insults with medium severity', () => {
        const result = checkText("you're ugly and stupid");
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('bullying');
        expect(result.severity).toBe('medium');
      });

      it('should flag social exclusion language', () => {
        const result = checkText('nobody likes you');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('bullying');
      });

      it('should flag dismissive terms with low severity', () => {
        const result = checkText('such an attention seeker');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('bullying');
        expect(result.severity).toBe('low');
      });
    });

    describe('terrorism detection', () => {
      it('should flag extremist language with high severity', () => {
        const result = checkText('jihad against the west');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('terrorism');
        expect(result.severity).toBe('high');
      });

      it('should flag attack planning language', () => {
        const result = checkText('lone wolf attack planned');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('terrorism');
      });
    });

    describe('severity escalation', () => {
      it('should return highest severity when multiple categories match', () => {
        // Text that triggers both low (spam) and high (harassment) severity
        const result = checkText('kill yourself aaaaaaaaaaaaa');
        expect(result.flagged).toBe(true);
        expect(result.severity).toBe('high');
        expect(result.categories.length).toBeGreaterThanOrEqual(2);
      });

      it('should return low when only low-severity matches', () => {
        const result = checkText('aaaaaaaaaaaaa');
        expect(result.flagged).toBe(true);
        expect(result.severity).toBe('low');
      });
    });

    describe('result structure', () => {
      it('should return correct TextCheckResult shape for clean text', () => {
        const result: TextCheckResult = checkText('clean text');
        expect(result).toHaveProperty('flagged');
        expect(result).toHaveProperty('categories');
        expect(result).toHaveProperty('severity');
        expect(result).toHaveProperty('matches');
        expect(typeof result.flagged).toBe('boolean');
        expect(Array.isArray(result.categories)).toBe(true);
        expect(Array.isArray(result.matches)).toBe(true);
      });

      it('should return correct TextCheckResult shape for flagged text', () => {
        const result: TextCheckResult = checkText('kill yourself');
        expect(result.flagged).toBe(true);
        expect(result.matches.length).toBeGreaterThan(0);
        expect(result.categories.length).toBeGreaterThan(0);
        expect(['low', 'medium', 'high']).toContain(result.severity);
      });

      it('should deduplicate categories', () => {
        // Multiple hate speech patterns in one text should only list hate_speech once
        const result = checkText('heil hitler 1488');
        expect(result.flagged).toBe(true);
        const uniqueCategories = new Set(result.categories);
        expect(result.categories.length).toBe(uniqueCategories.size);
      });
    });

    describe('case insensitivity', () => {
      it('should detect uppercase variants', () => {
        const result = checkText('KILL YOURSELF');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('harassment');
      });

      it('should detect mixed case', () => {
        const result = checkText('KiLl YoUrSeLf');
        expect(result.flagged).toBe(true);
        expect(result.categories).toContain('harassment');
      });
    });
  });
});
