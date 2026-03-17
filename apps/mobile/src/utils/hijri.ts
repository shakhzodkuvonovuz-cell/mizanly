export interface HijriDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export const HIJRI_MONTHS_EN = [
  'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani',
  'Jumada al-Ula', 'Jumada al-Thani', 'Rajab', 'Shaban',
  'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah',
];

export const HIJRI_MONTHS_AR = [
  '\u0645\u062d\u0631\u0645', '\u0635\u0641\u0631', '\u0631\u0628\u064a\u0639 \u0627\u0644\u0623\u0648\u0644', '\u0631\u0628\u064a\u0639 \u0627\u0644\u062b\u0627\u0646\u064a',
  '\u062c\u0645\u0627\u062f\u0649 \u0627\u0644\u0623\u0648\u0644\u0649', '\u062c\u0645\u0627\u062f\u0649 \u0627\u0644\u0622\u062e\u0631\u0629', '\u0631\u062c\u0628', '\u0634\u0639\u0628\u0627\u0646',
  '\u0631\u0645\u0636\u0627\u0646', '\u0634\u0648\u0627\u0644', '\u0630\u0648 \u0627\u0644\u0642\u0639\u062f\u0629', '\u0630\u0648 \u0627\u0644\u062d\u062c\u0629',
];

export function gregorianToHijri(date: Date): HijriDate {
  // Kuwaiti algorithm — Gregorian to Hijri conversion
  const d = date.getDate();
  const m = date.getMonth(); // 0-based
  const y = date.getFullYear();

  // Calculate Julian Day Number from Gregorian
  let jd: number;
  if (m < 2) {
    // Jan or Feb — treat as month 13/14 of previous year
    jd =
      Math.floor(365.25 * (y - 1)) +
      Math.floor(30.6001 * (m + 13)) +
      d +
      1720995;
  } else {
    jd =
      Math.floor(365.25 * y) +
      Math.floor(30.6001 * (m + 1 + 1)) +
      d +
      1720995;
  }
  // Gregorian correction
  const a = Math.floor(y / 100);
  jd = jd + 2 - a + Math.floor(a / 4);

  // Julian Day to Hijri
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const remainder = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - remainder) / 5316) *
      Math.floor((50 * remainder) / 17719) +
    Math.floor(remainder / 5670) *
      Math.floor((43 * remainder) / 15238);
  const remainderL =
    remainder -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const hijriMonth = Math.floor((24 * remainderL) / 709);
  const hijriDay = remainderL - Math.floor((709 * hijriMonth) / 24);
  const hijriYear = 30 * n + j - 30;

  return { year: hijriYear, month: hijriMonth, day: hijriDay };
}

export function getHijriMonthName(
  month: number,
  locale: 'en' | 'ar' = 'en',
): string {
  const months = locale === 'ar' ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  return months[(month - 1) % 12] || '';
}

export function formatHijriDate(
  date: Date,
  locale: 'en' | 'ar' = 'en',
): string {
  const hijri = gregorianToHijri(date);
  const monthName = getHijriMonthName(hijri.month, locale);
  if (locale === 'ar') {
    return `${hijri.day} ${monthName} ${hijri.year} \u0647\u0640`;
  }
  return `${hijri.day} ${monthName} ${hijri.year} AH`;
}
