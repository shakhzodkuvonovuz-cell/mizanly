# Design Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Mizanly from AI-generated generic aesthetics to a distinctive, premium "Islamic Digital Luxury" feel using existing brand tokens.

**Architecture:** Component-level refinements using existing theme system — layered depth, glassmorphism, tuned spring animations, and intentional spacing. No new dependencies, no new design tokens.

**Tech Stack:** React Native (Expo SDK 52), Reanimated 3, React Native Gesture Handler, existing theme system at `apps/mobile/src/theme/index.ts`

---

## Task 1: Enhanced Skeleton Component

**Files:**
- Modify: `apps/mobile/src/components/ui/Skeleton.tsx`

**Step 1: Read current Skeleton implementation**

```bash
cat apps/mobile/src/components/ui/Skeleton.tsx
```

**Step 2: Replace shimmer with brand colors**

Locate the shimmer animation and change colors from gray to emerald-tinted:

```typescript
// In Skeleton shimmer animation, replace:
// FROM:
backgroundColor: ['#2D3548', '#374151', '#2D3548']

// TO:
backgroundColor: [colors.dark.surface, 'rgba(10, 123, 79, 0.15)', colors.dark.surface]
```

**Step 3: Test in simulator**

Navigate to any feed, verify shimmer appears emerald-tinted not gray.

**Step 4: Commit**

```bash
git add apps/mobile/src/components/ui/Skeleton.tsx
git commit -m "design: emerald-tinted shimmer animation for brand presence"
```

---

## Task 2: PostCard Layered Redesign

**Files:**
- Modify: `apps/mobile/src/components/saf/PostCard.tsx`

**Step 1: Read current PostCard**

```bash
head -100 apps/mobile/src/components/saf/PostCard.tsx
```

**Step 2: Update card container styles**

Find `styles.card` (around line 396) and replace:

```typescript
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.dark.bgElevated, // Changed from bgCard
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    marginHorizontal: 0,
    borderWidth: 1, // Added
    borderColor: colors.dark.borderLight, // Added
    overflow: 'hidden',
    ...shadow.sm, // Added
  },
  // ... rest
```

**Step 3: Reorganize action layout**

Find `styles.actions` (around line 445) and update:

```typescript
actions: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: spacing.base,
  paddingVertical: spacing.md,
  gap: spacing.xl,
},
spacer: { flex: 1 }, // Already exists, verify it's used
```

In the JSX (around line 295), verify actions order is:
- Like button
- Comment button
- Share button
- `<View style={styles.spacer} />`
- Bookmark button

**Step 4: Add caption expansion**

In the caption section (around line 242), add state and expand logic:

```typescript
const [captionExpanded, setCaptionExpanded] = useState(false);
const needsExpansion = (post.content?.length ?? 0) > 120;

// In JSX, replace caption section:
{post.content ? (
  <Pressable onPress={() => needsExpansion && setCaptionExpanded(!captionExpanded)}>
    <RichText
      text={post.content}
      style={styles.content}
      numberOfLines={captionExpanded ? undefined : 3}
      onPostPress={() => router.push(`/(screens)/post/${post.id}`)}
    />
    {needsExpansion && (
      <Text style={styles.moreText}>
        {captionExpanded ? 'less' : 'more'}
      </Text>
    )}
  </Pressable>
) : null}
```

Add style:
```typescript
moreText: {
  color: colors.text.secondary,
  fontSize: fontSize.sm,
  fontWeight: '600',
  paddingHorizontal: spacing.base,
  marginTop: 2,
},
```

**Step 5: Test in simulator**

- Verify card has subtle border and shadow
- Verify actions are grouped left/right with spacer
- Verify long captions show "more" and expand on tap

**Step 6: Commit**

```bash
git add apps/mobile/src/components/saf/PostCard.tsx
git commit -m "design: layered PostCard with border, shadow, and inline caption expand"
```

---

## Task 3: Profile Header Depth Redesign

**Files:**
- Modify: `apps/mobile/app/(screens)/profile/[username].tsx`

**Step 1: Read profile header section**

```bash
grep -n "StatItem\|cover\|avatar" apps/mobile/app/(screens)/profile/\[username\].tsx | head -30
```

**Step 2: Update avatar positioning**

Find the avatar container (after cover image) and add negative margin:

```typescript
// In the header section, wrap avatar with:
<View style={{ marginTop: -24, marginLeft: spacing.base }}>
  <Avatar uri={profile.avatarUrl} ... size="xl" />
</View>
```

**Step 3: Update cover gradient**

Find cover image section and add glass-like gradient overlay:

```typescript
<View style={styles.coverContainer}>
  <Image source={{ uri: profile.coverUrl }} style={styles.coverImage} />
  <LinearGradient
    colors={['transparent', 'rgba(13,17,23,0.4)', 'rgba(13,17,23,0.85)']}
    locations={[0.3, 0.7, 1]}
    style={styles.coverGradient}
  />
</View>
```

Add styles:
```typescript
coverContainer: {
  height: 200,
  position: 'relative',
},
coverImage: {
  width: '100%',
  height: '100%',
},
coverGradient: {
  ...StyleSheet.absoluteFillObject,
},
```

**Step 4: Convert stats to pressable pills**

Find `StatItem` component and restyle:

```typescript
function StatItem({ num, label, onPress }: { num: number; label: string; onPress?: () => void }) {
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.95 });
  return (
    <Animated.View style={[animatedStyle]}>
      <Pressable
        style={[styles.statPill, onPress && styles.statPillPressable]}
        onPress={onPress}
        onPressIn={onPress ? onPressIn : undefined}
        onPressOut={onPress ? onPressOut : undefined}
        disabled={!onPress}
      >
        <Text style={styles.statNum}>{num}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}
```

Add styles:
```typescript
statPill: {
  alignItems: 'center',
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderRadius: radius.md,
},
statPillPressable: {
  backgroundColor: colors.active.emerald10,
},
statNum: {
  color: colors.text.primary,
  fontSize: fontSize.lg,
  fontWeight: '700',
},
statLabel: {
  color: colors.text.secondary,
  fontSize: fontSize.xs,
  marginTop: 2,
},
```

**Step 5: Update action buttons**

Find `FollowButton` and update variants:

```typescript
function FollowButton({ isFollowing, isPending, onPress }: FollowButtonProps) {
  if (isFollowing) {
    return (
      <GradientButton
        label="Following"
        onPress={onPress}
        variant="secondary" // Has border, no fill
        size="sm"
        icon="check"
        disabled={isPending}
        loading={isPending}
      />
    );
  }
  return (
    <GradientButton
      label="Follow"
      onPress={onPress}
      variant="primary" // Emerald fill
      size="sm"
      disabled={isPending}
      loading={isPending}
    />
  );
}
```

**Step 6: Test in simulator**

- Verify avatar overlaps cover edge
- Verify gradient overlay on cover
- Verify stats are pressable pills with emerald highlight
- Verify Follow button has proper primary/secondary styling

**Step 7: Commit**

```bash
git add apps/mobile/app/(screens)/profile/\[username\].tsx
git commit -m "design: profile header with depth, overlapping avatar, stat pills"
```

---

## Task 4: Risalah Conversation Row Polish

**Files:**
- Modify: `apps/mobile/app/(tabs)/risalah.tsx`

**Step 1: Read ConversationRow component**

```bash
grep -n "ConversationRow\|styles.chatItem\|hasUnread" apps/mobile/app/(tabs)/risalah.tsx | head -30
```

**Step 2: Add unread indicator styling**

Find `styles.chatItem` and add:

```typescript
chatItem: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: spacing.base,
  paddingVertical: spacing.md,
  backgroundColor: colors.dark.bgCard,
  gap: spacing.sm,
  // No border by default
},
chatItemUnread: {
  borderLeftWidth: 3,
  borderLeftColor: colors.emerald,
  backgroundColor: colors.active.emerald10,
},
```

**Step 3: Update text styles for unread state**

```typescript
chatName: {
  color: colors.text.primary,
  fontSize: fontSize.base,
  fontWeight: '500',
},
chatNameUnread: {
  fontWeight: '700', // Bold for unread
},
chatPreview: {
  color: colors.text.tertiary,
  fontSize: fontSize.sm,
  marginTop: 2,
},
chatPreviewUnread: {
  color: colors.text.secondary, // Slightly brighter for unread
},
chatTime: {
  color: colors.text.tertiary,
  fontSize: fontSize.xs,
},
chatTimeUnread: {
  color: colors.emerald, // Emerald timestamp for unread
  fontWeight: '600',
},
```

**Step 4: Verify press animation exists**

Ensure `AnimatedPressable` is used with scale animation (should already exist):

```typescript
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// In ConversationRow:
const scale = useSharedValue(1);
const animStyle = useAnimatedStyle(() => ({
  transform: [{ scale: scale.value }],
}));

return (
  <AnimatedPressable
    style={[styles.chatItem, hasUnread && styles.chatItemUnread, animStyle]}
    onPressIn={() => { scale.value = withSpring(0.98, animation.spring.snappy); }}
    onPressOut={() => { scale.value = withSpring(1, animation.spring.snappy); }}
    // ...
  >
```

**Step 5: Test in simulator**

- Verify unread conversations have emerald left border
- Verify unread names are bold
- Verify press scales the row slightly

**Step 6: Commit**

```bash
git add apps/mobile/app/(tabs)/risalah.tsx
git commit -m "design: conversation rows with unread indicators and press feedback"
```

---

## Task 5: Tab Bar Brand Personality

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

**Step 1: Read current tab bar**

```bash
cat apps/mobile/app/(tabs)/_layout.tsx
```

**Step 2: Update tab bar styling**

Find `screenOptions` and update:

```typescript
screenOptions={({ route }) => ({
  tabBarStyle: {
    height: 83,
    backgroundColor: colors.dark.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.dark.borderLight,
    paddingBottom: 28, // Safe area handled
  },
  tabBarActiveTintColor: colors.emerald,
  tabBarInactiveTintColor: colors.text.tertiary,
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '500',
  },
})}
```

**Step 3: Add active background pill (requires custom tab bar)**

For the full pill effect, create a custom tab button component. In the same file, add above the default export:

```typescript
function TabBarIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={[
      styles.tabIconContainer,
      focused && styles.tabIconContainerActive
    ]}>
      <Icon
        name={name}
        size="md"
        color={focused ? colors.emerald : colors.text.tertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  tabIconContainerActive: {
    backgroundColor: colors.active.emerald10,
  },
});
```

**Step 4: Update each tab to use custom icon**

```typescript
<Tabs.Screen
  name="saf"
  options={{
    title: 'Saf',
    tabBarIcon: ({ focused }) => <TabBarIcon name="home" focused={focused} />,
  }}
/>
// Repeat for majlis, bakra, risalah
```

**Step 5: Style the Create tab button (center)**

```typescript
<Tabs.Screen
  name="create"
  options={{
    title: '',
    tabBarIcon: ({ focused }) => (
      <View style={styles.createButton}>
        <Icon name="plus" size="md" color="#fff" />
      </View>
    ),
  }}
/>

// Add to styles:
createButton: {
  width: 56,
  height: 56,
  borderRadius: 28,
  backgroundColor: colors.gold,
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: -16,
  ...shadow.glow,
},
```

**Step 6: Test in simulator**

- Verify active tabs have emerald pill background
- Verify Create button is gold with glow
- Verify inactive tabs are tertiary color

**Step 7: Commit**

```bash
git add apps/mobile/app/(tabs)/_layout.tsx
git commit -m "design: tab bar with emerald pill active state and gold create button"
```

---

## Task 6: Bakra Reel Edge Branding

**Files:**
- Modify: `apps/mobile/app/(tabs)/bakra.tsx`

**Step 1: Read gradient section**

```bash
grep -n "LinearGradient\|colors=" apps/mobile/app/(tabs)/bakra.tsx | head -20
```

**Step 2: Update edge gradients with brand tint**

Find gradient definitions and add emerald tint:

```typescript
<LinearGradient
  colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(10,123,79,0.1)', 'rgba(0,0,0,0.85)']}
  locations={[0, 0.4, 0.7, 1]}
  style={styles.bottomGradient}
/>
```

**Step 3: Update action buttons**

Find action button section and add press glow:

```typescript
// In the action button press handler or component:
const [pressedId, setPressedId] = useState<string | null>(null);

// In button render:
<Pressable
  style={[
    styles.actionButton,
    pressedId === 'like' && styles.actionButtonPressed,
  ]}
  onPressIn={() => setPressedId('like')}
  onPressOut={() => setPressedId(null)}
  onPress={handleLike}
>
  <Icon name="heart" color={isLiked ? colors.like : '#fff'} />
</Pressable>

// Add styles:
actionButton: {
  padding: spacing.sm,
  borderRadius: radius.full,
},
actionButtonPressed: {
  backgroundColor: colors.active.gold10,
},
```

**Step 4: Update progress bar**

Find progress bar and add glow:

```typescript
<View style={styles.progressContainer}>
  <View style={[styles.progressBar, { width: `${progress}%` }]} />
</View>

// Add styles:
progressContainer: {
  height: 2,
  backgroundColor: 'rgba(255,255,255,0.2)',
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
},
progressBar: {
  height: '100%',
  backgroundColor: colors.emerald,
  shadowColor: colors.gold,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.8,
  shadowRadius: 4,
},
```

**Step 5: Test in simulator**

- Verify bottom gradient has subtle emerald tint
- Verify action buttons glow gold on press
- Verify progress bar has emerald color with gold glow

**Step 6: Commit**

```bash
git add apps/mobile/app/(tabs)/bakra.tsx
git commit -m "design: bakra reels with brand-tinted gradients and glowing progress bar"
```

---

## Task 7: Pull-to-Refresh Branding

**Files:**
- Modify: `apps/mobile/app/(tabs)/saf.tsx` and other tab screens with refresh

**Step 1: Find RefreshControl usage**

```bash
grep -rn "RefreshControl" apps/mobile/app/(tabs)/ | head -20
```

**Step 2: Update each occurrence**

In each tab file, find `RefreshControl` and update:

```typescript
<RefreshControl
  refreshing={refreshing}
  onRefresh={onRefresh}
  tintColor={colors.emerald}
  colors={[colors.emerald]} // Android
/>
```

**Step 3: Test in simulator**

- Pull down on each feed
- Verify spinner is emerald instead of default gray

**Step 4: Commit**

```bash
git add apps/mobile/app/(tabs)/
git commit -m "design: emerald-tinted pull-to-refresh across all feeds"
```

---

## Verification Checklist

- [ ] Skeleton shimmer has emerald tint (not gray)
- [ ] PostCard has border, shadow, inline caption expand
- [ ] Profile header has overlapping avatar, gradient cover, stat pills
- [ ] Risalah rows have unread border, bold names, press feedback
- [ ] Tab bar has emerald pill active state, gold create button
- [ ] Bakra has brand-tinted gradients, glowing progress bar
- [ ] Pull-to-refresh spinner is emerald

---

## Final Commit (if all pass)

```bash
git log --oneline -10
```

Verify 7 commits exist, then:

```bash
git push origin HEAD
```
