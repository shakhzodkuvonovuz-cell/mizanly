# Wave 1: Hot Query Index Coverage Audit

## Summary
16 findings checked. 4 missing indexes on hot paths, 1 mismatched index, rest well-covered.

## HIGH — Missing Indexes

### F3: Notification batching — no `[userId, type, createdAt]` composite index
- **Evidence:** Batching dedup query scans all user notifications in 30min, then filters by type
- **Fix:** `@@index([userId, type, createdAt(sort: Desc)])`

### F7: Conversation list — JOIN sort on lastMessageAt through relation
- **Evidence:** `orderBy: { conversation: { lastMessageAt: 'desc' } }` requires in-memory sort after join
- **Architectural:** Need denormalized lastMessageAt on ConversationMember for 200+ groups

### F9: Reel feed — no composite `[status, isRemoved, isTrial, createdAt]`
- **Evidence:** Main feed query filters on all 4 columns, existing indexes cover only 2 at a time
- **Fix:** `@@index([status, isRemoved, isTrial, createdAt(sort: Desc)])`

### F10: Search ILIKE — sequential scan on ALL content tables
- **Evidence:** `contains: query, mode: 'insensitive'` = `ILIKE '%query%'` — no B-tree can help
- **Fix (interim):** pg_trgm GIN indexes. **Fix (long-term):** Meilisearch (configured, needs env vars)

## LOW — Mismatched Index

### F16: Video trending queries `createdAt` but index is on `publishedAt`
- **Fix:** Add `@@index([status, createdAt(sort: Desc)])` or query on `publishedAt`

## WELL-COVERED
- Post feeds, Following feed, Message loading, Notification reads, Follow lookups, Block/Mute enforcement, FeedInteraction, Hashtag array queries — all have proper covering indexes
