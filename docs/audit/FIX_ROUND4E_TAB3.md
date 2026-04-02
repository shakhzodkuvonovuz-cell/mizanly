# YOU ARE TAB 3. YOUR AUDIT FILES ARE D18 + D32. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4E Tab 3: Followed Topics/Followers/Following/Gift Shop/Go Live + Saved/Saved Messages/Schedule Live/Schedule Post/Scholar Verification (D18 + D32)

> 120 findings across 10 screens. D18 (58): followed-topics, followers/[userId], following/[userId], gift-shop, go-live. D32 (62): saved, saved-messages, schedule-live, schedule-post, scholar-verification.
> **YOUR JOB: Read D18.md + D32.md. Fix the findings in THOSE files. Nothing else.**

---

## RULES — NON-NEGOTIABLE (distilled from 24 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row, verify every "FIXED" claim at the code level, and cross-check your accounting equation. Across 24 sessions: invented "REMAINING" (63 hidden items), inflated FIXED by 26, fabricated reference counts, deferred 47%, TODO comments as "FIXED", 6 false FIXED claims caught by self-audit. The best agent: 1.5% deferral, 75 tests, self-corrected its own inflation. Be that agent.

### RULE 1: TOTAL ACCOUNTING
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. D18=58, D32=62. All 120 documented. No "REMAINING." No silent skips.

### RULE 2: DEFERRAL CAP — 15% (max 18)
Specific technical blockers only. "Low priority" / "polish" / "enhancement" are NOT valid. If fixable in under 5 minutes, fix it.

### RULE 3: FIX ALL SEVERITIES — Low and Info are mandatory
30 seconds for a hardcoded color. 10 seconds for a dead import. Fix them ALL.

### RULE 4: "FIXED" = CODE CHANGED. Not a TODO. Not "works fine." The auditor diffs.

### RULE 5: "NOT_A_BUG" REQUIRES 1-SENTENCE EVIDENCE
GOOD: "Alert.alert correct — this IS a destructive action (delete)." BAD: "Acceptable."

### RULE 6: TESTS — minimum 20 meaningful tests

### RULE 7: READ BEFORE EDIT — Read tool first, understand context.

### RULE 8: PATTERN COMPLETION — fix same pattern across ALL 10 screens. Auditor greps.

### RULE 9: CHECKPOINT = TSC + COMMIT after each D file.
Format: `fix(mobile): R4E-T3 CP[N] — [screens] [summary]`

### RULE 10: NO SUBAGENTS. NO CO-AUTHORED-BY.

### RULE 11: SELF-AUDIT + HONESTY PASS
Count rows. Sum. Compare to summary. Then verify every FIXED claim has actual code change. Document corrections.

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules:
   - `<Skeleton>` not `<ActivityIndicator>` for loading
   - `<EmptyState>` not bare text for empty/error
   - `<BottomSheet>` not `<Modal>`
   - `showToast()` not `Alert.alert` for non-destructive
   - `<BrandedRefreshControl>` not raw `<RefreshControl>`
   - `<ProgressiveImage>` not raw `<Image>` for content
   - `useContextualHaptic()` not `useHaptic()`
   - `useThemeColors()` → `tc.*` not `colors.dark.*`
   - `radius.*` not hardcoded borderRadius
   - `formatCount()` for numbers

2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references.

3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D18.md` (58 findings — followed-topics, followers/[userId], following/[userId], gift-shop, go-live)
   - `docs/audit/v2/wave4/D32.md` (62 findings — saved, saved-messages, schedule-live, schedule-post, scholar-verification)

4. Create: `docs/audit/v2/fixes/R4E_TAB3_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
# D18 screens
apps/mobile/app/(screens)/followed-topics.tsx       (476 lines)
apps/mobile/app/(screens)/followers/[userId].tsx     (216 lines)
apps/mobile/app/(screens)/following/[userId].tsx     (216 lines)
apps/mobile/app/(screens)/gift-shop.tsx              (774 lines)
apps/mobile/app/(screens)/go-live.tsx                (436 lines)

# D32 screens
apps/mobile/app/(screens)/saved.tsx                  (549 lines)
apps/mobile/app/(screens)/saved-messages.tsx         (270 lines)
apps/mobile/app/(screens)/schedule-live.tsx           (501 lines)
apps/mobile/app/(screens)/schedule-post.tsx           (942 lines)
apps/mobile/app/(screens)/scholar-verification.tsx    (649 lines)
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks, screens not listed above.

**CRITICAL SPECIAL NOTES — read carefully:**

- **`gift-shop.tsx` (774 lines) — CRITICAL: Credits coins BEFORE Stripe payment confirmation (D18 #33).** The coin crediting happens optimistically before `confirmPayment`. If payment fails, user has free coins. Fix: move coin credit to `onSuccess` callback AFTER Stripe confirmation, or add a server-side verification step that checks PaymentIntent status before crediting.

- **`schedule-post.tsx` (942 lines) — CRITICAL: Scheduled posts NEVER publish (D32 #1 C38).** Backend auto-publisher is not implemented. Posts are created with `scheduledAt` timestamp but no backend cron/worker picks them up for publication. This is a BACKEND issue — DEFER with note: "backend auto-publisher worker not implemented; scheduled posts created but never published at scheduledAt time." Fix the FRONTEND findings only (theme, RTL, etc).

- **`saved-messages.tsx` (270 lines) — CRITICAL: Delete with no confirmation (D32 #2 C17).** One tap permanently deletes saved notes with no dialog. Add `Alert.alert` confirmation before delete (this IS a destructive action, so Alert.alert is correct per CLAUDE.md rules).

- **`followers/[userId].tsx` and `following/[userId].tsx` (216 lines each) — Nearly identical files.** Whatever pattern you fix in one, apply to the other immediately. The auditor will check both.

- **`saved.tsx` (549 lines) — D32 #11: Collection filtering is broken.** `activeCollection` is computed but never passed to query function. The query key also doesn't include it, so cached data from wrong collection is shown. Fix: pass `activeCollection` to the API call and include in query key. If the API function doesn't accept a collection param, DEFER with specific blocker.

- **`saved.tsx` — D32 #6: Wrong query key.** Query key `['saved-posts']` doesn't include `activeCollection`. Fix: `['saved-posts', activeCollection]`.

- **`go-live.tsx` (436 lines) — D18 notes: Go Live button never starts a stream and date picker is a non-functional placeholder.** These may be backend-blocked. If the API endpoints don't exist, DEFER with specific blocker. If the UI code just doesn't call the right API, fix it.

- **`followed-topics.tsx` — D18 #12: Timer leak.** `searchTimeout.current` is never cleaned up on unmount. Add cleanup return.

- **`schedule-live.tsx` and `schedule-post.tsx` — D32 notes: 9+ and 18+ hardcoded dark colors respectively.** These screens are "completely broken in light mode." Systematic `colors.text.*` → `tc.text.*` replacement needed.

- **`scholar-verification.tsx` (649 lines) — D32: 10+ hardcoded dark colors.** Same light-mode breakage.

- **`followers/[userId].tsx` + `following/[userId].tsx` — HIGH: Error renders OUTSIDE ScreenErrorBoundary (D18 #13, #23).** If the query fails, the error component renders in a position that bypasses the screen's error boundary. Fix: move error handling inside the boundary or use the query's error state properly.

- **`gift-shop.tsx` — HIGH: No pagination on gift history (D18 #34).** Active users with many purchases see only the first page. Add `onEndReached` infinite scroll.

- **`gift-shop.tsx` — HIGH: Shared `isPending` across all Buy buttons (D18 #35).** One button's loading state disables ALL Buy buttons. Fix: use per-item mutation tracking.

- **`schedule-live.tsx` — HIGH: `liveApi.create()` may not exist (D32 #34).** The screen calls a create function that might not be implemented in the API client. Verify the function exists; if not, DEFER with specific blocker.

- **`schedule-post.tsx` — HIGH: Broken reel creation (D32 #39).** Creates reel with empty `videoUrl` and `duration: 0`. This is data corruption. Fix: validate required fields before mutation.

- **NOTE on D32 finding references:** D32 #38 = schedule-post auto-publisher (C severity). D32 #17 = saved-messages delete without confirmation (C severity). Use these finding NUMBERS when referencing in your progress file.

---

## COMMON FIX PATTERNS — apply to EVERY screen

### Theme-aware colors
```typescript
const tc = useThemeColors();
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return (
  <EmptyState icon="alert-circle" title={t('common.error')}
    action={{ label: t('common.retry'), onPress: refetch }} />
);
if (!data?.length) return <EmptyState icon="inbox" title={t('screen.noItems')} />;
```

### i18n — ALL 8 languages
```typescript
// Add keys to ALL 8 files: en, ar, tr, ur, bn, fr, id, ms
// Use Node JSON parse/write — NEVER sed
```

### RTL support
```typescript
marginStart: 8, start: 0, flexDirection: rtlFlexRow(isRTL)
```

### Cleanup on unmount
```typescript
useEffect(() => {
  const timer = setTimeout(() => { ... }, 1000);
  return () => { clearTimeout(timer); };
}, []);
```

### Haptic + Mutation error handling + Double-tap + Press feedback
```typescript
const haptic = useContextualHaptic();
// onSuccess: haptic.success() + showToast
// onError: haptic.error() + showToast
// disabled={mutation.isPending}
// style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
```

---

## WORK ORDER

1. **D18 first** (5 screens, 58 findings) — START with gift-shop Critical payment bug
2. **Checkpoint 1:** `npx tsc --noEmit` → commit `fix(mobile): R4E-T3 CP1 — D18 screens`
3. **D32 second** (5 screens, 62 findings) — START with saved-messages Critical delete bug, then saved query key fix
4. **Checkpoint 2:** `npx tsc --noEmit` → commit `fix(mobile): R4E-T3 CP2 — D32 screens`
5. **Tests:** write 20+ tests → commit `test(mobile): R4E-T3 — [N] tests`
6. **Self-audit + honesty pass** → final commit if needed

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES

- **120/120 findings documented** with per-screen tables
- **Max 18 deferred** with specific technical blockers. Target <10.
- **20+ meaningful tests**
- **All 10 screens:** theme-aware, RTL-ready, i18n complete, haptic, error handling, cleanup
- **gift-shop.tsx:** Coins not credited before payment confirmation
- **saved-messages.tsx:** Delete confirmation dialog added
- **saved.tsx:** Query key includes activeCollection
- **schedule-post.tsx:** Backend auto-publish DEFERRED with clear blocker
- **Progress file** with self-audit + honesty pass
- **2-3 atomic commits**

**120 findings. 120 documented. Every Low fixed. Every Info addressed. Self-audit. Honesty-pass. Begin.**
