/**
 * Sanitizes user-generated text by:
 * - Stripping null bytes
 * - Stripping control characters (keeping \n \r \t)
 * - Stripping HTML tags (prevent stored XSS)
 * - Trimming whitespace
 * - Collapsing multiple newlines to max 2
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/\0/g, '')                              // Strip null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, '')  // Strip control chars (keep \n \r \t)
    .replace(/<[^>]*>/g, '')                          // Strip complete HTML tags
    .replace(/<[a-zA-Z/!][^>]*/g, '')                // Strip unclosed/partial HTML tags (XSS prevention)
    .replace(/\n{3,}/g, '\n\n')                       // Max 2 consecutive newlines
    .trim();
}
