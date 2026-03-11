# Batch 24 — Final Polish: Wire All Stubs, Replace ActivityIndicator, Add removeClippedSubviews

## CRITICAL RULES (follow ALL of these — violations WILL be caught and rejected)

1. **NEVER** use `as any` — use `as never` for router paths, or type the value properly
2. **NEVER** use `@ts-ignore` or `@ts-expect-error`
3. **NEVER** use React Native `Modal` — use `<BottomSheet>` from `@/components/ui/BottomSheet`
4. **NEVER** use bare `<ActivityIndicator>` for content loading — use `<Skeleton.*>` from `@/components/ui/Skeleton`
5. **NEVER** hardcode `borderRadius` >= 6 — use `radius.sm` (6), `radius.md` (10), `radius.lg` (16), `radius.full` (9999)
6. **NEVER** hardcode hex colors — use `colors.*` from `@/theme`
7. **ALL** FlatLists MUST have `removeClippedSubviews={true}` AND pull-to-refresh with `tintColor={colors.emerald}`
8. **ALL** imports use `@/` prefix (e.g. `@/components/ui/Icon`, `@/theme`, `@/services/api`)
9. **ALL** routes use `/(screens)/` prefix
10. **ONLY** use valid `<Icon>` names. The full list from Icon.tsx: `arrow-left`, `chevron-right`, `chevron-left`, `chevron-down`, `chevron-up`, `heart`, `heart-filled`, `message-circle`, `bookmark`, `bookmark-filled`, `share`, `repeat`, `image`, `camera`, `video`, `play`, `pause`, `mic`, `phone`, `search`, `hash`, `at-sign`, `filter`, `trending-up`, `user`, `users`, `bell`, `mail`, `check-circle`, `send`, `pencil`, `edit`, `trash`, `x`, `plus`, `circle-plus`, `more-horizontal`, `more-vertical`, `settings`, `lock`, `globe`, `eye`, `eye-off`, `flag`, `volume-x`, `volume-1`, `volume-2`, `link`, `clock`, `map-pin`, `smile`, `paperclip`, `check`, `check-check`, `layers`, `slash`, `log-out`, `bar-chart-2`, `loader`, `star`, `music`, `maximize`, `download`, `upload`, `grid`, `list`, `refresh-cw`, `external-link`, `info`, `alert-triangle`, `zap`, `shield`, `award`, `copy`, `minus`

## Component Quick Reference

```tsx
// Skeleton (use instead of ActivityIndicator for content loading)
import { Skeleton } from '@/components/ui/Skeleton';
<Skeleton.Circle size={40} />
<Skeleton.Rect width={120} height={14} borderRadius={radius.sm} />
<Skeleton.Text width="60%" />
<Skeleton.PostCard />
<Skeleton.ThreadCard />
<Skeleton.ConversationItem />
<Skeleton.ProfileHeader />

// BottomSheet (use instead of RN Modal)
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
<BottomSheet visible={bool} onClose={fn} snapPoint={0.4}>
  <BottomSheetItem label="..." icon={<Icon name="..." size="sm" color={colors.text.primary} />} onPress={fn} />
</BottomSheet>

// EmptyState
import { EmptyState } from '@/components/ui/EmptyState';
<EmptyState icon="flag" title="..." subtitle="..." actionLabel="Retry" onAction={fn} />

// GradientButton
import { GradientButton } from '@/components/ui/GradientButton';
<GradientButton label="Submit" onPress={fn} loading={bool} disabled={bool} />

// Theme tokens
import { colors, spacing, fontSize, radius } from '@/theme';
```

---

## Task 1: Wire 6 Remaining Stubs

### 1A. `broadcast-channels.tsx` — Wire "Create Channel" button (line 226)

Currently: `rightAction={{ icon: 'plus', onPress: () => {}, accessibilityLabel: 'Create channel' }}`

Replace with a BottomSheet form for creating a broadcast channel:

1. Add state: `const [showCreateSheet, setShowCreateSheet] = useState(false);`
2. Add state: `const [newChannelName, setNewChannelName] = useState('');`
3. Add state: `const [newChannelDesc, setNewChannelDesc] = useState('');`
4. Change the rightAction: `onPress: () => setShowCreateSheet(true)`
5. Add a mutation:
```tsx
const createMutation = useMutation({
  mutationFn: () => broadcastApi.create({ name: newChannelName, description: newChannelDesc }),
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ['my-channels'] });
    setShowCreateSheet(false);
    setNewChannelName('');
    setNewChannelDesc('');
    router.push(`/(screens)/broadcast/${data.id}` as never);
  },
  onError: () => Alert.alert('Error', 'Failed to create channel'),
});
```
6. Add a BottomSheet at the bottom of the component (before the closing `</>`):
```tsx
<BottomSheet visible={showCreateSheet} onClose={() => setShowCreateSheet(false)} snapPoint={0.5}>
  <View style={{ padding: spacing.base, gap: spacing.md }}>
    <Text style={{ fontSize: fontSize.lg, fontWeight: '600', color: colors.text.primary }}>Create Channel</Text>
    <TextInput
      style={{ backgroundColor: colors.dark.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text.primary, fontSize: fontSize.base }}
      placeholder="Channel name"
      placeholderTextColor={colors.text.tertiary}
      value={newChannelName}
      onChangeText={setNewChannelName}
      maxLength={50}
    />
    <TextInput
      style={{ backgroundColor: colors.dark.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text.primary, fontSize: fontSize.base, minHeight: 80 }}
      placeholder="Description (optional)"
      placeholderTextColor={colors.text.tertiary}
      value={newChannelDesc}
      onChangeText={setNewChannelDesc}
      maxLength={200}
      multiline
    />
    <GradientButton
      label="Create"
      onPress={() => createMutation.mutate()}
      loading={createMutation.isPending}
      disabled={!newChannelName.trim()}
    />
  </View>
</BottomSheet>
```
7. Add necessary imports: `TextInput`, `Alert` from react-native; `GradientButton`; `useMutation`; `useQueryClient`

### 1B. `community-posts.tsx` — Wire "Add Image", "Add Video", "Add Poll" buttons (lines 339, 344, 349)

Replace the 3 TODO handlers with image/video picker using `expo-image-picker`:

1. Add import: `import * as ImagePicker from 'expo-image-picker';`
2. Add state for media: `const [selectedMedia, setSelectedMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);`
3. Wire "Add Image":
```tsx
onPress={async () => {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
  if (!result.canceled && result.assets[0]) {
    setSelectedMedia({ uri: result.assets[0].uri, type: 'image' });
    setShowCreateSheet(false);
  }
}}
```
4. Wire "Add Video" the same way but with `MediaTypeOptions.Videos`
5. Wire "Add Poll" — show an Alert: `Alert.alert('Polls', 'Poll creation is coming in the next update.');` (backend doesn't support channel post polls yet)
6. Show the selected media preview above the compose TextInput if `selectedMedia` is set:
```tsx
{selectedMedia && (
  <View style={{ position: 'relative', marginBottom: spacing.sm }}>
    <Image source={{ uri: selectedMedia.uri }} style={{ width: '100%', height: 200, borderRadius: radius.md }} resizeMode="cover" />
    <Pressable
      style={{ position: 'absolute', top: spacing.xs, right: spacing.xs, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.full, padding: spacing.xs }}
      onPress={() => setSelectedMedia(null)}
    >
      <Icon name="x" size="sm" color={colors.text.primary} />
    </Pressable>
  </View>
)}
```
7. Include `selectedMedia` in the post mutation payload if the API supports it (add `mediaUrl` field)

### 1C. `reel/[id].tsx` — Wire reel comment likes (line 51-57)

Currently optimistic-only. Add real API calls:

1. Add to `apps/mobile/src/services/api.ts` in `reelsApi`:
```tsx
likeComment: (reelId: string, commentId: string) => api.post(`/reels/${reelId}/comments/${commentId}/like`),
unlikeComment: (reelId: string, commentId: string) => api.delete(`/reels/${reelId}/comments/${commentId}/like`),
```
2. In `reel/[id].tsx`, import `useMutation` and `useQueryClient` if not already
3. Replace the comment like handler with:
```tsx
const handleLikeComment = () => {
  haptic.medium();
  const wasLiked = localLiked;
  setLocalLiked(!wasLiked);
  setLocalLikes(p => wasLiked ? p - 1 : p + 1);
  const action = wasLiked ? reelsApi.unlikeComment(reelId, comment.id) : reelsApi.likeComment(reelId, comment.id);
  action.catch(() => {
    // Revert on failure
    setLocalLiked(wasLiked);
    setLocalLikes(p => wasLiked ? p + 1 : p - 1);
  });
};
```
4. Remove the "Note: Reel comment liking not implemented in API yet" comment

### 1D. `conversation/[id].tsx` — Wire pinned messages query (line 658-664)

1. Add to `apps/mobile/src/services/api.ts` in `messagesApi`:
```tsx
getPinned: (conversationId: string) => api.get<Message[]>(`/messages/${conversationId}/pinned`),
```
2. Uncomment and fix the pinned messages query (lines 658-664):
```tsx
const { data: pinnedMessages } = useQuery({
  queryKey: ['pinned-messages', id],
  queryFn: () => messagesApi.getPinned(id as string),
  enabled: !!id,
});
```
3. If there's a pinned message banner in the UI that references `pinnedMessages`, make sure it displays correctly. If there isn't one yet, add a simple banner below the header:
```tsx
{pinnedMessages && pinnedMessages.length > 0 && (
  <Pressable
    style={{ backgroundColor: colors.dark.bgCard, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.dark.border }}
    onPress={() => {/* scroll to pinned message */}}
  >
    <Icon name="bookmark" size="sm" color={colors.gold} />
    <Text style={{ color: colors.text.primary, fontSize: fontSize.sm, flex: 1 }} numberOfLines={1}>
      {pinnedMessages[0].content}
    </Text>
  </Pressable>
)}
```

### 1E. `manage-data.tsx` — Wire data export (line 117)

Replace the "Coming Soon" alert with an actual API call:

1. Add to `apps/mobile/src/services/api.ts` (create if needed):
```tsx
export const accountApi = {
  requestDataExport: () => api.post('/account/export'),
};
```
If `accountApi` already exists, just add the method.
2. Replace line 116-118:
```tsx
onPress: async () => {
  try {
    await accountApi.requestDataExport();
    Alert.alert('Request Sent', 'You will be notified when your data is ready for download.');
  } catch {
    Alert.alert('Error', 'Failed to submit data export request. Please try again.');
  }
},
```

### 1F. `PostCard.tsx` — Fix shareAsStory silent failure

File: `apps/mobile/src/components/saf/PostCard.tsx`

Currently has a hack: `const api = postsApi as typeof postsApi & { shareAsStory?: ... }`

1. Add to `apps/mobile/src/services/api.ts` in `postsApi`:
```tsx
shareAsStory: (id: string) => api.post(`/posts/${id}/share-as-story`),
```
2. In PostCard.tsx, replace the shareAsStory mutation:
```tsx
const shareAsStoryMutation = useMutation({
  mutationFn: () => postsApi.shareAsStory(post.id),
  onSuccess: () => {
    haptic.success();
    setSheetVisible(false);
  },
  onError: () => {
    Alert.alert('Error', 'Could not share as story. Please try again.');
  },
});
```

---

## Task 2: Replace ActivityIndicator with Skeleton in 13 Files

In each file below, find every `<ActivityIndicator>` used for **content loading** (NOT inside buttons/submit actions — those are OK) and replace with `<Skeleton.*>`. Also add `import { Skeleton } from '@/components/ui/Skeleton';` if not already imported.

**Rule: ActivityIndicator inside a submit button (e.g. "Saving...") is FINE. Only replace ActivityIndicators used as page/section loading indicators.**

Files to fix:

1. **`save-to-playlist.tsx`** — line 138: replace the `<ActivityIndicator>` loading indicator
2. **`follow-requests.tsx`** — line 50: the follow button loading indicator (in-button — check if OK)
3. **`collab-requests.tsx`** — find ActivityIndicator usages and replace content loading ones
4. **`circles.tsx`** — line 83: `<ActivityIndicator color={colors.text.primary} size="small" />` — replace
5. **`new-conversation.tsx`** — line 126: loading indicator — replace
6. **`conversation-info.tsx`** — lines 315, 383, 501: check each — button loading is OK, page loading must be Skeleton
7. **`edit-profile.tsx`** — line 445: check if button or content loading
8. **`call/[id].tsx`** — lines 208, 220, 261: check each context
9. **`create-thread.tsx`** — find usage, determine context
10. **`create-post.tsx`** — find usage, determine context
11. **`create-group.tsx`** — find usage, determine context
12. **`schedule-live.tsx`** — find usage, determine context
13. **`go-live.tsx`** — find usage, determine context

**For each file:**
- Read the file first
- Find every `<ActivityIndicator>` usage
- If it's inside a button/pressable action (submit, save, follow, etc.) — LEAVE IT (ActivityIndicator in buttons is acceptable per rules)
- If it's used as a page/section/list loading state — REPLACE with appropriate `<Skeleton.*>`:
  - For user lists: `<Skeleton.ConversationItem />` repeated 3x
  - For content sections: `<Skeleton.Rect width="100%" height={60} borderRadius={radius.md} />` repeated 3x
  - For profiles: `<Skeleton.ProfileHeader />`

---

## Task 3: Add `removeClippedSubviews={true}` to 29 FlatLists

Add `removeClippedSubviews={true}` to EVERY `<FlatList` in these files. Find the FlatList component and add the prop.

Files:
1. `app/(screens)/blocked-keywords.tsx`
2. `app/(screens)/broadcast/[id].tsx`
3. `app/(screens)/channel/[handle].tsx`
4. `app/(screens)/conversation/[id].tsx`
5. `app/(screens)/conversation-info.tsx`
6. `app/(screens)/create-group.tsx`
7. `app/(screens)/discover.tsx`
8. `app/(screens)/live/[id].tsx`
9. `app/(screens)/new-conversation.tsx`
10. `app/(screens)/pinned-messages.tsx`
11. `app/(screens)/playlist/[id].tsx`
12. `app/(screens)/playlists/[channelId].tsx`
13. `app/(screens)/post/[id].tsx`
14. `app/(screens)/profile/[username].tsx`
15. `app/(screens)/reel/[id].tsx`
16. `app/(screens)/save-to-playlist.tsx`
17. `app/(screens)/saved.tsx`
18. `app/(screens)/sound/[id].tsx`
19. `app/(screens)/starred-messages.tsx`
20. `app/(screens)/story-viewer.tsx`
21. `app/(screens)/thread/[id].tsx`
22. `app/onboarding/suggested.tsx`
23. `src/components/bakra/CommentsSheet.tsx`
24. `src/components/risalah/StickerPackBrowser.tsx`
25. `src/components/risalah/StickerPicker.tsx`
26. `src/components/saf/StoryRow.tsx`
27. `src/components/ui/Autocomplete.tsx`
28. `src/components/ui/ImageLightbox.tsx`
29. `src/components/ui/LocationPicker.tsx`

**For each file:** Open it, find ALL `<FlatList` tags, add `removeClippedSubviews={true}` as a prop if not already present.

---

## After You're Done

Do NOT:
- Add or modify theme tokens
- Change any existing component APIs
- Add any `as any` casts (use `as never` for router paths)
- Change API endpoint URLs
- Touch files not listed in these tasks
- Add any new npm packages (use what's already installed: `expo-image-picker` is already installed)

Commit message: `feat: batch 24 — wire 6 stubs, replace ActivityIndicator, add removeClippedSubviews`
