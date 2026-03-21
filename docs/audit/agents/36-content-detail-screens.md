# Agent 36: Content Detail Screens — Deep Line-by-Line Audit

**Scope:** 7 screens + 2 components
- `apps/mobile/app/(screens)/post/[id].tsx` (527 lines)
- `apps/mobile/app/(screens)/thread/[id].tsx` (455 lines)
- `apps/mobile/app/(screens)/reel/[id].tsx` (735 lines)
- `apps/mobile/app/(screens)/video/[id].tsx` (997+ lines)
- `apps/mobile/app/(screens)/post-insights.tsx` (555 lines)
- `apps/mobile/src/components/bakra/CommentsSheet.tsx` (417 lines)
- `apps/mobile/src/components/VideoReplySheet.tsx` (450 lines)

**Total findings: 42**

---

## CRITICAL (Ship Blockers) — 6 findings

### FINDING 1: CommentsSheet `t()` is never defined — RUNTIME CRASH
- **File:** `apps/mobile/src/components/bakra/CommentsSheet.tsx`
- **Lines:** 2, 33, 170, 171, 230
- **Severity:** CRITICAL — crash on open
- **Code:**
  ```tsx
  // Line 2: import exists
  import { useTranslation } from '@/hooks/useTranslation';

  // Line 33: but useTranslation() is NEVER CALLED
  export function CommentsSheet({ reel, visible, onClose }: CommentsSheetProps) {
    const haptic = useHaptic();
    const queryClient = useQueryClient();
    // ... NO: const { t } = useTranslation();

  // Lines 170-171, 230: t() used but undefined
  title={t('saf.noComments')}
  subtitle={t('saf.beFirstToComment')}
  placeholder={t('saf.addComment')}
  ```
- **Impact:** Opening the CommentsSheet on the Bakra (reels) tab with empty comments or interacting with the input field will throw `ReferenceError: t is not defined` and crash the sheet. This is the primary comments UI for reels.
- **Fix:** Add `const { t } = useTranslation();` after line 34.

### FINDING 2: CommentsSheet violates Rules of Hooks — useSharedValue called conditionally
- **File:** `apps/mobile/src/components/bakra/CommentsSheet.tsx`
- **Lines:** 72-77, 89-92
- **Severity:** CRITICAL — React will crash or produce unpredictable behavior
- **Code:**
  ```tsx
  // Lines 72-77: Hook called inside regular function, conditionally
  const getLikeScale = (commentId: string) => {
    if (!likeScales.current[commentId]) {
      likeScales.current[commentId] = useSharedValue(1);  // VIOLATION
    }
    return likeScales.current[commentId];
  };

  // Lines 89-92: Hook called inside renderItem callback (not a component)
  const renderComment = ({ item }: { item: ReelComment }) => {
    const likeAnimStyle = useAnimatedStyle(() => ({  // VIOLATION
      transform: [{ scale: getLikeScale(item.id).value }],
    }));
  ```
- **Impact:** `useSharedValue` is called conditionally inside a non-component function. `useAnimatedStyle` is called inside a `renderItem` callback passed to `FlatList`, not a standalone component. React's Rules of Hooks require hooks to be called at the top level of components or custom hooks, unconditionally. This can cause hooks ordering corruption, especially as comments load/unload during scrolling.
- **Fix:** Extract the comment row into a proper `CommentItem` component that uses hooks at its top level.

### FINDING 3: Reel comment reply-to is completely non-functional
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Lines:** 131, 186-188, 224-227, 488-496
- **Severity:** CRITICAL — feature appears to work but doesn't
- **Code:**
  ```tsx
  // Line 131: replyTo state exists
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);

  // Lines 186-188: sendMutation sends NO parentId
  const sendMutation = useMutation({
    mutationFn: () =>
      reelsApi.comment(id, commentText.trim()),  // Only 2 args, no parentId!

  // Lines 224-227: handleReply sets replyTo state
  const handleReply = useCallback((commentId: string, username: string) => {
    setReplyTo({ id: commentId, username });
    inputRef.current?.focus();
  }, []);

  // Lines 488-496: UI shows reply banner
  {replyTo && (
    <View style={styles.replyBanner}>
      <Text style={styles.replyBannerText}>
        {t('comments.replyingTo')} @{replyTo.username}
      </Text>
  ```
- **Impact:** User taps "Reply" on a comment, sees the "Replying to @username" banner, types a reply, hits send — but the comment is sent as a top-level comment with no parent association. The `replyTo.id` is never transmitted. Additionally, `reelsApi.comment()` only accepts `(id, content)` — no `parentId` parameter. Even if it were sent, the backend `CreateCommentDto` only validates `content` and the service method `this.reelsService.comment(id, userId, dto.content)` only accepts 3 args with no parentId.
- **Backend:** `apps/api/src/modules/reels/reels.controller.ts` line 117: `return this.reelsService.comment(id, userId, dto.content);`
- **Backend DTO:** `apps/api/src/modules/reels/dto/create-comment.dto.ts`: only has `content` field.
- **Fix:** Add `parentId` to `CreateCommentDto`, update the service method signature, update `reelsApi.comment` to accept parentId, and pass `replyTo?.id` in the mutation.

### FINDING 4: Reel comment like is optimistic-only — never persisted to backend
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Lines:** 59-65
- **Severity:** CRITICAL — data loss on refresh
- **Code:**
  ```tsx
  // Lines 59-65: Comment in code explicitly admits it
  // Note: Reel comment liking not implemented in API yet
  const handleLikeComment = () => {
    // Optimistic-only — no backend endpoint for reel comment likes yet
    haptic.medium();
    setLocalLiked((p: boolean) => !p);
    setLocalLikes((p: number) => (localLiked ? p - 1 : p + 1));
    // NO API CALL
  };
  ```
- **Impact:** User likes a reel comment, sees the heart fill and count change. On refresh or reopening the screen, the like is gone. The backend controller (`apps/api/src/modules/reels/reels.controller.ts`) has NO endpoints matching `/:id/comments/:commentId/like` — verified by reading the full controller (ends at line 237 with no comment-like routes).
- **Contradiction:** The mobile API service at `apps/mobile/src/services/api.ts` lines 400-401 DOES define `likeComment` and `unlikeComment` for reels, but these endpoints don't exist on the backend and would 404.
- **Fix:** Add like/unlike comment endpoints to reels controller and service, then wire the mobile handleLikeComment to use `reelsApi.likeComment`.

### FINDING 5: CommentsSheet reel comment like is also optimistic-only
- **File:** `apps/mobile/src/components/bakra/CommentsSheet.tsx`
- **Lines:** 79-87
- **Severity:** CRITICAL — same as Finding 4 but in the alternate comments UI
- **Code:**
  ```tsx
  const handleLikeComment = async (commentId: string) => {
    // Optimistic-only — no backend endpoint for reel comment likes yet
    haptic.light();
    const scale = getLikeScale(commentId);
    scale.value = withSequence(
      withSpring(1.3, { damping: 12, stiffness: 350 }),
      withSpring(1, { damping: 10, stiffness: 400 })
    );
    // NO API CALL — like is purely visual
  };
  ```
- **Impact:** Same as Finding 4. Likes on reel comments are visual-only and never persisted.

### FINDING 6: Reel detail follow button is dead — no onPress handler
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Lines:** 337-339
- **Severity:** CRITICAL — core UX flow broken
- **Code:**
  ```tsx
  <Pressable style={styles.followButton}>
    <Text style={styles.followButtonText}>{t('common.follow')}</Text>
  </Pressable>
  ```
- **Impact:** The "Follow" button displayed over the reel video overlay has no `onPress` handler. Tapping it does nothing. Users cannot follow reel creators from the reel detail screen. There is also no follow mutation defined anywhere in the screen.
- **Fix:** Add a follow mutation using the follows API and wire it to the button.

---

## HIGH (Functional Bugs) — 10 findings

### FINDING 7: Duplicate Pressable import in ALL 4 content detail screens
- **Files:**
  - `apps/mobile/app/(screens)/post/[id].tsx` lines 3, 5
  - `apps/mobile/app/(screens)/thread/[id].tsx` lines 3, 5
  - `apps/mobile/app/(screens)/reel/[id].tsx` lines 3, 6
  - `apps/mobile/app/(screens)/video/[id].tsx` lines 3, 5
- **Code (post/[id].tsx example):**
  ```tsx
  import {
    View, Text, StyleSheet, TextInput, Pressable,
    KeyboardAvoidingView, Platform, FlatList, RefreshControl, Alert,
    Pressable,    // DUPLICATE
  } from 'react-native';
  ```
- **Impact:** While JavaScript destructuring allows duplicate keys (last wins), this is a linting violation and suggests copy-paste errors. Some bundlers may warn.

### FINDING 8: CommentsSheet sends parentId that backend silently ignores
- **File:** `apps/mobile/src/components/bakra/CommentsSheet.tsx`
- **Line:** 49
- **Code:**
  ```tsx
  mutationFn: (content: string) => api.post(`/reels/${reel.id}/comment`, { content, parentId: replyTo?.id }),
  ```
- **Impact:** The CommentsSheet correctly sends `parentId` in the body when replying, but the backend `CreateCommentDto` only has a `content` field. If NestJS has `whitelist: true`, `parentId` is stripped. If not, it's ignored by the service. Either way, replies are posted as top-level comments. The reply UX is deceptive.

### FINDING 9: Video detail comments not paginated — only first page loads
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 158-162
- **Code:**
  ```tsx
  const commentsQuery = useQuery({
    queryKey: ['video-comments', id],
    queryFn: () => videosApi.getComments(id).then(res => res.data),
    enabled: !!id,
  });
  ```
- **Impact:** Uses `useQuery` instead of `useInfiniteQuery`. Only the first page of comments is ever loaded. For videos with many comments, users see at most ~20 comments (default backend page size). No "load more" capability. Post, thread, and reel screens all correctly use `useInfiniteQuery`.

### FINDING 10: Video detail comment sheet uses ScrollView with .map() instead of FlatList
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 854-856
- **Code:**
  ```tsx
  <ScrollView style={styles.sheetComments}>
    {comments.map(comment => renderCommentItem({ item: comment }))}
  </ScrollView>
  ```
- **Impact:** All comments are rendered at once. For videos with 100+ comments, this will cause memory pressure and jank. Should use `FlatList` with virtualization. Also has no `RefreshControl`.

### FINDING 11: Video detail `handleVideoDoubleTap` defined but never used — dead code
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 139-148
- **Code:**
  ```tsx
  const handleVideoDoubleTap = (e: { nativeEvent: { locationX: number; locationY: number } }) => {
    const { locationX, locationY } = e.nativeEvent;
    const id = Date.now().toString();
    setLikeBursts(prev => [...prev, { id, x: locationX, y: locationY }]);
    haptic.light();
    handleLike();
    setTimeout(() => {
      setLikeBursts(prev => prev.filter(b => b.id !== id));
    }, 1000);
  };
  ```
- **Impact:** Double-tap to like is a standard video player feature but this handler is defined and never wired to any gesture or press event. Dead code. Also note line 141 `const id = Date.now().toString()` shadows the outer `id` from `useLocalSearchParams`.

### FINDING 12: Video detail `showNextEpisode` and `nextEpisodeCountdown` state never used
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 236-237, 255-257
- **Code:**
  ```tsx
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState(5);
  // ...
  if (status.didJustFinish) {
    setShowNextEpisode(true);  // Set but never read in render
  }
  ```
- **Impact:** The auto-play next episode UI was never built. `showNextEpisode` is set to `true` when video finishes but nothing in the render output checks this state. `nextEpisodeCountdown` is never decremented or displayed. Dead state.

### FINDING 13: Video detail `LikeBurst` and `ChapterMarker` components defined inside render function
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 402-430 (LikeBurst), 433-468 (ChapterMarker)
- **Code:**
  ```tsx
  export default function VideoDetailScreen() {
    // ... state ...

    function LikeBurst({ x, y }: { x: number; y: number }) {
      const scaleAnim = useSharedValue(0);    // hooks inside nested component
      // ...
    }

    function ChapterMarker({ chapter, index, total, currentProgress }) {
      // ...
    }
  ```
- **Impact:** Both components are recreated on every render of `VideoDetailScreen`. This means:
  1. Their identity changes each render, causing React to unmount and remount them
  2. All internal state (animations, shared values) is lost on parent re-render
  3. `LikeBurst` animations may not complete if parent re-renders during the animation
- **Fix:** Move both components outside the parent component function.

### FINDING 14: Post and thread detail have no share functionality
- **Files:**
  - `apps/mobile/app/(screens)/post/[id].tsx` — entire file
  - `apps/mobile/app/(screens)/thread/[id].tsx` — entire file
- **Impact:** Neither screen has a share button, Share.share() call, or any share-related code. Reel detail and video detail both have share functionality. Users cannot share posts or threads from their detail screens. This is a significant UX gap compared to Instagram/X which always have share buttons on content detail.

### FINDING 15: No error handling on comment/reply send mutations in 4 screens
- **Files:**
  - `apps/mobile/app/(screens)/post/[id].tsx` lines 245-254
  - `apps/mobile/app/(screens)/thread/[id].tsx` lines 186-195
  - `apps/mobile/app/(screens)/reel/[id].tsx` lines 186-195
  - `apps/mobile/app/(screens)/video/[id].tsx` lines 227-234
- **Code (post/[id].tsx example):**
  ```tsx
  const sendMutation = useMutation({
    mutationFn: () =>
      postsApi.addComment(id, commentText.trim(), replyTo?.id),
    onSuccess: () => {
      setCommentText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['post-comments', id] });
    },
    // NO onError handler
  });
  ```
- **Impact:** If comment submission fails (network error, 401 auth expired, 429 rate limited, 500 server error), the user gets no feedback. The comment text stays in the input, the loading state clears, but no error message is shown. User may repeatedly tap send without knowing why it's failing.

### FINDING 16: Post detail `id` could be undefined — no guard
- **File:** `apps/mobile/app/(screens)/post/[id].tsx`
- **Line:** 218
- **Code:**
  ```tsx
  const { id } = useLocalSearchParams<{ id: string }>();
  ```
- **Impact:** `useLocalSearchParams` returns `string | string[] | undefined`. If the route is accessed without a valid `id` param (e.g., deep link error), `id` will be `undefined`. The `postQuery` will immediately fire with `postsApi.getById(undefined)` resulting in an API call to `/posts/undefined`. The same issue exists in thread, reel, and video detail screens. Post and reel queries have no `enabled: !!id` guard (video does at line 155: `enabled: !!id`).

---

## MEDIUM (UX/Data Integrity) — 14 findings

### FINDING 17: Reel detail has zero RTL support
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Impact:** No imports or usage of `rtlFlexRow`, `rtlTextAlign`, `rtlMargin`, or `rtlBorderStart`. All layouts are hardcoded LTR. Arabic/Urdu users see incorrect text alignment and reversed UI. Post detail and thread detail both have full RTL support.

### FINDING 18: Video detail has zero RTL support
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Impact:** Same as Finding 17. No RTL utilities used anywhere in the 997+ line file.

### FINDING 19: `useMemo` dependency arrays missing `t` in 3 screens
- **Files:**
  - `apps/mobile/app/(screens)/post/[id].tsx` line 337: `[commentsQuery.isLoading, postQuery.data]` — missing `t`
  - `apps/mobile/app/(screens)/thread/[id].tsx` line 273: `[repliesQuery.isLoading, threadQuery.data]` — missing `t`
  - `apps/mobile/app/(screens)/reel/[id].tsx` line 424: `[commentsQuery.isLoading, reelQuery.data]` — missing `t`
- **Impact:** If user changes language while on a content detail screen, the empty state text remains in the previous language until a full re-render is triggered.

### FINDING 20: Video detail `video.channel` accessed without null check in JSX
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 716-728
- **Code:**
  ```tsx
  <Text style={styles.channelName}>{video.channel.name}</Text>
  <Text style={styles.channelSubscribers}>
    {video.channel.subscribersCount.toLocaleString()} {t('channel.subscribers')}
  </Text>
  ```
- **Impact:** If a video has no associated channel (e.g., deleted channel, orphaned video), accessing `video.channel.name` will throw `TypeError: Cannot read properties of undefined`. The subscribe mutation at line 221 has a guard (`if (!video?.channel) return`) but the render section does not.

### FINDING 21: Reel detail `likeMutation` has no optimistic update
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Lines:** 197-205
- **Code:**
  ```tsx
  const likeMutation = useMutation({
    mutationFn: () =>
      reelQuery.data?.isLiked
        ? reelsApi.unlike(id)
        : reelsApi.like(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reel', id] });
    },
  });
  ```
- **Impact:** When user taps like on a reel, nothing visually changes until the API call completes and the query is refetched. This creates a noticeable delay (~200-500ms). Post detail's comment like has optimistic updates (Finding in CommentRow). The reel-level like/bookmark/share all lack optimistic updates, relying entirely on `invalidateQueries`.

### FINDING 22: Video detail like mutation can rapid-fire with no dedup
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 199-202, 339-346
- **Code:**
  ```tsx
  const likeMutation = useMutation({
    mutationFn: () => videosApi.like(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['video', id] }),
  });
  // ...
  const handleLike = () => {
    haptic.light();
    if (video?.isLiked) {
      removeReactionMutation.mutate();
    } else {
      likeMutation.mutate();
    }
  };
  ```
- **Impact:** No `disabled` check on pending state. Rapid tapping can send multiple like/unlike requests before the first one resolves, potentially ending in wrong like state. The reel detail has `disabled={likeMutation.isPending}` on the ActionButton but video detail does not check pending state in `handleLike`.

### FINDING 23: Post detail comment like rollback has stale closure bug
- **File:** `apps/mobile/app/(screens)/post/[id].tsx`
- **Lines:** 77-90
- **Code:**
  ```tsx
  const likeMutation = useMutation({
    mutationFn: () =>
      localLiked
        ? postsApi.unlikeComment(postId, comment.id)
        : postsApi.likeComment(postId, comment.id),
    onMutate: () => {
      setLocalLiked((p: boolean) => !p);
      setLocalLikes((p: number) => (localLiked ? p - 1 : p + 1));
    },
    onError: () => {
      setLocalLiked((p: boolean) => !p);
      setLocalLikes((p: number) => (localLiked ? p + 1 : p - 1));
    },
  });
  ```
- **Impact:** The `mutationFn` captures `localLiked` from the closure at the time the mutation object is created (on each render). If user rapidly taps the like button, the second tap's `mutationFn` may capture the pre-first-tap value of `localLiked`, sending the wrong API call (like instead of unlike, or vice versa). The `onMutate` and `onError` handlers use functional updaters correctly but the `mutationFn` decision is based on stale state.

### FINDING 24: Thread reply like uses fire-and-forget pattern with manual rollback
- **File:** `apps/mobile/app/(screens)/thread/[id].tsx`
- **Lines:** 50-64
- **Code:**
  ```tsx
  const handleLike = useCallback(() => {
    setLiked((prev) => {
      const next = !prev;
      setLikeCount((c) => c + (next ? 1 : -1));
      if (next) {
        threadsApi.likeReply(threadId, reply.id).catch(() => {
          setLiked(false); setLikeCount((c) => c - 1);
        });
      } else {
        threadsApi.unlikeReply(threadId, reply.id).catch(() => {
          setLiked(true); setLikeCount((c) => c + 1);
        });
      }
      return next;
    });
  }, [threadId, reply.id]);
  ```
- **Impact:** Uses raw `.catch()` instead of `useMutation`. This bypasses React Query's mutation state tracking (no `isPending`, `isError`). The like button has no loading state and can be rapid-fired. The catch rollback also runs AFTER the state updater returns, which means the state has already been committed to render. This is a different pattern from all other screens and should be standardized.

### FINDING 25: Video detail records view even for own videos
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 186-190
- **Code:**
  ```tsx
  useEffect(() => {
    if (video?.id && user?.id) {
       videosApi.view(video.id).catch(() => {});
    }
  }, [video?.id, user?.id]);
  ```
- **Impact:** The creator's own views are counted. Most platforms exclude self-views from analytics. This inflates view counts.

### FINDING 26: Reel detail records view for unauthenticated users
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Lines:** 162-168
- **Code:**
  ```tsx
  useEffect(() => {
    if (id) {
      reelsApi.view(id).catch(() => {
        // Silently fail if view recording fails
      });
    }
  }, [id]);
  ```
- **Impact:** Unlike video detail which checks `user?.id`, the reel detail fires `reelsApi.view(id)` regardless of auth state. The backend at line 166-172 of `reels.controller.ts` handles this by returning `{ viewed: true }` without recording for anonymous users, but the mobile is sending auth headers regardless. If user is logged out, the API call may fail silently.

### FINDING 27: VideoReplySheet posts reply as encoded text, not proper video comment
- **File:** `apps/mobile/src/components/VideoReplySheet.tsx`
- **Line:** 136
- **Code:**
  ```tsx
  await reelsApi.comment(commentId, `[video-reply:${uploadData.publicUrl}]`);
  ```
- **Impact:** Video replies are sent as text comments with a custom `[video-reply:URL]` format. There is no backend parsing for this format — the comment will appear as literal text `[video-reply:https://...]` to other users. No frontend rendering handles this format either. The `commentId` is passed as the first argument to `reelsApi.comment()`, but that expects a `reelId`, not a `commentId` — so the API call will likely 404 (no reel with that comment's ID).

### FINDING 28: Post insights fallback discovery data is hardcoded and misleading
- **File:** `apps/mobile/app/(screens)/post-insights.tsx`
- **Lines:** 104-121
- **Code:**
  ```tsx
  // Fallback insights when API returns nothing
  setInsights({
    reach: 0,
    impressions: 0,
    // ...
    discovery: [
      { label: t('postInsights.home', 'Home'), percentage: 45, color: colors.emerald },
      { label: t('postInsights.explore', 'Explore'), percentage: 30, color: colors.info },
      { label: t('postInsights.hashtags', 'Hashtags'), percentage: 15, color: colors.gold },
      { label: t('postInsights.otherSource', 'Other'), percentage: 10, color: colors.text.tertiary },
    ],
  });
  ```
- **Impact:** When the API returns no data, the discovery breakdown shows hardcoded percentages (45% Home, 30% Explore, 15% Hashtags, 10% Other) that are completely fabricated. The reach/impressions show 0, but discovery shows specific percentages. This is misleading — it looks like real data.

### FINDING 29: Video detail quality change is a stub
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 273-276
- **Code:**
  ```tsx
  const handleQualityChange = useCallback((q: VideoQuality) => {
    setQuality(q);
    // TODO: switch video source based on quality
  }, []);
  ```
- **Impact:** Quality selector UI exists but changing quality only updates the state label — it doesn't actually switch the video source. The user sees "720p" change to "1080p" but the video stream stays the same.

### FINDING 30: Video detail `commentText` not trimmed before submission check
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 228, 391-394
- **Code:**
  ```tsx
  // Line 228: commentText sent untrimmed
  mutationFn: () => videosApi.comment(id, commentText, replyToId),

  // Lines 391-394: only checks trim for enable/disable
  const handleCommentSubmit = () => {
    if (commentText.trim()) {
      commentMutation.mutate();
    }
  };
  ```
- **Impact:** The comment text is checked with `.trim()` for the submit button, but the actual mutation at line 228 sends `commentText` without trim. Leading/trailing whitespace in comments will be persisted. Post, thread, and reel screens all use `.trim()` in the mutation.

---

## LOW (Code Quality / i18n) — 12 findings

### FINDING 31: Hardcoded English strings in CommentsSheet
- **File:** `apps/mobile/src/components/bakra/CommentsSheet.tsx`
- **Lines:** 106, 121, 190, 218
- **Strings:**
  - Line 106: `"Pinned"`
  - Line 121: `"Creator"`
  - Line 190: `"Comments · {reel.commentsCount}"`
  - Line 218: `"Replying to @{replyTo.user.username}"`

### FINDING 32: Hardcoded English strings in video/[id].tsx
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 372, 737, 777, 783, 852
- **Strings:**
  - Line 372: `"Watch on Mizanly"` (in share message)
  - Line 737: `"Unsubscribe"` / `"Subscribe"` (accessibility labels)
  - Line 777: `"Hide chapters"` / `"Show chapters"` (accessibility labels)
  - Line 783: `"Chapters ({chapters.length})"` (visible UI text)
  - Line 852: `"Comments ({video.commentsCount})"` (sheet title)

### FINDING 33: Hardcoded English strings in thread/[id].tsx
- **File:** `apps/mobile/app/(screens)/thread/[id].tsx`
- **Lines:** 212, 290
- **Strings:**
  - Line 212: `accessibilityLabel: 'Go back'`
  - Line 290: `accessibilityLabel: 'Go back'`

### FINDING 34: Hardcoded English string in reel/[id].tsx
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Line:** 70
- **String:** `Alert.alert('Error', err.message)` — should use `t('common.error')`

### FINDING 35: Inconsistent GlassHeader leftAction API usage
- **Files:**
  - `post/[id].tsx`: `leftAction={{ icon: 'arrow-left', onPress: ... }}`
  - `thread/[id].tsx`: `leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: ... }}`
  - `reel/[id].tsx`: `leftAction={{ icon: 'arrow-left', onPress: ... }}`
  - `video/[id].tsx`: `leftAction={{ icon: 'arrow-left', onPress: ... }}`
- **Impact:** Thread detail uses JSX element form while all others use string form. Both work (GlassHeader accepts `string | React.ReactNode`) but inconsistent. The JSX form also hardcodes `color={colors.text.primary}` which prevents GlassHeader from theming the icon.

### FINDING 36: Inconsistent use of SafeAreaView vs View as root
- **Files:**
  - `post/[id].tsx`: Uses `<View>` as root with `headerSpacer: { height: 100 }`
  - `thread/[id].tsx`: Uses `<SafeAreaView edges={['top']}>` — no headerSpacer
  - `reel/[id].tsx`: Uses `<View>` — no headerSpacer, relies on GlassHeader position
  - `video/[id].tsx`: Uses `<View>` with `marginTop: 88` on ScrollView
- **Impact:** Each screen handles safe area insets differently, leading to inconsistent top padding. Post uses a hardcoded 100px spacer, video uses 88px marginTop. These values will be wrong on different device sizes.

### FINDING 37: Post insights uses `Image` from react-native instead of expo-image
- **File:** `apps/mobile/app/(screens)/post-insights.tsx`
- **Line:** 8
- **Code:**
  ```tsx
  import { ... Image, ... } from 'react-native';
  ```
- **Impact:** Should use `expo-image` for better caching and performance, as done in other screens (e.g., thread/[id].tsx line 12: `import { Image } from 'expo-image'`).

### FINDING 38: Reel detail `listHeader` useMemo has stale dependencies
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Line:** 414
- **Code:**
  ```tsx
  ), [reelQuery.data, reelQuery.isLoading, isPlaying, animatedStyle, overlayAnimatedStyle, handleClearModeToggle]);
  ```
- **Impact:** `animatedStyle` from `useAnimatedPress` is included but `handleLike`, `handleBookmark`, `handleShare` callbacks are NOT in the deps. If any of these callbacks change identity (which they don't in practice due to stable deps), the memoized header would use stale versions.

### FINDING 39: Reel detail no empty check for `id` param
- **File:** `apps/mobile/app/(screens)/reel/[id].tsx`
- **Line:** 122
- **Code:**
  ```tsx
  const { id } = useLocalSearchParams<{ id: string }>();
  ```
- **Impact:** Same as Finding 16. No `enabled: !!id` on `reelQuery` (line 171) or `commentsQuery` (line 176). If `id` is undefined, API calls fire to `/reels/undefined`.

### FINDING 40: Video detail `video.channel.handle` used for navigation but handle could be empty
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 385-388
- **Code:**
  ```tsx
  const handleChannelPress = () => {
    if (video?.channel.handle) {
      router.push(`/(screens)/channel/${video.channel.handle}`);
    }
  };
  ```
- **Impact:** Minor — there is a guard, but `video?.channel.handle` will crash if `video` exists but `video.channel` is null (should be `video?.channel?.handle`).

### FINDING 41: Post insights `useEffect` has `t` in dependency array
- **File:** `apps/mobile/app/(screens)/post-insights.tsx`
- **Line:** 134
- **Code:**
  ```tsx
  }, [params.postId, params.postType, t]);
  ```
- **Impact:** If `t` function changes identity on re-render (which it does when language changes), the entire data fetch will re-run. This is technically correct behavior (refetch on language change) but may cause unexpected double-fetching if `t` is unstable.

### FINDING 42: Video detail `miniPlayerVideo` and related Zustand selectors always subscribed
- **File:** `apps/mobile/app/(screens)/video/[id].tsx`
- **Lines:** 98-104
- **Code:**
  ```tsx
  const miniPlayerVideo = useStore(s => s.miniPlayerVideo);
  const miniPlayerProgress = useStore(s => s.miniPlayerProgress);
  const miniPlayerPlaying = useStore(s => s.miniPlayerPlaying);
  const setMiniPlayerVideo = useStore(s => s.setMiniPlayerVideo);
  const setMiniPlayerProgress = useStore(s => s.setMiniPlayerProgress);
  const setMiniPlayerPlaying = useStore(s => s.setMiniPlayerPlaying);
  const closeMiniPlayer = useStore(s => s.closeMiniPlayer);
  ```
- **Impact:** Seven separate Zustand subscriptions on every render. The getter selectors (`miniPlayerVideo`, `miniPlayerProgress`, `miniPlayerPlaying`) cause re-renders whenever the mini player state changes, even though this screen is the source of those changes. The setter selectors should be stable but the getters create unnecessary re-render triggers. Could be consolidated into a single selector.

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 6 | CommentsSheet crash (t undefined), Rules of Hooks violations, reel reply-to broken, reel comment like not persisted, follow button dead |
| HIGH | 10 | Duplicate imports, parentId ignored, video comments not paginated, dead code, no share on post/thread, no error on submit |
| MEDIUM | 14 | No RTL on reel/video, stale useMemo deps, null access risks, optimistic update gaps, misleading fallback data |
| LOW | 12 | Hardcoded English strings (~15), inconsistent patterns, minor code quality |
| **TOTAL** | **42** | |

### Most Impactful Fixes (ordered):
1. **CommentsSheet `t()` crash** — 1 line fix, unblocks all reel comments
2. **CommentsSheet Rules of Hooks** — extract CommentItem component
3. **Reel comment like backend endpoints** — add controller routes + service methods
4. **Reel reply parentId end-to-end** — DTO + service + mobile API + mutation
5. **Follow button on reel detail** — add mutation + onPress handler
6. **Add onError to all send mutations** — 4 screens, ~1 line each
7. **Video comments pagination** — switch to useInfiniteQuery
