/**
 * Sentry error reporting utility.
 * Wraps @sentry/react-native for structured error capture.
 *
 * In development, errors are logged to console.
 * In production, errors are sent to Sentry.
 */

let Sentry: {
  init: (config: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string, level?: string) => void;
  setUser: (user: { id: string; username?: string } | null) => void;
  wrap: <T extends (...args: unknown[]) => unknown>(fn: T) => T;
} | null = null;

try {
  // Dynamic import to avoid crash if package not installed
  Sentry = require('@sentry/react-native');
} catch {
  // @sentry/react-native not installed — use fallbacks
}

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!Sentry || !SENTRY_DSN || __DEV__) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    attachStacktrace: true,
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (__DEV__) {
    console.error('[Sentry]', error, context);
    return;
  }
  if (Sentry) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (__DEV__) {
    console.log(`[Sentry:${level}]`, message);
    return;
  }
  if (Sentry) {
    Sentry.captureMessage(message, level);
  }
}

export function setUser(user: { id: string; username?: string } | null) {
  if (Sentry) {
    Sentry.setUser(user);
  }
}
