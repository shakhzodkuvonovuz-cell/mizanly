# X08 -- i18n Completeness Hostile Audit

Audited: 2026-04-05
Source files: apps/mobile/src/i18n/{en,ar,tr,ur,bn,fr,id,ms}.json
Screen samples: 15 screens in apps/mobile/app/(screens)/

---

## Key Count Summary

| Locale | Keys | Delta vs en | Missing from en | Orphaned (not in en) |
|--------|------|-------------|-----------------|---------------------|
| en     | 4657 | --          | --              | --                  |
| ar     | 4652 | -5          | 7               | 2                   |
| tr     | 4652 | -5          | 7               | 2                   |
| ur     | 4664 | +7          | 1               | 8                   |
| bn     | 4658 | +1          | 1               | 2                   |
| fr     | 4658 | +1          | 1               | 2                   |
| id     | 4658 | +1          | 1               | 2                   |
| ms     | 4658 | +1          | 1               | 2                   |

Overall: 4657 keys in en. Locales are within 0.3% of en. Good coverage.

---

## CRITICAL

### X08-C01: 6 Islamic screen keys missing from ar and tr
The following keys exist in en.json but are MISSING from ar.json and tr.json:
- `islamic.duaCollection`
- `islamic.fastingTracker`
- `islamic.halalFinder`
- `islamic.hifzTracker`
- `islamic.morningBriefing`
- `islamic.namesOfAllah`

Arabic and Turkish are the two most important RTL/Islamic locales. These are navigation-level labels for the Islamic hub screens. Users see English fallback or empty string.

### X08-C02: `bakra.effects` key missing from ALL 7 non-en locales
Present in en.json, absent from ar, tr, ur, bn, fr, id, ms. Universal miss.

---

## HIGH

### X08-H01: Orphaned keys pollute ur.json under wrong namespace
ur.json contains 6 orphaned keys under `mosque.*` namespace that don't exist in en.json:
- `mosque.duaCollection`
- `mosque.fastingTracker`
- `mosque.halalFinder`
- `mosque.hifzTracker`
- `mosque.morningBriefing`
- `mosque.namesOfAllah`

These appear to be the missing `islamic.*` keys copy-pasted under the wrong namespace. They are never resolved by `t()` (which looks up `islamic.*`), so they're dead code AND the real keys are still missing.

### X08-H02: Orphaned `createReel.contentBlocked` and `createVideo.contentBlocked` in ALL non-en locales
These 2 keys exist in ar, tr, ur, bn, fr, id, ms but NOT in en.json. Either:
1. en.json is missing these keys (code uses them but en has no value), or
2. They were removed from en but not from other locales (dead code in 7 files).

### X08-H03: Hardcoded English `defaultValue` fallbacks used across 50+ callsites
Sampled 50 callsites using `t('key', { defaultValue: 'English text' })`. If the i18n key doesn't exist in a locale, the English defaultValue is shown regardless of user language. This is a systemic pattern -- examples:
- `dhikr-counter.tsx:241` -- `t('screens.dhikrCounter.sessionSaved', { defaultValue: 'Session saved' })`
- `dhikr-counter.tsx:302` -- `t('screens.dhikrCounter.resetTitle', { defaultValue: 'Reset Counter?' })`
- `dua-collection.tsx:90` -- `t('common.listen', { defaultValue: 'Listen' })`
- `names-of-allah.tsx:137` -- `t('islamic.audioPronunciationComingSoon', { defaultValue: 'Audio pronunciation coming soon' })`
- `mosque-finder.tsx:253` -- `t('distance.km', { value: ..., defaultValue: '{{value}} km' })`
- `zakat-calculator.tsx:267` -- `t('screens.zakatCalculator.resetConfirm', 'This will clear all entered data. Continue?')`

The `defaultValue` pattern is acceptable IF the key exists in all locales. These need verification that every key used with defaultValue actually exists in all 8 locale files.

### X08-H04: `|| 'English'` fallback pattern in JSX -- 8 callsites in Islamic screens
The `t('key') || 'English Fallback'` pattern means if the key resolves to empty string, English shows:
- `islamic-calendar.tsx:285` -- `|| 'Community'`
- `islamic-calendar.tsx:537` -- `|| 'Community Events'`
- `islamic-calendar.tsx:548` -- `|| 'No community events'`
- `account-switcher.tsx:134` -- `|| 'Could not switch accounts. Please try again.'`
- `account-switcher.tsx:147` -- `|| 'Sign Out All'`
- `communities.tsx:433` -- `|| 'Create Community'`
- `communities.tsx:438` -- `|| 'Browse Communities'`
- `video-premiere.tsx:93` -- `|| 'Video'`

---

## MEDIUM

### X08-M01: Hardcoded English cuisine types -- halal-finder.tsx L24-26
```ts
const CUISINE_TYPES = [
  'Middle Eastern', 'South Asian', 'Turkish', 'Malaysian', 'Indonesian',
  'North African', 'Persian', 'Pakistani', 'Bangladeshi', 'Mediterranean',
];
```
10 strings displayed in UI without `t()` wrapper. Affects all non-English users.

### X08-M02: Hardcoded English compass directions -- prayer-times.tsx L84, mosque-finder.tsx L52
`['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']` used in `getCompassDirection()` and `computeQiblaBearing()`. Displayed to user. Not i18n-wrapped.

### X08-M03: Hardcoded English AM/PM -- mosque-finder.tsx L82
```ts
const ampm = h < 12 ? 'AM' : 'PM';
```
Time formatting ignores locale.

### X08-M04: Hardcoded English prayer names in computeNextPrayer -- mosque-finder.tsx L58-69
Returns `'Fajr'`, `'Dhuhr'` etc. in English. Displayed in mosque cards.

### X08-M05: Hardcoded "Shared from Mizanly" in 3 share functions
- names-of-allah.tsx L188
- dua-collection.tsx L199
- dhikr-counter.tsx L334 (`Mizanly - Dhikr Counter`)

### X08-M06: PRESET_PHRASES meaning field used in accessibilityLabel -- dhikr-counter.tsx L41-46, L140
```ts
accessibilityLabel={`${phrase.latin} - ${phrase.meaning}`}
```
`meaning` is English only. Screen readers for Arabic/Urdu users speak English meanings.

### X08-M07: qibla-compass.tsx compass rose labels hardcoded -- L288-291
`N`, `E`, `S`, `W` rendered as literal JSX text. Not passed through `t()`.

### X08-M08: Hardcoded English `'User'` fallback in audio-room.tsx L158-177
```ts
name: p.user.name || p.user.username || 'User',
```
3 occurrences. Should be `t('common.user')`.

### X08-M09: Hardcoded English `'Contact'` fallback -- conversation/[id].tsx L451
```ts
JSON.parse(message.content || '{}').displayName || 'Contact'
```
Repeated twice on same line. Should be `t('common.contact')`.

### X08-M10: `formatHijriDate` locale parameter uses `isRTL ? 'ar' : 'en'` -- prayer-times.tsx L693, islamic-calendar.tsx L301
This is a boolean check: RTL = Arabic, LTR = English. But Turkish, French, Indonesian, Malay are all LTR and should get their own locale formatting, not English. Urdu and Bengali are not considered.

---

## LOW

### X08-L01: `invite-friends.tsx` L75 uses `t()` with inline English fallback
```ts
t('invite.heroSubtitle', 'Invite your friends and family to join Mizanly...')
```
75-character English fallback baked into JSX.

### X08-L02: `schedule-post.tsx` L47 hardcodes `'Saf'`
```ts
space: (params.space || 'Saf') as SpaceType,
```
Space type name in English. Not user-facing if hidden, but leaks into type system.

### X08-L03: No automated i18n completeness check in CI
There is no script or test that verifies all non-en locales have every key from en.json. The 7 missing keys found in C01 could have been caught automatically.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 10 |
| Low | 3 |
| **Total** | **19** |

### Key themes:
1. **ar.json and tr.json missing 6 Islamic screen keys** -- highest-priority locales for a Muslim social app
2. **Orphaned keys in ur.json** under wrong namespace (mosque.* instead of islamic.*)
3. **50+ callsites use English `defaultValue` fallback** -- systemic pattern that hides missing translations
4. **8+ callsites use `|| 'English'` fallback** -- same problem
5. **Hardcoded English in utility functions** (compass directions, AM/PM, prayer names, cuisine types)
6. **No CI enforcement** -- missing keys only found by manual audit
