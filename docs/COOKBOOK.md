# Mizanly Cookbook

> The complete playbook for launching, growing, and protecting Mizanly.
> Written March 2026. Verify all legal/financial information with professionals before acting.

---

## Table of Contents

1. [Positioning Strategy](#1-positioning-strategy)
2. [Brand Identity](#2-brand-identity)
3. [Islamic Extension Model](#3-islamic-extension-model)
4. [Jurisdiction & Incorporation](#4-jurisdiction--incorporation)
5. [Legal Preparation](#5-legal-preparation)
6. [Pre-App Store Checklist](#6-pre-app-store-checklist)
7. [App Store Submission](#7-app-store-submission)
8. [Launch Strategy](#8-launch-strategy)
9. [Growth Channels](#9-growth-channels)
10. [Content & Social Media Strategy](#10-content--social-media-strategy)
11. [Post-Launch Operations](#11-post-launch-operations)
12. [Financial Operations](#12-financial-operations)
13. [Fundraising](#13-fundraising)
14. [Swiss Migration](#14-swiss-migration)
15. [Threat Modeling at Scale](#15-threat-modeling-at-scale)
16. [Timeline & Budget](#16-timeline--budget)

---

## 1. Positioning Strategy

### The Shift

**Old positioning:** "Muslim social app with E2EE"
- Target: 2B Muslims
- Threat surface: governments pre-profile entire userbase by religion
- Media narrative: "encrypted Muslim app" = instant suspicion
- App Store: niche "Islamic" category

**New positioning:** "Privacy-first social app for everyone, with optional Islamic features"
- Target: 8B humans
- Threat surface: same as Signal/Telegram — general purpose, can't profile by religion
- Media narrative: "encrypted social app" = mainstream
- App Store: "Social Networking" category

### Why This Is Better

| Dimension | "Muslim app" | "Everyone + Islamic extensions" |
|---|---|---|
| Government scrutiny | Pre-targeted | Same as any E2E app |
| Terrorism PR attack | "Muslim terror app" | "Encrypted app" (same as Signal) |
| VC pitch | Niche ($7.7T halal but skeptical VCs) | Global TAM + underserved Muslim segment |
| App Store review | Niche category, less visibility | Mainstream category |
| User acquisition | Muslims only, struggle to expand | Anyone, Muslims come naturally |
| Competitor framing | "WhatsApp for Muslims" (dismissive) | "Signal meets Instagram with optional faith features" |
| Country bans | "Ban the Muslim app" (easy politics) | "Ban a general privacy app" (harder) |

### Founder Story

"I grew up in Uzbekistan, a 95% Muslim country where the government reads everything. I moved to Australia and learned that Western governments want the same power. I built Mizanly because everyone — regardless of where they live or what they believe — deserves a private conversation. And for the 2 billion Muslims who've never had a social app that respects both their privacy AND their faith, I built something special."

### The Promise

"The best privacy app for everyone. The best social app for Muslims. Same app."

---

## 2. Brand Identity

### Name

"Mizanly" stays. "Mizan" means "balance/scale" in Arabic — works universally. Sounds like a tech brand. Non-Muslims won't know the Arabic origin unless told.

### Tagline Candidates

- "Your conversations. Your rules."
- "Social without surveillance."
- "Private by design. Social by nature."
- "The social app that can't read your messages."

Don't mention Islam, encryption, or E2E in the tagline. Lead with the human benefit.

### Visual Identity

- Emerald (#0A7B4F) — reads as "tech/nature/trust," not "Islam" without other Islamic cues
- Gold (#C8963E) — reads premium
- No crescents, no green-dominant Islamic palette, no Arabic calligraphy in the primary mark
- Logo should work in Tokyo, Lagos, and Oslo without signaling any religion
- App icon: abstract — shield, lock, or conversation bubble with privacy motif. No religious symbols.

### App Icon

- 1024x1024 PNG, no alpha channel
- Must work at 29x29 (settings), 60x60 (home screen), 1024x1024 (App Store)
- Adaptive icon for Android (foreground + background layers)
- Budget: $200-500 for a professional designer on Dribbble

### Theme Tokens (existing)

```
colors.emerald = #0A7B4F    colors.gold = #C8963E
spacing: xs=4 sm=8 md=12 base=16 lg=20 xl=24 2xl=32
fontSize: xs=11 sm=13 base=15 md=17 lg=20 xl=24
radius: sm=6 md=10 lg=16 full=9999
```

---

## 3. Islamic Extension Model

### Architecture

Like Claude Code's MCP servers and skills — Islamic features are extensions that plug in and can be toggled on/off.

### Settings Toggle

```
Settings -> "Faith & Culture" -> "Islamic Experience" [toggle]
    When ON:  prayer times, Qibla, Islamic calendar, halal finder,
              mosque finder, Quran, dhikr, zakat, scholar Q&A,
              Islamic content boost in feed algorithm,
              Ramadan mode auto-activation, Islamic stickers
    When OFF: none of these appear anywhere in the app
```

### Implementation

1. `islamicFeaturesEnabled: boolean` in UserSettings (default false)
2. Every Islamic UI element checks this flag before rendering
3. Algorithm Islamic content boost only applies when flag is on
4. Islamic tab only appears when enabled
5. Push notifications (prayer times, verse of the day) only when opted in
6. Don't ask during onboarding — let users discover it in settings or suggest contextually

### Existing Code That Needs Wrapping

- `apps/api/src/modules/islamic/` — already separate, add the gate
- `apps/api/src/modules/mosques/` — same
- `apps/api/src/modules/halal/` — same
- `apps/api/src/modules/scholar-qa/` — same
- Algorithm Islamic boost — already configurable
- i18n keys — already namespaced under Islamic sections

### Key Rule

Don't water down the Islamic features. When toggled on, the Islamic experience must be genuinely best-in-class. Half-hearted optional features alienate Muslims without gaining mainstream users.

---

## 4. Jurisdiction & Incorporation

### Jurisdiction Comparison

| Criterion | Switzerland | Panama | Estonia | Iceland | Australia |
|---|---|---|---|---|---|
| Backdoor laws | None | None | None (EU risk) | None | **AA Act — can compel backdoors** |
| Gag order risk | Low (ProtonMail IP log 2021) | Very low | Moderate (EU) | Low | **Extreme (secret TCNs)** |
| Intelligence alliances | None | None | None (EU) | None | **Five Eyes** |
| Privacy reputation | A+ (ProtonMail, Threema, Wire) | B (NordVPN) | B+ | A (IMMI) | D |
| Annual cost | $8-15K | $3-5K | $1.5-4K | $5-10K | $0.5-1K |
| Tax | 12-22% | Territorial (0% offshore) | 0% retained | 20% | 25% (but 43.5% R&D offset) |
| Muslim perception | Neutral | Neutral | Neutral | Neutral | Neutral |
| App Store | No issues | No issues | No issues | No issues | No issues |
| Notable precedent | ProtonMail, Threema, Wire | NordVPN | Wise | IMMI legislation | None for privacy |

### Jurisdictions to Avoid

| Jurisdiction | Why |
|---|---|
| **Australia (as primary)** | Assistance and Access Act 2018 — secret backdoor orders |
| **UAE/Dubai** | ToTok was a government surveillance tool. Actively anti-E2EE. Expensive. |
| **UK** | IPA + Online Safety Act. Apple pulled E2EE features from UK. |
| **Singapore** | POFMA content control, broad government powers |
| **Uzbekistan** | SNB can compel access with no judicial oversight |
| **Turkey** | Blocks platforms, jails journalists, BTK surveillance |
| **Cayman/BVI** | No privacy advantage. "Shell company" perception. Economic substance rules. |

### Recommended Strategy: Start Australian, Migrate Swiss

| Phase | Entity | Why |
|---|---|---|
| Now -> launch | Australian Pty Ltd | Zero friction, R&D tax offset, focus on building |
| Launch -> 100K users | Still Australian | Government doesn't target pre-scale startups. Collect R&D refunds. |
| 100K+ users or VC funding | Swiss GmbH (primary) + keep Australian Pty Ltd | VC money covers ~AUD 50K setup. Swiss entity becomes data controller. |

### Why Starting Australian Is Safe

- The AA Act targets telecoms and big platforms, not pre-launch startups
- Australia has NEVER issued a TCN to a social media startup
- R&D Tax Incentive (43.5% refundable offset) is real money — $100K eligible spend = $43,500 back
- You need an Australian entity anyway for the eventual dual structure
- Zero friction: Pty Ltd via ASIC in 1 day, $576

### Final Structure (Post-Swiss Migration)

```
Mizanly AG (Switzerland — Zug)
    Holds IP, data controller, App Store entity
    "Your data is protected by Swiss law"
    User data governed by Swiss FADP

Mizanly Pty Ltd (Australia — Sydney)
    Operational entity, employs founder
    Development services for Swiss parent
    R&D Tax Incentive (43.5% on crypto/protocol work)
    Service agreement with Swiss entity (arm's length transfer pricing)
```

Swiss entity governs user data. Australian AA Act can't reach Swiss entity. Australian entity is a dev shop — holds no user data, controls no infrastructure.

### Swiss GmbH Setup Details

**Capital:** CHF 20,000 minimum (your money, usable for business after incorporation)
**Lawyer + notary:** CHF 3,000-7,000
**Swiss-resident director service:** CHF 3,000-8,000/year
**Registered office:** CHF 1,500-3,000/year
**Accounting/compliance:** CHF 2,000-5,000/year
**Total year 1:** ~AUD 40,000-55,000
**Ongoing yearly:** ~AUD 15,000-25,000

**Recommended cantons:** Zug (12% tax, "Crypto Valley"), Geneva (where Proton is), Zurich (biggest talent pool)

**Swiss law firms to contact:**
- id est avocats (Geneva) — worked with ProtonMail
- Lenz & Staehelin (Zurich/Geneva)
- Kellerhals Carrard (multiple offices)
- MME (Zurich/Zug) — crypto/tech practice

### The ProtonMail IP Logging Incident (2021)

Swiss authorities ordered ProtonMail to log a specific user's IP address (a French climate activist). ProtonMail complied — Swiss law required it. Key lesson:

**E2EE protects content. It does NOT protect metadata.** Even in Switzerland:
- Message content — safe (can't decrypt)
- IP addresses — can be compelled to log
- Who talks to whom — can be compelled to log
- When they talk — can be compelled to log

This is why sealed sender implementation matters. And why some companies use a Panama infrastructure entity for servers — the entity that handles metadata sits in a jurisdiction with no cooperation obligation.

### Warning: If You Receive an Australian TCN

If you receive a Technical Capability Notice under the AA Act AFTER launching in Australia:
1. It's SECRET — you legally cannot tell anyone
2. You MUST comply (criminal offense not to)
3. Moving to Switzerland AFTER receiving doesn't undo it — the TCN binds you personally as an Australian resident
4. You cannot disclose the TCN as a reason for moving jurisdictions

**Prevention:** Ensure the Australian entity never controls user data. The Swiss entity must be the data controller BEFORE any government interest. A TCN to a dev shop that holds no user data is meaningless.

---

## 5. Legal Preparation

### Documents Required Before App Store

| Document | Purpose | Host at |
|---|---|---|
| Privacy Policy | Required by Apple/Google. Lead with "we cannot access your encrypted data." | mizanly.app/privacy |
| Terms of Service | Required by Apple/Google. Standard social app ToS + E2EE specific clauses. | mizanly.app/terms |
| Community Guidelines | Required for UGC apps. What's allowed, what isn't, consequences. | mizanly.app/community |
| CSAM Policy | Proactive compliance. Report detection, cooperation with law enforcement on metadata. | mizanly.app/child-safety |

### NCMEC Registration

Register with NCMEC before launch to report CSAM. Open to any company worldwide (not US-only). Shows proactive compliance.

### Other Legal Requirements

- **GDPR representative** (Art. 27) — if serving EU users without EU entity, appoint a representative
- **Australian Privacy Act** — comply with APPs (Australian Privacy Principles)
- **COPPA** (US) — if under-13 users possible, need parental consent. Simpler to require 16+.
- **Export controls** — file Self-Classification Report with US BIS for encryption. Routine, free, online form.

### Transparency Reports

Publish quarterly even if all zeros:

```
Mizanly Transparency Report — Q1 2027

Government data requests received: 0
Government data requests complied with: 0
Content removed for Terms violation: X
Accounts suspended: X
CSAM reports filed with NCMEC: X
Court orders received: 0

Note: Mizanly cannot access end-to-end encrypted message content,
call content, or encrypted media.
```

### Warrant Canary

```
As of [date], Mizanly has not received any secret court orders,
national security letters, or gag orders from any government.

This statement is updated quarterly. If this statement is not
updated, draw your own conclusions.
```

If you receive a secret order and can't disclose it, you stop updating the canary. Its absence is the signal. Legally ambiguous but used by many privacy companies.

---

## 6. Pre-App Store Checklist

### Apple Developer Enrollment

- **Cost:** $99/year USD
- **Timeline:** 1-2 days (individual), up to 2 weeks (organization)
- **Decision:** Enroll as individual first (faster), transfer to organization later

**This unblocks:** EAS builds, TestFlight, cert pinning, APNs push, VoIP push (PushKit), App Store submission.

### EAS Build

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile development
eas build --platform android --profile development
```

### Runtime Verification (First Real Build)

| Item | What to verify |
|---|---|
| room.connect() -> media flowing | Audio/video works between two devices |
| RNE2EEManager + RNKeyProvider | SFrame encryption activates, emoji verification matches |
| AudioSession.selectAudioOutput | Speaker toggle works iOS and Android |
| KrispNoiseFilter() | Noise suppression activates on LiveKit Cloud |
| VideoTrack component | Renders video, iosPIP works on iOS 15+ |
| publication.mute()/unmute() on background | Camera pauses/resumes without black frame |
| RNCallKeep.displayIncomingCall | Native call UI with caller name |
| Cold start answer queue | Kill app -> receive call -> answer -> call screen |
| disconnectActiveRoom() from lock screen | Room disconnects + mic stops |
| 30s ring timeout (caller) | Auto-cancels, callee gets missed call push |
| HandleLeaveRoom | Callee leaves group call without killing it |
| CallActiveBar | Navigate away during call -> green bar shows |
| E2EE safety number verification | Both devices show same safety number |
| Islamic features toggle | Enable/disable Islamic features in settings |
| Light mode | All screens render correctly (known broken across ~200 screens) |
| RTL layout | Arabic/Urdu text and layout direction correct |

### TestFlight Beta

**Who to invite (5-10 people):**
- Mix of Muslims and non-Muslims
- Mix of iPhone and Android
- At least 1 RTL language user (Arabic, Urdu)
- At least 1 accessibility needs user

**What to test:**
- Full lifecycle: signup -> post -> message -> call -> delete account
- E2EE verification between two devices
- Islamic features toggle on/off
- Media upload/download
- Push notifications
- Crash monitoring via Sentry

---

## 7. App Store Submission

### App Store Listing (Apple)

**App name:** Mizanly
**Subtitle (30 chars):** "Private Social, By Design"
**Category:** Primary: Social Networking. Secondary: Lifestyle.
**NOT "Islamic" or "Religion" category.**

**Description:**
```
Mizanly is the social app that puts your privacy first.

Every message, call, photo, and video is end-to-end encrypted using the
Signal Protocol — the same technology trusted by journalists, activists,
and security experts worldwide. Not even Mizanly can read your conversations.

FEATURES
- Stories, posts, reels, and video sharing
- End-to-end encrypted messaging
- Encrypted voice and video calls
- Groups and communities
- Content discovery feed
- Rich media: GIFs, stickers, reactions

PRIVACY BY DESIGN
- Signal Protocol end-to-end encryption
- Zero-knowledge architecture
- No ads. No tracking. No data selling.
- Open security documentation

FOR THE MUSLIM COMMUNITY
Mizanly is the first social app with built-in Islamic features
that respect your privacy:
- Prayer times and Qibla direction
- Quran reader
- Islamic calendar with Ramadan mode
- Halal restaurant and mosque finder
- Scholar Q&A
- All optional — enable in Settings

Built by a developer from Uzbekistan who believes everyone deserves
private communication, regardless of where they live or what they believe.
```

**Keywords (100 chars):**
```
privacy,encrypted,messaging,social,islamic,muslim,prayer,halal,e2ee,secure,signal,private,chat
```

**Privacy Nutrition Label:** Nearly empty compared to competitors. This is a selling point.

### Screenshots

**Required sizes:**
- 6.7" iPhone 15 Pro Max: 1290 x 2796
- 6.5" iPhone 11 Pro Max: 1242 x 2688
- 5.5" iPhone 8 Plus: 1242 x 2208
- At least 3, up to 10

**Screenshot order:**
1. Feed/home screen — "Your private social feed"
2. Messaging — "End-to-end encrypted conversations"
3. Stories/Reels — "Share moments, privately"
4. Call screen — "Encrypted voice and video calls"
5. Privacy settings — "You control your data"
6-7. Islamic features — "Optional: prayer times, Quran, and more"

First 3 screenshots should NOT show Islamic features (mainstream appeal first).

### Google Play Listing

Same content plus:
- Feature graphic: 1024 x 500
- Data Safety section
- Content rating questionnaire (IARC)
- One-time registration fee: $25

### Apple IAP Integration (BLOCKER)

Apple rejects apps that sell digital goods (coins) via Stripe. You must use Apple In-App Purchase.

**Required:**
- StoreKit 2 integration for iOS coin purchases
- Google Play Billing for Android
- Server-side receipt validation
- Stripe stays for: physical goods (commerce), web purchases

**Apple Small Business Program:** <$1M/year = Apple takes 15% instead of 30%. Enroll immediately.

### Common Rejection Reasons

| Rejection | Prevention |
|---|---|
| 3.1.1 In-App Purchase required | Sell coins/subscriptions via IAP, not Stripe |
| 1.2 User Generated Content | Published reporting, blocking, moderation docs |
| 5.1.1 Data Collection | Complete privacy nutrition label accurately |
| 2.1 Performance — crashes | Thorough TestFlight testing first |
| 4.0 Design — minimum functionality | App must be useful, not just a login screen |

### Encryption Export Compliance

US export regulations require declaring encryption use. File a Self-Classification Report with BIS (Bureau of Industry and Security). Routine for any app using HTTPS. Free, online form.

---

## 8. Launch Strategy

### Soft Launch (Week 1-4 Post-Approval)

Don't do a "big launch." Quiet rollout:
1. App approved on stores
2. Don't promote immediately
3. Let 100-200 organic users find it (waitlist + word of mouth)
4. Watch for: crashes, E2EE failures, server load, moderation needs
5. Fix critical issues before wider promotion

### Waitlist Conversion

**Email sequence:**

```
Email 1 (Day of approval): "Mizanly is live. You're in."
- Direct App Store / Play Store link
- "You were early. You believed in private social."
- No Islamic messaging (universal appeal)

Email 2 (Day 3): "Your conversations are now encrypted"
- Simple E2EE explainer
- "Not even we can read your messages"
- Invite friends (referral code)

Email 3 (Day 7, segmented to Muslim signups only):
"Built for your faith, too"
- Introduce Islamic features
- "Enable prayer times, Quran, and halal finder in Settings"
```

### Launch Platforms

| Platform | When | How |
|---|---|---|
| Product Hunt | Week 2 (after soft launch bugs fixed) | "Privacy-first social app with Signal Protocol E2EE" |
| Hacker News | Same week | "Show HN: I built a privacy-first social app (276K LOC, solo founder)" |
| Reddit r/privacy | Week 3 | Authentic post, not an ad. Explain the architecture. |
| Reddit r/degoogle | Week 3 | Same approach |
| Reddit r/islam | Week 4 (after privacy community validation) | "Muslim dev here — built a social app with E2EE + Islamic features" |

---

## 9. Growth Channels

### Free Channels (Do First, Exhaust Before Spending Money)

| Channel | Strategy | Audience |
|---|---|---|
| **Reddit** | r/privacy, r/degoogle, r/privacytoolsIO — post authentically about architecture. r/islam, r/muslimtechnet — after privacy community validation | Privacy-conscious + Muslim tech |
| **Hacker News** | "Show HN" post. Solo founder + technical depth is compelling. 276K LOC in 18 days is a story. | Developers, tech early adopters |
| **Product Hunt** | Launch day post. Privacy apps perform well on PH. | Tech early adopters, journalists |
| **Privacy YouTubers** | Email Techlore, The Hated One, Rob Braxman — ask for review. Free if they're interested. | Privacy community (100K-1M subscribers each) |
| **Muslim influencers** | After organic growth starts. Frame: "finally an app that respects our privacy AND our faith" | Muslim youth |
| **Mosque communities** | Physical flyers with QR code. "Your private social app — built by a Muslim, for everyone." | Local Muslim communities |
| **University MSAs** | Muslim Student Associations. Young, tech-savvy, care about privacy. | 18-25 Muslim students |
| **Twitter/X** | Privacy-focused account. Post about encryption news, data breaches, surveillance. | Tech + privacy audience |
| **Tech blogs** | Pitch story to TechCrunch, The Verge, Wired. Angle: "solo founder, 276K LOC, E2EE social app" | General tech audience |

### Paid Channels (Later, When Revenue Supports It)

| Channel | Strategy | Est. Cost |
|---|---|---|
| App Store Search Ads | Bid on "private messaging," "encrypted chat," "Signal alternative" | $0.50-3 per install |
| Instagram/TikTok ads | Target 18-34, privacy or Islamic content interests | $1-5 per install |
| YouTube pre-roll | Target privacy and Islamic content channels | $0.05-0.15 per view |
| Podcast sponsorship | Pay podcasts to read your ad mid-episode. Standard: $15-50 CPM (cost per 1,000 downloads). A 50K-download podcast = ~$1,250 per ad read. | $500-5K per episode |

**Podcast ad marketplaces (for when you're ready):**
- Podcorn (podcorn.com) — browse podcasts, see prices
- AdvertiseCast — same concept
- Spotify Ad Studio — self-serve on Spotify-hosted shows
- Direct outreach — email podcast, ask for media kit

### Viral Growth Mechanism: Goodbye Story

Per spec at `docs/features/EXIT_STORY_SPEC.md`:
1. User imports Instagram/TikTok data into Mizanly (ZIP import)
2. Mizanly generates shareable "Goodbye Story" image: "3 years, 487 posts — I'm moving to Mizanly"
3. User shares on old platform stories
4. Followers see it -> download Mizanly -> repeat

Build this before or right after launch. It's the primary viral loop.

### Data Import (User Acquisition #1)

Per spec at `docs/features/DATA_IMPORT_ARCHITECTURE.md`:
- Tier 1: ZIP import (user uploads platform data export). No API approval needed.
- Tier 2: OAuth import (Instagram Graph API, TikTok Display API). Needs API approval.
- Build ZIP import first. It covers 95% of use cases.

---

## 10. Content & Social Media Strategy

### Posting Mix

**70% privacy/security content (mainstream appeal):**
- Data breach news + "this wouldn't happen with E2EE"
- Government surveillance stories
- Comparison: what Instagram knows about you vs what Mizanly knows
- Simple encryption explainers
- Privacy tips

**20% product updates:**
- New features
- Milestones (1K users, 10K users)
- Behind-the-scenes development
- Security audit results

**10% Islamic content (for Muslim audience without alienating others):**
- "New: Ramadan mode dims your feed during prayer times"
- "Built-in Quran reader — no third-party app needed"
- Feature spotlights on Islamic extensions

### Tone

- Direct, not corporate
- Technical when relevant, simple by default
- Never preachy about privacy — show don't tell
- Never preachy about Islam — it's a feature, not a sermon
- Founder voice, not brand voice (at this stage)

---

## 11. Post-Launch Operations

### Monitoring (Set Up Day 1)

- **Sentry** (already integrated) — crashes, error rates
- **Railway metrics** — CPU, memory, requests
- **Upstash Redis** — memory usage, key count
- **Neon PostgreSQL** — connections, query latency
- **Custom dashboard:** DAU, MAU, messages/day, calls/day, signups/day

**Alert thresholds:**
- Error rate > 5% -> investigate immediately
- API p95 latency > 2s -> performance issue
- CPU > 80% -> scale Railway
- Redis memory > 70% -> check missing TTLs
- 0 signups in 24h -> something is broken

### Moderation Scaling

| Users | Moderation |
|---|---|
| 1-1K | You moderate manually. Check reports daily. |
| 1K-10K | 1 additional moderator (volunteer or paid) |
| 10K-50K | Moderation team or service |
| 50K+ | Dedicated trust & safety team |

**Content moderation stack:**
1. Automated: word filter (exists), PhotoDNA for CSAM on unencrypted content
2. User reports: in-app reporting (exists)
3. Human review: you reviewing reported content
4. Appeals: users can appeal (exists)

**Key rule:** Encrypted messages are NOT moderated. You can't. Only unencrypted content (public posts, profile photos, group icons, usernames) goes through moderation. Be transparent about this.

### User Support

**Before you can afford a support team:**
- support@mizanly.app
- FAQ page at mizanly.app/faq
- In-app Help section
- Response time goal: 24 hours

**Common support requests:**
- "How do I know my messages are encrypted?" -> Safety number verification guide
- "I forgot my password" -> Clerk handles this
- "Someone is harassing me" -> Block + report flow
- "How do I enable prayer times?" -> Settings -> Faith & Culture
- "Can you recover my messages from my old phone?" -> No. E2EE means we don't have them. (Have a compassionate template for this)

### Key Metrics

| Metric | Target | Why |
|---|---|---|
| D1 retention | >40% | Users come back next day |
| D7 retention | >20% | Users form a habit |
| D30 retention | >10% | Users are staying |
| Messages/DAU | >5 | People are actually chatting |
| Invites sent/user | >2 | Organic growth loop |
| Islamic features enabled % | Track (no target) | Understand audience mix |
| Crash-free rate | >99.5% | Stability |

---

## 12. Financial Operations

### Revenue Streams

| Stream | Implementation | Apple's Cut |
|---|---|---|
| Coins (in-app currency) | Apple IAP / Google Play Billing | 15% (<$1M/yr) or 30% |
| Creator subscriptions | Apple IAP | 15% after year 1 |
| Tips | Apple IAP for digital tips | 15% or 30% |
| Physical commerce | Stripe (Apple allows this for physical goods) | 0% to Apple |
| Promoted posts | Own ad system (no IAP) | 0% to Apple |

### Accounting

- Australian Pty Ltd: BAS (quarterly), tax return (annual), PAYG if paying yourself
- Use Xero (Australian, integrates with ATO)
- Get accountant familiar with tech startups

### R&D Tax Incentive

43.5% refundable offset on eligible R&D spend (under $20M turnover).
- Signal Protocol implementation: eligible
- Encryption protocol work: eligible
- Algorithm development: eligible
- Document EVERYTHING

$100K eligible R&D spend = $43,500 cash back from ATO.

### Australian Tax Residency

You remain Australian tax resident unless you physically move. Swiss incorporation doesn't change personal tax residency. You pay Australian tax on worldwide income including Swiss company profits attributed under CFC (Controlled Foreign Company) rules.

Get a tax advisor familiar with CFC rules + transfer pricing.

---

## 13. Fundraising

### Pitch Narrative

"Mizanly is a privacy-first social platform with [X]K users growing [Y]% month-over-month. We're the only social app with both Signal Protocol E2EE AND a built-in Islamic lifestyle experience — serving an underserved market of 2 billion Muslims within a total addressable market of everyone who cares about privacy.

Our founder built 276K lines of code in 18 days. We have 633 E2E encryption tests. Our architecture is zero-knowledge.

We're raising $X to: hire 3 engineers, complete Swiss incorporation, launch data import from Instagram/TikTok, and reach 500K users."

### Investor Objections

| Concern | Response |
|---|---|
| "Isn't this just Signal?" | Signal is messaging. We're a full social platform — stories, reels, feed, commerce, communities. |
| "Why would non-Muslims use this?" | Same reason people use Signal — privacy. Islamic features are optional extensions. |
| "How do you make money without ads?" | Coins, creator subscriptions, tips, commerce. Discord + TikTok model without surveillance. |
| "Government risk?" | Swiss incorporation. Zero-knowledge architecture. Same risk profile as Signal (10+ years). |
| "Can you compete with WhatsApp?" | Not competing for all 2B users. Competing for the 200M who want privacy + faith integration. |

### Where to Pitch

**Muslim-focused VCs:** Faith Capital, Halalah Fund, Algebra Ventures (Egypt)
**Privacy/security VCs:** a16z (funded Signal), USV (funded privacy tools)
**Australian VCs:** Blackbird, Square Peg, AirTree
**Grants:** Mozilla Foundation, Open Technology Fund, EFF

---

## 14. Swiss Migration

### Trigger Points (Migrate When ANY Happens)

- 100K+ users
- VC funding closes
- Any government inquiry about user data
- Australian encryption law landscape worsens

### Migration Steps

1. Engage Swiss lawyer (CHF 3-7K)
2. Deposit CHF 20K capital
3. Notarization + registration (4-6 weeks, remote via power of attorney)
4. Transfer App Store listing to Swiss entity
5. Update privacy policy to cite Swiss FADP
6. Announce to users

### User Communication

```
Subject: Your privacy just got stronger

Today, Mizanly is officially governed by Swiss law — one of the
strongest privacy jurisdictions in the world, home to ProtonMail
and Threema.

What this means:
- Your data is protected by the Swiss Federal Data Protection Act
- Government requests must go through Swiss courts
- Switzerland has no mandatory encryption backdoor laws
- Switzerland is not a member of any intelligence-sharing alliance

What hasn't changed:
- Messages are still end-to-end encrypted
- We still cannot read your conversations
- Your encryption keys never leave your device
```

---

## 15. Threat Modeling at Scale

### Scenario 1: Terrorist Attack Association

**Trigger:** Attackers used Mizanly. Media headlines: "encrypted app used by terrorists."

**Response:**
- Transparency report showing you cooperated with all lawful Swiss orders
- Public statement: "We provided all metadata within legal capability. Message content is E2EE — same as iMessage, WhatsApp, and Signal."
- Crisis PR firm on retainer BEFORE this happens
- Pre-written response templates ready

**Survivability:** 6/10. Signal survived this. But "Muslim app" gets 10x more scrutiny — the universal positioning helps here.

### Scenario 2: CSAM Discovery

**Trigger:** CSAM ring found using Mizanly group chats.

**Response:**
- Proactive CSAM detection on ALL unencrypted content (profile photos, public posts)
- NCMEC registration and active reporting
- Cooperate fully on metadata
- Published zero-tolerance policy
- In-app user reporting tools

**Survivability:** 4/10. This is the existential threat. Proactive preparation is the only defense.

### Scenario 3: Country-Level Ban

**Trigger:** Indonesia (largest market) bans Mizanly for refusing to provide decryption.

**Response:**
- VPN/proxy guidance for affected users
- Accept the loss, focus on rule-of-law markets
- Telegram survived Russia ban (2018-2020). Russia eventually lifted it.

**Survivability:** 7/10. You survive but smaller.

### Scenario 4: Swiss Law Changes

**Trigger:** Switzerland joins EU Chat Control framework.

**Response:**
- Migrate infrastructure to Panama entity
- Challenge in Swiss courts (Proton, Threema, Wire would be allies)
- Industry-wide fight, not just you

**Survivability:** 8/10.

### Scenario 5: Inside Job / Rogue Update

**Trigger:** Employee pushes update that exfiltrates keys. Runs 3 weeks before discovery.

**Prevention (implement before this happens):**
- Reproducible builds (users verify binary matches source)
- Multiple code reviewers for crypto-touching code
- Hardware security modules for signing keys
- Canary deployments (1% -> full rollout)
- Bug bounty program

**Survivability:** 3/10. Trust destruction is the hardest to recover from.

### Scenario 6: US Political Designation

**Trigger:** US State Department designates Mizanly as "platform of concern."

**Consequences:**
- Stripe/payment processing frozen
- Apple/Google "review" app (indefinite limbo)
- No criminal charge, no evidence, no due process

**Response:**
- Diversify payment processing (non-US processors)
- Legal challenge via civil liberties orgs (ACLU, EFF)

**Survivability:** 2/10. US controls app stores and payment rails. No jurisdiction solves this.

### Meta-Lesson

| Threat | Jurisdiction helps? | Architecture helps? | Nothing helps? |
|---|---|---|---|
| Terrorist PR | Partially | Yes (transparency) | Media narrative |
| CSAM accusation | No | Partially (proactive detection) | Political weaponization |
| Country ban | No | VPN workarounds | User loss |
| Law change | Migrate | Yes (zero-knowledge) | Trust erosion |
| Inside job | No | Yes (reproducible builds) | Trust destruction |
| US designation | No | No | Financial system control |

**At 50M users, the biggest risks aren't technical or legal — they're political.** The only defense is being so obviously legitimate, transparently operated, and proactively cooperative on what you CAN share, that political attacks don't stick.

---

## 16. Timeline & Budget

### Pre-Launch

| When | What | Cost |
|---|---|---|
| Now | Reposition messaging, rewrite landing page, design app icon | $200-500 |
| Week 1 | Register Australian Pty Ltd, get ABN | $576 |
| Week 2 | Apple Developer enrollment | $99 |
| Week 3-4 | EAS build, TestFlight, runtime verification | $0 |
| Week 5-6 | Fix critical bugs, IAP integration | $0 |
| Week 7 | Privacy policy, ToS, community guidelines, CSAM policy | $0-1K |
| Week 8 | App Store + Google Play submission | $25 |
| Week 9-10 | Review + likely 1 rejection + fix + resubmit | $0 |

### Launch

| When | What | Cost |
|---|---|---|
| Week 10-12 | Approved. Soft launch. Waitlist conversion. | $0 |
| Month 2-3 | Product Hunt, Hacker News, Reddit launches | $0 |
| Month 3-6 | Privacy community, YouTuber reviews, organic growth | $0 |
| Month 6-12 | Muslim community outreach: mosques, MSAs, influencers | $0-2K |

### Scale

| When | What | Cost |
|---|---|---|
| 100K users or VC | Swiss GmbH incorporation | ~AUD 50K |
| Ongoing | Swiss entity maintenance | ~AUD 20K/year |
| Revenue stage | Paid marketing (ads, podcast sponsorship) | Variable |

**Total cost to launch: ~$1,000-2,000**

Swiss migration is the big expense and waits until revenue or VC funding.

---

*This cookbook is a living document. Update as circumstances change. Verify all legal and financial information with qualified professionals before acting.*
