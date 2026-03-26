import { AsyncLocalStorage } from 'async_hooks';

/**
 * AsyncLocalStorage-based correlation ID store.
 * Set by CorrelationIdMiddleware on each HTTP request.
 * Read by QueueService to propagate into job payloads.
 * Read by processors to attach to Sentry scope + logs.
 */
export const correlationStore = new AsyncLocalStorage<string>();

/** Get the current correlation ID (returns undefined if not in a request context) */
export function getCorrelationId(): string | undefined {
  return correlationStore.getStore();
}
