# BATCH 27: Visual Excellence II — The Screens Kimi Missed + New Polish

**Date:** 2026-03-12
**Theme:** Premium visual polish. Batch 26 tasks 1-5 were lost (only task 6 persisted). This batch re-does them with refined instructions plus new work.
**Task Count:** 7
**Model:** Kimi K2.5

---

## MANDATORY RULES FOR ALL TASKS

1. Read `CLAUDE.md` in project root FIRST — it contains mandatory code quality rules
2. Find YOUR section below by "## Task N:" — execute ONLY that section
3. Do NOT touch any file not listed in your section
4. `<BottomSheet>` never RN Modal | `<Skeleton>` never ActivityIndicator for content | `<EmptyState>` never bare text | `<Icon>` never emoji text | `radius.*` never hardcoded >= 6
5. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
6. All FlatLists MUST have `<RefreshControl tintColor={colors.emerald} />`
7. Import ALL design tokens from `@/theme` — never hardcode colors, spacing, radius, animation
8. Use `expo-linear-gradient` for all gradients
9. Use `react-native-reanimated` for animations — use `animation.spring.*` presets from theme
10. When done, list every file you created or modified

### Design Token Quick Reference
```
colors.emerald=#0A7B4F  colors.emeraldLight=#0D9B63  colors.emeraldDark=#066B42
colors.gold=#C8963E  colors.dark.bg=#0D1117  colors.dark.bgCard=#1C2333
colors.dark.bgElevated=#161B22  colors.dark.bgSheet=#21283B  colors.dark.border=#30363D
colors.text.primary=#FFF  colors.text.secondary=#8B949E  colors.text.tertiary=#6E7781
colors.active.emerald10=rgba(10,123,79,0.1)  colors.active.emerald20=rgba(10,123,79,0.2)
spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
radius: sm=6 md=10 lg=16 xl=24 full=9999
animation.spring: bouncy{D10,S400} snappy{D12,S350} responsive{D14,S170} gentle{D20,S100}
```

---

## CONFLICT MAP — 7 TASKS

| Task | Exclusive Files |
|------|----------------|
| 1 | `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx` |
| 2 | `app/onboarding/username.tsx`, `app/onboarding/profile.tsx` |
| 3 | `app/(screens)/notifications.tsx` |
| 4 | `app/(screens)/profile/[username].tsx` |
| 5 | `app/(tabs)/bakra.tsx`, `src/components/bakra/CommentsSheet.tsx` |
| 6 | `app/(screens)/conversation/[id].tsx` |
| 7 | `app/(screens)/create-story.tsx`, `app/(screens)/story-viewer.tsx` |

---

## Task 1: Auth Screens — First Impression

**Files:** `app/(auth)/sign-in.tsx` (128 lines), `app/(auth)/sign-up.tsx` (188 lines)

These are the FIRST screens users see. Currently: plain logo text + 2 inputs + button. No animation, no atmosphere.

### sign-in.tsx — Current structure:
- Lines 48-52: Logo section (`<Text style={styles.logo}>Mizanly</Text>`, Arabic text, tagline)
- Lines 55-78: Form (email TextInput, password TextInput)
- Lines 82-88: GradientButton "Sign In"
- Lines 92-97: Footer link to sign-up

### Add to sign-in.tsx:

**A) Animated logo entrance.** Import `Animated, useSharedValue, useAnimatedStyle, withSpring, withTiming` from reanimated. On mount, logo scales from 0.85→1 and fades from 0→1:
```tsx
const logoScale = useSharedValue(0.85);
const logoOpacity = useSharedValue(0);
useEffect(() => {
  logoScale.value = withSpring(1, animation.spring.bouncy);
  logoOpacity.value = withTiming(1, { duration: 600 });
}, []);
const logoAnimStyle = useAnimatedStyle(() => ({
  transform: [{ scale: logoScale.value }],
  opacity: logoOpacity.value,
}));
```
Wrap the `logoSection` View in `<Animated.View style={logoAnimStyle}>`.

**B) Input field icons.** Add icons inside each input. Change inputs to a row wrapper pattern:
```tsx
<View style={[styles.inputRow, emailFocused && styles.inputRowFocused]}>
  <Icon name="mail" size="sm" color={emailFocused ? colors.emerald : colors.text.tertiary} />
  <TextInput style={styles.inputInner} ... />
</View>
```
Style `inputRow`: same as current `input` but add `flexDirection: 'row', alignItems: 'center', gap: spacing.sm`. `inputInner`: `flex: 1, color: colors.text.primary, fontSize: fontSize.base` (no background/border — the row has it).

**C) Focus glow.** `inputRowFocused`: add `borderColor: colors.emerald, shadowColor: colors.emerald, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }`.

**D) Decorative gradient circle** behind logo. Before the logo section, add:
```tsx
<View style={styles.bgGlow}>
  <LinearGradient
    colors={[colors.active.emerald20, 'transparent']}
    style={{ width: 250, height: 250, borderRadius: radius.full }}
    start={{ x: 0.5, y: 0.5 }}
    end={{ x: 1, y: 1 }}
  />
</View>
```
Style `bgGlow`: `position: 'absolute', top: '15%', alignSelf: 'center', opacity: 0.5`.

**E) Social auth placeholder row.** Between the GradientButton and footer, add:
```tsx
<View style={styles.dividerRow}>
  <View style={styles.dividerLine} />
  <Text style={styles.dividerText}>or</Text>
  <View style={styles.dividerLine} />
</View>
<View style={styles.socialRow}>
  <Pressable style={styles.socialBtn}>
    <Icon name="globe" size="sm" color={colors.text.primary} />
    <Text style={styles.socialText}>Google</Text>
  </Pressable>
  <Pressable style={styles.socialBtn}>
    <Icon name="lock" size="sm" color={colors.text.primary} />
    <Text style={styles.socialText}>Apple</Text>
  </Pressable>
</View>
```
Styles: `dividerRow: flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg`, `dividerLine: flex: 1, height: 0.5, backgroundColor: colors.dark.border`, `dividerText: color: colors.text.tertiary, fontSize: fontSize.xs`, `socialRow: flexDirection: 'row', gap: spacing.md, marginTop: spacing.md`, `socialBtn: flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.dark.bgElevated, borderRadius: radius.md, paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.dark.border`.

### sign-up.tsx — add the same patterns:
- Same animated logo entrance (wrap `logoSection`)
- Same input icons (mail + lock) with focus glow
- Same decorative gradient behind logo
- Same social auth row between button and footer

**Plus — password strength indicator.** Below the password input, add 4 small bars:
```tsx
const strength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 8 ? 2 : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4 : 3;
// ...
<View style={styles.strengthRow}>
  {[1,2,3,4].map(i => (
    <View key={i} style={[styles.strengthBar, i <= strength && {
      backgroundColor: strength <= 1 ? colors.error : strength <= 2 ? colors.warning : colors.emerald
    }]} />
  ))}
</View>
```
Style: `strengthRow: flexDirection: 'row', gap: 4, marginTop: spacing.xs`, `strengthBar: flex: 1, height: 3, borderRadius: 1.5, backgroundColor: colors.dark.border`.

**Plus — verification screen polish.** The `pendingVerification` branch (line 60) currently shows a bare TextInput for the 6-digit code. Replace with 6 individual digit boxes:
```tsx
const [digits, setDigits] = useState(['','','','','','']);
const hiddenInputRef = useRef<TextInput>(null);
// Hidden input captures keyboard, distributes to boxes
<Pressable onPress={() => hiddenInputRef.current?.focus()} style={styles.codeRow}>
  {digits.map((d, i) => (
    <View key={i} style={[styles.digitBox, i === code.length && styles.digitBoxActive]}>
      <Text style={styles.digitText}>{code[i] || ''}</Text>
    </View>
  ))}
</Pressable>
<TextInput
  ref={hiddenInputRef}
  style={{ position: 'absolute', opacity: 0 }}
  value={code}
  onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
  keyboardType="number-pad"
  maxLength={6}
  autoFocus
/>
```
Style: `codeRow: flexDirection: 'row', gap: spacing.sm, justifyContent: 'center'`, `digitBox: width: 48, height: 56, borderRadius: radius.md, backgroundColor: colors.dark.bgElevated, borderWidth: 1.5, borderColor: colors.dark.border, alignItems: 'center', justifyContent: 'center'`, `digitBoxActive: borderColor: colors.emerald`, `digitText: color: colors.text.primary, fontSize: 24, fontWeight: '700'`.

Also add an animated envelope icon above "Check your email":
```tsx
<View style={styles.verifyIconWrap}>
  <Icon name="mail" size="xl" color={colors.emerald} />
</View>
```
Style: `verifyIconWrap: width: 72, height: 72, borderRadius: radius.full, backgroundColor: colors.active.emerald10, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: spacing.lg`.

---

## Task 2: Onboarding Flow — Progress & Polish

**Files:** `app/onboarding/username.tsx` (142 lines), `app/onboarding/profile.tsx` (180 lines)

### username.tsx — Current structure:
- Lines 71-75: Progress dots (4 dots, step 1 active)
- Lines 80-93: @username input with debounced check
- Lines 95-99: Status text (checking / available / taken)
- Lines 102-110: Continue button

### Changes to username.tsx:

**A) Replace dots with animated progress bar.** Remove the `{[1,2,3,4].map...}` dots block. Replace with:
```tsx
<View style={styles.progressTrack}>
  <Animated.View style={[styles.progressFill, progressStyle]} />
</View>
```
Add: `const progressWidth = useSharedValue(0); useEffect(() => { progressWidth.value = withSpring(25, animation.spring.responsive); }, []);`
`const progressStyle = useAnimatedStyle(() => ({ width: \`${progressWidth.value}%\` }));`
Styles: `progressTrack: height: 4, borderRadius: 2, backgroundColor: colors.dark.border, marginBottom: spacing['3xl'], overflow: 'hidden'`, `progressFill: height: '100%', borderRadius: 2, backgroundColor: colors.emerald`.

**B) Availability animation.** Replace the `{checking && <Skeleton.Circle size={20} />}` and the status row with richer feedback:
- Checking: spinning loader icon `<Animated.View style={spinStyle}><Icon name="loader" size="sm" color={colors.text.secondary} /></Animated.View>` (use `withRepeat(withTiming(1, {duration: 800}), -1)` for rotation)
- Available: `<Icon name="check-circle" size="sm" color={colors.emerald} />` with a scale bounce
- Taken: `<Icon name="x" size="sm" color={colors.error} />`

**C) Username preview card.** Below the status row, when `available === true`:
```tsx
{available === true && (
  <Animated.View style={[styles.previewCard, previewFadeStyle]}>
    <Text style={styles.previewText}>@{username} · Mizanly</Text>
  </Animated.View>
)}
```
Style: `previewCard: backgroundColor: colors.dark.bgCard, borderRadius: radius.md, paddingHorizontal: spacing.base, paddingVertical: spacing.sm, marginTop: spacing.md, borderWidth: 0.5, borderColor: colors.dark.borderLight`, `previewText: color: colors.text.secondary, fontSize: fontSize.sm`.

### profile.tsx — Current structure:
- Lines 52-56: Progress dots (step 2)
- Lines 62-74: Avatar (Clerk image or placeholder with initial)
- Lines 80-92: Display name input
- Lines 95-107: Bio input with CharCountRing

### Changes to profile.tsx:

**A) Same animated progress bar** as username.tsx but at 50% width.

**B) Avatar placeholder animation.** The current placeholder has dashed border (good). Add a subtle pulse:
```tsx
const pulseScale = useSharedValue(1);
useEffect(() => {
  if (!user?.imageUrl) {
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.05, { duration: 1200 }), withTiming(1, { duration: 1200 })),
      -1, true
    );
  }
}, []);
const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulseScale.value }] }));
```
Wrap the avatar placeholder in `<Animated.View style={pulseStyle}>`. Add a camera icon inside:
```tsx
<Icon name="camera" size="lg" color={colors.text.tertiary} />
<Text style={styles.avatarHintInner}>Add photo</Text>
```
Replace the single initial with the icon + text.

**C) Input focus glow.** Same pattern as Task 1 — when display name or bio input is focused, add emerald border + shadow glow.

**D) Name input icon.** Add `<Icon name="user" size="sm" />` prefix to the display name input (same row pattern as Task 1 sign-in inputs).

---

## Task 3: Notifications — Grouped & Animated

**File:** `app/(screens)/notifications.tsx` (352 lines)

### Current structure:
- Lines 22-66: Helper functions (notificationLabel, notificationIcon, notificationTarget)
- Lines 68-109: FollowRequestActions component
- Lines 111-181: NotificationRow component (avatar + icon overlay + text + time)
- Lines 192-304: Main screen (GlassHeader + TabSelector + FlatList)
- Styles at bottom

### Changes:

**A) Date section headers.** Replace `<FlatList>` with `<SectionList>`. Process notifications into sections:
```tsx
function groupByDate(items: Notification[]): { title: string; data: Notification[] }[] {
  const today: Notification[] = [];
  const yesterday: Notification[] = [];
  const thisWeek: Notification[] = [];
  const earlier: Notification[] = [];
  const now = new Date();
  items.forEach(n => {
    const d = new Date(n.createdAt);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) today.push(n);
    else if (diffDays === 1) yesterday.push(n);
    else if (diffDays < 7) thisWeek.push(n);
    else earlier.push(n);
  });
  return [
    today.length > 0 && { title: 'Today', data: today },
    yesterday.length > 0 && { title: 'Yesterday', data: yesterday },
    thisWeek.length > 0 && { title: 'This Week', data: thisWeek },
    earlier.length > 0 && { title: 'Earlier', data: earlier },
  ].filter(Boolean) as { title: string; data: Notification[] }[];
}
```
Section header: `<Text style={styles.sectionHeader}>{section.title}</Text>`.
Style: `sectionHeader: color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '700', paddingHorizontal: spacing.base, paddingTop: spacing.lg, paddingBottom: spacing.xs, backgroundColor: colors.dark.bg`.

**B) Like aggregation.** Before grouping, aggregate consecutive LIKE notifications for the same postId:
```tsx
function aggregateLikes(items: Notification[]): Notification[] {
  const result: Notification[] = [];
  let i = 0;
  while (i < items.length) {
    if (items[i].type === 'LIKE' && items[i].postId) {
      const postId = items[i].postId;
      const group = [items[i]];
      while (i + 1 < items.length && items[i + 1].type === 'LIKE' && items[i + 1].postId === postId) {
        group.push(items[++i]);
      }
      if (group.length > 1) {
        result.push({ ...group[0], _aggregatedActors: group.map(g => g.actor), _aggregatedCount: group.length } as any);
      } else {
        result.push(group[0]);
      }
    } else {
      result.push(items[i]);
    }
    i++;
  }
  return result;
}
```
In NotificationRow, detect `_aggregatedActors` and show stacked avatars (up to 3 overlapping with `marginLeft: -8`) + "**Name1**, **Name2** and N others liked your post".

**C) Unread glow enhancement.** Update the `unreadBar` style: increase width to 4, add `shadowColor: colors.emerald, shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 2, height: 0 }`.

**D) Icon overlay size.** Change the icon overlay from `width: 18, height: 18` to `width: 22, height: 22` and icon size from 10 to 12.

**E) Row entrance animation.** In NotificationRow, add:
```tsx
const slideIn = useSharedValue(8);
const fadeIn = useSharedValue(0);
useEffect(() => {
  slideIn.value = withSpring(0, animation.spring.responsive);
  fadeIn.value = withTiming(1, { duration: 300 });
}, []);
const entranceStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: slideIn.value }],
  opacity: fadeIn.value,
}));
```
Wrap the row `<Pressable>` content in `<Animated.View style={entranceStyle}>`.

---

## Task 4: Profile — Depth & Parallax

**File:** `app/(screens)/profile/[username].tsx` (922 lines)

### Current structure:
- Lines 35-37: Constants (SCREEN_W, GRID_ITEM, COVER_HEIGHT = 160)
- Lines 357-371: Cover image or placeholder (`coverPlaceholder` = plain bgElevated)
- Lines 374-424: Avatar row (Avatar 2xl + Edit/Follow buttons)
- Lines 484-513: Story highlights horizontal scroll
- Lines 516-530: Stats row (followers/following/posts with StatItem)

### Changes:

**A) Gradient cover placeholder.** Replace lines 370: `<View style={styles.coverPlaceholder} />` with:
```tsx
<LinearGradient
  colors={[colors.emeraldDark, colors.dark.bgCard, colors.dark.bg]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}
  style={styles.cover}
/>
```
Delete the `coverPlaceholder` style. Reuse the existing `cover` style (which has `height: COVER_HEIGHT, width: '100%'`).

**B) Parallax cover.** The file already imports `useAnimatedScrollHandler, interpolate, Extrapolation`. Add scroll tracking:
```tsx
const scrollY = useSharedValue(0);
const scrollHandler = useAnimatedScrollHandler({
  onScroll: (e) => { scrollY.value = e.contentOffset.y; },
});
const coverAnimStyle = useAnimatedStyle(() => ({
  transform: [
    { translateY: interpolate(scrollY.value, [-100, 0, 200], [50, 0, -100], Extrapolation.CLAMP) },
    { scale: interpolate(scrollY.value, [-100, 0], [1.15, 1], Extrapolation.CLAMP) },
  ],
}));
```
Wrap the cover (both the Image path and the gradient placeholder path) in `<Animated.View style={[{ overflow: 'hidden' }, coverAnimStyle]}>`. Pass `onScroll={scrollHandler}` to the FlatList and make it `<Animated.FlatList>` from reanimated.

**C) Stats card.** Wrap the stats `<View style={styles.stats}>` in a card:
```tsx
<View style={styles.statsCard}>
  {/* existing stats content */}
</View>
```
Style: `statsCard: backgroundColor: colors.dark.bgCard, borderRadius: radius.lg, marginHorizontal: spacing.base, paddingVertical: spacing.md, borderWidth: 0.5, borderColor: colors.dark.borderLight`.

**D) Avatar ring.** Add emerald border to the avatar. Find the `<Avatar uri={profile.avatarUrl} name={profile.displayName} size="2xl" />` on line 375. Wrap it:
```tsx
<View style={styles.avatarRing}>
  <Avatar uri={profile.avatarUrl} name={profile.displayName} size="2xl" />
</View>
```
Style: `avatarRing: borderWidth: 2.5, borderColor: colors.emerald, borderRadius: radius.full, padding: 2, ...shadow.md`.

**E) Highlight ring.** The highlight circles (line 502) currently use `styles.highlightCircle`. Add an emerald gradient ring:
```tsx
<View style={styles.highlightRing}>
  <View style={styles.highlightCircle}>
    {/* existing content */}
  </View>
</View>
```
Style: `highlightRing: borderWidth: 2, borderColor: colors.emerald, borderRadius: radius.full, padding: 2`.

---

## Task 5: Bakra Reels — TikTok Polish

**Files:** `app/(tabs)/bakra.tsx` (722 lines), `src/components/bakra/CommentsSheet.tsx` (325 lines)

### bakra.tsx — Current structure:
- Lines 57-300: ReelItem component (video + gradients + user info + action buttons)
- Lines 264-300: Right action column (like/comment/share buttons)
- Line 165: Audio disc button (spinning vinyl)

### Changes to bakra.tsx:

**A) Bookmark button state.** After the share button (around line 300), there's likely a bookmark button. Find it and ensure it shows filled state:
```tsx
<TouchableOpacity style={styles.actionButton} onPress={() => onBookmark(item)} accessibilityLabel={item.isSaved ? "Remove bookmark" : "Bookmark reel"} accessibilityRole="button">
  <Icon
    name={item.isSaved ? 'bookmark-filled' : 'bookmark'}
    size="lg"
    color={item.isSaved ? colors.gold : colors.text.primary}
    fill={item.isSaved ? colors.gold : undefined}
    style={item.isSaved ? undefined : styles.iconShadow}
  />
  <Text style={styles.actionCount}>{item.savesCount > 0 ? item.savesCount : ''}</Text>
</TouchableOpacity>
```

**B) More menu.** After the bookmark button, add:
```tsx
<TouchableOpacity style={styles.actionButton} onPress={() => onReport(item)} accessibilityLabel="More options" accessibilityRole="button">
  <Icon name="more-horizontal" size="lg" color={colors.text.primary} style={styles.iconShadow} />
</TouchableOpacity>
```

**C) Video progress bar.** Add a thin bar at the very top of each reel. Inside ReelItem, track playback progress:
```tsx
const [progress, setProgress] = useState(0);
// In onPlaybackStatusUpdate callback, add:
if (status.isLoaded && status.durationMillis) {
  runOnJS(setProgress)(status.positionMillis / status.durationMillis);
}
```
At the top of the `<View style={styles.videoContainer}>`, add:
```tsx
<View style={styles.progressTrack}>
  <View style={[styles.progressFill, { width: \`${progress * 100}%\` }]} />
</View>
```
Styles: `progressTrack: position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.15)', zIndex: 20`, `progressFill: height: '100%', backgroundColor: colors.emerald`.

**D) Audio disc glow.** Find the vinyl disc Pressable (around line 150-170). Add shadow to its container style:
```tsx
shadowColor: colors.emerald,
shadowOpacity: 0.3,
shadowRadius: 6,
shadowOffset: { width: 0, height: 0 },
elevation: 4,
```

**E) Action button press animation.** Wrap each action icon in a scale bounce. Add to each `<TouchableOpacity>` action button:
```tsx
const likeScale = useSharedValue(1);
// On press: likeScale.value = withSequence(withSpring(0.75, animation.spring.snappy), withSpring(1, animation.spring.bouncy));
```
Wrap the Icon in `<Animated.View style={likeAnimStyle}>`.

### CommentsSheet.tsx changes:

**A) Comment count in header.** Line 135 shows `<Text style={styles.headerTitle}>Comments</Text>`. Change to:
```tsx
<Text style={styles.headerTitle}>Comments · {reel.commentsCount}</Text>
```

**B) Reply indentation.** If a comment has `item.parentId` or `item.replyToId`, add left border:
```tsx
style={[styles.commentItem, item.parentId && styles.replyComment]}
```
Style: `replyComment: marginLeft: spacing.xl, borderLeftWidth: 2, borderLeftColor: colors.active.emerald20, paddingLeft: spacing.sm`.

**C) Heart bounce on like.** In `handleLikeComment`, add animation:
```tsx
const likeScale = useSharedValue(1);
const handleLikeComment = (commentId: string) => {
  likeScale.value = withSequence(
    withSpring(1.3, animation.spring.snappy),
    withSpring(1, animation.spring.bouncy)
  );
  haptic.light();
};
```
Wrap the heart Icon in `<Animated.View style={likeAnimStyle}>`.

---

## Task 6: Conversation — Chat Premium

**File:** `app/(screens)/conversation/[id].tsx` (1904 lines)

This is a large file. Focus ONLY on these targeted changes. Do not restructure the file.

### Changes:

**A) Sent message gradient bubble.** Find where sent messages are styled (look for `sentBubble` or a condition like `isOwn` / `isSent` / `msg.senderId === userId`). Replace the flat backgroundColor with a LinearGradient:
```tsx
// For sent messages, wrap the bubble View in:
<LinearGradient
  colors={[colors.emerald, colors.emeraldDark]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 1 }}
  style={sentBubbleStyle}
>
  <Text style={styles.messageText}>{msg.content}</Text>
</LinearGradient>
```
Keep received messages as `backgroundColor: colors.dark.bgCard`.

**B) Reply-to preview border.** Find the reply-to preview rendering (search for `replyTo` or `replyToId` in the message bubble). Add a left emerald border:
```tsx
<View style={styles.replyPreview}>
  <View style={styles.replyBorder} />
  <View>
    <Text style={styles.replySender}>{replyMsg.sender.displayName}</Text>
    <Text style={styles.replyContent} numberOfLines={1}>{replyMsg.content}</Text>
  </View>
</View>
```
Styles: `replyPreview: flexDirection: 'row', backgroundColor: colors.dark.bgElevated, borderRadius: radius.sm, padding: spacing.xs, marginBottom: spacing.xs, gap: spacing.xs`, `replyBorder: width: 3, borderRadius: 1.5, backgroundColor: colors.emerald`, `replySender: color: colors.emerald, fontSize: fontSize.xs, fontWeight: '700'`, `replyContent: color: colors.text.secondary, fontSize: fontSize.xs`.

**C) Read receipt icons.** Find where message status/checkmarks are displayed (near timestamp rendering). Replace with:
```tsx
{isOwn && (
  <View style={styles.receiptRow}>
    <Icon
      name={msg.readAt ? 'check-check' : 'check'}
      size={12}
      color={msg.readAt ? colors.emerald : colors.text.tertiary}
    />
  </View>
)}
```
If `check-check` doesn't exist in Icon, use two overlapping `check` icons with `marginLeft: -6`.

**D) Reaction pills.** Find where message reactions are displayed (search for `reactions` or `MessageReaction`). Style each reaction as a pill:
```tsx
<View style={styles.reactionRow}>
  {Object.entries(reactionMap).map(([emoji, users]) => (
    <Pressable
      key={emoji}
      style={[styles.reactionPill, users.includes(currentUserId) && styles.reactionPillOwn]}
    >
      <Text style={styles.reactionEmoji}>{emoji}</Text>
      {users.length > 1 && <Text style={styles.reactionCount}>{users.length}</Text>}
    </Pressable>
  ))}
</View>
```
Styles: `reactionRow: flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4`, `reactionPill: flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.dark.bgElevated, borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 0.5, borderColor: colors.dark.border`, `reactionPillOwn: borderColor: colors.emerald`, `reactionEmoji: fontSize: 14`, `reactionCount: color: colors.text.secondary, fontSize: fontSize.xs`.

---

## Task 7: Stories — Creation & Viewing Polish

**Files:** `app/(screens)/create-story.tsx` (779 lines), `app/(screens)/story-viewer.tsx`

Read both files first to understand current structure.

### create-story.tsx changes:

**A) Tool bar icons.** Find the bottom toolbar (where filter/text/sticker buttons are). Ensure each tool button has:
- Active state: emerald background pill (`backgroundColor: colors.active.emerald20, borderRadius: radius.full`)
- Icon color: `colors.emerald` when active, `colors.text.primary` when inactive
- Label text below icon: `fontSize: fontSize.xs, color: colors.text.secondary`

**B) Filter preview pills.** Find the filter selector (likely a horizontal ScrollView of filter options). Style each filter preview as:
- Small circular thumbnail (40x40) with the filter applied (tint overlay)
- Active filter: emerald border ring (`borderWidth: 2, borderColor: colors.emerald`)
- Filter name below: `fontSize: 10, color: active ? colors.emerald : colors.text.secondary`

**C) Sticker placement hint.** After a sticker is added, show a brief toast: "Drag to move · Pinch to resize" in `colors.text.secondary`, auto-dismiss after 2 seconds. Use `Animated.View` with `withDelay(2000, withTiming(0))` for opacity fade-out.

**D) Background gradient selector.** Find the gradient picker for text-only stories. Ensure each gradient option is:
- 48x48 circle with the gradient colors
- Active: emerald check overlay
- Animation: scale bounce on select

### story-viewer.tsx changes:

**A) Progress bars.** Find the top progress bars (lines showing how many stories, current progress). Ensure:
- Track: `height: 2.5, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.25)'`
- Fill: `backgroundColor: colors.emerald` (not white)
- Smooth animation: `withTiming` for progress fill width

**B) Story author info.** Ensure the top row shows:
- Avatar (with story ring in emerald if has more stories)
- Username in white bold
- Time ago in `rgba(255,255,255,0.7)`
- Close button (X) at top-right with `colors.text.primary`

**C) Reply input.** At the bottom, ensure the reply input has:
- Translucent background: `backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.full`
- Placeholder: "Reply to story..." in `rgba(255,255,255,0.5)`
- Send button: emerald color when text entered

---

## VERIFICATION

After completing your task, verify:
1. No TypeScript errors in your modified files
2. No `as any` in your code
3. All colors from `@/theme` tokens — zero hardcoded hex
4. All `borderRadius >= 6` uses `radius.*`
5. All FlatLists/SectionLists have RefreshControl
6. List every file you modified
