// Mizanly Design System
// Brand colors, typography, spacing, shadows, animations, glassmorphism

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

  // Glass overlay tints
  glass: {
    dark: 'rgba(13, 17, 23, 0.7)',
    light: 'rgba(255, 255, 255, 0.08)',
    border: 'rgba(255, 255, 255, 0.12)',
  },

  // Active states with opacity
  active: {
    emerald10: 'rgba(10, 123, 79, 0.1)',
    emerald20: 'rgba(10, 123, 79, 0.2)',
    error10: 'rgba(248, 81, 73, 0.1)',
    gold10: 'rgba(200, 150, 62, 0.1)',
    white5: 'rgba(255, 255, 255, 0.05)',
    white10: 'rgba(255, 255, 255, 0.1)',
  },
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

// 5-level elevation system
export const elevation = {
  surface: {
    ...shadow.sm,
    backgroundColor: colors.dark.bg,
  },
  raised: {
    ...shadow.sm,
    backgroundColor: colors.dark.bgElevated,
  },
  overlay: {
    ...shadow.md,
    backgroundColor: colors.dark.bgCard,
  },
  modal: {
    ...shadow.lg,
    backgroundColor: colors.dark.bgSheet,
  },
  toast: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
    backgroundColor: colors.dark.bgSheet,
  },
} as const;

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
    responsive: { damping: 15, stiffness: 150, mass: 0.5 },
    bouncy: { damping: 10, stiffness: 400, mass: 0.5 },
    gentle: { damping: 20, stiffness: 100, mass: 0.8 },
    snappy: { damping: 12, stiffness: 300, mass: 0.4 },
  },
  timing: {
    fast: 150,
    normal: 250,
    slow: 400,
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
    blurIntensity: 80,
    overlayColor: 'rgba(13, 17, 23, 0.7)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 0.5,
  },
} as const;
