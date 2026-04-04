/**
 * Normalize a cursor parameter for Prisma queries.
 * Converts empty string, null, or undefined to undefined (Prisma convention for "no cursor").
 * Returns the cursor string as-is when it has a value.
 */
export function parseCursor(cursor?: string | null): string | undefined {
  return cursor || undefined;
}

/**
 * Build a standard paginated response meta object.
 * Uses `null` for cursor when there are no more items (consistent with PaginatedResponse type).
 */
export function buildPaginationMeta<T extends { id: string }>(
  items: T[],
  hasMore: boolean,
  cursorField: keyof T = 'id',
): { cursor: string | null; hasMore: boolean } {
  return {
    cursor: hasMore && items.length > 0 ? String(items[items.length - 1][cursorField]) : null,
    hasMore,
  };
}
