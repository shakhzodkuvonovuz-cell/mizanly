// ── App Constants ──
export const APP_NAME = 'Mizanly';
export const APP_NAME_AR = 'ميزانلي';
export const APP_TAGLINE = 'Your voice. Your balance.';

// ── Limits ──
export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 30,
  DISPLAY_NAME_MAX: 50,
  BIO_MAX: 160,
  POST_CAPTION_MAX: 2200,
  THREAD_CONTENT_MAX: 500,
  COMMENT_MAX: 500,
  POLL_QUESTION_MAX: 300,
  POLL_OPTION_MAX: 100,
  CIRCLE_NAME_MAX: 30,
  CAROUSEL_MAX_IMAGES: 10,
  THREAD_MEDIA_MAX: 4,
  POLL_OPTIONS_MIN: 2,
  POLL_OPTIONS_MAX: 4,
  GROUP_MEMBERS_MAX: 256,
  REEL_MIN_SECONDS: 15,
  REEL_MAX_SECONDS: 180,
  VIDEO_DM_MAX_SECONDS: 300,
  VIDEO_GROUP_MAX_SECONDS: 180,
  STORY_DURATION_DEFAULT: 5,
  STORY_EXPIRY_HOURS: 24,
} as const;

// ── Spaces ──
export const SPACES = {
  SAF: { key: 'saf', nameEn: 'Saf', nameAr: 'الصف', description: 'Photo & Stories Feed' },
  BAKRA: { key: 'bakra', nameEn: 'Bakra', nameAr: 'بكرة', description: 'Short Video' },
  MAJLIS: { key: 'majlis', nameEn: 'Majlis', nameAr: 'المجلس', description: 'Text & Discussion' },
  RISALAH: { key: 'risalah', nameEn: 'Risalah', nameAr: 'رسالة', description: 'Messaging' },
  MINBAR: { key: 'minbar', nameEn: 'Minbar', nameAr: 'المنبر', description: 'Long Video' },
} as const;

// ── Interest Categories ──
export const INTEREST_CATEGORIES = [
  'Islamic Education', 'Quran', 'Hadith', 'Lifestyle', 'Technology',
  'Sports', 'Cooking', 'Travel', 'Art', 'Business', 'Fitness', 'Fashion',
] as const;

// ── Supported Languages ──
export const LANGUAGES = [
  { code: 'ar', name: 'العربية', nameEn: 'Arabic' },
  { code: 'en', name: 'English', nameEn: 'English' },
  { code: 'tr', name: 'Türkçe', nameEn: 'Turkish' },
  { code: 'ur', name: 'اردو', nameEn: 'Urdu' },
  { code: 'ms', name: 'Bahasa Melayu', nameEn: 'Malay' },
  { code: 'fr', name: 'Français', nameEn: 'French' },
  { code: 'id', name: 'Bahasa Indonesia', nameEn: 'Indonesian' },
] as const;

// ── Validation ──
export const USERNAME_REGEX = /^[a-zA-Z0-9_.]+$/;

export function validateUsername(username: string): string | null {
  if (username.length < LIMITS.USERNAME_MIN) return `Min ${LIMITS.USERNAME_MIN} characters`;
  if (username.length > LIMITS.USERNAME_MAX) return `Max ${LIMITS.USERNAME_MAX} characters`;
  if (!USERNAME_REGEX.test(username)) return 'Letters, numbers, dots and underscores only';
  return null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { cursor?: string; hasMore: boolean };
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  timestamp: string;
}

export type ContentSpace = 'SAF' | 'BAKRA' | 'MAJLIS' | 'RISALAH' | 'MINBAR';

export const REPORT_REASONS = [
  'SPAM', 'HARASSMENT', 'HATE_SPEECH', 'VIOLENCE', 'NUDITY',
  'FALSE_INFO', 'IMPERSONATION', 'INTELLECTUAL_PROPERTY', 'OTHER',
] as const;
