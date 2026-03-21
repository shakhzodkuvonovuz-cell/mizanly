# Audit Agent #26: i18n / Localization

**Scope:** `apps/mobile/src/i18n/` (index.ts + 8 language JSONs), `apps/mobile/src/utils/localeFormat.ts`, `apps/mobile/src/utils/rtl.ts`, `apps/mobile/src/hooks/useTranslation.ts`, hardcoded English strings in screens/components.

**Total findings: 54**

---

## Summary

| Category | Count | Severity |
|----------|-------|----------|
| Languages mostly untranslated (85%+ English) | 5 | P1 — Critical |
| Arabic untranslated keys | 1 | P2 — High |
| localeFormat.ts built but never imported | 1 | P2 — High |
| isRTL ignores Urdu (RTL language) | 1 | P0 — Ship Blocker |
| changeLanguage only accepts 'en' or 'ar' | 1 | P1 — Critical |
| forceRTLLayout never called for Urdu | 1 | P2 — High |
| date-fns always renders English | 1 | P2 — High |
| Hardcoded English Alert.alert strings | 17 | P2 — High |
| Hardcoded English inline strings | 6 | P2 — High |
| No pluralization support (only 1 key pair) | 1 | P3 — Medium |
| Dead/bloat i18n keys (never referenced in code) | 1 | P3 — Medium |
| Pluralization in code with English-only logic | 2 | P2 — High |
| Number formatting not locale-aware | 6 | P3 — Medium |
| Missing locale for date-fns in 23 files | 1 | P2 — High |
| Race condition: non-English shows English first | 1 | P3 — Medium |
| Async language load has no loading indicator | 1 | P4 — Low |
| i18n key count bloat (2,742 keys) | 1 | P4 — Low |
| Fallback strings in English inside t() calls | 5 | P3 — Medium |

---

## Finding 1 — [P0] isRTL detection ignores Urdu

**File:** `apps/mobile/src/hooks/useTranslation.ts`, line 11
**Category:** RTL Layout
**Severity:** P0 — Ship Blocker (Urdu is a primary target language for a Muslim app)

```ts
const isRTL = language === 'ar';
```

Urdu (`ur`) is an RTL language. With 230M+ speakers, many of whom are Muslim, Urdu users will see a completely broken layout — text aligned left, icons on wrong side, navigation arrows pointing wrong direction. Every component that uses `isRTL` from `useTranslation()` (34 files import from rtl.ts) will render incorrectly.

**Fix:** `const isRTL = language === 'ar' || language === 'ur';`

---

## Finding 2 — [P1] changeLanguage only accepts 'en' | 'ar'

**File:** `apps/mobile/src/hooks/useTranslation.ts`, line 13
**Category:** API Design
**Severity:** P1 — Critical

```ts
const changeLanguage = (lang: 'en' | 'ar') => {
  return i18n.changeLanguage(lang);
};
```

TypeScript will reject any call to `changeLanguage('tr')`, `changeLanguage('ur')`, etc. The language selector settings screen cannot switch to any of the 6 other supported languages. This makes Turkish, Urdu, Bengali, French, Indonesian, and Malay completely inaccessible through the UI.

**Fix:** Change type to `'en' | 'ar' | 'tr' | 'ur' | 'bn' | 'fr' | 'id' | 'ms'`

---

## Finding 3 — [P1] 5 languages are 85%+ untranslated English

**File:** All of `ur.json`, `bn.json`, `fr.json`, `id.json`, `ms.json`
**Category:** Translation Completeness
**Severity:** P1 — Critical

| Language | Keys | Translated | % Translated | % English |
|----------|------|-----------|-------------|----------|
| Turkish (tr) | 2,742 | 2,683 | 97.8% | 2.2% |
| Arabic (ar) | 2,742 | 2,224 | 81.1% | 18.9% |
| Urdu (ur) | 2,742 | 385 | 14.0% | **86.0%** |
| Bengali (bn) | 2,742 | 368 | 13.4% | **86.6%** |
| French (fr) | 2,742 | 353 | 12.9% | **87.1%** |
| Indonesian (id) | 2,742 | 358 | 13.1% | **86.9%** |
| Malay (ms) | 2,742 | 355 | 12.9% | **87.1%** |

Urdu, Bengali, French, Indonesian, and Malay each have only ~350-385 keys translated (the `common.*` section + a handful of other keys). The remaining ~2,360 keys are copy-pasted English text. A user selecting "Bahasa Indonesia" will see 87% of the app in English. This is false advertising of language support.

---

## Finding 4 — [P2] Arabic has 518 untranslated English keys

**File:** `apps/mobile/src/i18n/ar.json`
**Category:** Translation Completeness
**Severity:** P2 — High

Arabic is the most important non-English language for a Muslim app. 518 out of 2,742 keys (18.9%) are still English. Untranslated by section:

| Section | Untranslated |
|---------|-------------|
| minbar | 86 |
| majlis | 68 |
| profile | 68 |
| risalah | 66 |
| saf | 61 |
| islamic | 58 |
| settings | 43 |

The `islamic.*` section has 58 English-only keys in Arabic — the very section where Arabic translation matters most. These include all 36 absurd `prayerCalendar*` keys (Finding 12) plus legitimate keys like `prayerCalendarExport`, `prayerCalendarImport`, etc.

---

## Finding 5 — [P2] localeFormat.ts built but never imported

**File:** `apps/mobile/src/utils/localeFormat.ts`
**Category:** Dead Code / Missing Integration
**Severity:** P2 — High

A complete locale-aware formatting utility was built with 5 functions:
- `formatNumber()` — locale-aware number separators
- `formatCompactNumber()` — locale-aware K/M notation
- `formatDate()` — locale-aware date formatting
- `formatRelativeTime()` — locale-aware relative time
- `formatCurrency()` — locale-aware currency formatting

**Zero files import this module.** Instead, the codebase uses:
- `toLocaleString()` (no locale param) in 10+ screens
- `toFixed()` with English K/M suffixes in account-switcher, analytics, communities
- `formatDistanceToNowStrict` from date-fns (English-only, no locale) in 23 files
- Hardcoded `$` currency symbol in charity-campaign.tsx

---

## Finding 6 — [P2] date-fns always renders in English

**File:** 23 files importing `formatDistanceToNowStrict` or `formatDistanceToNow`
**Category:** Locale-Aware Formatting
**Severity:** P2 — High

All 23 files using date-fns time-ago formatting pass no `locale` option:

```ts
formatDistanceToNowStrict(new Date(video.publishedAt), { addSuffix: true })
// Output always: "2 hours ago", never "منذ ساعتين"
```

**Affected files:**
- `apps/mobile/app/(tabs)/minbar.tsx` line 141
- `apps/mobile/app/(tabs)/risalah.tsx` line 105
- `apps/mobile/app/(tabs)/bakra.tsx` line 318
- `apps/mobile/src/components/bakra/CommentsSheet.tsx` line 126
- `apps/mobile/src/components/majlis/ThreadCard.tsx` line 168, 304
- `apps/mobile/src/components/saf/PostCard.tsx` line 206
- `apps/mobile/app/(screens)/call-history.tsx` line 114
- `apps/mobile/app/(screens)/community-posts.tsx` line 87
- `apps/mobile/app/(screens)/conversation/[id].tsx` line 616
- `apps/mobile/app/(screens)/drafts.tsx` line 76
- `apps/mobile/app/(screens)/channel/[handle].tsx` lines 90, 559
- `apps/mobile/app/(screens)/gift-shop.tsx` line 234
- `apps/mobile/app/(screens)/live/[id].tsx` line 517
- `apps/mobile/app/(screens)/notifications.tsx` line 216
- And 9 more files

No `date-fns/locale` import exists anywhere in the project.

**Fix:** Import the appropriate locale from `date-fns/locale/*` based on i18next.language and pass it via the `{ locale }` option. Or use the already-built `localeFormat.ts` `formatRelativeTime()` function which handles this correctly.

---

## Finding 7 — [P2] forceRTLLayout never called for language changes

**File:** `apps/mobile/app/_layout.tsx`, line 35
**Category:** RTL Layout
**Severity:** P2 — High

The app calls `I18nManager.allowRTL(true)` at startup (line 35), which is correct. However:

1. `I18nManager.forceRTL()` is never called based on the actual language. For Arabic/Urdu users, the OS-level RTL layout won't activate unless the device locale is set to an RTL language.
2. The `forceRTLLayout()` function in `rtl.ts` (line 77) is built but never called from anywhere.
3. When a user changes language via `changeLanguage()`, RTL state doesn't update — the app would need a restart.

---

## Finding 8 — [P2] Hardcoded English Alert.alert strings in 17 locations

**Category:** Hardcoded Strings
**Severity:** P2 — High

These `Alert.alert()` calls use hardcoded English strings instead of `t()`:

| # | File | Line | Hardcoded String |
|---|------|------|-----------------|
| 1 | `app/_layout.tsx` | 133 | `Alert.alert('Error', error.message)` |
| 2 | `components/majlis/ThreadCard.tsx` | 145 | `Alert.alert('Delete thread?', 'This cannot be undone.')` |
| 3 | `components/majlis/ThreadCard.tsx` | 153 | `Alert.alert('Report thread', 'Why are you reporting this?')` |
| 4 | `components/saf/PostCard.tsx` | 106 | `Alert.alert('Error', 'Could not share as story...')` |
| 5 | `components/saf/PostCard.tsx` | 129 | `Alert.alert('Delete post?', 'This cannot be undone.')` |
| 6 | `components/saf/PostCard.tsx` | 137 | `Alert.alert('Report post', 'Why are you reporting this?')` |
| 7 | `app/(screens)/edit-profile.tsx` | 81 | `Alert.alert('Error', err.message)` |
| 8 | `app/(screens)/edit-profile.tsx` | 87 | `Alert.alert('Error', err.message)` |
| 9 | `app/(screens)/edit-profile.tsx` | 168 | `Alert.alert('Error', err.message \|\| 'Could not save profile')` |
| 10 | `app/(screens)/go-live.tsx` | 73 | `Alert.alert('Error', err.message \|\| 'Failed to start...')` |
| 11 | `app/(screens)/go-live.tsx` | 106 | `Alert.alert('Error', err.message \|\| 'Failed to start rehearsal.')` |
| 12 | `app/(screens)/muted.tsx` | 61 | `Alert.alert('Error', err.message)` |
| 13 | `app/(screens)/save-to-playlist.tsx` | 110 | `Alert.alert('Error', ...)` |
| 14 | `app/(screens)/reel/[id].tsx` | 70 | `Alert.alert('Error', err.message)` |
| 15 | `app/(screens)/create-video.tsx` | 302 | `Alert.alert('Missing channel', 'Please select a channel.')` |
| 16 | `app/(screens)/channel/[handle].tsx` | 265 | `Alert.alert('Copied', 'Channel link copied to clipboard')` |
| 17 | `app/(screens)/blocked.tsx` | 65 | `Alert.alert(...)` (hardcoded) |

All paths: relative to `apps/mobile/src/` or `apps/mobile/`.

---

## Finding 9 — [P2] Hardcoded English inline text in components

**Category:** Hardcoded Strings
**Severity:** P2 — High

| # | File | Line | Hardcoded String |
|---|------|------|-----------------|
| 1 | `app/(tabs)/minbar.tsx` | 141 | `{video.viewsCount.toLocaleString()} views` — hardcoded "views" |
| 2 | `components/majlis/ThreadCard.tsx` | 302 | `` {localPoll.totalVotes} vote{...!== 1 ? 's' : ''} `` — English pluralization |
| 3 | `components/majlis/ThreadCard.tsx` | 304 | `` ` · ends ${formatDistanceToNowStrict(...)}` `` — hardcoded "ends" |
| 4 | `app/(screens)/audio-library.tsx` | 143 | `{track.useCount.toLocaleString()} uses` — hardcoded "uses" |
| 5 | `app/(screens)/charity-campaign.tsx` | 64 | `` `$${(cents / 100).toFixed(0)}` `` — hardcoded USD symbol |
| 6 | `app/(screens)/conversation-media.tsx` | 289 | `` `${(item.fileSize / 1024).toFixed(1)} KB` `` — hardcoded "KB" |

---

## Finding 10 — [P2] Inline English pluralization logic

**File:** `apps/mobile/src/components/majlis/ThreadCard.tsx`, line 302
**Category:** Pluralization
**Severity:** P2 — High

```ts
{localPoll.totalVotes} vote{localPoll.totalVotes !== 1 ? 's' : ''}
```

This is English-only pluralization logic. Arabic has 6 plural forms (zero, one, two, few, many, other). French has different rules for zero. Indonesian/Malay have no plural forms. This should use i18next's built-in plural handling with `_zero`, `_one`, `_two`, `_few`, `_many`, `_other` suffixes.

---

## Finding 11 — [P3] Only 1 key pair uses i18next pluralization

**File:** `apps/mobile/src/i18n/en.json`, lines 1455-1456
**Category:** Pluralization
**Severity:** P3 — Medium

The entire 2,742-key i18n system has exactly ONE key pair using i18next pluralization:

```json
"count_one": "{{count}} follower",
"count_other": "{{count}} followers"
```

Every other countable noun in the app (posts, comments, likes, views, subscribers, members, reels, videos, etc.) either:
- Uses hardcoded English pluralization (Finding 10)
- Shows only the number with no label
- Uses a single form that's always plural

For Arabic, which has 6 plural forms, this means almost zero correct pluralization across the entire app.

---

## Finding 12 — [P3] 36 meaningless dead i18n keys (prayerCalendar bloat)

**File:** `apps/mobile/src/i18n/en.json`, lines 993-1032
**Category:** Dead Code
**Severity:** P3 — Medium

36 keys under `islamic.prayerCalendar*` are absurd and never referenced in any code:

- `prayerCalendarSelectAllCorners` = "Select All Corners"
- `prayerCalendarSelectAllMiddles` = "Select All Middles"
- `prayerCalendarSelectAllEdges` = "Select All Edges"
- `prayerCalendarSelectAllCenters` = "Select All Centers"
- `prayerCalendarSelectAllRandom` = "Select All Random"
- etc.

These appear to be AI-generated key padding. They have no corresponding UI and inflate every language file by 36 entries. Total of 36 x 8 = 288 dead entries across all language files.

---

## Finding 13 — [P3] Number formatting not locale-aware in 6 locations

**Category:** Locale-Aware Formatting
**Severity:** P3 — Medium

These files use English-only compact number formatting:

| # | File | Line | Code |
|---|------|------|------|
| 1 | `app/(screens)/account-switcher.tsx` | 39-41 | `(n / 1000000).toFixed(1)}M` / `(n / 1000).toFixed(1)}K` |
| 2 | `app/(screens)/analytics.tsx` | 170-172 | Same M/K pattern |
| 3 | `app/(screens)/communities.tsx` | 58-60 | Same M/K pattern |
| 4 | `app/(tabs)/minbar.tsx` | 141 | `.toLocaleString()` without locale param |
| 5 | `app/(screens)/audio-library.tsx` | 143 | `.toLocaleString()` without locale param |
| 6 | `app/(screens)/channel/[handle].tsx` | 353 | `.toLocaleString()` without locale param |

In Arabic, numbers should display as `١٬٠٠٠` not `1,000`. The K/M suffixes are English-only. The built `formatCompactNumber()` in `localeFormat.ts` handles this correctly but is never used.

---

## Finding 14 — [P3] Race condition: non-English users see English flash

**File:** `apps/mobile/src/i18n/index.ts`, lines 48-74
**Category:** UX
**Severity:** P3 — Medium

i18next is initialized with only English bundled (line 53). For non-English users, `lng` is set to their language (e.g., `ar`), but the resource bundle is loaded asynchronously (lines 67-73). During the async load, i18next falls back to English. This causes a visible English flash before the Arabic/Turkish/etc. text appears.

```ts
// Line 55: lng is set to userLang (e.g., 'ar')
// But line 53: only English resources are loaded
// Lines 67-73: Arabic is loaded asynchronously AFTER init
```

---

## Finding 15 — [P3] English fallback strings embedded in t() calls

**Category:** Hardcoded Fallback Strings
**Severity:** P3 — Medium

Some files pass English fallback strings directly to `t()`, which will display English if the key is missing from the language file:

| # | File | Line | Code |
|---|------|------|------|
| 1 | `app/(screens)/chat-export.tsx` | 41 | `t('chatExport.errorTitle', 'Error')` |
| 2 | `app/(screens)/chat-export.tsx` | 42 | `t('chatExport.errorLoadStats', 'Failed to load chat statistics')` |
| 3 | `app/(screens)/disappearing-default.tsx` | 64 | `t('disappearingDefault.errorTitle', 'Error')` |
| 4 | `app/(screens)/cashout.tsx` | 120 | `t('cashout.errorTitle', 'Error')` |
| 5 | `app/(screens)/chat-lock.tsx` | 65 | `t('chatLock.removeLockMessage', 'Are you sure...')` |

While i18next fallback strings are a valid pattern, these ensure English always appears when the key is missing from any of the 5 mostly-untranslated languages, creating mixed-language UIs.

---

## Finding 16 — [P4] No loading indicator during async language load

**File:** `apps/mobile/src/i18n/index.ts`, lines 67-73
**Category:** UX
**Severity:** P4 — Low

When a non-English language is loading asynchronously, there is no visual loading indicator. The app renders immediately with English text, then re-renders when the language file loads. On slow connections, users may interact with English UI elements before the translation appears.

---

## Finding 17 — [P4] i18n key count includes significant bloat

**File:** `apps/mobile/src/i18n/en.json`
**Category:** Maintainability
**Severity:** P4 — Low

The en.json has 2,742 keys. Analysis reveals:

- **36 dead keys** in `islamic.prayerCalendar*` (never used in code)
- **~200+ keys** duplicated across sections (e.g., `saf.viewInsights`, `bakra.viewInsights`, `majlis.viewInsights`, `profile.viewInsights` all have the same "View Insights" text duplicated 4x)
- Multiple sections that duplicate `common.*` keys (e.g., `saf.like` vs `common.like`, `saf.share` vs `common.share`)

This bloat means each new language requires translating ~2,742 keys when the actual unique strings may be closer to ~1,800.

---

## Finding 18 — [P2] Arabic `settings.*` section heavily untranslated

**File:** `apps/mobile/src/i18n/ar.json`, settings section (~line 1107)
**Category:** Translation Completeness
**Severity:** P2 — High

43 keys in the Arabic `settings.*` section are untranslated English, including critical user-facing strings:

- `settings.account` = "Account"
- `settings.appearance` = "Appearance"
- `settings.logout` = "Logout"
- `settings.deleteAccount` = "Delete Account"
- `settings.termsOfService` = "Terms of Service"
- `settings.privacyPolicy` = "Privacy Policy"
- `settings.billing` = "Billing"
- `settings.paymentMethods` = "Payment Methods"

These appear in the Settings screen which is one of the most frequently visited screens.

---

## Detailed Language Translation Breakdown

### Turkish (tr.json) — 97.8% translated (GOOD)
Only 59 keys untranslated. Best non-English language.

### Arabic (ar.json) — 81.1% translated (NEEDS WORK)
518 keys untranslated. Pattern: `common.*` and `tabs.*` are fully translated, but `saf.view*`, `bakra.view*`, `majlis.view*`, `profile.view*` are all English. The `islamic.prayerCalendar*` bloat keys (36) are all English.

### Urdu (ur.json) — 14.0% translated (BROKEN)
Only 385 keys translated. Translated: `common.*` (partial), `auth.*` (7 keys), `tabs.*` (5 keys), and scattered keys in newer sections like `dailyBriefing`, `videoEditor`, `stickers`, `encryption`, etc. Pattern suggests the common section was translated first, then later sections were added with translated text while early sections were left untranslated.

### Bengali (bn.json) — 13.4% translated (BROKEN)
368 keys translated. Same pattern as Urdu.

### French (fr.json) — 12.9% translated (BROKEN)
353 keys translated. Same pattern as Urdu/Bengali.

### Indonesian (id.json) — 13.1% translated (BROKEN)
358 keys translated. Same pattern.

### Malay (ms.json) — 12.9% translated (BROKEN)
355 keys translated. Same pattern.

---

## Architecture Issues

### Missing locale infrastructure:
1. No language selector screen wired to `changeLanguage()` with proper types
2. No mechanism to reload RTL layout when language changes (requires app restart)
3. No locale-aware date-fns configuration
4. No locale passed to `.toLocaleString()` calls
5. `localeFormat.ts` utility complete but orphaned

### Missing pluralization infrastructure:
1. Only 1 of 2,742 keys uses i18next plural forms
2. Arabic needs `_zero`, `_one`, `_two`, `_few`, `_many`, `_other` suffix keys
3. No plural extraction or validation tooling

---

## Recommendations (Priority Order)

1. **P0:** Fix `isRTL` to include Urdu: `language === 'ar' || language === 'ur'`
2. **P1:** Fix `changeLanguage` type to include all 8 languages
3. **P1:** Either complete the 5 broken translations or remove them from the language list to avoid false advertising
4. **P2:** Wire `localeFormat.ts` into all screens that currently use raw `.toLocaleString()` and date-fns
5. **P2:** Replace all 17 hardcoded `Alert.alert()` strings with `t()` calls
6. **P2:** Add date-fns locale imports and pass `{ locale }` to all formatDistanceToNow calls
7. **P2:** Complete Arabic translation for remaining 518 keys (especially `settings.*` and `islamic.*`)
8. **P3:** Add proper pluralization keys for countable nouns (at minimum `_one`/`_other`)
9. **P3:** Remove 36 dead `prayerCalendar*` bloat keys from all 8 language files
10. **P3:** Call `forceRTLLayout()` in app initialization based on detected language
