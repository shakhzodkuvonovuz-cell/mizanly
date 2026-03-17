import { Platform } from 'react-native';

/**
 * Hook that returns true when running on web (Expo Web / React Native Web).
 * Use for conditional rendering in components.
 *
 * @example
 * ```tsx
 * const isWeb = useIsWeb();
 * return isWeb ? <WebLayout /> : <NativeLayout />;
 * ```
 */
export function useIsWeb(): boolean {
  return Platform.OS === 'web';
}
