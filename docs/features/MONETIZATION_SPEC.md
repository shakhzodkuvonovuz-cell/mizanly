# Monetization Strategy — Complete Spec

> Created: March 30, 2026
> Status: Design finalized. Backend partially built (buggy), mobile screens exist, zero complete flows.
> Priority: Critical — no revenue = no company

---

## Revenue Model Overview

5 revenue streams, ordered by implementation priority:

| # | Stream | When | Revenue Share |
|---|--------|------|--------------|
| 1 | **Virtual Currency (Coins + Gifts)** | Launch | Mizanly keeps 30% of gift value |
| 2 | **Premium Subscriptions** | Launch | 100% (minus Apple/Google 15-30%) |
| 3 | **Creator Monetization (Tips + Cashout)** | Launch | Mizanly keeps 20% of cashout |
| 4 | **Promoted Content** | Post-launch (1K+ advertisers) | CPM-based pricing |
| 5 | **Commerce (Storefront)** | Post-launch (creator demand) | 5-10% transaction fee |

---

## Stream 1: Virtual Currency (Coins + Gifts)

### How It Works
```
User buys coins (real money) → sends gift to creator → creator receives diamonds → creator cashes out diamonds (real money)

$4.99 → 500 coins → sends "Crescent" gift (100 coins) → creator gets 70 diamonds → creator cashes out → $0.70 to bank
```

### Coin Packages (Apple IAP + Google Play)

| Package | Price | Coins | Bonus | $/Coin |
|---------|-------|-------|-------|--------|
| Starter | $0.99 | 100 | — | $0.0099 |
| Basic | $4.99 | 550 | +10% | $0.0091 |
| Popular | $9.99 | 1,200 | +20% | $0.0083 |
| Best Value | $24.99 | 3,500 | +40% | $0.0071 |
| Creator Pack | $49.99 | 7,500 | +50% | $0.0067 |
| Mega | $99.99 | 16,000 | +60% | $0.0062 |

**Apple/Google take 30% (15% for small business < $1M/yr).** Price coins accounting for this:
- User pays $4.99 → Apple takes $1.50 → Mizanly receives $3.49 → gives 550 coins
- Effective cost to Mizanly per coin: $0.0063

### Gift Catalog

| Gift | Coins | Diamonds to Creator (70%) | Visual |
|------|-------|--------------------------|--------|
| Rose | 1 | 1 | Single rose animation |
| Salam | 5 | 4 | Peace hand wave |
| Crescent | 10 | 7 | Glowing crescent moon |
| Lantern | 25 | 18 | Ramadan lantern float |
| Mosque | 50 | 35 | Miniature mosque build |
| Quran | 100 | 70 | Opening Quran with light |
| Kaaba | 250 | 175 | Rotating Kaaba with stars |
| Garden | 500 | 350 | Jannah garden bloom |
| Diamond Rain | 1,000 | 700 | Full-screen diamond shower |
| Crown | 2,500 | 1,750 | Golden crown placement |

**Note:** Rose at 1 coin giving 0 diamonds was an audit finding (Critical #11). Fix: minimum 1 diamond per gift regardless of percentage.

### Gift Contexts
- **Live streams:** Real-time gift animations visible to all viewers
- **Posts/Reels:** "Send appreciation" button on content
- **Profiles:** "Send gift" on creator profiles
- **DMs:** Inline gift in conversation

### Diamond → Cash Conversion
- 1 diamond = $0.01 USD
- Minimum cashout: 5,000 diamonds ($50)
- Cashout frequency: once per 30 days
- Payment method: Stripe Connect (bank transfer)
- Processing time: 3-5 business days

**Revenue per gift to Mizanly:**
```
User pays $4.99 for 550 coins
Apple takes 30%: $1.50
Mizanly receives: $3.49
User sends 550 coins as gifts
Creators receive 385 diamonds (70%)
Creators cash out: $3.85... wait, that's MORE than Mizanly received.
```

**The math needs adjustment.** If Apple takes 30%, Mizanly can't give 70% of face value:
```
$4.99 purchase → Apple: $1.50 → Mizanly: $3.49
550 coins distributed
Creator receives 55% of coin value as diamonds = 302 diamonds
Creator cashes out: $3.02
Mizanly profit: $3.49 - $3.02 = $0.47 (13.5% effective margin after Apple)
```

**Revised split: Creators get 55% as diamonds, Mizanly keeps 45% (but 30% goes to Apple, so real margin is 15%).**

This is standard — TikTok creators get ~50% of gift value.

---

## Stream 2: Premium Subscriptions

### Three Tiers

#### Mizanly Gold — $4.99/mo ($49.99/yr)
**Target:** Regular users who want status + quality of life.

| Feature | Free | Gold |
|---------|------|------|
| Profile verification badge | — | Gold checkmark |
| Algorithm boost | Standard | 2x reach on posts |
| Who viewed your profile | — | Full list with timestamps |
| App icon customization | Default | 8 Islamic geometric designs |
| Video upload length (Bakra) | 3 minutes | 10 minutes |
| Video upload length (Minbar) | 15 minutes | 60 minutes |
| Custom emoji reactions | Standard set | +50 exclusive Islamic calligraphy reactions |
| Priority support | Community | Direct response < 24h |
| Ad-free (when ads launch) | With ads | No ads |
| Download content | — | Save any post/reel/video offline |
| Undo send (messages) | 5 seconds | 30 seconds |
| Read receipts control | On/off | Selective per conversation |

#### Creator Pro — $9.99/mo ($99.99/yr)
**Target:** Creators, Islamic educators, halal businesses.
**Includes everything in Gold, plus:**

| Feature | Gold | Creator Pro |
|---------|------|-------------|
| Advanced analytics | Basic stats | Full dashboard: demographics, peak times, content performance, funnel |
| Scheduled posts | — | Calendar view, queue, auto-publish |
| Profile theming | — | 20 pre-built themes (see `PROFILE_THEMING_SPEC.md`) |
| Custom branded theme | — | +$49/yr add-on for brand colors + logo |
| Storefront | — | Sell digital products, courses, merch |
| Tip multiplier | Standard 55% | 65% diamond conversion (creator gets more) |
| Collab inbox | Mixed with DMs | Separate inbox for brand deals |
| Live stream upgrades | Standard quality | HD + higher concurrent viewers + priority CDN |
| Exclusive stickers | — | Creator can make custom sticker packs for followers |
| Pinned posts | 1 | 3 |
| Link in bio | 1 | 5 links |
| Auto-reply | — | Set auto-reply for DMs when away |

#### Ummah — $2.99/mo ($29.99/yr)
**Target:** Practicing Muslims who want enhanced Islamic features. This is the unique tier no competitor can copy.

| Feature | Free | Ummah |
|---------|------|-------|
| Quran reading | Surah browser | + Ad-free experience + advanced reading plans |
| Quran recitations | 1 reciter, streaming only | 20+ reciters + offline download all 114 surahs |
| Prayer features | Basic times | + Yearly prayer heatmap + streak stats + Qibla AR |
| Ramadan companion | Basic fasting toggle | + Nutrition tracker + custom dua lists + iftar countdown widget |
| Hajj/Umrah planner | — | Step-by-step guide with GPS waypoints + dua at each station |
| Islamic learning | Browse hadith | + Curated study paths + tajweed basics + Arabic alphabet |
| Dhikr | Basic counter | + Weekly/monthly stats + streaks + community challenges + insights |
| Islamic calendar | View events | + Personal event reminders + moon sighting notifications |
| Daily digest | — | Morning briefing: verse, hadith, prayer times, Islamic date |
| Names of Allah | List view | + Audio pronunciation + detailed meaning + daily reflection |

### Subscription Implementation

**Apple IAP is mandatory for iOS subscriptions.** Cannot use Stripe for in-app subscriptions — Apple guideline 3.1.1.

| Component | Implementation |
|-----------|---------------|
| iOS | StoreKit 2 via `expo-iap` or `react-native-iap` |
| Android | Google Play Billing via same package |
| Backend | Webhook from Apple/Google → verify receipt → update `PremiumSubscription` model |
| Entitlement check | Middleware checks `user.premiumSubscription.plan` on gated endpoints |
| Grace period | 3 days after expiry before revoking features (billing retry) |
| Family sharing | Not for launch |
| Free trial | 7-day free trial for Gold and Creator Pro (not Ummah — Ummah content is too valuable to free-trial) |

### Pricing Strategy

| | Monthly | Yearly | Yearly Savings |
|---|---|---|---|
| Gold | $4.99 | $49.99 | 17% |
| Creator Pro | $9.99 | $99.99 | 17% |
| Ummah | $2.99 | $29.99 | 16% |
| Creator Pro + Custom Theme | $9.99 + $4.08 = $14.07 | $99.99 + $49 = $148.99 | — |

**Ummah at $2.99 is intentionally cheap.** Muslim Pro charges $9.99/mo for just Quran + prayer times. Mizanly offers that PLUS a social platform. Price anchoring against Muslim Pro makes Ummah feel like a steal.

---

## Stream 3: Creator Monetization (Tips + Cashout)

### Tip Flow
```
Viewer taps "Tip" on creator's content/profile
  → Select amount ($1, $2, $5, $10, custom)
  → Apple IAP processes payment
  → Apple takes 30%
  → Creator receives 55% as diamonds
  → Mizanly keeps 15%
  → Creator cashes out via Stripe Connect
```

### Creator Eligibility
To receive tips and cash out, creator must:
- Have 100+ followers
- Have posted 10+ times
- Verified email and phone
- No active moderation actions
- Complete Stripe Connect onboarding (KYC/AML)

### Cashout Rules
- Minimum: 5,000 diamonds ($50)
- Maximum: 100,000 diamonds ($1,000) per cashout
- Frequency: Once per 30 days
- Method: Stripe Connect → bank transfer
- Processing: 3-5 business days
- Tax: Creator responsible for declaring income. Mizanly provides annual 1099 (US) or equivalent.

### Creator Dashboard (`creator-dashboard.tsx` — exists)
- Total diamonds earned (all time + this month)
- Gift breakdown by type
- Top gifting fans (anonymized option)
- Revenue graph (daily/weekly/monthly)
- Cashout history
- Pending balance

---

## Stream 4: Promoted Content (Post-Launch)

### How It Works
Businesses pay to boost their content in the feed. Ads are marked "Promoted" and must follow halal guidelines.

### Ad Policy — Halal Only
| Allowed | Not Allowed |
|---------|-------------|
| Halal food & restaurants | Alcohol, pork products |
| Modest fashion | Revealing clothing brands |
| Islamic education | Gambling, betting |
| Halal finance (Islamic banking) | Interest-based finance (riba) |
| Travel (halal-friendly hotels) | Nightclubs, bars |
| Technology, apps | Dating apps |
| Books, courses | Content contradicting Islamic values |

### Pricing Model
- **CPM (Cost Per 1,000 Impressions):** $2-5 depending on targeting
- **CPC (Cost Per Click):** $0.10-0.50
- **Self-serve dashboard** (post-launch): Businesses set budget, target by location/age/interest
- **Managed campaigns** (at scale): Direct sales for large brands

### Ad Placements
- Feed (every 8th post) — clearly marked "Promoted"
- Discover page — sponsored cards
- Story ads — between user stories (like Instagram)
- Search results — promoted results at top

### Revenue Projection

| MAU | Impressions/day | Fill Rate | CPM | Daily Revenue | Monthly |
|-----|----------------|-----------|-----|--------------|---------|
| 100K | 5M | 10% | $2 | $1,000 | $30K |
| 500K | 25M | 20% | $3 | $15,000 | $450K |
| 1M | 50M | 30% | $3 | $45,000 | $1.35M |
| 5M | 250M | 40% | $4 | $400,000 | $12M |

### Why Not Launch with Ads
- < 100K MAU: no advertiser demand, ad revenue negligible
- Early users attracted by "no ads" promise
- Introducing ads later is fine if free tier remains usable
- Focus on subscriptions + gifts first

---

## Stream 5: Commerce (Creator Storefront)

### What Creators Can Sell
- **Digital products:** Islamic course PDFs, prayer guides, wallpapers, presets
- **Physical goods:** Modest fashion, Islamic decor, prayer mats, books
- **Services:** Quran tutoring sessions, Islamic counseling bookings

### Commission
- Digital goods: 10% platform fee
- Physical goods: 5% platform fee (creator handles shipping)
- Services: 10% platform fee

### Implementation
- `creator-storefront.tsx` exists (screen built)
- `commerce.service.ts` exists (backend built)
- `orders.tsx` exists (order management screen)
- Need: payment processing through storefront, order fulfillment tracking, dispute resolution

### When to Focus
After subscriptions and gifts are working. Commerce requires:
- Reliable payment processing (fix existing bugs first)
- Creator onboarding (Stripe Connect)
- Shipping integration or digital delivery
- Dispute/refund handling
- Tax compliance per region

---

## Revenue Projections — Combined

### At 100K MAU (Month 6-8)
| Stream | Conversion | Revenue/mo |
|--------|-----------|------------|
| Coins/Gifts | 2% buy coins, avg $5 | $10K |
| Subscriptions | 1% × $5 avg | $5K |
| Ads | Not launched | $0 |
| Commerce | Not launched | $0 |
| **Total MRR** | | **$15K** |

### At 500K MAU (Month 12-15)
| Stream | Conversion | Revenue/mo |
|--------|-----------|------------|
| Coins/Gifts | 3% buy coins, avg $8 | $120K |
| Subscriptions | 1.5% × $6 avg | $45K |
| Ads | 20% fill, $3 CPM | $450K |
| Commerce | 0.1% creators selling | $10K |
| **Total MRR** | | **$625K** |

### At 1M MAU (Month 18-24)
| Stream | Conversion | Revenue/mo |
|--------|-----------|------------|
| Coins/Gifts | 3% buy coins, avg $10 | $300K |
| Subscriptions | 2% × $6 avg | $120K |
| Ads | 30% fill, $3 CPM | $1.35M |
| Commerce | 0.2% creators selling | $30K |
| **Total MRR** | | **$1.8M** |

### At 5M MAU (Month 30-36)
| Stream | Conversion | Revenue/mo |
|--------|-----------|------------|
| Coins/Gifts | 3% buy coins, avg $10 | $1.5M |
| Subscriptions | 2% × $6 avg | $600K |
| Ads | 40% fill, $4 CPM | $12M |
| Commerce | 0.3% creators selling | $150K |
| **Total MRR** | | **$14.25M** |

**At 5M MAU: $170M ARR.** That's a $1-2B valuation company.

---

## What's Broken (from audit, must fix before any money flows)

| Finding | Impact | Fix |
|---------|--------|-----|
| Fire-and-forget payment mapping | Wrong user credited | Add `await` |
| Rose gift = 0 diamonds | Sender pays, receiver gets nothing | Minimum 1 diamond |
| Cashout not in $transaction | Double-spend race condition | Wrap in transaction |
| Boost collects no payment | Free promotion for everyone | Wire payment before boost |
| 8 financial models cascade delete | Money destroyed on user delete | Change to SetNull |
| CoinBalance.coins uses Int | Fractional value lost | Change to Decimal (or keep Int, coins are whole numbers) |
| No Apple IAP | App Store rejection | Implement StoreKit 2 |
| Diamond conversion math | 70% to creator when Apple takes 30% = loss | Revise to 55% |

---

## Implementation Order

1. **Fix all audit financial bugs** (Phase 1 of fix sessions)
2. **Apple IAP for coin purchases** (replace Stripe for in-app, keep Stripe for web)
3. **Gift flow end-to-end** (buy coins → send gift → animation → diamond credit → push notification)
4. **Creator cashout via Stripe Connect** (KYC → accumulate → cash out)
5. **Subscription tiers** (StoreKit 2 + Google Play Billing → entitlement middleware)
6. **Profile Theming** (Creator Pro upsell, see `PROFILE_THEMING_SPEC.md`)
7. **Creator dashboard** (analytics, revenue tracking, payout history)
8. **Promoted content** (post-launch, when advertiser demand exists)
9. **Commerce** (post-launch, when creator demand exists)

---

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Apple IAP vs Stripe for mobile | Apple IAP | Apple requires it. No choice. Stripe for web/fallback only. |
| Creator revenue share | 55% | TikTok gives ~50%. 55% is competitive. 70% is unsustainable after Apple's cut. |
| Minimum cashout | $50 (5,000 diamonds) | Prevents micro-cashout processing cost overhead |
| Subscription pricing | $2.99-$9.99 range | Competitive with Muslim Pro ($9.99) and Twitter Blue ($8) |
| Ad policy | Halal only | Core brand promise. Compromising = losing trust permanently. |
| Free trial | 7 days Gold/Creator Pro | Convert window-shoppers. Not for Ummah (Islamic content too valuable to give away). |
| Yearly discount | ~17% | Industry standard. Drives annual commitment. |
