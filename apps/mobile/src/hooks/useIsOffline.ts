import { useStore } from '@/store';

/**
 * Returns the current offline state from the global store.
 * The store is kept in sync by useNetworkStatus() in root _layout.tsx.
 *
 * Usage:
 *   const isOffline = useIsOffline();
 *   <GradientButton disabled={isOffline || mutation.isPending} />
 */
export function useIsOffline(): boolean {
  return useStore((s) => s.isOffline);
}
