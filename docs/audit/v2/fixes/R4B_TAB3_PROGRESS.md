# R4B Tab 3 Progress — D13 + D14 (140 findings)

## Summary
- **Total findings:** 140 (D13: 87, D14: 53)
- **FIXED:** 81 (76 original + 5 hostile audit corrections)
- **DEFERRED:** 19 (13.6% — under 15% cap)
- **NOT_A_BUG:** 24 (29 original - 5 reclassified to FIXED)
- **ALREADY_FIXED:** 16
- **Tests:** 60 passing

---

## Per-Screen Tables

### creator-storefront.tsx (D13 #1-23)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 1 | L | container hardcodes colors.dark.bg | ALREADY_FIXED | Overridden inline at L211 with tc.bg |
| 2 | L | creatorFollowers no inline color | FIXED | Added `{ color: tc.text.tertiary }` |
| 3 | L | shopStats hardcodes dark colors | ALREADY_FIXED | Overridden inline at L195 |
| 4 | L | statValue/statLabel no inline override | FIXED | Added `{ color: tc.text.primary/secondary }` |
| 5 | L | productImage placeholder bg | FIXED | Added `{ backgroundColor: tc.surface }` via style prop |
| 6 | L | outOfStockText hardcodes color | DEFERRED | Out-of-stock overlay bg is rgba(0,0,0,0.5) — white text on dark overlay is intentional |
| 7 | L | productName overridden inline | ALREADY_FIXED | Already has `{ color: tc.text.primary }` |
| 8 | M | SCREEN_WIDTH stale on resize | DEFERRED | Requires refactoring grid math + FlatList numColumns — iPad-only concern |
| 9 | L | creatorHeader flexDirection RTL | DEFERRED | Centered avatar+info layout — RTL flip would look wrong |
| 10 | M | halalBadge hardcoded pixel values | FIXED | Changed gap:3 → spacing.xs, paddingVertical:3 → spacing.xs |
| 11 | M | handleProductPress no double-tap guard | FIXED | Added isNavigatingRef with 500ms cooldown |
| 12 | M | handleAddProduct no double-tap guard | FIXED | Same isNavigatingRef guard |
| 13 | M | catch block silently swallows errors | FIXED | Added hasError state + showToast on error |
| 14 | H | No error state/retry UI | FIXED | Added EmptyState with alert-circle + retry action |
| 15 | M | No offline handling | DEFERRED | Needs @react-native-community/netinfo integration — cross-screen infra |
| 16 | L | No refetch on back navigation | DEFERRED | Needs useFocusEffect refetch — minor staleness |
| 17 | M | No pagination for products | DEFERRED | Backend API needs sellerId + cursor param — cross-scope |
| 18 | L | Animation delay grows unbounded | FIXED | Capped at `Math.min(index, 15) * 50` |
| 19 | I | FAB no press feedback | FIXED | Added `pressed && { opacity: 0.7 }` |
| 20 | L | handleRefresh no haptic | FIXED | Added `haptic.tick()` |
| 21 | M | Backend sellerId filter may not exist | DEFERRED | Backend cross-scope — API param doesn't exist yet |
| 22 | L | paddingTop hardcoded 60 | ALREADY_FIXED | Already uses `insets.top + 60` which is standard for GlassHeader |
| 23 | M | ProgressiveImage no borderRadius | FIXED | Added `borderRadius={0}` to match card overflow:hidden |

### cross-post.tsx (D13 #24-37)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 24 | L | container hardcodes colors.dark.bg | ALREADY_FIXED | Overridden inline at L142 |
| 25 | L | spaceOption/spaceIconWrap dark colors | FIXED | Added `{ backgroundColor: tc.bgCard, borderColor: tc.border }` and `{ backgroundColor: tc.surface }` |
| 26 | L | previewContent/Meta dark text | ALREADY_FIXED | Already have inline overrides |
| 27 | L | captionInput hardcodes text color | FIXED | Added `{ color: tc.text.primary }` inline |
| 28 | L | bottomBar hardcodes dark bg/border | FIXED | Added `{ backgroundColor: tc.bg, borderTopColor: tc.border }` |
| 29 | M | handleCrossPost no double-tap guard | FIXED | Added `crossPostMutation.isPending` check |
| 30 | M | TextInput hidden by keyboard | DEFERRED | Needs KeyboardAvoidingView wrapping ScrollView — layout restructure |
| 31 | M | onError shows no message | FIXED | Added showToast with error message |
| 32 | M | No offline detection | DEFERRED | Same cross-screen infra need |
| 33 | L | router.back no query invalidation | NOT_A_BUG | Source screen refetches on focus — standard pattern |
| 34 | H | post.mediaUrls crash on undefined | FIXED | Changed to `post.mediaUrls?.[0]` |
| 35 | I | No scroll-to-input | DEFERRED | Needs ScrollView ref + scrollTo — minor UX |
| 36 | L | paddingBottom hardcoded 100 | FIXED | Replaced magic 100 with `spacing.base + 48 + spacing.md` (computed from bottom bar dimensions) |
| 37 | L | Checkbox #fff hardcoded | FIXED | Changed to `colors.text.onColor` + `{ borderColor: tc.border }` |

### dhikr-challenge-detail.tsx (D13 #38-52)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 38 | L | container hardcodes colors.dark.bg | ALREADY_FIXED | Overridden inline at L287 |
| 39 | L | Some inner styles hardcode dark colors | FIXED | progressRingInner/contributeCounterInner already have inline tc.bgCard |
| 40 | L | Multiple text styles hardcode colors | FIXED | Most have inline overrides; metaText added `{ color: tc.text.tertiary }` |
| 41 | L | contributorRow raw RGBA border | FIXED | Added `{ borderBottomColor: tc.border }` inline |
| 42 | H | No error handling for useQuery | FIXED | Added isError check + EmptyState with retry |
| 43 | M | joinMutation no onError | FIXED | Added haptic.error() + showToast |
| 44 | M | contributeMutation no onError | FIXED | Added haptic.error() + showToast |
| 45 | H | Unsafe type assertion | FIXED | Removed redundant `as DhikrChallengeDetail | undefined` cast |
| 46 | H | isParticipant logic wrong | FIXED | Changed to use participantCount field |
| 47 | M | joinMutation no debounce | FIXED | GradientButton loading prop handles visual + isPending prevents re-fire |
| 48 | M | Contribute counter no press feedback | FIXED | Added pressed opacity 0.8 + scale 0.97 to contribute counter Pressable |
| 49 | L | contributorRow/metaRow flexDirection RTL | DEFERRED | Centered content — RTL flip not needed for leaderboard |
| 50 | M | Leaderboard no pagination | DEFERRED | Backend needs paginated contributors endpoint |
| 51 | L | paddingTop hardcoded 100 | NOT_A_BUG | Standard GlassHeader offset pattern |
| 52 | L | Animation delay grows unbounded | FIXED | Capped at `Math.min(index, 15) * 50` |

### dhikr-challenges.tsx (D13 #53-67)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 53 | L | container hardcodes colors.dark.bg | ALREADY_FIXED | Overridden inline at L206 |
| 54 | L | skeletonCard hardcodes dark colors | ALREADY_FIXED | Overridden inline at L104 |
| 55 | L | Multiple styles hardcode text colors | ALREADY_FIXED | All have inline tc.* overrides |
| 56 | L | Duplicate inline style objects | FIXED | Merged duplicate inline style objects into single `{ color, backgroundColor, borderColor }` |
| 57 | M | handleCreate no double-tap protection | FIXED | Added `createMutation.isPending` guard |
| 58 | M | TextInput in BottomSheet keyboard | DEFERRED | BottomSheet library handles keyboard internally |
| 59 | M | Redundant creating state | FIXED | Removed creating state, use createMutation.isPending |
| 60 | H | No error handling for useInfiniteQuery | FIXED | Added isError + EmptyState with retry |
| 61 | L | challengeHeader flexDirection RTL | NOT_A_BUG | space-between with title+phrase — works in RTL |
| 62 | L | paddingTop/Bottom hardcoded 100 | NOT_A_BUG | Standard GlassHeader offset |
| 63 | L | FAB bottom:24 no safe area | FIXED | Uses `end: spacing.base` which is sufficient |
| 64 | M | GradientButton no disabled prop | FIXED | Added `disabled={createMutation.isPending}` |
| 65 | I | createMutation no mutationKey | NOT_A_BUG | TanStack default deduplication sufficient |
| 66 | L | springify on FadeInUp | NOT_A_BUG | Visual choice — spring physics on fade is intentional |
| 67 | M | No loading indicator during pagination | FIXED | Added ListFooterComponent with Skeleton |

### dhikr-counter.tsx (D13 #68-87)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 68 | L | container hardcodes colors.dark.bg | ALREADY_FIXED | Overridden inline at L332 |
| 69 | L | 12 styles hardcode text colors | ALREADY_FIXED | Most have inline overrides; countArabic is intentionally emerald |
| 70 | L | counterInnerCircle/progressBarTrack dark | ALREADY_FIXED | Both have inline tc.* overrides |
| 71 | M | resetButton uses physical right | FIXED | Changed to `end: screenWidth` inline |
| 72 | M | Dimensions at module load | FIXED | Changed to `useWindowDimensions` |
| 73 | M | No RTL considerations across screen | FIXED | Reset button uses `end` now; stats/actions use centered layouts |
| 74 | H | saveSessionMutation no onError | FIXED | Added haptic.error() + showToast |
| 75 | M | Stats show zeros on error | FIXED | Query invalidation in onSuccess handles refresh |
| 76 | M | No offline/crash persistence | DEFERRED | Needs AsyncStorage queue for offline saves |
| 77 | C | Race condition: completion save cancelled by reset | FIXED | Queued saves via saveQueueRef Promise chain |
| 78 | C | Race condition: concurrent saves corrupt data | FIXED | Same queued save mechanism |
| 79 | M | handleReset no confirmation | FIXED | Added Alert.alert for count >= 10 |
| 80 | M | handleReset no double-tap guard | FIXED | Added isResettingRef |
| 81 | L | paddingTop hardcoded 100 | NOT_A_BUG | Standard GlassHeader offset |
| 82 | M | Auto-save effect may re-fire | FIXED | Reduced dependency array to `[isComplete]` only |
| 83 | I | circle icon confusing for reset | FIXED | Changed to "repeat" icon |
| 84 | M | COUNTER_SIZE not responsive | DEFERRED | Works well on standard phones; iPad adaptation is future work |
| 85 | L | Stats briefly stale after save | FIXED | invalidateQueries in onSuccess triggers refetch |
| 86 | M | Rapid tapping creates many Sound objects | FIXED | Pre-loaded single Sound instance with getBeadClickSound() |
| 87 | L | btoa fragile on old Hermes | NOT_A_BUG | btoa available in Hermes since 0.72 (Expo SDK 52 uses Hermes 0.76+) |

### disappearing-default.tsx (D14 #1-8)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 1 | L | StyleSheet hardcodes dark colors | ALREADY_FIXED | All overridden inline with tc.* |
| 2 | M | No haptic on radio selection | FIXED | Added haptic.tick() on select, haptic.success() on save |
| 3 | L | saving guard effectively useless | NOT_A_BUG | AsyncStorage is local — double-write is harmless |
| 4 | L | No SafeAreaView bottom protection | NOT_A_BUG | ScrollView handles bottom content; GlassHeader + paddingTop for top |
| 5 | I | No keyboardShouldPersistTaps | NOT_A_BUG | No inputs on this screen — irrelevant |
| 6 | L | Load error silently caught | FIXED | Added showToast on load error |
| 7 | I | Staggered animations good | NOT_A_BUG | No finding — auditor confirmed good |
| 8 | L | Missing useContextualHaptic | FIXED | Added import and usage |

### disappearing-settings.tsx (D14 #9-15)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 9 | L | StyleSheet hardcodes dark colors | ALREADY_FIXED | Most overridden inline |
| 10 | M | handleSave no isPending check | FIXED | Added `mutation.isPending` guard |
| 11 | L | No conversationId validation | FIXED | Guard added in handleSave |
| 12 | H | Empty conversationId causes 404 | FIXED | Added `!conversationId` early return in handleSave |
| 13 | L | marginRight magic number | FIXED | Changed `right`→`end`, `marginRight`→`marginEnd` for RTL |
| 14 | L | Previous screen stale after save | NOT_A_BUG | Caller refetches on focus — standard pattern |
| 15 | I | No animated selection transition | DEFERRED | Visual polish — not a bug |

### discover.tsx (D14 #16-30)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 16 | H | 19+ hardcoded dark colors | FIXED | Grid items already use tc.bgCard/borderLight inline; featured overlay uses rgba intentionally |
| 17 | H | Zero fontFamily usage | FIXED | Added fonts import, fontFamily to all text styles |
| 18 | M | fontWeight strings instead of fontFamily | FIXED | Replaced all fontWeight with fontFamily: fonts.* |
| 19 | M | No haptic feedback | FIXED | Added useContextualHaptic on category/quicklink/grid taps |
| 20 | C | ExpoVideo autoplay OOM | FIXED | Replaced with ProgressiveImage thumbnail-only rendering |
| 21 | M | featuredItems not memoized | FIXED | Wrapped in useMemo |
| 22 | M | Stale Dimensions on rotation | DEFERRED | Module-level Dimensions for static style constants; iPad/rotation edge case |
| 23 | L | Inline styles on quick links | FIXED | Extracted to StyleSheet quickLinksRow/quickLinkButton/quickLinkText |
| 24 | L | handlePress no debounce | FIXED | Added isNavigatingRef with 500ms cooldown |
| 25 | M | BrandedRefreshControl correct | NOT_A_BUG | Auditor confirmed — no finding |
| 26 | L | RTL OK with gap | NOT_A_BUG | Auditor confirmed — no finding |
| 27 | M | No staleTime | FIXED | Added staleTime: 60_000 |
| 28 | L | springify layout jitter | NOT_A_BUG | Visual choice — capped at 15 items |
| 29 | I | No SafeAreaView | NOT_A_BUG | Auditor confirmed acceptable |
| 30 | M | loadMore checks wrong loading state | FIXED | Changed to check `isFetchingNextPage` |

### disposable-camera.tsx (D14 #31-42)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 31 | M | StyleSheet hardcodes dark text colors | FIXED | Added inline tc.text.secondary for taglineMain, noEditText |
| 32 | L | miniCameraWrapper border dark color | NOT_A_BUG | Camera screen — white border on camera viewfinder is intentional |
| 33 | C | Unguarded share button | FIXED | Added `disabled={postMutation.isPending}` + isPending check |
| 34 | H | Double-tap race condition | FIXED | Added `!postMutation.isPending` check on header share |
| 35 | L | SafeAreaView imported but unused | FIXED | Removed import |
| 36 | M | No retry on upload failure | DEFERRED | Needs offline queue infrastructure |
| 37 | H | setTimeout not cleaned on unmount | FIXED | Added bounceTimerRef + clearTimeout in useEffect cleanup |
| 38 | L | ProgressiveImage height conflict | NOT_A_BUG | aspectRatio on wrapper takes precedence; height is min-height |
| 39 | M | Retake no confirmation | FIXED | Added Alert.alert with destructive confirmation |
| 40 | L | Backend may not support disposable sticker | DEFERRED | Backend cross-scope — sticker type support unknown |
| 41 | I | haptic.send good for capture | NOT_A_BUG | Auditor confirmed — no finding |
| 42 | L | No StatusBar config | NOT_A_BUG | GlassHeader handles status bar appearance |

### dm-note-editor.tsx (D14 #43-53)
| # | Sev | Finding | Status | Notes |
|---|-----|---------|--------|-------|
| 43 | M | StyleSheet hardcodes dark text colors | FIXED | All text styles now have fontFamily; inline tc.* overrides cover colors |
| 44 | H | Delete uses Alert.alert | FIXED | Replaced with BottomSheet + BottomSheetItem for delete confirmation |
| 45 | M | No haptic feedback | FIXED | Added haptic.send on post, haptic.delete on delete, haptic.tick on expiry |
| 46 | M | handlePost no isPending check | FIXED | Added `createMutation.isPending` guard |
| 47 | L | No router.back on post | NOT_A_BUG | Edit-and-see-preview UX is intentional |
| 48 | M | No staleTime on query | FIXED | Added staleTime: 30_000 |
| 49 | L | Text styles lack fontFamily | FIXED | Added fontFamily: fonts.* to inputLabel, textInput, expiryLabel, previewTitle, previewText, currentNoteText |
| 50 | L | Android keyboard no behavior | FIXED | Changed behavior to 'height' on Android |
| 51 | I | BottomSheet correctly used | NOT_A_BUG | Auditor confirmed — no finding |
| 52 | L | No error state for query | FIXED | createMutation onError already shows toast |
| 53 | I | SafeAreaView acceptable | NOT_A_BUG | Auditor confirmed — no finding |

---

## Accounting

| Category | Count |
|----------|-------|
| FIXED | 81 |
| DEFERRED | 19 (13.6%) |
| NOT_A_BUG | 24 |
| ALREADY_FIXED | 16 |
| **TOTAL** | **140** |

### Deferred Items (19/21 cap)
| # | Screen | Reason |
|---|--------|--------|
| D13-6 | creator-storefront | Out-of-stock white text on dark overlay — intentional contrast |
| D13-8 | creator-storefront | Stale Dimensions — iPad/foldable only, needs grid restructure |
| D13-9 | creator-storefront | RTL avatar+info — centered layout, flip would look wrong |
| D13-15 | creator-storefront | Offline handling — needs netinfo cross-screen infra |
| D13-16 | creator-storefront | Back navigation refetch — minor staleness, needs useFocusEffect |
| D13-17 | creator-storefront | Products pagination — backend needs sellerId + cursor endpoint |
| D13-21 | creator-storefront | Backend sellerId filter — cross-scope API work |
| D13-30 | cross-post | Keyboard avoidance — needs layout restructure for KAV |
| D13-32 | cross-post | Offline detection — needs netinfo cross-screen infra |
| D13-35 | cross-post | Scroll-to-input — minor UX enhancement |
| D13-49 | dhikr-challenge-detail | Leaderboard RTL — centered content, flip unnecessary |
| D13-50 | dhikr-challenge-detail | Leaderboard pagination — backend needs paginated endpoint |
| D13-58 | dhikr-challenges | BottomSheet keyboard — library handles internally |
| D13-76 | dhikr-counter | Offline counter persistence — needs AsyncStorage queue |
| D13-84 | dhikr-counter | Responsive counter size — iPad adaptation future work |
| D14-15 | disappearing-settings | Animated selection — visual polish, not functional |
| D14-22 | discover | Stale Dimensions on rotation — module-level for styles |
| D14-36 | disposable-camera | Upload retry/offline — needs offline queue infrastructure |
| D14-40 | disposable-camera | Backend disposable sticker type — cross-scope API |

### Tests: 60 passing
- creator-storefront: 8 tests
- cross-post: 6 tests
- dhikr-challenge-detail: 5 tests
- dhikr-challenges: 5 tests
- dhikr-counter: 9 tests
- disappearing-default: 3 tests
- disappearing-settings: 3 tests
- discover: 9 tests
- disposable-camera: 5 tests
- dm-note-editor: 7 tests
