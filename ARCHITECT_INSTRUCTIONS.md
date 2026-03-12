# BATCH 32: Final Visual Screens — 2 Stages, Sequential Run (Kimi's Last Visual Batch)

**Date:** 2026-03-13
**Theme:** 5 final new screens completing the visual layer before switching to DeepSeek for heavy engineering. Execute stages sequentially — commit after each stage.
**Total Tasks:** 5 new screens across 2 stages

---

## GLOBAL RULES (apply to ALL stages)

1. Read `CLAUDE.md` in project root FIRST — mandatory code quality rules
2. `<BottomSheet>` never RN Modal | `<Skeleton>` never ActivityIndicator for content | `<EmptyState>` never bare text | `<Icon>` never emoji | `radius.*` never hardcoded >= 6
3. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
4. All FlatLists MUST have `<RefreshControl tintColor={colors.emerald} />`
5. Import ALL design tokens from `@/theme`
6. Use `expo-linear-gradient` for gradients, `react-native-reanimated` for animations
7. After completing each stage: `git add -A && git commit -m "feat: batch 32 stage N — <description>"`
8. Do NOT start the next stage until the current one is committed
9. Do NOT change any file not listed in the task. Do NOT rename exports, props, or routes.
10. ALL new screens must be **300-600 lines** — substantial, production-quality implementations, NOT stubs.
11. **NEVER shadow imported variables** — if you need a local variable, use a distinct name (e.g., `tierColors`, `itemConfig`). Never `const colors = ...` inside a component that imports `colors` from theme.
12. **NEVER use duplicate props** — e.g., `style={...} style={...}` is invalid. Merge into `style={[..., ...]}`.
13. **Type icon arrays properly** — use `icon: IconName` (import `type IconName` from `@/components/ui/Icon`), NEVER `icon: string` with `as any` cast later.

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

### Available Icon Names (62 total)
```
heart, heart-filled, message-circle, bookmark, bookmark-filled, send, search, home,
play, pause, rewind, fast-forward, more-horizontal, share, check-circle, arrow-left,
plus, camera, image, mic, phone, video, settings, bell, user, users, globe, lock,
flag, trash, edit, x, chevron-right, chevron-left, repeat, eye, eye-off, volume-x,
volume-1, volume-2, mail, hash, trending-up, map-pin, link, clock, check, check-check,
paperclip, smile, at-sign, filter, layers, circle-plus, pencil, slash, log-out,
bar-chart-2, chevron-down, loader, maximize, music, sun, circle, droplet, sliders,
moon, star, gift, book-open, calculator, calendar, scissors, type, layout
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

## STAGE 1: Social Features (3 new screens)

### Task 1.1 — chat-theme-picker.tsx (Chat Theme/Wallpaper Picker)

**Create:** `apps/mobile/app/(screens)/chat-theme-picker.tsx`

**Purpose:** Browse and preview chat themes/wallpapers for individual conversations (WhatsApp-style).

**Required elements:**
- GlassHeader with title "Chat Theme" and back arrow
- Current theme preview card:
  - Glass card showing a mock chat conversation preview (3 messages):
    - Sent message (right-aligned): emerald gradient bubble with white text
    - Received message (left-aligned): dark.bgCard bubble with primary text
    - Sent message (right-aligned): another emerald bubble
  - Current wallpaper visible "behind" the messages
  - "Current: Default Dark" label below
- Theme categories (horizontal ScrollView):
  - Glass pills: "Solid Colors", "Gradients", "Patterns", "Photos"
  - Selected with emerald gradient
- Theme grid (FlatList, 2 columns):
  - **Solid Colors tab:** 12 color swatches:
    - Default Dark (#0D1117), Midnight Blue, Deep Purple, Forest (#0A7B4F tint), Charcoal, Navy, Slate, Burgundy, Dark Teal, Espresso, Graphite, Obsidian
    - Each: rounded square (width/2 - 32px), selected = emerald ring + check icon overlay
  - **Gradients tab:** 8 gradient previews:
    - "Emerald Night" (emerald → dark), "Golden Hour" (gold → dark), "Ocean Deep", "Twilight", "Aurora", "Cosmic", "Sahara", "Midnight Rose"
    - Each: LinearGradient rounded square with name below
  - **Patterns tab:** 6 pattern options:
    - "Geometric", "Stars", "Waves", "Dots", "Islamic Art", "Minimal"
    - Each: glass card with pattern name + small icon (`layers`, `star`, `droplet`, `circle`, `moon`, `slash`)
  - **Photos tab:**
    - "Upload Photo" dashed card with `image` + `plus` icons
    - 4 stock wallpaper placeholders (dark.surface with `image` icon + name)
  - FadeInUp per grid item
- Opacity/blur controls:
  - Glass card with `sliders` icon
  - "Wallpaper Opacity" slider (0-100%, default 30%)
  - "Message Blur" slider (0-100%, default 0%)
- Bottom bar:
  - "Reset to Default" text button + "Apply" emerald gradient button

**Mock data:** theme names + color values as described above.

**Visual accents:**
- Live preview updates as user selects themes
- Selected theme gets emerald ring + animated check
- Gradient previews are actual LinearGradient components

### Task 1.2 — create-event.tsx (Create Event)

**Create:** `apps/mobile/app/(screens)/create-event.tsx`

**Purpose:** Create community events with details, date/time, location, and cover image.

**Required elements:**
- GlassHeader with title "Create Event" and back arrow
- Cover image section:
  - Glass card (200px height) with dashed border:
    - `camera` icon (48x48) centered in emerald-gold gradient background
    - "Add Cover Photo" text + "Tap to upload" hint
  - After "upload" (mock): show placeholder with "Change" overlay button
- Event details form (ScrollView with RefreshControl):
  - **Title** card:
    - Glass card with `pencil` icon
    - TextInput: "Event Name" placeholder
    - CharCountRing (100 char max) — import from `@/components/ui/CharCountRing`
  - **Description** card:
    - Glass card with `edit` icon
    - TextInput (multiline, 4 lines): "What's this event about?" placeholder
    - CharCountRing (500 char max)
  - **Date & Time** card:
    - Glass card with `calendar` icon header
    - Start date row: "Start" label + date display + `chevron-right`
    - End date row: "End" label + date display + `chevron-right`
    - "All Day" toggle
    - Mock dates: "March 20, 2026 at 7:00 PM" — "March 20, 2026 at 9:00 PM"
  - **Location** card:
    - Glass card with `map-pin` icon
    - TextInput: "Add location" placeholder
    - "Online Event" toggle — when on, shows URL input instead
  - **Event Type** selector:
    - Glass card with `layers` icon
    - Horizontal pills: "In-Person", "Online", "Hybrid"
    - Selected with emerald gradient
  - **Privacy** selector:
    - Glass card with `globe`/`lock` icon (toggles based on selection)
    - "Public" / "Members Only" / "Invite Only" in glass pills
  - **Community** selector:
    - Glass card with `users` icon
    - "Post to community" dropdown placeholder
    - "Your Communities" list (2-3 mock communities)
  - **Reminders** card:
    - Glass card with `bell` icon
    - Toggle: "Send reminder 1 hour before"
    - Toggle: "Send reminder 1 day before"
- Bottom bar:
  - "Save Draft" text button + "Create Event" emerald gradient button

**Visual accents:**
- Calendar icon uses gold color
- Active toggles in emerald
- Cover image area has subtle emerald dashed border

### Task 1.3 — event-detail.tsx (Event Detail View)

**Create:** `apps/mobile/app/(screens)/event-detail.tsx`

**Purpose:** View event details, RSVP, see attendees, and interact.

**Required elements:**
- GlassHeader with title "Event" and back arrow + share button (`share` icon)
- Cover image hero:
  - Full-width placeholder (220px height, dark.bgCard with `image` icon)
  - Gradient overlay from transparent to dark.bg at bottom
  - Event type badge overlay (top-left): "In-Person" in glass pill
- Event info section:
  - Title: large bold text "Community Iftar Gathering"
  - Host row: avatar placeholder (40x40) + "Hosted by @community_name" + verified badge
  - Date/time card:
    - Glass card with `calendar` icon in gold gradient background
    - "Saturday, March 20, 2026"
    - "7:00 PM — 9:00 PM (AST)"
    - "Add to Calendar" button with `calendar` icon
  - Location card:
    - Glass card with `map-pin` icon in emerald gradient background
    - "Islamic Community Center"
    - "123 Main Street, Riyadh"
    - "Get Directions" button with `map-pin` icon
  - Description card:
    - Glass card with event description text (3-4 lines)
    - "Read more" expandable if text is long
- RSVP section:
  - Glass card with gold border accent:
    - "Are you going?" label
    - 3 RSVP buttons in row: "Going" (emerald), "Maybe" (gold), "Can't Go" (dark.surface)
    - Selected button has filled gradient, others outlined
    - Current selection shows check icon
- Attendees section:
  - Glass card with `users` icon header
  - "47 Going · 12 Maybe · 8 Invited"
  - Horizontal avatar row (overlapping circles, 5 visible + "+42")
  - "See All Attendees" button with `chevron-right`
- Discussion section:
  - Glass card with `message-circle` icon header
  - "3 comments" count
  - 2 mock comment rows (avatar + name + text + timestamp)
  - "Add a comment..." input row at bottom
- Bottom bar:
  - "Share Event" button (glass pill with `share` icon)
  - "RSVP: Going" confirmation button (emerald gradient, reflects current RSVP)

**Mock event data:**
```
Title: Community Iftar Gathering
Host: Islamic Community Center (@icc_riyadh)
Date: Saturday, March 20, 2026, 7:00-9:00 PM
Location: Islamic Community Center, 123 Main Street, Riyadh
Type: In-Person, Public
Attendees: 47 going, 12 maybe
Description: "Join us for a blessed evening of community iftar during Ramadan. We'll break our fast together, share a meal, and enjoy each other's company. All are welcome — bring your family and friends!"
```

**Visual accents:**
- Gold accent on calendar date card
- Emerald "Going" RSVP button
- Overlapping avatar circles create depth effect
- Host row has subtle verified badge glow

**Commit after Stage 1:** `git add -A && git commit -m "feat: batch 32 stage 1 — 3 social screens (chat-theme-picker, create-event, event-detail)"`

---

## STAGE 2: Engagement (2 new screens)

### Task 2.1 — audio-room.tsx (Audio Room / Spaces)

**Create:** `apps/mobile/app/(screens)/audio-room.tsx`

**Purpose:** Live audio room (Twitter Spaces / Clubhouse style) for Majlis space.

**Required elements:**
- GlassHeader with title "Audio Room" and back arrow + more-horizontal menu
- Room info hero:
  - Glass card with:
    - Room title: "Discussing Islamic Finance in the Modern World" (bold, lg fontSize)
    - Host badge: avatar (40x40) + "Hosted by @khalid_dev" + `star` icon
    - "LIVE" badge: pulsing red dot + "LIVE" text in red gradient pill
    - Listener count: `users` icon + "234 listening" in gold
    - Started: `clock` icon + "Started 45 min ago" in tertiary
- Speakers section (top area):
  - Glass card with "Speakers" header + `mic` icon
  - Grid of speaker avatars (2 rows × 3 columns max):
    - Each speaker: avatar circle (64x64) with:
      - Speaking indicator: animated emerald ring when "speaking" (mock 2 of 5 as speaking)
      - Muted indicator: small `volume-x` icon overlay when muted
      - Name below avatar
      - Host badge (star icon) for the host
    - Mock 5 speakers: host + 4 speakers (2 speaking, 1 muted, 1 idle)
  - FadeInUp per speaker
- Listeners section:
  - Glass card with "Listeners" header + `users` icon + count badge "229"
  - Scrollable grid of smaller avatars (32x32, 4 columns):
    - 12 mock listener avatars with names
    - "+217 more" indicator
  - FadeInUp per row
- Raised hands section:
  - Glass card with "Raised Hands" header + `hand` (use `edit` icon as substitute) + count "3"
  - 3 raised hand entries: avatar + name + "Raised 2m ago" + "Accept" emerald button + "Decline" text
- Room controls (bottom fixed bar):
  - Glass card with controls row:
    - Mic toggle: large circle button, emerald when on, error when muted (`mic` / `volume-x`)
    - Raise hand: circle button with `edit` icon
    - Emoji reactions: circle button with `smile` icon
    - Leave: circle button with `log-out` icon in error color
  - "You are a listener" / "You are a speaker" status text above controls
- End room (host-only section, mock as visible):
  - Small "End Room" text button in error color at very bottom

**Visual accents:**
- Speaking avatars have animated emerald ring (use pulsing border)
- LIVE badge pulses with red glow
- Listener count in gold
- Mic on = emerald, mic off = error red
- Raised hand entries have subtle gold accent

### Task 2.2 — appeal-moderation.tsx (Content Appeal)

**Create:** `apps/mobile/app/(screens)/appeal-moderation.tsx`

**Purpose:** Appeal a content moderation decision (content removed, account restricted, etc.).

**Required elements:**
- GlassHeader with title "Appeal Decision" and back arrow
- Moderation action card (top):
  - Glass card with error-tinted gradient (`rgba(248,81,73,0.15)` → `rgba(248,81,73,0.05)`):
    - `flag` icon in error gradient background (32x32)
    - "Your post was removed" title in error color
    - "Reason: Community guidelines violation — Misleading content" in secondary text
    - "Removed on: March 12, 2026" with `clock` icon
    - "Violation ID: #MOD-2847" in tertiary text
- Content preview card:
  - Glass card with "Affected Content" header
  - Post preview: truncated text (2 lines) + media thumbnail placeholder
  - "View Guidelines" link with `link` icon in emerald
- Appeal form:
  - Glass card with "Your Appeal" header + `pencil` icon
  - **Reason selector:**
    - "Why do you disagree?" label
    - Radio options (each in glass row):
      - "This content doesn't violate guidelines"
      - "This was taken out of context"
      - "This is educational/newsworthy content"
      - "This was posted by mistake and has been edited"
      - "Other"
    - Selected radio: emerald filled circle, unselected: dark.surface outline
  - **Details TextInput:**
    - Glass card with multiline input (5 lines)
    - "Provide additional context for your appeal..." placeholder
    - CharCountRing (1000 char max) — import from `@/components/ui/CharCountRing`
  - **Evidence section:**
    - Glass card with `paperclip` icon
    - "Attach supporting evidence (optional)"
    - "Upload Image" button: dashed glass card with `image` + `plus`
    - "Upload Document" button: dashed glass card with `paperclip` + `plus`
- Appeal status section (for previously submitted appeals):
  - Glass card with "Appeal History" header + `clock` icon
  - Mock entry: "Appeal #1 — Submitted March 12, 2026 — Under Review"
  - Status badge: "Under Review" in gold pill, "Approved" in emerald pill, "Denied" in error pill
  - Timeline: 3 steps (Submitted → Under Review → Decision) with connecting line, current step highlighted
- Important notes card:
  - Glass card with `check-circle` icon
  - "Appeals are typically reviewed within 24-48 hours"
  - "You can submit one appeal per moderation action"
  - "Our team reviews each appeal carefully and fairly"
- Bottom bar:
  - "Cancel" text button + "Submit Appeal" emerald gradient button
  - Button disabled until reason selected + at least 50 chars in details

**Visual accents:**
- Error-tinted glass for the moderation action card (red theme)
- Emerald for positive appeal actions
- Gold for "Under Review" status
- Timeline dots: completed = emerald, current = gold pulse, upcoming = dark.surface

**Commit after Stage 2:** `git add -A && git commit -m "feat: batch 32 stage 2 — 2 engagement screens (audio-room, appeal-moderation)"`

---

## FILE → STAGE CONFLICT MAP (zero overlaps)

| File | Stage |
|------|-------|
| `apps/mobile/app/(screens)/chat-theme-picker.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/create-event.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/event-detail.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/audio-room.tsx` | 2 (NEW) |
| `apps/mobile/app/(screens)/appeal-moderation.tsx` | 2 (NEW) |

**Zero file conflicts between stages. No existing files modified.**

---

## VERIFICATION CHECKLIST (run after ALL stages)

For each of the 5 new screen files:
- [ ] File exists at correct path
- [ ] 300-600+ lines of real implementation
- [ ] Imports `LinearGradient` from `expo-linear-gradient`
- [ ] Imports `FadeInUp` from `react-native-reanimated`
- [ ] Imports `type IconName` from `@/components/ui/Icon`
- [ ] Has glassmorphism card patterns (rgba gradient colors)
- [ ] Uses `<GlassHeader>` for navigation
- [ ] Has `<RefreshControl>` on any ScrollView/FlatList
- [ ] 0 instances of `as any`
- [ ] 0 hardcoded `borderRadius` >= 6
- [ ] 0 RN `Modal` usage
- [ ] 0 duplicate props (e.g., `style={...} style={...}`)
- [ ] 0 variable shadowing of imported `colors`
- [ ] All Icon names are valid IconName values (see list above)
- [ ] All icon arrays typed with `icon: IconName`, NOT `icon: string`
