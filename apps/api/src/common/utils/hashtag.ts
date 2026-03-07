/**
 * Extracts hashtag names from content text.
 * Supports Latin alphanumeric, underscores, and Arabic characters.
 */
const HASHTAG_REGEX = /#([a-zA-Z0-9_\u0600-\u06FF]+)/g;

export function extractHashtags(content: string): string[] {
  const matches = content.match(HASHTAG_REGEX);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
}