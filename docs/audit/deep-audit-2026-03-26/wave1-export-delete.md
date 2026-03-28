# Wave 1: Export/Delete GDPR Compliance Audit

## Summary
10 findings. 2 CRITICAL, 4 HIGH, 3 MEDIUM, 1 LOW. Deletion system is structurally non-compliant with GDPR Articles 17 and 20.

## CRITICAL

### F1: Scheduled deletion cron queries WRONG FIELD — will NEVER fire
- **File:** `privacy.service.ts:18-23`
- **Evidence:** Cron queries `deletedAt: { lte: now }` but requestAccountDeletion sets `scheduledDeletionAt`. The `deletedAt` field stays null.
- **Failure:** Every 30-day grace period deletion request is a permanent black hole. Users are NEVER actually deleted.

### F2: No media files deleted from R2/Cloudflare Stream on account deletion
- **Files:** `users.service.ts:238-316`, `privacy.service.ts:199-298`
- **Evidence:** Only soft-deletes DB records. Never calls uploadService.deleteFile(). TODO at line 291.
- **Failure:** All user media (photos, videos, voice) remains publicly accessible at R2 URLs forever after deletion.

## HIGH

### F3: No Meilisearch index cleanup on deletion
- **Evidence:** TODO at privacy.service.ts line 292 but no implementation

### F4: Messages NOT anonymized or deleted
- **Evidence:** Neither deletion method touches messages. Content field remains intact.
- **Failure:** Other conversation members read all deleted user's messages verbatim

### F5: ~30+ tables missed in privacy deletion (including GDPR Art 9 religious data)
- **Missing:** PrayerNotificationSetting, DhikrSession, FastingLog, HajjProgress, HifzProgress, QuranReadingPlan, FeedInteraction, UserInterest, ScreenTimeLog, DraftPost, SavedSearch, and 20+ more
- **Critical:** Religious practice data (GDPR Art 9 "special category") persists forever

### F6: Two divergent deletion implementations with different coverage
- **Evidence:** users.service.ts covers some tables privacy.service.ts misses, and vice versa. Neither is complete.

## MEDIUM

### F7: Export missing ~15+ data categories (GDPR Art 20)
### F8: Two export endpoints with different completeness
### F9: No hard-delete phase exists — soft-delete only, content text never erased

## LOW
### F10: Chat export filters deleted messages + can't handle E2E encrypted content
