import * as Sentry from '@sentry/node';

export function initSentry() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',

      // Performance tracing: sample 10% of requests for latency monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Profile 5% of sampled transactions for CPU/memory flamegraphs
      profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,

      // Transaction grouping — group by route pattern, not full URL with params
      beforeSendTransaction(event) {
        // Collapse UUID/CUID params into {id} for cleaner transaction names
        if (event.transaction) {
          event.transaction = event.transaction
            .replace(/\/[a-z0-9]{24,}(?=\/|$)/gi, '/{id}')
            .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{id}');
        }
        return event;
      },

      beforeSend(event) {
        // Scrub sensitive data from error events
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        // Don't send 404s — they're noise, not errors
        if (event.contexts?.response?.status_code === 404) return null;
        return event;
      },

      // Ignore noisy errors
      ignoreErrors: [
        'NotFoundException',
        'UnauthorizedException',
        'ThrottlerException',
        'ECONNRESET',
        'ETIMEDOUT',
      ],

      // Set release for deployment tracking
      release: process.env.npm_package_version || '0.1.0',
    });
  }
}
