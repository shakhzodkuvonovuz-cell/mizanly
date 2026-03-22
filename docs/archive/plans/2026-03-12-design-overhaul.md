# Mizanly Design Overhaul — Non-AI Slop Transformation

## Objective
Transform the mobile app from generic AI-generated aesthetics to a distinctive, premium "Islamic Digital Luxury" feel while preserving the existing brand color system (Emerald #0A7B4F + Gold #C8963E) and design tokens.

## Design Principles
1. **Intentional application of tokens** — Every design decision uses existing theme values with purpose
2. **Layered depth over flat surfaces** — Cards float with shadow, glass, and border hierarchy
3. **Progressive disclosure** — Information reveals as needed, reducing cognitive load
4. **Physical satisfaction** — Micro-interactions use tuned spring physics for tactile feedback
5. **Brand presence without noise** — Emerald and gold appear at moments of action and achievement

---

## Component Transformations

### 1. PostCard (Saf Feed)

#### Current Issues
- Flat card appearance with generic spacing
- Actions spread awkwardly across width
- Caption always fully expanded
- No visual distinction for story-ring users

#### New Design
```
┌─────────────────────────────────────┐
│ [Avatar with story ring] Name    ···│ <- bgElevated, 1px borderLight
│ @handle · 2h                        │
├─────────────────────────────────────┤
│                                     │
│  [Full-bleed media]                 │ <- radius.lg, bg black pillarbox
│  [Double-tap heart overlay]         │
│                                     │
├─────────────────────────────────────┤
│ ❤️ 42   💬 12   ↗️      [Bookmark] │ <- (like|comment|share) left, save right
│ Caption text that fades... more     │ <- 3 lines max, inline expand
└─────────────────────────────────────┘
```

#### Token Application
- Background: `colors.dark.bgElevated`
- Border: `colors.dark.borderLight` at 1px
- Shadow: `shadow.sm` on iOS, elevation 2 on Android
- Media: Full width, `radius.lg` corners, 2px `borderHighlight`
- Like button: Fills with `colors.like`, spring animation (damping 14, stiffness 170)

---

### 2. Profile Header

#### Current Issues
- Stats look like data table cells
- No visual hierarchy in bio section
- Cover and avatar feel disconnected
- Action buttons generic

#### New Design
```
┌─────────────────────────────────────┐
│ [Cover image with glass.ultra scrim]│ <- 85% blur, gradient overlay
│                                     │
│    ┌────────┐                       │
│    │ Avatar │  Display Name ✓      │ <- Avatar overlaps cover by 24px
│    │        │  @handle             │
│    └────────┘  Bio text here...   │
├─────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐                │
│ │ 42 │ │128 │ │ 4  │  [Follow]     │ <- Stats as pressable pills
│ │Posts│Followers Following [Msg]   │    emerald fill / outline styles
└─────────────────────────────────────┘
```

#### Token Application
- Cover scrim: `glass.ultra` (85% blur, overlay rgba(13,17,23,0.85))
- Avatar position: Negative margin -24px overlapping cover bottom
- Stats: Horizontal scroll, `bgSheet` background, `active.emerald10` on press
- Follow button: `emerald` fill, white text
- Message button: `bgSheet` fill, `borderLight` stroke, `text.primary` text

---

### 3. Risalah Conversation Row

#### Current Issues
- Flat appearance, no depth
- Online indicator positioning awkward
- Unread state not visually distinct enough
- No press feedback

#### New Design
```
┌─────────────────────────────────────┐
│ │ [Avatar●] Name              2h    │ <- ● = online indicator (10px, emerald)
│ │ Last message preview...           │ <- 3px emerald left border when unread
├─────────────────────────────────────┤
│   [Avatar ] Group Name        5m    │
│   You: Message text...              │
└─────────────────────────────────────┘
```

#### Token Application
- Row background: `colors.dark.bgCard`
- Press state: `scale: 0.98` with `animation.spring.snappy`
- Online indicator: `colors.online` with 2px `bgCard` border
- Unread border: 3px `emerald` solid left edge
- Unread name: `text.primary` + `fontWeight.semibold`
- Preview: `text.tertiary` at `fontSize.sm`

---

### 4. Bakra Reel Screen

#### Current Issues
- Standard black-to-transparent gradients
- Actions feel tacked-on to right edge
- Progress bar generic
- No brand presence in UI

#### New Design
```
┌─────────────────────────────────────┐
│ [Video — full bleed]                │
│                                     │
│  [Gold-emerald gradient edge hints] │
│                                     │
│ Name ✓    [📤]                      │
│ @handle   [💬]                      │
│ Caption.. [❤️]                      │
│ [Music ● Audio Name]      [🔖]      │
│━━━━━━━━━━━━━━━━━━━━━━━━━ Progress   │ <- emerald line, gold glow segments
└─────────────────────────────────────┘
```

#### Token Application
- Edge gradients: Black blended with `emeraldDark` at screen edges
- Action stack: Right side, `spacing.xs` gap, each button glows `gold` briefly on press
- Caption: Expandable, `fontSize.base`, `text.primary`
- Progress bar: 2px `emerald` with `shadow.glow` on completion
- Music pill: `glass.medium` background with spinning disc animation

---

### 5. Tab Bar (All Spaces)

#### Current Issues
- Standard iOS-style, no brand personality
- Center create button not emphasized enough
- No visual feedback on tab switch

#### New Design
```
┌─────────────────────────────────────┐
│  🏠    🔍    ➕    💬    👤        │
│ [pill]      [gold/glow]            │
│ emerald10   circle fill             │
│ background  shadow.glow             │
└─────────────────────────────────────┘
```

#### Token Application
- Active tab: `active.emerald10` pill background behind icon
- Create button: `gold` fill with `shadow.glow`, 56px diameter
- Tab switch: 1.2x scale pulse on active icon
- Inactive: `text.tertiary` at 0.8 opacity
- Height: 83px (existing), icon size 24px

---

## System-Wide Polish

### Skeletons
- Current: Generic gray shimmer
- New: `emerald` → `bgCard` color cycle with `animation.timing.shimmer` (1200ms)

### Pull-to-Refresh
- Current: Default iOS gray spinner
- New: `emerald` spinner with `shadow.glow`, positioned with 16px top padding

### Empty States
- Current: Basic text and generic icon
- New: Centered layout with `text.tertiary` icon at `fontSize.xl`, `emerald` outline action button

### Toast Notifications
- Use `elevation.toast` preset (16px shadow, `bgSheet` background)
- Success: Left 3px `emerald` accent
- Error: Left 3px `error` accent

---

## Animation Standards

### Spring Physics (from existing `animation.spring`)
- **Press feedback:** `snappy` (D12 S300)
- **Page transitions:** `gentle` (D20 S100)
- **Like/button interactions:** `bouncy` (D10 S400)
- **Scroll-driven:** `responsive` (D15 S170)

### Timing
- **Fast (150ms):** Hover states, toggles
- **Normal (250ms):** Transitions, reveals
- **Slow (400ms):** Page loads, major state changes
- **Shimmer (1200ms):** Skeleton cycles

---

## Design Bug Fixes

| Bug | Location | Fix |
|-----|----------|-----|
| Inconsistent spacing | All screens | Audit every hardcoded value, replace with theme spacing |
| Missing glassmorphism | Headers, sheets | Apply `glass.*` presets where defined but unused |
| Flat profile stats | Profile screen | Convert to pressable pill buttons with depth |
| Awkward action layout | PostCard | Group left/right, add spacer between |
| No press feedback | List rows | Add `useAnimatedPress` or manual scale spring |
| Boring tab bar | Navigation | Add emerald pill background to active tab |
| Generic skeleton | Loading states | Brand-colored shimmer with emerald tint |

---

## Success Criteria

1. **Visual Distinctiveness:** Screens should feel like "Mizanly" not "generic React Native app"
2. **Consistency:** Every interaction uses the same spring physics, color logic, spacing rhythm
3. **Accessibility:** All changes maintain existing a11y labels, improve color contrast where needed
4. **Performance:** Animations run at 60fps, no layout thrashing from shadow/blur effects

---

## Files to Modify

### High Priority (User-Facing Daily)
- `apps/mobile/src/components/saf/PostCard.tsx`
- `apps/mobile/app/(screens)/profile/[username].tsx`
- `apps/mobile/app/(tabs)/risalah.tsx`
- `apps/mobile/app/(tabs)/bakra.tsx`
- `apps/mobile/app/(tabs)/_layout.tsx` (tab bar)

### Medium Priority (Supporting)
- `apps/mobile/src/components/ui/Skeleton.tsx`
- `apps/mobile/src/components/ui/Avatar.tsx` (story ring refinements)
- `apps/mobile/src/components/ui/BottomSheet.tsx` (glassmorphism)
- `apps/mobile/app/(screens)/settings.tsx` (row polish)
- `apps/mobile/app/(tabs)/saf.tsx` (feed container)

### Lower Priority (Polish)
- `apps/mobile/src/components/majlis/ThreadCard.tsx`
- `apps/mobile/app/(screens)/conversation/[id].tsx` (message bubbles)
- `apps/mobile/app/(tabs)/minbar.tsx` (video grid)

---

## Notes

- All changes use existing design tokens — no new colors, fonts, or spacing values
- Focus is on **application** of tokens with intention, not **addition** of new tokens
- Maintain RTL support for Arabic — all layouts must flip correctly
- Dark mode is primary — light mode changes are secondary if time permits
