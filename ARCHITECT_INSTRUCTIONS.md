# BATCH 30: Islamic + Monetization New Screens — 3 Stages, Sequential Run

**Date:** 2026-03-13
**Theme:** 8 brand-new screens across Islamic features (Mizanly's #1 differentiator) and Monetization (revenue enabler). Plus 6 new icons as prerequisite. All screens use mock data — backend integration comes later. Execute stages sequentially — commit after each stage.
**Total Tasks:** 9 (1 icon update + 8 new screens)

---

## GLOBAL RULES (apply to ALL stages)

1. Read `CLAUDE.md` in project root FIRST — mandatory code quality rules
2. `<BottomSheet>` never RN Modal | `<Skeleton>` never ActivityIndicator for content | `<EmptyState>` never bare text | `<Icon>` never emoji | `radius.*` never hardcoded >= 6
3. No `any` in non-test code. No `@ts-ignore`. No `@ts-expect-error`.
4. All FlatLists MUST have `<RefreshControl tintColor={colors.emerald} />`
5. Import ALL design tokens from `@/theme`
6. Use `expo-linear-gradient` for gradients, `react-native-reanimated` for animations
7. Use existing `animation.spring.*` presets: `bouncy{D10,S400}`, `snappy{D12,S350}`, `responsive{D14,S170}`, `gentle{D20,S100}`, `fluid{D18,S150}`
8. After completing each stage: `git add -A && git commit -m "feat: batch 30 stage N — <description>"`
9. Do NOT start the next stage until the current one is committed
10. Do NOT change any file not listed in the task. Do NOT rename exports, props, or routes.
11. ALL new screens must be **300-600 lines minimum** — substantial, production-quality implementations, NOT stubs.

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

### Task 0.1 — Add 6 new icons to Icon.tsx

**File:** `apps/mobile/src/components/ui/Icon.tsx`

Add these 6 icons. This is required BEFORE Stage 1 screens can reference them.

**Step 1:** Add to the import from `lucide-react-native` (line 3-15):
```tsx
Moon, Star, Gift, BookOpen, Calculator, Calendar,
```

**Step 2:** Add to the `IconName` type union (after line 30 `| 'sun' | 'circle' | 'droplet' | 'sliders'`):
```tsx
| 'moon' | 'star' | 'gift' | 'book-open' | 'calculator' | 'calendar';
```

**Step 3:** Add to the `iconMap` Record (after the `'sliders': SlidersHorizontal,` entry):
```tsx
'moon': Moon,
'star': Star,
'gift': Gift,
'book-open': BookOpen,
'calculator': Calculator,
'calendar': Calendar,
```

**Commit:** `git add -A && git commit -m "feat: batch 30 stage 0 — add 6 new icons (moon, star, gift, book-open, calculator, calendar)"`

---

## STAGE 1: Islamic Features (5 new screens)

### Task 1.1 — hadith.tsx (Daily Hadith)

**Create:** `apps/mobile/app/(screens)/hadith.tsx`

**Purpose:** Daily hadith display with Arabic text, English translation, source attribution, and share/bookmark actions.

**Required elements:**
- GlassHeader with title "Daily Hadith" and back arrow
- Hero card with today's hadith:
  - Book icon (`book-open`) in emerald-gold gradient background
  - Arabic text in larger font (fontSize.lg), right-aligned
  - English translation below in normal font
  - Source line: "Sahih al-Bukhari, Hadith #6018" in tertiary color
  - Narrator line: "Narrated by Abu Hurairah (RA)" in secondary color
- Action row: bookmark, share, copy icons in glass pill buttons
- "Previous Hadith" section below with FlatList of past hadiths (5-7 mock entries)
  - Each item: glass card with truncated text + source + date
  - FadeInUp entrance animation per item
- Bottom info card: "Hadith are sourced from authentic collections" with `check-circle` icon
- Mock data (static array of 7 hadiths with Arabic + English + source + narrator)

**Visual accents:**
- Gold accent border on hero card (borderLeftWidth: 3, borderLeftColor: colors.gold)
- Emerald gradient for action buttons on active state
- Arabic text uses `textAlign: 'right'` with slightly larger lineHeight

### Task 1.2 — dhikr-counter.tsx (Dhikr Counter)

**Create:** `apps/mobile/app/(screens)/dhikr-counter.tsx`

**Purpose:** Beautiful tappable counter for Islamic remembrance (dhikr) with preset phrases and daily goals.

**Required elements:**
- GlassHeader with title "Dhikr Counter" and back arrow
- Preset phrase selector (horizontal ScrollView):
  - Glass pill buttons for each phrase: "SubhanAllah", "Alhamdulillah", "Allahu Akbar", "La ilaha illAllah", "Astaghfirullah"
  - Arabic text below each: "سبحان الله", "الحمد لله", "الله أكبر", "لا إله إلا الله", "أستغفر الله"
  - Selected phrase highlighted with emerald gradient border
- Large circular counter display (center of screen):
  - Outer ring: LinearGradient circle (200x200) with emerald-to-gold gradient border
  - Inner: dark background with large count number (fontSize: 48, bold)
  - Current phrase in Arabic below the number
  - "Tap to count" hint text in tertiary color (hidden after first tap)
- Large tap zone (the entire counter circle is pressable)
  - Each tap increments count
  - Use `useHaptic` hook: `import { useHaptic } from '@/hooks/useHaptic'` — call `triggerHaptic('light')` on each tap
- Progress bar below counter: glass card showing "33/33 — Set complete!"
  - Standard dhikr sets are 33 reps
  - Gold accent when set is complete
- Daily summary card at bottom:
  - Total counts today with bar-chart-2 icon
  - Sets completed with check-circle icon
  - Current streak with trending-up icon
  - All in glass card with emerald icon backgrounds
- Reset button (small, in top-right of counter area): `circle` icon

**Visual accents:**
- Counter pulse animation on tap (scale 1.05 → 1.0, 150ms)
- Gold shimmer on set completion (33 count reached)
- Emerald progress fill on the progress bar

### Task 1.3 — zakat-calculator.tsx (Zakat Calculator)

**Create:** `apps/mobile/app/(screens)/zakat-calculator.tsx`

**Purpose:** Interactive step-by-step zakat calculator with asset categories, deductions, and final calculation.

**Required elements:**
- GlassHeader with title "Zakat Calculator" and back arrow
- Info banner at top: glass card with `calculator` icon explaining "Calculate your annual Zakat obligation (2.5% of eligible wealth above Nisab)"
- Step indicator: 3 dots showing current step (Assets → Deductions → Result)
  - Active dot: emerald filled, inactive: dark.surface
- **Step 1 — Assets** (ScrollView of input cards):
  - Cash & Bank Balances (TextInput with $ prefix)
  - Gold & Silver (TextInput with weight unit toggle: grams/ounces)
  - Investments & Stocks (TextInput)
  - Business Inventory (TextInput)
  - Property for Rent (TextInput)
  - Each input in its own glass card with relevant icon (circle for cash, layers for investments, etc.)
  - "Next" button at bottom with emerald gradient
- **Step 2 — Deductions**:
  - Outstanding Debts (TextInput)
  - Immediate Expenses (TextInput)
  - Each in glass card
  - "Back" and "Calculate" buttons
- **Step 3 — Result**:
  - Large result card with gold border accent:
    - Total Assets value
    - Total Deductions value
    - Net Zakatable Wealth (bold)
    - Nisab threshold display (current gold/silver nisab in tertiary text)
    - **Zakat Due: $X** in large emerald text (2.5% of net wealth if above nisab)
    - If below nisab: "Your wealth is below the Nisab threshold. No Zakat is due." with check-circle in gold
  - "Share" and "Recalculate" action buttons
  - Educational note: "Zakat is 2.5% of wealth held for one lunar year above the Nisab threshold"
- Mock nisab values: Gold Nisab = $5,800, Silver Nisab = $490 (display both)

**Visual accents:**
- Gold accent on the final Zakat amount
- Emerald gradient on the step indicator active dot
- Glass inputs with subtle border glow on focus (emerald rgba)

### Task 1.4 — mosque-finder.tsx (Mosque Finder)

**Create:** `apps/mobile/app/(screens)/mosque-finder.tsx`

**Purpose:** List-based mosque finder with distance, prayer times, and facilities info.

**Required elements:**
- GlassHeader with title "Nearby Mosques" and back arrow
- Search bar at top: glass card with search icon + TextInput for filtering
- Map placeholder: glass card (200px height) with `map-pin` icon centered, text "Map view coming soon" — LinearGradient background with subtle emerald tint
- Mosque list (FlatList with RefreshControl):
  - 8 mock mosques with: name, address, distance ("0.5 km"), next prayer time, facilities array
  - Each mosque: glass card with:
    - Mosque name (bold, primary text)
    - Address (secondary text)
    - Distance badge: emerald pill with `map-pin` icon + "0.5 km"
    - Next prayer: "Maghrib at 6:12 PM" with `clock` icon in gold
    - Facilities row: small icon pills for parking, wheelchair, women's section, wudu area
    - "Directions" button: emerald gradient pill
  - FadeInUp per item
- Qibla direction card at bottom:
  - Glass card with compass icon (use `globe` icon)
  - "Qibla Direction: 118° SE" with arrow indicator
  - "Point your phone towards the Qibla" hint text

**Mock mosque data:**
```
Al-Rahman Mosque, 0.3km, Fajr 5:23 | Islamic Center of Guidance, 0.8km | Masjid al-Noor, 1.2km | Al-Huda Mosque, 1.5km | Masjid al-Taqwa, 2.1km | Islamic Community Center, 2.8km | Baitul Mukarram, 3.2km | Masjid al-Iman, 4.0km
```

**Visual accents:**
- Emerald distance badges
- Gold next-prayer time highlights
- Facilities icons in small glass pills

### Task 1.5 — ramadan-mode.tsx (Ramadan Mode)

**Create:** `apps/mobile/app/(screens)/ramadan-mode.tsx`

**Purpose:** Ramadan dashboard with iftar/suhoor countdown timers, fasting tracker, and daily goals.

**Required elements:**
- GlassHeader with title "Ramadan" and `moon` icon accent, back arrow
- Hero section: large glass card with:
  - "Ramadan 1446 AH" title with crescent moon (`moon` icon) in gold gradient background
  - Day counter: "Day 15 of 30" with progress bar (emerald fill, gold track)
  - Hijri date in Arabic below
- Dual countdown timers (side by side):
  - **Iftar Timer**: glass card with `sun` icon, "Iftar in" label, large countdown "02:34:15", time display "Maghrib: 6:12 PM"
    - Gold accent when < 30 minutes remaining
  - **Suhoor Timer**: glass card with `moon` icon, "Suhoor ends in" label, countdown, time display "Fajr: 5:23 AM"
    - Emerald accent
- Today's schedule card:
  - Glass card with timeline of today's key times:
    - Suhoor ends (Fajr) — 5:23 AM
    - Sunrise — 6:45 AM
    - Dhuhr — 12:30 PM
    - Asr — 3:45 PM
    - Iftar (Maghrib) — 6:12 PM
    - Isha — 7:35 PM
    - Taraweeh — 8:00 PM
  - Each with `clock` icon + time, current item highlighted with emerald
- Fasting tracker:
  - Glass card with 30-day grid (5 rows × 6 columns)
  - Each day: small circle, completed = emerald filled, today = gold ring, upcoming = dark.surface
  - "22 days fasted" summary text
- Daily goals card:
  - Glass card with checklist items:
    - "Read 1 Juz of Quran" — `book-open` icon
    - "Make Dhikr 100x" — `circle` icon (link to dhikr-counter)
    - "Give Sadaqah" — `gift` icon
    - "Pray Taraweeh" — `moon` icon
  - Each toggleable (mock state), completed items get emerald check

**Visual accents:**
- Gold crescent moon theme throughout (Ramadan's iconic symbol)
- Emerald progress fills
- Iftar countdown gets gold glow effect when close to breaking fast
- Moon icon in header uses gold color

**Commit after Stage 1:** `git add -A && git commit -m "feat: batch 30 stage 1 — 5 Islamic screens (hadith, dhikr-counter, zakat-calculator, mosque-finder, ramadan-mode)"`

---

## STAGE 2: Monetization Screens (3 new screens)

### Task 2.1 — enable-tips.tsx (Creator Tip Settings)

**Create:** `apps/mobile/app/(screens)/enable-tips.tsx`

**Purpose:** Creator settings screen to enable/configure tipping on their profile.

**Required elements:**
- GlassHeader with title "Creator Tips" and `gift` icon, back arrow
- Hero card explaining tips:
  - `gift` icon in emerald-gold gradient background (48x48)
  - "Earn from your audience" title
  - "Let your followers show appreciation by sending you tips" subtitle
  - Enable/disable toggle (large, custom styled — not bare Switch)
- When enabled, show configuration cards with FadeInUp:
  - **Minimum Tip Amount** card:
    - Glass card with `circle` icon (representing coin)
    - Preset buttons: $1, $2, $5, $10 in horizontal row
    - Custom TextInput for other amount
    - Selected preset highlighted with emerald gradient
  - **Display Settings** card:
    - Glass card with `eye` icon
    - Toggle: "Show tip button on profile" (default on)
    - Toggle: "Show tip button on posts" (default off)
    - Toggle: "Show top supporters on profile" (default on)
    - Each toggle row with icon + label + custom toggle
  - **Thank You Message** card:
    - Glass card with `mail` icon
    - TextInput (multiline, 3 lines) for custom thank-you message
    - CharCountRing (150 char max) — import from `@/components/ui/CharCountRing`
    - Default placeholder: "Thank you for your generous support! 🤲"
  - **Payment Method** card:
    - Glass card with `link` icon
    - "Connect payment method" button with emerald gradient
    - Status: "Not connected" in warning color, or "Connected ✓" in emerald
- Save button at bottom: full-width emerald gradient

**Visual accents:**
- Gift icon uses gold color throughout
- Enabled state has emerald glow
- Disabled state grays everything out with opacity: 0.5

### Task 2.2 — send-tip.tsx (Send Tip Flow)

**Create:** `apps/mobile/app/(screens)/send-tip.tsx`

**Purpose:** User-facing screen to send a tip to a creator.

**Required elements:**
- GlassHeader with title "Send Tip" and back arrow
- Creator info card at top:
  - Glass card with:
    - Avatar placeholder (64x64 circle with user icon)
    - Creator name (bold) + username (secondary)
    - Verified badge if applicable — `<VerifiedBadge size={13} />`
    - Follower count in tertiary text
- Amount selector section:
  - "Choose amount" label
  - Preset amount grid (2 rows × 3 columns):
    - $1, $2, $5, $10, $25, $50
    - Each in glass card, selected = emerald gradient border + fill
    - Gold star icon on the most popular ($5)
  - Custom amount input:
    - Glass card with "$" prefix + TextInput
    - "Enter custom amount" placeholder
- Message section:
  - Glass card with `mail` icon
  - TextInput (multiline, 2 lines) for optional message
  - CharCountRing (100 char max)
  - Placeholder: "Add a message (optional)"
- Payment summary card:
  - Glass card with gold border accent:
    - Tip amount: $5.00
    - Platform fee: $0.50 (10%)
    - Total: $5.50
    - Each line with label + value, separator line between
- "Send Tip" button: full-width gradient (emerald → gold)
  - Shows amount: "Send $5.50"
  - Loading state with ActivityIndicator (allowed in buttons per CLAUDE.md)
- Success state (after mock "send"):
  - Large `check-circle` icon in emerald
  - "Tip sent!" title
  - "Your tip of $5.00 has been sent to @username" subtitle
  - "Done" button to go back

**Visual accents:**
- Gold border on payment summary
- Emerald-to-gold gradient on send button (special, premium feel)
- Selected amount card has subtle emerald glow

### Task 2.3 — membership-tiers.tsx (Membership Tiers)

**Create:** `apps/mobile/app/(screens)/membership-tiers.tsx`

**Purpose:** Creator screen to view/create membership tiers for channel subscriptions.

**Required elements:**
- GlassHeader with title "Membership Tiers" and `star` icon, back arrow
- Info banner:
  - Glass card with `star` icon in gold gradient background
  - "Offer exclusive content and perks to your members"
  - "Members pay monthly for access to your exclusive content"
- Existing tiers list (3 mock tiers, FlatList with RefreshControl):
  - **Tier card** (glass card per tier):
    - Tier icon: star with color coding (bronze/silver/gold gradient)
    - Tier name (e.g., "Supporter", "VIP", "Founding Member")
    - Price: "$4.99/month" in emerald text
    - Subscriber count: "127 members" with `users` icon in pill badge
    - Benefits list (3-4 items per tier):
      - `check` icon + benefit text per line
      - E.g., "Early access to posts", "Exclusive stories", "Monthly Q&A", "Custom badge"
    - Edit button: glass pill with `pencil` icon
    - Toggle: Active/Inactive status
  - FadeInUp per tier card
- "Create New Tier" button:
  - Large dashed-border glass card with `circle-plus` icon centered
  - "Add a membership tier" text
  - Tap expands inline form (or just shows mock — no need for full form):
    - Name TextInput
    - Price TextInput with $ prefix
    - Benefits TextInput (multiline)
    - "Create" button with emerald gradient
- Revenue summary card at bottom:
  - Glass card with gold border accent
  - "Monthly Revenue" with `bar-chart-2` icon
  - "$2,847/month" in large gold text
  - "312 active members" subtitle
  - "Payout: 15th of each month" info line

**Mock tier data:**
```
Supporter: $2.99/mo, 185 members, bronze star, benefits: [Ad-free viewing, Supporter badge, Early access to posts]
VIP: $9.99/mo, 89 members, silver star, benefits: [All Supporter perks, Exclusive stories, Monthly Q&A, Priority replies]
Founding Member: $24.99/mo, 38 members, gold star, benefits: [All VIP perks, 1-on-1 monthly call, Custom shoutouts, Behind-the-scenes content]
```

**Visual accents:**
- Bronze/silver/gold color coding for tier levels:
  - Bronze: `rgba(205,127,50,0.3)` → `rgba(205,127,50,0.15)`
  - Silver: `rgba(192,192,192,0.3)` → `rgba(192,192,192,0.15)`
  - Gold: `rgba(200,150,62,0.3)` → `rgba(200,150,62,0.15)`
- Star icon color matches tier level
- Revenue card has premium gold accent

**Commit after Stage 2:** `git add -A && git commit -m "feat: batch 30 stage 2 — 3 monetization screens (enable-tips, send-tip, membership-tiers)"`

---

## FILE → STAGE CONFLICT MAP (zero overlaps)

| File | Stage |
|------|-------|
| `apps/mobile/src/components/ui/Icon.tsx` | 0 |
| `apps/mobile/app/(screens)/hadith.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/dhikr-counter.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/zakat-calculator.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/mosque-finder.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/ramadan-mode.tsx` | 1 (NEW) |
| `apps/mobile/app/(screens)/enable-tips.tsx` | 2 (NEW) |
| `apps/mobile/app/(screens)/send-tip.tsx` | 2 (NEW) |
| `apps/mobile/app/(screens)/membership-tiers.tsx` | 2 (NEW) |

**Zero file conflicts between stages.**

---

## VERIFICATION CHECKLIST (run after ALL stages)

For each of the 8 new screen files:
- [ ] File exists at correct path
- [ ] Imports `LinearGradient` from `expo-linear-gradient`
- [ ] Imports `FadeInUp` from `react-native-reanimated`
- [ ] Has glassmorphism card patterns (rgba gradient colors)
- [ ] Has entrance animations on list/card items
- [ ] Has `<Skeleton>` loading state
- [ ] Has `<EmptyState>` or equivalent
- [ ] Has `<RefreshControl>` on any FlatList/ScrollView
- [ ] Uses `<GlassHeader>` for navigation
- [ ] 0 instances of `as any`
- [ ] 0 hardcoded `borderRadius` >= 6
- [ ] 0 RN `Modal` usage
- [ ] 300-600+ lines of real implementation
- [ ] All Icon names are valid IconName values (no string casts)

For Icon.tsx:
- [ ] 6 new icons added to imports, IconName type, and iconMap
- [ ] No TypeScript errors
