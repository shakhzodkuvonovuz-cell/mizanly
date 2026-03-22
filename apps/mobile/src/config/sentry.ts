// Sentry crash reporting for mobile
// Install: npx expo install @sentry/react-native
// Then uncomment the initialization in app/_layout.tsx

// To enable Sentry:
// 1. Run: npx expo install @sentry/react-native
// 2. Add EXPO_PUBLIC_SENTRY_DSN to your .env
// 3. Uncomment the import and init call in app/_layout.tsx

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    if (__DEV__) console.log('[Sentry] No DSN configured, skipping initialization');
    return;
  }

  try {
    // Dynamic import to avoid crash if package isn't installed
    const Sentry = require('@sentry/react-native');
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: __DEV__ ? 'development' : 'production',
      enabled: !__DEV__, // Only send in production
      tracesSampleRate: 0.2, // 20% of transactions for performance monitoring
      attachScreenshot: true,
      attachViewHierarchy: true,
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30000,
      // Don't track personally identifiable information
      beforeSend(event: Record<string, unknown>) {
        // Strip user email/phone from error reports
        if (event.user && typeof event.user === 'object') {
          const user = event.user as Record<string, unknown>;
          delete user.email;
          delete user.phone_number;
        }
        return event;
      },
    });
    if (__DEV__) console.log('[Sentry] Initialized successfully');
  } catch {
    if (__DEV__) console.log('[Sentry] Package not installed, skipping');
  }
}

export function setSentryUser(userId: string, username?: string) {
  try {
    const Sentry = require('@sentry/react-native');
    Sentry.setUser({ id: userId, username });
  } catch {
    // Sentry not installed
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  try {
    const Sentry = require('@sentry/react-native');
    if (context) {
      Sentry.withScope((scope: { setExtras: (extras: Record<string, unknown>) => void }) => {
        scope.setExtras(context);
        Sentry.captureException(error);
      });
    } else {
      Sentry.captureException(error);
    }
  } catch {
    if (__DEV__) console.error('[Sentry] Failed to capture:', error);
  }
}
