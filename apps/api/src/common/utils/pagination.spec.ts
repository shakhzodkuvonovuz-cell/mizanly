import { parseCursor, buildPaginationMeta } from './pagination';

describe('parseCursor', () => {
  it('returns undefined for undefined', () => {
    expect(parseCursor(undefined)).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(parseCursor(null)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseCursor('')).toBeUndefined();
  });

  it('returns cursor string as-is when present', () => {
    expect(parseCursor('abc123')).toBe('abc123');
  });

  it('returns cursor string for CUID-like values', () => {
    const cuid = 'clx12345678901234567890';
    expect(parseCursor(cuid)).toBe(cuid);
  });
});

describe('buildPaginationMeta', () => {
  it('returns null cursor when hasMore is false', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const meta = buildPaginationMeta(items, false);
    expect(meta).toEqual({ cursor: null, hasMore: false });
  });

  it('returns last item id as cursor when hasMore is true', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const meta = buildPaginationMeta(items, true);
    expect(meta).toEqual({ cursor: 'c', hasMore: true });
  });

  it('returns null cursor for empty array', () => {
    const meta = buildPaginationMeta([], false);
    expect(meta).toEqual({ cursor: null, hasMore: false });
  });

  it('returns null cursor for empty array even if hasMore true', () => {
    const meta = buildPaginationMeta([], true);
    expect(meta).toEqual({ cursor: null, hasMore: true });
  });

  it('uses custom cursorField', () => {
    const items = [
      { id: '1', postId: 'p1' },
      { id: '2', postId: 'p2' },
    ];
    const meta = buildPaginationMeta(items, true, 'postId' as 'id');
    expect(meta).toEqual({ cursor: 'p2', hasMore: true });
  });
});
