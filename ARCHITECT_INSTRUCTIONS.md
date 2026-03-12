# BATCH 31: Content Creation New Screens — 3 Stages, Sequential Run

**Date:** 2026-03-13
**Theme:** 7 brand-new content creation screens closing the biggest gaps vs TikTok/Instagram/YouTube. Plus 3 new icons as prerequisite. All screens use mock data — backend integration comes later. Execute stages sequentially — commit after each stage.
**Total Tasks:** 8 (1 icon update + 7 new screens)

---

## GLOBAL RULES (apply to ALL stages)

1. Read `CLAUDE.md` in project root FIRST — mandatory code quality rules
2. `<BottomSheet>` never RN Modal | `<Skeleton>` never ActivityIndicator for content | `<EmptyState>` never bare text | `<Icon>` never emoji | `radius.*` never hardcoded >= 6
3. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
4. All FlatLists MUST have `<RefreshControl tintColor={colors.emerald} />`
5. Import ALL design tokens from `@/theme`
6. Use `expo-linear-gradient` for gradients, `react-native-reanimated` for animations
7. After completing each stage: `git add -A && git commit -m "feat: batch 31 stage N — <description>"`
8. Do NOT start the next stage until the current one is committed
9. Do NOT change any file not listed in the task. Do NOT rename exports, props, or routes.
10. ALL new screens must be **300-700 lines** — substantial, production-quality implementations, NOT stubs.
11. **NEVER shadow imported variables** — if you need a local variable for colors/config, use a distinct name like `tierColors`, `itemStyle`, etc. Never `const colors = ...` inside a component that imports `colors` from theme.

### Quick Token Reference
```
colors.emerald=#0A7B4F  colors.emeraldLight=#0D9B63  colors.emeraldDark=#066B42
colors.gold=#C8963E  colors.goldLight=#D4A94F
colors.dark.bg=#0D1117  colors.dark.bgElevated=#161B22  colors.dark.bgCard=#1C2333
colors.dark.bgSheet=#21283B  colors.dark.surface=#2D3548
colors.dark.border=#30363D  colors.dark.borderLight=#484F58
colors.text.primary=#FFF  colors.text.secondary=#8B949E  colors.text.tertiary=#6E7781
colors.error=#F85149  colors.warning=#D29922  colors.like=#F85149  colors.bookmark=#C8963E
spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 xxl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24 xxl=32
radius: sm=6 md=10 lg=16 full=9999
```

### Glassmorphism Recipe (copy-paste into every new screen)
```tsx
// Card wrapper
<LinearGradient
  colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
  style={{
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
    marginBottom: spacing.md,
  }}
>
  {/* content */}
</LinearGradient>

// Section icon background
<LinearGradient
  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
  style={{
    width: 32, height: 32,
    borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  }}
>
  <Icon name="..." size="xs" color={colors.emerald} />
</LinearGradient>

// Entrance animation on list items
<Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
```

### Standard Imports Template (use for EVERY new screen)
```tsx
import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
```

---

## STAGE 0: Icon Prerequisites (1 file)

### Task 0.1 — Add 3 new icons to Icon.tsx

**File:** `apps/mobile/src/components/ui/Icon.tsx`

Add these 3 icons. Required BEFORE Stage 1 screens can reference them.

**Step 1:** Add to the import from `lucide-react-native` (line 14, after `Calendar,`):
```tsx
Scissors, Type, LayoutGrid,
```

**Step 2:** Add to the `IconName` type union (after line 32, after `| 'moon' | 'star' | 'gift' | 'book-open' | 'calculator' | 'calendar';`):
```tsx
| 'scissors' | 'type' | 'layout';
```

**Step 3:** Add to the `iconMap` Record (after the `'calendar': Calendar,` entry):
```tsx
'scissors': Scissors,
'type': Type,
'layout': LayoutGrid,
```

**Commit:** `git add -A && git commit -m "feat: batch 31 stage 0 — add 3 new icons (scissors, type, layout)"`

---

## STAGE 1: Video Creation (3 new screens)

### Task 1.1 — video-editor.tsx (Video Editor)

**Create:** `apps/mobile/app/(screens)/video-editor.tsx`

**Purpose:** Full video editing UI with timeline, trim handles, filters, and effects — the core tool for Bakra (TikTok) parity.

**Required elements:**
- GlassHeader with title "Edit Video" and back arrow
- Video preview area (top 50% of screen):
  - Glass card container with dark background (aspect ratio 9:16 or 16:9 toggle)
  - Play/pause overlay button centered (large, 64x64 circle with `play`/`pause` icon)
  - Current timestamp display: "00:12 / 00:45" in glass pill (top-right)
  - Playback speed badge: "1x" in glass pill (top-left), tappable to cycle 0.5x, 1x, 1.5x, 2x
- Timeline section (below preview):
  - Glass card containing:
    - Waveform/thumbnail strip placeholder (horizontal, ~60px height, dark.surface with subtle gradient segments)
    - Two trim handles (left + right): vertical bars with `scissors` icon, emerald color
    - Playhead: thin vertical line in gold, with small triangle indicator at top
    - Time labels at start and end: "00:00" — "00:45"
    - Drag hint text: "Drag handles to trim" in tertiary color
- Tools tab bar (horizontal ScrollView):
  - Glass pill buttons: Trim, Speed, Filters, Text, Music, Volume
  - Icons: `scissors`, `fast-forward`, `sliders`, `type`, `music`, `volume-2`
  - Selected tab highlighted with emerald gradient
- Tool panel (shows content based on selected tab):
  - **Trim tab:** Start/end time inputs + "Split" button + "Delete segment" button
  - **Speed tab:** Speed selector buttons: 0.25x, 0.5x, 1x, 1.5x, 2x, 3x in glass pills
  - **Filters tab:** Grid of 8 filter previews (3 columns):
    - "Original", "Warm", "Cool", "B&W", "Vintage", "Vivid", "Dramatic", "Fade"
    - Each: small square glass card with filter name + color preview circle
    - Selected filter has emerald border
  - **Text tab:** "Add Text" button + font selector (3 fonts) + color picker (6 color circles)
  - **Music tab:** "Add from Library" button linking to audio-library, current track display
  - **Volume tab:** Horizontal slider for original audio + music audio levels
- Bottom action bar:
  - "Cancel" (text button) + "Export" (emerald gradient button with `check` icon)
  - Quality selector: "720p", "1080p", "4K" in small glass pills

**Visual accents:**
- Gold playhead on timeline
- Emerald trim handles
- Active tool tab with emerald gradient fill
- Filter previews use subtle color tints matching their name

### Task 1.2 — duet-create.tsx (Duet Creator)

**Create:** `apps/mobile/app/(screens)/duet-create.tsx`

**Purpose:** Side-by-side video recording for duets (TikTok duet feature).

**Required elements:**
- GlassHeader with title "Create Duet" and back arrow
- Original video info card:
  - Glass card with original creator's avatar placeholder (40x40), username, video title
  - "Duetting with @username" subtitle
  - Verified badge if applicable
- Split preview area (main section):
  - Glass container taking ~60% of screen height
  - Two equal panels side by side:
    - **Left panel:** "Original" label at top, video placeholder (dark.bgCard with `play` icon centered), creator username at bottom
    - **Right panel:** "You" label at top, camera preview placeholder (dark.surface with `camera` icon centered, dashed border), "Tap to record" hint
  - Layout selector row below: 3 options in glass pills:
    - "Side by Side" (`layout` icon) — default, selected with emerald
    - "Top & Bottom" (`layers` icon)
    - "React" (`user` icon) — small circle overlay
  - Each layout option with emerald selection indicator
- Recording controls:
  - Large circular record button (80x80):
    - Not recording: red gradient ring with white circle center
    - Recording: pulsing red fill with "Recording..." label
  - Timer display above: "00:00 / 00:60" (max 60 seconds)
  - Flip camera button: glass circle with `repeat` icon
  - Flash toggle: glass circle with `sun` icon (on/off state)
- Audio settings card:
  - Glass card with `volume-2` icon
  - "Original Audio" slider (0-100%)
  - "Your Audio" slider (0-100%)
  - "Mute Original" toggle
- Post button at bottom: "Next" emerald gradient (goes to create-reel flow)

**Visual accents:**
- Red recording state with pulsing animation
- Emerald selected layout option
- Gold timer when close to max duration (last 10 seconds)
- Split preview has subtle glass divider line

### Task 1.3 — stitch-create.tsx (Stitch Creator)

**Create:** `apps/mobile/app/(screens)/stitch-create.tsx`

**Purpose:** Sequential video composition — use first 5 seconds of someone's video, then add your own (TikTok stitch feature).

**Required elements:**
- GlassHeader with title "Create Stitch" and back arrow
- Original video card:
  - Glass card with original creator avatar (40x40), username, verified badge
  - "Stitching from @username" subtitle
  - Video preview placeholder (16:9, dark.bgCard with `play` icon)
  - Duration selector: "Use first ___" with options: 1s, 2s, 3s, 5s in glass pills
  - Selected duration highlighted in emerald
  - Preview of selected clip: progress bar showing selected portion in emerald, rest in dark.surface
- Transition selector:
  - Glass card with "Transition" label
  - Horizontal ScrollView of transition options:
    - "Cut" (instant), "Fade", "Slide", "Zoom", "Wipe"
    - Each in glass pill with icon: `scissors`, `eye`, `chevron-right`, `maximize`, `layers`
    - Selected with emerald gradient
- Your clip section:
  - Glass card with `camera` icon header
  - Camera preview placeholder (16:9, dark.surface with dashed border)
  - "Record your response" hint text
  - Record button (same style as duet: large red circular button)
  - Timer: "00:00 / 00:55" (60s - original clip duration)
  - Flip + flash buttons
- Combined preview card:
  - Glass card showing "Preview" title
  - Two thumbnails in sequence: [Original clip] → arrow → [Your clip]
  - Total duration display
  - "Play Preview" button with `play` icon in emerald gradient
- Bottom action bar:
  - "Cancel" text + "Next" emerald gradient button

**Visual accents:**
- Emerald progress on clip selection bar
- Gold arrow between the two clip thumbnails in preview
- Transition preview cards have subtle animation hints

**Commit after Stage 1:** `git add -A && git commit -m "feat: batch 31 stage 1 — 3 video creation screens (video-editor, duet-create, stitch-create)"`

---

## STAGE 2: Content Tools (4 new screens)

### Task 2.1 — caption-editor.tsx (Caption/Subtitle Editor)

**Create:** `apps/mobile/app/(screens)/caption-editor.tsx`

**Purpose:** Edit auto-generated or manual captions/subtitles with timing and styling.

**Required elements:**
- GlassHeader with title "Edit Captions" and back arrow
- Video preview (top ~35% of screen):
  - Glass container with video placeholder (dark.bgCard)
  - Current caption overlaid at bottom of preview: styled text on semi-transparent dark bar
  - Playback controls row: `rewind` (-5s), `play`/`pause`, `fast-forward` (+5s) in glass circles
  - Timestamp: "00:12 / 01:30"
- Caption list (FlatList, middle section):
  - Each caption entry as glass card:
    - Time range: "00:05 - 00:08" in emerald pill
    - Caption text (editable TextInput)
    - Delete button: small glass circle with `trash` icon (error color)
    - FadeInUp entrance animation per item
  - "Add Caption" button at bottom of list: dashed glass card with `circle-plus` icon
  - Mock data: 8-10 caption entries with realistic dialogue
- Style panel (bottom section):
  - Glass card with "Style" header + `type` icon
  - Font selector: 3 options in glass pills: "Default", "Bold", "Handwritten"
  - Size selector: "S", "M", "L" in glass pills
  - Position selector: "Top", "Center", "Bottom" in glass pills with emerald selection
  - Background options: "None", "Dark Bar", "Outline" in glass pills
  - Color picker: 6 color circles (white, yellow, emerald, gold, red, cyan)
  - Selected options highlighted with emerald
- Bottom bar:
  - "Auto-Generate" button (glass pill with `mic` icon — mock, shows "Processing..." then populates)
  - "Save" emerald gradient button

**Visual accents:**
- Time range pills in emerald
- Currently playing caption highlighted with gold border in list
- Style preview updates in real-time on the video preview overlay

### Task 2.2 — schedule-post.tsx (Post Scheduler)

**Create:** `apps/mobile/app/(screens)/schedule-post.tsx`

**Purpose:** Schedule a post for future publication with date/time picker and preview.

**Required elements:**
- GlassHeader with title "Schedule Post" and back arrow + `calendar` icon
- Post preview card (top section):
  - Glass card with:
    - User avatar placeholder (40x40) + "Your Name" + "@username"
    - Post content text preview (2-3 lines, truncated)
    - Media thumbnail placeholder if applicable (small, corner)
    - Post type badge: "Saf Post" / "Majlis Thread" / "Bakra Reel" in glass pill
    - "Draft saved" indicator with `check` icon in emerald
- Date picker section:
  - Glass card with `calendar` icon header
  - Calendar grid (current month):
    - Weekday headers: S M T W T F S
    - Day numbers in grid (7 columns)
    - Today: emerald ring, Selected: emerald filled, Past: disabled (tertiary)
    - Month navigation: `chevron-left` / `chevron-right` with month name "March 2026"
  - Quick date buttons: "Tomorrow", "This Weekend", "Next Week" in glass pills
- Time picker section:
  - Glass card with `clock` icon header
  - Hour selector: horizontal ScrollView of hours (1-12) in glass pills
  - Minute selector: horizontal ScrollView (00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55) in glass pills
  - AM/PM toggle: two glass pills side by side
  - "Best time to post" suggestion: glass pill with `trending-up` icon — "6:00 PM (high engagement)" in gold
- Timezone card:
  - Glass card showing current timezone
  - "UTC+3 (Arabia Standard Time)" with `globe` icon
- Summary card:
  - Glass card with gold border accent:
    - "Scheduled for: March 15, 2026 at 6:00 PM"
    - "Will post to: Saf" with space icon
    - "You'll receive a reminder 30 minutes before"
- Bottom bar:
  - "Cancel" text + "Schedule" emerald gradient button with `calendar` icon

**Visual accents:**
- Selected calendar date: emerald filled circle
- Today: emerald ring outline
- "Best time" suggestion in gold
- Summary card gold border accent

### Task 2.3 — green-screen-editor.tsx (Green Screen / Virtual Background)

**Create:** `apps/mobile/app/(screens)/green-screen-editor.tsx`

**Purpose:** Virtual background selector and editor for video recording.

**Required elements:**
- GlassHeader with title "Green Screen" and back arrow
- Camera preview (top ~50% of screen):
  - Glass container with camera placeholder (dark.bgCard)
  - Subject silhouette placeholder (centered `user` icon, 80x80, representing the person)
  - Selected background visible "behind" the subject area
  - Record button overlay (bottom-right): red circle with `video` icon
- Background categories (horizontal ScrollView):
  - Glass pill buttons: "Solid Colors", "Gradients", "Images", "Videos", "Custom"
  - Selected category with emerald gradient
- Background grid (selected category content):
  - **Solid Colors tab:** 12 color circles (3 rows × 4 columns):
    - Black, White, Emerald (#0A7B4F), Gold (#C8963E), Blue, Red, Purple, Pink, Orange, Yellow, Cyan, Gray
    - Selected: emerald ring around the color circle
  - **Gradients tab:** 8 gradient rectangles (2 rows × 4 columns):
    - "Sunset", "Ocean", "Forest" (emerald gradient), "Midnight", "Rose", "Arctic", "Desert" (gold gradient), "Aurora"
    - Each: small rounded rect with gradient preview + name below
  - **Images tab:** Grid of 8 stock background thumbnails (2 rows × 4 columns):
    - "Beach", "Mountains", "City", "Studio", "Space", "Library", "Café", "Garden"
    - Each: glass card with placeholder (dark.surface with `image` icon + name)
  - **Videos tab:** Grid of 6 animated background thumbnails:
    - "Particles", "Rain", "Fire", "Bokeh", "Clouds", "Matrix"
    - Each: glass card with `play` icon overlay + name
  - **Custom tab:**
    - "Upload Image" button: dashed glass card with `image` icon + `plus`
    - "Upload Video" button: dashed glass card with `video` icon + `plus`
    - Recent uploads section (empty state initially)
  - FadeInUp per grid item
- Intensity slider:
  - Glass card with `sliders` icon
  - "Background Blur" slider (0-100%)
  - "Edge Smoothing" slider (0-100%)
  - Both with emerald fill on the slider track
- Bottom bar:
  - "Cancel" text + "Apply & Record" emerald gradient button

**Visual accents:**
- Color circles have subtle shadow/glow when selected
- Gradient previews are actual LinearGradient components (not images)
- Custom upload cards have dashed emerald borders

### Task 2.4 — account-switcher.tsx (Multi-Account Switcher)

**Create:** `apps/mobile/app/(screens)/account-switcher.tsx`

**Purpose:** Quick-switch between multiple accounts (P0 ship-blocking feature).

**Required elements:**
- GlassHeader with title "Switch Account" and back arrow
- Current account hero card:
  - Large glass card with gold border accent (indicating active):
    - Avatar placeholder (64x64) with emerald online ring
    - Display name (bold, large)
    - Username: "@username" in secondary text
    - "Active" badge: emerald gradient pill with `check-circle` icon
    - Account type: "Personal" or "Creator" in glass pill
    - Stats row: "1.2K followers · 342 following · 89 posts" in tertiary text
- Other accounts list (FlatList):
  - 2-3 mock accounts, each in glass card:
    - Avatar placeholder (48x48)
    - Display name + username
    - Account type badge
    - Unread notifications badge: red circle with count (e.g., "3")
    - "Switch" button: glass pill with emerald text
    - Last active: "Active 2h ago" in tertiary text
  - FadeInUp per account card
- Add account section:
  - Dashed glass card with `circle-plus` icon centered (48x48)
  - "Add Account" text
  - "Sign in to another account" subtitle in tertiary
- Account management section:
  - Glass card with `settings` icon header
  - "Manage Accounts" row with `chevron-right`
  - "Default Account" row showing current default + `chevron-right`
  - "Auto-switch on notification" toggle
- Security note at bottom:
  - Small glass card with `lock` icon
  - "Each account has its own login and security settings"
  - "Sign out of all accounts" link in error color

**Mock account data:**
```
Active: Khalid Al-Rashid (@khalid_dev), Personal, 1.2K followers
Account 2: Mizanly Official (@mizanly), Creator, 45.2K followers, 3 unread
Account 3: Design Studio (@khalid_designs), Creator, 890 followers, 0 unread
```

**Visual accents:**
- Active account: gold border accent
- Notification badges: error red
- "Switch" buttons: emerald text on glass
- Add account: dashed emerald border

**Commit after Stage 2:** `git add -A && git commit -m "feat: batch 31 stage 2 — 4 content tool screens (caption-editor, schedule-post, green-screen-editor, account-switcher)"`

---

## FILE → STAGE CONFLICT MAP (zero overlaps)

| File | Stage |
|------|-------|
| `apps/mobile/src/components/ui/Icon.tsx` | 0 |
| `apps/mobile/app/(screens)/video-editor.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/duet-create.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/stitch-create.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/caption-editor.tsx` | 2 (NEW) |
| `apps/mobile/app/(screens)/schedule-post.tsx` | 2 (NEW) |
| `apps/mobile/app/(screens)/green-screen-editor.tsx` | 2 (NEW) |
| `apps/mobile/app/(screens)/account-switcher.tsx` | 2 (NEW) |

**Zero file conflicts between stages.**

---

## VERIFICATION CHECKLIST (run after ALL stages)

For each of the 7 new screen files:
- [ ] File exists at correct path
- [ ] 300-700+ lines of real implementation
- [ ] Imports `LinearGradient` from `expo-linear-gradient`
- [ ] Imports `FadeInUp` from `react-native-reanimated`
- [ ] Has glassmorphism card patterns (rgba gradient colors)
- [ ] Has entrance animations on list/card items
- [ ] Uses `<GlassHeader>` for navigation
- [ ] Has `<RefreshControl>` on any ScrollView/FlatList
- [ ] 0 instances of `as any`
- [ ] 0 hardcoded `borderRadius` >= 6
- [ ] 0 RN `Modal` usage
- [ ] All Icon names are valid IconName values
- [ ] **No variable shadowing** of imported `colors` or other theme values

For Icon.tsx:
- [ ] 3 new icons added to imports, IconName type, and iconMap
- [ ] No TypeScript errors
