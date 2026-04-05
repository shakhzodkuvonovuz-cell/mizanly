# M16 -- Islamic Screens Hostile Audit

Audited: 2026-04-05
Files: prayer-times.tsx, qibla-compass.tsx, islamic-calendar.tsx, names-of-allah.tsx, fasting-tracker.tsx, dhikr-counter.tsx, dua-collection.tsx, halal-finder.tsx, mosque-finder.tsx, zakat-calculator.tsx

---

## CRITICAL

### M16-C01: Stale closure in `fetchData` -- prayer-times.tsx L441
`fetchData` uses `t()` at lines 404 and 436 but the `useCallback` dependency array on line 441 only includes `[calculationMethod]`. When the locale changes (user switches language), `fetchData` will use a stale `t` closure, producing error messages in the previous language.

### M16-C02: Module-level Audio.Sound never unloaded -- dhikr-counter.tsx L110-126
`_beadClickSound` is a module-level `Audio.Sound` singleton created on first tap. It is never `unloadAsync()`-ed. On hot module reload or screen unmount/remount, the old native audio resource leaks. The component has no useEffect cleanup for this resource. Compare with `dua-collection.tsx` L139 which correctly unloads on unmount.

### M16-C03: Hardcoded English compass directions -- prayer-times.tsx L84
```ts
const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
```
Identical issue in mosque-finder.tsx L52. Not wrapped in `t()`. Arabic/Turkish/Urdu users see English abbreviations. The qibla-compass.tsx correctly uses i18n keys for cardinal directions (lines 79-87).

### M16-C04: Hardcoded English prayer name in mosque-finder.tsx L58, L69
```ts
if (!prayerTimes) return 'Fajr';
return 'Fajr'; // Tomorrow's Fajr
```
`computeNextPrayer` returns hardcoded English strings `'Fajr'`, `'Dhuhr'` etc. (line 62-68 capitalizes raw key). Not passed through `t()`. Displayed in MosqueCard at L183-184.

### M16-C05: Hardcoded English `AM`/`PM` in mosque-finder.tsx L82
```ts
const ampm = h < 12 ? 'AM' : 'PM';
```
`computeNextPrayerTime` hardcodes English AM/PM for 12-hour format. Arabic/Bengali users see English time markers. Should use `Intl.DateTimeFormat` or locale-aware formatting.

---

## HIGH

### M16-H01: Hardcoded English cuisine type strings -- halal-finder.tsx L24-26
```ts
const CUISINE_TYPES = [
  'Middle Eastern', 'South Asian', 'Turkish', 'Malaysian', 'Indonesian',
  'North African', 'Persian', 'Pakistani', 'Bangladeshi', 'Mediterranean',
];
```
10 hardcoded English strings displayed as filter chips. Not wrapped in `t()`.

### M16-H02: Hardcoded English phrase meanings -- dhikr-counter.tsx L41-46
```ts
{ id: 'subhanallah', latin: 'SubhanAllah', arabic: '...', meaning: 'Glory be to Allah' },
```
The `meaning` field is English-only. The component does use `t(`screens.dhikrCounter.phraseMeaning.${phrase.id}`)` at L156 for display, but the `meaning` field is still used in the `accessibilityLabel` at L140:
```ts
accessibilityLabel={`${phrase.latin} - ${phrase.meaning}`}
```
Accessibility label is always English.

### M16-H03: Hardcoded English "N"/"E"/"S"/"W" on compass rose -- qibla-compass.tsx L288-291
```tsx
<Text style={[styles.cardinalLabel, styles.cardinalN]}>N</Text>
<Text style={[styles.cardinalLabel, styles.cardinalE]}>E</Text>
<Text style={[styles.cardinalLabel, styles.cardinalS]}>S</Text>
<Text style={[styles.cardinalLabel, styles.cardinalW]}>W</Text>
```
Cardinal direction labels on the compass face are hardcoded English. Not wrapped in `t()`. Ironic because the same file's `getCardinalDirection` function (L74-89) correctly uses i18n keys.

### M16-H04: Nested VirtualizedList warning -- halal-finder.tsx L198 inside L233
`listHeader` (line 195-205) contains a horizontal `FlatList` for cuisine chips. This is rendered inside the vertical `FlatList` at L233 via `ListHeaderComponent`. React Native logs: "VirtualizedLists should never be nested inside plain ScrollViews". Should use `ScrollView` + map for the horizontal chips (same fix applied in dua-collection.tsx L282-313).

### M16-H05: `fetchData` missing `refreshing` in dep array -- prayer-times.tsx L441
`fetchData` references `refreshing` at L382 (`if (!refreshing) setLoading(true)`) but the dependency array is `[calculationMethod]`. Stale `refreshing` value means `setLoading(true)` may incorrectly fire during refreshes.

### M16-H06: Hardcoded English "Shared from Mizanly" in share messages
- names-of-allah.tsx L188: `\n\nShared from Mizanly`
- dua-collection.tsx L199: `\n\nShared from Mizanly`
- dhikr-counter.tsx L334: `\nMizanly - Dhikr Counter`

All hardcoded. Should use `t('share.sharedFromMizanly')`.

### M16-H07: Hardcoded English in `islamic-calendar.tsx` fallback strings
- L285: `t('screens.islamicCalendar.badgeCommunity') || 'Community'`
- L537: `t('screens.islamicCalendar.communityEvents') || 'Community Events'`
- L548: `t('screens.islamicCalendar.noCommunityEvents') || 'No community events'`

Three fallback strings are English. If the i18n key is missing, users see English regardless of locale. Use `defaultValue` parameter in `t()` or ensure key exists in all locales.

---

## MEDIUM

### M16-M01: `islamic-calendar.tsx` uses module-level `styles` -- not theme-reactive
L632: `const styles = StyleSheet.create({...})` is a module-level constant. It uses hardcoded `colors.dark.*` values. If the user switches to light theme, this screen won't adapt. Compare with prayer-times.tsx and zakat-calculator.tsx which correctly use `createStyles(tc)`.

Same issue in fasting-tracker.tsx L343 and dhikr-counter.tsx L567 -- both use module-level `StyleSheet.create` with hardcoded dark colors.

### M16-M02: `fasting-tracker.tsx` CalendarDay uses module-level styles
L343: `const styles = StyleSheet.create({...})` -- never adapts to theme. Colors like `colors.dark.bg`, `colors.text.primary` etc. hardcoded.

### M16-M03: `dua-collection.tsx` uses module-level styles -- L376
Same pattern: `const styles = StyleSheet.create({...})` with `colors.dark.*` hardcoded throughout (L376-498). Not theme-reactive.

### M16-M04: `halal-finder.tsx` uses module-level styles -- L258
Same pattern: `const styles = StyleSheet.create({...})` with `colors.dark.*`. Not theme-reactive.

### M16-M05: `mosque-finder.tsx` uses module-level styles -- L485
Same pattern: `const styles = StyleSheet.create({...})` with `colors.dark.*`. Not theme-reactive.

### M16-M06: Hijri calendar approximation disclaimer only visible inside calendar card
L481-483: The disclaimer `t('screens.islamicCalendar.approximateDisclaimer')` is rendered inside the calendar card. Good that it exists. However, the Hijri-to-Gregorian conversion in `getStartDayOfHijriMonth` (L64-76) uses a simple Kuwaiti algorithm approximation that can be off by 1-2 days. No external API fallback. Acceptable if disclaimer is prominent.

### M16-M07: Location coordinates displayed directly to user -- prayer-times.tsx L555
```tsx
t('islamic.locationCoords', { lat: userLocation.lat.toFixed(2), lng: userLocation.lng.toFixed(2) })
```
Shows user's GPS coordinates. While lat/lng to 2 decimal places is ~1.1km precision (not exact), consider showing city name via reverse geocoding instead. Privacy concern: coordinates persist in AsyncStorage cache (L426).

### M16-M08: `names-of-allah.tsx` toggleLearned uses setTimeout without clearTimeout -- L184
```ts
setTimeout(() => { togglingRef.current = false; }, 300);
```
No clearTimeout on unmount. If component unmounts within 300ms of toggling, the ref update fires on unmounted component (ref-only so no crash, but sloppy).

### M16-M09: Zakat calculator hardcodes USD -- zakat-calculator.tsx L115, L301
`prefix = '$'` default in InputCard, and `localeFormatCurrency(value, 'USD')` in formatCurrency. All amounts shown in USD regardless of user locale. A user in Turkey, Indonesia, or Malaysia sees `$` prefix and USD formatting. Should detect locale currency or let user select currency.

### M16-M10: Nisab calculation uses silver standard -- zakat-calculator.tsx L209
```ts
const nisabThreshold = Math.min(nisabGold, nisabSilver);
```
Takes the minimum of gold and silver nisab. This follows the Hanafi opinion (silver standard). Many scholars (Maliki, Shafi'i, Hanbali) use the gold standard. Should clarify which school's ruling is applied or let user choose.

---

## LOW

### M16-L01: `qibla-compass.tsx` magnetometer not checked for availability before subscribe -- L154-156
```ts
Magnetometer.setUpdateInterval(100);
const subscription = Magnetometer.addListener(...)
```
Unlike prayer-times.tsx (L325 checks `Magnetometer.isAvailableAsync()`), the qibla-compass subscribes without checking availability first. On devices without magnetometer, this may silently fail or throw.

### M16-L02: `names-of-allah.tsx` renders all 99 items via FlatList with springify animation
L194: `FadeInUp.delay(Math.min(index, 25) * 30).duration(350).springify()` on every item. 99 * springify animation on mount is heavy. Performance concern on low-end devices.

### M16-L03: `dua-collection.tsx` soundRef never used for playback
L132: `const soundRef = useRef<Audio.Sound | null>(null);` is declared and cleaned up on unmount (L139), but `handlePlayAudio` (L133-136) just shows a toast. The ref is dead code.

### M16-L04: `zakat-calculator.tsx` fetches metal prices with zero-value zakat calculation -- L199
```ts
queryFn: () => islamicApi.calculateZakat({ cash: 0, gold: 0, silver: 0, investments: 0, debts: 0 })
```
Calls the full zakat calculation endpoint just to get metal prices. Should have a dedicated `/metal-prices` endpoint or return prices from a separate query.

### M16-L05: `fasting-tracker.tsx` hardcodes `fastType: 'ramadan'` for today's log -- L148
```ts
logMutation.mutate({ date: todayStr, isFasting, fastType: 'ramadan' });
```
When user taps "Yes, I'm fasting" today, it always logs as Ramadan fast. The `FAST_TYPES` constant (L27) includes 8 types but the UI doesn't let user select which type.

### M16-L06: `mosque-finder.tsx` imports `MapView` from `react-native-maps` unconditionally -- L28
If `react-native-maps` native module is not linked (Expo Go), this will crash on import. Should be conditionally imported or wrapped in try/catch.

### M16-L07: `zakat-calculator.tsx` L517 inline style with hardcoded color
```tsx
<Text style={{ color: colors.gold, fontSize: fontSize.xs, fontFamily: fonts.body }}>
```
Should use `createStyles` pattern. Minor -- single occurrence.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 7 |
| Medium | 10 |
| Low | 7 |
| **Total** | **29** |

### Key themes:
1. **Hardcoded English strings throughout** (compass directions, cuisine types, AM/PM, prayer names, share messages, fallback strings) -- 8 findings
2. **Module-level StyleSheet.create with dark-mode colors** (5 of 10 screens) -- not theme-reactive
3. **Audio resource leak** (dhikr-counter module-level Sound never unloaded)
4. **Stale closure in useCallback** (prayer-times fetchData missing `t` dependency)
5. **USD hardcoded for zakat** -- wrong for non-US users
