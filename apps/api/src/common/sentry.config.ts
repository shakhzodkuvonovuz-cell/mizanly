/**
 * Sentry configuration for NestJS backend.
 * Uses @sentry/nestjs or @sentry/node for error reporting.
 *
 * DSN is read from SENTRY_DSN environment variable.
 */

let Sentry: {
  init: (config: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: Record<string, unknown>) => void;
  captureMessage: (message: string) => void;
  setUser: (user: { id: string } | null) => void;
} | null = null;

try {
  Sentry = require('@sentry/node');
} catch {
  // @sentry/node not installed — use fallback logging
}

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!Sentry || !dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV ?? 'development',
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (Sentry && process.env.SENTRY_DSN) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}

export function captureMessage(message: string) {
  if (Sentry && process.env.SENTRY_DSN) {
    Sentry.captureMessage(message);
  }
}

export { Sentry };
