import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

const { width: screenWidth } = Dimensions.get('window');

// First 10 surahs for demo
const SURAHS = [
  { number: 1, name: 'Al-Fatihah', arabicName: 'الفاتحة', verses: 7 },
  { number: 2, name: 'Al-Baqarah', arabicName: 'البقرة', verses: 286 },
  { number: 3, name: 'Aali Imran', arabicName: 'آل عمران', verses: 200 },
  { number: 4, name: 'An-Nisa', arabicName: 'النساء', verses: 176 },
  { number: 5, name: 'Al-Ma\'idah', arabicName: 'المائدة', verses: 120 },
  { number: 36, name: 'Ya-Sin', arabicName: 'يس', verses: 83 },
  { number: 55, name: 'Ar-Rahman', arabicName: 'الرحمن', verses: 78 },
  { number: 67, name: 'Al-Mulk', arabicName: 'الملك', verses: 30 },
  { number: 112, name: 'Al-Ikhlas', arabicName: 'الإخلاص', verses: 4 },
  { number: 113, name: 'Al-Falaq', arabicName: 'الفلق', verses: 5 },
  { number: 114, name: 'An-Nas', arabicName: 'الناس', verses: 6 },
];

// Mock verses
const MOCK_VERSES: Record<number, string> = {
  1: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nالْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ\nالرَّحْمَٰنِ الرَّحِيمِ\nمَالِكِ يَوْمِ الدِّينِ\nإِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ\nاهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ\nصِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ',
  112: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nقُلْ هُوَ اللَّهُ أَحَدٌ\nاللَّهُ الصَّمَدُ\nلَمْ يَلِدْ وَلَمْ يُولَدْ\nوَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ',
  113: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nقُلْ أَعُوذُ بِرَبِّ الْفَلَقِ\nمِن شَرِّ مَا خَلَقَ\nوَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ\nوَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ\nوَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ',
  114: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\nقُلْ أَعُوذُ بِرَبِّ النَّاسِ\nمَلِكِ النَّاسِ\nإِلَٰهِ النَّاسِ\nمِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ\nالَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ\nمِنَ الْجِنَّةِ وَالنَّاسِ',
};

const TRANSLATIONS: Record<number, string> = {
  1: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.\nAll praise is due to Allah, Lord of the worlds.\nThe Entirely Merciful, the Especially Merciful.\nSovereign of the Day of Recompense.\nIt is You we worship and You we ask for help.\nGuide us to the straight path.\nThe path of those upon whom You have bestowed favor, not of those who have evoked anger or of those who are astray.',
  112: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.\nSay, "He is Allah, [who is] One.\nAllah, the Eternal Refuge.\nHe neither begets nor is born.\nNor is there to Him any equivalent."',
  113: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.\nSay, "I seek refuge in the Lord of daybreak.\nFrom the evil of that which He created.\nAnd from the evil of darkness when it settles.\nAnd from the evil of the blowers in knots.\nAnd from the evil of an envier when he envies."',
  114: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.\nSay, "I seek refuge in the Lord of mankind.\nThe Sovereign of mankind.\nThe God of mankind.\nFrom the evil of the retreating whisperer.\nWho whispers [evil] into the breasts of mankind.\nFrom among the jinn and mankind."',
};

// Decorative pattern for border
function GeometricPattern() {
  return (
    <View style={styles.patternContainer}>
      {[...Array(8)].map((_, i) => (
        <View key={i} style={styles.patternRow}>
          {[...Array(4)].map((_, j) => (
            <View key={j} style={styles.patternDiamond}>
              <LinearGradient
                colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                style={styles.diamondGradient}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function QuranShareScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [currentSurah, setCurrentSurah] = useState(SURAHS[0]);
  const [currentVerse, setCurrentVerse] = useState(1);
  const [showSurahPicker, setShowSurahPicker] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);

  const verseText = MOCK_VERSES[currentSurah.number] || MOCK_VERSES[1];
  const translationText = TRANSLATIONS[currentSurah.number] || TRANSLATIONS[1];

  const handlePrevVerse = useCallback(() => {
    setCurrentVerse(v => Math.max(1, v - 1));
  }, []);

  const handleNextVerse = useCallback(() => {
    setCurrentVerse(v => Math.min(currentSurah.verses, v + 1));
  }, [currentSurah.verses]);

  const handleShareAsPost = useCallback(() => {
    setShowShareOptions(false);
    router.push('/(screens)/create-post');
  }, [router]);

  const handleShareAsStory = useCallback(() => {
    setShowShareOptions(false);
    router.push('/(screens)/create-story');
  }, [router]);

  const handleCopyText = useCallback(() => {
    // Copy to clipboard
    setShowShareOptions(false);
  }, []);

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('screens.quranShare.title')}
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        rightAction={{ icon: 'share', onPress: () => setShowShareOptions(true) }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Surah Selector */}
        <Animated.View entering={FadeInUp.duration(500)}>
          <TouchableOpacity
            style={styles.surahSelector}
            onPress={() => setShowSurahPicker(true)}
          >
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.surahSelectorGradient}
            >
              <LinearGradient
                colors={['rgba(200,150,62,0.3)', 'rgba(200,150,62,0.1)']}
                style={styles.surahIconBg}
              >
                <Icon name="book-open" size="sm" color={colors.gold} />
              </LinearGradient>
              <View style={styles.surahInfo}>
                <Text style={styles.surahNameArabic}>{currentSurah.arabicName}</Text>
                <Text style={styles.surahName}>{currentSurah.name}</Text>
              </View>
              <View style={styles.surahMeta}>
                <Text style={styles.surahNumber}>{t('screens.quranShare.surahNumber', { number: currentSurah.number })}</Text>
                <Text style={styles.verseCount}>{t('screens.quranShare.versesCount', { count: currentSurah.verses })}</Text>
              </View>
              <Icon name="chevron-down" size="sm" color={colors.text.tertiary} />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Verse Navigation */}
        <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.verseNav}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={handlePrevVerse}
            disabled={currentVerse === 1}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
              style={[styles.navButtonGradient, currentVerse === 1 && styles.navButtonDisabled]}
            >
              <Icon name="chevron-left" size="sm" color={currentVerse === 1 ? colors.text.tertiary : colors.emerald} />
            </LinearGradient>
          </TouchableOpacity>

          <LinearGradient
            colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
            style={styles.verseIndicator}
          >
            <Text style={styles.verseNumber}>{t('screens.quranShare.verseNumber', { number: currentVerse })}</Text>
          </LinearGradient>

          <TouchableOpacity
            style={styles.navButton}
            onPress={handleNextVerse}
            disabled={currentVerse === currentSurah.verses}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
              style={[styles.navButtonGradient, currentVerse === currentSurah.verses && styles.navButtonDisabled]}
            >
              <Icon name="chevron-right" size="sm" color={currentVerse === currentSurah.verses ? colors.text.tertiary : colors.emerald} />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Verse Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(500)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.5)', 'rgba(28,35,51,0.3)']}
            style={styles.verseCard}
          >
            {/* Decorative Border */}
            <GeometricPattern />

            {/* Inner Card */}
            <LinearGradient
              colors={['rgba(22,27,34,0.95)', 'rgba(13,17,23,0.98)']}
              style={styles.verseCardInner}
            >
              {/* Bismillah */}
              <Text style={styles.bismillah}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</Text>

              {/* Decorative line */}
              <LinearGradient
                colors={['transparent', colors.gold, 'transparent']}
                style={styles.decorativeLine}
              />

              {/* Arabic Text */}
              <Text style={styles.verseArabic}>{verseText}</Text>

              {/* Decorative separator */}
              <View style={styles.verseSeparator}>
                <View style={styles.separatorDot} />
                <LinearGradient
                  colors={['transparent', colors.emerald, 'transparent']}
                  style={styles.separatorLine}
                />
                <View style={styles.separatorDot} />
              </View>

              {/* Translation */}
              <Text style={styles.verseTranslation}>{translationText}</Text>

              {/* Reference */}
              <View style={styles.verseReference}>
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.referenceBadge}
                >
                  <Text style={styles.referenceText}>
                    {currentSurah.name} {currentVerse}
                  </Text>
                </LinearGradient>
              </View>
            </LinearGradient>
          </LinearGradient>
        </Animated.View>

        {/* Share Options */}
        <Animated.View entering={FadeInUp.delay(300).duration(500)} style={styles.shareOptions}>
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => setShowShareOptions(true)}
          >
            <LinearGradient
              colors={[colors.emerald, colors.gold]}
              style={styles.shareButtonGradient}
            >
              <Icon name="share" size="sm" color="#fff" />
              <Text style={styles.shareButtonText}>{t('screens.quranShare.shareThisVerse')}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.copyButton}
            onPress={handleCopyText}
          >
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.copyButtonGradient}
            >
              <Icon name="link" size="sm" color={colors.text.secondary} />
              <Text style={styles.copyButtonText}>{t('screens.quranShare.copyText')}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      {/* Surah Picker Bottom Sheet */}
      <BottomSheet visible={showSurahPicker} onClose={() => setShowSurahPicker(false)}>
        <View style={styles.surahSearchBar}>
          <Icon name="search" size="sm" color={colors.text.tertiary} />
          <Text style={styles.surahSearchPlaceholder}>{t('screens.quranShare.searchSurahs')}</Text>
        </View>
        {SURAHS.map((surah) => (
          <BottomSheetItem
            key={surah.number}
            label={`${surah.number}. ${surah.name}`}
            onPress={() => {
              setCurrentSurah(surah);
              setCurrentVerse(1);
              setShowSurahPicker(false);
            }}
            icon={currentSurah.number === surah.number ? (
              <Icon name="check" size="sm" color={colors.emerald} />
            ) : (
              <Text style={styles.surahArabicList}>{surah.arabicName}</Text>
            )}
          />
        ))}
      </BottomSheet>

      {/* Share Options Bottom Sheet */}
      <BottomSheet visible={showShareOptions} onClose={() => setShowShareOptions(false)}>
        <Text style={styles.shareSheetTitle}>{t('screens.quranShare.shareQuranVerse')}</Text>
        <BottomSheetItem
          label={t('screens.quranShare.shareAsPost')}
          icon={<Icon name="image" size="sm" color={colors.emerald} />}
          onPress={handleShareAsPost}
        />
        <BottomSheetItem
          label={t('screens.quranShare.shareAsStory')}
          icon={<Icon name="play" size="sm" color={colors.gold} />}
          onPress={handleShareAsStory}
        />
        <BottomSheetItem
          label={t('screens.quranShare.copyText')}
          icon={<Icon name="link" size="sm" color={colors.text.secondary} />}
          onPress={handleCopyText}
        />
        <BottomSheetItem
          label={t('screens.quranShare.shareImage')}
          icon={<Icon name="share" size="sm" color={colors.emerald} />}
          onPress={() => setShowShareOptions(false)}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },

  // Surah Selector
  surahSelector: {
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  surahSelectorGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  surahIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  surahInfo: {
    flex: 1,
  },
  surahNameArabic: {
    color: colors.gold,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginBottom: 2,
  },
  surahName: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  surahMeta: {
    alignItems: 'flex-end',
    marginRight: spacing.sm,
  },
  surahNumber: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  verseCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },

  // Verse Navigation
  verseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navButton: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  navButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  verseIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  verseNumber: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },

  // Verse Card
  verseCard: {
    borderRadius: radius.lg,
    padding: spacing.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  verseCardInner: {
    borderRadius: radius.md,
    padding: spacing.lg,
    position: 'relative',
    zIndex: 1,
  },

  // Decorative Pattern
  patternContainer: {
    ...StyleSheet.absoluteFillObject,
    padding: 4,
    opacity: 0.4,
  },
  patternRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: spacing.xs,
  },
  patternDiamond: {
    width: 16,
    height: 16,
    transform: [{ rotate: '45deg' }],
  },
  diamondGradient: {
    flex: 1,
    borderRadius: 2,
  },

  // Bismillah
  bismillah: {
    color: colors.gold,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 30,
  },
  decorativeLine: {
    height: 1,
    marginHorizontal: spacing['2xl'],
    marginBottom: spacing.md,
  },

  // Arabic Text
  verseArabic: {
    color: colors.text.primary,
    fontSize: fontSize['2xl'],
    textAlign: 'center',
    lineHeight: 48,
    marginBottom: spacing.lg,
    writingDirection: 'rtl',
  },

  // Separator
  verseSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  separatorDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  separatorLine: {
    height: 1,
    flex: 1,
    maxWidth: 80,
    marginHorizontal: spacing.sm,
  },

  // Translation
  verseTranslation: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.lg,
    fontStyle: 'italic',
  },

  // Reference
  verseReference: {
    alignItems: 'center',
  },
  referenceBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  referenceText: {
    color: colors.text.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },

  // Share Options
  shareOptions: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  shareButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  shareButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  copyButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  copyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  copyButtonText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },

  // Surah Search in Bottom Sheet
  surahSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  surahSearchPlaceholder: {
    color: colors.text.tertiary,
    fontSize: fontSize.base,
  },
  surahArabicList: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },

  // Share Sheet
  shareSheetTitle: {
    color: colors.text.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
});
