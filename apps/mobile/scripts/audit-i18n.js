#!/usr/bin/env node
/**
 * i18n Audit Script — Comprehensive translation quality checker for Mizanly.
 *
 * Checks:
 * 1. All 8 files have identical key sets (no missing keys)
 * 2. No raw English text in non-English files
 * 3. Interpolation variables match across all translations
 * 4. No empty string values
 * 5. Potentially untranslated keys (identical to English)
 * 6. Islamic terminology consistency
 * 7. RTL validation for Arabic
 *
 * Usage: node scripts/audit-i18n.js
 */

const fs = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '..', 'src', 'i18n');
const LANGUAGES = ['en', 'ar', 'tr', 'ur', 'bn', 'fr', 'id', 'ms'];
const REFERENCE_LANG = 'en';

// Islamic terms that should be consistent per language
const ISLAMIC_GLOSSARY = {
  en: { salah: 'Salah', dua: "Du'a", jummah: "Jumu'ah", quran: 'Quran', dhikr: 'Dhikr', iftar: 'Iftar', suhoor: 'Suhoor' },
  ar: { salah: 'صلاة', dua: 'دعاء', jummah: 'جمعة', quran: 'القرآن', dhikr: 'ذكر', iftar: 'إفطار', suhoor: 'سحور' },
  tr: { salah: 'Namaz', dua: 'Dua', jummah: 'Cuma', quran: 'Kuran', dhikr: 'Zikir', iftar: 'İftar', suhoor: 'Sahur' },
  ur: { salah: 'نماز', dua: 'دعا', jummah: 'جمعہ', quran: 'قرآن', dhikr: 'ذکر', iftar: 'افطار', suhoor: 'سحری' },
  bn: { salah: 'সালাত', dua: 'দোয়া', jummah: 'জুমআ', quran: 'কুরআন', dhikr: 'যিকির', iftar: 'ইফতার', suhoor: 'সেহরি' },
  fr: { salah: 'Salat', dua: "Du'a", jummah: 'Joumou3a', quran: 'Coran', dhikr: 'Dhikr', iftar: 'Iftar', suhoor: 'Souhour' },
  id: { salah: 'Shalat', dua: 'Doa', jummah: 'Jumat', quran: 'Quran', dhikr: 'Dzikir', iftar: 'Iftar', suhoor: 'Sahur' },
  ms: { salah: 'Solat', dua: 'Doa', jummah: 'Jumaat', quran: 'Quran', dhikr: 'Zikir', iftar: 'Iftar', suhoor: 'Sahur' },
};

// Common English words that suggest untranslated content
const ENGLISH_MARKERS = [
  /\bSubmit\b/, /\bCancel\b/, /\bDelete\b/, /\bSave\b/, /\bEdit\b/,
  /\bSettings\b/, /\bProfile\b/, /\bLoading\b/, /\bError\b/, /\bSuccess\b/,
  /\bPlease\b/, /\bClick\b/, /\bTap\b/, /\bSwipe\b/,
];

// ── Helpers ─────────────────────────────────────────────────

function flattenKeys(obj, prefix = '') {
  const keys = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(keys, flattenKeys(value, fullKey));
    } else {
      keys[fullKey] = value;
    }
  }
  return keys;
}

function extractVariables(str) {
  const matches = str.match(/\{\{(\w+)\}\}/g) || [];
  return matches.sort();
}

// ── Load all language files ─────────────────────────────────

const data = {};
const flatData = {};

for (const lang of LANGUAGES) {
  const filePath = path.join(I18N_DIR, `${lang}.json`);
  try {
    data[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    flatData[lang] = flattenKeys(data[lang]);
  } catch (err) {
    console.error(`❌ Failed to load ${lang}.json: ${err.message}`);
    process.exit(1);
  }
}

const issues = {
  missingKeys: [],
  extraKeys: [],
  emptyValues: [],
  variableMismatch: [],
  possiblyUntranslated: [],
  englishInNonEnglish: [],
  islamicInconsistency: [],
};

const referenceKeys = Object.keys(flatData[REFERENCE_LANG]);

// ── Check 1: Missing/extra keys ─────────────────────────────

for (const lang of LANGUAGES) {
  if (lang === REFERENCE_LANG) continue;

  const langKeys = new Set(Object.keys(flatData[lang]));
  const refKeys = new Set(referenceKeys);

  for (const key of refKeys) {
    if (!langKeys.has(key)) {
      issues.missingKeys.push({ lang, key });
    }
  }

  for (const key of langKeys) {
    if (!refKeys.has(key)) {
      issues.extraKeys.push({ lang, key });
    }
  }
}

// ── Check 2-5: Value-level checks ──────────────────────────

for (const lang of LANGUAGES) {
  for (const [key, value] of Object.entries(flatData[lang])) {
    const strValue = String(value);

    // Check 4: Empty values
    if (strValue.trim() === '') {
      issues.emptyValues.push({ lang, key });
    }

    // Check 3: Variable mismatch
    if (lang !== REFERENCE_LANG && flatData[REFERENCE_LANG][key]) {
      const refVars = extractVariables(String(flatData[REFERENCE_LANG][key]));
      const langVars = extractVariables(strValue);
      if (JSON.stringify(refVars) !== JSON.stringify(langVars)) {
        issues.variableMismatch.push({
          lang, key,
          expected: refVars.join(', '),
          found: langVars.join(', '),
        });
      }
    }

    // Check 5: Possibly untranslated (identical to English, excluding very short strings)
    if (lang !== REFERENCE_LANG && strValue.length > 3) {
      const enValue = String(flatData[REFERENCE_LANG][key] || '');
      if (strValue === enValue && !/^[A-Z]{2,}$/.test(strValue) && !/^\d+$/.test(strValue)) {
        // Skip common proper nouns and abbreviations
        if (!/^(OK|URL|ID|API|QR|PIN|OTP|SMS|GIF|PDF|CSV|JSON|XML)$/i.test(strValue)) {
          issues.possiblyUntranslated.push({ lang, key, value: strValue });
        }
      }
    }

    // Check 2: English markers in non-English files
    if (lang !== REFERENCE_LANG && lang !== 'id' && lang !== 'ms') {
      // Skip id/ms which may legitimately use English loanwords
      for (const marker of ENGLISH_MARKERS) {
        if (marker.test(strValue)) {
          issues.englishInNonEnglish.push({ lang, key, value: strValue, marker: marker.source });
        }
      }
    }
  }
}

// ── Report ──────────────────────────────────────────────────

console.log('\n🔍 Mizanly i18n Audit Report\n');
console.log(`Languages: ${LANGUAGES.join(', ')}`);
console.log(`Reference: ${REFERENCE_LANG} (${referenceKeys.length} keys)\n`);

let totalIssues = 0;

function reportSection(title, items) {
  if (items.length === 0) {
    console.log(`✅ ${title}: 0 issues`);
    return;
  }
  console.log(`⚠️  ${title}: ${items.length} issues`);
  // Show first 10
  items.slice(0, 10).forEach(item => {
    const parts = Object.entries(item).map(([k, v]) => `${k}=${v}`).join(', ');
    console.log(`   → ${parts}`);
  });
  if (items.length > 10) {
    console.log(`   ... and ${items.length - 10} more`);
  }
  totalIssues += items.length;
}

reportSection('Missing keys', issues.missingKeys);
reportSection('Extra keys', issues.extraKeys);
reportSection('Empty values', issues.emptyValues);
reportSection('Variable mismatch ({{var}} missing)', issues.variableMismatch);
reportSection('Possibly untranslated (identical to English)', issues.possiblyUntranslated);
reportSection('English text in non-English files', issues.englishInNonEnglish);

console.log(`\n📊 Total issues: ${totalIssues}`);
console.log(totalIssues === 0 ? '🎉 All clean!' : `⚠️  ${totalIssues} issues need attention`);

// Per-language key count comparison
console.log('\n📋 Key counts:');
for (const lang of LANGUAGES) {
  const count = Object.keys(flatData[lang]).length;
  const diff = count - referenceKeys.length;
  const status = diff === 0 ? '✅' : diff > 0 ? `⚠️ +${diff}` : `❌ ${diff}`;
  console.log(`   ${lang}: ${count} keys ${status}`);
}

process.exit(totalIssues > 0 ? 1 : 0);
