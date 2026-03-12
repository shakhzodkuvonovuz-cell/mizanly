# BATCH 29: Visual Polish Sweep — 5 Stages, Sequential Run

**Date:** 2026-03-13
**Theme:** 36 screens still lack glassmorphism, entrance animations, and brand color treatment. This batch brings every remaining screen to the same premium visual quality as the rest of the app. Execute stages sequentially — commit after each stage.
**Total Tasks:** 36 across 5 stages

---

## GLOBAL RULES (apply to ALL stages)

1. Read `CLAUDE.md` in project root FIRST — mandatory code quality rules
2. `<BottomSheet>` never RN Modal | `<Skeleton>` never ActivityIndicator for content | `<EmptyState>` never bare text | `<Icon>` never emoji | `radius.*` never hardcoded >= 6
3. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
4. All FlatLists MUST have `<RefreshControl tintColor={colors.emerald} />`
5. Import ALL design tokens from `@/theme`
6. Use `expo-linear-gradient` for gradients, `react-native-reanimated` for animations
7. Use existing `animation.spring.*` presets: `bouncy{D10,S400}`, `snappy{D12,S350}`, `responsive{D14,S170}`, `gentle{D20,S100}`, `fluid{D18,S150}`
8. After completing each stage: `git add -A && git commit -m "feat: batch 29 stage N — <description>"`
9. Do NOT start the next stage until the current one is committed
10. Do NOT change any file not listed in the task. Do NOT rename exports, props, or routes.

### Quick Token Reference
```
colors.emerald=#0A7B4F  colors.emeraldLight=#0D9B63  colors.emeraldDark=#066B42
colors.gold=#C8963E  colors.goldLight=#D4A94F
colors.dark.bg=#0D1117  colors.dark.bgElevated=#161B22  colors.dark.bgCard=#1C2333
colors.dark.bgSheet=#21283B  colors.dark.surface=#2D3548
colors.dark.border=#30363D  colors.dark.borderLight=#484F58
colors.text.primary=#FFF  colors.text.secondary=#8B949E  colors.text.tertiary=#6E7781
colors.error=#F85149  colors.warning=#D29922  colors.like=#F85149  colors.bookmark=#C8963E
colors.active.emerald10=rgba(10,123,79,0.1)  colors.active.emerald20=rgba(10,123,79,0.2)
colors.active.gold10=rgba(200,150,62,0.1)  colors.active.white5=rgba(255,255,255,0.05)

spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24 2xl=28
radius: sm=6 md=10 lg=16 xl=24 full=9999
shadow: sm(elev2) md(elev6) lg(elev12) glow(emerald,elev8)
animation.spring: bouncy(D10,S400) snappy(D12,S350) responsive(D14,S170) gentle(D20,S100) fluid(D18,S150)
```

### Visual Polish Recipe (apply to EVERY screen)

Each screen needs these upgrades:

**1. Add imports:**
```tsx
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
```

**2. Glassmorphism cards** — wrap sections in:
```tsx
<LinearGradient
  colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
  style={{ borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: spacing.md, marginHorizontal: spacing.base, marginBottom: spacing.md }}
>
  {/* content */}
</LinearGradient>
```

**3. Entrance animations** — wrap list items / sections in:
```tsx
<Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
```

**4. Section header icons** — add icon with gradient bg before section titles:
```tsx
<LinearGradient
  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
  style={{ width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }}
>
  <Icon name="..." size="xs" color={colors.emerald} />
</LinearGradient>
```

**5. Row icon backgrounds** — for settings-style rows, add icon container:
```tsx
<LinearGradient
  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
  style={{ width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }}
>
  <Icon name="..." size="xs" color={colors.emerald} />
</LinearGradient>
```

---

## STAGE 1: Messaging & Conversation Screens (7 tasks)

### Task 1.1 — conversation-info.tsx
**File:** `apps/mobile/app/(screens)/conversation-info.tsx` (724 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Wrap the avatar/name header area in a glassmorphism card
- Wrap each settings section (Notifications, Media, Members) in glassmorphism cards
- Add FadeInUp to each section with stagger (delay 0, 80, 160, 240ms)
- Admin badge: small `<LinearGradient colors={[colors.emerald, colors.gold]}>` pill
- Member list items: add subtle glassmorphism bg, FadeInUp with index stagger
- "Leave Group" / "Delete" buttons: red gradient bg `['rgba(248,81,73,0.15)', 'rgba(248,81,73,0.05)']`

### Task 1.2 — conversation-media.tsx
**File:** `apps/mobile/app/(screens)/conversation-media.tsx` (507 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Tab bar (Photos/Videos/Files): glassmorphism pill background
- Media grid items: FadeInUp with index * 50ms stagger
- File items: glassmorphism card bg, icon container with gradient
- Empty states already use `<EmptyState>` — just ensure they're wrapped in glass card

### Task 1.3 — starred-messages.tsx
**File:** `apps/mobile/app/(screens)/starred-messages.tsx` (318 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Each starred message: glassmorphism card with gold left border (3px, `colors.gold`)
- Star icon: gold gradient bg container `['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']`
- FadeInUp on each message with index stagger
- Header subtitle: gold "★ N messages" text

### Task 1.4 — pinned-messages.tsx
**File:** `apps/mobile/app/(screens)/pinned-messages.tsx` (235 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Each pinned message: glassmorphism card with emerald left border (3px)
- Pin icon: emerald gradient bg container
- FadeInUp on each message with index stagger

### Task 1.5 — new-conversation.tsx
**File:** `apps/mobile/app/(screens)/new-conversation.tsx` (191 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Search input: glassmorphism wrapper, emerald border on focus, `colors.active.emerald10` focus bg
- User result rows: glassmorphism card bg, FadeInUp with stagger
- Selected user chips: emerald gradient pill background

### Task 1.6 — broadcast/[id].tsx
**File:** `apps/mobile/app/(screens)/broadcast/[id].tsx` (442 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Channel header: glassmorphism banner card with emerald/gold gradient overlay
- Message bubbles: glassmorphism bg for received, emerald gradient for channel messages
- Subscriber count: gold badge with gradient bg
- FadeInUp on messages

### Task 1.7 — create-broadcast.tsx
**File:** `apps/mobile/app/(screens)/create-broadcast.tsx` (311 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Form sections: glassmorphism cards with section icon headers
- Input fields: focus glow (emerald border + `emerald10` bg)
- Broadcast icon in name input: gradient bg container
- FadeInUp on each form section (stagger 100ms)

**Commit:** `git add -A && git commit -m "feat: batch 29 stage 1 — messaging screens visual polish"`

---

## STAGE 2: Discovery & Content Screens (7 tasks)

### Task 2.1 — search-results.tsx
**File:** `apps/mobile/app/(screens)/search-results.tsx` (642 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Search bar: glassmorphism wrapper with emerald focus glow
- Tab pills: glassmorphism bg, active tab gets emerald gradient pill
- People results: glassmorphism user cards with FadeInUp stagger
- Hashtag results: # icon with emerald gradient bg, glass card
- Reel results grid: FadeInUp with index stagger

### Task 2.2 — hashtag/[tag].tsx
**File:** `apps/mobile/app/(screens)/hashtag/[tag].tsx` (222 lines)
**What to add:**
- Import `LinearGradient` (already has some animations)
- Header card: large glassmorphism card with # icon (emerald gradient bg, 48x48), hashtag name large, post count in gold
- "Follow" button: use `<GradientButton>` (import it)
- Post grid: FadeInUp with index stagger

### Task 2.3 — hashtag-explore.tsx
**File:** `apps/mobile/app/(screens)/hashtag-explore.tsx` (214 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Category filter chips: glassmorphism pills, active = emerald gradient fill
- Trending hashtags list: glassmorphism cards, # icon with emerald bg, post count in gold text
- FadeInUp on each hashtag row with stagger

### Task 2.4 — trending-audio.tsx
**File:** `apps/mobile/app/(screens)/trending-audio.tsx` (218 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Audio cards: glassmorphism bg with music note icon (gold gradient bg)
- Play button: small emerald gradient circle
- Usage count: gold text
- FadeInUp on each audio card with stagger
- Trending rank number: large gold text on left side

### Task 2.5 — sound/[id].tsx
**File:** `apps/mobile/app/(screens)/sound/[id].tsx` (369 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Sound header: glassmorphism card with album art placeholder (gradient bg), title, artist, usage stats
- Stats row: emerald icons with gradient bg containers (plays, reels, saves)
- "Use this sound" button: `<GradientButton>` full width
- Related reels grid: FadeInUp with stagger
- Waveform placeholder: emerald gradient bars

### Task 2.6 — sticker-browser.tsx
**File:** `apps/mobile/app/(screens)/sticker-browser.tsx` (419 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Category tabs: glassmorphism pill row, active = emerald gradient
- Sticker pack cards: glassmorphism bg, FadeInUp stagger
- "Add to Collection" button: small emerald gradient pill
- Search input: glassmorphism wrapper with emerald focus glow

### Task 2.7 — community-posts.tsx
**File:** `apps/mobile/app/(screens)/community-posts.tsx` (589 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Community header card: glassmorphism with icon, name, member count
- Compose prompt: glassmorphism card with avatar + "Write something..." + emerald gradient send icon
- Post cards: FadeInUp stagger on the list items
- Pinned post: gold left border (3px) to distinguish

**Commit:** `git add -A && git commit -m "feat: batch 29 stage 2 — discovery & content screens visual polish"`

---

## STAGE 3: Settings & Account Screens (7 tasks)

### Task 3.1 — account-settings.tsx
**File:** `apps/mobile/app/(screens)/account-settings.tsx` (297 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Match the pattern from `settings.tsx` exactly:
  - Each section: glassmorphism card wrapper
  - Each row: icon with gradient bg container on the left
  - Section headers: icon + uppercase label
  - FadeInUp on each section with stagger
- Account info card at top: glassmorphism with user avatar, email, phone
- Danger zone (delete account): red gradient card bg `['rgba(248,81,73,0.1)', 'rgba(248,81,73,0.05)']`

### Task 3.2 — manage-data.tsx
**File:** `apps/mobile/app/(screens)/manage-data.tsx` (366 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Data sections: glassmorphism cards (Download Data, Delete Account, Cache)
- Section icons: gradient bg containers (emerald for safe actions, red for destructive)
- Progress/status indicators: emerald gradient progress bar
- "Request Data Export" button: `<GradientButton>`
- "Delete Account" section: red gradient card bg, red icon bg
- FadeInUp on each section with stagger

### Task 3.3 — blocked-keywords.tsx
**File:** `apps/mobile/app/(screens)/blocked-keywords.tsx` (199 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Input area: glassmorphism wrapper, emerald focus glow, gradient "Add" button
- Keyword chips: glassmorphism pills with X delete icon, FadeInUp on add
- Each chip: `<LinearGradient colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}>` with `borderRadius: radius.full`
- Empty state: show shield icon

### Task 3.4 — call-history.tsx
**File:** `apps/mobile/app/(screens)/call-history.tsx` (232 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Each call row: glassmorphism card bg
- Call type icon: gradient bg container — emerald for answered, red for missed, gold for outgoing
- Call direction arrow: small colored icon (incoming ↓ green, outgoing ↑ gold, missed ↓ red)
- Duration text: `colors.text.secondary`
- FadeInUp on each row with stagger
- "Clear History" in header: red text action

### Task 3.5 — voice-recorder.tsx
**File:** `apps/mobile/app/(screens)/voice-recorder.tsx` (256 lines)
**What to add:**
- Import `Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming }` and `LinearGradient`
- Record button: large (80x80) `<LinearGradient colors={[colors.emerald, colors.emeraldDark]}>` circle, with pulse animation when recording (scale 1 → 1.15 → 1 repeat)
- Recording state: pulsing red dot + emerald ring around record button
- Waveform bars: animated height using `useAnimatedStyle`, emerald gradient fill
- Timer: large text, emerald color when recording
- Controls row (play, delete, send): glassmorphism pill bg, icons with gradient bg
- Send button: `<GradientButton label="Send" />`

### Task 3.6 — drafts.tsx
**File:** `apps/mobile/app/(screens)/drafts.tsx` (188 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Each draft card: glassmorphism bg with FadeInUp stagger
- Space badge: colored gradient pill — SAF=emerald, MAJLIS=emerald, BAKRA=gold, MINBAR=gold
- Space icon: gradient bg container matching space color
- Timestamp: `colors.text.tertiary` with clock icon
- Delete swipe or trash icon: red gradient bg
- Empty state: pencil icon, "No drafts yet"

### Task 3.7 — qr-scanner.tsx
**File:** `apps/mobile/app/(screens)/qr-scanner.tsx` (186 lines)
**What to add:**
- Import `Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming }` and `LinearGradient`
- Scanner overlay: semi-transparent dark bg with transparent center cutout
- Corner brackets: 4 L-shaped emerald corners around scan area (use View with borderWidth)
- Scanning line: animated emerald line that moves up and down (translateY repeat)
- Bottom instruction: glassmorphism pill with "Point camera at QR code" text
- Flash toggle: glassmorphism circle button

**Commit:** `git add -A && git commit -m "feat: batch 29 stage 3 — settings & account screens visual polish"`

---

## STAGE 4: Moderation & Social Screens (7 tasks)

### Task 4.1 — report.tsx
**File:** `apps/mobile/app/(screens)/report.tsx` (213 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Reason cards: glassmorphism selectable cards (tap to select), selected = emerald border + `emerald10` bg
- Selected indicator: emerald check icon on right
- Details input: glassmorphism wrapper, emerald focus glow, char count ring
- FadeInUp on each reason card with stagger
- Submit: already has `<GradientButton>` — ensure it's prominent at bottom

### Task 4.2 — my-reports.tsx
**File:** `apps/mobile/app/(screens)/my-reports.tsx` (208 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Report cards: glassmorphism bg
- Status badges: gradient pills — PENDING=`['rgba(210,153,34,0.2)','rgba(210,153,34,0.1)']` gold text, RESOLVED=`['rgba(10,123,79,0.2)','rgba(10,123,79,0.1)']` emerald text, REJECTED=`['rgba(248,81,73,0.2)','rgba(248,81,73,0.1)']` red text
- Report type icon: gradient bg container
- FadeInUp on each card with stagger

### Task 4.3 — reports/[id].tsx
**File:** `apps/mobile/app/(screens)/reports/[id].tsx` (253 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Report detail: glassmorphism card sections (Status, Reason, Details, Response)
- Status badge: same gradient pills as my-reports
- Timeline: vertical emerald line with dots for each status change
- Section headers: icon with gradient bg
- FadeInUp on each section

### Task 4.4 — follow-requests.tsx
**File:** `apps/mobile/app/(screens)/follow-requests.tsx` (195 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- User cards: glassmorphism bg, avatar + name + username
- Accept button: small `<GradientButton variant="small">` or emerald gradient pill
- Decline button: glassmorphism outline pill with red text
- FadeInUp on each request with stagger
- Empty state: users icon

### Task 4.5 — mutual-followers.tsx
**File:** `apps/mobile/app/(screens)/mutual-followers.tsx` (280 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- User cards: glassmorphism bg
- "Mutual" badge: small emerald gradient pill with users icon
- Follow/Following button: `<GradientButton>` for follow, outline for following
- FadeInUp on each row with stagger

### Task 4.6 — collab-requests.tsx
**File:** `apps/mobile/app/(screens)/collab-requests.tsx` (329 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Collab cards: glassmorphism bg with content preview thumbnail
- Space badge: gradient pill (Bakra=gold, Saf=emerald)
- Accept: `<GradientButton>` small
- Decline: glassmorphism outline pill, red text
- Collab type label: "Duet" / "Stitch" / "Remix" as gradient text badge
- FadeInUp on each card with stagger

### Task 4.7 — majlis-lists.tsx
**File:** `apps/mobile/app/(screens)/majlis-lists.tsx` (328 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- List cards: glassmorphism bg, list name bold, member count in `colors.text.secondary`
- Member avatars: overlapping stack (3 visible + "+N" pill)
- Create FAB: `<LinearGradient colors={[colors.emerald, colors.emeraldDark]}>` circle with plus icon, `shadow.glow`
- FadeInUp on each list card with stagger
- Empty state: layers icon

**Commit:** `git add -A && git commit -m "feat: batch 29 stage 4 — moderation & social screens visual polish"`

---

## STAGE 5: Channels, Live & Playlists (8 tasks)

### Task 5.1 — broadcast-channels.tsx
**File:** `apps/mobile/app/(screens)/broadcast-channels.tsx` (392 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Channel cards: glassmorphism bg, channel icon/avatar on left
- Subscriber count: small gold text with users icon
- Unread badge: emerald gradient circle
- "Discover" section: featured channels in horizontal scroll with glassmorphism cards
- FadeInUp on each channel card with stagger

### Task 5.2 — manage-broadcast.tsx
**File:** `apps/mobile/app/(screens)/manage-broadcast.tsx` (239 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Stats cards row: glassmorphism cards (Subscribers, Messages, Views) with emerald/gold icons
- Settings sections: glassmorphism card wrappers with icon headers
- Each setting row: icon with gradient bg container
- FadeInUp on sections with stagger

### Task 5.3 — edit-channel.tsx
**File:** `apps/mobile/app/(screens)/edit-channel.tsx` (281 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Avatar/banner section: glassmorphism card, camera icon overlay with emerald gradient circle
- Form fields: glassmorphism wrapper, icon containers, emerald focus glow
- Category picker: glassmorphism pills, selected = emerald gradient fill
- Save button: `<GradientButton>` at bottom
- FadeInUp on sections

### Task 5.4 — go-live.tsx
**File:** `apps/mobile/app/(screens)/go-live.tsx` (309 lines)
**What to add:**
- Import `Animated, { FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming }` and `LinearGradient`
- Live type selector (Video/Audio): glassmorphism cards, selected = emerald border + glow
- Form fields: glassmorphism wrapper, icon containers, focus glow
- "Go Live" button: large `<LinearGradient colors={[colors.live, '#FF6B6B']}>` with pulsing animation (scale 1 → 1.03 → 1 repeat, slow)
- Live dot: pulsing red circle next to button (withRepeat opacity 1 → 0.4)
- Schedule toggle: premium toggle switch matching settings.tsx pattern
- FadeInUp on sections

### Task 5.5 — schedule-live.tsx
**File:** `apps/mobile/app/(screens)/schedule-live.tsx` (427 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Date/time display cards: glassmorphism bg with calendar/clock icons (gradient bg)
- Schedule card: emerald accent line on left, glassmorphism bg
- Form sections: glassmorphism wrappers
- "Schedule" button: `<GradientButton>`
- FadeInUp on each section with stagger

### Task 5.6 — playlists/[channelId].tsx
**File:** `apps/mobile/app/(screens)/playlists/[channelId].tsx` (231 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Playlist cards: glassmorphism bg, thumbnail on left with play overlay
- Video count badge: small emerald gradient pill
- Create playlist FAB: emerald gradient circle with plus icon
- FadeInUp on each playlist card with stagger

### Task 5.7 — playlist/[id].tsx
**File:** `apps/mobile/app/(screens)/playlist/[id].tsx` (228 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Header card: glassmorphism with playlist cover (gradient fallback), title, description, video count
- "Play All" button: `<GradientButton>` with play icon
- "Shuffle" button: glassmorphism outline button
- Video list items: glassmorphism bg, thumbnail + title + duration badge
- FadeInUp on videos with stagger

### Task 5.8 — watch-history.tsx
**File:** `apps/mobile/app/(screens)/watch-history.tsx` (293 lines)
**What to add:**
- Import `Animated, { FadeInUp }` and `LinearGradient`
- Video cards: glassmorphism bg, thumbnail with duration badge overlay
- Watch progress bar: emerald gradient fill at bottom of thumbnail
- "Clear History" header action: red text
- Date section headers: glassmorphism pill with calendar icon
- FadeInUp on each video card with stagger
- Empty state: clock icon

**Commit:** `git add -A && git commit -m "feat: batch 29 stage 5 — channels, live & playlists visual polish"`

---

## VERIFICATION CHECKLIST

After all 5 stages, verify:
- [ ] `npx tsc --noEmit` — check for new type errors
- [ ] Search for `as any` — must be 0 in non-test code
- [ ] Search for `borderRadius: 999` or hardcoded >= 6 — must be 0
- [ ] Every screen now imports `LinearGradient` from expo-linear-gradient
- [ ] Every screen now imports `Animated` or `FadeInUp` from react-native-reanimated
- [ ] All FlatLists have `<RefreshControl tintColor={colors.emerald} />`

## FILE → STAGE MAP (no conflicts)

| Stage | Files |
|-------|-------|
| 1 | conversation-info, conversation-media, starred-messages, pinned-messages, new-conversation, broadcast/[id], create-broadcast |
| 2 | search-results, hashtag/[tag], hashtag-explore, trending-audio, sound/[id], sticker-browser, community-posts |
| 3 | account-settings, manage-data, blocked-keywords, call-history, voice-recorder, drafts, qr-scanner |
| 4 | report, my-reports, reports/[id], follow-requests, mutual-followers, collab-requests, majlis-lists |
| 5 | broadcast-channels, manage-broadcast, edit-channel, go-live, schedule-live, playlists/[channelId], playlist/[id], watch-history |

**Zero file overlaps between stages.**
