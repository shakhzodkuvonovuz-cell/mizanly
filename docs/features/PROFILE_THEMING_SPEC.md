# Profile Theming — Design Spec

> Created: March 30, 2026
> Status: Design finalized, ready for implementation
> Priority: High — monetization feature, Creator Pro upsell
> Effort: 1-2 sessions
> Dependencies: Creator Pro subscription tier, color picker component

---

## Concept

Creators can customize their profile's visual appearance with pre-built themes or fully branded custom colors. Every visitor to their profile sees their brand — not generic Mizanly UI.

The configurator is FREE to use for anyone. The paywall only appears when applying. This is the Porsche configurator model: play first, fall in love, then pay to keep it.

**Competitive positioning:**
- Instagram tested profile theming with 20 celebrities (late 2024). Massive demand, artificially scarce. Users frustrated they can't get it.
- Mizanly makes it available to ANY creator willing to pay. A small halal bakery in Jakarta gets the same branded profile as a million-follower scholar.
- No competitor in the Muslim social space offers this.

---

## Pricing

| Tier | Price | What You Get |
|------|-------|-------------|
| Free | $0 | Default Mizanly theme. Can USE configurator to preview, cannot apply. |
| Creator Pro | $9.99/mo | Choose from 20 pre-built themes. Switch anytime. |
| Custom Brand | +$49/yr (on top of Creator Pro) | Pick your own colors, upload logo watermark, choose display font. |

**Why $49/yr for custom:**
- $4.08/mo for a branded profile every follower sees
- Cheaper than Linktree Pro ($9/mo) and far more visible
- Low enough for small businesses (halal restaurants, modest fashion, Islamic educators)
- Raise to $99/yr at 1M MAU once demand proves itself

---

## The Configurator — UX Flow

### Entry Points
1. **Profile → Edit Profile → "Theme" tab** (primary)
2. **Visiting a themed profile → "Get this look" button** (discovery)
3. **Settings → Subscription → "Preview themes"** (upsell)

### Configurator Screen Layout

```
┌─────────────────────────────────────────┐
│              ← Theme Studio             │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │     LIVE PREVIEW                │    │
│  │     (Your real profile:         │    │
│  │      your photo, your bio,      │    │
│  │      your actual posts —        │    │
│  │      rendered in the theme      │    │
│  │      you're configuring)        │    │
│  │                                 │    │
│  │     ┌─────┬─────┬─────┐        │    │
│  │     │post │post │post │        │    │
│  │     │  1  │  2  │  3  │        │    │
│  │     └─────┴─────┴─────┘        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ── Presets ──────────── See all →       │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│  │Emer│ │Desr│ │Midn│ │Rose│ │Ocea│    │
│  │ald │ │t   │ │ght │ │    │ │n   │    │
│  └────┘ └────┘ └────┘ └────┘ └────┘    │
│         (horizontal scroll)             │
│                                         │
│  ── Customize Your Brand ──             │
│  Primary color      [████████] ← picker │
│  Secondary color    [████████] ← picker │
│  Display font       [Outfit        ▼]  │
│  Logo watermark     [+ Upload]          │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │     ✨ Apply Theme              │    │
│  │     Creator Pro · $9.99/mo      │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │     📤 Share Preview            │    │
│  │     Show friends before buying  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Conversion Psychology (5-step funnel)

```
1. DISCOVER
   User visits a creator with a themed profile.
   "Their profile looks different. I want that."
   → "Get this look" button visible on themed profiles.

2. PLAY
   Configurator opens. FREE for everyone — no gate on browsing.
   User swipes through 20 presets. Each one INSTANTLY redraws
   their profile with their real data (photo, bio, posts).
   Dopamine hit on every swipe.

3. INVEST
   User opens color picker. Dials in their exact brand green.
   Adjusts secondary to their gold. Uploads their logo.
   Preview updates in real-time. This is THEIRS now.
   5 minutes invested = emotional attachment.

4. LOSS AVERSION
   "Apply Theme" shows paywall.
   "Close without applying?" feels like deleting something they made.
   They're not buying a subscription — they're avoiding the loss
   of what they just built. Porsche configurator psychology.

5. SOCIAL PROOF
   "Share Preview" button lets them screenshot or share
   their configured profile BEFORE paying.
   "What do you think of my new profile theme?"
   Friends see it → ask how → visit configurator → loop continues.
   User is marketing your premium feature for free.
```

### Key Interaction Details

- **Live preview uses REAL data.** The user's actual profile photo, their actual bio, their actual 9-grid of posts. Not a generic mockup. This is critical — they see THEMSELVES transformed.
- **Swipe between presets is instant.** No loading spinner. Pre-render all 20 color configs. Transition with a crossfade (200ms).
- **Color picker is full-spectrum.** HSB picker with hex input. Show the color applied to 3 preview elements simultaneously (header, button, card border) so they see the impact before committing.
- **"Undo" after applying.** If they apply and hate it, they can revert to default or switch to another preset. No lock-in anxiety.
- **Theme persists across the app.** When other users visit this profile, they see the theme. When this user appears in search results or suggestions, their accent color tints their card. The theme IS the brand.

---

## What a Theme Controls (6 elements)

| Element | What Changes | Technical |
|---------|-------------|-----------|
| **Header gradient** | Background behind profile photo + bio + stats | `LinearGradient` with `primaryColor` → transparent |
| **Accent color** | Follow button, tab underline, link color, action buttons, verified badge tint | Override `tc.accent` for this profile's render |
| **Card background** | Post/reel/thread grid items on profile | Subtle tint or background on grid cards |
| **Text tint** | Username and bio get a subtle color shift (not full color — readability first) | `color` with 0.85 opacity blend |
| **Icon style** | Tab bar icons on profile: filled vs outlined, tinted vs default | `Icon` component `color` prop |
| **Grid border** | Subtle border, shadow, or rounded treatment on content grid items | `borderColor` + `shadowColor` from theme |

**What a theme does NOT control:**
- Post content appearance (posts look normal in feeds — theme only affects profile page)
- Navigation bars outside the profile
- Chat/DM appearance
- Other users' profiles
- Typography size or weight (only font family for custom tier, from approved list)

---

## The 20 Pre-Built Themes

| # | Name | Gradient | Accent | Card | Vibe |
|---|------|----------|--------|------|------|
| 1 | Emerald Night | `#064E3B` → `#000000` | `#0A7B4F` | `#0A1A14` | Mizanly signature |
| 2 | Desert Gold | `#D4A574` → `#8B6914` | `#C8963E` | `#FDF6E3` | Warm Islamic luxury |
| 3 | Midnight Blue | `#1A1A4E` → `#0A0A1A` | `#4A7BF7` | `#12122A` | Professional corporate |
| 4 | Rose Garden | `#F5C6D0` → `#FFFFFF` | `#E8849A` | `#FFF0F3` | Soft feminine |
| 5 | Ocean Depth | `#0A4B5C` → `#0A1F2E` | `#2CBFC9` | `#0D2630` | Calm meditative |
| 6 | Sunset Prayer | `#FF6B35` → `#6B2FA0` | `#FF8C42` | `#1A0A2E` | Warm spiritual |
| 7 | Marble White | `#FAFAFA` → `#FFFFFF` | `#333333` | `#F5F5F5` | Clean minimal |
| 8 | Carbon Black | `#000000` → `#0A0A0A` | `#00FF88` | `#111111` | Bold creator |
| 9 | Lavender Haze | `#9B72CF` → `#E8A0BF` | `#B388FF` | `#1A1028` | Gen-Z aesthetic |
| 10 | Forest Moss | `#2D4A22` → `#1A2E14` | `#6B8F5E` | `#1E3018` | Earthy natural |
| 11 | Royal Purple | `#3A1078` → `#150030` | `#9B59B6` | `#1A0A30` | Luxury status |
| 12 | Arctic Ice | `#E8F4FD` → `#FFFFFF` | `#5DADE2` | `#F0F8FF` | Cool tech |
| 13 | Copper Age | `#B87333` → `#4A2C17` | `#CD8B4E` | `#2A1A0E` | Warm vintage |
| 14 | Sahara | `#D2B48C` → `#8B7355` | `#CD853F` | `#F5ECD7` | Arid warmth |
| 15 | Calligraphy | `#FFF8F0` → `#F5ECD7` | `#2C3E6B` | `#FFFDF8` | Islamic art inspired |
| 16 | Neon Souk | `#0A0A1A` → `#000000` | `#FF006E` | `#0F0F1E` | Vibrant market energy |
| 17 | Olive Branch | `#556B2F` → `#2E3D1A` | `#8FBC5E` | `#1E2A12` | Peace nature |
| 18 | Crimson | `#8B0000` → `#1A0000` | `#DC143C` | `#1A0808` | Bold statement |
| 19 | Monochrome | `#2A2A2A` → `#0A0A0A` | `#FFFFFF` | `#1A1A1A` | Pure grayscale |
| 20 | Ramadan | `#0A1628` → `#000510` | `#FFD700` | `#0D1B30` | Crescent gold, lantern glow |

---

## Custom Branded Theme ($49/yr add-on)

### What the Creator Submits

| Input | Validation | Example |
|-------|-----------|---------|
| Primary color (hex) | Must be valid hex, not pure white/black (too extreme) | `#2D5F3C` (halal brand forest green) |
| Secondary color (hex) | Must contrast with primary (WCAG AA minimum) | `#F4E9C8` (cream) |
| Logo/watermark (PNG) | Max 500KB, transparent background, square aspect | Brand logo |
| Font preference | Pick from 5: Outfit, Playfair Display, DM Sans, Amiri, Inter | Playfair Display |

### What the System Generates

The system takes the 2 colors + logo + font and applies them to the same 6 elements as pre-built themes. The creator does NOT get free-form design — it's a **structured brand application** so it always looks professional.

```
Creator inputs:
  primaryColor: #2D5F3C
  secondaryColor: #F4E9C8
  logo: brand-logo.png
  font: "Playfair Display"

System generates:
  header gradient: #2D5F3C → transparent
  accent (follow button, tabs): #2D5F3C
  card background: #F4E9C8 at 10% opacity
  text tint: #2D5F3C at 85% opacity
  icon tint: #2D5F3C
  grid border: #2D5F3C at 20% opacity
  logo watermark: positioned behind bio at 8% opacity
  display font: Playfair Display for username + bio
```

### Review Process

Custom themes are **auto-approved** if:
- Colors pass WCAG AA contrast check
- Logo is not NSFW (run through content moderation)
- No text in logo that violates TOS

If auto-checks fail, queue for manual review (community manager). Target: < 24h approval.

---

## "Theme of the Month" — Recurring Engagement

Every month, release one new preset theme:

| Month | Theme | Event |
|-------|-------|-------|
| Ramadan | Crescent Night (special gold + navy) | Ramadan start |
| Shawwal | Eid Celebration (festive green + white) | Eid al-Fitr |
| Dhul Hijjah | Hajj Pilgrimage (desert sand + ihram white) | Hajj season |
| Muharram | Islamic New Year (deep burgundy + silver) | 1st Muharram |
| Rabi ul-Awal | Mawlid (emerald + cream, ornamental) | Prophet's birthday |
| Summer | Tropical Ummah (teal + coral) | Seasonal |
| Back to school | Scholar (navy + gold, academic) | September |
| Winter | Warm Chai (cinnamon + cream) | Seasonal |

**For Creator Pro members:** new themes auto-added for free.
**For non-subscribers:** purchasable as one-time $1.99 per theme.

Creates urgency ("Ramadan theme only available during Ramadan"), collectibility, and recurring content calendar.

---

## Technical Implementation

### Schema

```prisma
model ProfileTheme {
  id              String      @id @default(cuid())
  userId          String      @unique
  user            User        @relation(fields: [userId], references: [id])
  type            ThemeType   // PRESET | CUSTOM
  presetId        Int?        // 1-20 for pre-built, null for custom
  primaryColor    String?     // hex, custom only
  secondaryColor  String?     // hex, custom only
  logoUrl         String?     // R2 path, custom only
  fontPreference  String?     // one of 5 approved fonts, custom only
  approved        Boolean     @default(true)  // auto-true for presets, review for custom
  appliedAt       DateTime    @default(now())
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@map("profile_themes")
}

enum ThemeType {
  PRESET
  CUSTOM
}
```

### API Endpoints

```
GET    /api/v1/profile-themes/presets          — list all 20 presets
GET    /api/v1/profile-themes/mine             — get current user's theme
PUT    /api/v1/profile-themes/apply-preset     — apply preset (requires Creator Pro)
PUT    /api/v1/profile-themes/apply-custom     — apply custom (requires Creator Pro + Custom add-on)
DELETE /api/v1/profile-themes/mine             — revert to default
GET    /api/v1/users/:username/theme           — get any user's theme (for profile rendering)
```

### Mobile Components

```
ProfileThemeConfigurator.tsx    — full configurator screen
  ├── ThemePreview.tsx          — live preview using real profile data
  ├── PresetCarousel.tsx        — horizontal scroll of 20 preset thumbnails
  ├── ColorPicker.tsx           — HSB picker with hex input
  ├── FontSelector.tsx          — 5 approved fonts with preview
  └── LogoUploader.tsx          — upload + position + opacity control

profile/[username].tsx          — modified to read ProfileTheme and override tc.*
```

### How Theming Applies at Runtime

```typescript
// In profile/[username].tsx
const { data: profileTheme } = useQuery(['profileTheme', username], () =>
  api.get(`/users/${username}/theme`)
);

// Override theme colors for this screen only
const themedColors = profileTheme ? {
  ...tc,
  accent: profileTheme.primaryColor || tc.accent,
  cardBg: profileTheme.secondaryColor
    ? `${profileTheme.secondaryColor}1A` // 10% opacity
    : tc.cardBg,
  headerGradient: [profileTheme.primaryColor || tc.accent, 'transparent'],
} : tc;

// All components on this screen use themedColors instead of tc
```

Theme only applies on the profile screen. Posts in feeds, search results, and other screens use default Mizanly theme. The creator's accent color MAY tint their card in search results / suggestions as a subtle brand indicator.

---

## Metrics to Track

| Event | What It Measures |
|-------|-----------------|
| `configurator_opened` | Interest (free users exploring) |
| `preset_swiped` | Engagement depth (how many presets browsed) |
| `custom_color_picked` | Investment level (they're customizing) |
| `preview_shared` | Viral potential (showing friends before buying) |
| `apply_tapped` | Intent to purchase |
| `subscription_started` | Conversion |
| `theme_changed` | Retention (switching themes = still engaged) |
| `theme_reverted` | Churn signal (went back to default) |
| `custom_submitted` | Premium conversion ($49/yr add-on) |
| `theme_viewed_by_visitor` | Exposure (how many people see themed profiles) |

**Target funnel:**
- 30% of profile visitors notice themed profiles
- 10% open configurator
- 60% swipe through 3+ presets
- 15% reach color picker (custom section)
- 5% of configurator users convert to Creator Pro
- 20% of Creator Pro users add Custom Brand ($49/yr)

---

## Edge Cases

| Case | Handling |
|------|---------|
| Creator cancels subscription | Theme reverts to default immediately. Cached theme cleared for all visitors. |
| Custom theme fails WCAG contrast | Auto-reject with message: "These colors don't have enough contrast for readability. Try adjusting the secondary color." |
| Offensive logo uploaded | Run through content moderation. If flagged, queue for manual review. |
| Two creators pick identical custom colors | Allowed. Colors aren't unique — brands can overlap. |
| Theme looks bad on light mode | Presets are designed for both modes. Custom themes preview in both light and dark before applying. |
| User visits themed profile while offline | Cache theme colors with profile data. Degrade gracefully if logo URL fails. |
| Profile theme + Islamic seasonal theme conflict | Profile theme takes priority. Seasonal themes only affect non-themed profiles. |

---

## Implementation Order

1. **Schema + API** — ProfileTheme model, 6 endpoints, Creator Pro gate
2. **20 preset definitions** — JSON config file with all color values
3. **Profile screen override** — Read theme, apply to `tc.*` overrides
4. **Configurator screen** — Live preview + preset carousel + apply button
5. **Color picker** — HSB picker for custom tier
6. **Logo upload** — R2 upload + positioning
7. **Share preview** — `react-native-view-shot` → share sheet
8. **"Get this look" button** — Visible on themed profiles for visitors
9. **Analytics events** — All 10 metrics above
10. **Theme of the Month system** — Monthly preset releases

---

## Why This Feature Wins

1. **Low build cost, high revenue.** 1-2 sessions to build. Recurring revenue from every creator.
2. **Self-marketing.** Every themed profile is an ad for Creator Pro. Visitors see it, want it, convert.
3. **No competitor has it.** UpScrolled, Muslim Pro — zero profile customization. Instagram restricted it to 20 celebrities.
4. **Emotional conversion.** The configurator sells through loss aversion, not feature lists. People don't buy subscriptions — they avoid losing something they built.
5. **Islamic calendar integration.** Monthly themed releases tied to Islamic events creates a content calendar that's authentic, not manufactured.
