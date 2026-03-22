import { Platform } from 'react-native';

/**
 * Plain constant for non-hook contexts (utilities, top-level modules).
 * Platform.OS is determined at build time and never changes at runtime,
 * so a hook is unnecessary — but useIsWeb is kept for backward compatibility.
 */
export const IS_WEB = Platform.OS === 'web';

/**
 * Hook that returns true when running on web (Expo Web / React Native Web).
 * Use for conditional rendering in components.
 * For non-component code, prefer the `IS_WEB` constant instead.
 *
 * @example
 * ```tsx
 * const isWeb = useIsWeb();
 * return isWeb ? <WebLayout /> : <NativeLayout />;
 * ```
 */
export function useIsWeb(): boolean {
  return IS_WEB;
}
