# Wave 2 Seam: Publication → Search Index Truth Matrix

## Summary
51 mutation paths audited. Only 5 correctly update search index. 2 update with bugs. 44 do NOT update when they should. PublishWorkflowService is dead code — the fix was built but never wired.

## Complete Matrix

### Posts (11 mutations → 1 correctly indexed)
| Mutation | Indexed? | Evidence |
|----------|----------|---------|
| create | **NO** | posts.service.ts:477-731 — zero addSearchIndexJob calls |
| update | **NO** | posts.service.ts:777-807 |
| delete | YES ✓ | posts.service.ts:834-836 |
| schedule-publish | **NO** | Cron only nullifies scheduledAt |
| auto-mod remove | YES ✓ (delete) | posts.service.ts:1674-1676 |
| moderator remove | **NO** | moderation.service.ts:277-280 |
| content-safety remove | **NO** | content-safety.service.ts:296-300 |
| ban-author | **NO** | No content search cleanup |
| unban-author | **NO** | No re-indexing |
| delete-account | **NO** | users.service.ts:270-272 |

### Reels (10 mutations → 1 correct, 1 buggy)
| Mutation | Indexed? | Evidence |
|----------|----------|---------|
| create | WRONG FIELD | `description` vs searchable `caption` — search returns zero results for reel captions |
| update | **NO** | reels.service.ts:452-466 |
| delete | YES ✓ | reels.service.ts:538-540 |
| publishTrial | **NO** | reels.service.ts:546-557 |
| stream ready | **NO** | stream.service.ts:173-185 |
| auto-mod remove | YES ✓ (delete) | reels.service.ts:1170-1172 |
| content-safety remove | **NO** | |
| ban/delete-account | **NO** | |

### Threads (7 mutations → 1 correct)
| create | **NO** | threads.service.ts:329-432 |
| update | **NO** | threads.service.ts:472-482 |
| delete | YES ✓ | threads.service.ts:547-549 |
| All others | **NO** | |

### Videos (8 mutations → 1 correct, 1 buggy)
| create | STALE STATUS | Indexed as PROCESSING, never updated to PUBLISHED |
| update | **NO** | videos.service.ts:393-435 |
| delete | YES ✓ | videos.service.ts:463-465 |
| stream ready (→PUBLISHED) | **NO** | stream.service.ts:158-169 |
| startPremiere (→PUBLISHED) | **NO** | videos.service.ts:952-968 |
| All others | **NO** | |

### Users (8 mutations → 0 correct)
| ALL mutations | **NO** | Zero addSearchIndexJob anywhere in users module |
| Ban/unban/deactivate/delete | **NO** | Banned/deleted users remain searchable |

### Hashtags (2 mutations → 0 correct)
| ALL mutations | **NO** | Created via upsert, counts via increment — never indexed |

## Reconciliation Coverage
| Content Type | Weekly Cron? | Covers Delete? | Max Items | Missing Fields |
|-------------|-------------|----------------|-----------|----------------|
| Posts | YES | YES | 1000 | username, postType, visibility, likesCount |
| Threads | YES | **NO** | 1000 | username, visibility, likesCount |
| Reels | YES | **NO** | 1000 | username, likesCount, viewsCount |
| Videos | **NO** | **NO** | - | - |
| Users | **NO** | **NO** | - | - |
| Hashtags | **NO** | **NO** | - | - |

## Reel Caption Field Name Chaos
- reels.service.ts create: `description`
- search-reconciliation.service.ts: `content`
- meilisearch-sync.service.ts: `content`
- Meilisearch searchableAttributes config: `caption`
- **None match the configured searchable attribute → reel caption search is completely broken**

## Root Cause
PublishWorkflowService was built as the centralized solution but never injected into any content service. Each service was supposed to call `onPublish()`/`onUnpublish()` but none do. The 44 missing index paths would all be fixed by wiring this single service.
