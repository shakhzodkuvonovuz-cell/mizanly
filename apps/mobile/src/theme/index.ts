// Mizanly Design System
// Brand colors, typography, spacing, shadows

export const colors = {
  // Brand
  emerald: '#0A7B4F',
  emeraldLight: '#0D9B63',
  emeraldDark: '#066B42',
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
    border: '#30363D',
    borderLight: '#484F58',
  },

  // Light theme
  light: {
    bg: '#FFFFFF',
    bgElevated: '#F6F8FA',
    bgCard: '#FFFFFF',
    bgSheet: '#FFFFFF',
    surface: '#F3F4F6',
    border: '#D0D7DE',
    borderLight: '#E5E7EB',
  },

  // Text
  text: {
    primary: '#FFFFFF',
    secondary: '#8B949E',
    tertiary: '#6E7781',
    inverse: '#1E293B',
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
} as const;

export const fonts = {
  heading: 'PlayfairDisplay',
  headingBold: 'PlayfairDisplay-Bold',
  body: 'DMSans',
  bodyMedium: 'DMSans-Medium',
  bodySemiBold: 'DMSans-SemiBold',
  bodyBold: 'DMSans-Bold',
  arabic: 'NotoNaskhArabic',
  arabicBold: 'NotoNaskhArabic-Bold',
  mono: 'JetBrainsMono',
} as const;

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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

// Tab bar config
export const tabBar = {
  height: 83, // 49pt bar + 34pt safe area
  barHeight: 49,
  iconSize: 24,
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
