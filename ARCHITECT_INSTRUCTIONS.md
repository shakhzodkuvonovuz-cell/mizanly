# MEGA BATCH 28: Visual Mastery — 5 Stages, Overnight Run

**Date:** 2026-03-12
**Theme:** Transform every screen from "functional app" to "billion-dollar platform" visual quality. Plus new screens for V2 features. Execute stages sequentially — commit after each stage.
**Total Tasks:** 35 across 5 stages

---

## GLOBAL RULES (apply to ALL stages)

1. Read `CLAUDE.md` in project root FIRST — mandatory code quality rules
2. `<BottomSheet>` never RN Modal | `<Skeleton>` never ActivityIndicator for content | `<EmptyState>` never bare text | `<Icon>` never emoji | `radius.*` never hardcoded >= 6
3. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
4. All FlatLists MUST have `<RefreshControl tintColor={colors.emerald} />`
5. Import ALL design tokens from `@/theme`
6. Use `expo-linear-gradient` for gradients, `react-native-reanimated` for animations
7. Use existing `animation.spring.*` presets: `bouncy{D10,S400}`, `snappy{D12,S350}`, `responsive{D14,S170}`, `gentle{D20,S100}`, `fluid{D18,S150}`
8. After completing each stage: `git add -A && git commit -m "feat: mega batch 28 stage N — <description>"`
9. Do NOT start the next stage until the current one is committed

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
shadow.sm / shadow.md / shadow.lg / shadow.glow — import from theme
glass.light / glass.medium / glass.heavy / glass.ultra — glassmorphism presets
spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32 3xl=40
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24 2xl=28
radius: sm=6 md=10 lg=16 xl=24 full=9999
```

### Available Components (already exist — use them)
```
GlassHeader, GradientButton, EmptyState, Skeleton.*, BottomSheet+BottomSheetItem,
Avatar, Icon (44+ names), TabSelector, FloatingHearts, CaughtUpCard,
CharCountRing, VerifiedBadge, RichText, Badge, OfflineBanner, ActionButton,
ToastNotification, ImageLightbox, VideoPlayer, LocationPicker, Autocomplete
```

---

# STAGE 1: First Impressions & Core Identity (7 tasks)
**Focus:** Auth, onboarding, profile, search — the screens every user sees first

## Task 1.1: Sign-In Screen Polish
**File:** `app/(auth)/sign-in.tsx` (128 lines)

Current: Plain "Mizanly" + "ميزانلي" text logo, 2 bare TextInputs, GradientButton, footer link.

Changes:
1. **Animated logo** — on mount, logo scales 0.85→1 + fades in 0→1. Import `useSharedValue, useAnimatedStyle, withSpring, withTiming` from reanimated. Arabic text fades in 200ms after with `withDelay`.
2. **Decorative bg glow** — `<LinearGradient colors={[colors.active.emerald20, 'transparent']} style={{position:'absolute', top:'15%', alignSelf:'center', width:250, height:250, borderRadius:radius.full, opacity:0.5}} />`
3. **Input row with icon** — wrap each TextInput in a row: `<View style={[styles.inputRow, focused && styles.inputRowFocused]}><Icon name="mail"/"lock" size="sm" color={focused ? colors.emerald : colors.text.tertiary} /><TextInput style={styles.inputInner} .../></View>`. Focus glow: `shadowColor:colors.emerald, shadowOpacity:0.15, shadowRadius:8`.
4. **"or" divider** — horizontal line + "or" text + line, between button and footer
5. **Social auth row** — 2 buttons (Google/Apple) with `colors.dark.bgElevated` bg, `radius.md`, icon+text

## Task 1.2: Sign-Up Screen Polish
**File:** `app/(auth)/sign-up.tsx` (188 lines)

Same patterns as 1.1 plus:
1. Same animated logo, bg glow, input icons, focus glow, social auth
2. **Password strength bars** — 4 bars below password. `strength = len<6?1 : len<8?2 : /[A-Z]/.test(pw)&&/[0-9]/.test(pw)?4:3`. Colors: `<=1:error, <=2:warning, >=3:emerald`. Style: `flex:1, height:3, borderRadius:1.5, backgroundColor:colors.dark.border` (filled bars get color override)
3. **Verification digit boxes** — replace single code TextInput with 6 visual boxes + hidden TextInput. Each box: `w:48, h:56, borderRadius:radius.md, bg:colors.dark.bgElevated, border:1.5 colors.dark.border, center`. Active box: `borderColor:colors.emerald`. Digit text: `fontSize:24, fontWeight:'700'`.
4. **Verify header icon** — envelope icon in emerald circle above "Check your email": `w:72, h:72, borderRadius:radius.full, bg:colors.active.emerald10`

## Task 1.3: Onboarding Flow
**Files:** `app/onboarding/username.tsx` (142 lines), `app/onboarding/profile.tsx` (180 lines)

### username.tsx:
1. **Animated progress bar** — replace 4 dots with track+fill. Track: `h:4, borderRadius:2, bg:colors.dark.border`. Fill: animated to 25% width with `withSpring`. `colors.emerald`.
2. **Availability icons** — checking: spinning `<Icon name="loader">` (withRepeat rotation). Available: `<Icon name="check-circle" color={colors.emerald}>` with scale bounce. Taken: `<Icon name="x" color={colors.error}>`.
3. **Username preview card** — when available: `<Animated.View style={previewFadeStyle}><Text>@{username} · Mizanly</Text></Animated.View>` in `colors.dark.bgCard` card.

### profile.tsx:
1. Same progress bar at 50%
2. **Avatar pulse** — placeholder without image: `withRepeat(withSequence(withTiming(1.05,{duration:1200}), withTiming(1,{duration:1200})), -1)`. Show camera icon + "Add photo" inside.
3. **Input icons** — user icon for display name, same focus glow pattern

## Task 1.4: Search Screen Overhaul
**File:** `app/(screens)/search.tsx`

Read the file first. Then:
1. **Search bar redesign** — wrap TextInput in a styled row: `bg:colors.dark.bgElevated, borderRadius:radius.full, paddingHorizontal:spacing.base, flexDirection:'row', alignItems:'center', gap:spacing.sm, borderWidth:1, borderColor:colors.dark.border`. Add `<Icon name="search" size="sm" color={colors.text.tertiary}>` left, clear button `<Icon name="x">` right when text entered.
2. **Focus state** — search bar: `borderColor:colors.emerald` + shadow glow
3. **Trending section** — when no query, show trending hashtags as pill chips: `bg:colors.dark.bgCard, borderRadius:radius.full, paddingHorizontal:spacing.md, paddingVertical:spacing.xs, borderWidth:0.5, borderColor:colors.dark.border`. Prefix with `<Icon name="trending-up" size={12} color={colors.gold}>`.
4. **Search history** — show recent queries with clock icon, swipe-to-delete or X button
5. **Result cards** — users: add follower count + mutual badge. Videos: add emerald duration badge. Add subtle card borders.

## Task 1.5: Profile Screen Depth
**File:** `app/(screens)/profile/[username].tsx` (922 lines)

1. **Cover placeholder gradient** — replace plain `coverPlaceholder` with `<LinearGradient colors={[colors.emeraldDark, colors.dark.bgCard, colors.dark.bg]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.cover} />`
2. **Parallax cover** — `useAnimatedScrollHandler` to track scroll. Cover `translateY: interpolate(scrollY, [-100,0,200], [50,0,-100])`, `scale: interpolate(scrollY, [-100,0], [1.15,1])`. Use `Animated.FlatList`.
3. **Stats card** — wrap stats row in card: `bg:colors.dark.bgCard, borderRadius:radius.lg, marginHorizontal:spacing.base, paddingVertical:spacing.md, borderWidth:0.5, borderColor:colors.dark.borderLight`
4. **Avatar ring** — wrap Avatar in: `borderWidth:2.5, borderColor:colors.emerald, borderRadius:radius.full, padding:2, ...shadow.md`
5. **Highlight rings** — emerald ring around each highlight circle: `borderWidth:2, borderColor:colors.emerald, borderRadius:radius.full, padding:2`

## Task 1.6: Notifications Grouping
**File:** `app/(screens)/notifications.tsx` (352 lines)

1. **SectionList with date headers** — replace FlatList with SectionList. Group notifications into "Today"/"Yesterday"/"This Week"/"Earlier" sections based on `createdAt`. Section header: `color:colors.text.secondary, fontSize:fontSize.sm, fontWeight:'700', paddingHorizontal:spacing.base, paddingTop:spacing.lg, paddingBottom:spacing.xs`.
2. **Like aggregation** — group consecutive LIKE notifications with same postId. Show stacked avatars (up to 3, `marginLeft:-8`) + "Name1, Name2 and N others liked your post".
3. **Unread glow** — unread bar: `width:4, shadowColor:colors.emerald, shadowOpacity:0.4, shadowRadius:4`.
4. **Icon overlay** — increase to `w:22, h:22`, icon size 12.
5. **Row entrance** — each row fades in + slides 8px from right on mount.

## Task 1.7: Discover Screen Cards
**File:** `app/(screens)/discover.tsx`

Read the file first. Then:
1. **Featured section** — top horizontal scroll of large cards (aspect ratio 16:9). Each card: thumbnail + gradient overlay at bottom + title + creator avatar + view count. Style: `borderRadius:radius.lg, overflow:'hidden', width:SCREEN_W*0.75`.
2. **Category pills** — horizontal row of category filters: "All", "Trending", "Food", "Fashion", "Sports", "Tech", "Islamic", "Art". Style: pill chips with `bg:colors.dark.bgCard`, active: `bg:colors.emerald`. Emoji prefix per category.
3. **Grid cards depth** — add `borderRadius:radius.md, overflow:'hidden'` to each grid item. Add subtle border: `borderWidth:0.5, borderColor:colors.dark.borderLight`.
4. **Trending hashtag chips** — style as gold-accented pills with fire/trending icon prefix

---

# STAGE 2: Content Consumption Polish (7 tasks)
**Focus:** Feed tabs, reels, conversations, stories — where users spend most time

## Task 2.1: Bakra Reels TikTok-Level
**File:** `app/(tabs)/bakra.tsx` (722 lines)

1. **Bookmark filled state** — icon: `name={item.isSaved?'bookmark-filled':'bookmark'} color={item.isSaved?colors.gold:colors.text.primary} fill={item.isSaved?colors.gold:undefined}`. Show `savesCount` below.
2. **More menu** — add `<TouchableOpacity>` with `<Icon name="more-horizontal">` at bottom of action column. Opens BottomSheet: Not interested / Report / Copy link / Save.
3. **Video progress bar** — 2px bar at very top of reel. Track: `rgba(255,255,255,0.15)`. Fill: `colors.emerald`. Width animates based on `positionMillis/durationMillis` from `onPlaybackStatusUpdate`.
4. **Action button bounce** — on press, each action icon scales 0.75→1 with `withSequence(withSpring(0.75, snappy), withSpring(1, bouncy))`.
5. **Audio disc glow** — add `shadowColor:colors.emerald, shadowOpacity:0.3, shadowRadius:6` to the vinyl disc.
6. **Follow state on avatar** — if `item.user?.isFollowing`, don't show + button. If just followed, show emerald checkmark circle instead of +.

## Task 2.2: CommentsSheet Polish
**File:** `src/components/bakra/CommentsSheet.tsx` (325 lines)

1. **Comment count in header** — change to `Comments · {reel.commentsCount}`
2. **Reply indentation** — if `item.parentId`: `marginLeft:spacing.xl, borderLeftWidth:2, borderLeftColor:colors.active.emerald20, paddingLeft:spacing.sm`
3. **Heart bounce** — on like, heart icon scale bounce 1→1.3→1
4. **OP badge** — if commenter is creator, show small "Creator" badge: `bg:colors.active.emerald10, borderRadius:radius.sm, paddingHorizontal:4, paddingVertical:1`. Text: `fontSize:9, color:colors.emerald, fontWeight:'700'`
5. **Pinned comment** — if comment is pinned, show pin icon + "Pinned" label above it in `colors.gold`

## Task 2.3: Conversation Bubbles Premium
**File:** `app/(screens)/conversation/[id].tsx` (1904 lines)

Targeted changes only — do not restructure:
1. **Sent bubble gradient** — replace flat bg with `<LinearGradient colors={[colors.emerald, colors.emeraldDark]} start={{x:0,y:0}} end={{x:1,y:1}} style={sentBubbleStyle}>`. Received: keep `bg:colors.dark.bgCard`.
2. **Reply-to border** — quoted message preview: `borderLeftWidth:3, borderLeftColor:colors.emerald, bg:colors.dark.bgElevated, borderRadius:radius.sm, padding:spacing.xs`. Sender name: `color:colors.emerald, fontWeight:'700'`.
3. **Read receipts** — sent messages: single check = `colors.text.tertiary`, double check (`check-check`) = `colors.emerald` when read.
4. **Reaction pills** — each reaction: `bg:colors.dark.bgElevated, borderRadius:radius.full, paddingHorizontal:6, paddingVertical:2, borderWidth:0.5, borderColor:colors.dark.border`. Own reaction: `borderColor:colors.emerald`.
5. **Edited label** — if message has `editedAt`: show "edited" in `fontSize:fontSize.xs, color:colors.text.tertiary, fontStyle:'italic'` below content.
6. **Forwarded label** — if `isForwarded`: show `<Icon name="share" size={10}>` + "Forwarded" above bubble in `colors.text.tertiary`.

## Task 2.4: Story Creation & Viewer
**Files:** `app/(screens)/create-story.tsx` (779 lines), `app/(screens)/story-viewer.tsx`

Read both files first. Then:

### create-story.tsx:
1. **Tool bar active states** — active tool button: `bg:colors.active.emerald20, borderRadius:radius.full`. Icon: `colors.emerald` when active. Label below in `fontSize.xs`.
2. **Filter preview circles** — each filter: 44x44 circle thumbnail with tint overlay. Active: `borderWidth:2, borderColor:colors.emerald`. Name below in `fontSize:10`.
3. **Gradient picker** — each option: 48x48 circle. Active: emerald check overlay badge. Scale bounce on select.
4. **Sticker hint toast** — after placing sticker: "Drag to move · Pinch to resize" toast, auto-dismiss 2s with opacity `withDelay(2000, withTiming(0))`.

### story-viewer.tsx:
1. **Progress bars** — track: `h:2.5, borderRadius:1.5, bg:'rgba(255,255,255,0.25)'`. Fill: `bg:colors.emerald` (not white). Smooth `withTiming` animation.
2. **Reply input** — `bg:'rgba(255,255,255,0.1)', borderRadius:radius.full`. Placeholder: `'rgba(255,255,255,0.5)'`. Send button: `colors.emerald` when text entered.

## Task 2.5: Live Stream Viewer Upgrade
**File:** `app/(screens)/live/[id].tsx`

Read the file first. Then:
1. **Live badge** — pulsing red dot + "LIVE" text at top: `bg:colors.live, borderRadius:radius.sm, paddingHorizontal:spacing.sm`. Dot pulses with `withRepeat(withSequence(withTiming(0.5), withTiming(1)), -1)`.
2. **Viewer count** — animated number with eye icon: `<Icon name="eye" size="xs">` + count, in translucent pill: `bg:'rgba(0,0,0,0.5)', borderRadius:radius.full`.
3. **Chat messages** — style as translucent bubbles: `bg:'rgba(255,255,255,0.08)', borderRadius:radius.md, paddingHorizontal:spacing.sm, paddingVertical:spacing.xs, marginBottom:spacing.xs`. Username in bold, message in white.
4. **Reaction overlay** — floating emoji reactions that drift up and fade out (similar to FloatingHearts but with emoji). Use `withTiming` for Y translation + opacity.
5. **Participant badges** — host: gold crown icon. Moderator: emerald shield. Viewer count in pill.

## Task 2.6: Video Detail Screen
**File:** `app/(screens)/video/[id].tsx`

Read the file first. Then:
1. **Chapter markers** — if video has chapters, show emerald dots on the progress bar at chapter timestamps. Below the player, show chapter list with timestamps + titles.
2. **Engagement bar** — below video: like/dislike/share/save buttons in a single row card. Style: `bg:colors.dark.bgCard, borderRadius:radius.lg, padding:spacing.md, marginHorizontal:spacing.base`. Each button: icon + count, vertically stacked.
3. **Channel info card** — below engagement: channel avatar + name + subscriber count + subscribe button. Background: `colors.dark.bgCard`. Subscribe button: `<GradientButton>`.
4. **Description expand** — video description with "Show more" / "Show less" toggle. First 3 lines visible, then expand with LayoutAnimation.

## Task 2.7: Channel Page Enhancement
**File:** `app/(screens)/channel/[handle].tsx`

Read the file first. Then:
1. **Channel header gradient** — add gradient overlay on banner: `<LinearGradient colors={['transparent','rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill}>`. Channel name + subscribers shown on the gradient.
2. **Subscribe button animation** — on subscribe: button morphs from emerald gradient to outline with spring animation. Show subscriber count bump animation (+1 slides up).
3. **Tab content transitions** — when switching videos/playlists/about tabs: subtle fade crossfade (opacity 0→1, 150ms).
4. **Video grid** — each video card: rounded corners, duration badge in emerald, view count overlay at bottom-left.

---

# STAGE 3: Creation & Settings Premium (7 tasks)
**Focus:** All create screens, settings, edit profile — where users produce content

## Task 3.1: Create Post Screen
**File:** `app/(screens)/create-post.tsx`

Read the file first. Then:
1. **Media grid polish** — selected media: show numbered badge (1, 2, 3...) in top-right corner, emerald circle. Remove button: red circle with X, top-left.
2. **Toolbar icons** — bottom toolbar buttons: each gets active state with emerald tint bg. Icons: `colors.emerald` when feature is active (location set, hashtags added, etc.).
3. **Character count** — show `<CharCountRing>` near the post button, visible when >70% of limit.
4. **Visibility selector** — when changing visibility (Public/Followers/Circle): animate the selector with spring. Show lock/globe/users icon next to selection.

## Task 3.2: Create Thread Screen
**File:** `app/(screens)/create-thread.tsx`

Read the file first. Then:
1. **Thread chain line** — between chained posts, show an animated emerald line connecting them. Line should pulse subtly.
2. **Add to thread button** — "Add to thread" at bottom: dashed border card with + icon, animates in with scale spring.
3. **Poll creation** — if adding a poll, each option input: `borderLeftWidth:3, borderLeftColor:colors.emerald`. "Add option" button in emerald ghost style.
4. **Preview card** — live preview of how the thread will look, styled like a ThreadCard miniature.

## Task 3.3: Create Reel Screen
**File:** `app/(screens)/create-reel.tsx`

Read the file first. Then:
1. **Video preview overlay** — show video duration at bottom of preview. Add play/pause button overlay.
2. **Audio selector** — "Add Sound" button with music note icon, emerald accent. When sound selected: show audio name + waveform preview bar.
3. **Effect chips** — duet/stitch toggles as pill chips: active = emerald bg, inactive = outline.
4. **Hashtag chips** — extracted hashtags shown as `bg:colors.active.emerald10, borderRadius:radius.full` pills with # prefix.

## Task 3.4: Settings Screen Polish
**File:** `app/(screens)/settings.tsx`

Read the file first. Then:
1. **Section icons** — each section header gets an icon: Account (user), Privacy (lock), Notifications (bell), Appearance (eye), Wellbeing (heart), Data (bar-chart-2). Icon in emerald circle.
2. **Setting row hover** — add press feedback: `android_ripple={{color:colors.active.emerald10}}` + opacity press effect.
3. **Danger zone** — "Delete Account" and "Sign Out" section: red-tinted background card `bg:colors.active.error10, borderRadius:radius.lg, borderWidth:1, borderColor:'rgba(248,81,73,0.2)'`.
4. **Version badge** — at bottom: "Mizanly v1.0.0" + "Made with ❤️ for the Ummah" in `colors.text.tertiary, fontSize:fontSize.xs`. Centered.

## Task 3.5: Edit Profile Screen
**File:** `app/(screens)/edit-profile.tsx`

Read the file first. Then:
1. **Cover upload area** — when empty: gradient placeholder (same as profile screen) with camera icon + "Add cover photo" text. Dashed border overlay.
2. **Avatar edit button** — the camera badge on avatar: give it emerald gradient bg instead of plain dark bg. Subtle shadow.
3. **Input sections** — group inputs into labeled cards: "Basic Info", "Bio & Links", "Privacy". Each card: `bg:colors.dark.bgCard, borderRadius:radius.lg, padding:spacing.base, marginBottom:spacing.md`.
4. **Link preview** — each profile link: show domain icon/favicon attempt + title + URL preview. Delete button slides in from right on long-press.

## Task 3.6: Analytics Screen Upgrade
**File:** `app/(screens)/analytics.tsx` (301 lines)

This screen needs the MOST work. Currently: 3 plain number cards + minimal bar chart.

1. **Stat cards redesign** — each stat card: `bg:colors.dark.bgCard, borderRadius:radius.lg, padding:spacing.base, borderLeftWidth:3, borderLeftColor:colors.emerald`. Number: `fontSize:fontSize['2xl'], fontWeight:'700'`. Label below. Add trend arrow: `<Icon name="trending-up" color={colors.emerald}>` or `<Icon name="trending-down" color={colors.error}>` with percentage change.
2. **Sparkline mini-charts** — in each stat card, add a small 7-day sparkline (simple SVG path or use small bar segments). 7 thin bars: `w:4, borderRadius:2, bg:colors.emerald` at varying heights.
3. **Engagement chart** — replace basic bar chart with styled version. Bars: `borderRadius:radius.sm` at top, `bg:colors.emerald`. Active/selected bar: `bg:colors.gold`. Labels: `fontSize:fontSize.xs, color:colors.text.tertiary`. Add Y-axis labels.
4. **Top content section** — replace EmptyState placeholder with actual top performing posts grid. 3-column thumbnails with view/like overlay count.
5. **Time range selector** — pill row: "7d", "30d", "90d", "All". Active: `bg:colors.emerald, color:#fff`. Inactive: `bg:colors.dark.bgCard`.

## Task 3.7: Content Settings & Theme
**Files:** `app/(screens)/content-settings.tsx`, `app/(screens)/theme-settings.tsx`

Read both files first. Then:

### content-settings.tsx:
1. **Warning level cards** — each sensitivity level as a visual card with icon + description. Currently toggling: make it a vertical option list with radio-style selection (emerald circle when selected).
2. **Preview example** — show a small blurred image example that unblurs when the user changes the setting.

### theme-settings.tsx:
1. **Theme preview cards** — show 3 large preview cards (Dark/Light/System) with mini app screenshots. Each card: `w:SCREEN_W*0.28, borderRadius:radius.lg, overflow:'hidden'`. Active: `borderWidth:2, borderColor:colors.emerald`.
2. **Color accent row** — show the brand colors (emerald, gold) as visual swatches. Just decorative, not selectable.
3. **Typography preview** — show font samples in a card: heading font (Playfair Display) and body font (DM Sans) with size examples.

---

# STAGE 4: New Screens & Missing Features (7 tasks)
**Focus:** Build screens that don't exist yet but are needed for V2

## Task 4.1: In-App Camera Screen (NEW)
**File:** `app/(screens)/camera.tsx` (CREATE NEW)

Full camera screen for photo/video capture:
1. **Layout** — full-screen camera preview (use `expo-camera` Camera component). No header — immersive.
2. **Bottom controls** — centered capture button: 72x72 white circle with 64x64 inner circle. On press: scale animation + flash effect.
3. **Mode selector** — bottom row: "Photo" / "Video" / "Story" pills. Active mode: `bg:colors.emerald`. Swipeable.
4. **Top controls** — flash toggle (bolt icon), camera flip (refresh icon), close (X). Translucent dark pills.
5. **Video recording** — when in video mode: capture button gets red ring animation (progress circle). Timer display at top.
6. **Gallery shortcut** — bottom-left: recent photo thumbnail from camera roll, rounded square, opens image picker.
7. **After capture** — navigate to create-post/create-story/create-reel with captured media URI.

Imports needed: `expo-camera`, `expo-media-library`, `expo-image-picker`. Import Camera as a require-only (it may not be installed — just write the component structure and import, we'll install dependencies separately).

## Task 4.2: Image Editor Screen (NEW)
**File:** `app/(screens)/image-editor.tsx` (CREATE NEW)

Post-capture image editing:
1. **Image preview** — full-width image with aspect ratio maintained.
2. **Crop controls** — aspect ratio buttons: "Free", "1:1", "4:5", "16:9". Show crop frame overlay with draggable corners (visual only — actual crop can be simulated with style transforms).
3. **Filter strip** — horizontal scroll of filter previews (10 filters): Normal, Warm, Cool, Vivid, Noir, Emerald, Gold, Fade, Sharp, Dreamy. Each: 60x60 circle with tinted preview.
4. **Adjust sliders** — brightness, contrast, saturation. Each: label + horizontal slider bar. Slider thumb: emerald circle.
5. **Bottom toolbar** — Crop / Filter / Adjust tab icons. Active: emerald.
6. **Done/Cancel** — GlassHeader with X (cancel) and checkmark (done, emerald).

## Task 4.3: Audio Library Screen (NEW)
**File:** `app/(screens)/audio-library.tsx` (CREATE NEW)

Music/sound browser for reels:
1. **Search bar** — same styled search as Task 1.4 (rounded, icon, clear button)
2. **Categories** — horizontal pills: "Trending", "Islamic", "Nasheeds", "Lo-fi", "Acoustic", "Hip Hop", "Pop"
3. **Audio cards** — each audio: waveform preview (5-8 thin bars at varying heights), title, artist, duration, use count. Play button: emerald circle with play icon.
4. **Currently playing** — sticky bottom bar when previewing: waveform animation, track info, "Use this sound" GradientButton.
5. **Favorites tab** — saved audio tracks with heart icon.

## Task 4.4: Prayer Times Widget Screen (NEW)
**File:** `app/(screens)/prayer-times.tsx` (CREATE NEW)

Islamic feature — prayer times display:
1. **Current prayer** — large card at top: prayer name (Fajr/Dhuhr/Asr/Maghrib/Isha) + time + countdown to next prayer. Emerald gradient background for current prayer.
2. **All prayers list** — 5 prayer cards with: name, time, icon (sun position). Current prayer highlighted with emerald left border + glow.
3. **Location** — city name at top with map-pin icon. "Change" button.
4. **Compass** — small qibla direction indicator. Arrow icon pointing to Makkah direction. Green: `colors.emerald`.
5. **Settings** — calculation method selector (bottom sheet): "Muslim World League", "ISNA", "Egypt", "Makkah", "Karachi".

Use static placeholder data for times — actual prayer time calculation API will be integrated later. Structure the screen to accept data from an API.

## Task 4.5: Islamic Calendar Screen (NEW)
**File:** `app/(screens)/islamic-calendar.tsx` (CREATE NEW)

Hijri calendar display:
1. **Current date** — large card: Hijri date (e.g., "15 Ramadan 1447") in Arabic-style font + Gregorian equivalent below. Emerald accent.
2. **Month grid** — 7-column calendar grid. Current day: emerald circle. Important dates: gold dot below (Eid, Ramadan start, etc.).
3. **Events list** — below calendar: upcoming Islamic events. Each: date + event name + description. Important events: `borderLeftWidth:3, borderLeftColor:colors.gold`.
4. **Month navigation** — left/right arrows to change month. Title: Hijri month name in center.

Use static placeholder data — actual Hijri conversion will come later.

## Task 4.6: Communities Screen (NEW)
**File:** `app/(screens)/communities.tsx` (CREATE NEW)

Discord-like communities:
1. **Community cards** — vertical scroll of community cards. Each: banner image (aspect 3:1) + community icon (overlapping) + name + member count + description (2 lines). Style: `bg:colors.dark.bgCard, borderRadius:radius.lg, overflow:'hidden', marginBottom:spacing.md`.
2. **Categories** — horizontal pills: "All", "Islamic", "Tech", "Sports", "Art", "Food", "Local"
3. **Create community** — FAB (floating action button): emerald gradient circle, bottom-right, + icon.
4. **My communities tab** — TabSelector: "Discover" / "Joined". Joined shows community list with unread badge.
5. **Search** — search bar at top, same pattern as other search bars.

## Task 4.7: Quran Share Screen (NEW)
**File:** `app/(screens)/quran-share.tsx` (CREATE NEW)

Share Quran verses as posts/stories:
1. **Verse card** — centered Arabic text in decorative frame. Background: gradient `colors.dark.bgCard` to `colors.dark.bg`. Arabic: `fontSize:fontSize['2xl'], textAlign:'center', lineHeight:44`. Translation below in `fontSize.base`.
2. **Surah selector** — bottom sheet with list of 114 surahs. Search bar at top. Each row: surah number + Arabic name + English name + verse count.
3. **Verse navigation** — left/right arrows to browse verses within surah.
4. **Share options** — "Share as Post", "Share as Story", "Copy Text", "Share Image". Each as a BottomSheetItem.
5. **Decorative border** — ornamental Islamic geometric pattern border around the verse card. Use a simple repeated diamond/star pattern with `colors.gold` at low opacity.

---

# STAGE 5: Micro-Interactions & Final Polish (7 tasks)
**Focus:** Animations, transitions, empty states, loading states, edge cases across entire app

## Task 5.1: Global Entrance Animations
**Files:** `src/components/saf/PostCard.tsx`, `src/components/majlis/ThreadCard.tsx`

1. **PostCard entrance** — on mount, card fades in (0→1) + slides up 6px. Use `useAnimatedStyle` with `withTiming`. Stagger not needed (FlashList handles recycling).
2. **ThreadCard entrance** — same fade+slide pattern.
3. **Double-tap heart** — in PostCard, the existing heart animation: ensure the floating hearts burst is 5-8 particles, each with random X offset and Y drift. Scale from 0→1→0 over 800ms.

## Task 5.2: Loading State Upgrades
**Files:** `app/(screens)/saved.tsx`, `app/(screens)/archive.tsx`

### saved.tsx:
1. **Tab loading** — when switching tabs, show Skeleton placeholders specific to content type: Skeleton.PostCard for posts, Skeleton.ThreadCard for threads, grid Skeleton.Rect for reels/videos.
2. **Grid skeleton** — for reels/videos tab: 3-column grid of Skeleton.Rect matching grid item dimensions.

### archive.tsx:
1. **Loading skeleton** — show archive-specific skeletons: Skeleton.Rect grids matching the archive content layout.
2. **Empty state per tab** — each archive tab (Posts/Stories/Reels) gets a specific EmptyState with different icon and message.

## Task 5.3: Call Screen Premium
**File:** `app/(screens)/call/[id].tsx`

Read the file first. Then:
1. **Calling animation** — when ringing: concentric circles pulse outward from avatar. 3 circles, staggered, fade out at edges. Use `withRepeat(withSequence(withTiming, withTiming))` for each ring.
2. **Connected state** — timer font: monospace, `fontSize:fontSize.xl`. Background: subtle animated gradient that slowly shifts between `colors.dark.bg` and `colors.dark.bgElevated`.
3. **Button hover states** — control buttons: active (muted/speaker on) get `bg:colors.active.emerald20`. Press: scale 0.9→1 spring.
4. **End call animation** — on end: avatar shrinks + fades, timer text fades, buttons slide down. Then navigate back.

## Task 5.4: Circles & Close Friends Polish
**Files:** `app/(screens)/circles.tsx`, `app/(screens)/close-friends.tsx`

### circles.tsx:
1. **Circle cards** — instead of plain rows, show as cards: `bg:colors.dark.bgCard, borderRadius:radius.lg, padding:spacing.base, marginBottom:spacing.sm`. Emoji in large size (32px) with tinted background circle.
2. **Member preview** — show up to 3 small avatars (stacked, `marginLeft:-6`) next to member count.
3. **Create animation** — circle emoji picker: selected emoji gets a bounce animation. New circle card slides in from bottom.

### close-friends.tsx:
1. **Toggle animation** — friend toggle: emerald highlight slides in/out with spring. Star icon: `colors.gold` when selected.
2. **Count badge** — "N close friends" at top with emerald badge pill.

## Task 5.5: Followers & Following Polish
**Files:** `app/(screens)/followers/[userId].tsx`, `app/(screens)/following/[userId].tsx`

Both files are ~177 lines. Read them first. Then:
1. **User cards** — each user: `bg:colors.dark.bgCard, borderRadius:radius.lg, padding:spacing.md, marginBottom:spacing.xs`. Avatar + name + username + bio (1 line) + follow/unfollow button.
2. **Mutual badge** — if mutual follower: small "Mutual" badge: `bg:colors.active.emerald10, borderRadius:radius.sm, paddingHorizontal:4`. Text: `fontSize:9, color:colors.emerald`.
3. **Follow button** — Following: `bg:colors.dark.bgElevated, borderWidth:1, borderColor:colors.dark.border`. Follow: emerald gradient.
4. **Search bar** — add search/filter at top to search within followers/following.

## Task 5.6: Bookmark & Playlist Polish
**Files:** `app/(screens)/bookmark-collections.tsx`, `app/(screens)/create-playlist.tsx`, `app/(screens)/save-to-playlist.tsx`

Read all files first. Then:

### bookmark-collections.tsx:
1. **Collection cards** — each collection: show 4-image grid thumbnail preview (like Instagram collection covers). Title overlay at bottom with gradient.
2. **Create collection** — button with dashed border + plus icon, animates with scale spring.

### create-playlist.tsx:
1. **Thumbnail preview** — show playlist cover: first video thumbnail as background with gradient overlay + playlist icon.
2. **Visibility toggle** — Public/Private as visual toggle cards (not just text buttons).

### save-to-playlist.tsx:
1. **Playlist rows** — each: thumbnail (small square) + title + video count + check/plus icon. Selected: emerald checkmark.

## Task 5.7: Miscellaneous Screen Polish
**Files:** `app/(screens)/qr-code.tsx`, `app/(screens)/share-profile.tsx`, `app/(screens)/blocked.tsx`, `app/(screens)/muted.tsx`

### qr-code.tsx:
1. **QR card** — center the QR code in a decorative card: `bg:colors.dark.bgCard, borderRadius:radius.xl, padding:spacing.xl, ...shadow.lg`. Add emerald accent border at top.
2. **Username below QR** — `@username` + "Scan to follow" text. Brand logo small at bottom.

### share-profile.tsx:
1. **Profile card preview** — show a mini profile card (avatar + name + bio + stats) as it would appear when shared. Beautiful card with gradient border.
2. **Share options grid** — 2x2 grid of share options (Copy Link, QR Code, Share Card, More). Each: icon in circle + label below.

### blocked.tsx & muted.tsx:
1. **User cards** — same card style as followers (Task 5.5). Unblock/unmute button: `bg:colors.dark.bgElevated, borderWidth:1, borderColor:colors.dark.border`.
2. **Empty states** — custom EmptyState messages: "No blocked users" / "No muted accounts — your feed is unfiltered".

---

## POST-COMPLETION CHECKLIST

After all 5 stages are done, verify across the entire codebase:
```bash
# From apps/mobile/
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l  # Target: 0 new errors
grep -rn "as any" app/ src/ --include="*.tsx" --include="*.ts" | grep -v spec | wc -l  # Target: 0
grep -rn "borderRadius: [0-9][0-9]" app/ src/ --include="*.tsx" | grep -v "radius\." | grep -v "borderRadius: [0-5]" | wc -l  # Target: 0
```

Then final commit:
```bash
git add -A && git commit -m "feat: mega batch 28 complete — visual mastery across all screens + 5 new screens"
```
