# Step 0 Regressions Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three batch 4 regressions as documented in ARCHITECT_INSTRUCTIONS.md: add view call to reel detail screen, add Short Video option to create bottom sheet, fix lineHeight token in bakra.tsx.

**Architecture:** Three independent fixes applied to existing screens. No new features or architecture changes. Follows existing patterns and theme tokens.

**Tech Stack:** React Native Expo SDK 52, TypeScript, Expo Router, TanStack Query

---

### Task 1: Add view call to reel detail screen

**Files:**
- Modify: `apps/mobile/app/(screens)/reel/[id].tsx:33-36`

**Step 1: Check current code structure**

Open the file and examine the existing useEffect imports and query usage.

**Step 2: Add view call after query declaration**

Add this code after line 36 (the `useQuery` call):

```tsx
useEffect(() => {
  if (id) reelsApi.view(id as string);
}, [id]);
```

**Step 3: Verify import for reelsApi exists**

Check that line 15 has `import { reelsApi } from '@/services/api';`

**Step 4: Test the fix**

Start the mobile app and navigate to a reel detail screen. Monitor network requests to confirm the view endpoint is called.

**Step 5: Commit**

```bash
git add apps/mobile/app/(screens)/reel/[id].tsx
git commit -m "fix: add view call to reel detail screen"
```

---

### Task 2: Add Short Video option to create bottom sheet

**Files:**
- Modify: `apps/mobile/app/(tabs)/_layout.tsx:100-120`

**Step 1: Locate the existing bottom sheet items**

Find the CreateButton component where Post, Thread, Story options are defined.

**Step 2: Add Short Video option**

Insert a new `BottomSheetItem` after the Story option (line around 118):

```tsx
<BottomSheetItem
  label="Short Video"
  icon={<Icon name="video" size="sm" color={colors.text.primary} />}
  onPress={() => navigate('/(screens)/create-reel')}
/>
```

**Step 3: Verify imports and colors**

Check that:
- `colors` is imported from `@/theme`
- `Icon` is imported from `@/components/ui/Icon`

**Step 4: Test the fix**

Start the app, tap the create button, verify Short Video option appears and navigates to create-reel screen.

**Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/_layout.tsx
git commit -m "feat: add Short Video option to create bottom sheet"
```

---

### Task 3: Fix lineHeight token in bakra.tsx

**Files:**
- Modify: `apps/mobile/app/(tabs)/bakra.tsx:326`

**Step 1: Locate the lineHeight value**

Open bakra.tsx and find line 326 (or search for "lineHeight: 20").

**Step 2: Replace hardcoded value with token**

Change:
```diff
- lineHeight: 20,
+ lineHeight: fontSize.lg,
```

**Step 3: Verify fontSize import**

Check that line 14 has `import { colors, spacing, fontSize, radius } from '@/theme';`

**Step 4: Test the fix**

Start the app, navigate to Bakra tab, verify reel captions render correctly with proper line spacing.

**Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/bakra.tsx
git commit -m "fix: replace lineHeight:20 with fontSize.lg token"
```

---

**Plan complete and saved to `docs/plans/2026-03-07-step0-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**