# FIX SESSION — Round 3 Tab 3: Components & Hooks (Wave 12: C01-C04)

> 202 findings. UI components, domain components, hooks, mobile services.

---

## ANTI-FAILURE RULES (learned from Round 2 agent failures)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will read every file you touched, verify every fix, count your tests, and check your accounting. Previous agents: wrote TODO comments as "FIXED" (caught), inflated counts by 20 (caught), silently skipped 50% (caught), wrote zero tests (caught). Assume every claim is verified.

### RULE 1: TOTAL ACCOUNTING
Every finding listed by ID. FIXED + DEFERRED + DISPUTED = TOTAL. If C01 has 64 findings, all 64 appear in your progress file.

### RULE 2: TESTS MANDATORY — minimum 20
Component fixes need visual behavior tests or at minimum snapshot/render tests. Hook fixes need hook testing. Service fixes need unit tests. `toBeDefined()` alone does not count.

### RULE 3: "FIXED" = code changed + test passes
### RULE 4: Pattern completion — grep entire scope
### RULE 5: No inflated counts
### RULE 6: Deferred needs a reason
### RULE 7: Read before edit
### RULE 8: Checkpoint = tests + tsc + commit

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read ALL 4 audit files IN FULL:
   - `docs/audit/v2/wave12/C01.md` (64 findings — 49 UI components)
   - `docs/audit/v2/wave12/C02.md` (70 findings — Domain components: saf/bakra/majlis/risalah/story/editor)
   - `docs/audit/v2/wave12/C03.md` (28 findings — 28 hooks)
   - `docs/audit/v2/wave12/C04.md` (42 findings — 38 mobile services)
4. Create: `docs/audit/v2/fixes/R3_TAB3_PROGRESS.md`

---

## YOUR SCOPE

```
apps/mobile/src/components/ui/         (C01 — UI components)
apps/mobile/src/components/saf/        (C02 — Saf/feed domain components)
apps/mobile/src/components/bakra/      (C02 — Bakra/reels domain components)
apps/mobile/src/components/majlis/     (C02 — Majlis/threads domain components)
apps/mobile/src/components/risalah/    (C02 — Risalah/messages domain components)
apps/mobile/src/components/story/      (C02 — Story domain components)
apps/mobile/src/components/editor/     (C02 — Video editor domain components)
apps/mobile/src/hooks/                 (C03 — hooks)
apps/mobile/src/services/              (C04 — mobile services, EXCEPT signal/ which R2 Tab 3 handled)
```

**FORBIDDEN:**
- `apps/mobile/src/services/signal/` (R2 Tab 3 already handled crypto)
- `apps/mobile/app/` screen files (Wave 4 — future round)
- `apps/api/` (Tabs 1, 2 handle backend)
- `schema.prisma` (Tab 4)
- Deleting dead components that Tab 2 (architecture) is tracking — coordinate

**ALREADY FIXED — verify, don't re-fix:**
- C04 `livekit.ts` URL construction (R2 Tab 4 fixed X10 API parity)
- Signal services (R2 Tab 3 handled all F01-F08)

---

## KEY FINDINGS

### C01 — UI Components (64 findings)
**Criticals:**
- Timer leaks on unmount (VideoPlayer, Toast, CaughtUpCard)
- Raw RN Image in LinkPreview (should be ProgressiveImage)
- StatusBar stuck hidden after modal dismiss

**Highs:**
- Skeleton component missing accessible labels
- BottomSheet missing keyboard avoidance
- Icon barrel import (80+ icons in initial bundle)

### C02 — Domain Components (70 findings)
**Critical:** PostCard animation setTimeout not cleaned on unmount
**Highs:**
- StoryRow inline renderItem defeats memoization
- StickerPackBrowser no image dimension hints (layout shifts)
- VideoEditor 2,606 lines — god component

### C03 — Hooks (28 findings)
**Highs:**
- useAutoUpdateTimestamp interval never readjusted
- useVideoPreloader loadStates Map grows without bound

### C04 — Mobile Services (42 findings)
**Criticals:**
- `livekit.ts` constructs broken URLs (VERIFY: may be fixed in R2 Tab 4)
- AppState listener in signal/index.ts never removed (VERIFY: may be fixed in R2 Tab 3)

**Highs:**
- `api.ts` error handling swallows status codes
- `widgetData.ts` service exists but no native widget module

---

## MOBILE-SPECIFIC RULES

### Timer/Listener Cleanup Pattern
Every `setTimeout`, `setInterval`, `addEventListener`, `AppState.addEventListener` MUST be cleaned up on unmount:
```typescript
useEffect(() => {
  const timer = setTimeout(() => { ... }, delay);
  return () => clearTimeout(timer); // CLEANUP
}, []);
```

### Memoization Pattern
- `renderItem` for FlatList/FlashList MUST be `useCallback`
- Style objects MUST be `useMemo` or moved to `StyleSheet.create`
- `ListEmptyComponent` MUST NOT be an inline arrow function

### Image Pattern
- Use `<ProgressiveImage>` not raw `<Image>` for content
- Use `<Icon name="..." />` not text emoji
- Provide `style={{ width, height }}` to prevent layout shifts

---

## FIX ORDER
1. **Timer leaks** (C01 criticals) — memory leaks, ANR risk
2. **C04 service fixes** — verify R2 fixes, handle remaining
3. **C03 hook fixes** — memory leaks, unbounded growth
4. **C02 domain component memoization** — render performance
5. **C01 remaining** — UI polish
6. **Accounting** — document every finding

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
cd apps/mobile && npx jest --config src/services/signal/__tests__/jest.config.js
```

---

## DELIVERABLES
- 202/202 findings documented
- All timer/listener leaks fixed with cleanup returns
- Memoization fixes for hot-path components
- 20+ tests for hooks and services
- Zero new TypeScript errors

**202 findings. 202 documented. Every timer cleaned. Every leak plugged. Begin.**
