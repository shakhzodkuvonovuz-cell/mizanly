# Conversation Emoji Reaction Picker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full emoji reaction picker UI in the chat screen: (1) Add quick-reaction bar to context menu, (2) Enhance reaction display in MessageBubble to show counts and be tappable to toggle own reaction.

**Architecture:** Modify the existing conversation/[id].tsx file to add quick reactions bar above context menu items and enhance the message reactions display to show counts with toggle functionality.

**Tech Stack:** React Native, TypeScript, Expo, @tanstack/react-query, Zustand store

---

## Task 1: Add Quick Reaction Bar to Context Menu

**Files:**
- Modify: `apps/mobile/app/(screens)/conversation/[id].tsx:1147-1237`

**Step 1: Find the context menu BottomSheet section**

Locate the BottomSheet with `visible={!!contextMenuMsg && !showReactionPicker}` (starts around line 1141). The content currently has BottomSheetItem components for Copy, Reply, Forward, React, Edit, Delete.

**Step 2: Add quick reaction bar before the menu items**

Replace the BottomSheet content with the following code, adding the quick reaction bar at the top:

```tsx
{/* Quick Reaction Bar */}
<View style={styles.quickReactions}>
  {['❤️', '👍', '😂', '😮', '😢', '🤲'].map((emoji) => (
    <Pressable
      key={emoji}
      style={styles.quickReactionBtn}
      onPress={() => {
        if (contextMenuMsg) {
          messagesApi.reactToMessage(id, contextMenuMsg.id, emoji)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['messages', id] });
            })
            .catch(() => {});
        }
        setContextMenuMsg(null);
        haptic.light();
      }}
      accessibilityLabel={`React with ${emoji}`}
      accessibilityRole="button"
    >
      <Text style={styles.quickReactionEmoji}>{emoji}</Text>
    </Pressable>
  ))}
</View>
```

**Step 3: Add the context menu items after the quick reaction bar**

Keep all existing BottomSheetItem components (Copy, Reply, Forward, React, Edit, Delete) exactly as they are, just placed after the quick reaction bar.

**Step 4: Add the required styles**

Add these styles to the `styles` StyleSheet.create object:

```typescript
quickReactions: {
  flexDirection: 'row',
  justifyContent: 'space-around',
  paddingHorizontal: spacing.base,
  paddingVertical: spacing.sm,
  borderBottomWidth: 0.5,
  borderBottomColor: colors.dark.border,
  marginBottom: spacing.xs,
},
quickReactionBtn: {
  width: 44,
  height: 44,
  borderRadius: radius.full,
  backgroundColor: colors.dark.surface,
  alignItems: 'center',
  justifyContent: 'center',
},
quickReactionEmoji: {
  fontSize: 22,
},
```

**Step 5: Verify the UI**

Run the mobile app and test the context menu on a message. The quick reaction bar should appear at the top with 6 emojis including 🤲 (palms up prayer emoji).

---

## Task 2: Enhance MessageBubble Reaction Display

**Files:**
- Modify: `apps/mobile/app/(screens)/conversation/[id].tsx:454-460` and `styles` section

**Step 1: Find the current reaction display code**

Locate the section where `message.reactions` are displayed (around lines 454-460). Currently it shows simple emoji text.

**Step 2: Replace with enhanced reaction display**

Replace the current reaction display code (lines 454-460) with:

```tsx
{message.reactions && message.reactions.length > 0 && (
  <View style={styles.reactions}>
    {Object.entries(
      message.reactions.reduce<Record<string, { count: number; hasOwn: boolean }>>((acc, r) => {
        if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false };
        acc[r.emoji].count++;
        if (r.userId === user?.id) acc[r.emoji].hasOwn = true;
        return acc;
      }, {})
    ).map(([emoji, { count, hasOwn }]) => (
      <Pressable
        key={emoji}
        style={[styles.reactionChip, hasOwn && styles.reactionChipOwn]}
        onPress={() => {
          const convId = id;
          if (hasOwn) {
            messagesApi.removeReaction(convId, message.id, emoji)
              .then(() => queryClient.invalidateQueries({ queryKey: ['messages', convId] }))
              .catch(() => {});
          } else {
            messagesApi.reactToMessage(convId, message.id, emoji)
              .then(() => queryClient.invalidateQueries({ queryKey: ['messages', convId] }))
              .catch(() => {});
          }
        }}
        accessibilityLabel={`${emoji} ${count}`}
      >
        <Text style={styles.reactionEmoji}>{emoji}</Text>
        {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
      </Pressable>
    ))}
  </View>
)}
```

**Step 3: Add/update required styles**

Add or update these styles in the `styles` StyleSheet.create object:

```typescript
reactions: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 4,
  marginTop: spacing.xs,
},
reactionChip: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: colors.dark.surface,
  borderRadius: radius.full,
  paddingHorizontal: 6,
  paddingVertical: 2,
  marginRight: 4,
  marginTop: 4,
},
reactionChipOwn: {
  backgroundColor: colors.active.emerald10,
  borderWidth: 1,
  borderColor: colors.emerald,
},
reactionEmoji: {
  fontSize: 14,
},
reactionCount: {
  fontSize: 11,
  color: colors.text.secondary,
  marginLeft: 2,
},
```

**Note:** Remove the existing `reactionEmoji` style (line 1410) as it's being replaced.

**Step 4: Test the enhanced reactions**

Run the mobile app and test that:
1. Reactions show counts when > 1
2. Your own reactions have a highlighted style (emerald border)
3. Tapping a reaction toggles it (adds if not yours, removes if yours)
4. Multiple reactions of same emoji are grouped with count

---

## Task 3: Verify Complete Functionality

**Step 1: Test all interaction flows**

1. Long-press message → quick reaction bar appears → tap emoji → reaction added
2. Long-press message → tap "React" → reaction picker BottomSheet appears → works as before
3. Tap existing reaction → toggles (adds/removes based on ownership)
4. Multiple users adding same emoji → shows count > 1

**Step 2: Verify TypeScript compilation**

```bash
cd apps/mobile && npm run type-check
```

Expected: No TypeScript errors.

**Step 3: Verify no UI regressions**

Check that all other chat functionality still works:
- Message sending
- Media messages
- Voice messages
- GIF picker
- Message editing/deleting
- Reply-to functionality

**Step 4: Commit changes**

```bash
git add apps/mobile/app/(screens)/conversation/[id].tsx
git commit -m "feat(conversation): add quick reaction bar and tappable reaction chips

- Add quick reaction bar with 6 emojis (including 🤲) to context menu
- Enhance message reactions to show counts and be tappable to toggle
- Style own reactions with emerald border
- Maintain backward compatibility with existing reaction picker"
```

---

**Plan complete and saved to `docs/plans/2026-03-09-conversation-emoji-reaction-picker.md`.**

Two execution options:

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**