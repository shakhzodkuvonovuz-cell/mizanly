# Product Strategy Gaps — Everything Not Yet Designed

> Created: March 30, 2026
> Status: Brain dump inventory. These are product design decisions and strategies that have NO spec, NO document, and in most cases NO clear decision made.
> Relationship to other docs: BUSINESS_GAPS_CHECKLIST.md covers legal, ops, financial, marketing. THIS doc covers product design, user experience strategy, technical decisions, and Islamic-specific design choices.

---

## 1. Ramadan 2027 — The Super Bowl

**Status:** Mentioned as target. Zero planning done.
**Why it matters:** 1.8 billion Muslims actively engaged in their faith for 30 consecutive days. App installs for Islamic apps spike 300-500% during Ramadan. If Mizanly isn't ready, you miss a once-a-year window. Next Ramadan after that is 2028.

### What Needs Designing
| Item | Questions to Answer |
|------|-------------------|
| **Ramadan mode activation** | Screen exists (`ramadan-mode.tsx`). Auto-activate based on Islamic calendar? Manual toggle? What changes in the app when Ramadan mode is on? |
| **Themed UI** | Lantern motifs, crescent decorations, special color palette (navy + gold). How deep does theming go — just header? Full app? Feed card borders? |
| **Iftar countdown** | Widget? Lock screen? Push notification at iftar time? Location-aware (different cities, different times)? |
| **Suhoor alarm** | Push notification before Fajr. How many minutes before? Configurable? |
| **Fasting tracker** | Daily check-in ("I'm fasting today"). Streak counter. Community stats ("12,847 people fasting with you today"). |
| **Quran completion challenge** | 30 days, ~20 pages/day = complete Quran. Progress tracker. Community leaderboard. Daily reminders. |
| **Daily dua/dhikr** | Featured dua for each day of Ramadan. Morning + evening adhkar reminders. |
| **Charity integration** | Zakat calculator prominent. Daily sadaqah challenge. Waqf fund progress bars. Partner with Islamic charities? |
| **Community iftars** | Virtual iftar events? Live stream group iftars? City-based iftar meetup coordination? |
| **Ramadan content calendar** | Pre-planned content for all 30 days. Who posts what? Scholar reflections? Daily Quran tafsir? Recipe sharing? |
| **Laylat al-Qadr features** | Special night (last 10 nights). Extra dhikr challenges. Extended Quran room hours. Community prayers. |
| **Eid preparation** | Eid greeting cards. Eid prayer location finder. "Eid Mubarak" story templates. Gift giving features. |
| **Ramadan-specific onboarding** | If a user downloads during Ramadan, their first experience should be Ramadan-focused: fasting tracker, Quran plan, iftar times — not generic social feed. |
| **Marketing timeline** | Ramadan ~Feb 28, 2027. Working backward: launch Jan 2027, soft launch Nov 2026, beta Sept 2026, fixes complete Aug 2026. Marketing campaign starts 4 weeks before Ramadan. |
| **Ramadan push notifications** | Suhoor reminder, iftar alert, daily Quran progress nudge, charity reminder, community stats. Cadence: 3-5/day during Ramadan (normally this would be too many — during Ramadan users expect it). |
| **Post-Ramadan retention** | Biggest risk: users install for Ramadan, uninstall after Eid. How to retain? Shawwal fasting tracker (6 days of Shawwal). Ongoing Quran plan. Community bonds formed during Ramadan. |

### Ramadan Revenue Opportunity
| Revenue Play | How |
|-------------|-----|
| Ramadan-exclusive profile theme | Available only during Ramadan. $1.99 one-time or free with Gold. |
| Charity matching | Mizanly matches X% of donations during Ramadan (up to a cap). Marketing cost, not revenue — but incredible PR. |
| Sponsored iftar content | Halal food brands sponsor iftar recipe posts. First ad revenue opportunity. |
| Premium Quran features | Ummah tier upsell — "complete Quran this Ramadan with offline audio + daily reminders." |
| Gift surge | Ramadan generosity drives gift/tip behavior. Featured "Ramadan gifts" catalog. |

---

## 2. Gamification System

**Status:** Screens exist (achievements.tsx, streaks.tsx, leaderboard.tsx, xp-history.tsx). System design: UNKNOWN.
**Why it matters:** Gamification is the #1 retention mechanism for Islamic habit apps. Duolingo proved streaks work. Muslim Pro has basic streaks. You need a SYSTEM, not random screens.

### XP (Experience Points)
| Action | XP | Rationale |
|--------|-----|-----------|
| Complete profile | 50 | One-time, encourages setup |
| Daily app open | 5 | Baseline daily engagement |
| Post content (Saf/Bakra/Majlis/Minbar) | 15 | Rewards content creation |
| Comment on content | 5 | Rewards engagement |
| Like content | 1 | Minimal — doesn't want like-spam for XP |
| Share content | 10 | Rewards distribution |
| Follow someone | 2 | Encourages social graph building |
| Send message | 2 | Encourages conversations |
| Read Quran (per page) | 10 | Core Islamic engagement |
| Complete daily prayer check-in | 20 | All 5 prayers checked = 100/day |
| Dhikr counter (per 100) | 5 | Rewards spiritual practice |
| Complete a challenge | 50-200 | Varies by difficulty |
| Streak bonus (7 days) | 50 | Weekly commitment reward |
| Streak bonus (30 days) | 200 | Monthly commitment reward |
| Invite friend who joins | 100 | Growth mechanic |
| First post ever | 100 | One-time milestone |
| First follower | 50 | One-time milestone |
| Verified account | 500 | One-time prestige |

### Levels
| Level | XP Required | Title | Unlocks |
|-------|------------|-------|---------|
| 1 | 0 | New Member | Basic features |
| 2 | 100 | Contributor | Custom profile bio |
| 3 | 300 | Active | Story reactions |
| 4 | 600 | Rising | Group creation |
| 5 | 1,000 | Engaged | Live streaming |
| 10 | 5,000 | Dedicated | Custom username colors |
| 15 | 12,000 | Ambassador | Early access to features |
| 20 | 25,000 | Leader | Community creation |
| 25 | 50,000 | Veteran | Profile badge |
| 30 | 100,000 | Legend | Exclusive Legend frame |

### Achievements (badges)
| Category | Examples |
|----------|---------|
| **Social** | First Post, 100 Posts, 1K Followers, 10K Followers, Conversation Starter (100 comments), Popular (100 likes on one post) |
| **Quran** | First Page Read, Juz Complete, 10 Juz, Khatm (complete Quran), Night Reader (read after Isha), Dawn Reader (read before Fajr) |
| **Prayer** | First Check-in, 7-Day Streak, 30-Day Streak, 365-Day Streak, All 5 Prayers (one day), Tahajjud Warrior (check-in before Fajr) |
| **Dhikr** | 1,000 Total, 10,000 Total, 100,000 Total, SubhanAllah Master, Istighfar Champion |
| **Community** | First Group Created, 100 Members, Helpful (10 answers upvoted), Mentor (helped 50 new users) |
| **Ramadan** | Fasted All 30 Days, Quran Completed in Ramadan, Laylat al-Qadr Warrior, Generous (top 10% charity during Ramadan) |
| **Creator** | First Reel, 100 Reels, Viral (1 reel > 10K views), Trendsetter (started a trending hashtag) |
| **Secret** | Hidden achievements discovered by specific rare actions — discoverable, not listed |

### Streaks
| Streak Type | What Counts | Reset Condition | Protection |
|-------------|------------|-----------------|------------|
| Daily Login | Open app | Miss a day | Streak Freeze (1 free, buy more with coins) |
| Prayer | Check in all 5 prayers | Miss any prayer | Grace period: check in by next Fajr |
| Quran | Read at least 1 page | Miss a day | Streak Freeze |
| Dhikr | Complete 100 dhikr | Miss a day | Streak Freeze |
| Posting | Post any content | Miss 3 days | Longer grace for content creation |

### Anti-Gaming
| Exploit | Prevention |
|---------|-----------|
| Like-spam for XP | Cap: max 50 likes/day earn XP |
| Follow/unfollow cycling | Only first follow earns XP per user |
| Alt account XP farming | Device fingerprint links accounts, shared XP cap |
| Bot prayers | Prayer check-in requires location near mosque OR manual confirmation |
| Meaningless posts for XP | Min 10 characters for post XP. No duplicate content within 24h. |

### Leaderboard
| Scope | Timeframe | Privacy |
|-------|-----------|---------|
| Global | Weekly + Monthly + All-time | Opt-in only (default OFF — some Muslims view competition in worship as inappropriate) |
| Friends | Same | Opt-in |
| Community | Same | Community admin controls visibility |
| Country | Same | Opt-in |

**Islamic sensitivity note:** Some scholars view gamifying worship (prayer, Quran, dhikr) as problematic — it can shift intention (niyyah) from worshipping Allah to chasing points. Consider: option to hide ALL gamification. Make it a tool for motivation, not a replacement for sincerity. Never say "you beat Ahmed in prayers!" — say "you maintained your prayer consistency this week."

---

## 3. Notification Strategy

**Status:** Push infrastructure exists (Expo push + PushTriggerService). Which notifications fire, when, how many: UNDESIGNED.
**Why it matters:** Notifications are the #1 driver of DAU. Too few = users forget the app. Too many = users disable ALL notifications → churn. Instagram sends ~5-8/day. WhatsApp sends unlimited (messages). TikTok sends 3-5/day.

### Notification Categories
| Category | Trigger | Priority | Default |
|----------|---------|----------|---------|
| **Messages** | New DM received | HIGH | ON (always) |
| **Calls** | Incoming call | CRITICAL | ON (always, VoIP push on iOS) |
| **Mentions** | @mentioned in post/comment/thread | HIGH | ON |
| **Replies** | Someone replied to your comment/thread | HIGH | ON |
| **Likes** | Someone liked your post/reel/thread | MEDIUM | ON (but batched) |
| **Follows** | Someone followed you | MEDIUM | ON |
| **Comments** | Someone commented on your post/reel | MEDIUM | ON |
| **Group activity** | New message in group chat | MEDIUM | ON |
| **Community** | New post in community you joined | LOW | OFF (digest only) |
| **Prayer times** | Adhan time reached | MEDIUM | ON (configurable per prayer) |
| **Quran reminder** | Daily Quran reading nudge | LOW | OFF |
| **Dhikr reminder** | Daily dhikr nudge | LOW | OFF |
| **Streak warning** | "Your streak ends in 2 hours!" | MEDIUM | ON |
| **Weekly digest** | "You had 47 likes and 12 new followers this week" | LOW | ON |
| **Friend joined** | "Your contact Ahmed just joined Mizanly" | MEDIUM | ON |
| **Live stream** | Someone you follow went live | MEDIUM | ON |
| **Trending** | Content trending in your community | LOW | OFF |
| **Feature updates** | "New: Profile Theming is here!" | LOW | ON (max 1/week) |
| **Re-engagement** | "You haven't opened Mizanly in 3 days" | LOW | ON (max 1/week) |

### Batching Rules
| Notification Type | Batching Logic |
|-------------------|---------------|
| Likes | Batch: "Ahmed and 14 others liked your post" (not 15 separate notifications). Batch window: 15 minutes. |
| Follows | Batch: "Fatima and 3 others followed you." Batch window: 1 hour. |
| Comments | Individual (each comment is a separate conversation). |
| Messages | Individual (real-time, no batching). |
| Group messages | Batch per group: show latest message. Mutable notification (update in-place on iOS). |
| Community posts | Daily digest: "5 new posts in Ummah Builders today." |

### Frequency Caps
| Rule | Limit |
|------|-------|
| Max notifications per hour | 10 (excluding messages and calls) |
| Max notifications per day | 30 (excluding messages and calls) |
| Max re-engagement per week | 1 |
| Max feature update per week | 1 |
| Max promotional per month | 2 |
| Quiet hours | User-configurable (default: 11 PM - 7 AM local time) |
| Prayer DND | During prayer times (5 min window), suppress non-urgent notifications |

### Islamic-Aware Notifications
| Context | Behavior |
|---------|----------|
| During prayer times | Suppress all non-critical notifications. Only calls and urgent messages break through. |
| Ramadan | Increase Islamic notification frequency (suhoor, iftar, Quran reminders). Decrease social notifications slightly. |
| Jummah (Friday) | "Jummah Mubarak" at noon. Suppress non-urgent during Khutbah time (~12:30-1:30 PM local). |
| Late night (after Isha) | Reduce social notifications. Allow Quran/dhikr reminders (tahajjud time). |

### Notification Settings UI
```
Settings → Notifications
├── Messages & Calls (always on, can't disable)
├── Social
│   ├── Likes         [On / Batched / Off]
│   ├── Comments      [On / Off]
│   ├── Follows       [On / Batched / Off]
│   ├── Mentions      [On / Off]
│   ├── Replies       [On / Off]
│   └── Live streams  [On / Off]
├── Islamic
│   ├── Prayer times  [On / Per-prayer toggle]
│   ├── Quran reminder [On / Off] + time picker
│   ├── Dhikr reminder [On / Off] + time picker
│   ├── Streak warning [On / Off]
│   └── Islamic dates  [On / Off]
├── Communities
│   ├── New posts     [Real-time / Digest / Off]
│   └── Mentions only [On / Off]
├── Quiet Hours
│   ├── Enabled       [On / Off]
│   ├── From          [11:00 PM]
│   └── To            [7:00 AM]
├── Prayer DND
│   ├── Enabled       [On / Off]
│   └── Duration      [5 min / 10 min / 15 min]
└── Weekly Digest     [On / Off]
```

---

## 4. Cold Start & Creator Recruitment Playbook

**Status:** Zero creators recruited. Zero seed content. App is empty.
**Why it matters:** Social app graveyard is full of technically perfect products with zero content. This is the existential threat, not bugs.

### Phase 1: Pre-Beta Seeding (you, alone)
| Action | Target | How |
|--------|--------|-----|
| Create 10 Mizanly accounts | 10 profiles | Your own accounts representing different personas: scholar, foodie, traveler, student, parent, etc. |
| Post 500+ pieces of content | 50 per account | Across all 5 spaces: photos in Saf, short videos in Bakra, discussions in Majlis, long videos in Minbar, stories. Source: your own content + CC0 Islamic content from Unsplash/Pixabay + permission from Islamic content creators. |
| Engage between accounts | 2,000+ interactions | Likes, comments, follows between your 10 accounts. The app must FEEL active. |
| Set up auto-follow list | 10-20 accounts | New signups auto-follow these accounts. Their feed is populated from minute one. |

### Phase 2: Creator Recruitment (50-100 creators)

#### Who to Recruit (priority order)
| Tier | Profile | Why | How to Find |
|------|---------|-----|-------------|
| **Micro-influencers (1K-50K followers)** | Islamic educators, halal foodies, modest fashion, Muslim travelers | Most likely to say yes. Hungry for new platform. Loyal audiences. | Instagram hashtags: #muslimcreator #halalfood #modestfashion #islamicreminder. DM them. |
| **Nasheed artists** | Musicians with Muslim audience | Content + music library partnership. Dual value. | Search YouTube/Spotify for nasheed artists. Contact via social media or labels. |
| **Local Sydney Muslims** | Your own community | Easiest to recruit. Can meet in person. Personal trust. | Mosques, Islamic societies, Sydney Muslim community events. |
| **Student Islamic societies** | University Islamic society leaders | Young, tech-savvy, built-in community. They'd bring their entire society. | Contact: UNSW ISOC, USYD MUSIG, UTS Islamic Society, etc. |
| **Islamic podcast hosts** | Muslims with existing audiences | Content-rich, discussion-oriented, perfect for Majlis space. | Search: Muslim podcast directories, Apple Podcasts, Spotify. |

#### What You Offer Creators
| Incentive | Details |
|-----------|---------|
| Early access | Pre-public beta access. "You're among the first 50." Exclusivity sells. |
| Verified badge | Instant verification. Status on a new platform before anyone else. |
| Creator Pro free (1 year) | $120 value. Profile theming, analytics, priority support. |
| Featured placement | Guaranteed spot on Discover page for first 3 months. |
| Revenue share | First 3 months: 70% diamond share instead of 55%. Early creator bonus. |
| Input on features | Private Telegram group with you. They tell you what they need. You build it. |
| Content import help | You personally help them import their Instagram/TikTok content. White-glove service. |
| Co-marketing | Mizanly promotes THEM on its social channels. Cross-promotion. |

#### Recruitment Outreach Template
```
Assalamu alaikum [Name],

I've been following your content on [platform] — your [specific content] really resonates.

I'm building Mizanly, a social platform designed for our community.
5 spaces (like Instagram + TikTok + Twitter combined),
end-to-end encryption on all messages,
built-in Quran, prayer times, and Islamic features
that no mainstream platform offers.

We're inviting 50 creators for early access before public launch.
You'd get:
- Verified badge from day one
- Creator Pro (free for 1 year) with profile theming + analytics
- Featured on Discover page
- Direct input on features we build

Would you be interested in a quick call or voice note to hear more?

Jazakallah khair,
Shakh
Founder, Mizanly
```

#### Recruitment Timeline
| Week | Action | Target |
|------|--------|--------|
| Week 1 | List 200 potential creators. Research each. | 200 names |
| Week 2-3 | DM 200 creators with personalized outreach. | 200 messages sent |
| Week 4-5 | Follow up with interested. Onboard first batch. | 30-50 confirmed |
| Week 6-8 | First batch posting daily. Recruit second batch from referrals. | 50-100 active |
| Week 8+ | Community self-sustains. Focus on retention. | Organic growth |

**Expected conversion:** 200 outreach → 60 respond → 40 interested → 30 actually post regularly. You need 200+ outreach to get 50 active creators.

### Phase 3: Content Calendar (First 30 Days Post-Beta)

| Day | Saf (Feed) | Bakra (Reels) | Majlis (Threads) | Minbar (Video) | Stories |
|-----|-----------|---------------|-----------------|----------------|---------|
| 1 | Welcome post from Mizanly | App tour 60s video | "Introduce yourself" thread | Founder story (5 min) | Launch day story |
| 2 | Islamic art collection | Quick dua clip | "Favorite Quran verse?" | — | Behind the scenes |
| 3 | Halal food photo | Recipe reel | "Best Islamic books?" | Scholar Q&A | Poll: fav feature? |
| 4 | Nature/travel | Dhikr counter demo | "Muslim life hacks" | — | Feature tip |
| 5 | Community spotlight | Funny halal meme | "Ramadan preparations" | Cooking tutorial | User shoutout |
| 6 | Jummah reminder | Quran recitation clip | "Friday reflections" | Khutbah summary | Jummah mubarak |
| 7 | Week 1 recap | Best of week | "Week 1 feedback" | — | Week recap |
| 8-30 | Repeat pattern with fresh content, trending topics, Islamic dates, community contributions |

### Phase 4: Auto-Follow & Discovery Seeding

| Mechanism | Implementation |
|-----------|---------------|
| **Auto-follow on signup** | New users auto-follow 10-15 curated accounts (mix of content types). Can unfollow immediately. Feed is populated from first second. |
| **"Suggested for you" onboarding** | After registration: "Follow 5 accounts to get started" with curated list. Require minimum 5 follows before showing feed. |
| **Discover page curation** | First 3 months: manually curate Discover page. Feature best content daily. After 3 months: algorithm takes over with manual override. |
| **"Welcome" community** | Auto-join new users to "Welcome to Mizanly" community. Introductions, tips, Q&A. Makes new users feel part of something immediately. |
| **Content seeding bot** | Your Go seed-bot (from testing roadmap) can also seed realistic content for development/staging. But public app must have REAL content from REAL creators. No fake content in production. |

---

## 5. Verification System

**Status:** `scholar-verification.tsx` screen exists. Criteria, process, badge types: UNDESIGNED.

### Badge Types
| Badge | Color | Who Gets It | Criteria |
|-------|-------|-------------|---------|
| **Verified** (general) | Blue checkmark | Public figures, notable creators | 10K+ followers OR media coverage OR recognized in community. Application + manual review. |
| **Scholar** | Green crescent | Islamic scholars, educators | Ijazah from recognized institution OR teaching position at Islamic university OR published Islamic works. Application + document verification. |
| **Business** | Gold briefcase | Halal businesses, brands | Registered business + website + ABN/EIN verification. |
| **Founding Member** | Emerald star | First 1,000 users | Auto-granted. Can never be earned again. Permanent prestige. |
| **Beta Tester** | Silver shield | Beta program participants | Auto-granted to beta participants. |

### Verification Process
```
User applies → uploads documents → review queue →
manual review (you, then moderator) → approved/rejected → badge applied

Timeline: < 7 days for general, < 14 days for scholar (document verification)
```

### Scholar Verification Sensitivity
| Issue | How to Handle |
|-------|--------------|
| Which institutions are "recognized"? | Start broad: Al-Azhar, Medina, Al-Qarawiyyin, Darul Uloom Deoband, Hawza (Shia), IIU Malaysia, local accredited Islamic colleges. Expand based on community feedback. |
| Self-taught scholars? | Case by case. Published works, community recognition, peer endorsement (3 verified scholars vouch). |
| Sectarian verification? | DO NOT create sect-specific badges. One "Scholar" badge. Sunni, Shia, Ibadi — all eligible if criteria met. |
| Revocation? | If verified scholar posts content violating community guidelines → warning → temporary badge suspension → permanent revocation. |
| Fake credentials? | Document verification: check institution databases where possible. Start with manual review — automate later with API integrations to university databases. |

---

## 6. Digital Wellbeing

**Status:** `screen-time.tsx`, `quiet-mode.tsx`, `wind-down.tsx` screens exist. Product design: UNCLEAR.

### Features
| Feature | Description | Islamic Angle |
|---------|-------------|---------------|
| **Daily time limit** | Set max app time per day. Gentle reminder at limit, optional hard lock. | "Guard your time — it is your most precious resource." |
| **Session reminders** | "You've been scrolling for 20 minutes." Nudge, not force. | "Time for a break. Remember Allah." |
| **Prayer break** | Auto-pause feed scrolling at prayer times. Gentle overlay: "It's time for Dhuhr." | Unique to Mizanly. No competitor does this. |
| **Bedtime mode** | Screens dim, notifications muted, "Good night" message at user-set time. | "The Prophet ﷺ encouraged sleeping early after Isha." |
| **Wind down** | 10 minutes before bedtime: switch to calming content only (Quran, nature, dhikr). | Gradual transition, not hard cutoff. |
| **Focus mode** | Temporarily disable social feed. Only Islamic content (Quran, prayer, dhikr) accessible. | "Study mode" or "worship mode" — removes distraction. |
| **Weekly report** | Screen time stats, most used features, prayer consistency, Quran progress. | Framed as self-improvement, not guilt. |
| **Usage comparison** | Optional: compare your usage to "community average." | Social proof for healthy habits. |

### Islamic Wellbeing Differentiator
This is a MOAT feature. Instagram and TikTok have screen time tools that they actively undermine (the algorithm keeps you scrolling). Mizanly can genuinely mean it:
- Prayer breaks ACTUALLY pause the feed
- Focus mode ACTUALLY removes social content
- The algorithm doesn't fight the timer (no "one more reel" bait)
- Weekly report celebrates prayer consistency, not engagement metrics

Marketing angle: "The only social app that actually WANTS you to put it down when it's time to pray."

---

## 7. Competitor Response Plan

**Status:** Competitor analysis exists (UpScrolled, Muslim Pro). Response strategy: NONE.

### Threat Scenarios
| Threat | Likelihood | Impact | Response |
|--------|-----------|--------|----------|
| **UpScrolled copies E2E encryption** | Low (they lack technical depth) | Medium | Your Signal Protocol implementation is 10K lines + 5 audit rounds. They can't replicate in months. Keep innovating: PQXDH, sealed sender, safety numbers — features they won't build. |
| **UpScrolled copies Islamic features** | Medium | High | Execute faster. Your 300K LOC + 206 screens vs their WordPress-backed app. Ship features they announce before they can build them. |
| **Instagram launches "Islamic mode"** | Very Low | Very High | You can't compete with Meta's resources. BUT: Meta will never build E2E encrypted social feeds. They will never have halal-only ads. They will never have scholar verification. Privacy + Islamic authenticity is your unassailable moat. |
| **Muslim Pro adds social feed** | Medium | High | Muslim Pro has 140M users but zero social DNA. Building a social feed from scratch is 2+ years of work. Your 15-session head start + 300K LOC is significant. Their advantage: existing user base. Your advantage: purpose-built social platform. |
| **TikTok adds Islamic content hub** | Low | Medium | TikTok has zero trust in Muslim communities (Chinese ownership, data privacy concerns, content moderation failures with Islamic content). Your positioning: "Built BY Muslims, FOR Muslims, with E2E encryption TikTok will never offer." |
| **New well-funded Muslim social startup** | Medium | High | Speed is your moat. 300K LOC in a month. If someone raises $10M to build what you have, they need 12-18 months and a team of 10. You'll be at 1M users by then. First-mover advantage in a niche market. |
| **Government blocks app in a country** | Low per country | Varies | Prepare: VPN-friendly architecture, multiple CDN endpoints, domain rotation capability. Pakistan and Bangladesh have history of blocking social apps. |

### Defensive Moats (things competitors can't easily copy)
| Moat | Why It's Hard to Copy |
|------|----------------------|
| Signal Protocol E2E encryption | 10K lines, 23 files, 633 tests, 5 audit rounds. 3-6 months to replicate competently. |
| Islamic feature depth | Prayer times, Quran with recitations, dhikr, Ramadan mode, halal finder, Islamic calendar, zakat calculator, hajj companion — this is a YEAR of work. |
| 5 unified social spaces | Instagram + TikTok + Twitter + WhatsApp + YouTube in one app. Architectural complexity that can't be bolted on. |
| Community trust | If you launch first and earn trust as "the Muslim app that respects privacy," that reputation compounds. Trust is earned over years, not bought. |
| Content network effects | Once 50K Muslims are posting Islamic content on Mizanly, that content library IS the moat. New users come for the content, not the features. |

---

## 8. Technical Decisions Not Yet Documented

### Performance Budget
| Metric | Target | Why |
|--------|--------|-----|
| App binary size | < 80MB (iOS), < 60MB (Android) | Instagram: 250MB (bloated). Be lean. Users in emerging markets have limited storage. |
| Cold start to feed | < 3 seconds on 4G | First content visible in 3s or user bounces. |
| Feed scroll frame rate | 60fps, never below 30fps | Jank = "cheap app" perception. |
| API response time (p95) | < 500ms | Feed, search, profile — all under 500ms. |
| Image load to display | < 1s (thumbnail), < 3s (full) | With blurhash placeholder → progressive load. |
| Time to interactive (TTI) | < 5 seconds | From app icon tap to scrollable feed. |
| Memory usage | < 200MB active | Prevent OS from killing the app in background. |
| Battery drain | < 5% per hour of active use | Users notice battery drain. GPS + video = battery killer — optimize. |

### Deep Linking Strategy
| URL Pattern | Destination | Fallback (app not installed) |
|-------------|-------------|------------------------------|
| `mizanly.app/post/:id` | Post detail screen | Web preview + App Store banner |
| `mizanly.app/reel/:id` | Reel viewer | Web preview + App Store banner |
| `mizanly.app/@:username` | Profile screen | Web preview + App Store banner |
| `mizanly.app/thread/:id` | Thread detail | Web preview + App Store banner |
| `mizanly.app/video/:id` | Video player | Web preview + App Store banner |
| `mizanly.app/community/:id` | Community page | Web preview + App Store banner |
| `mizanly.app/invite/:code` | App Store with referral attribution | App Store + attribution tracking |
| `mizanly.app/quran/:surah/:ayah` | Quran reader at specific verse | Web preview |
| `mizanly.app/call/:roomId` | Join call | App Store (can't call without app) |

Implementation: Apple Universal Links + Android App Links + Expo Router deep linking. `og` module exists in backend — needs wiring to generate meta tags for each URL pattern.

### Offline-First Design
| Feature | Offline Behavior | Sync Strategy |
|---------|-----------------|---------------|
| Feed | Show cached posts (last 50). "You're offline" banner at top. | Refresh on reconnect. |
| Messages | Show cached conversations. Queue outgoing messages. | Send queued messages on reconnect. |
| Quran text | Fully cached after first download. | Never needs refresh (text doesn't change). |
| Prayer times | Cached for current month. | Refresh monthly. |
| Dhikr counter | Fully local. | Sync count to server on reconnect. |
| Post creation | Allow drafting offline. Queue upload. | Upload when connected. |
| Profile | Show cached profile. | Refresh on reconnect. |
| Search | Unavailable offline. Show clear message. | — |
| Notifications | Unavailable offline. | Fetch missed notifications on reconnect. |

### Data Sovereignty
| Current State | Concern | Future Plan |
|---------------|---------|-------------|
| Database: Neon (US-East-1) | EU users: GDPR data residency. Muslim-majority countries: data in US = political sensitivity. | Phase 1: Document clearly in privacy policy. Phase 2 (at scale): Neon regional deployments (EU, Asia). |
| Media: Cloudflare R2 (auto-distributed) | R2 is globally distributed by default. Better than single-region. | Already good. R2 edge caching serves media from nearest PoP. |
| Redis: Upstash (US) | Session data in US. | At scale: Upstash Global database (multi-region replication). |
| E2E encrypted content | Messages are E2E encrypted — server stores only ciphertext. | Strongest position: "We can't read your messages even if governments demand it." |

### URL Previews / Open Graph
| Content Type | OG Tags Needed |
|-------------|---------------|
| Post | `og:title` = username, `og:description` = first 150 chars, `og:image` = first image or avatar |
| Reel | `og:title` = username + caption, `og:video` = video URL, `og:image` = thumbnail |
| Profile | `og:title` = display name, `og:description` = bio, `og:image` = profile photo |
| Thread | `og:title` = first 60 chars, `og:description` = full text truncated |
| Community | `og:title` = community name, `og:description` = description, `og:image` = community avatar |
| Quran verse | `og:title` = "Surah Al-Baqarah 2:255", `og:description` = verse text, `og:image` = branded Quran card |

Backend `og` module exists. Needs: API routes that return HTML with meta tags for each content type. Cloudflare Worker or NestJS SSR endpoint.

---

## 9. Islamic-Specific Design Decisions

### Prayer Time Calculation Methods
| Method | Used By | Fajr Angle | Isha Angle |
|--------|---------|-----------|-----------|
| Muslim World League (MWL) | Global default | 18° | 17° |
| Egyptian General Authority | Egypt, Africa | 19.5° | 17.5° |
| ISNA (Islamic Society of NA) | North America | 15° | 15° |
| Umm al-Qura | Saudi Arabia | 18.5° | 90 min after Maghrib |
| University of Tehran | Iran, Shia | 17.7° | 14° |
| Diyanet (Turkey) | Turkey | 18° | 17° |
| JAKIM (Malaysia) | Malaysia, SE Asia | 20° | 18° |

**Decision needed:** Default to MWL. Allow user to select method in settings. Show method name in prayer times screen. This is CRITICAL — showing wrong prayer time = religious harm.

### Asr Calculation
| School | Method | Difference |
|--------|--------|-----------|
| Hanafi | Shadow = 2× object length | Later Asr time (~30-60 min) |
| Shafi'i/Maliki/Hanbali | Shadow = 1× object length | Earlier Asr time |

**Decision needed:** User selects madhab during onboarding. Asr time adjusts accordingly. Default: Shafi'i (majority of Muslims).

### Quran Translations
| Translation | Language | Controversy Level |
|-------------|----------|-------------------|
| Sahih International | English | Low — widely accepted |
| Yusuf Ali | English | Low — classic |
| Pickthall | English | Low — classic |
| Muhammad Asad | English | Medium — some interpretive choices debated |
| Dr. Mustafa Khattab (Clear Quran) | English | Low — modern, accessible |
| Ahmadiyya translations | English | HIGH — most Muslims consider Ahmadiyya non-Muslim |

**Decision needed:** Include mainstream Sunni + Shia approved translations. Do NOT include Ahmadiyya translation without explicit user opt-in and clear labeling. Consult Islamic advisor.

### Interfaith Policy
| Question | Recommended Answer |
|----------|-------------------|
| Can non-Muslims create accounts? | Yes. Open platform. |
| Can non-Muslims post in general spaces? | Yes. Community guidelines apply to all. |
| Can non-Muslims join Quran rooms? | Yes with label ("Visitor"). Some rooms can be set to "Muslims only" by room creator. |
| Can non-Muslims send gifts? | Yes. Money is money. |
| Can non-Muslims become verified scholars? | No. Scholar badge specifically validates Islamic scholarship. |
| What about anti-Islamic content? | Prohibited under community guidelines. Same as hate speech against any group. |
| What about Islamic debate/criticism? | Allowed if respectful and academic. Prohibited if mocking or hateful. Moderation judgment call. |

### Gender Interaction Options
| Feature | Default | Optional |
|---------|---------|----------|
| DM from anyone | Followers only | Can restrict to same gender |
| Community membership | Open | Creator can set "Brothers only" / "Sisters only" |
| Live stream viewing | Open | Host can restrict audience |
| Profile visibility | Public | Can restrict to same gender |
| Voice/audio rooms | Open | Room creator can restrict |

**Implementation:** Add optional `genderPreference` field to relevant settings. Never force — always optional. Respect users who want mixed spaces AND users who prefer separation. Both are valid Islamic perspectives.

---

## 10. Account Recovery & Edge Cases

### Account Recovery Flow
| Scenario | Recovery Method |
|----------|----------------|
| Forgot password | Clerk handles: email reset link |
| Lost email access | Phone number verification (if added). Support ticket with identity proof. |
| Lost phone (2FA enabled) | Backup codes (already built). Support ticket with identity proof if no backup codes. |
| Lost everything (phone + email + 2FA) | Identity verification: government ID + selfie matching profile photo. Manual review. 48-72 hour process. |
| Account compromised | Lock account → email verification → password reset → 2FA reset → review active sessions → revoke all tokens. |
| Deceased user | Family member request with death certificate → memorialize account or delete. |

### User Deletion Flow (UX)
```
Settings → Account → Delete Account
  ↓
"We're sorry to see you go. Before you leave:"
  ├── Download your data (GDPR export — JSON/ZIP)
  ├── Transfer community ownership (if you admin any)
  └── Note: deletion is permanent after 30 days
  ↓
Confirm with password + 2FA
  ↓
"Your account will be deactivated immediately and permanently
 deleted after 30 days. You can reactivate by logging in within 30 days."
  ↓
Account deactivated (invisible to others, content hidden)
  ↓
30 days pass → hard delete (anonymize PII, soft-delete content,
SetNull financials, hard-delete stories, clean social graph)
  ↓
Clerk user deleted
```

### Version & Force Update
| Version Status | Behavior |
|---------------|----------|
| Current version | Normal operation |
| 1 version behind | No action (silent update available) |
| 2 versions behind | Soft prompt: "Update available for new features" (dismissable) |
| 3+ versions behind | Soft prompt on every launch (dismissable) |
| Critical security update | FORCE UPDATE: modal, can't dismiss, must update to continue. `ForceUpdateModal` exists in code. |
| API version deprecated | Backend returns 426 Upgrade Required. App shows force update. |

---

## Related Spec Documents
- `docs/features/DATA_IMPORT_ARCHITECTURE.md` — One Tap Import
- `docs/features/EXIT_STORY_SPEC.md` — Goodbye Story
- `docs/features/PROFILE_THEMING_SPEC.md` — Creator Pro monetization
- `docs/features/MONETIZATION_SPEC.md` — 5 revenue streams
- `docs/features/CONTENT_LICENSING_SPEC.md` — Music, GIFs, fonts, UGC
- `docs/features/BUSINESS_GAPS_CHECKLIST.md` — Legal, ops, financial, marketing
