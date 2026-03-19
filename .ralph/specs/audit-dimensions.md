# Audit Dimensions — What to Check on EVERY File

## D1: Code Quality & TypeScript Safety
- `as any` usage (FORBIDDEN in non-test code)
- `@ts-ignore` / `@ts-expect-error` (FORBIDDEN)
- Unused imports or variables
- Missing return types on exported functions
- Raw `console.log` without `__DEV__` guard
- Hardcoded strings that should be i18n keys
- Dead code / unreachable branches
- Missing error handling on async operations
- `any` type in function parameters or return types

## D2: UI Component Compliance (Mobile Only)
- `Modal` from react-native (MUST be `<BottomSheet>`)
- Bare `<ActivityIndicator>` (MUST be `<Skeleton.*>` except in buttons)
- Bare "No items" / "No data" text (MUST be `<EmptyState>`)
- Text emoji for icons like ←, ✕, ✓ (MUST be `<Icon name="...">`)
- Hardcoded `borderRadius` >= 6 (MUST be `radius.*` from theme)
- CSS `linear-gradient(...)` string (MUST be `expo-linear-gradient`)
- Missing `<RefreshControl>` on FlatList/FlashList
- Hardcoded color values (MUST use `colors.*` from theme)
- Hardcoded spacing values (MUST use `spacing.*` from theme)
- Hardcoded font sizes (MUST use `fontSize.*` from theme)
- Missing `accessibilityLabel` on pressable/touchable elements
- Missing `accessibilityRole` on buttons

## D3: Performance
- Unbounded database queries (missing `take` limit on findMany)
- Missing `React.memo` on list item components
- Inline function definitions in `renderItem` (should be extracted)
- Missing `useCallback`/`useMemo` where re-renders are likely
- Large images without caching (should use Expo Image or FastImage)
- Missing `keyExtractor` on FlatList/FlashList
- Missing `estimatedItemSize` on FlashList
- N+1 query patterns in services (loading relations in loops)
- Missing database indexes on frequently queried fields
- Synchronous operations that should be async

## D4: Security
- SQL injection risk (raw queries without parameterization)
- Missing auth guard on protected endpoints
- Missing input validation (DTOs without class-validator decorators)
- Secrets/API keys hardcoded in source
- Missing rate limiting on sensitive endpoints
- Missing CSRF protection
- Overly permissive CORS configuration
- User data exposed without ownership check (can user A see user B's private data?)
- Missing `@CurrentUser('id')` — using full user object unnecessarily
- File upload without type/size validation

## D5: Accessibility
- Missing `accessibilityLabel` on interactive elements
- Missing `accessibilityRole` (button, link, image, header, etc.)
- Missing `accessibilityHint` on non-obvious actions
- Color contrast violations (text on background < 4.5:1 ratio)
- Touch targets < 44pt
- Images without alt text / accessibility description
- Non-descriptive button text ("Click here" instead of "Share post")
- Missing keyboard navigation support (web)
- Animations without reduced-motion respect

## D6: Internationalization
- Hardcoded English strings (should be `t('key')`)
- Missing translation keys in en.json
- Date formatting without locale awareness
- Number formatting without locale
- Currency formatting without locale
- RTL layout issues (flexDirection, margins, padding, icons)
- Text truncation that breaks in Arabic (longer text)
- Hardcoded "left"/"right" instead of "start"/"end"

## D7: Error Handling
- Missing try/catch on API calls
- Missing error boundaries on screens
- Missing loading states
- Missing empty states
- Missing offline handling
- Network errors not caught
- Missing toast/snackbar for user feedback on errors
- Swallowed errors (catch with no action)
- Missing retry logic on transient failures

## D8: Architecture & Patterns
- Screens importing from wrong layer (screen → screen, instead of screen → component)
- Business logic in UI components (should be in services/hooks)
- Duplicated code across screens
- Missing Zustand store usage where state is shared
- API calls directly in components instead of through service files
- Missing query invalidation after mutations
- Missing optimistic updates on user actions
- Socket events not cleaned up on unmount
- Missing navigation cleanup on screen unmount

## D9: API Design
- Missing pagination on list endpoints
- Missing cursor-based pagination (using offset instead)
- Missing `@Throttle` decorator on public endpoints
- Inconsistent response format
- Missing Swagger/OpenAPI decorators
- Overly broad data selection (returning unnecessary fields)
- Missing `select` on Prisma queries (selecting entire model when only needing 2 fields)
- DELETE endpoints not checking ownership
- Missing idempotency on create endpoints

## D10: Testing
- Service file without corresponding .spec.ts
- Test file with no actual assertions (empty tests)
- Mock data using `as any` where proper typing would work
- Missing edge case tests (empty input, null, boundary values)
- Missing error path tests

## D11: Islamic Feature Correctness
- Prayer time calculations — are they using proper astronomical methods?
- Hijri date conversion — is it accurate?
- Qibla direction — correct formula?
- Quran text — is it from a verified source?
- Hadith attribution — correct collections referenced?
- Zakat calculation — follows fiqh rules?
- Ramadan timing — accurate for user's location?

## D12: Real-time & Socket
- Missing socket event cleanup on disconnect
- Missing socket authentication verification
- Race conditions in concurrent message handling
- Missing message deduplication
- Missing typing indicator timeout
- Missing presence timeout (user goes offline but still shows online)

## D13: Media & Storage
- Missing media type validation on upload
- Missing file size limits
- Missing thumbnail generation for videos
- Missing media compression
- Missing presigned URL expiry
- Missing R2 lifecycle rules for temporary uploads

## D14: Monetization & Payments
- Missing Stripe webhook signature verification
- Missing idempotency keys on payment operations
- Missing error handling on payment failures
- Missing refund logic
- Price amounts hardcoded instead of configurable
- Missing currency conversion

## D15: Navigation & Routing
- Screens not reachable from any navigation flow (orphaned)
- Missing deep link handling
- Missing back button handling
- Missing screen transition animations
- Tab state not preserved on switch
- Missing scroll restoration on back navigation
