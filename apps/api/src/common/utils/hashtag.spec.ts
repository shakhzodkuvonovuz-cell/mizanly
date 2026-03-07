import { extractHashtags } from './hashtag';

describe('extractHashtags', () => {
  it('returns empty array for empty string', () => {
    expect(extractHashtags('')).toEqual([]);
  });

  it('returns empty array when no hashtags present', () => {
    expect(extractHashtags('Hello world')).toEqual([]);
    expect(extractHashtags('This is a test @mention')).toEqual([]);
    expect(extractHashtags('Text with # but no tag')).toEqual([]);
  });

  it('extracts single hashtag', () => {
    expect(extractHashtags('#hello')).toEqual(['hello']);
    expect(extractHashtags('Text #hello world')).toEqual(['hello']);
    expect(extractHashtags('#hello world')).toEqual(['hello']);
  });

  it('extracts multiple hashtags', () => {
    expect(extractHashtags('#hello #world')).toEqual(['hello', 'world']);
    expect(extractHashtags('Text #hello middle #world end')).toEqual(['hello', 'world']);
  });

  it('converts hashtags to lowercase', () => {
    expect(extractHashtags('#Hello')).toEqual(['hello']);
    expect(extractHashtags('#HELLO')).toEqual(['hello']);
    expect(extractHashtags('#HeLLo')).toEqual(['hello']);
  });

  it('removes duplicates', () => {
    expect(extractHashtags('#hello #world #hello')).toEqual(['hello', 'world']);
    expect(extractHashtags('#test #test #test')).toEqual(['test']);
  });

  it('supports underscores and numbers', () => {
    expect(extractHashtags('#hello_world')).toEqual(['hello_world']);
    expect(extractHashtags('#test123')).toEqual(['test123']);
    expect(extractHashtags('#123')).toEqual(['123']);
  });

  it('supports Arabic characters', () => {
    expect(extractHashtags('#مرحبا')).toEqual(['مرحبا']);
    expect(extractHashtags('#سلام_علیکم')).toEqual(['سلام_علیکم']);
    expect(extractHashtags('#test_عربی')).toEqual(['test_عربی']);
  });

  it('ignores invalid characters after hashtag', () => {
    // Only matches up to invalid character
    expect(extractHashtags('#hello-world')).toEqual(['hello']);
    expect(extractHashtags('#hello.world')).toEqual(['hello']);
    expect(extractHashtags('#hello!')).toEqual(['hello']);
  });

  it('handles mixed content with special characters', () => {
    expect(extractHashtags('Check out #mizanly! It\'s awesome. #socialmedia')).toEqual(['mizanly', 'socialmedia']);
  });
});