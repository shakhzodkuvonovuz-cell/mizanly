# ARCHITECT INSTRUCTIONS — Mizanly (Batch 18: The Everything Batch)
## For Sonnet/Haiku: Read CLAUDE.md first, then this file top to bottom.

**Last updated:** 2026-03-08 by Claude Opus 4.6
**Previous batches:** 1-17 → See `docs/PROJECT_HISTORY.md`

---

## Context

The schema has 20 models sitting idle with no service. Features that big platforms ship — post scheduling, pinned posts, story archive, video chapters, Majlis lists, read receipts — all have schema support but zero UI. 21 controllers have zero tests. This batch wires it ALL.

**25 agents. All parallel except Agent 25 (docs) runs last.**

---

# PART A — NEW MOBILE SCREENS (Agents 1-5)

---

## Step 1 — Schedule Post Screen
**Agent 1** | NEW file: `apps/mobile/app/(screens)/schedule-post.tsx`

The schema has `scheduledAt` on Post, Thread, Reel, and Video. Create a scheduling screen that lets users pick a date/time for their content.

Read the Prisma schema to confirm `Post.scheduledAt`, `Thread.scheduledAt` exist.

### Screen design:
- Header: "Schedule Post" with back button
- Shows a preview of the content being scheduled (title/caption)
- Date picker (use `@react-native-community/datetimepicker` or a simple custom picker with BottomSheet)
- Time picker
- "Schedule" button → calls the create endpoint with `scheduledAt` field
- "Post Now" button → calls without `scheduledAt`
- Minimum schedule time: 15 minutes from now
- Show scheduled time in user-friendly format

Receive `type` (post/thread/reel/video) and content data via route params. Read existing create screens (create-post.tsx, create-thread.tsx) to understand how they pass data.

**If `@react-native-community/datetimepicker` is not installed**, build a simple custom picker using BottomSheet with hour/minute/date scrollable lists. Check `apps/mobile/package.json` for available date picker packages.

All CLAUDE.md rules: theme tokens, Icon, BottomSheet (not Modal), Skeleton, EmptyState.

**Verification:** Screen renders with date/time selection.

---

## Step 2 — Story Archive Screen
**Agent 2** | NEW file: `apps/mobile/app/(screens)/archive.tsx`

Schema has `Story.isArchived`. Create a screen showing the user's archived stories.

### Implementation:
- Header: "Archive" with back button
- Grid layout (3 columns) showing archived story thumbnails
- Tap → view archived story (navigate to story-viewer with archive flag)
- Long-press → BottomSheet with "Unarchive" / "Delete" options
- The API call: read `stories.service.ts` and `stories.controller.ts` to find if there's an archive endpoint. If not, use `GET /stories/me` with a filter param.
- If no archive endpoint exists, fetch user's stories and filter `isArchived === true` client-side, noting that a proper endpoint should be added.

Empty state: `<EmptyState icon="clock" title="No archived stories" subtitle="Stories you archive will appear here" />`

All CLAUDE.md rules apply.

**Verification:** Screen renders grid or empty state.

---

## Step 3 — Bookmark Folders Screen
**Agent 3** | NEW file: `apps/mobile/app/(screens)/bookmark-folders.tsx`

Currently bookmarks are a flat list. This screen lets users organize saved content into named folders.

Read the Prisma schema for any BookmarkFolder or Collection model.

### If schema has a folder/collection model:
- Fetch folders from API
- Display as a list of folder cards (name, item count, cover thumbnail)
- Tap → navigate to `/(screens)/saved?folder=${folderId}`
- "Create Folder" FAB → BottomSheet with name input

### If schema does NOT have folder model:
- Implement client-side folders using AsyncStorage
- `AsyncStorage.getItem('bookmark-folders')` → `{ [folderId]: { name, itemIds[] } }`
- Same UI but backed by local storage
- Note: This is a client-only solution; server-backed folders need schema migration

All CLAUDE.md rules.

**Verification:** Screen renders with folder management.

---

## Step 4 — Manage Data / Privacy Center Screen
**Agent 4** | NEW file: `apps/mobile/app/(screens)/manage-data.tsx`

Privacy center for data management:

### Design:
```
┌─────────────────────────────┐
│ ← Manage Your Data          │
├─────────────────────────────┤
│ Download Your Data           │
│ Request a copy of all your  │
│ data. We'll notify you      │
│ when it's ready.            │
│ [Request Download]          │
│                             │
│ Connected Apps              │
│ No connected apps           │
│                             │
│ Clear Search History        │
│ [Clear]                     │
│                             │
│ Clear Watch History         │
│ [Clear]                     │
│                             │
│ Delete Account              │
│ [Delete Account] (red)      │
└─────────────────────────────┘
```

- "Request Download" → `Alert.alert` confirmation → call a hypothetical `/users/me/export` endpoint (or show "Coming soon" if endpoint doesn't exist — read the backend to check)
- "Clear Search History" → `AsyncStorage.removeItem('search-history')` (read search.tsx to see the key name)
- "Clear Watch History" → call `usersApi.clearWatchHistory()` (already exists!)
- "Delete Account" → Navigate to settings.tsx delete flow or duplicate the delete confirmation logic

Use ScrollView with RefreshControl. All CLAUDE.md rules.

**Verification:** Screen renders with working buttons.

---

## Step 5 — Majlis Lists (Twitter Lists)
**Agent 5** | NEW files:
- `apps/mobile/app/(screens)/majlis-lists.tsx` (NEW)
- `apps/mobile/app/(screens)/majlis-list/[id].tsx` (NEW)

Schema has `MajlisList` and `MajlisListMember` models. Create both screens.

### majlis-lists.tsx — Lists overview:
- Header: "Lists" with back button + "Create List" icon button
- FlatList of user's lists (name, description, member count, privacy)
- Tap → navigate to `/(screens)/majlis-list/${list.id}`
- "Create List" → BottomSheet with name input, description, toggle public/private
- API: Read the schema to understand MajlisList fields. Call the appropriate API (Agent 19 will create the API client methods, so just use `majlisListsApi.getLists()` etc.)

### majlis-list/[id].tsx — List detail:
- Header: List name with back button + "Edit" icon
- Tab selector: Members | Timeline
- Members tab: FlatList of member profiles with "Remove" option (if owner)
- Timeline tab: FlatList of threads from list members (fetch threads filtered by member IDs)
- "Add Members" button → search/select users BottomSheet
- Long-press member → BottomSheet with "Remove from list"

Both screens: RefreshControl, Skeleton, EmptyState, all CLAUDE.md rules.

**Verification:** Both screens render. Lists can be viewed.

---

# PART B — NEW BACKEND MODULES (Agents 6-9)

---

## Step 6 — Scheduling Module
**Agent 6** | NEW files:
- `apps/api/src/modules/scheduling/scheduling.module.ts` (NEW)
- `apps/api/src/modules/scheduling/scheduling.controller.ts` (NEW)
- `apps/api/src/modules/scheduling/scheduling.service.ts` (NEW)

Read schema to confirm `Post.scheduledAt`, `Thread.scheduledAt`, `Reel.scheduledAt`, `Video.scheduledAt`.

### Endpoints:
```
GET  /scheduling/scheduled       — All user's scheduled content (across types)
PATCH /scheduling/:type/:id      — Update scheduled time (type = post|thread|reel|video)
DELETE /scheduling/:type/:id     — Cancel scheduled post (revert to draft or delete)
POST /scheduling/publish-now/:type/:id — Publish immediately
```

### Service logic:
- `getScheduled(userId)` → Query posts/threads/reels/videos where `scheduledAt IS NOT NULL` and `scheduledAt > now` and `userId = userId`. Combine into a unified list sorted by scheduledAt.
- `updateSchedule(userId, type, id, scheduledAt)` → Update the scheduledAt field on the appropriate model. Validate: must be >= 15 min from now.
- `cancelSchedule(userId, type, id)` → Set scheduledAt to null or delete the item
- `publishNow(userId, type, id)` → Set scheduledAt to null (makes it live)

All endpoints require ClerkAuthGuard. Verify ownership before update/delete.

**Verification:** Compiles. Endpoints return data.

---

## Step 7 — Majlis Lists Module
**Agent 7** | NEW files:
- `apps/api/src/modules/majlis-lists/majlis-lists.module.ts` (NEW)
- `apps/api/src/modules/majlis-lists/majlis-lists.controller.ts` (NEW)
- `apps/api/src/modules/majlis-lists/majlis-lists.service.ts` (NEW)

Read schema to understand `MajlisList` and `MajlisListMember` models.

### Endpoints:
```
GET    /majlis-lists              — User's lists (owned + subscribed)
POST   /majlis-lists              — Create list
GET    /majlis-lists/:id          — List detail with member count
PATCH  /majlis-lists/:id          — Update list (name, description, isPublic)
DELETE /majlis-lists/:id          — Delete list (owner only)
GET    /majlis-lists/:id/members  — List members (paginated)
POST   /majlis-lists/:id/members  — Add member
DELETE /majlis-lists/:id/members/:userId — Remove member
GET    /majlis-lists/:id/timeline — Threads from list members (paginated, cursor)
```

### Service logic:
- Timeline: Fetch threads where `userId IN (list member IDs)`, `isChainHead: true`, ordered by `createdAt: 'desc'`
- Only list owner can add/remove members and update/delete
- Public lists can be subscribed to by anyone
- Standard pagination on all list endpoints

**Verification:** Compiles. All CRUD works.

---

## Step 8 — Polls Service Module
**Agent 8** | NEW files:
- `apps/api/src/modules/polls/polls.module.ts` (NEW)
- `apps/api/src/modules/polls/polls.controller.ts` (NEW)
- `apps/api/src/modules/polls/polls.service.ts` (NEW)

Schema has `Poll`, `PollOption`, `PollVote` models. Currently polls are created inline with threads but have no dedicated service.

### Endpoints:
```
GET    /polls/:id           — Get poll with options and vote counts
POST   /polls/:id/vote      — Vote on a poll option (body: { optionId })
DELETE /polls/:id/vote      — Retract vote
GET    /polls/:id/voters    — List voters per option (paginated)
```

### Service logic:
- Read the schema to understand Poll ↔ PollOption ↔ PollVote relations
- Vote: Check if user already voted (prevent double voting). Create PollVote, increment option votesCount.
- Retract: Delete PollVote, decrement option votesCount.
- Get poll: Include options with vote counts. If authenticated, include `userVotedOptionId`.
- Voters: Paginated list of users who voted for a specific option.

Use `OptionalClerkAuthGuard` on GET (show personalized vote status). Use `ClerkAuthGuard` on POST/DELETE.

**Verification:** Compiles. Vote/retract works.

---

## Step 9 — Subtitles Module
**Agent 9** | NEW files:
- `apps/api/src/modules/subtitles/subtitles.module.ts` (NEW)
- `apps/api/src/modules/subtitles/subtitles.controller.ts` (NEW)
- `apps/api/src/modules/subtitles/subtitles.service.ts` (NEW)

Schema has `SubtitleTrack` model.

### Endpoints:
```
GET    /videos/:videoId/subtitles         — List subtitle tracks for a video
POST   /videos/:videoId/subtitles         — Upload subtitle track (label, language, srtUrl)
DELETE /videos/:videoId/subtitles/:id     — Delete subtitle track (owner only)
GET    /videos/:videoId/subtitles/:id/srt — Get SRT file content (redirect to R2 URL)
```

### Service logic:
- Create: Validate video exists and user is channel owner. Store subtitle metadata.
- List: Return all subtitle tracks for a video (language, label, URL).
- Delete: Owner-only. Remove from DB.
- SRT content: Redirect to the stored `srtUrl` (Cloudflare R2 presigned URL).

**Verification:** Compiles. Subtitle tracks can be listed.

---

# PART C — EXISTING MOBILE EDITS (Agents 10-17)

---

## Step 10 — Story Viewer: Emoji Reactions
**Agent 10** | File: `apps/mobile/app/(screens)/story-viewer.tsx` (EDIT)

Read the full file. Add emoji reaction functionality:

1. Add a row of 6 quick-reaction emojis below the story content: ❤️ 🔥 👏 😂 😍 😢
2. Each emoji is a `Pressable` that:
   - Calls the stories API to react (check if a react endpoint exists in stories.controller.ts)
   - Shows a scale animation (emoji bounces) using Reanimated
   - Haptic feedback on tap
3. If no backend react endpoint exists, emit a socket event or create a local-only animation (the reaction is the feedback itself, like Instagram's quick reactions that send a DM)

Implementation approach:
```tsx
const QUICK_REACTIONS = ['❤️', '🔥', '👏', '😂', '😍', '😢'];

// In the render, add below the story:
<View style={styles.reactionsRow}>
  {QUICK_REACTIONS.map(emoji => (
    <Pressable key={emoji} onPress={() => handleStoryReaction(emoji)} style={styles.reactionBtn}>
      <Text style={styles.reactionEmoji}>{emoji}</Text>
    </Pressable>
  ))}
</View>
```

For `handleStoryReaction`: Send as a DM reply with the emoji (using the existing reply mechanism in the file). Read how the reply input currently works and reuse that pattern.

**Verification:** Emoji row visible. Tap sends reaction.

---

## Step 11 — Hashtag: Follow Button
**Agent 11** | File: `apps/mobile/app/(screens)/hashtag/[tag].tsx` (EDIT)

Read the full file. Read the Prisma schema for any `HashtagFollow` or similar model.

### If schema has HashtagFollow model:
- Add a "Follow" button next to the hashtag header
- Call API to follow/unfollow
- Toggle button state (Following ↔ Follow)

### If schema does NOT have HashtagFollow:
- Implement client-side hashtag follow using AsyncStorage
- Key: `followed-hashtags` → `string[]`
- Button toggles inclusion in the array
- Show followed state on load

Either way:
- Use `ActionButton` component or styled Pressable matching the follow button pattern on profile
- Add haptic feedback on toggle

**Verification:** Follow button visible and toggles state.

---

## Step 12 — Video: Chapters Display
**Agent 12** | File: `apps/mobile/app/(screens)/video/[id].tsx` (EDIT)

Read the full file. Schema has `Video.chapters` as `Json?`.

Read the backend `videos.service.ts` to understand what format `chapters` uses (likely `[{ title: string, startTime: number }]`).

### Implementation:
1. Parse chapters from video data
2. Below the video player, show a "Chapters" section (collapsible):
```tsx
{chapters.length > 0 && (
  <Pressable onPress={() => setShowChapters(!showChapters)} style={styles.chapterHeader}>
    <Icon name="layers" size="sm" color={colors.text.secondary} />
    <Text style={styles.chapterHeaderText}>Chapters ({chapters.length})</Text>
    <Icon name={showChapters ? 'chevron-down' : 'chevron-right'} size="sm" color={colors.text.tertiary} />
  </Pressable>
)}
{showChapters && chapters.map((ch, i) => (
  <Pressable key={i} onPress={() => seekToChapter(ch.startTime)} style={styles.chapterRow}>
    <Text style={styles.chapterTime}>{formatTime(ch.startTime)}</Text>
    <Text style={styles.chapterTitle}>{ch.title}</Text>
  </Pressable>
))}
```
3. `seekToChapter`: Find the video ref and call `videoRef.current?.setPositionAsync(ch.startTime * 1000)` (or equivalent for the video player being used).

Read the file to understand which video player component is used (expo-av Video, react-native-video, etc.) and its seek API.

**Verification:** Chapters section visible when video has chapters data.

---

## Step 13 — Profile: Pinned Posts + Archive Link
**Agent 13** | File: `apps/mobile/app/(screens)/profile/[username].tsx` (EDIT)

Read the full file. Read schema for `Thread.isPinned` or `Post.isPinned` fields.

### 13A — Pinned posts section:
If schema has isPinned:
- Above the posts grid, show pinned items (max 3)
- Query: fetch user's posts/threads where `isPinned: true`
- Display with a 📌 pin icon badge overlay
- Tap → navigate to post/thread detail

### 13B — Archive link (own profile only):
- When viewing own profile, add an "Archive" icon button in the header area
- `<Pressable onPress={() => router.push('/(screens)/archive')}>`
- Use `<Icon name="clock" />` for archive

### 13C — Lists link (own profile only):
- Add a "Lists" row or icon button
- Navigate to `/(screens)/majlis-lists`

Read the file to understand the profile header layout and where to place these.

**Verification:** Pinned section shows when pins exist. Archive button visible on own profile.

---

## Step 14 — Channel: Fix TODO Stubs
**Agent 14** | File: `apps/mobile/app/(screens)/channel/[handle].tsx` (EDIT)

Read the full file. Fix 3 TODO stubs:

### Line ~421 — Copy channel link:
```ts
import * as Clipboard from 'expo-clipboard';
// ...
await Clipboard.setStringAsync(`mizanly://channel/${channel.handle}`);
Alert.alert('Copied', 'Channel link copied to clipboard');
```

### Line ~436 — Native share:
```ts
import { Share } from 'react-native';
// ...
await Share.share({
  message: `Check out ${channel.name} on Mizanly`,
  url: `mizanly://channel/${channel.handle}`,
});
```

### Line ~444 — Copy link (likely same as 421):
Same Clipboard implementation.

Check if `expo-clipboard` and `Share` are already imported. Add if missing.

**Verification:** Copy and share buttons work (no more TODO comments).

---

## Step 15 — Conversation: Read Receipts Display
**Agent 15** | File: `apps/mobile/app/(screens)/conversation/[id].tsx` (EDIT)

Read the full file. Schema has `Message.readAt`.

### Implementation:
In the message bubble rendering, for sent messages (from current user), add read receipt indicators:

```tsx
{msg.senderId === user?.id && (
  <View style={styles.receiptRow}>
    <Icon
      name={msg.readAt ? 'check-check' : 'check'}
      size="xs"
      color={msg.readAt ? colors.emerald : colors.text.tertiary}
    />
    {msg.readAt && (
      <Text style={styles.readTime}>{format(new Date(msg.readAt), 'HH:mm')}</Text>
    )}
  </View>
)}
```

Find where individual messages are rendered. It might be a `renderMessage` function or inline in the FlatList `renderItem`. Read the full file to locate it.

Style the receipt row: `flexDirection: 'row'`, `alignItems: 'center'`, small gap, right-aligned below the message bubble.

Double check icon: `check` = sent, `check-check` = read (WhatsApp-style). Verify both icon names exist in CLAUDE.md Icon list. Both `check` and `check-check` are listed.

**Verification:** Read receipts (✓ vs ✓✓) visible on sent messages.

---

## Step 16 — CommentsSheet: Fix Reply Stub
**Agent 16** | File: `apps/mobile/src/components/bakra/CommentsSheet.tsx` (EDIT)

Read the full file. Line ~88 has a TODO for reply functionality.

### Implementation:
1. Add state for reply target: `const [replyTo, setReplyTo] = useState<Comment | null>(null);`
2. Wire the Reply button to set the reply target
3. Show a reply indicator above the comment input:
```tsx
{replyTo && (
  <View style={styles.replyBanner}>
    <Text style={styles.replyLabel}>Replying to @{replyTo.user.username}</Text>
    <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
      <Icon name="x" size="xs" color={colors.text.tertiary} />
    </Pressable>
  </View>
)}
```
4. When sending a comment, include `replyToId: replyTo?.id` in the API call
5. Clear replyTo after sending

Read the existing send comment logic and adapt.

**Verification:** Reply button works. Reply indicator shows. Reply sends with parent ID.

---

## Step 17 — Store: Add Missing State
**Agent 17** | File: `apps/mobile/src/store/index.ts` (EDIT)

Read the full file. Add missing state fields:

```ts
// Add to AppState interface:
followedHashtags: string[];
addFollowedHashtag(tag: string): void;
removeFollowedHashtag(tag: string): void;

// Add to create store:
followedHashtags: [],
addFollowedHashtag: (tag) => set((s) => ({
  followedHashtags: [...s.followedHashtags, tag],
})),
removeFollowedHashtag: (tag) => set((s) => ({
  followedHashtags: s.followedHashtags.filter(t => t !== tag),
})),
```

Add `followedHashtags` to the `partialize` persist config so it survives app restarts.

Add selector: `export const useFollowedHashtags = () => useStore(s => s.followedHashtags);`

**Verification:** Store compiles. New state accessible.

---

# PART D — BACKEND EDITS (Agent 18)

---

## Step 18 — Register New Modules + Backend Wiring
**Agent 18** | Files:
- `apps/api/src/app.module.ts` (EDIT)

Register all 4 new backend modules:
```ts
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { MajlisListsModule } from './modules/majlis-lists/majlis-lists.module';
import { PollsModule } from './modules/polls/polls.module';
import { SubtitlesModule } from './modules/subtitles/subtitles.module';
```

Add all to `imports` array.

**Verification:** `npx tsc --noEmit` — 0 errors after all backend agents complete.

---

# PART E — MOBILE API + TYPES (Agent 19)

---

## Step 19 — API Client + Types Updates
**Agent 19** | Files:
- `apps/mobile/src/services/api.ts` (EDIT)
- `apps/mobile/src/types/index.ts` (EDIT)

### api.ts — Add new API groups:

```ts
// Scheduling API
export const schedulingApi = {
  getScheduled: () => api.get<ScheduledItem[]>('/scheduling/scheduled'),
  updateSchedule: (type: string, id: string, scheduledAt: string) =>
    api.patch(`/scheduling/${type}/${id}`, { scheduledAt }),
  cancelSchedule: (type: string, id: string) =>
    api.delete(`/scheduling/${type}/${id}`),
  publishNow: (type: string, id: string) =>
    api.post(`/scheduling/publish-now/${type}/${id}`),
};

// Majlis Lists API
export const majlisListsApi = {
  getLists: () => api.get<MajlisList[]>('/majlis-lists'),
  create: (data: { name: string; description?: string; isPublic?: boolean }) =>
    api.post<MajlisList>('/majlis-lists', data),
  getById: (id: string) => api.get<MajlisList>(`/majlis-lists/${id}`),
  update: (id: string, data: Partial<MajlisList>) =>
    api.patch(`/majlis-lists/${id}`, data),
  delete: (id: string) => api.delete(`/majlis-lists/${id}`),
  getMembers: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/majlis-lists/${id}/members${qs({ cursor })}`),
  addMember: (id: string, userId: string) =>
    api.post(`/majlis-lists/${id}/members`, { userId }),
  removeMember: (id: string, userId: string) =>
    api.delete(`/majlis-lists/${id}/members/${userId}`),
  getTimeline: (id: string, cursor?: string) =>
    api.get<PaginatedResponse<Thread>>(`/majlis-lists/${id}/timeline${qs({ cursor })}`),
};

// Polls API
export const pollsApi = {
  get: (id: string) => api.get<Poll>(`/polls/${id}`),
  vote: (id: string, optionId: string) =>
    api.post(`/polls/${id}/vote`, { optionId }),
  retractVote: (id: string) => api.delete(`/polls/${id}/vote`),
  getVoters: (id: string, optionId: string, cursor?: string) =>
    api.get<PaginatedResponse<User>>(`/polls/${id}/voters${qs({ optionId, cursor })}`),
};

// Subtitles API
export const subtitlesApi = {
  list: (videoId: string) => api.get<SubtitleTrack[]>(`/videos/${videoId}/subtitles`),
  upload: (videoId: string, data: { label: string; language: string; srtUrl: string }) =>
    api.post(`/videos/${videoId}/subtitles`, data),
  delete: (videoId: string, trackId: string) =>
    api.delete(`/videos/${videoId}/subtitles/${trackId}`),
};

// Stories reactions (if endpoint exists)
export const storiesReactionsApi = {
  react: (storyId: string, emoji: string) =>
    api.post(`/stories/${storyId}/react`, { emoji }),
};
```

Also add to `usersApi` if missing:
```ts
getArchive: () => api.get<Story[]>('/stories/me/archived'),
```

### types/index.ts — Add new types:

```ts
export interface ScheduledItem {
  id: string;
  type: 'post' | 'thread' | 'reel' | 'video';
  title?: string;
  content?: string;
  caption?: string;
  scheduledAt: string;
  createdAt: string;
}

export interface MajlisList {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  membersCount: number;
  userId: string;
  createdAt: string;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  userVotedOptionId?: string;
  expiresAt?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votesCount: number;
  percentage: number;
}

export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  srtUrl: string;
  videoId: string;
}

export interface VideoChapter {
  title: string;
  startTime: number; // seconds
}
```

Read the schema to verify field names before writing types.

**Verification:** No TypeScript errors. All API methods typed.

---

# PART F — TEST SPECS (Agents 20-24)

---

## Step 20 — Recommendations Service Spec
**Agent 20** | NEW file: `apps/api/src/modules/recommendations/recommendations.service.spec.ts`

Read `recommendations.service.ts` to understand all methods. Write tests:

- suggestedPeople: returns users sorted by mutual followers
- suggestedPeople: excludes already-followed users
- suggestedPeople: excludes private/deactivated users
- suggestedPosts: returns high-engagement posts from last 48h
- suggestedReels: returns engagement-ranked reels
- suggestedChannels: returns channels sorted by subscribers

Mock PrismaService. Follow existing spec patterns.

**Verification:** Tests pass.

---

## Step 21 — Controller Specs Batch A
**Agent 21** | NEW files:
- `apps/api/src/modules/posts/posts.controller.spec.ts` (NEW)
- `apps/api/src/modules/users/users.controller.spec.ts` (NEW)
- `apps/api/src/modules/threads/threads.controller.spec.ts` (NEW)
- `apps/api/src/modules/reels/reels.controller.spec.ts` (NEW)

For each controller, read the controller file and write tests that:
1. Mock the service
2. Test that each endpoint calls the correct service method
3. Test that guards are applied (verify ClerkAuthGuard is used)
4. Test parameter extraction (@Param, @Query, @Body, @CurrentUser)

Each spec should have 5-8 tests covering the main CRUD endpoints.

Pattern:
```ts
describe('PostsController', () => {
  let controller: PostsController;
  let service: { getFeed: jest.Mock; create: jest.Mock; /* ... */ };

  beforeEach(async () => {
    service = {
      getFeed: jest.fn(),
      create: jest.fn(),
      getById: jest.fn(),
      delete: jest.fn(),
      like: jest.fn(),
    };
    const module = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [{ provide: PostsService, useValue: service }],
    }).compile();
    controller = module.get(PostsController);
  });

  it('should call getFeed with userId and type', async () => {
    service.getFeed.mockResolvedValue({ data: [], meta: {} });
    await controller.getFeed('user-1', 'foryou');
    expect(service.getFeed).toHaveBeenCalledWith('user-1', 'foryou', undefined, undefined);
  });
  // ... more tests
});
```

Read each controller to understand exact method signatures.

**Verification:** All 4 spec files pass.

---

## Step 22 — Controller Specs Batch B
**Agent 22** | NEW files:
- `apps/api/src/modules/messages/messages.controller.spec.ts` (NEW)
- `apps/api/src/modules/channels/channels.controller.spec.ts` (NEW)
- `apps/api/src/modules/videos/videos.controller.spec.ts` (NEW)
- `apps/api/src/modules/stories/stories.controller.spec.ts` (NEW)

Same pattern as Agent 21. 5-8 tests per controller.

**Verification:** All 4 spec files pass.

---

## Step 23 — New Module Specs
**Agent 23** | NEW files:
- `apps/api/src/modules/scheduling/scheduling.service.spec.ts` (NEW)
- `apps/api/src/modules/majlis-lists/majlis-lists.service.spec.ts` (NEW)
- `apps/api/src/modules/polls/polls.service.spec.ts` (NEW)
- `apps/api/src/modules/subtitles/subtitles.service.spec.ts` (NEW)

Write 5-8 tests per service:

**Scheduling:** getScheduled, updateSchedule validates future time, cancelSchedule, publishNow
**Majlis Lists:** create, getById, addMember, removeMember (owner only), timeline returns member threads
**Polls:** vote, prevent double vote, retract vote, get poll with user vote
**Subtitles:** list tracks, create track (owner only), delete track

Read each service file (created by Agents 6-9) to understand exact methods.

**Verification:** All 4 spec files pass.

---

## Step 24 — Health Module Spec
**Agent 24** | NEW file: `apps/api/src/modules/health/health.controller.spec.ts` (NEW)

Read `health.controller.ts` (the health module has no service — logic is in the controller).

Write 3-5 tests:
- GET /health returns 200 with status "ok"
- GET /health/metrics returns entity counts
- Health check tests DB connectivity (mock PrismaService.$queryRaw)

**Verification:** Tests pass.

---

# PART G — DOCS (Agent 25)

---

## Step 25 — Docs Update
**Agent 25** | Files:
- `CLAUDE.md` (EDIT)
- `C:\Users\shakh\.claude\projects\C--Users-shakh\memory\MEMORY.md` (EDIT)

**Runs LAST after all other agents complete.**

### CLAUDE.md:
1. Update module count: 24 → 28 (add scheduling, majlis-lists, polls, subtitles)
2. Update endpoint count: ~203 → ~230+ (estimate based on new modules)
3. Update screen count: +5 new screens
4. Update test count: +40-60 new tests across 10 new spec files
5. Update "Still Missing" list — remove items now implemented
6. Add new modules to architecture section

### MEMORY.md:
Add batch 18 entry:
```
- **Batch 18 (2026-03-08):** The Everything Batch. 25 agents. NEW: scheduling module, majlis-lists module, polls module, subtitles module. NEW SCREENS: schedule-post, archive, bookmark-folders, manage-data, majlis-lists, majlis-list detail. FEATURES: story emoji reactions, hashtag follow, video chapters, pinned posts on profile, read receipts, CommentsSheet reply, channel clipboard/share fixes. TESTS: 10 new spec files (recommendations, 8 controller specs, health, 4 new module specs). Store expanded.
```

Update current state to ~97% feature complete.

---

## File-to-Agent Conflict Map

| File | Agent |
|------|-------|
| `apps/mobile/app/(screens)/schedule-post.tsx` (NEW) | 1 |
| `apps/mobile/app/(screens)/archive.tsx` (NEW) | 2 |
| `apps/mobile/app/(screens)/bookmark-folders.tsx` (NEW) | 3 |
| `apps/mobile/app/(screens)/manage-data.tsx` (NEW) | 4 |
| `apps/mobile/app/(screens)/majlis-lists.tsx` (NEW) | 5 |
| `apps/mobile/app/(screens)/majlis-list/[id].tsx` (NEW) | 5 |
| `apps/api/src/modules/scheduling/*` (3 NEW) | 6 |
| `apps/api/src/modules/majlis-lists/*` (3 NEW) | 7 |
| `apps/api/src/modules/polls/*` (3 NEW) | 8 |
| `apps/api/src/modules/subtitles/*` (3 NEW) | 9 |
| `apps/mobile/app/(screens)/story-viewer.tsx` | 10 |
| `apps/mobile/app/(screens)/hashtag/[tag].tsx` | 11 |
| `apps/mobile/app/(screens)/video/[id].tsx` | 12 |
| `apps/mobile/app/(screens)/profile/[username].tsx` | 13 |
| `apps/mobile/app/(screens)/channel/[handle].tsx` | 14 |
| `apps/mobile/app/(screens)/conversation/[id].tsx` | 15 |
| `apps/mobile/src/components/bakra/CommentsSheet.tsx` | 16 |
| `apps/mobile/src/store/index.ts` | 17 |
| `apps/api/src/app.module.ts` | 18 |
| `apps/mobile/src/services/api.ts` | 19 |
| `apps/mobile/src/types/index.ts` | 19 |
| `recommendations.service.spec.ts` (NEW) | 20 |
| `posts.controller.spec.ts` (NEW) | 21 |
| `users.controller.spec.ts` (NEW) | 21 |
| `threads.controller.spec.ts` (NEW) | 21 |
| `reels.controller.spec.ts` (NEW) | 21 |
| `messages.controller.spec.ts` (NEW) | 22 |
| `channels.controller.spec.ts` (NEW) | 22 |
| `videos.controller.spec.ts` (NEW) | 22 |
| `stories.controller.spec.ts` (NEW) | 22 |
| `scheduling.service.spec.ts` (NEW) | 23 |
| `majlis-lists.service.spec.ts` (NEW) | 23 |
| `polls.service.spec.ts` (NEW) | 23 |
| `subtitles.service.spec.ts` (NEW) | 23 |
| `health.controller.spec.ts` (NEW) | 24 |
| `CLAUDE.md` | 25 |
| `MEMORY.md` | 25 |

**Zero conflicts.** 37 files across 25 agents. Every file touched by exactly one agent.

---

## Dependency Order

```
Parallel wave 1: Agents 1-24 (all independent)
Sequential after: Agent 25 (docs — needs final counts)
```

**Note:** Agents 20-23 (test specs) technically depend on their corresponding service/module agents (6-9, 2) completing first. But since each test agent creates NEW files and mocks the service, they can run in parallel — they'll read whatever code exists and mock accordingly.

---

## Verification Checklist

1. `cd apps/api && npx tsc --noEmit` — 0 errors
2. `cd apps/api && npx jest` — all tests pass
3. New screens render (schedule, archive, bookmark-folders, manage-data, majlis-lists, majlis-list detail)
4. Story emoji reactions work
5. Hashtag follow button toggles
6. Video chapters display when available
7. Profile shows pinned posts + archive link
8. Channel copy/share buttons work
9. Read receipts visible on sent messages
10. CommentsSheet reply works
11. All 10 new spec files pass
12. Total test count: 400+
