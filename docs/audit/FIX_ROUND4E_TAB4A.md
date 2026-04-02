# YOU ARE TAB 4A. YOUR AUDIT FILES ARE D19 + D28. DO NOT TOUCH ANY OTHER FILES. DO NOT SPAWN SUBAGENTS.

# FIX SESSION — Round 4E Tab 4A: Green Screen/Hadith/Hajj/Halal + Product Detail/Profile/Profile Customization/Qibla/QR Code (D19 + D28)

> 115 findings across 10 screens. D19 (55): green-screen-editor, hadith, hajj-companion, hajj-step, halal-finder. D28 (60): product-detail, profile/[username], profile-customization, qibla-compass, qr-code.
> **YOUR JOB: Read D19.md + D28.md. Fix the findings in THOSE files. Nothing else.**

---

## RULES — NON-NEGOTIABLE (distilled from 24 previous agent sessions)

### RULE 0: YOU ARE BEING AUDITED
A hostile auditor will grep every file you touched, count every status row, verify every "FIXED" claim at the code level, and cross-check your accounting equation. Across 24 sessions: invented "REMAINING" (63 items), inflated FIXED by 26, fabricated reference counts, deferred 47%, TODO as "FIXED", 6 false FIXED caught by self-audit, Tab 2 R2 silently dropped 95/190 findings.

### RULE 1: TOTAL ACCOUNTING — every finding by ID
`FIXED + DEFERRED + ALREADY_FIXED + NOT_A_BUG = TOTAL`. D19=55, D28=60. All 115 documented. No "REMAINING." No silent skips. NOTE: The D files' own summary tables UNDERCOUNT their rows (D19 says 47 but has 55 rows, D28 says 44 but has 60 rows). Use the ROW COUNTS (55 and 60), not the summaries.

### RULE 2: DEFERRAL CAP — 15% (max 17)
Specific technical blockers only. Target <10. "Low priority" / "polish" / "enhancement" NOT valid. If fixable in under 5 minutes, fix it.

### RULE 3: FIX ALL SEVERITIES — Low and Info are mandatory
30 seconds for a hardcoded color. 10 seconds for a dead import. Fix them ALL.

### RULE 4: "FIXED" = CODE CHANGED. Not a TODO. Not "works fine." The auditor diffs.

### RULE 5: "NOT_A_BUG" REQUIRES 1-SENTENCE EVIDENCE
GOOD: "Overlay uses white text on dark gradient — tc.text.primary would be invisible." BAD: "Works fine."

### RULE 6: TESTS — minimum 20 meaningful tests
2 tests per screen minimum. Tests must assert behavior, not just existence.

### RULE 7: READ BEFORE EDIT — Read tool first, understand context.

### RULE 8: PATTERN COMPLETION — fix same pattern across ALL 10 screens. Auditor greps.

### RULE 9: CHECKPOINT = TSC + COMMIT after EACH D file (2 checkpoints)
Format: `fix(mobile): R4E-T4A CP[N] — [D-file screens] [summary]`

### RULE 10: NO SUBAGENTS. NO CO-AUTHORED-BY. NO AI REFERENCES IN COMMITS.

### RULE 11: SELF-AUDIT + HONESTY PASS
After both D files: count per-screen rows, sum, compare to summary. Then verify every FIXED claim has actual code change. Document: "Self-audit: X FIXED + Y DEFERRED + Z NOT_A_BUG + W ALREADY_FIXED = 115. Honesty pass: [N corrected or 'all genuine']."

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

3. Read BOTH audit files IN FULL — every row, every finding:
   - `docs/audit/v2/wave4/D19.md` (55 findings — green-screen-editor, hadith, hajj-companion, hajj-step, halal-finder)
   - `docs/audit/v2/wave4/D28.md` (60 findings — product-detail, profile/[username], profile-customization, qibla-compass, qr-code)

4. Create: `docs/audit/v2/fixes/R4E_TAB4A_PROGRESS.md`

---

## YOUR SCOPE — 10 screens

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
```

**FORBIDDEN:** Backend API, schema.prisma, signal/, shared components, hooks, screens not listed above.

**CRITICAL SPECIAL NOTES — organized by D file:**

### D19 Special Notes
- **`green-screen-editor.tsx` (962 lines) — ENTIRE FEATURE IS NON-FUNCTIONAL (D19 #15 H).** Camera records normally without any background segmentation. Toast at L134 confirms this. The IMAGE_BACKGROUNDS and VIDEO_BACKGROUNDS arrays have names but no URIs (D19 #8 M). DO NOT try to make green screen work — that requires `expo-gl` or `react-native-vision-camera` with frame processors. Fix only theme/RTL/cleanup/error handling. Mark the core functionality as DEFERRED with blocker: "requires react-native-vision-camera frame processor plugin."

- **`hadith.tsx` — Islamic Prophet sayings. NEVER AI-generate hadith content.** Only fix UI/UX. D19 #17 (H): `listHadiths` data unwrapping bug — `Array.isArray(objectWithDataKey)` always false. Fix the unwrapping to access `.data` property.

- **`hajj-companion.tsx` + `hajj-step.tsx` — Islamic pilgrimage content. NEVER AI-generate.** Only fix UI/UX.

- **`halal-finder.tsx` — TWO HIGH BUGS:**
  - D19 #47 (H): Fragile double-unwrap of API response data — silently returns `[]` on unexpected structure.
  - D19 #53 (H): Type mismatch between screen interface and API type (`averageRating` vs `rating`, missing `isVerified`, missing `distanceKm`). Rating stars and verification badges NEVER render. Fix the type mapping.

### D28 Special Notes
- **`product-detail.tsx` (734 lines) — Commerce screen. THREE HIGH BUGS:**
  - D28 #4 (H): No `disabled={orderMutation.isPending}` on GradientButton = duplicate purchase orders on rapid tap.
  - D28 #5 (H): No `onError` handler on `orderMutation` = user gets ZERO feedback when order fails.
  - D28 #6 (H): "View All Reviews" Pressable has literally NO `onPress` handler = dead button.
  - D28 #7 (M): Share button `onPress` only calls `haptic.tick()` — no actual `Share.share()` call. Share is a no-op.

- **`profile/[username].tsx` (1214 lines) — Biggest screen. THREE HIGH BUGS:**
  - D28 #16 (H): Light mode broken on ALL text — 15+ `colors.text.*` hardcoded instead of `tc.text.*`.
  - D28 #20 (H): Mute action has NO confirmation dialog — immediately mutes with no way to undo from this screen. Add Alert.alert confirmation (this IS a destructive action).
  - DO NOT refactor structure. Fix only the specific findings. This is a high-traffic screen (every profile tap).

- **`profile-customization.tsx` (699 lines) — D28 #31 (H): Light mode broken.** Same `colors.text.*` pattern. Systematic replacement needed.

- **`qibla-compass.tsx` — D28 #41 (H): No SafeAreaView on main compass view.** Loading and permission-denied states DO have SafeAreaView, but the main compass view (when permission is granted) does NOT. Content behind notch. Don't modify sensor/Magnetometer logic — fix only theme colors, fontWeight→fontFamily, and SafeAreaView.

- **`qr-code.tsx` (215 lines) — D28 #51 (H): Light mode broken.** Small screen, should be quick.

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

### Cleanup: every timer, listener, subscription, recording

### Haptic: `useContextualHaptic()` — tick/success/error/delete

### Mutations: onSuccess + onError with toast. disabled={isPending}.

### Press: `pressed && { opacity: 0.7 }`, `android_ripple`

### Tokens: `spacing.*`, `fontSize.*`, `fonts.*`, `radius.*`

---

## WORK ORDER

1. **D19** (5 screens, 55 findings) — green-screen, hadith, hajj-companion, hajj-step, halal-finder
   - `npx tsc --noEmit` → commit `fix(mobile): R4E-T4A CP1 — D19 screens`

2. **D28** (5 screens, 60 findings) — product-detail, profile/[username], profile-customization, qibla-compass, qr-code
   - `npx tsc --noEmit` → commit `fix(mobile): R4E-T4A CP2 — D28 screens`

3. **Tests:** 20+ tests → commit `test(mobile): R4E-T4A — [N] tests across 10 screens`

4. **Self-audit + honesty pass** → final commit if corrections needed

Within each D file: Highs → Mediums → Lows → Infos.
Fix ALL findings for a screen before moving to the next screen.

---

## TEST COMMANDS
```bash
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --config src/hooks/__tests__/jest.config.js
```

---

## DELIVERABLES

- **115/115 findings documented** with per-screen tables
- **Max 17 deferred** — target <10. Each with specific technical blocker.
- **20+ meaningful tests**
- **All 10 screens:** theme-aware, RTL-ready, i18n complete (8 languages), haptic, error handling, cleanup, double-tap prevention
- **Islamic screens (hadith, hajj-companion, hajj-step):** Content untouched, UI only
- **green-screen-editor:** Core feature DEFERRED, UI fixed
- **product-detail:** Buy disabled during pending, onError, "View All Reviews" onPress, Share wired
- **profile/[username]:** 15+ text colors theme-aware, mute confirmation added
- **Progress file** with self-audit + honesty pass
- **3-4 atomic commits**

**115 findings. 115 documented. Every Low fixed. Every Info addressed. Self-audit. Honesty-pass. Begin.**
