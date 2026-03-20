/**
 * Prayer Time Calculator — Solar angle-based computation
 *
 * Implements standard astronomical formulas for calculating Islamic prayer times
 * based on solar position. Used as fallback when the Aladhan API is unreachable.
 *
 * References:
 * - http://praytimes.org/calculation
 * - "Astronomical Algorithms" by Jean Meeus
 */

export interface MethodAngles {
  fajr: number;
  isha: number;
  /** Umm al-Qura: Isha = fixed minutes after Maghrib instead of angle */
  ishaMinutes?: number;
  /** 1 = Shafi'i (shadow = object + noon shadow), 2 = Hanafi (shadow = 2*object + noon shadow) */
  asrFactor: number;
}

/**
 * Calculation method parameters.
 * Key = Aladhan API method number OR our local method IDs.
 */
export const METHOD_PARAMS: Record<string | number, MethodAngles> = {
  // Aladhan API method numbers
  0:  { fajr: 16, isha: 14, asrFactor: 1 },       // Shia Ithna-Ansari
  1:  { fajr: 18, isha: 18, asrFactor: 2 },       // Karachi (Hanafi Asr)
  2:  { fajr: 15, isha: 15, asrFactor: 1 },       // ISNA
  3:  { fajr: 18, isha: 17, asrFactor: 1 },       // MWL
  4:  { fajr: 18.5, isha: 0, ishaMinutes: 90, asrFactor: 1 }, // Umm al-Qura
  5:  { fajr: 19.5, isha: 17.5, asrFactor: 1 },   // Egypt
  7:  { fajr: 17.7, isha: 14, asrFactor: 1 },     // Tehran
  8:  { fajr: 19.5, isha: 0, ishaMinutes: 90, asrFactor: 1 }, // Gulf
  9:  { fajr: 18, isha: 17.5, asrFactor: 1 },     // Kuwait
  10: { fajr: 18, isha: 0, ishaMinutes: 90, asrFactor: 1 },   // Qatar
  11: { fajr: 20, isha: 18, asrFactor: 1 },       // Singapore
  12: { fajr: 12, isha: 12, asrFactor: 1 },       // France
  13: { fajr: 18, isha: 17, asrFactor: 1 },       // Turkey / Diyanet
  14: { fajr: 16, isha: 15, asrFactor: 1 },       // Russia
  15: { fajr: 18, isha: 18, asrFactor: 1 },       // Moonsighting

  // Our named method IDs (legacy)
  MWL:     { fajr: 18, isha: 17, asrFactor: 1 },
  ISNA:    { fajr: 15, isha: 15, asrFactor: 1 },
  Egypt:   { fajr: 19.5, isha: 17.5, asrFactor: 1 },
  Makkah:  { fajr: 18.5, isha: 0, ishaMinutes: 90, asrFactor: 1 },
  Karachi: { fajr: 18, isha: 18, asrFactor: 2 },
  Tehran:  { fajr: 17.7, isha: 14, asrFactor: 1 },
  JAKIM:   { fajr: 20, isha: 18, asrFactor: 1 },
  DIYANET: { fajr: 18, isha: 17, asrFactor: 1 },
};

export interface CalculatedPrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  imsak: string;
  midnight: string;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function sin(d: number): number { return Math.sin(d * DEG); }
function cos(d: number): number { return Math.cos(d * DEG); }
function tan(d: number): number { return Math.tan(d * DEG); }
function asin(x: number): number { return Math.asin(x) * RAD; }
function acos(x: number): number { return Math.acos(Math.max(-1, Math.min(1, x))) * RAD; }
function atan2(y: number, x: number): number { return Math.atan2(y, x) * RAD; }

/**
 * Gregorian date → Julian Day Number
 */
function julianDay(year: number, month: number, day: number): number {
  if (month <= 2) {
    year -= 1;
    month += 12;
  }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

/**
 * Solar declination and equation of time for a given Julian Day.
 * Uses simplified solar position formulas (Jean Meeus).
 */
function solarPosition(jd: number): { declination: number; equationOfTime: number } {
  const D = jd - 2451545.0; // days since J2000.0
  const g = 357.529 + 0.98560028 * D; // mean anomaly
  const q = 280.459 + 0.98564736 * D; // mean longitude
  const L = q + 1.915 * sin(g) + 0.020 * sin(2 * g); // ecliptic longitude
  const e = 23.439 - 0.00000036 * D; // obliquity of ecliptic
  const declination = asin(sin(e) * sin(L));

  const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
  const eqTime = (q / 15) - fixHour(RA);

  return { declination, equationOfTime: eqTime };
}

/**
 * Compute hour angle for a given solar angle below horizon.
 * Returns hours (can be negative).
 */
function hourAngle(lat: number, declination: number, angle: number): number {
  const cosHA = (sin(angle) - sin(lat) * sin(declination)) / (cos(lat) * cos(declination));
  if (cosHA > 1) return 0;   // sun doesn't reach this angle (polar)
  if (cosHA < -1) return 12; // midnight sun
  return acos(cosHA) / 15;
}

/**
 * Asr hour angle using shadow factor.
 * factor=1 for Shafi'i, factor=2 for Hanafi.
 */
function asrHourAngle(lat: number, declination: number, factor: number): number {
  const delta = Math.abs(lat - declination);
  const angle = -acos((sin(acos(1 / (factor + tan(delta)))) - sin(lat) * sin(declination)) / (cos(lat) * cos(declination)));
  // Convert to positive hour angle
  return Math.abs(angle) / 15;
}

function fixHour(h: number): number {
  h = h % 24;
  return h < 0 ? h + 24 : h;
}

function toTimeString(hours: number): string {
  hours = fixHour(hours);
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const hStr = h.toString().padStart(2, '0');
  const mStr = (m >= 60 ? 59 : m).toString().padStart(2, '0');
  return `${hStr}:${mStr}`;
}

/**
 * Calculate prayer times for a given date, location, and method.
 */
export function calculatePrayerTimes(
  date: Date,
  lat: number,
  lng: number,
  methodKey: string | number = 3,
): CalculatedPrayerTimes {
  const method = METHOD_PARAMS[methodKey] || METHOD_PARAMS[3]; // default MWL
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const jd = julianDay(year, month, day);
  const { declination, equationOfTime } = solarPosition(jd);

  // Solar noon (Dhuhr) in UTC, then shifted by longitude
  const noon = 12 + (-lng / 15) - equationOfTime;

  // Sunrise & sunset (standard angle -0.833° for atmospheric refraction)
  const sunriseAngle = hourAngle(lat, declination, -0.833);
  const sunrise = noon - sunriseAngle;
  const sunset = noon + sunriseAngle;

  // Fajr
  const fajrHA = hourAngle(lat, declination, -method.fajr);
  const fajr = noon - fajrHA;

  // Dhuhr (add 1 minute safety margin)
  const dhuhr = noon + 1 / 60;

  // Asr
  const asrHA = asrHourAngle(lat, declination, method.asrFactor);
  const asr = noon + asrHA;

  // Maghrib (= sunset)
  const maghrib = sunset;

  // Isha
  let isha: number;
  if (method.ishaMinutes) {
    // Fixed minutes after Maghrib (e.g., Umm al-Qura: 90 min)
    isha = maghrib + method.ishaMinutes / 60;
  } else {
    const ishaHA = hourAngle(lat, declination, -method.isha);
    isha = noon + ishaHA;
  }

  // Imsak (10 minutes before Fajr)
  const imsak = fajr - 10 / 60;

  // Midnight (midpoint between sunset and sunrise next day)
  const midnight = sunset + (sunrise + 24 - sunset) / 2;

  return {
    fajr: toTimeString(fajr),
    sunrise: toTimeString(sunrise),
    dhuhr: toTimeString(dhuhr),
    asr: toTimeString(asr),
    maghrib: toTimeString(maghrib),
    isha: toTimeString(isha),
    imsak: toTimeString(imsak),
    midnight: toTimeString(midnight),
  };
}

/**
 * Get Ramadan start and end dates for a given Hijri year
 * using the Kuwaiti algorithm (same as hijri.ts).
 */
export function getRamadanDatesForYear(gregorianYear: number): { startDate: string; endDate: string } {
  // Try each day from Feb 1 to May 31 to find when Hijri month = 9 (Ramadan)
  let ramadanStart: Date | null = null;
  let ramadanEnd: Date | null = null;

  for (let month = 1; month <= 5; month++) {
    const daysInMonth = new Date(gregorianYear, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(gregorianYear, month, day);
      const hijri = gregorianToHijriSimple(date);
      if (hijri.month === 9 && hijri.day === 1 && !ramadanStart) {
        ramadanStart = date;
      }
      if (hijri.month === 10 && hijri.day === 1 && ramadanStart && !ramadanEnd) {
        // Ramadan ended the day before Shawwal 1
        ramadanEnd = new Date(date.getTime() - 86400000);
        break;
      }
    }
    if (ramadanEnd) break;
  }

  // Fallback: if not found in the range, search a wider window
  if (!ramadanStart) {
    for (let month = 0; month <= 11; month++) {
      const daysInMonth = new Date(gregorianYear, month + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(gregorianYear, month, day);
        const hijri = gregorianToHijriSimple(date);
        if (hijri.month === 9 && hijri.day === 1 && !ramadanStart) {
          ramadanStart = date;
        }
        if (hijri.month === 10 && hijri.day === 1 && ramadanStart && !ramadanEnd) {
          ramadanEnd = new Date(date.getTime() - 86400000);
          break;
        }
      }
      if (ramadanEnd) break;
    }
  }

  if (!ramadanStart || !ramadanEnd) {
    // Final fallback: approximate (shouldn't happen with valid algorithm)
    return { startDate: `${gregorianYear}-03-01`, endDate: `${gregorianYear}-03-30` };
  }

  return {
    startDate: formatDate(ramadanStart),
    endDate: formatDate(ramadanEnd),
  };
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Kuwaiti algorithm — Gregorian to Hijri.
 * Same algorithm as in apps/mobile/src/utils/hijri.ts.
 */
function gregorianToHijriSimple(date: Date): { year: number; month: number; day: number } {
  const d = date.getDate();
  const m = date.getMonth(); // 0-based
  const y = date.getFullYear();

  let jd: number;
  if (m < 2) {
    jd = Math.floor(365.25 * (y - 1)) + Math.floor(30.6001 * (m + 13)) + d + 1720995;
  } else {
    jd = Math.floor(365.25 * y) + Math.floor(30.6001 * (m + 1 + 1)) + d + 1720995;
  }
  const a = Math.floor(y / 100);
  jd = jd + 2 - a + Math.floor(a / 4);

  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const remainder = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - remainder) / 5316) * Math.floor((50 * remainder) / 17719) +
    Math.floor(remainder / 5670) * Math.floor((43 * remainder) / 15238);
  const rl =
    remainder -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hijriMonth = Math.floor((24 * rl) / 709);
  const hijriDay = rl - Math.floor((709 * hijriMonth) / 24);
  const hijriYear = 30 * n + j - 30;

  return { year: hijriYear, month: hijriMonth, day: hijriDay };
}
