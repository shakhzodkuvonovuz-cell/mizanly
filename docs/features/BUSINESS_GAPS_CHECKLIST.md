# Business Gaps Checklist — Everything Non-Code That Must Be Done

> Created: March 30, 2026
> Status: Comprehensive inventory. Nothing started except domain + waitlist + landing page.
> Reality check: You can build the best app in the world and still fail if these aren't done.

---

## How to Use This Document

This is the non-code equivalent of the 2,500-finding audit. Every item here is something that, if missed, could block launch, kill growth, create legal liability, or cause the app to fail despite being technically excellent.

Items are marked:
- **[BLOCKER]** — Cannot launch without this
- **[PRE-LAUNCH]** — Must be done before public users touch the app
- **[POST-LAUNCH]** — Can be done after launch but soon
- **[AT-SCALE]** — Needed when growth demands it

---

## 1. Legal & Corporate

### Company Formation
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [BLOCKER] Company registration | Not done | Immediate | Can't raise money, open bank account, sign contracts, or submit to App Store without a legal entity. Options: Delaware C-corp (easiest for US investors, Stripe Atlas does it for $500), Australia Pty Ltd (local, R&D tax credits), UAE free zone (tax advantages). Consult a startup lawyer. |
| [BLOCKER] EIN / ABN / Tax ID | Not done | After registration | US: EIN from IRS (free). AU: ABN (free). Needed for bank account + App Store. |
| [BLOCKER] Business bank account | Not done | After registration | Separate from personal. Needed for Stripe payouts, Apple payments, expenses. |
| [PRE-LAUNCH] Trademark "Mizanly" | Not filed | High | File in AU (IP Australia ~$250), US (USPTO ~$350), UAE (~$1,000). Someone could squat the name. File NOW — takes 6-12 months to register but filing date establishes priority. |
| [PRE-LAUNCH] Domain protection | Partially done | Medium | mizanly.app owned. Also register: mizanly.com, mizanly.io, mizanly.org if available. Prevent squatting. |
| [PRE-LAUNCH] Founder IP assignment | Not done | High | Legal document assigning all code IP to the company (not you personally). Required before raising. |

### Legal Documents
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [BLOCKER] Privacy Policy | Not written | Immediate | App Store requires URL. GDPR requires it. Must cover: data collected, how used, third parties (Clerk, Stripe, Cloudflare, Sentry), data retention, deletion rights, cookie policy. Host at mizanly.app/privacy. Can use generators (Termly, iubenda) as starting point, then lawyer review. |
| [BLOCKER] Terms of Service | Not written | Immediate | App Store requires URL. Must cover: UGC license grant, prohibited content, account termination, dispute resolution, limitation of liability, governing law. Host at mizanly.app/terms. |
| [BLOCKER] Community Guidelines | Not written | Immediate | Users need to know rules. Moderation team needs enforcement framework. Cover: prohibited content (CSAM, terrorism, hate speech, nudity, harassment, spam, scams), consequences (warning → temp ban → permanent ban), appeals process. Separate from TOS — written in friendly human language, not legalese. |
| [PRE-LAUNCH] DMCA Agent Registration | Not done | High | Register with US Copyright Office ($6). Required to have safe harbor protection under DMCA. Without it, you're personally liable for user-uploaded copyrighted content. |
| [PRE-LAUNCH] GDPR Data Processing Agreement | Not written | High | If serving EU users. Document what data you process, legal basis (consent vs legitimate interest), data retention periods, sub-processors (Clerk, Stripe, Neon, Cloudflare, Sentry, Meilisearch). |
| [PRE-LAUNCH] Cookie/Tracking Consent | Not built | High | GDPR + ePrivacy Directive require consent before tracking. Show consent banner on first launch for EU users. |
| [PRE-LAUNCH] Age Verification Flow | Declared 16+ not enforced | High | App Store requires age gating for UGC apps. Implement: date of birth during registration, block users < 16 (or < 13 in US per COPPA). Store DOB, not just boolean. |
| [POST-LAUNCH] COPPA Compliance | Not assessed | Medium | If any users could be < 13 (they will try). Need: parental consent flow, restricted data collection, no behavioral advertising for minors. Parental controls module exists in code but needs legal review. |
| [POST-LAUNCH] DSA Compliance (EU) | Not assessed | Medium | Digital Services Act: transparency reports, trusted flaggers, user complaint mechanism. Required if serving EU users at scale. |
| [POST-LAUNCH] Australian eSafety | Not registered | Medium | Online Safety Act 2021: must have systems to detect and remove CSAM, register with eSafety Commissioner. You're in Australia — this applies directly. |
| [AT-SCALE] NCMEC Registration | Not done | Legal requirement | CyberTipline reporting for CSAM. Requires US legal entity. Criminal liability if you don't report. |
| [AT-SCALE] GIFCT Hash-Sharing | Not done | Medium | Global Internet Forum to Counter Terrorism. Hash-sharing for terrorist content. Requires membership application. |
| [AT-SCALE] Content Licensing Agreements | Strategy written | See spec | `docs/features/CONTENT_LICENSING_SPEC.md` — music, GIFs, fonts, UGC. |

### Insurance
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Cyber Liability Insurance | Not considered | High | Covers data breach costs (notification, legal fees, fines). One breach without insurance = bankruptcy. ~$1,000-5,000/yr for a startup. |
| [PRE-LAUNCH] D&O Insurance | Not considered | Before fundraising | Directors & Officers liability. Investors will require it before signing a term sheet. ~$2,000-5,000/yr. |
| [POST-LAUNCH] General Liability | Not considered | Medium | Covers claims arising from business operations. ~$500-2,000/yr. |
| [POST-LAUNCH] E&O / Professional Liability | Not considered | Medium | Covers claims of negligence in service delivery (e.g., prayer times wrong → user misses prayer → sues). Edge case but real. |

---

## 2. App Store Submission

### Apple App Store
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [BLOCKER] Apple Developer Program | Not enrolled | Immediate | $99/yr. Cannot build, test, or submit without it. Takes up to 48 hours to approve. |
| [BLOCKER] App icon (1024x1024) | 22KB placeholder | Immediate | Must be professional. Islamic geometric + emerald/gold. No transparency, no alpha channel. Also need adaptive icon for Android. |
| [BLOCKER] App name + subtitle | Not decided | High | Name: "Mizanly" (or "Mizanly — Muslim Social"). Subtitle: 30 chars max — "Community, Faith & Connection" or similar. |
| [BLOCKER] App description | Not written | High | 4,000 char max. First 3 lines visible without "more" — make them count. Mention: 5 spaces, E2E encryption, Islamic features, no ads (initially). |
| [BLOCKER] Keywords | Not researched | High | 100 chars. Research: "muslim social", "islamic app", "halal", "quran", "prayer times", "ummah". Use App Store Connect keyword tools + competitor keyword analysis. |
| [BLOCKER] Screenshots (6.7" + 6.5" + 5.5") | Not created | High | 3-10 screenshots per device size. Show: feed, chat (E2E badge), Quran, prayer times, reels, call screen. These ARE your marketing — most users decide to download based on screenshots alone. |
| [BLOCKER] App preview video (optional but powerful) | Not created | Medium | 15-30 second video showing the app in action. Autoplays in App Store listing. |
| [BLOCKER] Privacy nutrition labels | Not filled | High | App Store requires declaring: data collected, data linked to identity, data used for tracking. Must match your Privacy Policy. |
| [BLOCKER] Age rating | Not set | High | Questionnaire about content: UGC, social networking, mature themes. Will likely result in 17+ rating due to UGC. |
| [BLOCKER] Content rights declaration | Not done | High | Apple asks: "Does your app contain, display, or access third-party content?" Yes — UGC. Must have DMCA/takedown process. |
| [BLOCKER] Export compliance | Not answered | High | Apple asks about encryption. Your app uses E2E encryption (Signal Protocol). Must declare yes + provide documentation. May need US BIS encryption export classification (ECCN 5D002). |
| [BLOCKER] EAS Build configuration | Partially done | High | `eas.json` exists. Need: production profile, signing certificates, provisioning profiles. Run from `apps/mobile`. |

### Google Play Store
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [BLOCKER] Google Play Developer Account | Not checked | High | $25 one-time. Easier than Apple. |
| [BLOCKER] Data safety form | Not filled | High | Google's equivalent of Apple privacy labels. |
| [BLOCKER] Content rating questionnaire | Not done | High | IARC rating. Similar to Apple age rating. |
| [BLOCKER] Target audience declaration | Not done | High | Must declare if app targets children (it shouldn't). |
| [PRE-LAUNCH] Google Play feature graphic | Not created | Medium | 1024x500 banner image. Shown at top of Play Store listing. |

---

## 3. Launch Strategy

### Market Entry
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Soft launch countries | Not decided | High | Recommended: Australia (home market, English, small scale) → Turkey (85M Muslims, tech-savvy) → Indonesia (240M Muslims, largest Muslim market). Soft launch = limited App Store availability, fix bugs with real users before global. |
| [PRE-LAUNCH] Soft launch duration | Not decided | High | Recommended: 4-8 weeks. Enough to find critical bugs, validate onboarding, measure retention. |
| [PRE-LAUNCH] Launch metrics gates | Not defined | High | Don't go global until: D1 retention > 60%, D7 > 30%, crash rate < 1%, avg session > 5 min, NPS > 40. |
| [PRE-LAUNCH] Ramadan 2027 target | Mentioned, no plan | High | Ramadan starts ~Feb 28, 2027. Working backward: global launch Jan 2027 → soft launch Nov 2026 → beta Sept 2026 → fixes complete Aug 2026. That's 5 months from now. |
| [PRE-LAUNCH] Launch announcement plan | Not planned | Medium | Coordinate: App Store listing live + social media posts + press outreach + influencer posts + waitlist email blast — all same day. |

### Beta Testing
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] TestFlight beta plan | Not planned | High | Phase 1: 10-20 close contacts (friends, family). Phase 2: 50-100 from waitlist. Phase 3: 500 open beta. Each phase: 1-2 weeks, collect feedback, fix critical issues before next phase. |
| [PRE-LAUNCH] Beta feedback channel | Not decided | High | Options: in-app feedback form, dedicated Telegram/Discord for beta testers, Google Form, or dedicated email. Need structured feedback, not just "it crashed." |
| [PRE-LAUNCH] Beta tester selection criteria | Not defined | Medium | From waitlist: diverse devices (iOS + Android), diverse countries (English + Arabic + Turkish), mix of ages (18-35), mix of tech savviness. |
| [PRE-LAUNCH] Beta incentives | Not planned | Medium | Early access badge on profile, free Gold subscription for 3 months, "Founding Member" status. Make beta testers feel special — they become your evangelists. |

---

## 4. Marketing & Growth

### Social Media Presence
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [BLOCKER] Claim @mizanly on all platforms | Not done | Immediate | Instagram, TikTok, X/Twitter, YouTube, LinkedIn, Threads, Facebook, Pinterest, Snapchat. Even if you don't post — claim the handle. Someone WILL squat it once you launch. |
| [PRE-LAUNCH] Social media content plan | Not planned | High | Start posting 3-6 months before launch. Teasers, development journey, Islamic content, "coming soon" hype. Build audience BEFORE the app exists in App Store. |
| [PRE-LAUNCH] mizanly.app social links | Not added | High | Landing page should link to all social profiles. |

### Content Marketing
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Blog at mizanly.app/blog | Not built | Medium | SEO-driven Islamic content: "Best Quran apps 2027", "How to build Islamic habits", "Privacy in social media — an Islamic perspective". Drives organic discovery. |
| [PRE-LAUNCH] SEO strategy | None | Medium | Target keywords: "muslim social media app", "islamic social network", "halal social media", "private messaging app for muslims". |
| [POST-LAUNCH] YouTube channel | Not started | Medium | App tutorials, Islamic content, founder journey, community highlights. |

### Influencer & Creator Strategy
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Identify 50 target creators | Not started | High | Islamic educators (Mufti Menk, Nouman Ali Khan tier OR micro-influencers with 10-100K), halal food bloggers, modest fashion influencers, Muslim tech reviewers, nasheed artists. |
| [PRE-LAUNCH] Creator partnership offer | Not defined | High | What do you offer? Early access, verification badge, Creator Pro free for 1 year, featured on discover page, revenue share? |
| [PRE-LAUNCH] Creator onboarding kit | Not created | Medium | Welcome email, how to set up profile, content tips, how to import from Instagram, how the algorithm works, how to earn money. PDF or video series. |
| [POST-LAUNCH] Creator fund | Not planned | Medium | Set aside $X/month to pay top creators for exclusive content. TikTok Creator Fund model — pays per view. Incentivizes content creation on Mizanly instead of Instagram. |
| [POST-LAUNCH] Brand partnership program | Not planned | Later | Connect halal brands with creators for sponsored content. Revenue: take 10-20% of deal value. |

### Growth Mechanics
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Referral system (in-app) | Waitlist code only | High | In-app: "Invite 5 friends → get Gold free for 1 month." Viral loop. Must be: easy to share (one-tap share link), rewarding (clear incentive), trackable (attribution). |
| [PRE-LAUNCH] Share to other platforms | Basic share exists | Medium | When sharing a post/reel to Instagram/WhatsApp, include Mizanly watermark + download link. Free marketing on every shared piece of content. |
| [POST-LAUNCH] Challenges / viral mechanics | Not planned | Medium | "30-day Quran challenge", "Ramadan dhikr challenge" — content that naturally gets shared and invites new users. |
| [POST-LAUNCH] ASO (App Store Optimization) | Not started | High | Optimize: title, subtitle, keywords, screenshots, description. A/B test screenshots. Monitor rankings for "muslim app", "islamic social media". Tools: AppFollow, Sensor Tower, App Annie. |
| [POST-LAUNCH] App Store ratings prompt | Code exists (expo-store-review) | Medium | Prompt after 7th session (not first use — annoying). Target: 4.7+ rating. |

### Press & Media
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Press kit | Not created | High | One-pager: what Mizanly is, founder story, key stats, screenshots, logo assets (various formats), press contact. Host at mizanly.app/press. |
| [PRE-LAUNCH] Media outreach list | Not started | Medium | Tech: TechCrunch, The Verge, Wired, Product Hunt. Muslim: AboutIslam, MuslimMatters, Ilmfeed, 5Pillars. Australian: SmartCompany, StartupDaily, AFR. |
| [PRE-LAUNCH] Founder story angle | Not crafted | Medium | Solo founder built 300K LOC in a month. Uzbek in Sydney. Competing with UpScrolled 250m away. E2E encryption for Muslim community. This is a compelling narrative — craft it for journalists. |
| [PRE-LAUNCH] Product Hunt launch | Not planned | Medium | Coordinate with beta launch. Get 5-10 people to upvote + comment on launch day. "Featured" on Product Hunt = 10K+ signups. |
| [PRE-LAUNCH] Launch video (60 seconds) | Not created | Medium | "What is Mizanly?" — show the 5 spaces, E2E encryption badge, Islamic features, "designed with our values in mind." For social media + App Store preview. |

### Email Marketing
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Email service configured | Resend configured, domain not verified | High | Verify Resend domain (DNS TXT record). Test deliverability. |
| [PRE-LAUNCH] Waitlist → launch email | Not written | High | The moment the app is live: email all waitlist signups. "You've been waiting. It's here." Include App Store link + referral code. |
| [PRE-LAUNCH] Onboarding drip sequence | Not planned | High | Day 0: Welcome + complete profile. Day 1: Follow 5 suggested accounts. Day 3: Create your first post. Day 5: Try Quran room. Day 7: Invite 3 friends (referral link). Day 14: Upgrade to Gold (free trial). |
| [POST-LAUNCH] Re-engagement emails | Not planned | Medium | User inactive 7 days: "You have 3 unread messages." User inactive 14 days: "See what you missed." User inactive 30 days: "Your friends posted X new things." |
| [POST-LAUNCH] Newsletter (weekly) | Not planned | Low | Weekly digest: trending posts, new features, Islamic date, community highlights. |

---

## 5. User Experience (Non-Code)

### Cold Start Problem
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [BLOCKER] Seed content (500+ posts) | None | Critical | **THIS IS THE #1 NON-CODE PRIORITY.** An empty app = dead app. Every social app that died, died here (Google+, Ello, Vero, Clubhouse). You need content in ALL 5 spaces before any public user sees the app. Plan: create 10 accounts yourself, post 50 pieces each across Saf/Bakra/Majlis/Minbar/Stories. Or recruit 50 creators who each post 10 pieces. |
| [BLOCKER] Seed creators (50-100) | Not recruited | Critical | Personally recruit Islamic content creators. Offer: early access + verification + Creator Pro free + featured placement. They need to POST DAILY before and after launch. A creator who signs up and never posts is worse than no creator. |
| [BLOCKER] Auto-follow on signup | Not built | High | New users should auto-follow 10-20 recommended accounts so their feed is populated on first open. Show curated "Suggested for you" list during onboarding. |
| [BLOCKER] Discover feed populated | Partially built | High | Discover/explore page must show interesting content from day 1. Curate manually until algorithm has enough data. |
| [PRE-LAUNCH] Seed engagement | Not planned | High | Your seed creators must engage with EACH OTHER's content. Likes, comments, shares. The app must feel alive. 50 creators posting but no engagement = still feels dead. |
| [PRE-LAUNCH] Content calendar (first 30 days) | Not planned | High | Plan what gets posted, by whom, when. Islamic holidays, trending topics, educational content, community questions. Don't leave it to chance. |

### Onboarding Flow
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Onboarding flow review | Code exists, not validated | High | Walk through the entire flow yourself on a real device. Register → profile setup → interest selection → follow suggestions → first feed view. Time it. If > 3 minutes to reach feed content, simplify. |
| [PRE-LAUNCH] Interest selection | Exists in code | Verify | Does selecting "Quran", "Fashion", "Food" actually affect the feed? Or is it stored but unused? |
| [PRE-LAUNCH] First-time user tutorial | Not built | Medium | Subtle tooltips on first use: "Swipe to see Bakra (reels)", "Long-press to save", "Tap to enter Quran room." Not a modal tutorial — contextual hints. |
| [PRE-LAUNCH] "Aha moment" acceleration | Not designed | High | What's the one action that predicts retention? For Instagram: posting a photo. For WhatsApp: sending a message. For Mizanly: probably following someone + seeing their content in feed. Drive users to that moment within first 2 minutes. |

### Content Moderation Operations
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Moderation playbook | Not written | High | Document for moderators: what's allowed, what's not, escalation path, response times, ban durations, appeal process. Not the public Community Guidelines — this is the internal operations manual. |
| [PRE-LAUNCH] Moderation queue workflow | Backend built, no process | High | Who checks the queue? How often? What tools do they use? (Admin dashboard needed — currently no web UI.) Target: < 24h review time for reports. |
| [PRE-LAUNCH] Moderation team plan | Just you | Medium | At 0-10K users: you moderate. At 10K-50K: hire 1-2 part-time moderators (different timezones). At 50K+: outsource to moderation service or hire team. Budget $15-25/hr for human moderators. |
| [POST-LAUNCH] Trust & Safety policy | Not written | Medium | Escalation for: threats of violence → law enforcement. CSAM → NCMEC + law enforcement. Self-harm → crisis resources. Terrorism → relevant authorities. Document who to contact in each country you operate in. |
| [POST-LAUNCH] Moderator wellbeing | Not considered | Medium | Moderators see the worst content. Need: content exposure limits, mental health support, rotation policies. This is a legal requirement in some jurisdictions (EU DSA). |

---

## 6. Operations

### Support
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Support email | Not set up | High | support@mizanly.app. Must exist before launch. Even if it's just you replying. |
| [PRE-LAUNCH] Support tool | Not chosen | Medium | Options: Intercom (expensive but good, $74/mo), Crisp (free tier), Freshdesk (free tier), or just email. At < 10K users, email is fine. |
| [PRE-LAUNCH] FAQ / Help Center | Not written | High | 20-30 articles covering: account setup, privacy settings, how to report, how to delete account, payment questions, E2E encryption explanation. Host at mizanly.app/help or in-app. |
| [POST-LAUNCH] In-app feedback | Not built | Medium | "Report a bug" or "Send feedback" button in settings. Captures: screenshot, device info, app version, user description. Sends to support channel. |
| [POST-LAUNCH] Status page | Not set up | Medium | status.mizanly.app — shows current system status. Users check this when app is down instead of flooding support. Free: Instatus, Cachet, or GitHub Pages. |

### Incident Response
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Incident runbook | Not written | High | Document: what to do when server goes down, database is unreachable, Redis is full, API is returning 500s, app is crashing, security breach detected. Step-by-step for each scenario. |
| [PRE-LAUNCH] Alerting | Sentry configured | Medium | Sentry catches errors. Also need: Railway health alerts, Neon connection alerts, Upstash memory alerts, Cloudflare traffic spike alerts. Configure thresholds: error rate > 5% → alert, response time > 2s → alert. |
| [PRE-LAUNCH] On-call plan | Just you | Medium | At launch: you're on call 24/7 (unsustainable). Post-hire: rotation with backend engineer. Need: PagerDuty or Opsgenie account, phone notifications for critical alerts. |
| [PRE-LAUNCH] Backup & recovery | Not tested | High | Can you restore the database from Neon's point-in-time recovery? Have you tested it? Can you redeploy from git in < 10 minutes? Document and test. |
| [POST-LAUNCH] Post-mortem process | Not defined | Medium | After every outage > 5 minutes: write post-mortem (what happened, timeline, root cause, what we'll fix). Publish to status page. Builds trust. |

---

## 7. Analytics & Metrics

### Product Analytics
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Analytics SDK | Sentry only (errors) | High | Need behavior tracking: PostHog (free self-hosted, privacy-friendly), Mixpanel (free tier 20M events/mo), or Amplitude (free tier). PostHog recommended — open source, can self-host (data sovereignty for Muslim users), generous free cloud tier. |
| [PRE-LAUNCH] Core events defined | Not defined | High | Must track: `app_open`, `signup_complete`, `onboarding_complete`, `first_post`, `first_follow`, `first_message`, `first_like`, `feed_scroll_depth`, `session_duration`, `screen_viewed`, `feature_used`. |
| [PRE-LAUNCH] KPI dashboard | None | High | Daily view of: DAU, MAU, new signups, posts created, messages sent, session length, D1/D7/D30 retention. Use PostHog dashboards or Grafana. |
| [PRE-LAUNCH] Funnel tracking | None | High | Register → onboard → first post → first follow → D7 return → D30 return → paid conversion. Identify where users drop off. |
| [POST-LAUNCH] A/B testing integration | Backend built, no mobile | Medium | Wire A/B testing service to mobile. Test: onboarding flow, feed algorithm weights, subscription pricing, UI variations. |
| [POST-LAUNCH] Attribution tracking | None | Medium | Where do users come from? UTM parameters on App Store links. Branch.io or Adjust for deep link attribution. Know which marketing channel works. |
| [POST-LAUNCH] Revenue analytics | None | Medium | Track: ARPU (average revenue per user), ARPPU (per paying user), LTV (lifetime value), CAC (customer acquisition cost), LTV:CAC ratio (must be > 3:1). |

### Reporting
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [POST-LAUNCH] Weekly metrics email | None | Medium | Auto-send to yourself (and later, team): key metrics, trends, notable events. |
| [POST-LAUNCH] Investor dashboard | None | Later | When raising: share read-only metrics dashboard with potential investors. Shows growth trajectory. |
| [AT-SCALE] DSA transparency report | None | Legal (EU) | Digital Services Act requires publishing content moderation statistics. |

---

## 8. Financial

### Accounting & Banking
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [BLOCKER] Business bank account | Not opened | Immediate | Required for: receiving Apple/Google payments, Stripe payouts, paying for services. Can't operate commercially without it. |
| [PRE-LAUNCH] Accounting software | None | High | Xero (popular in AU, $29/mo) or QuickBooks. Track every expense from day 1. Investors and tax authorities will ask. |
| [PRE-LAUNCH] Expense tracking | None | High | Every dollar spent on: domains, hosting, services, software, contractor payments — documented and categorized. |
| [PRE-LAUNCH] R&D Tax Credit application | Not started | High | Australia offers 43.5% refundable tax offset for R&D by small companies. Your entire development cost qualifies. At $0 revenue, this is FREE MONEY from the government. Consult R&D tax specialist — could recover $30-50K+ of dev costs. |

### Financial Planning
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Financial model (spreadsheet) | None | Before fundraising | Excel/Google Sheets: monthly projections for 36 months. Revenue (by stream), costs (infra, team, marketing), cash balance, break-even month. Investors want this, not markdown tables. |
| [PRE-LAUNCH] Unit economics | Not calculated | Before fundraising | CAC (customer acquisition cost), LTV (lifetime value), payback period. For a social app: LTV should be > 3x CAC. |
| [PRE-LAUNCH] Runway calculation | Not done | Before fundraising | At current burn rate ($X/mo), how many months until $0? Critical for deciding when to raise. |
| [POST-LAUNCH] Revenue recognition | Not set up | When revenue starts | Subscription revenue recognized monthly, not upfront. Gift/coin revenue recognized at purchase. Apple pays net-45 days. |
| [AT-SCALE] Transfer pricing | Not applicable yet | If multi-entity | If company is in Australia but has US entity: transfer pricing rules apply to inter-company transactions. |

---

## 9. Branding & Design

### Visual Identity
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [BLOCKER] App icon | 22KB placeholder | Immediate | Need: 1024x1024 PNG for App Store, adaptive icon for Android. Design: Islamic geometric pattern or stylized "M" in emerald + gold. Hire a designer ($100-500 on Fiverr/99designs) or design yourself. |
| [BLOCKER] Splash screen | Placeholder | Immediate | First thing users see. Logo + brand color background. Simple, fast. |
| [PRE-LAUNCH] Brand guidelines document | None | High | Define: primary colors (emerald #0A7B4F, gold #C8963E), typography (Outfit + DM Sans + Amiri), logo usage rules, spacing, don'ts. PDF for external partners, press, designers. |
| [PRE-LAUNCH] Logo variations | Only text/icon in landing page | High | Need: full logo (icon + wordmark), icon only, white version, dark version, social media avatar sizes (circle crop). Various formats: PNG, SVG, PDF. |
| [PRE-LAUNCH] App Store screenshots | None | High | Design 6 screenshots per platform. Show: feed, chat, Quran, prayer times, reels, calling. Use device mockup frames. Tools: Figma + screenshots.pro or LaunchMatic. |
| [PRE-LAUNCH] Tone of voice document | None | Medium | How does Mizanly speak? Warm, respectful, slightly formal but not corporate. "Assalamu alaikum" in welcome, not "Hey!" Consistent across: push notifications, error messages, emails, App Store description, social media, support replies. |
| [PRE-LAUNCH] Promotional graphics | None | Medium | Social media banners, App Store feature graphic (Google Play), press kit images, email headers. Consistent visual language. |
| [POST-LAUNCH] Video assets | None | Medium | App Store preview video (30s), social media launch video (60s), tutorial videos for Help Center. |

---

## 10. Partnerships

### Islamic Authority Partnerships
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Islamic scholar endorsements | None | High | Endorsement from 2-3 respected scholars = instant credibility with conservative Muslim audience. Approach local Sydney scholars first (easier), then larger figures. Offer: verified account, exclusive platform features, content promotion. |
| [PRE-LAUNCH] Mosque network partnerships | None | Medium | Partner with mosque associations (Islamic Council of NSW, Islamic Council of Victoria). Offer: mosque finder feature uses their data, mosque announcements channel, community building tools. |
| [POST-LAUNCH] Halal certification bodies | None | Medium | Halal finder feature needs authoritative data. Partner with: AFIC (Australia), JAKIM (Malaysia), MUI (Indonesia), HMC (UK). |
| [POST-LAUNCH] Islamic university partnerships | None | Medium | Al-Azhar (Egypt), IIU (Malaysia), Medina University — student user base, scholarly content, academic credibility. |
| [POST-LAUNCH] Muslim organization partnerships | None | Later | ISNA (US), MCB (UK), ICNSW (AU) — community reach, event promotion, institutional credibility. |

### Commercial Partnerships
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [POST-LAUNCH] Nasheed artist partnerships | None (strategy in licensing spec) | Medium | Direct partnerships with artists for in-app music. See `CONTENT_LICENSING_SPEC.md`. |
| [POST-LAUNCH] Halal brand partnerships | None | When ads launch | First advertisers. Halal restaurants, modest fashion, Islamic finance, travel. Build relationships before you need them. |
| [POST-LAUNCH] Islamic fintech partnerships | None | Later | Halal investment apps, Islamic banking — cross-promotion, integration (zakat calculator → investment platform). |
| [AT-SCALE] Telco partnerships | None | At scale | Carrier billing for subscriptions (huge in Indonesia, Pakistan, Bangladesh where credit cards are rare). |
| [AT-SCALE] Payment gateway partnerships | Stripe only | At scale | Regional payment methods: GoPay (Indonesia), Easypaisa (Pakistan), bKash (Bangladesh). Critical for emerging market monetization. |

---

## 11. Localization & Cultural

### Language Quality
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Professional translation review | Machine-translated 6 of 8 languages | High | ar, tr, ur, bn, fr, id, ms — all machine-translated. A native speaker should review each. Budget: $500-1,000 per language (freelancer on Upwork/Fiverr for 2,800 keys). Priority: Arabic (largest market), Turkish (tech-savvy), Indonesian (largest Muslim country). |
| [PRE-LAUNCH] Cultural sensitivity review | Not done | High | Islamic content must be reviewed by someone knowledgeable. Example: is the prayer time calculation method (Hanafi vs Shafi'i) configurable? Are Shia users accommodated? Is Quran text from an accepted edition? |
| [POST-LAUNCH] Regional content adaptation | Not planned | Medium | Indonesian Muslims have different content preferences than Turkish or Arab Muslims. Feed algorithm should eventually account for regional Islamic culture. |
| [POST-LAUNCH] Local payment methods | Stripe only | Medium | Credit card penetration in Indonesia: 6%. In Pakistan: 3%. Need: carrier billing, digital wallets, bank transfer. Without local payment = no revenue from largest markets. |

### Cultural Considerations
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Gender interaction policies | Not defined | High | Some Muslim communities prefer gender-separated spaces. Consider: optional "brothers/sisters only" communities, privacy controls for who can see/message. Don't force — offer as option. |
| [PRE-LAUNCH] Sect sensitivity | Not addressed | High | Sunni/Shia/Sufi/Ibadi — content and features should be inclusive. Don't hard-code one school of thought. Prayer time calculation methods should be selectable. |
| [PRE-LAUNCH] Islamic calendar accuracy | Code exists (tabulated Umm al-Qura) | Verify | Different countries use different calendar methods. Saudi Arabia (Umm al-Qura), Turkey (Diyanet), Pakistan (moon sighting). Consider: allow user to select calendar method. |
| [POST-LAUNCH] Ramadan mode optimization | Screen exists | Verify | Ramadan is your Super Bowl. The app must handle: increased usage during iftar/suhoor, themed UI, Quran reading challenges, community iftar events, charity campaigns. |

---

## 12. Infrastructure for Scale (Pre-Launch Gaps)

### Monitoring
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Uptime monitoring | None | High | External ping every 60s: UptimeRobot (free), Pingdom, or Better Uptime. Alert when api.mizanly.app is unreachable. |
| [PRE-LAUNCH] APM (Application Performance Monitoring) | None | Medium | Sentry Performance or New Relic or Datadog. Track: response times per endpoint, slow queries, error rates. |
| [POST-LAUNCH] Log aggregation | Railway logs only | Medium | Centralized logging: Logflare (free with Cloudflare), Logtail, or Papertrail. Search logs across API + Go services. |
| [POST-LAUNCH] Custom dashboards | None | Medium | Grafana dashboards: requests/sec, p50/p95 latency, active WebSocket connections, queue depths, Redis memory, DB connections. |

### Backup & Disaster Recovery
| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| [PRE-LAUNCH] Database backup verification | Neon handles backups | High | Neon provides point-in-time recovery. But have you TESTED restoring? Test it before you need it. |
| [PRE-LAUNCH] R2 media backup strategy | No backup | Medium | User-uploaded media in R2. If R2 loses data (rare but possible): is there a backup? Consider: cross-region replication or periodic backup to separate bucket. |
| [PRE-LAUNCH] Disaster recovery plan | Not written | Medium | Document: if Railway goes down → failover plan. If Neon goes down → recovery steps. If R2 loses data → what's the impact. RTO (recovery time objective) and RPO (recovery point objective) for each service. |
| [PRE-LAUNCH] Secret rotation plan | Not documented | Medium | What happens when a secret is compromised? Document: which secrets exist, how to rotate each, impact of rotation (downtime?), who has access. |

---

## Priority Summary

### Must Do THIS WEEK (before any more code)
1. Claim @mizanly on Instagram, TikTok, X, YouTube, LinkedIn
2. Start Apple Developer enrollment ($99)
3. Register Google Play Developer ($25)
4. Look into company registration (consult lawyer)
5. Start trademark search for "Mizanly"

### Must Do BEFORE Beta
1. Privacy Policy + Terms of Service (use generator → lawyer review)
2. Community Guidelines
3. DMCA Agent registration ($6)
4. App icon design
5. App Store screenshots
6. Seed content (500+ posts)
7. Recruit 50 seed creators
8. Support email (support@mizanly.app)
9. FAQ / Help Center (20 articles)
10. Analytics SDK integration (PostHog)
11. Auto-follow on signup
12. Incident runbook
13. Business bank account
14. Onboarding flow validation

### Must Do BEFORE Public Launch
1. Soft launch in 1-2 countries
2. Professional translation review (ar, tr, id priority)
3. Beta feedback incorporated
4. Retention metrics meet gates
5. Press kit
6. Waitlist launch email drafted
7. Referral system in-app
8. Email onboarding drip sequence
9. ASO (keywords, description optimized)
10. Uptime monitoring
11. Age verification flow
12. Financial model spreadsheet
13. R&D Tax Credit application (AU)
14. Cyber liability insurance

---

## Related Spec Documents
- `docs/features/DATA_IMPORT_ARCHITECTURE.md` — One Tap Import (user acquisition)
- `docs/features/EXIT_STORY_SPEC.md` — Goodbye Story (viral growth)
- `docs/features/PROFILE_THEMING_SPEC.md` — Creator Pro monetization
- `docs/features/MONETIZATION_SPEC.md` — 5 revenue streams
- `docs/features/CONTENT_LICENSING_SPEC.md` — Music, GIFs, fonts, UGC licensing
