# R2 TAB4 Progress — Cross-Module Payments/Messages/Notifications + Mobile API Parity + Performance

**Started:** 2026-04-01
**Audit files:** X02(~12) + X03(34) + X05(21) + X08(~4) + X10(22) + J07(~3) + J08(~15) + J01(~4) + K03(5) = ~120 findings
**Status:** IN PROGRESS

---

## Fix Log

### K03 — Counter Reconciliation SQL Table Names (13 wrong references)

| # | Sev | Status | Fix |
|---|-----|--------|-----|
| K03-1 | C | FIXED | `"Post".id` → `"posts".id` in reconcilePostCounts (likesCount UPDATE, line 114) |
| K03-1b | C | FIXED | `"Post".id` → `"posts".id` in reconcilePostCounts (commentsCount UPDATE, line 135) |
| K03-1c | C | FIXED | `"Post" p` → `"posts" p` in reconcileUserPostCounts (SELECT JOIN, line 160) |
| K03-1d | C | FIXED | `"Post".id` → `"posts".id` in reconcilePostSavesCounts (UPDATE, line 207) |
| K03-1e | C | FIXED | `"Post" s` → `"posts" s` in reconcilePostSharesCounts (SELECT JOIN, line 228) |
| K03-1f | C | FIXED | `"Post".id` → `"posts".id` in reconcilePostSharesCounts (UPDATE, line 241) |
| K03-2 | C | FIXED | `"Reel" r` → `"reels" r` in reconcileUserContentCounts (SELECT JOIN, line 372) |
| K03-2b | C | FIXED | `"Reel".id` → `"reels".id` in reconcileReelCounts (likesCount UPDATE, line 415) |
| K03-2c | C | FIXED | `"Reel".id` → `"reels".id` in reconcileReelCounts (commentsCount UPDATE, line 432) |
| K03-4 | C | FIXED | `"Video".id` → `"videos".id` in reconcileVideoCounts (likesCount UPDATE, line 515) |
| K03-4b | C | FIXED | `"Video".id` → `"videos".id` in reconcileVideoCounts (commentsCount UPDATE, line 532) |
| K03-5 | C | FIXED | `"Post" p` → `"posts" p` in reconcileHashtagCounts (SELECT JOIN, line 556) |
| K03-5b | C | FIXED | `"Hashtag".id` → `"hashtags".id` in reconcileHashtagCounts (UPDATE, line 565) |
| K03-3 | — | NOT NEEDED | Thread UPDATEs already used `"threads".id` correctly |

**Verification:** `grep -n '"Post"\|"Reel"\|"Thread"\|"Video"\|"Hashtag"' counter-reconciliation.service.ts` returns 0 matches.

---
