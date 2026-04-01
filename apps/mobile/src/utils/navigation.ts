import { router } from 'expo-router';

/**
 * Type-safe navigation helper for dynamic routes.
 *
 * Expo Router generates strict types from the file system.
 * Routes with dynamic params (e.g., /event-detail?id=X) need
 * explicit typing. This helper provides a safe way to navigate
 * to any route with params without using `as never`.
 *
 * Usage:
 *   navigate('/(screens)/event-detail', { id: event.id })
 *   navigate('/(screens)/product/[id]', { id: product.id })
 */
export function navigate(
  pathname: string,
  params?: Record<string, string | number>,
): void {
  if (params && Object.keys(params).length > 0) {
    const searchParams = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    // Use the href overload that accepts any string
    (router as { push: (href: string) => void }).push(`${pathname}?${searchParams}`);
  } else {
    (router as { push: (href: string) => void }).push(pathname);
  }
}

