// Static list of prohibited terms (slurs, spam patterns, etc.)
// Categories: hate_speech, spam, nsfw_text, harassment, self_harm
// Returns: { flagged: boolean, categories: string[], severity: 'low'|'medium'|'high', matches: string[] }

export interface TextCheckResult {
  flagged: boolean;
  categories: string[];
  severity: 'low' | 'medium' | 'high';
  matches: string[];
}

const PROHIBITED_PATTERNS: { pattern: RegExp; category: string; severity: 'low' | 'medium' | 'high' }[] = [
  // Hate speech patterns
  { pattern: /\b(racial_slur_placeholder)\b/i, category: 'hate_speech', severity: 'high' },
  { pattern: /\b(ethnic_slur_placeholder)\b/i, category: 'hate_speech', severity: 'high' },
  { pattern: /\b(religious_slur_placeholder)\b/i, category: 'hate_speech', severity: 'high' },
  // Spam patterns (repeated chars, known spam phrases)
  { pattern: /(.)\1{10,}/, category: 'spam', severity: 'low' }, // repeated character 10+ times
  { pattern: /\b(buy\s+followers|cheap\s+likes|instagram\s+growth)\b/i, category: 'spam', severity: 'medium' },
  { pattern: /(http|https):\/\/[^\s]+/g, category: 'spam', severity: 'low' }, // URLs
  // NSFW text patterns
  { pattern: /\b(explicit_word_placeholder)\b/i, category: 'nsfw_text', severity: 'high' },
  // Harassment patterns
  { pattern: /\b(kill\s+yourself|die\s+in\s+a\s+hole)\b/i, category: 'harassment', severity: 'high' },
  // Self-harm patterns
  { pattern: /\b(self\s*harm|suicide|cutting\s+myself)\b/i, category: 'self_harm', severity: 'high' },
];

export function checkText(text: string): TextCheckResult {
  const matches: string[] = [];
  const categoriesSet = new Set<string>();
  let maxSeverity: 'low' | 'medium' | 'high' = 'low';

  const severityWeight = { low: 1, medium: 2, high: 3 };

  for (const { pattern, category, severity } of PROHIBITED_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matches.push(...match);
      categoriesSet.add(category);
      if (severityWeight[severity] > severityWeight[maxSeverity]) {
        maxSeverity = severity;
      }
    }
  }

  return {
    flagged: matches.length > 0,
    categories: Array.from(categoriesSet),
    severity: maxSeverity,
    matches,
  };
}