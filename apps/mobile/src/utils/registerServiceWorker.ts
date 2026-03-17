import { Platform } from 'react-native';

/**
 * Registers the service worker for PWA support.
 * Only runs on web — no-ops on native platforms.
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for updates on every navigation
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'activated' &&
              navigator.serviceWorker.controller
            ) {
              // A new version is available — prompt user to reload
              showUpdatePrompt();
            }
          });
        });
      })
      .catch((error: unknown) => {
        if (__DEV__) {
          console.warn('[SW] Registration failed:', error);
        }
      });
  });
}

function showUpdatePrompt(): void {
  // Simple confirm dialog for MVP — can be replaced with an in-app toast later
  const shouldUpdate = window.confirm(
    'A new version of Mizanly is available. Reload to update?'
  );
  if (shouldUpdate) {
    window.location.reload();
  }
}
