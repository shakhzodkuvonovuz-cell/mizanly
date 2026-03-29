/**
 * [F38] Global active room cleanup registry.
 *
 * Bridges the gap between callkit.ts (module scope, outside React) and
 * useLiveKitCall (React hook that holds the Room reference).
 *
 * - useLiveKitCall registers its cleanup on connect, clears on disconnect.
 * - callkit.ts calls disconnectActiveRoom() when the user ends via lock screen.
 *
 * Separate file to avoid circular imports and native module dependencies.
 * This file has ZERO imports — safe to use from any module.
 */

let activeRoomCleanup: (() => void) | null = null;

export function registerActiveRoomCleanup(cleanup: () => void): void {
  activeRoomCleanup = cleanup;
}

export function clearActiveRoomCleanup(): void {
  activeRoomCleanup = null;
}

export function disconnectActiveRoom(): void {
  if (activeRoomCleanup) {
    activeRoomCleanup();
    activeRoomCleanup = null;
  }
}
