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
  { pattern: /\b(n[i1]gg[ae3]r?s?|f[a4]gg?[o0]ts?|k[i1]ke|sp[i1]c|ch[i1]nk|w[e3]tb[a4]ck)\b/i, category: 'hate_speech', severity: 'high' },
  { pattern: /\b(white\s*suprema|heil\s*hitler|sieg\s*heil|1488|14\s*words)\b/i, category: 'hate_speech', severity: 'high' },
  { pattern: /\b(k[a4]fir|murtad|takfir)\b/i, category: 'hate_speech', severity: 'medium' },
  // Spam patterns (repeated chars, known spam phrases)
  { pattern: /(.)\1{10,}/, category: 'spam', severity: 'low' }, // repeated character 10+ times
  { pattern: /\b(buy\s+followers|cheap\s+likes|instagram\s+growth|free\s+money|click\s+here)\b/i, category: 'spam', severity: 'medium' },
  // URLs not flagged as spam — legitimate link sharing is a core social feature
  // NSFW text patterns
  { pattern: /\b(p[o0]rn|h[e3]nt[a4]i|xxx|nsfw|n[u0]d[e3]s|s[e3]xt[i1]ng)\b/i, category: 'nsfw_text', severity: 'high' },
  { pattern: /\b(f[u\*]ck|sh[i1\*]t|c[u\*]nt|d[i1]ck|p[u\*]ssy|c[o0]ck)\b/i, category: 'nsfw_text', severity: 'medium' },
  // Harassment patterns
  { pattern: /\b(kill\s+yourself|die\s+in\s+a\s+hole|hope\s+you\s+die|kys)\b/i, category: 'harassment', severity: 'high' },
  { pattern: /\b(i('ll|m\s+going\s+to)\s+(kill|murder|hurt)\s+you)\b/i, category: 'harassment', severity: 'high' },
  // Self-harm patterns
  { pattern: /\b(self[\s-]*harm|suicid[ae]l?|cutting\s+myself|want\s+to\s+die|end\s+my\s+life)\b/i, category: 'self_harm', severity: 'high' },
  // Terrorism/extremism patterns
  { pattern: /\b(jihad\s+against|caliphate|martyrdom\s+operation|lone\s+wolf\s+attack)\b/i, category: 'terrorism', severity: 'high' },
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
