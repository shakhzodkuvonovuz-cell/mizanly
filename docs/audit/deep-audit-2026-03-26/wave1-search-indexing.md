# Wave 1: Search Indexing Pipeline Audit

## Summary
14 findings. 2 CRITICAL, 4 HIGH, 5 MEDIUM, 2 LOW. Root cause: PublishWorkflowService is dead code.

## CRITICAL

### F1: Posts creation does NOT trigger search indexing
- **File:** `posts.service.ts:477-731`
- **Evidence:** create() calls gamification, moderation, analytics — zero addSearchIndexJob calls
- **Failure:** All new posts invisible to Meilisearch until weekly reconciliation (7-day staleness)

### F2: Threads creation does NOT trigger search indexing
- **File:** `threads.service.ts:329-433`
- Same pattern as F1 — create() has no search index call

## HIGH

### F3: Users are NEVER indexed on create or profile update
- **Evidence:** Zero addSearchIndexJob calls anywhere in users module
- **Failure:** User changes username — old name searchable, new name not found

### F4: Post and thread updates do NOT re-index
- **Files:** `posts.service.ts:777`, `threads.service.ts:472`
- **Failure:** Edited content searchable by old text, not new text

### F5: Video updates do NOT re-index
- **File:** `videos.service.ts:393-436`

### F7: Reels field name mismatch — 3 codepaths use 3 different names
- Real-time index: `description: reel.caption`
- Backfill sync: `content: r.caption`
- Meilisearch searchableAttributes: `['caption', ...]`
- **Failure:** Reel caption search returns ZERO results — wrong field name

## MEDIUM

### F6: Trial reel publishTrial() not re-indexed
### F8: Search reconciliation skips videos, users, hashtags + delete for threads/reels
### F10: Document shape inconsistency between real-time and backfill
### F11: Videos indexed as 'PROCESSING' status, never updated to 'PUBLISHED'
### F13: Hashtags never incrementally indexed

## LOW
### F12: Channels not in Meilisearch; pagination page 2+ falls back to Prisma
### F14: addDocuments ignores async Meilisearch task failures

## ROOT CAUSE
### F9: PublishWorkflowService is dead code — never called by any service
- **File:** `publish-workflow.service.ts`
- **Evidence:** Zero calls to onPublish/onUnpublish anywhere in modules/
- This is WHY 5+ content creation paths forgot to call addSearchIndexJob
