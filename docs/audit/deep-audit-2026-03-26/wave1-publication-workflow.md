# Wave 1: Publication Workflow Truth Audit

## Summary
11 findings. 1 CRITICAL, 2 HIGH, 6 MEDIUM, 2 LOW. Root cause: PublishWorkflowService dead code.

## CRITICAL
### F1: PublishWorkflowService is dead code — never called by any content service
- **Evidence:** Zero references from posts/reels/threads/stories/videos services. Grep confirmed.
- **Impact:** Side effects (search indexing, cache, events) are ad-hoc per service, leading to inconsistencies.

## HIGH
### F2: Scheduled content triggers side effects immediately at creation
- **Files:** posts.service.ts:562, reels.service.ts:155, threads.service.ts:397
- **Evidence:** Notifications (mention, tag, collaborator), gamification XP, moderation all fire at creation regardless of scheduledAt
- **Failure:** User gets "@mentioned" notification but post doesn't exist yet (404 on click)

### F3: getById doesn't check scheduledAt — scheduled content accessible by direct ID
- **Files:** posts.service.ts:734, reels.service.ts:469, threads.service.ts:435
- **Failure:** Anyone with content ID can view it before scheduled publication

## MEDIUM
### F4: Interaction methods (react/save/share/comment) don't guard scheduledAt
### F5: Video getRecommended missing isRemoved filter
### F6: ThreadsService.getUserThreads hides owner's scheduled threads
### F7: Draft-to-published has no atomic workflow (client-side two-step)
### F8: Reel drafts conflate PROCESSING with DRAFT status
### F9: Video stream error leaves inflated channel videosCount

## LOW
### F10: Stories use different lifecycle (isArchived vs isRemoved)
### F11: Reel hashtag counter increment outside transaction
