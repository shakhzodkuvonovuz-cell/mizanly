/**
 * Sanitizes user-generated text by:
 * - Stripping HTML tags (prevent stored XSS)
 * - Trimming whitespace
 * - Collapsing multiple newlines to max 2
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '') // Strip HTML
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}