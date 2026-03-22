// Mizanly Design System
// Brand colors, typography, spacing, shadows, animations, glassmorphism

import { Platform } from 'react-native';

export const colors = {
  // Brand
  emerald: '#0A7B4F',
  emeraldLight: '#0D9B63',
  emeraldDark: '#066B42',
  // WCAG AA accessible text variants — use for small text on dark backgrounds
  // emeraldLight (#0D9B63) passes WCAG AA 4.5:1 on #0D1117
  // goldLight (#D4A94F) passes WCAG AA 4.5:1 on #0D1117
  gold: '#C8963E',
  goldLight: '#D4A94F',
  cream: '#FEFCF7',

  // Dark theme (primary)
  dark: {
    bg: '#0D1117',
    bgElevated: '#161B22',
    bgCard: '#1C2333',
    bgSheet: '#21283B',
    surface: '#2D3548',
    surfaceHover: '#374151',
    border: '#30363D',
    borderLight: '#484F58',
    borderHighlight: 'rgba(255, 255, 255, 0.1)',
  },

  // Light theme
  light: {
    bg: '#FFFFFF',
    bgElevated: '#F6F8FA',
    bgCard: '#FFFFFF',
    bgSheet: '#FFFFFF',
    surface: '#F3F4F6',
    surfaceHover: '#E5E7EB',
    border: '#D0D7DE',
    borderLight: '#E5E7EB',
    borderHighlight: 'rgba(0, 0, 0, 0.05)',
  },

  // Text (dark mode defaults — use useThemeColors() for theme-aware values)
  text: {
    primary: '#FFFFFF',
    secondary: '#9BA4AE', // WCAG AA ≥4.5:1 on dark.bgCard (#1C2333) — was #8B949E (3.7:1 on cards)
    tertiary: '#8B949E', // WCAG AA compliant (≥4.5:1 on dark.bg)
    inverse: '#1E293B',
    onColor: '#FFFFFF',
  },

  // Light mode text variants
  textLight: {
    primary: '#1F2937',
    secondary: '#4B5563',
    tertiary: '#6B7280',
    inverse: '#FFFFFF',
    onColor: '#FFFFFF',
  },

  // Semantic
  error: '#F85149',
  warning: '#D29922',
  success: '#0A7B4F',
  info: '#58A6FF',
  live: '#FF3B3B',

  // Social
  like: '#F85149',
  bookmark: '#C8963E',
  online: '#0A7B4F',

  // Glass overlay tints
  glass: {
    dark: 'rgba(13, 17, 23, 0.85)', // WCAG: increased for text readability on video
    darkHeavy: 'rgba(13, 17, 23, 0.90)',
    light: 'rgba(255, 255, 255, 0.15)',
    border: 'rgba(255, 255, 255, 0.12)',
  },

  // Active states with opacity
  active: {
    emerald5: 'rgba(10, 123, 79, 0.05)',
    emerald10: 'rgba(10, 123, 79, 0.1)',
    emerald15: 'rgba(10, 123, 79, 0.15)',
    emerald20: 'rgba(10, 123, 79, 0.2)',
    emerald30: 'rgba(10, 123, 79, 0.3)',
    emerald40: 'rgba(10, 123, 79, 0.4)',
    emerald50: 'rgba(10, 123, 79, 0.5)',
    gold10: 'rgba(200, 150, 62, 0.1)',
    gold15: 'rgba(200, 150, 62, 0.15)',
    gold20: 'rgba(200, 150, 62, 0.2)',
    gold30: 'rgba(200, 150, 62, 0.3)',
    gold50: 'rgba(200, 150, 62, 0.5)',
    error10: 'rgba(248, 81, 73, 0.1)',
    white5: 'rgba(255, 255, 255, 0.05)',
    white6: 'rgba(255, 255, 255, 0.06)',
    white10: 'rgba(255, 255, 255, 0.1)',
  },

  // Extended palette (non-brand colors for badges, tiers, categories)
  extended: {
    blue: '#58A6FF',
    purple: '#A371F7',
    purpleLight: '#D2A8FF',
    violet: '#7C3AED',
    orange: '#F59E0B',
    orangeDark: '#F0883E',
    orangeLight: '#FFA657',
    greenBright: '#3FB950',
    greenDark: '#05593A',
    goldDark: '#A67C00',
    red: '#FF7B72',
    white: '#FFFFFF',
    black: '#000000',
  },

  // Gradient presets (for LinearGradient components)
  gradient: {
    cardDark: ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)'] as readonly [string, string],
    cardMedium: ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)'] as readonly [string, string],
    cardHeavy: ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.4)'] as readonly [string, string],
    emerald: ['rgba(10,123,79,0.9)', 'rgba(6,107,66,0.95)'] as readonly [string, string],
  },
} as const;

// Extended fontSize tokens for sizes not in the base scale
export const fontSizeExt = {
  micro: 9,   // dot indicators, badges
  tiny: 10,   // timestamps, metadata
  caption: 12, // captions, helper text
  body: 14,   // secondary body text
  subtitle: 16, // subtitles
  title: 18,  // small titles
  heading: 28, // section headings
  display: 32, // large display text
  hero: 36,   // hero text
  jumbo: 48,  // countdown, big numbers
} as const;

export const fonts = {
  heading: 'PlayfairDisplay_700Bold',
  headingBold: 'PlayfairDisplay_700Bold',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemiBold: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
  arabic: 'NotoNaskhArabic_400Regular',
  arabicBold: 'NotoNaskhArabic_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  // Aliases matching useFonts registration keys
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_500Medium',
  bold: 'DMSans_700Bold',
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 34,
  '4xl': 42,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  glow: {
    shadowColor: '#0A7B4F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
} as const;

// 5-level elevation system
export const elevation = {
  surface: {
    ...shadow.sm,
    backgroundColor: colors.dark.bg,
  },
  raised: {
    ...shadow.md,
    backgroundColor: colors.dark.bgElevated,
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
  },
  overlay: {
    ...shadow.md,
    backgroundColor: colors.dark.bgCard,
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
  },
  modal: {
    ...shadow.lg,
    backgroundColor: colors.dark.bgSheet,
    borderWidth: 1,
    borderColor: colors.dark.borderLight,
  },
  toast: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 16,
    backgroundColor: colors.dark.bgSheet,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
} as const;

/**
 * Theme-aware color getter. Returns dark or light surface/text colors
 * based on the provided theme string.
 *
 * Usage in components:
 *   const themeColors = getThemeColors(theme);
 *   style={{ backgroundColor: themeColors.bg }}
 *
 * For hooks: use useThemeColors() from store which reads the current theme.
 */
export function getThemeColors(theme: 'dark' | 'light' | 'system') {
  const effectiveTheme = theme === 'system' ? 'dark' : theme; // Default to dark
  const surface = effectiveTheme === 'dark' ? colors.dark : colors.light;
  const text = effectiveTheme === 'dark' ? colors.text : colors.textLight;
  return { ...surface, text };
}

// Tab bar config
export const tabBar = {
  height: 83, // 49pt bar + 34pt safe area
  barHeight: 49,
  iconSize: 24,
} as const;

// Icon sizes
export const iconSize = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
} as const;

// Avatar sizes
export const avatar = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 52,
  xl: 64,
  '2xl': 96,
  '3xl': 128,
} as const;

// Animation presets
export const animation = {
  spring: {
    responsive: { damping: 14, stiffness: 170, mass: 0.5 },
    bouncy: { damping: 10, stiffness: 400, mass: 0.6 },
    gentle: { damping: 20, stiffness: 100, mass: 0.8 },
    snappy: { damping: 12, stiffness: 350, mass: 0.4 },
    fluid: { damping: 18, stiffness: 150, mass: 0.9 },
  },
  timing: {
    fast: 150,
    normal: 250,
    slow: 400,
    shimmer: 1200,
  },
} as const;

// Glassmorphism presets
export const glass = {
  light: {
    blurIntensity: 40,
    overlayColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 0.5,
  },
  medium: {
    blurIntensity: 60,
    overlayColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 0.5,
  },
  heavy: {
    blurIntensity: 85,
    overlayColor: 'rgba(13, 17, 23, 0.65)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 0.5,
  },
  ultra: {
    blurIntensity: 100,
    overlayColor: 'rgba(13, 17, 23, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
  },
} as const;
