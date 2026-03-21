# Agent 57 — Legal/Compliance Audit

**Scope:** Full codebase legal and regulatory compliance audit
**Files Audited:** 40+ files across auth, privacy, moderation, reports, users, admin, settings, parental-controls, health/legal, commerce, upload, retention, AI, schema, mobile auth screens, contact-sync, i18n
**Total Findings:** 34

---

## FINDING 1: NO AGE VERIFICATION AT SIGNUP — COPPA VIOLATION
**Severity:** LEGAL RISK — P0
**Regulation:** COPPA (Children's Online Privacy Protection Act), Australian Privacy Act, GDPR (Article 8)
**File:** `apps/api/src/modules/auth/auth.service.ts` (lines 28-61)
**File:** `apps/api/src/modules/auth/dto/register.dto.ts` (lines 1-33)
**File:** `apps/mobile/app/(auth)/sign-up.tsx` (lines 79-94)

**Evidence:** The `RegisterDto` collects only `username`, `displayName`, `bio`, `avatarUrl`, and `language`. No `dateOfBirth` field exists. The sign-up screen (`sign-up.tsx`) collects only email and password via Clerk, with no age gate, birthdate input, or age confirmation checkbox.

```typescript
// register.dto.ts — NO dateOfBirth field
export class RegisterDto {
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  language?: string;
}
```

The Prisma User model (`apps/api/prisma/schema.prisma`, line 229-493) has no `dateOfBirth` or `birthDate` field whatsoever.

**Legal Impact:** Under COPPA (US), platforms must obtain verifiable parental consent for users under 13. Under GDPR Article 8, parental consent is required for users under 16 (or 13-16 depending on member state). Under the Australian Privacy Act, collecting personal information from minors without parental consent is prohibited. The ToS states users must be 13+ (line 106 of `legal.controller.ts`), but this is never enforced. A 10-year-old can create an account freely.

**Required Fix:** Add `dateOfBirth` to RegisterDto and User model, enforce minimum age (13) at registration, implement age gate UI, and collect/store parental consent for users 13-17.

---

## FINDING 2: NO CSAM DETECTION OR REPORTING MECHANISM
**Severity:** LEGAL RISK — P0
**Regulation:** US Federal Law (18 USC 2258A), Australian Online Safety Act 2021, EU Digital Services Act
**File:** `apps/api/src/modules/moderation/moderation.service.ts` (entire file)
**File:** `apps/api/src/modules/ai/ai.service.ts` (entire file)
**File:** `apps/api/src/common/queue/processors/media.processor.ts` (entire file)

**Evidence:** A codebase-wide search for `CSAM`, `csam`, `child exploit`, `child abuse`, `child safety`, `PhotoDNA`, `perceptual hash`, `NCMEC` returned ZERO matches. There is:
- No perceptual hashing (PhotoDNA or similar) of uploaded images/videos
- No integration with NCMEC (National Center for Missing & Exploited Children) CyberTipline
- No integration with IWF (Internet Watch Foundation) URL list
- No automated scanning of uploaded media for CSAM
- The image moderation (`moderateImage` in `ai.service.ts`) uses Claude Vision for general content categories but has no CSAM-specific detection
- The word filter (`word-filter.ts`) has no CSAM-related terms

**Legal Impact:** Under 18 USC 2258A, electronic service providers who become aware of CSAM must report it to NCMEC within a specified timeframe. Under the Australian Online Safety Act 2021, the eSafety Commissioner can issue removal notices for child sexual exploitation material. Non-compliance can result in criminal liability. This is a LAUNCH BLOCKER for any social media platform that allows image/video uploads.

**Required Fix:** Implement perceptual hashing (PhotoDNA or open-source alternative), integrate NCMEC CyberTipline reporting, add CSAM-specific keywords to moderation, create mandatory reporting procedures.

---

## FINDING 3: AUSTRALIAN ONLINE SAFETY ACT 2021 NON-COMPLIANCE
**Severity:** LEGAL RISK — P0
**Regulation:** Australian Online Safety Act 2021 (Cth)
**File:** Platform-wide (no implementation exists)

**Evidence:** The platform founder is located in Surry Hills, Sydney, Australia. The Online Safety Act 2021 imposes specific obligations on social media services:

1. **Basic Online Safety Expectations (BOSE):** No documented compliance with BOSE reporting requirements. No mechanism to respond to eSafety Commissioner removal notices within 24 hours.
2. **Cyberbullying scheme for children:** No age-specific protections. The parental controls system (`parental-controls.service.ts`) exists but is opt-in and requires manual linking — there's no proactive detection.
3. **Adult cyber abuse scheme:** No specific handling for intimate image abuse (non-consensual intimate images).
4. **Online content scheme:** No compliance with industry codes registered under Division 7.
5. **No eSafety reporting mechanism:** No dedicated reporting category for image-based abuse.
6. **No transparency reporting** to the eSafety Commissioner.

The `ReportReason` enum (`schema.prisma`, lines 116-136) includes `NUDITY` and `HARASSMENT` but has no specific categories for:
- Non-consensual intimate images
- Cyberbullying (child-specific)
- Image-based abuse
- Abhorrent violent material

**Required Fix:** Add eSafety-specific reporting categories, implement 24-hour removal capability for eSafety notices, create BOSE compliance documentation, add intimate image abuse detection/reporting.

---

## FINDING 4: NO TOS/PRIVACY POLICY ACCEPTANCE TIMESTAMP STORED
**Severity:** LEGAL RISK — HIGH
**Regulation:** GDPR (Article 7), Australian Privacy Act, Contract law
**File:** `apps/api/prisma/schema.prisma` — User model (lines 229-493)
**File:** `apps/api/src/modules/auth/auth.service.ts` (lines 28-61)
**File:** `apps/api/src/modules/auth/dto/register.dto.ts` (lines 1-33)
**File:** `apps/mobile/app/(auth)/sign-up.tsx` (lines 79-94)

**Evidence:** The User model has no `tosAcceptedAt`, `privacyPolicyAcceptedAt`, `tosVersion`, or similar fields. The `RegisterDto` has no `acceptedTerms` boolean. The sign-up screen shows `{t('auth.termsAgreement')}` at line 299 of `sign-up.tsx`, but:
1. This i18n key (`auth.termsAgreement`) does NOT exist in any of the 8 language files — it renders as empty/undefined
2. Even if the text displayed, there is no checkbox to actively accept
3. No acceptance timestamp is recorded server-side
4. No version tracking of which ToS/privacy policy the user accepted

**Legal Impact:** Under GDPR Article 7, consent must be demonstrable — "the controller shall be able to demonstrate that the data subject has consented." Without a timestamp and version record, Mizanly cannot prove any user consented to data processing. This invalidates the legal basis for processing personal data of ALL users.

**Required Fix:** Add `tosAcceptedAt DateTime?`, `tosVersion String?`, `privacyPolicyAcceptedAt DateTime?` to User model. Add acceptance checkbox to sign-up flow. Store timestamp on registration.

---

## FINDING 5: GDPR RIGHT TO ERASURE INCOMPLETE — DATA EXPORT CAPPED
**Severity:** LEGAL RISK — HIGH
**Regulation:** GDPR Article 17 (Right to Erasure), GDPR Article 20 (Right to Data Portability)
**File:** `apps/api/src/modules/privacy/privacy.service.ts` (lines 10-45)

**Evidence:** The `exportUserData` method caps most data at 50 records:

```typescript
// privacy.service.ts lines 18-31
const [posts, threads, stories, messages, follows] = await Promise.all([
  this.prisma.post.findMany({ where: { userId }, ..., take: 50 }),
  this.prisma.thread.findMany({ where: { userId }, ..., take: 50 }),
  this.prisma.story.findMany({ where: { userId }, ..., take: 50 }),
  this.prisma.message.findMany({ where: { senderId: userId }, ..., take: 10000 }),
  this.prisma.follow.findMany({ where: { followerId: userId }, ..., take: 50 }),
]);
```

A user with 1,000 posts only gets 50 back. A user with 200 follows only gets 50. This violates GDPR Article 20 which requires ALL personal data to be provided in a portable format.

Note: The `users.service.ts` `exportData` method (lines 115-186) does NOT have `take` limits and is more complete, but the privacy controller at `privacy.controller.ts` line 18 calls `privacyService.exportUserData` (the capped version), not the users service version.

**Additionally missing from BOTH export methods:**
- Reel comments
- Thread replies
- Video comments
- Reactions on all content types
- Story views given
- Search history
- Blocked/muted users
- Settings/preferences
- Notification history
- DM notes
- Saved messages
- Chat folders
- Event RSVPs
- Zakat calculations
- All Islamic feature data (dhikr sessions, Quran reading plans, fasting logs)

**Required Fix:** Remove all `take` limits from privacy export. Include ALL user data categories.

---

## FINDING 6: GDPR RIGHT TO ERASURE — DELETEALLDATA INCOMPLETE
**Severity:** LEGAL RISK — HIGH
**Regulation:** GDPR Article 17 (Right to Erasure)
**File:** `apps/api/src/modules/privacy/privacy.service.ts` (lines 47-102)
**File:** `apps/api/src/modules/users/users.service.ts` (lines 188-215)

**Evidence:** The `deleteAllUserData` method in `privacy.service.ts` only handles:
- User profile anonymization
- Posts (soft-delete)
- Threads (soft-delete)
- Comments (soft-delete)
- Stories (hard-delete)
- Profile links (hard-delete)

It does NOT delete or anonymize:
- Reels (187 schema models, many user-linked)
- Videos
- Messages (contains user content, only sender reference anonymized)
- Reactions (likes on posts/threads/reels/videos)
- Saved posts/threads/videos
- Bookmarks
- Follow relationships
- Block relationships
- Notifications
- Devices/push tokens (done in `users.service.ts` but not in privacy)
- Channel data
- Events/RSVPs
- Commerce data (orders, products, reviews)
- Zakat/donation records
- Community memberships
- All Islamic feature data
- Gamification data (streaks, XP, achievements)
- Watch history
- DM notes, saved messages, chat folders
- AI translations cached
- 2FA secrets
- Encryption keys
- Moderation logs (where user is target)

The `users.service.ts` `deleteAccount` method (lines 188-215) is even more minimal — it only anonymizes the profile and deletes device tokens. Content remains visible under the "Deleted User" pseudonym.

**Legal Impact:** GDPR Article 17 requires erasure of ALL personal data. Leaving reactions, messages, follows, and dozens of other data categories intact is a clear violation.

**Required Fix:** Comprehensive cascade deletion/anonymization covering all 187 Prisma models that reference userId.

---

## FINDING 7: NO CONSENT TIMESTAMPS FOR DATA PROCESSING
**Severity:** LEGAL RISK — HIGH
**Regulation:** GDPR Article 6 (Lawful Basis), GDPR Article 7 (Conditions for Consent)
**File:** `apps/api/prisma/schema.prisma` — UserSettings model (lines 1979-2009)

**Evidence:** The `UserSettings` model has NO consent-related fields:
- No `marketingConsentAt` timestamp
- No `analyticsConsentAt` timestamp
- No `personalizedAdsConsentAt` timestamp
- No `thirdPartyDataSharingConsentAt` timestamp
- No `aiProcessingConsentAt` timestamp (Claude AI is used for content moderation, translation, recommendations)

The platform uses AI (Anthropic Claude) for content moderation and translation, processes location data for prayer times and mosque finder, tracks user behavior for feed personalization, and uses analytics — ALL of which require specific consent under GDPR.

**Required Fix:** Add granular consent fields with timestamps to UserSettings. Create consent management UI.

---

## FINDING 8: NO DMCA AGENT REGISTERED OR TAKEDOWN FLOW
**Severity:** LEGAL RISK — HIGH
**Regulation:** DMCA (17 USC 512), EU Copyright Directive, Australian Copyright Act
**File:** Platform-wide — no implementation

**Evidence:** A codebase-wide search for `DMCA`, `takedown`, `copyright notice`, `counter notice` returned ZERO matches. The `ReportReason` enum includes `COPYRIGHT` (schema.prisma line 133), but:
1. No dedicated copyright takedown form or endpoint exists
2. No DMCA agent is registered with the US Copyright Office
3. No counter-notification flow exists
4. No repeat infringer policy is implemented or documented
5. The legal controller (`legal.controller.ts`) ToS mentions "You must not post content that infringes on others' intellectual property rights" but provides no mechanism to report or address it
6. The general report flow in `reports.service.ts` allows selecting COPYRIGHT as a reason, but there's no specific data collected (URL of original work, description of copyrighted material, sworn statement, etc.) as required by DMCA

**Legal Impact:** Without a properly registered DMCA agent and compliant takedown process, Mizanly loses safe harbor protection under DMCA Section 512. This means the platform can be held directly liable for ANY copyright-infringing content uploaded by users.

**Required Fix:** Register DMCA agent, create DMCA-compliant takedown form with required fields, implement counter-notification flow, create repeat infringer policy.

---

## FINDING 9: NO TRANSPARENCY REPORTS
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** EU Digital Services Act (Article 15, 24), Australian Online Safety Act (BOSE 4)
**File:** Platform-wide — no implementation

**Evidence:** No transparency reporting mechanism exists anywhere in the codebase. The EU Digital Services Act requires:
- Number of content moderation decisions
- Number of orders received from authorities
- Number of CSAM reports
- Number of user complaints and outcomes
- Information about automated content moderation tools

The moderation service (`moderation.service.ts`) has a `getStats` method (lines 255-297) that provides basic counts (flagged today, reviewed today, total pending, auto-flagged, false positives), but:
1. This is an internal admin endpoint, not a public transparency report
2. It does not break down by content type, reason, or outcome
3. It does not track government/law enforcement requests
4. It is not generated on a regular schedule
5. There is no public-facing URL for transparency reports

**Required Fix:** Implement periodic transparency report generation, create public endpoint, track government requests separately.

---

## FINDING 10: NO COOKIE/TRACKING CONSENT MECHANISM
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** GDPR, ePrivacy Directive, Australian Privacy Act
**File:** Platform-wide

**Evidence:** The i18n files reference a `cookiePolicy` key (e.g., `en.json` line 1156: `"cookiePolicy": "Cookie Policy"`), and the settings UI has a cookie policy menu item, but:
1. No cookie consent banner or popup exists in the mobile app
2. No tracking consent mechanism exists
3. The retention service (`retention.service.ts`) tracks session depth, scroll depth, time spent, and interaction count (lines 152-169) — stored in Redis — without explicit user consent
4. The `AnalyticsService` (referenced in `auth.service.ts` line 71-75) tracks user registrations without consent
5. The feed interaction system (`FeedInteraction` model in schema) tracks all user interactions for personalization without opt-in

While native mobile apps are not subject to the EU Cookie Directive in the same way websites are, they ARE subject to ePrivacy requirements for tracking consent and GDPR requirements for processing consent.

**Required Fix:** Implement tracking consent mechanism, allow users to opt out of analytics and personalization tracking.

---

## FINDING 11: DATA RETENTION POLICIES NOT IMPLEMENTED
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** GDPR Article 5(1)(e) (Storage Limitation), Australian Privacy Principle 11
**File:** `apps/api/src/modules/health/legal.controller.ts` (lines 48-54)
**File:** Platform-wide — no implementation

**Evidence:** The privacy policy at `legal.controller.ts` lines 48-54 states:
```
• Deleted content: removed from public view immediately; purged from backups within 30 days
• Account deletion: all personal data deleted within 30 days of request
```

But there is NO implementation of these promises:
1. No cron job or scheduled task to purge deleted content after 30 days
2. No cron job to process deletion requests after the 30-day grace period
3. The `requestAccountDeletion` method in `users.service.ts` (lines 825-831) sets `deletedAt` and `isDeactivated` but nothing ever processes this timestamp to actually delete data
4. No data retention schedule exists for any data category
5. Stories have no auto-expiry mechanism (Instagram stories expire after 24h — Mizanly stories persist indefinitely in the database)
6. Watch history is never auto-purged
7. Screen time logs are kept in Redis for 7 days (`retention.service.ts` line 168) but the DB version (`ScreenTimeLog` model) has no TTL
8. The privacy policy's claim of "30-day purge" is materially false

**Legal Impact:** Under GDPR Article 5(1)(e), personal data must be "kept in a form which permits identification of data subjects for no longer than is necessary." Indefinite retention violates this principle. Making false claims in the privacy policy compounds the violation.

**Required Fix:** Implement scheduled data purge jobs for deleted accounts (30-day), story auto-expiry, watch history rotation, and document retention periods for all data categories.

---

## FINDING 12: CROSS-BORDER DATA TRANSFER WITHOUT ADEQUATE PROTECTIONS
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** GDPR Chapter V (Articles 44-49), Australian Privacy Principle 8
**File:** `apps/api/src/modules/health/legal.controller.ts` (lines 40-45)

**Evidence:** The privacy policy states data is shared with:
- Railway (hosting) — US-based
- Cloudflare R2 (storage) — US/global
- Clerk (authentication) — US-based
- Stripe (payments) — US-based
- Meilisearch — deployment location unknown
- Anthropic Claude (AI) — US-based

The founder is in Australia, likely serving users globally (including EU). There are NO:
1. Standard Contractual Clauses (SCCs) documented or referenced
2. Data Processing Agreements (DPAs) with sub-processors
3. Transfer Impact Assessments
4. Binding Corporate Rules
5. Adequacy decisions referenced
6. No mention of where data is physically stored/processed

**Legal Impact:** Under GDPR Chapter V, transferring personal data to third countries (like the US) without appropriate safeguards is prohibited. Without SCCs or equivalent, every data transfer to US-based services (Clerk, Stripe, Anthropic, Cloudflare) is unlawful under GDPR.

**Required Fix:** Execute DPAs with all sub-processors, implement SCCs for US transfers, document Transfer Impact Assessments, add data processing locations to privacy policy.

---

## FINDING 13: CONTACT SYNC UPLOADS RAW PHONE NUMBERS — PRIVACY VIOLATION
**Severity:** LEGAL RISK — HIGH
**Regulation:** GDPR Article 6 (Lawful Basis), Australian Privacy Act
**File:** `apps/mobile/app/(screens)/contact-sync.tsx` (lines 99-133)
**File:** `apps/api/src/modules/users/users.service.ts` (lines 849-862)
**File:** `apps/mobile/src/services/api.ts` (line 265)

**Evidence:** The contact sync feature uploads raw phone numbers from the user's device contacts:

```typescript
// contact-sync.tsx lines 114-123
const phoneNumbers: string[] = [];
for (const contact of data) {
  if (contact.phoneNumbers) {
    for (const phone of contact.phoneNumbers) {
      if (phone.number) {
        phoneNumbers.push(phone.number);
      }
    }
  }
}
// ... sends to server
const result = await usersApi.syncContacts(phoneNumbers);
```

```typescript
// api.ts line 265
syncContacts: (phoneNumbers: string[]) => api.post<...>('/users/contacts/sync', { phoneNumbers }),
```

```typescript
// users.service.ts lines 849-862
async findByPhoneNumbers(userId: string, phoneNumbers: string[]) {
  const normalized = phoneNumbers.map(p => p.replace(/\D/g, '').slice(-10));
  const users = await this.prisma.user.findMany({
    where: { phone: { in: normalized }, id: { not: userId } },
    ...
  });
}
```

Issues:
1. Phone numbers of NON-USERS (third-party contacts who never consented) are sent to the server
2. No consent is obtained from the contact owners (only device permission from the user)
3. Phone numbers are transmitted in plaintext
4. No hashing is applied before transmission (unlike WhatsApp/Signal which hash contacts client-side)
5. The server normalizes but processes raw numbers
6. No rate limiting specific to this endpoint (mass contact harvesting possible)

**Legal Impact:** Transmitting third-party personal data (phone numbers of people who have NOT consented) to a server violates GDPR Article 6 (no lawful basis for processing non-users' data). This exact issue led to WhatsApp's EUR 225M fine by the Irish DPC. The Australian Privacy Act similarly prohibits collecting personal information about individuals who haven't been informed.

**Required Fix:** Hash phone numbers client-side before transmission (SHA-256 with salt), only match hashes server-side, add explicit consent dialog explaining what data is shared, add rate limiting.

---

## FINDING 14: NO MECHANISM TO DETECT OR REPORT TERRORIST CONTENT
**Severity:** LEGAL RISK — HIGH
**Regulation:** Australian Criminal Code Division 474.45, EU Terrorist Content Online Regulation, Christchurch Call
**File:** `apps/api/src/modules/moderation/word-filter.ts` (lines 1-53)
**File:** `apps/api/src/modules/moderation/moderation.service.ts` (entire file)

**Evidence:** The `ReportReason` enum includes `TERRORISM` (schema.prisma line 132), allowing users to report terrorist content. However:

1. The word filter (`word-filter.ts`) has ZERO terrorism-related patterns. Categories are: `hate_speech`, `spam`, `nsfw_text`, `harassment`, `self_harm`. No `terrorism` category.
2. No integration with GIFCT (Global Internet Forum to Counter Terrorism) hash-sharing database
3. No automated detection of terrorist content in images/videos
4. No 1-hour removal capability as required by EU TCO Regulation
5. No specific handling flow when TERRORISM reports are received
6. The AI moderation categories include "un-islamic" but not terrorism/extremism specifically
7. Australia's Abhorrent Violent Material (AVM) amendments require removal within "a reasonable time" with potential criminal penalties for failure

The word filter patterns are ALL placeholders:
```typescript
{ pattern: /\b(racial_slur_placeholder)\b/i, category: 'hate_speech', severity: 'high' },
{ pattern: /\b(ethnic_slur_placeholder)\b/i, category: 'hate_speech', severity: 'high' },
{ pattern: /\b(religious_slur_placeholder)\b/i, category: 'hate_speech', severity: 'high' },
{ pattern: /\b(explicit_word_placeholder)\b/i, category: 'nsfw_text', severity: 'high' },
```

These placeholders will NEVER match any real content.

**Required Fix:** Replace placeholder patterns with real terms, add terrorism-specific detection category, integrate with GIFCT hash-sharing, implement 1-hour removal capability for flagged terrorist content.

---

## FINDING 15: MISSING PARENTAL CONSENT MECHANISM FOR MINORS
**Severity:** LEGAL RISK — HIGH
**Regulation:** COPPA, GDPR Article 8, Australian Privacy Act
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts` (entire file)
**File:** `apps/api/prisma/schema.prisma` — ParentalControl model (lines 2790-2811)

**Evidence:** The parental controls system exists but is REACTIVE, not PROACTIVE:
1. A parent must manually link a child account AFTER the child has already registered
2. There is no mechanism to require parental consent DURING registration for users under 18
3. Since no age is collected at signup (Finding 1), the system cannot identify minors
4. The `isChildAccount` flag on User (schema.prisma line 380) defaults to `false` and is only set when a parent explicitly links the account
5. Any user of any age can use all platform features (messaging, live streaming, commerce, etc.) without restriction until a parent manually intervenes

The flow: Child registers freely -> uses all features -> parent discovers they're on the platform -> parent links the account -> restrictions apply. This is backwards from legal requirements.

**Required Fix:** Collect age at registration, require parental consent flow for users under 18 (or 13-16 depending on jurisdiction), restrict feature access by default for minors until parental consent is obtained.

---

## FINDING 16: PRIVACY POLICY MISSING REQUIRED DISCLOSURES
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** GDPR Articles 13-14, Australian Privacy Principle 1, CCPA
**File:** `apps/api/src/modules/health/legal.controller.ts` (lines 9-89)

**Evidence:** The privacy policy is missing legally required disclosures:

1. **No DPO/privacy officer named:** GDPR Article 37 requires a Data Protection Officer for large-scale processing. No DPO is named or contactable (only generic `privacy@mizanly.app`).
2. **No legal basis specified:** GDPR Article 13(1)(c) requires stating the legal basis for each processing activity. The policy says "We collect information" but never states WHY under GDPR categories (consent, legitimate interest, contract performance, etc.).
3. **No data retention periods per category:** The policy gives vague "as long as active" but GDPR requires specific retention periods for each data category.
4. **No mention of automated decision-making:** GDPR Article 22 requires disclosure of automated decision-making including profiling. The feed algorithm, AI moderation, and content filtering ALL constitute automated decision-making but are not disclosed.
5. **No supervisory authority contact:** GDPR Article 13(2)(d) requires identifying the relevant supervisory authority. For Australia, this would be the OAIC.
6. **No lawful basis for AI processing:** Claude AI processes user content for moderation and translation — this processing is not disclosed with a specific legal basis.
7. **No sub-processor list:** GDPR requires listing all sub-processors. The policy names some services but misses others (Anthropic Claude, Aladhan API, Quran.com API, OpenStreetMap Overpass).
8. **CCPA disclosures missing:** No "Do Not Sell My Personal Information" link, no right to opt-out of sale, no financial incentive disclosures.

**Required Fix:** Comprehensive privacy policy rewrite with all GDPR-required disclosures, CCPA disclosures, and APP-compliant notices.

---

## FINDING 17: NO LAW ENFORCEMENT REQUEST HANDLING PROCESS
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** Various (country-specific)
**File:** Platform-wide — no implementation

**Evidence:** A codebase-wide search for `law enforcement`, `subpoena`, `warrant`, `government request` returned ZERO results in code (only translation scripts). There is:
1. No law enforcement request portal or intake form
2. No internal process documented for responding to warrants/subpoenas
3. No data preservation mechanism (ability to freeze a user's data pending legal process)
4. No tracking of government data requests (required for transparency reports)
5. No legal hold capability

**Required Fix:** Create law enforcement guidelines document, implement data preservation endpoint (admin only), create LE request tracking system.

---

## FINDING 18: BANNED USER NOT BLOCKED AT AUTH GATE
**Severity:** LEGAL/SECURITY — HIGH
**File:** `apps/api/src/common/guards/clerk-auth.guard.ts` (lines 12-52)

**Evidence:** The `ClerkAuthGuard` checks:
1. Token exists
2. Token is valid (verifyToken)
3. User exists in database

But it does NOT check `isBanned`:
```typescript
const user = await this.prisma.user.findUnique({
  where: { clerkId },
  select: { id: true, clerkId: true, username: true, displayName: true },
  // isBanned NOT selected, NOT checked
});
```

A banned user can continue to access ALL API endpoints. The `isBanned` field (schema.prisma line 258) is purely decorative. This has compliance implications: if a user is banned for terrorism, CSAM, or other illegal content, they can continue to access and post content.

**Required Fix:** Add `isBanned` to select, throw `ForbiddenException` if banned.

---

## FINDING 19: NO AGE-RESTRICTED CONTENT VERIFICATION
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** Australian Classification Act, various country-specific laws
**File:** `apps/api/src/modules/moderation/moderation.service.ts`
**File:** `apps/api/prisma/schema.prisma` — ParentalControl.maxAgeRating (line 2796)

**Evidence:** The parental control model has a `maxAgeRating` field with options like "PG", "R", etc. But:
1. No content is actually tagged with an age rating
2. No age-rating field exists on Post, Reel, Video, Thread, or any content model
3. No mechanism exists to prevent minors from accessing age-restricted content
4. No age verification is required to view any content
5. The `sensitiveContent` flag in UserSettings (line 2002) is a user-toggled preference, not an enforced restriction

**Required Fix:** Add age rating fields to content models, enforce viewing restrictions based on user age and parental controls.

---

## FINDING 20: SIGN-UP TERMS AGREEMENT TEXT RENDERS EMPTY
**Severity:** LEGAL RISK — MEDIUM
**File:** `apps/mobile/app/(auth)/sign-up.tsx` (line 299)
**File:** `apps/mobile/src/i18n/en.json` (auth section, lines 180-243)

**Evidence:** The sign-up screen renders:
```tsx
<Text style={styles.terms}>
  {t('auth.termsAgreement')}
</Text>
```

The key `auth.termsAgreement` does NOT exist in any of the 8 i18n files (en, ar, tr, ur, bn, fr, id, ms). The `auth` section in `en.json` (lines 180-243) contains `termsAgree` (line 131, in `common` section) but NOT `termsAgreement` in the `auth` section.

Result: The terms agreement text displays as empty/undefined at the bottom of the sign-up form. Users see no legal notice about terms of service or privacy policy when creating an account.

**Required Fix:** Add `auth.termsAgreement` key to all 8 i18n files with text like "By creating an account, you agree to our Terms of Service and Privacy Policy", make it a tappable link to the ToS/privacy policy screens.

---

## FINDING 21: NO ACTIVE CHECKBOX FOR TERMS ACCEPTANCE
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** GDPR Article 7, EU Consumer Rights Directive
**File:** `apps/mobile/app/(auth)/sign-up.tsx` (lines 290-299)

**Evidence:** Even if the terms text rendered (see Finding 20), there is:
1. No checkbox or toggle for active acceptance
2. No state variable tracking acceptance
3. The "Create Account" button is enabled when `!email || password.length < 8` is false — no terms acceptance required
4. Silence or pre-ticked boxes do NOT constitute valid consent under GDPR

The sign-up flow: email + password -> click "Create Account" -> Clerk signup -> email verification. At no point is active consent to ToS/privacy policy required.

**Required Fix:** Add checkbox with state tracking, disable "Create Account" until terms are accepted, record acceptance timestamp.

---

## FINDING 22: EXIF METADATA NOT STRIPPED FROM UPLOADS
**Severity:** LEGAL/PRIVACY — MEDIUM
**Regulation:** GDPR Article 25 (Data Protection by Design)
**File:** `apps/api/src/modules/upload/upload.service.ts` (entire file)
**File:** `apps/api/src/common/queue/processors/media.processor.ts` (entire file)

**Evidence:** The upload service (`upload.service.ts`) generates presigned URLs for direct client-to-R2 uploads. The media processor (`media.processor.ts`) processes images with `sharp` for resizing, but:

1. The upload goes directly from client to R2 — the server never sees the raw file
2. The media processor fetches already-uploaded images and resizes them, but does NOT strip EXIF
3. `sharp` can strip EXIF with `.withMetadata(false)` or by not calling `.withMetadata()` (default strips), but the resize operation on line 94-97 produces a JPEG which does strip most EXIF. HOWEVER, the ORIGINAL file uploaded to R2 still contains full EXIF
4. The original file URL is what gets stored in `mediaUrls[]` and served to users
5. EXIF data includes: GPS coordinates, device model, timestamp, camera settings, sometimes facial recognition data

A user uploading a photo from their phone will have their precise GPS location embedded in the image, viewable by anyone who downloads it.

**Required Fix:** Process all uploads through the server (not direct-to-R2) to strip EXIF, or add a post-upload processing step that replaces the original with a stripped version.

---

## FINDING 23: MARKETPLACE WITHOUT CONSUMER PROTECTION
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** Australian Consumer Law, EU Consumer Rights Directive
**File:** `apps/api/src/modules/commerce/commerce.service.ts` (lines 1-60)

**Evidence:** The marketplace allows users to sell products (`createProduct`, line 12) and process orders, but:
1. No refund/return policy mechanism exists
2. No dispute resolution system exists
3. No seller verification (anyone can list products)
4. No product safety compliance checks
5. No consumer protection disclosures
6. No cooling-off period implementation (required in Australia and EU for online purchases)
7. The ToS states "We are not liable for financial losses from marketplace transactions between users" (legal.controller.ts line 152) — this may not override statutory consumer guarantees in Australia

**Required Fix:** Implement refund/returns flow, add dispute resolution, add seller verification for marketplace, add consumer protection disclosures.

---

## FINDING 24: ZAKAT/CHARITY WITHOUT FINANCIAL COMPLIANCE
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** Australian Charities and Not-for-profits Commission Act, various financial regulations
**File:** `apps/api/prisma/schema.prisma` — ZakatFund, ZakatDonation, CharityDonation, WaqfFund models

**Evidence:** The platform facilitates:
1. Zakat collection and distribution (`ZakatFund`, `ZakatDonation` models)
2. Charity donations (`CharityDonation`, `CharityCampaign` models)
3. Waqf (endowment) funds (`WaqfFund` model)
4. Community treasury (`CommunityTreasury`, `TreasuryContribution` models)

But there is:
1. No verification of charitable organization status
2. No ACNC (Australian Charities and Not-for-profits Commission) registration verification
3. No financial transparency for fund recipients
4. No anti-money laundering (AML) checks on donations
5. No tax receipt generation for donors
6. No audit trail for fund disbursement
7. The platform may be acting as an unlicensed payment facilitator or money services business

**Required Fix:** Implement charity verification, AML/KYC for large donations, tax receipt generation, transparent fund tracking.

---

## FINDING 25: NO DATA PROCESSING RECORDS (ARTICLE 30)
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** GDPR Article 30 (Records of Processing Activities)
**File:** Platform-wide — no implementation

**Evidence:** GDPR Article 30 requires controllers to maintain a record of processing activities containing:
- Name and contact details of the controller
- Purposes of the processing
- Description of the categories of data subjects and personal data
- Categories of recipients
- Transfers to third countries
- Retention periods
- Security measures

No such documentation exists anywhere in the codebase or docs directory. This is a mandatory requirement for any organization processing personal data.

**Required Fix:** Create and maintain Article 30 records, potentially as a living document in the codebase or a dedicated compliance system.

---

## FINDING 26: MODERATION FAILS OPEN ON API FAILURE
**Severity:** LEGAL/SAFETY — HIGH
**File:** `apps/api/src/modules/ai/ai.service.ts` (lines 83-91)
**File:** `apps/api/src/modules/moderation/moderation.service.ts`

**Evidence:** When the Claude API fails (network error, rate limit, outage), the AI service returns a fallback:

```typescript
// ai.service.ts line 88
if (prompt.includes('moderate')) return JSON.stringify({ safe: true, flags: [], confidence: 0.5 });
```

This means ALL content passes moderation when the AI service is down. For a platform with legal obligations to remove CSAM, terrorist content, and other illegal material, "fail open" means illegal content gets published without any check.

**Legal Impact:** If the AI service is down for even minutes, illegal content could be published and distributed. Under the Australian Online Safety Act and EU TCO Regulation, the platform has obligations to prevent distribution of certain content categories regardless of technical difficulties.

**Required Fix:** Implement "fail closed" for high-risk content (hold for manual review when AI is down), or require human review for all content when automated moderation is unavailable.

---

## FINDING 27: NO PRIVACY IMPACT ASSESSMENT FOR HIGH-RISK PROCESSING
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** GDPR Article 35 (Data Protection Impact Assessment)
**File:** Platform-wide — no documentation

**Evidence:** The platform performs multiple types of processing that trigger mandatory DPIA requirements:
1. **Systematic monitoring:** Feed algorithm tracking all user interactions
2. **Large-scale processing of special category data:** Religious beliefs (madhab, Islamic content preferences, mosque attendance)
3. **Processing relating to children:** Platform allows minors without age verification
4. **Automated decision-making:** AI moderation that can remove content or ban users
5. **Location tracking:** Prayer times, mosque finder, local boards
6. **Biometric-adjacent data:** Voice recordings (voice messages, voice posts)

No DPIA documentation exists anywhere in the codebase or documentation.

**Required Fix:** Conduct and document DPIAs for each high-risk processing activity.

---

## FINDING 28: RELIGIOUS DATA PROCESSED WITHOUT EXPLICIT CONSENT
**Severity:** LEGAL RISK — HIGH
**Regulation:** GDPR Article 9 (Processing of Special Categories of Data)
**File:** `apps/api/prisma/schema.prisma` — User.madhab (line 270)
**File:** Various Islamic feature modules

**Evidence:** Religious beliefs are "special category data" under GDPR Article 9, requiring EXPLICIT consent (not just legitimate interest). The platform processes:
1. `madhab` field on User model (Islamic school of thought — Hanafi, Shafi'i, Maliki, Hanbali)
2. Prayer time preferences (calculation method implies religious practice level)
3. Quran reading plans and progress (HifzProgress model)
4. Dhikr sessions and challenges
5. Fasting logs
6. Zakat calculations (implies wealth level AND religious observance)
7. Mosque attendance/membership
8. Halal restaurant preferences

None of this data collection has explicit consent mechanisms. Users are never asked: "We will process your religious beliefs. Do you explicitly consent?"

**Legal Impact:** Processing special category data without explicit consent (or another Article 9(2) exception) is one of the most serious GDPR violations, with fines up to EUR 20 million or 4% of global turnover.

**Required Fix:** Implement explicit consent flow for all Islamic/religious features, with granular opt-in per feature category, stored with timestamps.

---

## FINDING 29: ACCOUNT DELETION DOES NOT COMPLY WITH 30-DAY PROMISE
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** GDPR Article 17, Privacy Policy compliance
**File:** `apps/api/src/modules/users/users.service.ts` (lines 825-831, 188-215)
**File:** `apps/api/src/modules/privacy/privacy.service.ts` (lines 47-102)

**Evidence:** Two deletion paths exist, neither is complete:

**Path 1 — `requestAccountDeletion` (users.service.ts line 825):**
```typescript
async requestAccountDeletion(userId: string) {
  await this.prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date(), isDeactivated: true },
  });
  return { requested: true };
}
```
This only sets a timestamp and deactivates — nothing ever processes this request to completion.

**Path 2 — `deleteAccount` (users.service.ts line 188):**
Immediately anonymizes profile but leaves all content visible.

**Path 3 — `deleteAllUserData` (privacy.service.ts line 47):**
Most thorough but still incomplete (see Finding 6).

The privacy policy promises "all personal data deleted within 30 days of request." There is no scheduled job, cron task, or any mechanism to fulfill this promise. The `requestAccountDeletion` method creates a timestamp but nothing reads it to trigger actual deletion.

**Required Fix:** Implement scheduled job to process `deletedAt` timestamps after 30-day grace period, ensuring complete data removal as promised.

---

## FINDING 30: CHILDREN'S MESSAGING NOT RESTRICTED BY DEFAULT
**Severity:** LEGAL/SAFETY — HIGH
**Regulation:** COPPA, UK Age Appropriate Design Code, Australian Online Safety Act
**File:** `apps/api/src/modules/messages/messages.service.ts`
**File:** `apps/api/src/modules/parental-controls/parental-controls.service.ts` (line 239-257)

**Evidence:** The parental control restrictions default to:
```typescript
// parental-controls.service.ts lines 236-244
return {
  isLinked: false,
  restrictedMode: false,
  maxAgeRating: 'R',
  dailyLimitMinutes: null,
  dmRestriction: 'none',
  canGoLive: true,
  canPost: true,
  canComment: true,
};
```

For an unlinked user (which is ALL users since there's no age verification), ALL features are unrestricted. This means:
1. Any potential minor can receive DMs from any adult
2. Any potential minor can go live (video streaming)
3. Any potential minor can post content publicly
4. No age-appropriate default restrictions

The UK Age Appropriate Design Code (which applies to services "likely to be accessed by children") requires privacy-protective defaults for children. The Australian eSafety Commissioner expects platforms to implement "Safety by Design" with protective defaults for young users.

**Required Fix:** Implement age-appropriate defaults for users under 18, restrict DMs from non-followers for minor accounts, disable live streaming for minors by default.

---

## FINDING 31: LIVE STREAMING WITHOUT SAFETY MECHANISMS FOR MINORS
**Severity:** LEGAL/SAFETY — HIGH
**Regulation:** Australian Online Safety Act, EU Digital Services Act
**File:** `apps/api/src/modules/live/live.service.ts` (if exists)
**File:** `apps/api/prisma/schema.prisma` — LiveSession model

**Evidence:** The platform has live video streaming functionality (`LiveSession` model, `live` module). Live streaming poses unique risks for minors:
1. No age verification before going live
2. No real-time content moderation during live streams
3. No mechanism to detect/prevent grooming behavior in live chat
4. No automatic recording for safety review
5. No cool-down period or review after stream ends
6. Any user can go live to any audience (including potential minors in the audience)

Live streaming is the highest-risk feature for child safety because it creates real-time, unmoderated contact between adults and children with no content review possible before publication.

**Required Fix:** Age-gate live streaming (18+ for broadcasting, or parental consent for minors), implement real-time chat moderation, add recording capability for safety review, restrict audience composition for minor streamers.

---

## FINDING 32: NO DISPUTE RESOLUTION / COMPLAINTS MECHANISM FOR USERS
**Severity:** LEGAL RISK — MEDIUM
**Regulation:** EU Digital Services Act Article 20, Australian Consumer Law
**File:** Platform-wide

**Evidence:** The moderation appeal system (`submitAppeal` in `moderation.service.ts` lines 346-364) allows users to appeal moderation actions, but:
1. No independent complaint resolution body is referenced
2. No out-of-court dispute settlement mechanism exists (required by DSA Article 21)
3. No timeframe for appeal review is committed to
4. No escalation path if the appeal is denied
5. Appeal review is done by the same team (admin/moderator) who made the original decision — no independence

**Required Fix:** Implement escalation paths, commit to review timeframes, reference an independent dispute resolution body.

---

## FINDING 33: ENCRYPTION KEY DATA NOT COVERED BY DELETION
**Severity:** LEGAL/SECURITY — MEDIUM
**Regulation:** GDPR Article 17
**File:** `apps/api/prisma/schema.prisma` — EncryptionKey model
**File:** `apps/api/src/modules/encryption/encryption.service.ts`

**Evidence:** The platform supports end-to-end encryption with:
- `EncryptionKey` model (user's public key)
- `ConversationKeyEnvelope` model (per-conversation keys)

When a user deletes their account, these keys are NOT deleted by any deletion method (Finding 6). This means:
1. The user's public key remains in the database
2. Conversation key envelopes remain
3. If the encryption implementation is flawed, these could theoretically be used to decrypt historical messages
4. The existence of these records is personal data that should be deleted

**Required Fix:** Include EncryptionKey and ConversationKeyEnvelope in account deletion cascade.

---

## FINDING 34: TWO-FACTOR SECRET STORED WITHOUT ENCRYPTION-AT-REST
**Severity:** LEGAL/SECURITY — HIGH
**Regulation:** GDPR Article 32 (Security of Processing), PCI DSS (for Stripe-connected accounts)
**File:** `apps/api/prisma/schema.prisma` — TwoFactorSecret model

**Evidence:** Previous audit (Agent 3) confirmed that 2FA TOTP secrets are stored in plaintext in the database. The `TwoFactorSecret` model stores the `secret` field as a plain `String`:

```
model TwoFactorSecret {
  id        String   @id @default(uuid())
  userId    String   @unique
  secret    String   // TOTP secret — STORED IN PLAINTEXT
  ...
}
```

This has compliance implications:
1. Under GDPR Article 32, authentication secrets must be protected with "appropriate technical measures"
2. If the database is compromised, attackers can generate valid TOTP codes for any user with 2FA enabled
3. This effectively makes 2FA security theater — a database breach gives full account access
4. For users with Stripe Connect accounts (creators), this could cascade to financial account compromise

**Required Fix:** Encrypt TOTP secrets at rest using a key management system (KMS), or at minimum, application-level encryption with a key stored separately from the database.

---

## SUMMARY OF FINDINGS BY PRIORITY

### P0 — LAUNCH BLOCKERS (4 findings)
| # | Finding | Regulation |
|---|---------|-----------|
| 1 | No age verification at signup | COPPA, GDPR Art 8, AU Privacy Act |
| 2 | No CSAM detection or reporting | 18 USC 2258A, AU Online Safety Act |
| 3 | Australian Online Safety Act non-compliance | AU Online Safety Act 2021 |
| 18 | Banned users not blocked at auth gate | Multiple |

### P1 — HIGH SEVERITY (12 findings)
| # | Finding | Regulation |
|---|---------|-----------|
| 4 | No ToS/privacy acceptance timestamp | GDPR Art 7 |
| 5 | Data export capped at 50 records | GDPR Art 20 |
| 6 | Account deletion incomplete | GDPR Art 17 |
| 7 | No consent timestamps | GDPR Art 6, 7 |
| 8 | No DMCA agent or takedown flow | DMCA 17 USC 512 |
| 13 | Contact sync uploads raw phone numbers | GDPR Art 6 |
| 14 | No terrorist content detection | AU Crim Code, EU TCO |
| 15 | Missing parental consent for minors | COPPA, GDPR Art 8 |
| 26 | Moderation fails open on API failure | AU Online Safety Act |
| 28 | Religious data without explicit consent | GDPR Art 9 |
| 30 | Children's messaging unrestricted | COPPA, AU Online Safety |
| 31 | Live streaming without minor safety | AU Online Safety Act |
| 34 | 2FA secrets in plaintext | GDPR Art 32 |

### P2 — MEDIUM SEVERITY (18 findings)
| # | Finding | Regulation |
|---|---------|-----------|
| 9 | No transparency reports | EU DSA Art 15 |
| 10 | No tracking consent mechanism | GDPR, ePrivacy |
| 11 | Data retention not implemented | GDPR Art 5(1)(e) |
| 12 | Cross-border transfer without safeguards | GDPR Ch V |
| 16 | Privacy policy missing disclosures | GDPR Art 13-14 |
| 17 | No law enforcement request process | Various |
| 19 | No age-restricted content verification | AU Classification Act |
| 20 | Terms agreement text renders empty | Contract law |
| 21 | No active checkbox for terms | GDPR Art 7 |
| 22 | EXIF metadata not stripped | GDPR Art 25 |
| 23 | Marketplace without consumer protection | AU Consumer Law |
| 24 | Zakat/charity without financial compliance | AU Charities Act |
| 25 | No Article 30 processing records | GDPR Art 30 |
| 27 | No privacy impact assessments | GDPR Art 35 |
| 29 | Account deletion 30-day promise not implemented | GDPR Art 17 |
| 32 | No dispute resolution mechanism | EU DSA Art 20 |
| 33 | Encryption keys not deleted on account removal | GDPR Art 17 |

---

## REGULATORY EXPOSURE SUMMARY

| Regulation | Findings | Max Penalty |
|-----------|---------|-------------|
| GDPR | 18 findings | EUR 20M or 4% global turnover |
| Australian Online Safety Act 2021 | 5 findings | AUD 555,000/day (individuals) |
| COPPA | 3 findings | USD 50,120 per violation |
| DMCA | 1 finding | Loss of safe harbor (direct liability) |
| Australian Privacy Act | 6 findings | AUD 50M per violation (post-2022) |
| EU Digital Services Act | 3 findings | 6% global turnover |
| EU TCO Regulation | 1 finding | 4% global turnover |
| Australian Criminal Code (AVM) | 1 finding | Criminal liability |

**Total unique legal risk findings: 34**
**Platform cannot legally launch in Australia, EU, UK, or US in current state.**
