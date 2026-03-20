/**
 * Static metadata for all 114 surahs of the Quran.
 * This data never changes — no API call needed.
 */
export interface SurahMetadata {
  number: number;
  nameArabic: string;
  nameEnglish: string;
  nameTransliteration: string;
  ayahCount: number;
  revelationType: 'Meccan' | 'Medinan';
  juzStart: number;
}

export const SURAH_METADATA: SurahMetadata[] = [
  { number: 1, nameArabic: 'الفاتحة', nameEnglish: 'The Opening', nameTransliteration: 'Al-Fatihah', ayahCount: 7, revelationType: 'Meccan', juzStart: 1 },
  { number: 2, nameArabic: 'البقرة', nameEnglish: 'The Cow', nameTransliteration: 'Al-Baqarah', ayahCount: 286, revelationType: 'Medinan', juzStart: 1 },
  { number: 3, nameArabic: 'آل عمران', nameEnglish: 'Family of Imran', nameTransliteration: 'Ali \'Imran', ayahCount: 200, revelationType: 'Medinan', juzStart: 3 },
  { number: 4, nameArabic: 'النساء', nameEnglish: 'The Women', nameTransliteration: 'An-Nisa', ayahCount: 176, revelationType: 'Medinan', juzStart: 4 },
  { number: 5, nameArabic: 'المائدة', nameEnglish: 'The Table Spread', nameTransliteration: 'Al-Ma\'idah', ayahCount: 120, revelationType: 'Medinan', juzStart: 6 },
  { number: 6, nameArabic: 'الأنعام', nameEnglish: 'The Cattle', nameTransliteration: 'Al-An\'am', ayahCount: 165, revelationType: 'Meccan', juzStart: 7 },
  { number: 7, nameArabic: 'الأعراف', nameEnglish: 'The Heights', nameTransliteration: 'Al-A\'raf', ayahCount: 206, revelationType: 'Meccan', juzStart: 8 },
  { number: 8, nameArabic: 'الأنفال', nameEnglish: 'The Spoils of War', nameTransliteration: 'Al-Anfal', ayahCount: 75, revelationType: 'Medinan', juzStart: 9 },
  { number: 9, nameArabic: 'التوبة', nameEnglish: 'The Repentance', nameTransliteration: 'At-Tawbah', ayahCount: 129, revelationType: 'Medinan', juzStart: 10 },
  { number: 10, nameArabic: 'يونس', nameEnglish: 'Jonah', nameTransliteration: 'Yunus', ayahCount: 109, revelationType: 'Meccan', juzStart: 11 },
  { number: 11, nameArabic: 'هود', nameEnglish: 'Hud', nameTransliteration: 'Hud', ayahCount: 123, revelationType: 'Meccan', juzStart: 11 },
  { number: 12, nameArabic: 'يوسف', nameEnglish: 'Joseph', nameTransliteration: 'Yusuf', ayahCount: 111, revelationType: 'Meccan', juzStart: 12 },
  { number: 13, nameArabic: 'الرعد', nameEnglish: 'The Thunder', nameTransliteration: 'Ar-Ra\'d', ayahCount: 43, revelationType: 'Medinan', juzStart: 13 },
  { number: 14, nameArabic: 'إبراهيم', nameEnglish: 'Abraham', nameTransliteration: 'Ibrahim', ayahCount: 52, revelationType: 'Meccan', juzStart: 13 },
  { number: 15, nameArabic: 'الحجر', nameEnglish: 'The Rocky Tract', nameTransliteration: 'Al-Hijr', ayahCount: 99, revelationType: 'Meccan', juzStart: 14 },
  { number: 16, nameArabic: 'النحل', nameEnglish: 'The Bee', nameTransliteration: 'An-Nahl', ayahCount: 128, revelationType: 'Meccan', juzStart: 14 },
  { number: 17, nameArabic: 'الإسراء', nameEnglish: 'The Night Journey', nameTransliteration: 'Al-Isra', ayahCount: 111, revelationType: 'Meccan', juzStart: 15 },
  { number: 18, nameArabic: 'الكهف', nameEnglish: 'The Cave', nameTransliteration: 'Al-Kahf', ayahCount: 110, revelationType: 'Meccan', juzStart: 15 },
  { number: 19, nameArabic: 'مريم', nameEnglish: 'Mary', nameTransliteration: 'Maryam', ayahCount: 98, revelationType: 'Meccan', juzStart: 16 },
  { number: 20, nameArabic: 'طه', nameEnglish: 'Ta-Ha', nameTransliteration: 'Taha', ayahCount: 135, revelationType: 'Meccan', juzStart: 16 },
  { number: 21, nameArabic: 'الأنبياء', nameEnglish: 'The Prophets', nameTransliteration: 'Al-Anbiya', ayahCount: 112, revelationType: 'Meccan', juzStart: 17 },
  { number: 22, nameArabic: 'الحج', nameEnglish: 'The Pilgrimage', nameTransliteration: 'Al-Hajj', ayahCount: 78, revelationType: 'Medinan', juzStart: 17 },
  { number: 23, nameArabic: 'المؤمنون', nameEnglish: 'The Believers', nameTransliteration: 'Al-Mu\'minun', ayahCount: 118, revelationType: 'Meccan', juzStart: 18 },
  { number: 24, nameArabic: 'النور', nameEnglish: 'The Light', nameTransliteration: 'An-Nur', ayahCount: 64, revelationType: 'Medinan', juzStart: 18 },
  { number: 25, nameArabic: 'الفرقان', nameEnglish: 'The Criterion', nameTransliteration: 'Al-Furqan', ayahCount: 77, revelationType: 'Meccan', juzStart: 18 },
  { number: 26, nameArabic: 'الشعراء', nameEnglish: 'The Poets', nameTransliteration: 'Ash-Shu\'ara', ayahCount: 227, revelationType: 'Meccan', juzStart: 19 },
  { number: 27, nameArabic: 'النمل', nameEnglish: 'The Ant', nameTransliteration: 'An-Naml', ayahCount: 93, revelationType: 'Meccan', juzStart: 19 },
  { number: 28, nameArabic: 'القصص', nameEnglish: 'The Stories', nameTransliteration: 'Al-Qasas', ayahCount: 88, revelationType: 'Meccan', juzStart: 20 },
  { number: 29, nameArabic: 'العنكبوت', nameEnglish: 'The Spider', nameTransliteration: 'Al-\'Ankabut', ayahCount: 69, revelationType: 'Meccan', juzStart: 20 },
  { number: 30, nameArabic: 'الروم', nameEnglish: 'The Romans', nameTransliteration: 'Ar-Rum', ayahCount: 60, revelationType: 'Meccan', juzStart: 21 },
  { number: 31, nameArabic: 'لقمان', nameEnglish: 'Luqman', nameTransliteration: 'Luqman', ayahCount: 34, revelationType: 'Meccan', juzStart: 21 },
  { number: 32, nameArabic: 'السجدة', nameEnglish: 'The Prostration', nameTransliteration: 'As-Sajdah', ayahCount: 30, revelationType: 'Meccan', juzStart: 21 },
  { number: 33, nameArabic: 'الأحزاب', nameEnglish: 'The Combined Forces', nameTransliteration: 'Al-Ahzab', ayahCount: 73, revelationType: 'Medinan', juzStart: 21 },
  { number: 34, nameArabic: 'سبأ', nameEnglish: 'Sheba', nameTransliteration: 'Saba', ayahCount: 54, revelationType: 'Meccan', juzStart: 22 },
  { number: 35, nameArabic: 'فاطر', nameEnglish: 'Originator', nameTransliteration: 'Fatir', ayahCount: 45, revelationType: 'Meccan', juzStart: 22 },
  { number: 36, nameArabic: 'يس', nameEnglish: 'Ya-Sin', nameTransliteration: 'Ya-Sin', ayahCount: 83, revelationType: 'Meccan', juzStart: 22 },
  { number: 37, nameArabic: 'الصافات', nameEnglish: 'Those Who Set The Ranks', nameTransliteration: 'As-Saffat', ayahCount: 182, revelationType: 'Meccan', juzStart: 23 },
  { number: 38, nameArabic: 'ص', nameEnglish: 'The Letter Sad', nameTransliteration: 'Sad', ayahCount: 88, revelationType: 'Meccan', juzStart: 23 },
  { number: 39, nameArabic: 'الزمر', nameEnglish: 'The Troops', nameTransliteration: 'Az-Zumar', ayahCount: 75, revelationType: 'Meccan', juzStart: 23 },
  { number: 40, nameArabic: 'غافر', nameEnglish: 'The Forgiver', nameTransliteration: 'Ghafir', ayahCount: 85, revelationType: 'Meccan', juzStart: 24 },
  { number: 41, nameArabic: 'فصلت', nameEnglish: 'Explained in Detail', nameTransliteration: 'Fussilat', ayahCount: 54, revelationType: 'Meccan', juzStart: 24 },
  { number: 42, nameArabic: 'الشورى', nameEnglish: 'The Consultation', nameTransliteration: 'Ash-Shuraa', ayahCount: 53, revelationType: 'Meccan', juzStart: 25 },
  { number: 43, nameArabic: 'الزخرف', nameEnglish: 'The Ornaments of Gold', nameTransliteration: 'Az-Zukhruf', ayahCount: 89, revelationType: 'Meccan', juzStart: 25 },
  { number: 44, nameArabic: 'الدخان', nameEnglish: 'The Smoke', nameTransliteration: 'Ad-Dukhan', ayahCount: 59, revelationType: 'Meccan', juzStart: 25 },
  { number: 45, nameArabic: 'الجاثية', nameEnglish: 'The Crouching', nameTransliteration: 'Al-Jathiyah', ayahCount: 37, revelationType: 'Meccan', juzStart: 25 },
  { number: 46, nameArabic: 'الأحقاف', nameEnglish: 'The Wind-Curved Sandhills', nameTransliteration: 'Al-Ahqaf', ayahCount: 35, revelationType: 'Meccan', juzStart: 26 },
  { number: 47, nameArabic: 'محمد', nameEnglish: 'Muhammad', nameTransliteration: 'Muhammad', ayahCount: 38, revelationType: 'Medinan', juzStart: 26 },
  { number: 48, nameArabic: 'الفتح', nameEnglish: 'The Victory', nameTransliteration: 'Al-Fath', ayahCount: 29, revelationType: 'Medinan', juzStart: 26 },
  { number: 49, nameArabic: 'الحجرات', nameEnglish: 'The Rooms', nameTransliteration: 'Al-Hujurat', ayahCount: 18, revelationType: 'Medinan', juzStart: 26 },
  { number: 50, nameArabic: 'ق', nameEnglish: 'The Letter Qaf', nameTransliteration: 'Qaf', ayahCount: 45, revelationType: 'Meccan', juzStart: 26 },
  { number: 51, nameArabic: 'الذاريات', nameEnglish: 'The Winnowing Winds', nameTransliteration: 'Adh-Dhariyat', ayahCount: 60, revelationType: 'Meccan', juzStart: 26 },
  { number: 52, nameArabic: 'الطور', nameEnglish: 'The Mount', nameTransliteration: 'At-Tur', ayahCount: 49, revelationType: 'Meccan', juzStart: 27 },
  { number: 53, nameArabic: 'النجم', nameEnglish: 'The Star', nameTransliteration: 'An-Najm', ayahCount: 62, revelationType: 'Meccan', juzStart: 27 },
  { number: 54, nameArabic: 'القمر', nameEnglish: 'The Moon', nameTransliteration: 'Al-Qamar', ayahCount: 55, revelationType: 'Meccan', juzStart: 27 },
  { number: 55, nameArabic: 'الرحمن', nameEnglish: 'The Beneficent', nameTransliteration: 'Ar-Rahman', ayahCount: 78, revelationType: 'Medinan', juzStart: 27 },
  { number: 56, nameArabic: 'الواقعة', nameEnglish: 'The Inevitable', nameTransliteration: 'Al-Waqi\'ah', ayahCount: 96, revelationType: 'Meccan', juzStart: 27 },
  { number: 57, nameArabic: 'الحديد', nameEnglish: 'The Iron', nameTransliteration: 'Al-Hadid', ayahCount: 29, revelationType: 'Medinan', juzStart: 27 },
  { number: 58, nameArabic: 'المجادلة', nameEnglish: 'The Pleading Woman', nameTransliteration: 'Al-Mujadila', ayahCount: 22, revelationType: 'Medinan', juzStart: 28 },
  { number: 59, nameArabic: 'الحشر', nameEnglish: 'The Exile', nameTransliteration: 'Al-Hashr', ayahCount: 24, revelationType: 'Medinan', juzStart: 28 },
  { number: 60, nameArabic: 'الممتحنة', nameEnglish: 'She That Is To Be Examined', nameTransliteration: 'Al-Mumtahanah', ayahCount: 13, revelationType: 'Medinan', juzStart: 28 },
  { number: 61, nameArabic: 'الصف', nameEnglish: 'The Ranks', nameTransliteration: 'As-Saf', ayahCount: 14, revelationType: 'Medinan', juzStart: 28 },
  { number: 62, nameArabic: 'الجمعة', nameEnglish: 'Friday', nameTransliteration: 'Al-Jumu\'ah', ayahCount: 11, revelationType: 'Medinan', juzStart: 28 },
  { number: 63, nameArabic: 'المنافقون', nameEnglish: 'The Hypocrites', nameTransliteration: 'Al-Munafiqun', ayahCount: 11, revelationType: 'Medinan', juzStart: 28 },
  { number: 64, nameArabic: 'التغابن', nameEnglish: 'The Mutual Disillusion', nameTransliteration: 'At-Taghabun', ayahCount: 18, revelationType: 'Medinan', juzStart: 28 },
  { number: 65, nameArabic: 'الطلاق', nameEnglish: 'The Divorce', nameTransliteration: 'At-Talaq', ayahCount: 12, revelationType: 'Medinan', juzStart: 28 },
  { number: 66, nameArabic: 'التحريم', nameEnglish: 'The Prohibition', nameTransliteration: 'At-Tahrim', ayahCount: 12, revelationType: 'Medinan', juzStart: 28 },
  { number: 67, nameArabic: 'الملك', nameEnglish: 'The Sovereignty', nameTransliteration: 'Al-Mulk', ayahCount: 30, revelationType: 'Meccan', juzStart: 29 },
  { number: 68, nameArabic: 'القلم', nameEnglish: 'The Pen', nameTransliteration: 'Al-Qalam', ayahCount: 52, revelationType: 'Meccan', juzStart: 29 },
  { number: 69, nameArabic: 'الحاقة', nameEnglish: 'The Reality', nameTransliteration: 'Al-Haqqah', ayahCount: 52, revelationType: 'Meccan', juzStart: 29 },
  { number: 70, nameArabic: 'المعارج', nameEnglish: 'The Ascending Stairways', nameTransliteration: 'Al-Ma\'arij', ayahCount: 44, revelationType: 'Meccan', juzStart: 29 },
  { number: 71, nameArabic: 'نوح', nameEnglish: 'Noah', nameTransliteration: 'Nuh', ayahCount: 28, revelationType: 'Meccan', juzStart: 29 },
  { number: 72, nameArabic: 'الجن', nameEnglish: 'The Jinn', nameTransliteration: 'Al-Jinn', ayahCount: 28, revelationType: 'Meccan', juzStart: 29 },
  { number: 73, nameArabic: 'المزمل', nameEnglish: 'The Enshrouded One', nameTransliteration: 'Al-Muzzammil', ayahCount: 20, revelationType: 'Meccan', juzStart: 29 },
  { number: 74, nameArabic: 'المدثر', nameEnglish: 'The Cloaked One', nameTransliteration: 'Al-Muddaththir', ayahCount: 56, revelationType: 'Meccan', juzStart: 29 },
  { number: 75, nameArabic: 'القيامة', nameEnglish: 'The Resurrection', nameTransliteration: 'Al-Qiyamah', ayahCount: 40, revelationType: 'Meccan', juzStart: 29 },
  { number: 76, nameArabic: 'الإنسان', nameEnglish: 'The Human', nameTransliteration: 'Al-Insan', ayahCount: 31, revelationType: 'Medinan', juzStart: 29 },
  { number: 77, nameArabic: 'المرسلات', nameEnglish: 'The Emissaries', nameTransliteration: 'Al-Mursalat', ayahCount: 50, revelationType: 'Meccan', juzStart: 29 },
  { number: 78, nameArabic: 'النبأ', nameEnglish: 'The Tidings', nameTransliteration: 'An-Naba', ayahCount: 40, revelationType: 'Meccan', juzStart: 30 },
  { number: 79, nameArabic: 'النازعات', nameEnglish: 'Those Who Drag Forth', nameTransliteration: 'An-Nazi\'at', ayahCount: 46, revelationType: 'Meccan', juzStart: 30 },
  { number: 80, nameArabic: 'عبس', nameEnglish: 'He Frowned', nameTransliteration: '\'Abasa', ayahCount: 42, revelationType: 'Meccan', juzStart: 30 },
  { number: 81, nameArabic: 'التكوير', nameEnglish: 'The Overthrowing', nameTransliteration: 'At-Takwir', ayahCount: 29, revelationType: 'Meccan', juzStart: 30 },
  { number: 82, nameArabic: 'الإنفطار', nameEnglish: 'The Cleaving', nameTransliteration: 'Al-Infitar', ayahCount: 19, revelationType: 'Meccan', juzStart: 30 },
  { number: 83, nameArabic: 'المطففين', nameEnglish: 'The Defrauding', nameTransliteration: 'Al-Mutaffifin', ayahCount: 36, revelationType: 'Meccan', juzStart: 30 },
  { number: 84, nameArabic: 'الإنشقاق', nameEnglish: 'The Sundering', nameTransliteration: 'Al-Inshiqaq', ayahCount: 25, revelationType: 'Meccan', juzStart: 30 },
  { number: 85, nameArabic: 'البروج', nameEnglish: 'The Mansions of the Stars', nameTransliteration: 'Al-Buruj', ayahCount: 22, revelationType: 'Meccan', juzStart: 30 },
  { number: 86, nameArabic: 'الطارق', nameEnglish: 'The Morning Star', nameTransliteration: 'At-Tariq', ayahCount: 17, revelationType: 'Meccan', juzStart: 30 },
  { number: 87, nameArabic: 'الأعلى', nameEnglish: 'The Most High', nameTransliteration: 'Al-A\'la', ayahCount: 19, revelationType: 'Meccan', juzStart: 30 },
  { number: 88, nameArabic: 'الغاشية', nameEnglish: 'The Overwhelming', nameTransliteration: 'Al-Ghashiyah', ayahCount: 26, revelationType: 'Meccan', juzStart: 30 },
  { number: 89, nameArabic: 'الفجر', nameEnglish: 'The Dawn', nameTransliteration: 'Al-Fajr', ayahCount: 30, revelationType: 'Meccan', juzStart: 30 },
  { number: 90, nameArabic: 'البلد', nameEnglish: 'The City', nameTransliteration: 'Al-Balad', ayahCount: 20, revelationType: 'Meccan', juzStart: 30 },
  { number: 91, nameArabic: 'الشمس', nameEnglish: 'The Sun', nameTransliteration: 'Ash-Shams', ayahCount: 15, revelationType: 'Meccan', juzStart: 30 },
  { number: 92, nameArabic: 'الليل', nameEnglish: 'The Night', nameTransliteration: 'Al-Layl', ayahCount: 21, revelationType: 'Meccan', juzStart: 30 },
  { number: 93, nameArabic: 'الضحى', nameEnglish: 'The Morning Hours', nameTransliteration: 'Ad-Duhaa', ayahCount: 11, revelationType: 'Meccan', juzStart: 30 },
  { number: 94, nameArabic: 'الشرح', nameEnglish: 'The Relief', nameTransliteration: 'Ash-Sharh', ayahCount: 8, revelationType: 'Meccan', juzStart: 30 },
  { number: 95, nameArabic: 'التين', nameEnglish: 'The Fig', nameTransliteration: 'At-Tin', ayahCount: 8, revelationType: 'Meccan', juzStart: 30 },
  { number: 96, nameArabic: 'العلق', nameEnglish: 'The Clot', nameTransliteration: 'Al-\'Alaq', ayahCount: 19, revelationType: 'Meccan', juzStart: 30 },
  { number: 97, nameArabic: 'القدر', nameEnglish: 'The Power', nameTransliteration: 'Al-Qadr', ayahCount: 5, revelationType: 'Meccan', juzStart: 30 },
  { number: 98, nameArabic: 'البينة', nameEnglish: 'The Clear Proof', nameTransliteration: 'Al-Bayyinah', ayahCount: 8, revelationType: 'Medinan', juzStart: 30 },
  { number: 99, nameArabic: 'الزلزلة', nameEnglish: 'The Earthquake', nameTransliteration: 'Az-Zalzalah', ayahCount: 8, revelationType: 'Medinan', juzStart: 30 },
  { number: 100, nameArabic: 'العاديات', nameEnglish: 'The Courser', nameTransliteration: 'Al-\'Adiyat', ayahCount: 11, revelationType: 'Meccan', juzStart: 30 },
  { number: 101, nameArabic: 'القارعة', nameEnglish: 'The Calamity', nameTransliteration: 'Al-Qari\'ah', ayahCount: 11, revelationType: 'Meccan', juzStart: 30 },
  { number: 102, nameArabic: 'التكاثر', nameEnglish: 'The Rivalry in World Increase', nameTransliteration: 'At-Takathur', ayahCount: 8, revelationType: 'Meccan', juzStart: 30 },
  { number: 103, nameArabic: 'العصر', nameEnglish: 'The Declining Day', nameTransliteration: 'Al-\'Asr', ayahCount: 3, revelationType: 'Meccan', juzStart: 30 },
  { number: 104, nameArabic: 'الهمزة', nameEnglish: 'The Traducer', nameTransliteration: 'Al-Humazah', ayahCount: 9, revelationType: 'Meccan', juzStart: 30 },
  { number: 105, nameArabic: 'الفيل', nameEnglish: 'The Elephant', nameTransliteration: 'Al-Fil', ayahCount: 5, revelationType: 'Meccan', juzStart: 30 },
  { number: 106, nameArabic: 'قريش', nameEnglish: 'Quraysh', nameTransliteration: 'Quraysh', ayahCount: 4, revelationType: 'Meccan', juzStart: 30 },
  { number: 107, nameArabic: 'الماعون', nameEnglish: 'The Small Kindnesses', nameTransliteration: 'Al-Ma\'un', ayahCount: 7, revelationType: 'Meccan', juzStart: 30 },
  { number: 108, nameArabic: 'الكوثر', nameEnglish: 'The Abundance', nameTransliteration: 'Al-Kawthar', ayahCount: 3, revelationType: 'Meccan', juzStart: 30 },
  { number: 109, nameArabic: 'الكافرون', nameEnglish: 'The Disbelievers', nameTransliteration: 'Al-Kafirun', ayahCount: 6, revelationType: 'Meccan', juzStart: 30 },
  { number: 110, nameArabic: 'النصر', nameEnglish: 'The Divine Support', nameTransliteration: 'An-Nasr', ayahCount: 3, revelationType: 'Medinan', juzStart: 30 },
  { number: 111, nameArabic: 'المسد', nameEnglish: 'The Palm Fibre', nameTransliteration: 'Al-Masad', ayahCount: 5, revelationType: 'Meccan', juzStart: 30 },
  { number: 112, nameArabic: 'الإخلاص', nameEnglish: 'The Sincerity', nameTransliteration: 'Al-Ikhlas', ayahCount: 4, revelationType: 'Meccan', juzStart: 30 },
  { number: 113, nameArabic: 'الفلق', nameEnglish: 'The Daybreak', nameTransliteration: 'Al-Falaq', ayahCount: 5, revelationType: 'Meccan', juzStart: 30 },
  { number: 114, nameArabic: 'الناس', nameEnglish: 'Mankind', nameTransliteration: 'An-Nas', ayahCount: 6, revelationType: 'Meccan', juzStart: 30 },
];

/** Total ayahs in the Quran */
export const TOTAL_AYAHS = 6236;

/**
 * Get cumulative ayah offset for a surah (0-indexed).
 * Surah 1 starts at ayah 1, surah 2 starts at ayah 8, etc.
 */
export function getSurahAyahOffset(surahNumber: number): number {
  let offset = 0;
  for (let i = 0; i < surahNumber - 1 && i < SURAH_METADATA.length; i++) {
    offset += SURAH_METADATA[i].ayahCount;
  }
  return offset;
}

/**
 * Get which juz a surah+ayah falls in (approximate — juz boundaries don't align with surah starts).
 * This is an approximation based on the surah's juzStart.
 */
export function getJuzForSurah(surahNumber: number): number {
  const surah = SURAH_METADATA.find(s => s.number === surahNumber);
  return surah?.juzStart ?? 1;
}
