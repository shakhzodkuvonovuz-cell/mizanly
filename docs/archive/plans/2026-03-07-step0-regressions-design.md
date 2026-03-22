# Step 0: Fix Batch 4 Regressions — Design Document

**Date:** 2026-03-07
**Author:** Claude Code
**Context:** Batch 4 left two regressions; this step fixes them plus one minor spacing issue.

## 0.1 Reel Detail Screen — Add View Call

### Current State
- `apps/mobile/app/(screens)/reel/[id].tsx` exists and is fully functional
- Missing view recording: `reelsApi.view(id)` not called on mount

### Design
Add a `useEffect` hook after the query declaration to record a view when the component mounts.

```tsx
useEffect(() => {
  if (id) reelsApi.view(id as string);
}, [id]);
```

No other changes needed. Auto‑play already works (`shouldPlay={isPlaying}` default true).

## 0.2 Create Bottom Sheet — Add Short Video Option

### Current State
- `apps/mobile/app/(tabs)/_layout.tsx` CreateButton shows Post, Thread, Story only
- Bakra (short‑video) space lacks a creation entry point

### Design
Insert a fourth `BottomSheetItem` after the Story option:

```tsx
<BottomSheetItem
  label="Short Video"
  icon={<Icon name="video" size="sm" color={colors.text.primary} />}
  onPress={() => navigate('/(screens)/create-reel')}
/>
```

The `create-reel.tsx` screen already exists and is wired.

## 0.3 Bakra Hardcoded Spacing — Fix lineHeight Token

### Current State
- `apps/mobile/app/(tabs)/bakra.tsx` contains five hardcoded numeric values:
  - `height: 300` (gradient overlay, layout constant)
  - `height: 200` (gradient overlay, layout constant)
  - `right: 100` (layout offset for action column)
  - `marginTop: 2` (sub‑pixel adjustment)
  - `lineHeight: 20` (should use theme token)

### Design
Replace only the `lineHeight: 20` with the theme token `fontSize.lg` (which equals 20). The other four values are intentional layout constants and stay unchanged.

```diff
- lineHeight: 20,
+ lineHeight: fontSize.lg,
```

## Implementation Order
1. 0.1 — Add view call to `reel/[id].tsx`
2. 0.2 — Add Short Video option to `_layout.tsx`
3. 0.3 — Fix lineHeight token in `bakra.tsx`

Each change is independent and can be applied in any order.

## Notes
- All changes are additive or token‑replacements; no behavior removed.
- No new files created (existing screens are used).
- Follows project coding standards (Icon, BottomSheet, theme tokens).