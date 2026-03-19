import { lazy, Suspense, createElement } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '@/theme';

/**
 * Create a lazily-loaded component with a loading fallback.
 * Used for heavy screens/components that don't need to be in the initial bundle.
 *
 * Usage:
 *   const HeavyEditor = lazily(() => import('../components/HeavyEditor'));
 *   // Then use <HeavyEditor /> normally
 *
 * Note: Expo Router already does route-level code splitting.
 * This is for intra-screen lazy loading of heavy components
 * (video editors, rich text editors, chart libraries, etc.)
 */
export function lazily<T extends ComponentType<Record<string, unknown>>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(factory);
}

/**
 * Suspense wrapper with a centered spinner fallback.
 * Use around lazily-loaded components.
 */
export function LazyBoundary({ children }: { children: React.ReactNode }) {
  const fallback = createElement(
    View,
    { style: { flex: 1, justifyContent: 'center', alignItems: 'center' } },
    createElement(ActivityIndicator, { size: 'small', color: colors.emerald }),
  );

  return createElement(Suspense, { fallback }, children);
}
