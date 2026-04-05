# I03 -- Meilisearch Indexing Completeness Audit

**Auditor:** Hostile code audit (automated)
**Date:** 2026-04-05
**Scope:** Meilisearch indexing lifecycle: create/update/delete sync, privacy purge, stale document exposure, missing content types
**Severity scale:** CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## Executive Summary

Meilisearch indexing has a solid foundation -- the `PublishWorkflowService` centralizes index/delete, and the `SearchReconciliationService` provides a weekly safety net. However, **multiple content lifecycle transitions do NOT trigger index operations**, meaning the index silently drifts from the database. The biggest risks are: (1) deactivated/deleted users remaining searchable, (2) `register()` not indexing new users, (3) channels completely absent from Meilisearch despite being mapped in search, and (4) the weekly reconciliation being the ONLY mechanism to remove stale content older than 7 days.

**Total findings: 22** (4 CRITICAL, 6 HIGH, 7 MEDIUM, 3 LOW, 2 INFO)

---

## Architecture Overview

### Indexing Infrastructure

| Component | File | Role |
|-----------|------|------|
| `MeilisearchService` | `apps/api/src/modules/search/meilisearch.service.ts` | Low-level HTTP client (add, delete, search, settings) |
| `PublishWorkflowService` | `apps/api/src/common/services/publish-workflow.service.ts` | Centralized publish/unpublish pipeline (queues index job) |
| `SearchIndexingProcessor` | `apps/api/src/common/queue/processors/search-indexing.processor.ts` | BullMQ worker that executes index/update/delete against Meilisearch |
| `QueueService` | `apps/api/src/common/queue/queue.service.ts` | Enqueues `addSearchIndexJob()` via BullMQ |
| `MeilisearchSyncService` | `apps/api/src/common/services/meilisearch-sync.service.ts` | Full backfill (admin-triggered, additive only) |
| `SearchReconciliationService` | `apps/api/src/common/services/search-reconciliation.service.ts` | Weekly cron: re-indexes recent content, deletes recently-removed |
| `SearchService` | `apps/api/src/modules/search/search.service.ts` | Search endpoint: tries Meilisearch first, falls back to Prisma |

### Meilisearch Indexes (6 configured)

| Index | Searchable Attributes | Filterable Attributes |
|-------|----------------------|----------------------|
| `users` | username, displayName, bio | isVerified |
| `posts` | content, hashtags, username | userId, postType, visibility, isRemoved |
| `threads` | content, hashtags, username | userId, visibility, isRemoved, isChainHead |
| `reels` | caption, hashtags, username | userId, status, isRemoved |
| `videos` | title, description, tags, username | userId, channelId, category, status, isRemoved |
| `hashtags` | name | (none) |

---

## Content Type Lifecycle Matrix

### Legend
- Y = properly implemented
- N = NOT implemented (finding)
- P = partially implemented
- -- = not applicable

| Content Type | Indexed on Create | Updated on Edit | Removed on Delete | Removed on Soft-Delete | Removed on Ban | Removed on Privacy Delete | In Reconciliation | In Full Sync |
|-------------|------------------|-----------------|-------------------|----------------------|----------------|--------------------------|-------------------|-------------|
| **Users** | P (webhook only, not register) | Y (profile update) | Y (privacy delete) | N (deactivate) | Y (admin ban) | Y | Y | Y |
| **Posts** | Y | Y | Y (isRemoved) | Y | Y (admin) | Y | Y | Y |
| **Threads** | Y | Y | Y (isRemoved) | Y | Y (admin) | Y | Y | Y |
| **Reels** | Y | Y | Y (isRemoved) | Y | Y (admin) | Y | Y | Y |
| **Videos** | Y | Y | Y (isRemoved) | Y | Y (admin) | Y | Y | Y |
| **Hashtags** | N | N | -- | -- | -- | -- | Y (add only) | Y (add only) |
| **Channels** | N | N | N | N | N | N | N | N |
| **Stories** | -- | -- | -- | -- | -- | -- | -- | -- |
| **ForumThreads** | -- | -- | -- | -- | -- | -- | -- | -- |
| **AudioRooms** | -- | -- | -- | -- | -- | -- | -- | -- |
| **Circles** | -- | -- | -- | -- | -- | -- | -- | -- |
| **Events** | -- | -- | -- | -- | -- | -- | -- | -- |
| **HalalRestaurants** | -- | -- | -- | -- | -- | -- | -- | -- |
| **MosqueCommunities** | -- | -- | -- | -- | -- | -- | -- | -- |
| **Products** | -- | -- | -- | -- | -- | -- | -- | -- |

---

## CRITICAL Findings

### I03-C1: `register()` does NOT index new users in Meilisearch

**File:** `apps/api/src/modules/auth/auth.service.ts`, lines 66-203
**Evidence:** The `register()` method creates a user via `prisma.user.upsert()` at line 143 but never calls `addSearchIndexJob()` or `publishWorkflow.onPublish()`. Only the `syncClerkUser()` webhook handler (line 367, 415) indexes users.
**Impact:** Users who register via the normal mobile flow (not Clerk webhook) are invisible in Meilisearch search until the weekly reconciliation cron runs (up to 7 days). This is the primary registration path.
**Contrast:** The Clerk webhook handler at line 415 correctly calls `addSearchIndexJob` for webhook-created users.

### I03-C2: `deactivate()` does NOT remove user from search index

**File:** `apps/api/src/modules/users/users.service.ts`, lines 198-212
**Evidence:** The `deactivate()` method sets `isDeactivated: true` and clears the Redis cache but never calls `publishWorkflow.onUnpublish()` or `addSearchIndexJob({ action: 'delete' })`. The deactivated user remains fully searchable in Meilisearch.
**Impact:** Deactivated users appear in search results. Users who deactivate for privacy reasons expect to disappear from search. The Prisma fallback correctly filters `isDeactivated: false`, but Meilisearch has no such filter (the `users` index only has `isVerified` as a filterable attribute). The JS post-filter checks for `isBanned` but NOT `isDeactivated`.
**Severity amplifier:** The `reactivateAccount()` method (line 1113) also never re-indexes, so if you later fix deactivation to remove from index, reactivation won't restore it.

### I03-C3: Channels completely absent from Meilisearch despite being mapped in search

**File:** `apps/api/src/modules/search/meilisearch.service.ts` line 55 -- `channels` NOT in index list
**File:** `apps/api/src/modules/search/search.service.ts` line 182 -- `channels: 'channels'` in indexMap
**Evidence:** The `MeilisearchService.onModuleInit()` creates 6 indexes: `['users', 'posts', 'threads', 'reels', 'videos', 'hashtags']`. Channels is not among them. However, the `SearchService` maps `type=channels` to a `channels` Meilisearch index at line 182. When a user searches with `type=channels`, Meilisearch returns null (index doesn't exist), and the code falls through to Prisma. This silently degrades without any warning.
**Impact:** Channel search always uses Prisma ILIKE fallback (O(n) table scan) even when Meilisearch is deployed. No channel CRUD operation indexes/deindexes channels. The `MeilisearchSyncService` and `SearchReconciliationService` both ignore channels entirely. No `channels.service.ts` calls any publish workflow.

### I03-C4: Full sync (`syncAll`) is additive-only -- never purges stale documents

**File:** `apps/api/src/common/services/meilisearch-sync.service.ts`
**Evidence:** The `syncAll()` method uses `meilisearch.addDocuments()` which upserts documents. It correctly filters for active content (e.g., `isDeactivated: false, isBanned: false, isDeleted: false` for users). However, if a user was indexed when active and later banned, the sync will NOT remove them. The sync only adds/updates documents that currently match the filter -- it never identifies and deletes documents that no longer match.
**Impact:** Running admin `POST /admin/sync-search-index` does NOT clean up stale documents. An admin who runs a "full sync" expecting a clean slate will still have banned users, removed posts, and deleted content in the index. The only mechanism that removes stale documents is: (a) individual `onUnpublish` calls during CRUD, (b) the weekly reconciliation (7-day window only), or (c) manually deleting the Meilisearch index and re-creating it.

---

## HIGH Findings

### I03-H1: Meilisearch search does NOT use server-side filters -- relies on JS post-filtering

**File:** `apps/api/src/modules/search/search.service.ts`, lines 186-201
**Evidence:** The search call at line 186 passes no `filter` parameter to Meilisearch:
```typescript
const result = await this.meilisearch.search(indexName, query, { limit: safeLimit * 2 });
```
Despite `isRemoved`, `visibility`, and `userId` being configured as `filterableAttributes`, the code fetches 2x results and post-filters in JavaScript (lines 191-199).
**Impact:** (1) Meilisearch returns removed/private content to the server -- unnecessary data transfer. (2) If more than 50% of results are filtered out, the user gets fewer results than `safeLimit` despite more existing. (3) The `limit: safeLimit * 2` is an arbitrary guess -- if 90% of results for a query are removed content, the user gets almost nothing. (4) No pagination support when using Meilisearch path (cursor is always null).

### I03-H2: `isDeactivated` not checked in Meilisearch post-filter

**File:** `apps/api/src/modules/search/search.service.ts`, lines 191-199
**Evidence:** The post-filter checks:
```typescript
if (h.isRemoved === true) return false;
if (h.visibility && h.visibility !== 'PUBLIC') return false;
if (h.isBanned === true) return false;
```
It checks `isRemoved`, `visibility`, and `isBanned` but NOT `isDeactivated` or `isDeleted`. The `users` index documents don't even contain these fields (only id, username, displayName, bio, isVerified, followerCount).
**Impact:** Even if deactivated users were eventually added with a flag, the post-filter wouldn't catch them. The `users` index has no mechanism to distinguish active from inactive users.

### I03-H3: Hashtags never indexed on creation or updated on count changes

**File:** No call to `addSearchIndexJob` for hashtags in any CRUD service
**Evidence:** Hashtags are created implicitly when posts/threads are published (via `$executeRaw` upsert on the `hashtags` table). No service calls `addSearchIndexJob({ action: 'index', indexName: 'hashtags', ... })` when a hashtag is created or when its `postsCount` changes. The only path for hashtags to enter Meilisearch is: (a) the weekly reconciliation (hashtags created in last 7 days), or (b) the admin full sync.
**Impact:** New hashtags are invisible in Meilisearch for up to 7 days. A trending hashtag created today with 10,000 posts won't appear in Meilisearch search until Sunday's cron runs. The `postsCount` field in the index is never updated, so sort-by-popularity returns stale ordering.

### I03-H4: `deleteDocument` does not verify HTTP response status

**File:** `apps/api/src/modules/search/meilisearch.service.ts`, lines 170-183
**Evidence:**
```typescript
async deleteDocument(indexName: string, documentId: string) {
    if (!this.available) return;
    try {
      await this.circuitBreaker.exec('meilisearch', () =>
        fetch(`${this.host}/indexes/${encodeURIComponent(indexName)}/documents/${encodeURIComponent(documentId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }),
      );
    } catch (error) {
      this.logger.warn(...);
    }
  }
```
The fetch response is never checked. A 404 (document not found), 400 (bad request), or 500 (server error) would be silently swallowed. Only network-level errors (DNS failure, timeout) would be caught.
**Impact:** Failed deletions are invisible. A document that Meilisearch refuses to delete (e.g., index doesn't exist) will remain searchable with no error trail.

### I03-H5: Reconciliation cron has a 7-day blind spot for stale content older than 7 days

**File:** `apps/api/src/common/services/search-reconciliation.service.ts`
**Evidence:** All queries use `createdAt: { gte: sevenDaysAgo }` for re-indexing and `updatedAt: { gte: sevenDaysAgo }` for removal. Content removed MORE than 7 days ago that was never properly de-indexed (due to Redis outage, queue failure, etc.) will remain in Meilisearch permanently.
**Impact:** If the BullMQ queue drops a delete job during a Redis blip, and the reconciliation runs before the content is 7 days old, it will fix it. But if the content was created 8+ days ago and its delete job was lost, no mechanism will ever remove it. The stale document persists until the next admin full sync (which itself is additive-only -- see C4).

### I03-H6: Privacy delete does NOT remove user's hashtag contributions from index

**File:** `apps/api/src/modules/privacy/privacy.service.ts`, lines 738-764
**Evidence:** The privacy delete collects search deletions for posts, reels, threads, videos, and the user itself. It does NOT queue deletions for hashtags. When a user is deleted, their posts are deleted, which should decrement hashtag counts. But the hashtag documents in Meilisearch still reference the old `postsCount`.
**Impact:** Minor data inconsistency -- hashtag popularity scores in Meilisearch become inflated after user deletions. More importantly, if a user was the sole creator of a hashtag, the hashtag remains in the index with stale data even though all associated content is gone.

---

## MEDIUM Findings

### I03-M1: `users` index missing `isBanned`, `isDeactivated`, `isDeleted` filterable attributes

**File:** `apps/api/src/modules/search/meilisearch.service.ts`, lines 61-65
**Evidence:** The users index only has `filterableAttributes: ['isVerified']`. Without `isBanned`, `isDeactivated`, or `isDeleted` as filterable attributes, Meilisearch cannot server-side filter these states even if the documents contained these fields.
**Impact:** Cannot use Meilisearch-level filtering for user status. All filtering must happen in JavaScript post-processing, which is unreliable (see H1, H2).

### I03-M2: Scheduled content that never publishes (cancelled schedule) may remain indexed

**File:** `apps/api/src/modules/scheduling/scheduling.service.ts`
**Evidence:** The `cancelSchedule()` method nulls out `scheduledAt` but doesn't explicitly check whether the content was already indexed. If the scheduling cron ran and indexed the content before the user cancelled, the content remains in Meilisearch despite being unpublished.
**Impact:** Edge case but possible: content that was scheduled, auto-published by cron, then immediately "cancelled" could remain in search.

### I03-M3: `addDocuments` does not check response status for index operations

**File:** `apps/api/src/modules/search/meilisearch.service.ts`, lines 148-168
**Evidence:** The `addDocuments` method checks `if (!response.ok)` and throws, but the error is caught and logged as a warning (line 166). The calling code (PublishWorkflowService) also catches and logs warnings. Two layers of catch-and-warn mean a failed index operation results in only a debug-level log.
**Impact:** Index failures during normal CRUD are effectively silent. An admin would need to monitor Sentry or log aggregation to notice systematic indexing failures.

### I03-M4: No `channels` index means search type `channels` always falls to O(n) Prisma scan

**File:** `apps/api/src/modules/search/search.service.ts`, line 182
**Evidence:** `channels: 'channels'` in indexMap points to a non-existent Meilisearch index. The Meilisearch search returns null (circuit breaker catches the 404), and the code silently falls through to the Prisma `ILIKE` fallback at line 277.
**Impact:** Channel search performance will degrade linearly with table size. At 100K channels, every channel search triggers a full table scan with `contains` (ILIKE).

### I03-M5: Reconciliation batches capped at 1000 per content type with no pagination

**File:** `apps/api/src/common/services/search-reconciliation.service.ts`, lines 40-49 (example for posts)
**Evidence:** Each content type query has `take: 1000`. If more than 1000 posts were created in the last 7 days, only the first 1000 are reconciled. There is no cursor-based pagination loop.
**Impact:** High-volume periods (viral content, Ramadan campaigns) could produce more than 1000 items per week per type. The overflow is silently dropped from reconciliation.

### I03-M6: `onPublish` conditional on `indexDocument` being truthy -- caller can accidentally skip indexing

**File:** `apps/api/src/common/services/publish-workflow.service.ts`, lines 43-53
**Evidence:**
```typescript
if (indexDocument) {
  this.queueService.addSearchIndexJob({ ... });
}
```
If any caller forgets to pass `indexDocument` or passes `undefined`, the search index step is silently skipped. No warning is logged.
**Impact:** A future developer adding a new content type might call `onPublish()` without `indexDocument` and never realize search indexing was skipped. The `onUnpublish()` method always deletes (no conditional), creating an asymmetry.

### I03-M7: Visibility change from PUBLIC to FOLLOWERS/CIRCLE does not remove from search index

**File:** `apps/api/src/modules/posts/posts.service.ts`, lines 798-857 (update method)
**Evidence:** The `update()` method re-indexes the post via `onPublish()` with the new visibility value in the document. However, Meilisearch still serves this document in search results. The post-filter at line 194 checks `if (h.visibility && h.visibility !== 'PUBLIC') return false`, which would catch it -- but only if the visibility field was actually stored in the Meilisearch document. Checking the index document passed: `visibility: updated.visibility` is included, so it IS stored. However, the post-filter in the Meilisearch path is fragile (see H1) and does not use server-side filters.
**Impact:** Relies entirely on JS post-filtering. If the post-filter is bypassed or the field name changes, non-public content becomes searchable.

---

## LOW Findings

### I03-L1: No abort signal / timeout on `addDocuments` or `deleteDocument` HTTP calls

**File:** `apps/api/src/modules/search/meilisearch.service.ts`
**Evidence:** The `search()` method has `signal: AbortSignal.timeout(10000)` (line 133). Neither `addDocuments()` (line 153) nor `deleteDocument()` (line 175) have any timeout. A slow or hanging Meilisearch instance could block the BullMQ worker indefinitely.
**Impact:** Queue worker stall. The `lockDuration: 60000` in the processor would eventually cause the job to be marked stalled, but during that 60 seconds the worker is blocked.

### I03-L2: `SearchReconciliationService` does not reconcile removed hashtags

**File:** `apps/api/src/common/services/search-reconciliation.service.ts`, lines 224-239
**Evidence:** The reconciliation re-indexes recent hashtags but never removes deleted ones. There is no `removedHashtags` query equivalent to `removedPosts` / `removedThreads` / `removedReels` / `removedVideos` / `removedUsers`.
**Impact:** If a hashtag is somehow deleted from the database (unlikely in normal flow but possible via admin action), it persists in Meilisearch forever.

### I03-L3: `MeilisearchSyncService.syncAll()` processes sequentially, not in parallel

**File:** `apps/api/src/common/services/meilisearch-sync.service.ts`, lines 21-37
**Evidence:** `syncAll()` calls `syncUsers()`, then `syncPosts()`, then `syncThreads()`, etc. sequentially. Each sync can take minutes for large tables.
**Impact:** Admin-triggered full sync takes 6x longer than necessary. Could run all 6 syncs in parallel since they operate on independent indexes.

---

## INFO Findings

### I03-I1: Stories, ForumThreads, AudioRooms, Circles, Events, Products, HalalRestaurants, MosqueCommunities are not indexed

**Evidence:** None of these content types have Meilisearch indexes, and none of their CRUD services call any search indexing methods.
**Assessment:** This is likely intentional for the current product stage. Stories are ephemeral (24h), ForumThreads are within communities, AudioRooms are live sessions. However, as these features mature, search will become expected (especially for Events, Circles, and HalalRestaurants which are highly discoverable content types).

### I03-I2: The `type` field in `MeilisearchDocument` is redundant with the index name

**File:** `apps/api/src/modules/search/meilisearch.service.ts`, line 7
**Evidence:** Documents are stored in per-type indexes (users, posts, etc.) AND each document has a `type` field (user, post, etc.). This is redundant since documents in the `posts` index are always type `post`.
**Assessment:** Not harmful, just unnecessary bytes in the index. Could be useful if indexes are ever consolidated into a single multi-type index.

---

## Summary: Can Search Return Deleted/Banned Content?

| Scenario | Can it appear in search? | Why |
|----------|------------------------|-----|
| Post with `isRemoved: true` | **NO** (if delete job succeeded) | `onUnpublish` removes from index; Prisma fallback filters `isRemoved: false`; JS post-filter checks `isRemoved` |
| Post with `isRemoved: true` (delete job failed) | **YES for up to 7 days** | Reconciliation cron catches it within 7 days; after that, permanently stale |
| Post with `isRemoved: true` (job failed, >7 days old) | **YES permanently** | No mechanism to catch stale documents older than 7 days |
| Banned user | **NO** (if admin ban flow succeeded) | Admin `banUser()` calls `onUnpublish` for user + all their content |
| Banned user (ban job failed) | **YES for up to 7 days** | Reconciliation catches banned users within 7 days |
| Deactivated user | **YES** | `deactivate()` does NOT remove from index; no post-filter for `isDeactivated` |
| User registered via mobile (not webhook) | **NOT indexed at all** | `register()` does not call `addSearchIndexJob` |
| Deleted user (privacy delete) | **NO** | Privacy service explicitly queues delete jobs for user + all content |
| Channel (any state) | **Never in Meilisearch** | No index exists; always falls back to Prisma |
| Hashtag | **May be stale** | Only enters index via weekly cron or full sync; never indexed on creation |
| Post visibility changed to FOLLOWERS | **Possibly yes** | Re-indexed with new visibility, but relies on JS post-filter to exclude |

---

## Remediation Priority

| ID | Severity | Effort | Fix |
|----|----------|--------|-----|
| C1 | CRITICAL | Small | Add `addSearchIndexJob` or `publishWorkflow.onPublish` call in `register()` |
| C2 | CRITICAL | Small | Add `publishWorkflow.onUnpublish` call in `deactivate()` and `publishWorkflow.onPublish` in `reactivateAccount()` |
| C3 | CRITICAL | Medium | Create `channels` index in `MeilisearchService.onModuleInit()`, add indexing to channels CRUD, add to sync/reconciliation |
| C4 | CRITICAL | Medium | Make `syncAll()` a true reconciliation: fetch all Meilisearch document IDs, compare against DB, delete orphans |
| H1 | HIGH | Medium | Use Meilisearch server-side `filter` parameter instead of JS post-filtering; fix pagination |
| H2 | HIGH | Small | Add `isDeactivated` check to JS post-filter (interim) or fix via server-side filter |
| H3 | HIGH | Small | Add `addSearchIndexJob` calls for hashtag creation/update in post/thread creation flows |
| H4 | HIGH | Small | Check `response.ok` in `deleteDocument()`, log/throw on non-2xx |
| H5 | HIGH | Medium | Remove 7-day window from reconciliation or add a separate monthly full-table reconciliation |
| H6 | HIGH | Small | Add hashtag count reconciliation in privacy delete (or accept stale counts) |
| M1 | MEDIUM | Small | Add `isBanned, isDeactivated, isDeleted` to users index filterable attributes |
| M2 | MEDIUM | Small | Audit `cancelSchedule()` to check if content was already published and needs de-indexing |
| M3 | MEDIUM | Small | Promote indexing failures from warn to error level; add Sentry capture |
| M4 | MEDIUM | Small | Covered by C3 |
| M5 | MEDIUM | Small | Add cursor pagination to reconciliation queries |
| M6 | MEDIUM | Small | Log a warning when `onPublish` is called without `indexDocument` |
| M7 | MEDIUM | Small | Use Meilisearch `filter` to enforce visibility at query time (covered by H1) |
