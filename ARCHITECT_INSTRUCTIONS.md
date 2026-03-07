# ARCHITECT INSTRUCTIONS — Mizanly (Batch 10: Bug Fixes + Quality)
## For Sonnet/Haiku: Read CLAUDE.md first, then this file top to bottom.

**Last updated:** 2026-03-07 by Claude Opus 4.6
**Previous batches:** 1-8 (features+quality+security) -> 9 (close gaps) -> This file.

---

## CRITICAL CONTEXT

Batch 9 completed perfectly: 200/200 tests pass, 0 dead buttons, 0 console statements, 0 `as any` (except 3 accepted), all detail screens have error states. This batch fixes bugs found in a deep 6-agent audit sweep.

**Codebase status:** 0 compilation errors, 200/200 tests pass, 42 screens, 151+ endpoints.
**This batch:** 3 critical bugs, 5 high-priority quality fixes, 3 missing spec files.

---

## DO NOT TOUCH

- Prisma schema field names — final
- `$executeRaw` tagged template literals — safe
- Passing tests — don't rewrite
- All working features across all 5 spaces
- Files not listed in your assigned step

---

## STEP 1: ADD REEL COMMENT DELETE ENDPOINT (backend)

### 1.1 Add deleteComment to ReelsService

**File:** `apps/api/src/modules/reels/reels.service.ts`

The backend has NO endpoint to delete a reel comment. The mobile currently calls `reelsApi.delete(reelId)` which deletes the ENTIRE REEL — critical bug.

**Add this method** after the existing `comment()` method (around line 320):

```ts
async deleteComment(reelId: string, commentId: string, userId: string) {
  const comment = await this.prisma.reelComment.findUnique({
    where: { id: commentId },
  });
  if (!comment) throw new NotFoundException('Comment not found');
  if (comment.reelId !== reelId) throw new NotFoundException('Comment not found');
  if (comment.userId !== userId) throw new ForbiddenException('Not your comment');

  await this.prisma.$transaction([
    this.prisma.reelComment.delete({ where: { id: commentId } }),
    this.prisma.$executeRaw`UPDATE "Reel" SET "commentsCount" = GREATEST(0, "commentsCount" - 1) WHERE id = ${reelId}`,
  ]);
  return { deleted: true };
}
```

### 1.2 Add deleteComment to ReelsController

**File:** `apps/api/src/modules/reels/reels.controller.ts`

Add this endpoint AFTER the `getComments` method (after line 84):

```ts
@Delete(':id/comments/:commentId')
@ApiOperation({ summary: 'Delete a comment from a reel' })
deleteComment(
  @Param('id') id: string,
  @Param('commentId') commentId: string,
  @CurrentUser('id') userId: string,
) {
  return this.reelsService.deleteComment(id, commentId, userId);
}
```

### 1.3 Update reels.service.spec.ts

**File:** `apps/api/src/modules/reels/reels.service.spec.ts`

Add tests for `deleteComment`:
1. Read the spec file to understand the mock pattern used
2. Add a `describe('deleteComment')` block with 3 tests:
   - Should delete own comment successfully
   - Should throw NotFoundException for non-existent comment
   - Should throw ForbiddenException when deleting another user's comment

### 1.4 Clarify TODO

In `reels.service.ts` line 110, replace:
```ts
// TODO: In future, trigger video processing job here
```
with:
```ts
// Video processing deferred — mark as READY immediately for MVP
```

**Run after:** `cd apps/api && npx jest reels.service.spec && npx jest --passWithNoTests`

---

## STEP 2: FIX MOBILE REEL COMMENT DELETE + FOLLOW PATH (mobile)

### 2.1 Add deleteComment to reelsApi

**File:** `apps/mobile/src/services/api.ts`

Find the `reelsApi` object (around line 254). Add this method after the existing `delete` method:

```ts
deleteComment: (reelId: string, commentId: string) =>
  api.delete(`/reels/${reelId}/comments/${commentId}`),
```

### 2.2 Fix follow requests path

**Same file:** `apps/mobile/src/services/api.ts`

Find line 197:
```ts
getRequests: () => api.get<PaginatedResponse<FollowRequest>>('/follows/requests'),
```

Change to:
```ts
getRequests: () => api.get<PaginatedResponse<FollowRequest>>('/follows/requests/incoming'),
```

The backend endpoint is `GET /follows/requests/incoming` (see follows.controller.ts line 61).

### 2.3 Fix comment delete mutation in reel/[id].tsx

**File:** `apps/mobile/app/(screens)/reel/[id].tsx`

Find line 57-58 (inside the CommentRow component):
```ts
const deleteMutation = useMutation({
  mutationFn: () => reelsApi.delete(reelId),
```

Change to:
```ts
const deleteMutation = useMutation({
  mutationFn: () => reelsApi.deleteComment(reelId, comment.id),
```

This fixes the critical bug where deleting a comment would delete the entire reel.

---

## STEP 3: FIX PollResultBar useState MISUSE (mobile)

**File:** `apps/mobile/src/components/majlis/ThreadCard.tsx`

Find lines 364-369 (inside `PollResultBar` function):
```ts
// Animate the bar width on mount
useState(() => {
  setTimeout(() => {
    width.value = withSpring(pct, animation.spring.gentle);
  }, 100);
});
```

Replace with:
```ts
// Animate the bar width on mount
useEffect(() => {
  const timer = setTimeout(() => {
    width.value = withSpring(pct, animation.spring.gentle);
  }, 100);
  return () => clearTimeout(timer);
}, [pct]);
```

**Also check imports at the top of the file:**
- If `useEffect` is not imported from 'react', add it to the existing react import
- `useState` may become unused after this change — remove it from imports ONLY if no other code in the file uses it (search the file first)

---

## STEP 4: ADD DISCARD CONFIRMATION + DRAFT SAVE TO create-thread.tsx

**File:** `apps/mobile/app/(screens)/create-thread.tsx`

### 4.1 Add draft auto-save

Read create-post.tsx to see the existing draft pattern (uses AsyncStorage with a 2-second debounce). Implement the same pattern for threads:

1. Add import at top:
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
```

2. Add draft key constant near the top of the component:
```ts
const THREAD_DRAFT_KEY = 'draft:thread';
```

3. Add load-draft effect (near other useEffects):
```ts
useEffect(() => {
  AsyncStorage.getItem(THREAD_DRAFT_KEY).then((saved) => {
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.parts) setParts(draft.parts);
      } catch {}
    }
  }).catch(() => {});
}, []);
```

4. Add save-draft effect:
```ts
useEffect(() => {
  const timer = setTimeout(() => {
    const hasContent = parts.some((p) => p.content.trim() || p.media.length > 0);
    if (hasContent) {
      AsyncStorage.setItem(THREAD_DRAFT_KEY, JSON.stringify({ parts })).catch(() => {});
    }
  }, 2000);
  return () => clearTimeout(timer);
}, [parts]);
```

5. Clear draft on successful post (in the mutation's onSuccess):
```ts
AsyncStorage.removeItem(THREAD_DRAFT_KEY).catch(() => {});
```

### 4.2 Add discard confirmation

Find the back/cancel button handler. Replace the direct `router.back()` call with:

```ts
const handleBack = () => {
  const hasContent = parts.some((p) => p.content.trim() || p.media.length > 0);
  if (hasContent) {
    Alert.alert('Discard thread?', 'You have unsaved content.', [
      { text: 'Keep editing' },
      { text: 'Discard', style: 'destructive', onPress: () => {
        AsyncStorage.removeItem(THREAD_DRAFT_KEY).catch(() => {});
        router.back();
      }},
    ]);
  } else {
    router.back();
  }
};
```

Make sure `Alert` is imported from `react-native`. Wire `handleBack` to the Cancel/back button's `onPress`.

---

## STEP 5: ADD DISCARD CONFIRMATION TO create-reel.tsx + create-story.tsx

### 5.1 create-reel.tsx

**File:** `apps/mobile/app/(screens)/create-reel.tsx`

Find the back button handler. Replace direct `router.back()` with:

```ts
const handleBack = () => {
  const hasContent = !!video || caption.trim().length > 0;
  if (hasContent) {
    Alert.alert('Discard reel?', 'You have unsaved content.', [
      { text: 'Keep editing' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  } else {
    router.back();
  }
};
```

Read the file first to find the correct state variable names (`video`, `caption`, etc.). Wire `handleBack` to the back button. Make sure `Alert` is imported.

### 5.2 create-story.tsx

**File:** `apps/mobile/app/(screens)/create-story.tsx`

Same pattern:

```ts
const handleBack = () => {
  const hasContent = !!mediaUri || (textOverlay?.trim().length ?? 0) > 0;
  if (hasContent) {
    Alert.alert('Discard story?', 'You have unsaved content.', [
      { text: 'Keep editing' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  } else {
    router.back();
  }
};
```

Read the file first to find the correct state variable names. Wire `handleBack` to the Cancel button.

---

## STEP 6: FIX THEME COMPLIANCE IN 5 COMPONENTS

### 6.1 ErrorBoundary.tsx — Replace emoji with Icon

**File:** `apps/mobile/src/components/ErrorBoundary.tsx`

Line 29: Replace `<Text style={styles.emoji}>🕌</Text>` with:
```tsx
<Icon name="slash" size="xl" color={colors.text.secondary} />
```

Add imports if not present:
```ts
import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme';
```

Remove the `emoji` style from the StyleSheet if it exists (it would have fontSize/textAlign for the emoji).

### 6.2 CharCountRing.tsx — Replace hardcoded colors

**File:** `apps/mobile/src/components/ui/CharCountRing.tsx`

Line 21: Replace:
```ts
const color = ratio >= 1 ? '#EF4444' : ratio >= 0.9 ? '#F59E0B' : colors.emerald;
```
with:
```ts
const color = ratio >= 1 ? colors.error : ratio >= 0.9 ? colors.gold : colors.emerald;
```

`colors.error` is `#F85149` (close to the original red) and `colors.gold` is `#C8963E` (brand gold, replaces the yellow warning).

### 6.3 PostMedia.tsx — Replace hardcoded colors

**File:** `apps/mobile/src/components/saf/PostMedia.tsx`

These are overlay/carousel UI colors. Replace:

| Line | Old | New |
|------|-----|-----|
| 73 | `color="#FFF"` | `color={colors.text.primary}` |
| 81 | `color="#FFF"` | `color={colors.text.primary}` |
| 86 | `color="#FFF"` | `color={colors.text.primary}` |
| 119 (style) | `backgroundColor: 'rgba(255,255,255,0.35)'` | `backgroundColor: 'rgba(255,255,255,0.35)'` (KEEP — this is an overlay dot, not a theme color) |
| 122 (style) | `backgroundColor: '#fff'` | `backgroundColor: colors.text.primary` |
| 135 (style) | `backgroundColor: 'rgba(0,0,0,0.5)'` | `backgroundColor: 'rgba(0,0,0,0.5)'` (KEEP — overlay backdrop) |
| 140 (style) | `color: '#fff'` | `color: colors.text.primary` |

**Import `colors` from `@/theme`** if not already imported.

**NOTE:** Semi-transparent overlays (`rgba(0,0,0,...)` and `rgba(255,255,255,0.35)`) are acceptable as-is — they're opacity variants for media overlays, not theme colors.

### 6.4 Badge.tsx — Fix hardcoded padding

**File:** `apps/mobile/src/components/ui/Badge.tsx`

Find line 65 with `paddingHorizontal: 4`. Replace with:
```ts
paddingHorizontal: spacing.xs,
```

Import `spacing` from `@/theme` if not already imported.

### 6.5 LocationPicker.tsx — Fix hardcoded padding

**File:** `apps/mobile/src/components/ui/LocationPicker.tsx`

Find line 227 with `paddingVertical: 4`. Replace with:
```ts
paddingVertical: spacing.xs,
```

Import `spacing` from `@/theme` if not already imported.

---

## STEP 7: ADD 3 MISSING SERVICE SPEC FILES (backend)

### 7.1 profile-links.service.spec.ts

**File to create:** `apps/api/src/modules/profile-links/profile-links.service.spec.ts`

1. Read `apps/api/src/modules/profile-links/profile-links.service.ts` to see all public methods
2. Read an existing spec file (e.g., `apps/api/src/modules/blocks/blocks.service.spec.ts`) for the mock pattern
3. Create spec with tests for each public method:
   - getLinks — returns user's links ordered by position
   - addLink — creates a new link
   - updateLink — updates an existing link (check ownership)
   - deleteLink — deletes a link (check ownership)
   - reorderLinks — updates positions

**Mock pattern (use this for all 3 specs):**
```ts
const mockPrisma = {
  profileLink: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), updateMany: jest.fn() },
};

beforeEach(async () => {
  const module = await Test.createTestingModule({
    providers: [
      ProfileLinksService,
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();
  service = module.get(ProfileLinksService);
});
```

### 7.2 settings.service.spec.ts

**File to create:** `apps/api/src/modules/settings/settings.service.spec.ts`

1. Read `apps/api/src/modules/settings/settings.service.ts`
2. Create spec with tests for each method (getSettings, updatePrivacy, updateNotifications, etc.)
3. Mock PrismaService with `userSetting` model methods

### 7.3 upload.service.spec.ts

**File to create:** `apps/api/src/modules/upload/upload.service.spec.ts`

1. Read `apps/api/src/modules/upload/upload.service.ts`
2. Create spec with tests for presigned URL generation, content type validation
3. Mock the AWS S3 client

**Run after all 3:** `cd apps/api && npx jest --passWithNoTests`

---

## STEP 8: BACKEND CLEANUP (3 files)

### 8.1 Clarify TODO in videos.service.ts

**File:** `apps/api/src/modules/videos/videos.service.ts`

Find line 97:
```ts
// TODO: In future, trigger video processing job here
```
Replace with:
```ts
// Video processing deferred — mark as PUBLISHED immediately for MVP
```

### 8.2 Fix swallowed catch in posts.service.ts

**File:** `apps/api/src/modules/posts/posts.service.ts`

Find the catch block around line 290 that looks like:
```ts
} catch {
  throw new ConflictException('Post already saved');
}
```

Replace with:
```ts
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('Post already saved');
  }
  throw error;
}
```

Make sure `Prisma` is imported from `@prisma/client`. This catches unique constraint violations specifically while re-throwing unexpected errors.

### 8.3 Fix swallowed catch in threads.service.ts

**File:** `apps/api/src/modules/threads/threads.service.ts`

Find the catch block around line 345:
```ts
} catch {
  throw new ConflictException('Already bookmarked');
}
```

Replace with:
```ts
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('Already bookmarked');
  }
  throw error;
}
```

Make sure `Prisma` is imported from `@prisma/client`.

**Run after:** `cd apps/api && npx jest --passWithNoTests`

---

## ABSOLUTE RULES — NEVER VIOLATE

1. **NEVER use RN `Modal`** — Always `<BottomSheet>`
2. **NEVER use text emoji for icons** — Always `<Icon name="..." />`
3. **NEVER hardcode border radius >= 6** — Always `radius.*` from theme
4. **NEVER use bare "No items" text** — Always `<EmptyState>`
5. **ALL FlatLists must have `<RefreshControl>`**
6. **NEVER use `any` in new non-test code**
7. **NEVER suppress errors with `@ts-ignore`**
8. **NEVER add `console.log/warn/error` to mobile code**
9. **The `$executeRaw` tagged template literals are SAFE**
10. **Fix TESTS to match SERVICE logic, never the reverse**

---

## PRIORITY QUEUE

```
STEP 1 — REEL COMMENT DELETE ENDPOINT (backend)
[ ] 1.1  Add deleteComment to reels.service.ts
[ ] 1.2  Add DELETE endpoint to reels.controller.ts
[ ] 1.3  Add tests to reels.service.spec.ts
[ ] 1.4  Clarify TODO in reels.service.ts

STEP 2 — FIX MOBILE API + REEL COMMENT DELETE
[ ] 2.1  Add reelsApi.deleteComment to api.ts
[ ] 2.2  Fix followsApi.getRequests path to /follows/requests/incoming
[ ] 2.3  Fix reel/[id].tsx to call deleteComment instead of delete

STEP 3 — FIX PollResultBar
[ ] 3.1  Fix useState -> useEffect in ThreadCard.tsx

STEP 4 — DISCARD + DRAFT SAVE FOR THREADS
[ ] 4.1  Add draft auto-save to create-thread.tsx
[ ] 4.2  Add discard confirmation to create-thread.tsx

STEP 5 — DISCARD CONFIRMATION
[ ] 5.1  Add discard confirmation to create-reel.tsx
[ ] 5.2  Add discard confirmation to create-story.tsx

STEP 6 — THEME COMPLIANCE
[ ] 6.1  Fix ErrorBoundary.tsx emoji -> Icon
[ ] 6.2  Fix CharCountRing.tsx hardcoded colors
[ ] 6.3  Fix PostMedia.tsx hardcoded colors
[ ] 6.4  Fix Badge.tsx hardcoded padding
[ ] 6.5  Fix LocationPicker.tsx hardcoded padding

STEP 7 — MISSING SPEC FILES
[ ] 7.1  Create profile-links.service.spec.ts
[ ] 7.2  Create settings.service.spec.ts
[ ] 7.3  Create upload.service.spec.ts

STEP 8 — BACKEND CLEANUP
[ ] 8.1  Clarify TODO in videos.service.ts
[ ] 8.2  Fix swallowed catch in posts.service.ts
[ ] 8.3  Fix swallowed catch in threads.service.ts
```

---

## 8-AGENT PARALLELIZATION (zero file conflicts)

```
Agent 1: Step 1         — reels.controller.ts, reels.service.ts, reels.service.spec.ts
Agent 2: Step 2         — api.ts, reel/[id].tsx
Agent 3: Step 3         — ThreadCard.tsx
Agent 4: Step 4         — create-thread.tsx
Agent 5: Step 5         — create-reel.tsx, create-story.tsx
Agent 6: Step 6         — ErrorBoundary.tsx, CharCountRing.tsx, PostMedia.tsx, Badge.tsx, LocationPicker.tsx
Agent 7: Step 7         — profile-links.service.spec.ts (new), settings.service.spec.ts (new), upload.service.spec.ts (new)
Agent 8: Step 8         — videos.service.ts, posts.service.ts, threads.service.ts
```

**File conflict check — every file appears in exactly one agent:**
| File | Agent |
|------|-------|
| reels.controller.ts | 1 |
| reels.service.ts | 1 |
| reels.service.spec.ts | 1 |
| api.ts | 2 |
| reel/[id].tsx | 2 |
| ThreadCard.tsx | 3 |
| create-thread.tsx | 4 |
| create-reel.tsx | 5 |
| create-story.tsx | 5 |
| ErrorBoundary.tsx | 6 |
| CharCountRing.tsx | 6 |
| PostMedia.tsx | 6 |
| Badge.tsx | 6 |
| LocationPicker.tsx | 6 |
| profile-links.service.spec.ts | 7 |
| settings.service.spec.ts | 7 |
| upload.service.spec.ts | 7 |
| videos.service.ts | 8 |
| posts.service.ts | 8 |
| threads.service.ts | 8 |

---

## VERIFICATION CHECKLIST

```bash
# 1. All tests pass (including new reel comment delete tests + 3 new spec files)
cd apps/api && npx jest --passWithNoTests
# Expected: 210+ tests pass (200 existing + ~10 new), 0 failures

# 2. Backend compiles
cd apps/api && npx tsc --noEmit
# Expected: 0 errors

# 3. No console statements in mobile
grep -rn "console\.\(log\|warn\|error\)" apps/mobile/app/ apps/mobile/src/ --include="*.tsx" --include="*.ts" | grep -v node_modules
# Expected: 0 results

# 4. No dead buttons
grep -rn "onPress={() => {}}" apps/mobile/app/ --include="*.tsx"
# Expected: 0 results

# 5. No hardcoded #FFF or #fff in component files (except overlay rgba)
grep -rn "'#[Ff][Ff][Ff]'" apps/mobile/src/components/ --include="*.tsx"
# Expected: 0 results

# 6. No emoji in components
grep -rn "🕌\|🕋\|☪" apps/mobile/src/components/ --include="*.tsx"
# Expected: 0 results

# 7. Reel comment delete endpoint exists
grep "deleteComment" apps/api/src/modules/reels/reels.controller.ts
# Expected: deleteComment method found

# 8. Follow requests path fixed
grep "requests/incoming" apps/mobile/src/services/api.ts
# Expected: /follows/requests/incoming

# 9. No useState misuse in PollResultBar
grep "useState" apps/mobile/src/components/majlis/ThreadCard.tsx
# Expected: no useState used as side effect (only normal state)

# 10. Discard confirmation exists
grep -l "Discard" apps/mobile/app/\(screens\)/create-thread.tsx apps/mobile/app/\(screens\)/create-reel.tsx apps/mobile/app/\(screens\)/create-story.tsx
# Expected: all 3 files listed
```
