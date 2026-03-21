# Agent #46 — Gamification Screens Deep Audit

**Scope:** 7 gamification screens in `apps/mobile/app/(screens)/`
- achievements.tsx (467 lines)
- leaderboard.tsx (480 lines)
- challenges.tsx (655 lines)
- streaks.tsx (499 lines)
- sticker-browser.tsx (461 lines)
- ai-avatar.tsx (235 lines)
- xp-history.tsx (423 lines)

**Total lines audited:** 3,220

---

## CRITICAL FINDINGS

---

### FINDING-01: Sticker Add/Remove State NOT Synced With Server [P1 — FUNCTIONAL BUG]

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`
**Lines:** 26-37

```tsx
function PackCard({ pack, onPress, onAdd, onRemove, index }: { ... }) {
  const [isAdded, setIsAdded] = useState(false);  // <-- LOCAL STATE, IGNORES PACK DATA
  ...
  const handleToggle = () => {
    haptic.medium();
    if (isAdded) {
      setIsAdded(false);
      onRemove();
    } else {
      setIsAdded(true);
      onAdd();
    }
  };
```

**Problem:** The `isAdded` state is initialized to `false` on every render regardless of whether the user has already added the pack. There is no server-side `isAdded` or `isCollected` field being read from the `StickerPack` type. When the screen reloads (pull-to-refresh, navigation back), every pack will show as "not added" even if the user previously added it.

**Impact:** Users see wrong state for all sticker packs. Adding a pack, navigating away, and coming back shows it as not added. No query invalidation on add/remove mutations (lines 129-135 have no `onSuccess` handlers with invalidation).

**Fix:** The `StickerPack` interface needs an `isCollected` boolean from the backend. Initialize `useState(pack.isCollected ?? false)`. Add `onSuccess` to add/remove mutations to invalidate `['sticker-browse']` and `['sticker-featured']` query keys.

---

### FINDING-02: AI Avatar "Set as Profile" Button Is Dead Stub [P1 — DEAD FEATURE]

**File:** `apps/mobile/app/(screens)/ai-avatar.tsx`
**Lines:** 65-66

```tsx
<Pressable style={styles.setProfileBtn} onPress={() => haptic.light()}>
  <Text style={styles.setProfileText}>{t('ai.avatar.setProfile')}</Text>
</Pressable>
```

**Problem:** The "Set as Profile" button only fires a haptic tap. It does NOT:
1. Call any API to update the user's `avatarUrl`
2. Navigate anywhere
3. Show a confirmation dialog
4. Update local state/store

The backend has `POST /ai/avatar` (generate) and `GET /ai/avatars` (list) but NO endpoint like `PATCH /users/me/avatar` or `POST /ai/avatars/:id/set-profile` exists.

**Impact:** Users tap "Set as Profile" and nothing happens. Feature is completely non-functional. This is a visible dead button that destroys user trust.

**Fix:** Need a backend endpoint to update user avatar URL from an AI avatar, then wire the button to call it and update the Zustand store's `user.avatarUrl`.

---

### FINDING-03: Leaderboard API Route Mismatch — Path Param vs Query Param [P1 — BROKEN API]

**File:** `apps/mobile/src/services/api.ts`
**Line:** 1257

```ts
getLeaderboard: (type: string, limit?: number) => api.get(`/leaderboard/${type}${qs({ limit })}`),
```

**Backend (gamification.controller.ts line 69-73):**
```ts
@Get('leaderboard')
getLeaderboard(@Query('type') type = 'xp', @Query('limit') limit?: string) {
```

**Problem:** Mobile calls `GET /leaderboard/xp` (type as path segment) but the backend expects `GET /leaderboard?type=xp` (type as query param). This means `type` will always be `'xp'` (the default) in the backend, and the path `/leaderboard/xp` will 404 because NestJS won't match the static route `GET leaderboard` with a sub-path.

**Impact:** The leaderboard screen will return a 404 error or always show XP leaderboard regardless of which tab (xp/streaks/helpers) the user selects.

**Fix:** Change mobile API to: `api.get(\`/leaderboard\${qs({ type, limit })}\`)`

---

### FINDING-04: Sticker Browse API Has Backslash Characters Instead of Forward Slashes [P0 — BROKEN API]

**File:** `apps/mobile/src/services/api.ts`
**Line:** 964

```ts
browsePacks: (cursor?: string) =>
    api.get<PaginatedResponse<StickerPack>>(`\stickers\browse${cursor ? `?cursor=${cursor}` : ''}`),
```

**Problem:** The URL uses backslash characters (`\stickers\browse`) instead of forward slashes (`/stickers/browse`). In JavaScript template literals, `\s` is just `s` and `\b` is a backspace character (U+0008). So the actual URL sent is `"stickersrowse"` (missing first slash, \b consumed as backspace).

Additionally, the backend route is `GET /stickers/packs` not `/stickers/browse`.

**Impact:** The primary sticker browse endpoint will ALWAYS fail. The sticker browser screen cannot load any data.

**Fix:** Change to `api.get<PaginatedResponse<StickerPack>>(\`/stickers/packs\${cursor ? \`?cursor=\${cursor}\` : ''}\`)`

---

### FINDING-05: 6 Sticker API Route Mismatches Between Mobile and Backend [P1 — BROKEN ROUTES]

**File:** `apps/mobile/src/services/api.ts`
**Lines:** 962-982

| Mobile Route | Backend Route | Status |
|-------------|--------------|--------|
| `\stickers\browse` | `GET /stickers/packs` | BROKEN (backslash + wrong path) |
| `GET /stickers/search?q=...` | `GET /stickers/packs/search?q=...` | WRONG PATH (missing /packs/) |
| `GET /stickers/featured` | `GET /stickers/packs/featured` | WRONG PATH (missing /packs/) |
| `GET /stickers/mine` | `GET /stickers/my` | WRONG PATH (mine vs my) |
| `GET /stickers/recent` | `GET /stickers/my/recent` | WRONG PATH (missing /my/) |
| `POST /stickers/packs/:id/collect` | `POST /stickers/my/:id` | WRONG PATH (collect vs my) |
| `DELETE /stickers/packs/:id/collect` | `DELETE /stickers/my/:id` | WRONG PATH (collect vs my) |

**Problem:** 7 out of 8 sticker API endpoints on mobile use wrong URL paths that don't match the backend controller routes. The sticker browser is entirely non-functional.

**Impact:** The entire sticker browser screen cannot load any data, search, browse featured, add or remove sticker packs.

---

### FINDING-06: Challenge Category Filtering Silently Ignored [P2 — FUNCTIONAL BUG]

**File:** `apps/api/src/modules/gamification/gamification.controller.ts`
**Lines:** 78-83

```ts
@Get('challenges')
getChallenges(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.gamificationService.getChallenges(cursor, limit ? parseInt(limit) : undefined);
}
```

**Service (gamification.service.ts line 272):**
```ts
async getChallenges(cursor?: string, limit = 20, category?: string) {
```

**Problem:** The controller accepts `cursor` and `limit` from query params but does NOT extract `category` from the query. The service method accepts `category` as the 3rd arg but the controller never passes it. The mobile sends `?category=quran` but the backend ignores it.

**Impact:** Category filter chips on the challenges screen (Quran, Dhikr, Photography, Fitness, Cooking, Learning) are cosmetic-only. Tapping them sends the param but the backend returns all challenges regardless. Users think they are filtering but they are not.

**Fix:** Add `@Query('category') category?: string` to the controller and pass it to the service.

---

## HIGH SEVERITY FINDINGS

---

### FINDING-07: Duplicate Pressable Import in 3 Files [P3 — COMPILATION WARNING]

**File:** `apps/mobile/app/(screens)/achievements.tsx` **Lines 8,10**
**File:** `apps/mobile/app/(screens)/leaderboard.tsx` **Lines 8,10**
**File:** `apps/mobile/app/(screens)/challenges.tsx` **Lines 8,10**

```tsx
import {
  ...
  Pressable,
  Dimensions,
  Pressable,    // <-- DUPLICATE
} from 'react-native';
```

**Problem:** `Pressable` is imported twice in the named imports list. While JavaScript/TypeScript doesn't error on duplicate named imports (the second one overwrites), this is a code quality issue and may cause linting warnings.

**Impact:** No runtime crash, but indicates copy-paste development pattern and reduced code review quality.

---

### FINDING-08: Unused Import — SafeAreaView in achievements.tsx [P3 — DEAD CODE]

**File:** `apps/mobile/app/(screens)/achievements.tsx`
**Line:** 13

```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
```

**Problem:** `SafeAreaView` is imported but never used anywhere in the file. The screen uses `GlassHeader` for safe area handling instead.

---

### FINDING-09: Unused Import — SafeAreaView in leaderboard.tsx [P3 — DEAD CODE]

**File:** `apps/mobile/app/(screens)/leaderboard.tsx`
**Line:** 13

**Same as FINDING-08.** `SafeAreaView` imported but never used.

---

### FINDING-10: Unused Imports — shadow, Dimensions in leaderboard.tsx [P3 — DEAD CODE]

**File:** `apps/mobile/app/(screens)/leaderboard.tsx`
**Lines:** 25, 31

```tsx
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';  // shadow unused
const { width: screenWidth } = Dimensions.get('window');  // screenWidth unused
```

**Problem:** `shadow` is imported from theme but never used. `screenWidth` is computed but never referenced.

---

### FINDING-11: Unused Import — shadow in challenges.tsx [P3 — DEAD CODE]

**File:** `apps/mobile/app/(screens)/challenges.tsx`
**Line:** 24

```tsx
import { colors, spacing, fontSize, radius, fonts, shadow } from '@/theme';
```

**Problem:** `shadow` is imported but only used in `styles.fabGradient` at line 643 (`...shadow.md`). Actually used -- this is NOT dead code. Retracted.

**Status:** RETRACTED.

---

### FINDING-12: Unused Import — usersApi in ai-avatar.tsx [P3 — DEAD CODE]

**File:** `apps/mobile/app/(screens)/ai-avatar.tsx`
**Line:** 19

```tsx
import { aiApi, usersApi } from '@/services/api';
```

**Problem:** `usersApi` is imported but never used in the file. It was likely intended for the "Set as Profile" feature (FINDING-02) but the feature was never implemented.

---

### FINDING-13: useTranslation Called Twice in leaderboard.tsx [P2 — PERFORMANCE/BUG]

**File:** `apps/mobile/app/(screens)/leaderboard.tsx`
**Lines:** 177-178

```tsx
const { t } = useTranslation();
const { isRTL } = useTranslation();
```

**Problem:** `useTranslation()` hook is called twice in the same component. This is wasteful and may cause subtle issues if the hook has side effects or memoization. Should be a single destructured call.

**Fix:** `const { t, isRTL } = useTranslation();`

---

### FINDING-14: Challenges FAB Button Is a Dead Stub [P2 — DEAD FEATURE]

**File:** `apps/mobile/app/(screens)/challenges.tsx`
**Lines:** 429-444

```tsx
<Pressable
  style={styles.fab}
  onPress={() => {
    haptic.medium();
    // Navigate to create challenge screen when available
  }}
  accessibilityRole="button"
  accessibilityLabel={t('gamification.challenges.create')}
>
```

**Problem:** The floating action button (FAB) for creating challenges fires a haptic tap and does nothing else. The comment says "when available" confirming it's a known stub. There's a `gamificationApi.createChallenge()` method available and a `CreateChallengeDto` on the backend, but no create-challenge screen exists.

**Impact:** Users see a prominent + button but tapping it does nothing. UX dead end.

---

### FINDING-15: Hardcoded English Strings in streaks.tsx [P2 — i18n VIOLATION]

**File:** `apps/mobile/app/(screens)/streaks.tsx`

| Line | Hardcoded String |
|------|-----------------|
| 137 | `'Last 30 Days'` |
| 152 | `'Active'` (in accessibility label) |
| 152 | `'Inactive'` (in accessibility label) |
| 157 | `'Inactive'` (legend label) |
| 161 | `'Active'` (legend label) |
| 184 | `'Milestones'` |
| 215 | `{m} days` |

**Problem:** 7 hardcoded English strings that should be i18n keys. These will not be translated for Arabic, Turkish, Urdu, Bengali, French, Indonesian, or Malay users.

**Impact:** Breaks localization for non-English users on the streaks screen.

---

### FINDING-16: Hardcoded English Strings in challenges.tsx Categories [P2 — i18n VIOLATION]

**File:** `apps/mobile/app/(screens)/challenges.tsx`
**Lines:** 54-62

```tsx
const CATEGORIES = [
  { key: 'all', label: 'All', icon: 'layers' as IconName },
  { key: 'quran', label: 'Quran', icon: 'globe' as IconName },
  { key: 'dhikr', label: 'Dhikr', icon: 'repeat' as IconName },
  { key: 'photography', label: 'Photography', icon: 'camera' as IconName },
  { key: 'fitness', label: 'Fitness', icon: 'trending-up' as IconName },
  { key: 'cooking', label: 'Cooking', icon: 'heart' as IconName },
  { key: 'learning', label: 'Learning', icon: 'edit' as IconName },
];
```

**Problem:** All 7 category labels are hardcoded English strings instead of i18n translation keys.

**Impact:** Category filter chips will always display in English regardless of the user's language.

**Fix:** Use `t('gamification.challenges.categoryAll')`, `t('gamification.challenges.categoryQuran')`, etc.

---

### FINDING-17: Hardcoded English Strings in xp-history.tsx [P2 — i18n VIOLATION]

**File:** `apps/mobile/app/(screens)/xp-history.tsx`
**Lines:** 67-71

```tsx
function timeAgo(dateStr: string): string {
  ...
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
```

**Problem:** The `timeAgo` function returns hardcoded English strings. It has no access to the translation function `t()` because it's defined outside the component.

**Impact:** XP event timestamps will always display in English (e.g. "5m ago", "2d ago") regardless of locale.

**Fix:** Move `timeAgo` inside the component or pass `t` as a parameter and use translation keys.

---

### FINDING-18: XP History Shows Raw Reason Strings Instead of Translated Labels [P2 — UX BUG]

**File:** `apps/mobile/app/(screens)/xp-history.tsx`
**Lines:** 141-142

```tsx
<Text style={[styles.eventReason, { textAlign: rtlTextAlign(isRTL) }]} numberOfLines={1}>
  {event.reason}
</Text>
```

**Problem:** The `event.reason` field is displayed raw (e.g., "post_created", "comment_liked") without any translation or human-readable formatting. The backend likely stores machine-readable reason strings.

**Impact:** Users see ugly technical strings like "post_created" instead of "Created a post" or the equivalent in their language.

**Fix:** Use a lookup map like `t(\`gamification.xp.reason.\${event.reason}\`)` with i18n keys for each reason.

---

### FINDING-19: Dimensions.get('window') Called at Module Level [P3 — LAYOUT BUG]

**Files and Lines:**
- `achievements.tsx` line 29: `const { width: screenWidth } = Dimensions.get('window');`
- `leaderboard.tsx` line 31: `const { width: screenWidth } = Dimensions.get('window');`
- `challenges.tsx` line 31: `const { width: screenWidth } = Dimensions.get('window');`
- `streaks.tsx` line 25: `const { width: screenWidth } = Dimensions.get('window');`
- `sticker-browser.tsx` line 22: `const { width: SCREEN_WIDTH } = Dimensions.get('window');`
- `xp-history.tsx`: Does NOT use it (correctly).

**Problem:** `Dimensions.get('window')` is called at module load time, outside any component. The value is captured once and never updates. On devices with split-screen, rotation, or foldables, the layout will be wrong.

**Impact:** Card widths (achievements grid), cell sizes (streaks heatmap), sticker grid items will have wrong sizes after device rotation or window resize.

**Fix:** Use `useWindowDimensions()` hook inside the component instead.

---

### FINDING-20: Achievement Card Has No Tap/Press Handler [P2 — UX MISSING]

**File:** `apps/mobile/app/(screens)/achievements.tsx`
**Lines:** 71-157

**Problem:** The `AchievementCard` component has no `onPress` handler. Users cannot tap on an achievement to see details, criteria, or unlock conditions. The card is purely display-only. Locked achievements show criteria text but there's no way to see full details.

**Impact:** No interactivity on achievement cards. No way to learn how to unlock locked achievements beyond the 2-line truncated criteria text.

---

### FINDING-21: Achievements API Response Shape Fragile Type Cast [P2 — TYPE SAFETY]

**File:** `apps/mobile/app/(screens)/achievements.tsx`
**Lines:** 191-194

```tsx
queryFn: async () => {
  const res = await gamificationApi.getAchievements() as { data?: { achievements: Achievement[] }; achievements?: Achievement[] };
  const inner = res.data ?? res;
  return inner as { achievements: Achievement[] };
},
```

**Problem:** The response is force-cast with `as` twice, handling two possible shapes (`res.data.achievements` or `res.achievements`). This indicates the developer wasn't sure of the API response format and added defensive handling via type coercion. If the actual response has a different shape (e.g., `{ data: Achievement[] }` without the `achievements` wrapper), this will silently return undefined data.

**Impact:** If the backend response shape doesn't match either expected pattern, `data?.achievements` will be `undefined` and the screen will show the empty state even when achievements exist.

---

### FINDING-22: Leaderboard Podium Crashes If Fewer Than 3 Entries [P2 — POTENTIAL CRASH]

**File:** `apps/mobile/app/(screens)/leaderboard.tsx`
**Lines:** 225, 261-274

```tsx
const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
...
{top3.length >= 3 && (
  <Animated.View ...>
    {podiumOrder.map((entry, i) => (
      <PodiumCard key={entry.userId} .../>
    ))}
  </Animated.View>
)}
```

**Problem:** If there are exactly 1 or 2 entries, the podium is hidden entirely (the guard at line 261 checks `>= 3`). This means a new platform with only 1-2 users won't show any leaderboard podium. The `rest` list (entries after top 3) would also be empty, showing nothing.

While not a crash, a leaderboard with 1-2 users shows a confusing empty state. The code handles the case but there's a UX gap -- the `ListEmptyComponent` is not set on this FlatList, so if `rest` is empty after the podium, the list below podium will be blank with no message.

**Impact:** Early-stage platform with few users shows blank leaderboard below the tab selector.

---

### FINDING-23: Sticker Browser ScreenErrorBoundary Wrapping Inconsistency [P3 — ARCHITECTURE]

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`
**Lines:** 83, 201-303

```tsx
export default function StickerBrowserScreen() {
  ...
  return (
    <ScreenErrorBoundary>    // <-- INSIDE the default export
      <View style={styles.container}>
```

vs. all other gamification screens:
```tsx
export default function AchievementsScreenWrapper() {
  return (
    <ScreenErrorBoundary>    // <-- WRAPS the screen component
      <AchievementsScreen />
    </ScreenErrorBoundary>
  );
}
```

**Problem:** `sticker-browser.tsx` has the `ScreenErrorBoundary` inside the component JSX return, but the error/loading early returns at lines 177-199 are OUTSIDE the `ScreenErrorBoundary`. If an error occurs during loading or the error state, the boundary won't catch it.

**Impact:** If `stickersApi.browsePacks()` throws during loading, the early return at line 187-199 renders without an error boundary, potentially crashing the app.

**Fix:** Move `ScreenErrorBoundary` to wrap the entire component via a separate wrapper function, like the other screens do.

---

### FINDING-24: AI Avatar Generate Button Sends Empty String If No Avatar [P2 — API ERROR]

**File:** `apps/mobile/app/(screens)/ai-avatar.tsx`
**Lines:** 47, 120-121

```tsx
mutationFn: () => aiApi.generateAvatar(user?.avatarUrl || '', selectedStyle),
...
disabled={generateMutation.isPending || !user?.avatarUrl}
```

**Problem:** While the button is disabled when `!user?.avatarUrl`, the mutation function would still send an empty string `''` as `sourceUrl` if called programmatically or if the disabled check fails. The API endpoint `POST /ai/avatar` expects a valid image URL.

Additionally, if the user has just signed up and hasn't set an avatar yet, the generate button is permanently disabled with no explanation. There's no message telling the user they need a profile photo first.

**Impact:** New users with no avatar see a disabled "Generate" button with no explanation, leading to confusion.

**Fix:** Add a helper text when `!user?.avatarUrl` explaining "Upload a profile photo first to generate AI avatars."

---

### FINDING-25: Sticker Browser Has No ScreenErrorBoundary on Early Return Paths [P2 — CRASH RISK]

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`
**Lines:** 177-199

```tsx
if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader ... />
        ...
      </View>
    );  // NO ScreenErrorBoundary here
  }

  if (isBrowseLoading && !browseData) {
    return (
      <View style={styles.container}>
        <GlassHeader ... />
        ...
      </View>
    );  // NO ScreenErrorBoundary here
  }
```

**Problem:** The error and loading early returns render without `ScreenErrorBoundary` wrapping. If `GlassHeader` or other components throw during these states, the error is uncaught.

**Impact:** Unhandled component errors on the loading/error paths could crash the app.

---

### FINDING-26: Hardcoded Colors in streaks.tsx — Dark Mode Broken [P2 — THEME]

**File:** `apps/mobile/app/(screens)/streaks.tsx`

All styles reference `colors.dark.*` directly:
- Line 330: `backgroundColor: colors.dark.bg`
- Line 414: `borderColor: colors.dark.borderLight`
- Line 449: `borderColor: colors.dark.borderLight`
- Line 469: `borderColor: colors.dark.borderLight`
- Line 492: `backgroundColor: colors.dark.bgCard`

Same pattern in ALL 7 screens.

**Problem:** All gamification screens hardcode `colors.dark.*` instead of using a dynamic theme provider. If/when light mode is implemented, all these screens will show dark mode colors on a light background.

**Impact:** Light mode would be completely broken on all 7 gamification screens. This is a codebase-wide issue (noted in agent #33's findings) but confirmed present in all 7 screens here.

---

### FINDING-27: Streaks Heatmap Calendar Has Binary State Only [P3 — INCOMPLETE FEATURE]

**File:** `apps/mobile/app/(screens)/streaks.tsx`
**Lines:** 125-166

```tsx
function HeatmapCalendar({ days, isRTL }: { days: StreakDay[]; isRTL: boolean }) {
  ...
  {last30.map((day, i) => (
    <View
      style={[{
        backgroundColor: day.active ? colors.emerald : colors.dark.surface,
      }]}
```

**Problem:** The heatmap only shows binary active/inactive state (one shade of emerald or surface color). The legend (lines 157-161) shows three levels (inactive, medium, active) but the code only uses two. The legend is misleading.

**Impact:** Users see a legend with 3 intensity levels but the actual heatmap only shows 2. This is visually misleading.

**Fix:** Either remove the middle legend cell or add intensity levels based on activity count per day.

---

### FINDING-28: Achievements Screen Nested FlatList Performance Issue [P3 — PERFORMANCE]

**File:** `apps/mobile/app/(screens)/achievements.tsx`
**Lines:** 233-266

```tsx
const ListHeader = (
  <>
    <FlatList
      data={categories}
      horizontal
      ...
    />
    ...
  </>
);
```

**Problem:** There's a horizontal `FlatList` nested inside the `ListHeaderComponent` of the vertical `FlatList`. While this works, it means every time the outer FlatList re-renders its header, the inner FlatList also re-renders. The `ListHeader` is recreated on every render since it's not wrapped in `useMemo`.

**Impact:** Minor performance issue. The category chip list re-renders unnecessarily on every data change.

**Fix:** Wrap `ListHeader` in `useMemo` or use a `ScrollView` instead of `FlatList` for the small fixed-length category list.

---

### FINDING-29: No Achievement Unlock Animation [P3 — MISSING FEATURE]

**File:** `apps/mobile/app/(screens)/achievements.tsx`

**Problem:** Per the audit scope instructions, achievement unlock animations were a focus area. There are NO unlock animations. Achievements simply show as unlocked with a checkmark badge (lines 112-116). No confetti, no particle effect, no glow animation, no celebration feedback when an achievement is first unlocked.

The only animations are entry animations (`FadeInUp`) which fire every time the list renders, not specifically on unlock.

**Impact:** Unlocking achievements feels flat. No dopamine hit. Gamification best practice requires celebration moments.

---

### FINDING-30: XP Progress Bar Can Show >100% If Data Is Stale [P3 — VISUAL BUG]

**File:** `apps/mobile/app/(screens)/xp-history.tsx`
**Lines:** 76-78

```tsx
const progress = xpData.nextLevelXP > 0
    ? xpData.currentXP / xpData.nextLevelXP
    : 1;
```

And line 114:
```tsx
style={[styles.progressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]}
```

**Problem:** The `Math.min` on line 114 clamps to 100%, but the `progress` variable on line 76 can be > 1 if `currentXP > nextLevelXP` (which can happen if the user earned XP since the level threshold was calculated). The `xpRemaining` on line 79 correctly clamps to 0 with `Math.max`, but the progress bar width is already clamped by `Math.min`. No actual visual bug here.

**Status:** Upon closer inspection, this is correctly handled. RETRACTED.

---

### FINDING-31: XP History Event Icon Lookup Uses Partial Match [P3 — FRAGILE]

**File:** `apps/mobile/app/(screens)/xp-history.tsx`
**Lines:** 54-57

```tsx
function getReasonIcon(reason: string): IconName {
  const key = reason.toLowerCase().split('_')[0];
  return REASON_ICONS[key] ?? REASON_ICONS.default;
}
```

**Problem:** Only the first word before an underscore is used for icon lookup. So "post_created", "post_liked", "post_shared" all map to "edit" (the post icon). This means different XP events from the same category always show the same icon, which may be inaccurate (e.g., "post_liked" should show a heart, not an edit icon).

**Impact:** Minor UX issue — some XP event icons may not accurately represent the event type.

---

### FINDING-32: Challenge Progress Text Alignment Hardcoded to Right [P3 — RTL BUG]

**File:** `apps/mobile/app/(screens)/challenges.tsx`
**Line:** 593

```tsx
progressText: {
    ...
    textAlign: 'right',
},
```

**Problem:** The progress text (e.g., "5/10") is hardcoded to `textAlign: 'right'`. For RTL languages (Arabic, Urdu), this should be `'left'`. The component doesn't use `rtlTextAlign(isRTL)` for this particular text.

**Impact:** Progress text alignment is wrong for RTL users.

---

### FINDING-33: Leaderboard Uses user?.id for Current User Comparison [P3 — POTENTIAL MISMATCH]

**File:** `apps/mobile/app/(screens)/leaderboard.tsx`
**Line:** 214

```tsx
isCurrentUser={item.userId === user?.id}
```

**Problem:** `user` comes from `useUser()` (Clerk). Clerk user IDs have the format `user_...` while the backend may return a different ID format from the leaderboard API. If the leaderboard entries use a Prisma User ID (CUID) that's different from the Clerk user ID, the current user will never be highlighted.

**Impact:** The current user's row may never show the highlighted emerald border, depending on whether the backend returns Clerk IDs or internal IDs.

---

### FINDING-34: Sticker Browser Mutation Error Not Shown to User [P2 — UX BUG]

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`
**Lines:** 129-135

```tsx
const addMutation = useMutation({
    mutationFn: (id: string) => stickersApi.addToCollection(id),
});

const removeMutation = useMutation({
    mutationFn: (id: string) => stickersApi.removeFromCollection(id),
});
```

**Problem:** Neither mutation has an `onError` handler. If adding or removing a sticker pack fails (network error, auth error, server error), the user gets no feedback. Combined with FINDING-01 (local state not synced), the user sees "Added" locally but the server rejected it, and there's no rollback.

**Impact:** Silent failures. User thinks pack was added but it wasn't.

---

### FINDING-35: AI Avatar Screen Uses useStore User Instead of Clerk User [P3 — ARCHITECTURE]

**File:** `apps/mobile/app/(screens)/ai-avatar.tsx`
**Line:** 37

```tsx
const user = useStore(s => s.user);
```

**Problem:** This reads from the Zustand store, but the leaderboard.tsx reads from `useUser()` (Clerk). This inconsistency means:
1. If the Zustand store user isn't populated (e.g., fresh load before profile fetch), `user` is null
2. `user?.avatarUrl` would be undefined, permanently disabling the generate button
3. Other screens in the same flow use different user data sources

**Impact:** Race condition where the AI avatar screen may not have user data available, disabling generation.

---

### FINDING-36: Achievement Category Query Not Sent to Backend [P3 — INCOMPLETE FEATURE]

**File:** `apps/mobile/app/(screens)/achievements.tsx`
**Lines:** 188-195, 198-201

```tsx
const { data, ... } = useQuery({
    queryKey: ['achievements'],  // No category in query key
    queryFn: async () => {
      const res = await gamificationApi.getAchievements();
      ...
    },
});
...
const filtered =
    selectedCategory === 'all'
      ? achievements
      : achievements.filter((a) => a.category === selectedCategory);
```

**Problem:** The query key doesn't include `selectedCategory`, and the API call doesn't pass a category param. ALL achievements are fetched every time, then filtered client-side. This means:
1. No server-side pagination or filtering by category
2. If there are hundreds of achievements, all are loaded at once
3. Category change doesn't trigger a refetch (same query key)

**Impact:** Client-side filtering works but is inefficient for large datasets. The query key missing the category means React Query caches all achievements under one key, which is correct for this client-filter approach but means no benefit from server-side filtering.

---

### FINDING-37: Streaks Screen Has No Error State Handling [P3 — UX BUG]

**File:** `apps/mobile/app/(screens)/streaks.tsx`
**Lines:** 250-256

```tsx
const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['streaks'],
    queryFn: async () => {
      const res = await gamificationApi.getStreaks() as { streaks: Streak[]; calendar: StreakDay[] };
      return res;
    },
});
```

**Problem:** The query doesn't destructure `isError` or `error`, and there's no error state handling. If the API call fails, `streaks` defaults to `[]` and the screen shows the empty state ("Start using..."), which misleads the user into thinking they have no streaks when actually the network request failed.

**Impact:** Network errors are indistinguishable from "no streaks" state. User can't tell if they need to retry or if they genuinely have no data.

---

### FINDING-38: Leaderboard Empty State Subtitle Is Wrong [P3 — UX BUG]

**File:** `apps/mobile/app/(screens)/leaderboard.tsx`
**Line:** 297

```tsx
<EmptyState
    icon="bar-chart-2"
    title={t('gamification.leaderboard.title')}
    subtitle={t('common.retry')}    // <-- "Retry" as a subtitle makes no sense
    actionLabel={t('common.retry')}
    onAction={() => refetch()}
/>
```

**Problem:** The subtitle uses `t('common.retry')` which would display something like "Retry" as the descriptive text below the title. This should be a meaningful message like "No leaderboard data available yet" or similar.

**Impact:** Users see "Retry" as the explanation text under the empty leaderboard title.

---

### FINDING-39: Sticker Browser FlatList Missing renderItem Memoization [P3 — PERFORMANCE]

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`
**Lines:** 237-244

```tsx
renderItem={({ item, index }) => (
    <PackCard
      pack={item}
      onPress={() => setSelectedPack(item)}
      onAdd={() => handleAdd(item.id)}
      onRemove={() => handleRemove(item.id)}
      index={index}
    />
)}
```

**Problem:** The `renderItem` function creates new arrow function closures on every render (for `onPress`, `onAdd`, `onRemove`). This isn't memoized with `useCallback` like the other gamification screens' renderItems. For a long scrolling list, this causes unnecessary re-renders.

**Impact:** Performance degradation as the sticker list grows.

---

### FINDING-40: Font Weight Used as String Instead of Font Family [P3 — STYLING]

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`

Multiple style entries use React Native's `fontWeight` string instead of the project's `fonts.*` font family names:
- Line 347: `fontWeight: '600'` (sectionTitle)
- Line 370: `fontWeight: '500'` (featuredTitle)
- Line 402: `fontWeight: '600'` (cardTitle)
- Line 419: `fontWeight: '600'` (addButtonText)
- Line 436: `fontWeight: '700'` (sheetTitle)

**File:** `apps/mobile/app/(screens)/ai-avatar.tsx`
- Line 178: `fontWeight: '600'` (sectionTitle)
- Line 201: `fontWeight: '500'` (styleLabel)
- Line 212: `fontWeight: '700'` (generateText)

**Problem:** These screens use `fontWeight` string values instead of the project convention of `fontFamily: fonts.bodySemiBold` or `fonts.bodyBold`. When custom fonts are loaded via `useFonts`, `fontWeight` alone without `fontFamily` falls back to the system font, not the project's DMSans family.

**Impact:** These text elements render in the system font (San Francisco/Roboto) instead of DMSans, creating visual inconsistency with the rest of the app.

---

### FINDING-41: XP History insets Variable Unused [P3 — DEAD CODE]

**File:** `apps/mobile/app/(screens)/xp-history.tsx`
**Line:** 180

```tsx
const insets = useSafeAreaInsets();
```

**Problem:** `insets` is computed via `useSafeAreaInsets()` but never referenced in the component.

---

### FINDING-42: Challenge Cover Image Not Accessible [P3 — ACCESSIBILITY]

**File:** `apps/mobile/app/(screens)/challenges.tsx`
**Lines:** 98-109

```tsx
{challenge.coverImageUrl && (
    <View style={styles.coverWrap}>
      <Image
        source={{ uri: challenge.coverImageUrl }}
        style={styles.coverImage}
        contentFit="cover"
      />
```

**Problem:** The challenge cover image has no `accessibilityLabel` or `accessible` prop. Screen readers will either skip or announce it generically.

**Impact:** Visually impaired users cannot understand what the challenge cover image depicts.

---

### FINDING-43: BottomSheet Add-to-Collection Always Calls handleAdd Even If Already Added [P2 — LOGIC BUG]

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`
**Lines:** 289-294

```tsx
<GradientButton
  label={t('screens.sticker-browser.addToCollection')}
  onPress={() => {
    handleAdd(selectedPack.id);
    setSelectedPack(null);
    haptic.success();
  }}
/>
```

**Problem:** The BottomSheet's "Add to Collection" button always calls `handleAdd` regardless of whether the pack is already in the user's collection. There's no check for existing collection membership. Tapping the button on an already-added pack sends a duplicate add request.

**Impact:** Duplicate API calls. Depending on backend handling, this may create duplicate records or silently succeed.

---

### FINDING-44: Leaderboard FlatList Missing ListEmptyComponent [P3 — UX]

**File:** `apps/mobile/app/(screens)/leaderboard.tsx`
**Lines:** 302-316

The FlatList for the `rest` entries (rank 4+) has no `ListEmptyComponent`. If there are exactly 3 entries, the podium shows but the list below is empty with no message.

**Impact:** Minor -- the podium covers ranks 1-3 and if there are only 3 users, the empty list below isn't jarring. But it's an inconsistency with other screens that all provide `ListEmptyComponent`.

---

### FINDING-45: Sticker Browser Same Empty State Text for Search and Browse [P3 — UX]

**File:** `apps/mobile/app/(screens)/sticker-browser.tsx`
**Lines:** 261-264

```tsx
title={debouncedQuery.length > 0 ? t('screens.sticker-browser.noResults') : t('screens.sticker-browser.noResults')}
subtitle={debouncedQuery.length > 0 ? t('screens.sticker-browser.noResultsSubtitle') : t('screens.sticker-browser.noResultsSubtitle')}
```

**Problem:** The ternary expressions return the same value for both branches. Whether the user is searching or browsing, they see the same "no results" message. This was clearly intended to be different messages.

**Impact:** Users searching for a specific term see the same message as users browsing an empty sticker library, providing no helpful context.

---

## SUMMARY TABLE

| # | Severity | File | Finding |
|---|----------|------|---------|
| 01 | P1 | sticker-browser.tsx | Sticker add/remove state not synced with server |
| 02 | P1 | ai-avatar.tsx | "Set as Profile" button is dead stub |
| 03 | P1 | api.ts | Leaderboard API route mismatch (path vs query param) |
| 04 | P0 | api.ts | Sticker browse URL has backslash characters |
| 05 | P1 | api.ts | 6 sticker API routes don't match backend |
| 06 | P2 | gamification.controller.ts | Challenge category filtering silently ignored |
| 07 | P3 | achievements/leaderboard/challenges.tsx | Duplicate Pressable import (3 files) |
| 08 | P3 | achievements.tsx | Unused SafeAreaView import |
| 09 | P3 | leaderboard.tsx | Unused SafeAreaView import |
| 10 | P3 | leaderboard.tsx | Unused shadow and screenWidth |
| 12 | P3 | ai-avatar.tsx | Unused usersApi import |
| 13 | P2 | leaderboard.tsx | useTranslation called twice |
| 14 | P2 | challenges.tsx | FAB button is dead stub |
| 15 | P2 | streaks.tsx | 7 hardcoded English strings |
| 16 | P2 | challenges.tsx | 7 hardcoded English category labels |
| 17 | P2 | xp-history.tsx | timeAgo() hardcoded English |
| 18 | P2 | xp-history.tsx | Raw reason strings shown to user |
| 19 | P3 | 5 files | Dimensions.get at module level |
| 20 | P2 | achievements.tsx | Achievement cards not tappable |
| 21 | P2 | achievements.tsx | Fragile type cast on API response |
| 22 | P2 | leaderboard.tsx | Podium hidden with <3 entries, no empty hint |
| 23 | P3 | sticker-browser.tsx | ScreenErrorBoundary wrapping inconsistency |
| 24 | P2 | ai-avatar.tsx | No explanation when generate is disabled |
| 25 | P2 | sticker-browser.tsx | Early return paths lack ScreenErrorBoundary |
| 26 | P2 | all 7 files | Hardcoded colors.dark.* (light mode broken) |
| 27 | P3 | streaks.tsx | Heatmap legend shows 3 levels, code uses 2 |
| 28 | P3 | achievements.tsx | Nested FlatList in header not memoized |
| 29 | P3 | achievements.tsx | No achievement unlock animations |
| 31 | P3 | xp-history.tsx | Icon lookup only matches first word |
| 32 | P3 | challenges.tsx | Progress text hardcoded textAlign: right |
| 33 | P3 | leaderboard.tsx | Clerk ID vs backend ID mismatch risk |
| 34 | P2 | sticker-browser.tsx | No error feedback on add/remove mutations |
| 35 | P3 | ai-avatar.tsx | Uses Zustand store user vs Clerk inconsistency |
| 36 | P3 | achievements.tsx | All achievements fetched, filtered client-side |
| 37 | P3 | streaks.tsx | No error state handling |
| 38 | P3 | leaderboard.tsx | Empty state subtitle says "Retry" |
| 39 | P3 | sticker-browser.tsx | renderItem not memoized |
| 40 | P3 | sticker-browser.tsx, ai-avatar.tsx | fontWeight strings instead of fontFamily |
| 41 | P3 | xp-history.tsx | Unused insets variable |
| 42 | P3 | challenges.tsx | Cover image not accessible |
| 43 | P2 | sticker-browser.tsx | BottomSheet always adds even if already added |
| 44 | P3 | leaderboard.tsx | Missing ListEmptyComponent |
| 45 | P3 | sticker-browser.tsx | Same empty text for search and browse |

**Total: 43 findings**
- P0 (Ship Blocker): 1
- P1 (Critical): 4
- P2 (High): 17
- P3 (Medium): 21

---

## TOP 5 PRIORITIES TO FIX

1. **FINDING-04 + FINDING-05:** Fix all 7 sticker API route mismatches — the entire sticker browser is non-functional
2. **FINDING-03:** Fix leaderboard API route (path param → query param) — 3 leaderboard tabs broken
3. **FINDING-01:** Sync sticker add/remove state with server — add `isCollected` field from backend
4. **FINDING-02:** Implement "Set as Profile" for AI avatars — visible dead button
5. **FINDING-06:** Pass `category` param through controller — challenge filtering cosmetic-only
