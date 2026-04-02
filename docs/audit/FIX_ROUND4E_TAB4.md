# YOU ARE TAB 4. YOUR AUDIT FILES ARE D19 + D28 + D29 + D30. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4E Tab 4: HEAVY TAB — 20 Screens across 4 Audit Files (D19 + D28 + D29 + D30)

> 221 findings across 20 screens. D19 (55): green-screen-editor, hadith, hajj-companion, hajj-step, halal-finder. D28 (60): product-detail, profile/[username], profile-customization, qibla-compass, qr-code. D29 (50): qr-scanner, quiet-mode, quran-reading-plan, quran-room, quran-share. D30 (56): ramadan-mode, reel/[id], reel-remix, reel-templates, report.
> **YOUR JOB: Read D19.md + D28.md + D29.md + D30.md. Fix the findings in THOSE files. Nothing else.**
> **This is the heaviest tab (221 findings, 20 screens). Work METHODICALLY — one D file at a time, checkpoint after each.**

---

## RULES — NON-NEGOTIABLE (distilled from 24 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row, verify every "FIXED" claim at the code level, and cross-check your accounting equation. Across 24 sessions: invented "REMAINING" (63 items), inflated FIXED by 26, fabricated reference counts, deferred 47%, TODO as "FIXED", 6 false FIXED caught by self-audit, Tab 2 R2 silently dropped 95/190 findings. You have the most findings — the auditor will scrutinize you most. Do NOT skip findings silently. Do NOT inflate counts.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. D19=55, D28=60, D29=50, D30=56. All 221 documented. No "REMAINING." No silent skips.

### RULE 2: DEFERRAL CAP — 15% (max 33)
Specific technical blockers only. Target <20. "Low priority" / "polish" / "enhancement" NOT valid. If fixable in under 5 minutes, fix it.

### RULE 3: FIX ALL SEVERITIES — Low and Info are mandatory
30 seconds for a hardcoded color. 10 seconds for a dead import. Fix them ALL.

### RULE 4: "FIXED" = CODE CHANGED. Not a TODO. Not "works fine." The auditor diffs.

### RULE 5: "NOT_A_BUG" REQUIRES 1-SENTENCE EVIDENCE
GOOD: "Overlay uses white text on dark gradient — tc.text.primary would be invisible." BAD: "Works fine."

### RULE 6: TESTS — minimum 40 meaningful tests (20 screens = more tests)
2 tests per screen minimum. Tests must assert behavior, not just existence.

### RULE 7: READ BEFORE EDIT — Read tool first, understand context.

### RULE 8: PATTERN COMPLETION — fix same pattern across ALL 20 screens. Auditor greps.

### RULE 9: CHECKPOINT = TSC + COMMIT after EACH D file (4 checkpoints)
Format: `fix(mobile): R4E-T4 CP[N] — [D-file screens] [summary]`

### RULE 10: NO SUBAGENTS. NO CO-AUTHORED-BY.

### RULE 11: SELF-AUDIT + HONESTY PASS
After ALL 4 D files: count per-screen rows, sum, compare to summary. Then verify every FIXED claim has actual code change. Document: "Self-audit: X FIXED + Y DEFERRED + Z NOT_A_BUG + W ALREADY_FIXED = 221. Honesty pass: [N corrected or 'all genuine']."

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

3. Read ALL FOUR audit files IN FULL — every row, every finding:
   - `docs/audit/v2/wave4/D19.md` (55 findings — green-screen-editor, hadith, hajj-companion, hajj-step, halal-finder)
   - `docs/audit/v2/wave4/D28.md` (60 findings — product-detail, profile/[username], profile-customization, qibla-compass, qr-code)
   - `docs/audit/v2/wave4/D29.md` (50 findings — qr-scanner, quiet-mode, quran-reading-plan, quran-room, quran-share)
   - `docs/audit/v2/wave4/D30.md` (56 findings — ramadan-mode, reel/[id], reel-remix, reel-templates, report)

4. Create: `docs/audit/v2/fixes/R4E_TAB4_PROGRESS.md`

---

## YOUR SCOPE — 20 screens

```
# D19 screens
apps/mobile/app/(screens)/green-screen-editor.tsx   (962 lines)
apps/mobile/app/(screens)/hadith.tsx                (558 lines)
apps/mobile/app/(screens)/hajj-companion.tsx         (557 lines)
apps/mobile/app/(screens)/hajj-step.tsx              (470 lines)
apps/mobile/app/(screens)/halal-finder.tsx           (355 lines)

# D28 screens
apps/mobile/app/(screens)/product-detail.tsx         (734 lines)
apps/mobile/app/(screens)/profile/[username].tsx     (1214 lines)
apps/mobile/app/(screens)/profile-customization.tsx  (699 lines)
apps/mobile/app/(screens)/qibla-compass.tsx          (531 lines)
apps/mobile/app/(screens)/qr-code.tsx                (215 lines)

# D29 screens
apps/mobile/app/(screens)/qr-scanner.tsx             (227 lines)
apps/mobile/app/(screens)/quiet-mode.tsx             (523 lines)
apps/mobile/app/(screens)/quran-reading-plan.tsx     (721 lines)
apps/mobile/app/(screens)/quran-room.tsx             (580 lines)
apps/mobile/app/(screens)/quran-share.tsx            (753 lines)

# D30 screens
apps/mobile/app/(screens)/ramadan-mode.tsx           (791 lines)
apps/mobile/app/(screens)/reel/[id].tsx              (917 lines)
apps/mobile/app/(screens)/reel-remix.tsx             (1128 lines)
apps/mobile/app/(screens)/reel-templates.tsx         (522 lines)
apps/mobile/app/(screens)/report.tsx                 (326 lines)
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks, screens not listed above.

**CRITICAL SPECIAL NOTES — organized by D file:**

### D19 Special Notes
- **`green-screen-editor.tsx` (962 lines) — ENTIRE FEATURE IS NON-FUNCTIONAL (D19 #15).** Camera records normally without any background segmentation. Toast at L134 confirms this. The IMAGE_BACKGROUNDS and VIDEO_BACKGROUNDS arrays have names but no URIs (D19 #8). DO NOT try to make green screen work — that requires `expo-gl` or `react-native-vision-camera` with frame processors. Fix only theme/RTL/cleanup/error handling. Mark the core functionality as DEFERRED with blocker: "requires react-native-vision-camera frame processor plugin."
- **`hadith.tsx` — Islamic Prophet sayings. NEVER AI-generate hadith content.** Only fix UI/UX. D19 #17: `listHadiths` data unwrapping bug — `Array.isArray(objectWithDataKey)` always false. Fix the unwrapping.
- **`hajj-companion.tsx` + `hajj-step.tsx` — Islamic pilgrimage content. NEVER AI-generate.** Only fix UI/UX.
- **`halal-finder.tsx` — D19 #47 + #53: Double-unwrap bug + type mismatch.** Rating and verification badges never render. Fix the data unwrapping and type mapping.

### D28 Special Notes
- **`profile/[username].tsx` (1214 lines) — Biggest screen in this batch.** Light mode broken on ALL text (15+ `colors.text.*` hardcoded). DO NOT refactor structure. Fix only the specific findings. This is a high-traffic screen (every profile tap).
- **`product-detail.tsx` (734 lines) — Commerce screen.** D28 #4: No `disabled={orderMutation.isPending}` on buy button = duplicate orders. D28 #5: No `onError` handler = silent failures. D28 #6: "View All Reviews" button has no onPress = dead button. Fix all three.
- **`qibla-compass.tsx` — Uses Magnetometer from expo-sensors.** Don't modify sensor logic. Fix only theme colors and fontWeight→fontFamily.
- **`qr-code.tsx` (215 lines) — Small screen, should be quick.**

### D29 Special Notes
- **ALL 5 screens have "Light theme completely broken."** Every screen uses `colors.text.primary/secondary/tertiary` instead of `tc.text.*`. This is a systematic bulk replacement across all 5 screens.
- **`quran-reading-plan.tsx` + `quran-room.tsx` + `quran-share.tsx` — Quran content.** NEVER AI-generate Quran verses, transliterations, or tafsir. Only fix UI/UX issues (theme, RTL, error handling, cleanup).
- **`quiet-mode.tsx` — D29 #11-12: Mutations fail silently.** Both query error state and mutation onError are missing. Fix both.
- **`quran-room.tsx` — No SafeAreaView at all (D29 finding).** Add it.
- **`quran-share.tsx` — SafeAreaView imported but never used (D29).** Wire it up.

### D30 Special Notes
- **`reel-remix.tsx` (1128 lines) — Complex video creation.** Similar to duet-create. DO NOT refactor. Fix only theme/RTL/cleanup/error handling. Multiple timers and recording sessions likely need cleanup.
- **`reel/[id].tsx` (917 lines) — High-traffic content screen.** D30 #13: 24+ hardcoded dark text colors. D30 #14-15: RTL issues with marginLeft→marginStart, absolute positioning left/right→start/end.
- **`ramadan-mode.tsx` (791 lines) — Islamic content.** NEVER AI-generate prayer times, schedule data, or dhikr content. D30 #7: `toggleGoal` error silently swallowed — fix with rollback on failure.
- **`report.tsx` (326 lines) — Moderation screen.** No keyboard handling (D30). Ensure no sensitive content leaks into error messages.

---

## KEY EFFICIENCY STRATEGY FOR 20 SCREENS

Many findings are IDENTICAL across screens. Before fixing screen-by-screen, do a systematic pass:

1. **Bulk pattern: `colors.text.*` → `tc.text.*`** — This affects nearly ALL 20 screens. When you open each file, do `replace_all` for `colors.text.primary` → dynamic equivalent, then verify the context (some styles need to stay as brand colors like `colors.emerald`).

2. **Bulk pattern: `fontWeight: '600'` → `fontFamily: fonts.bodySemiBold`** — Affects 15+ screens per D28 audit notes.

3. **Bulk pattern: `marginLeft` → `marginStart`, `paddingRight` → `paddingEnd`** — RTL fixes across all screens.

4. **Bulk pattern: Add `useContextualHaptic()` import + usage** — Almost every screen is missing haptic feedback.

Work through these bulk patterns efficiently. The goal is not 221 individual fixes but recognizing that ~60% of findings are the same 4-5 patterns applied 20 times.

---

## COMMON FIX PATTERNS

### Theme-aware colors
```typescript
const tc = useThemeColors();
style={[styles.container, { backgroundColor: tc.bg }]}
style={[styles.text, { color: tc.text.primary }]}
```

### Loading / Error / Empty states
```typescript
if (isLoading) return <Skeleton.PostCard />;
if (isError) return <EmptyState icon="alert-circle" title={t('common.error')} action={{ label: t('common.retry'), onPress: refetch }} />;
```

### i18n — ALL 8 languages. Node JSON parse/write — NEVER sed.

### RTL: `marginStart`, `start`, `rtlFlexRow(isRTL)`

### Cleanup: every timer, listener, subscription, recording, sound

### Haptic: `useContextualHaptic()` — tick/success/error/delete

### Mutations: onSuccess + onError with toast. disabled={isPending}.

### Press: `pressed && { opacity: 0.7 }`, `android_ripple`

### Tokens: `spacing.*`, `fontSize.*`, `fonts.*`, `radius.*`

---

## WORK ORDER — ONE D FILE AT A TIME

1. **D19** (5 screens, 55 findings) — green-screen, hadith, hajj-companion, hajj-step, halal-finder
   - `npx tsc --noEmit` → commit `fix(mobile): R4E-T4 CP1 — D19 screens`

2. **D28** (5 screens, 60 findings) — product-detail, profile/[username], profile-customization, qibla-compass, qr-code
   - `npx tsc --noEmit` → commit `fix(mobile): R4E-T4 CP2 — D28 screens`

3. **D29** (5 screens, 50 findings) — qr-scanner, quiet-mode, quran-reading-plan, quran-room, quran-share
   - `npx tsc --noEmit` → commit `fix(mobile): R4E-T4 CP3 — D29 screens`

4. **D30** (5 screens, 56 findings) — ramadan-mode, reel/[id], reel-remix, reel-templates, report
   - `npx tsc --noEmit` → commit `fix(mobile): R4E-T4 CP4 — D30 screens`

5. **Tests:** 40+ tests → commit `test(mobile): R4E-T4 — [N] tests across 20 screens`

6. **Self-audit + honesty pass** → commit `fix(mobile): R4E-T4 honesty pass — [N corrections]` if needed

Within each D file: Criticals → Highs → Mediums → Lows → Infos.
Fix ALL findings for a screen before moving to the next screen.

---

## i18n KEYS — BATCH AT END

You'll need i18n keys for many screens. Instead of adding them one-at-a-time (wasteful), collect ALL needed keys as you fix screens, then batch-add them to all 8 language files at the end using a Node script. Include the i18n commit with your test commit or as a separate commit.

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES

- **221/221 findings documented** in per-screen tables with status and notes
- **Max 33 deferred** (15% cap) — target <20. Each with specific technical blocker.
- **40+ meaningful tests** — 2 per screen minimum
- **All 20 screens:** theme-aware colors, RTL-ready, i18n complete (8 languages), haptic wired, error handling, cleanup, double-tap prevention
- **Islamic screens (hadith, hajj-companion, hajj-step, quran-*, ramadan-mode):** Content untouched, UI only
- **green-screen-editor:** Core feature DEFERRED (missing vision camera plugin), UI fixed
- **product-detail:** Buy button disabled during pending, onError handler, "View All Reviews" onPress added
- **profile/[username]:** All 15+ text colors theme-aware
- **Progress file** with per-screen tables, summary, equation, self-audit + honesty pass
- **5-6 atomic commits** (one per D file + tests + honesty pass)

**221 findings. 221 documented. Every Low fixed. Every Info addressed. Self-audit your counts. Honesty-pass your FIXED claims. This is the heaviest tab — prove you can handle it. Begin.**
