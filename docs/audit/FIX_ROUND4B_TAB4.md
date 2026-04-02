# FIX SESSION — Round 4B Tab 4: Community Screens + Edit Screens (D09 + D16)

> 137 findings across 10 screens. D09: community-guidelines, community-posts, contact-sync, content-filter-settings, content-settings. D16: edit-channel, edit-profile, eid-cards, enable-tips, end-screen-editor.

---

## RULES — NON-NEGOTIABLE (learned from 16 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will verify every claimed fix at the code level. Previous agents invented fake categories, inflated counts, and deferred 47%. Zero tolerance.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL_IN_FILES`. D09 has 84, D16 has 53. All 137 documented. No "REMAINING." No silent skips.

### RULE 2: DEFERRAL CAP — 15% HARD LIMIT
Maximum 20 items. Each needs a SPECIFIC TECHNICAL BLOCKER — not "low priority" or "polish."

### RULE 3: FIX ALL SEVERITIES — Low and Info are NOT optional
A Low-severity hardcoded color takes 30 seconds. An Info-severity dead import takes 10 seconds. Fix them ALL.

### RULE 4: "FIXED" = CODE CHANGED (not TODO, not comment)

### RULE 5: TESTS — minimum 20

### RULE 6: READ BEFORE EDIT

### RULE 7: PATTERN COMPLETION — fix same pattern across ALL 10 screens

### RULE 8: CHECKPOINT = TSC + COMMIT after every 2-3 screens

### RULE 9: NO SUBAGENTS FOR CODE

### RULE 10: NO CO-AUTHORED-BY

---

## STEP 0 — MANDATORY BOOTSTRAP

1. Read `CLAUDE.md` — especially Mobile Screen Rules (components, hooks, theme tokens, i18n)
2. Read `~/.claude/projects/C--dev-mizanly/memory/MEMORY.md` and every file it references
3. Read BOTH audit files IN FULL:
   - `docs/audit/v2/wave4/D09.md` (84 findings — community-guidelines, community-posts, contact-sync, content-filter-settings, content-settings)
   - `docs/audit/v2/wave4/D16.md` (53 findings — edit-channel, edit-profile, eid-cards, enable-tips, end-screen-editor)
4. Create: `docs/audit/v2/fixes/R4B_TAB4_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

```
apps/mobile/app/(screens)/community-guidelines.tsx      (117 lines)
apps/mobile/app/(screens)/community-posts.tsx            (663 lines)
apps/mobile/app/(screens)/contact-sync.tsx               (345 lines)
apps/mobile/app/(screens)/content-filter-settings.tsx    (377 lines)
apps/mobile/app/(screens)/content-settings.tsx           (521 lines)
apps/mobile/app/(screens)/edit-channel.tsx               (356 lines)
apps/mobile/app/(screens)/edit-profile.tsx               (815 lines)
apps/mobile/app/(screens)/eid-cards.tsx                  (228 lines)
apps/mobile/app/(screens)/enable-tips.tsx                (681 lines)
apps/mobile/app/(screens)/end-screen-editor.tsx          (626 lines)
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks, any screen NOT listed above.

**SPECIAL NOTES:**
- `end-screen-editor.tsx` has a CRITICAL finding: `setState` inside `useQuery.select` callback causes render-during-render violation. This is a real crash bug — fix it by moving the state update to a `useEffect` that watches the query data.
- `edit-profile.tsx` (815 lines) handles avatar/cover uploads, bio editing, display name — multiple mutation error paths to handle.
- `contact-sync.tsx` handles phone contacts — ensure permission error handling is robust.
- `community-guidelines.tsx` is only 117 lines — should be quick to fix.

---

## COMMON FIX PATTERNS

### Theme-aware colors
```typescript
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return <EmptyState icon="alert-circle" title={t('common.error')} action={{ label: t('common.retry'), onPress: refetch }} />;
if (!data?.length) return <EmptyState icon="inbox" title={t('screen.empty')} />;
```

### i18n — ALL 8 languages (en, ar, tr, ur, bn, fr, id, ms)
No hardcoded English. Use Node JSON parse/write — NEVER sed.

### RTL support
`marginLeft→marginStart`, `paddingRight→paddingEnd`, `left→start`, `right→end`, `flexDirection: rtlFlexRow(isRTL)`.

### Render-during-render fix pattern (for end-screen-editor CRITICAL)
```typescript
// WRONG — setState inside useQuery.select:
useQuery({
  select: (data) => {
    setSomeState(data.value);  // CRASH: render-during-render
    return data;
  }
});

// RIGHT — useEffect to sync:
const { data } = useQuery({ queryKey: [...], queryFn: ... });
useEffect(() => {
  if (data?.value) setSomeState(data.value);
}, [data?.value]);
```

### Cleanup, haptic, error handling, double-tap, press feedback
Same patterns as previous R4 prompts.

---

## FIX ORDER
1. **CRITICAL:** end-screen-editor render-during-render (crash bug)
2. Highs (broken features, invisible text, security)
3. Mediums (theme, error handling, RTL)
4. Lows (press feedback, spacing, cosmetic)
5. Infos (dead imports, suggestions)

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES
- 137/137 findings documented
- Max 20 deferred with specific blockers
- 20+ new tests
- end-screen-editor crash fixed (render-during-render)
- edit-profile: all mutation error paths handled
- contact-sync: permission error handling robust
- All 10 screens theme-aware, RTL-ready, i18n complete
- Progress file with per-screen tables and accurate counts

**137 findings. 137 documented. Every Low. Every Info. Begin.**
