import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';

const { width } = Dimensions.get('window');

interface Hadith {
  id: string;
  arabic: string;
  english: string;
  source: string;
  narrator: string;
  date: string;
  isBookmarked: boolean;
}

const MOCK_HADITHS: Hadith[] = [
  {
    id: '1',
    arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى',
    english: 'Actions are judged by intentions, and each person will have what they intended.',
    source: 'Sahih al-Bukhari, Hadith #1',
    narrator: 'Narrated by Umar ibn al-Khattab (RA)',
    date: 'Today',
    isBookmarked: false,
  },
  {
    id: '2',
    arabic: 'بُنِيَ الإِسْلَامُ عَلَى خَمْسٍ: شَهَادَةِ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ',
    english: 'Islam is built upon five pillars: testifying that there is no deity worthy of worship except Allah and that Muhammad is His Messenger.',
    source: 'Sahih al-Bukhari, Hadith #8',
    narrator: 'Narrated by Ibn Umar (RA)',
    date: 'Yesterday',
    isBookmarked: true,
  },
  {
    id: '3',
    arabic: 'مَنْ يُرِدِ اللَّهُ بِهِ خَيْرًا يُفَقِّهْهُ فِي الدِّينِ',
    english: 'When Allah wishes good for someone, He bestows upon him the understanding of the religion.',
    source: 'Sahih al-Bukhari, Hadith #71',
    narrator: 'Narrated by Muawiya (RA)',
    date: '2 days ago',
    isBookmarked: false,
  },
  {
    id: '4',
    arabic: 'الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ',
    english: 'A Muslim is one from whose tongue and hand the Muslims are safe.',
    source: 'Sahih al-Bukhari, Hadith #10',
    narrator: 'Narrated by Abdullah ibn Amr (RA)',
    date: '3 days ago',
    isBookmarked: false,
  },
  {
    id: '5',
    arabic: 'مَا نَقَصَتْ صَدَقَةٌ مِنْ مَالٍ، وَمَا زَادَ اللَّهُ عَبْدًا بِعَفْوٍ إِلاَّ عِزًّا',
    english: 'Charity does not decrease wealth. Allah increases a slave in honor when he forgives.',
    source: 'Sahih Muslim, Hadith #2588',
    narrator: 'Narrated by Abu Hurairah (RA)',
    date: '4 days ago',
    isBookmarked: true,
  },
  {
    id: '6',
    arabic: 'لاَ يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ',
    english: 'None of you truly believes until he loves for his brother what he loves for himself.',
    source: 'Sahih al-Bukhari, Hadith #13',
    narrator: 'Narrated by Anas ibn Malik (RA)',
    date: '5 days ago',
    isBookmarked: false,
  },
  {
    id: '7',
    arabic: 'مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ',
    english: 'Whoever believes in Allah and the Last Day should say what is good or remain silent.',
    source: 'Sahih al-Bukhari, Hadith #6018',
    narrator: 'Narrated by Abu Hurairah (RA)',
    date: '6 days ago',
    isBookmarked: false,
  },
];

function ActionButton({
  icon,
  label,
  onPress,
  isActive,
  activeColor = colors.emerald,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  activeColor?: string;
}) {
  const haptic = useHaptic();

  return (
    <TouchableOpacity
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={styles.actionButton}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={isActive ? [activeColor, colors.goldLight] : ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
        style={styles.actionButtonGradient}
      >
        <Icon
          name={icon as any}
          size="sm"
          color={isActive ? colors.text.primary : colors.text.secondary}
        />
      </LinearGradient>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function PreviousHadithCard({
  hadith,
  index,
  onPress,
}: {
  hadith: Hadith;
  index: number;
  onPress: () => void;
}) {
  return (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <LinearGradient
          colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
          style={styles.previousCard}
        >
          <View style={styles.previousCardContent}>
            <Text style={styles.previousEnglish} numberOfLines={2}>
              {hadith.english}
            </Text>
            <View style={styles.previousMeta}>
              <Text style={styles.previousSource}>{hadith.source}</Text>
              <Text style={styles.previousDate}>{hadith.date}</Text>
            </View>
          </View>
          {hadith.isBookmarked && (
            <View style={styles.bookmarkIndicator}>
              <Icon name="bookmark-filled" size="xs" color={colors.gold} />
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HadithScreen() {
  const router = useRouter();
  const haptic = useHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hadiths, setHadiths] = useState<Hadith[]>(MOCK_HADITHS);
  const [currentHadith, setCurrentHadith] = useState<Hadith>(MOCK_HADITHS[0]);
  const scaleAnim = useSharedValue(1);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

  const handleBookmark = useCallback(() => {
    haptic.medium();
    setCurrentHadith(prev => ({ ...prev, isBookmarked: !prev.isBookmarked }));
    scaleAnim.value = withSpring(1.1, { damping: 10, stiffness: 400 }, () => {
      scaleAnim.value = withSpring(1);
    });
  }, [haptic, scaleAnim]);

  const handleShare = useCallback(() => {
    haptic.light();
    // Mock share functionality
  }, [haptic]);

  const handleCopy = useCallback(() => {
    haptic.light();
    // Mock copy functionality
  }, [haptic]);

  const selectHadith = useCallback((hadith: Hadith) => {
    setCurrentHadith(hadith);
  }, []);

  const animatedBookmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <GlassHeader
          title="Daily Hadith"
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
        />
        <View style={styles.loadingContainer}>
          <Skeleton.Rect width={width - 32} height={200} borderRadius={radius.lg} />
          <Skeleton.Rect width={200} height={20} borderRadius={radius.sm} style={{ marginTop: spacing.lg }} />
          <Skeleton.Rect width={150} height={16} borderRadius={radius.sm} style={{ marginTop: spacing.md }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <GlassHeader
        title="Daily Hadith"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
      />

      <FlatList
        data={hadiths.slice(1)}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <>
            {/* Hero Card - Today's Hadith */}
            <Animated.View entering={FadeInUp.duration(500)}>
              <LinearGradient
                colors={['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.3)']}
                style={[styles.heroCard, { borderLeftWidth: 3, borderLeftColor: colors.gold }]}
              >
                {/* Book Icon */}
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.iconBackground}
                >
                  <Icon name="book-open" size="sm" color={colors.emerald} />
                </LinearGradient>

                {/* Arabic Text */}
                <Text style={styles.arabicText}>{currentHadith.arabic}</Text>

                {/* English Translation */}
                <Text style={styles.englishText}>{currentHadith.english}</Text>

                {/* Source & Narrator */}
                <View style={styles.attributionContainer}>
                  <Text style={styles.sourceText}>{currentHadith.source}</Text>
                  <Text style={styles.narratorText}>{currentHadith.narrator}</Text>
                </View>

                {/* Action Row */}
                <View style={styles.actionRow}>
                  <Animated.View style={animatedBookmarkStyle}>
                    <ActionButton
                      icon={currentHadith.isBookmarked ? 'bookmark-filled' : 'bookmark'}
                      label="Save"
                      onPress={handleBookmark}
                      isActive={currentHadith.isBookmarked}
                      activeColor={colors.gold}
                    />
                  </Animated.View>
                  <ActionButton icon="share" label="Share" onPress={handleShare} />
                  <ActionButton icon="check-check" label="Copy" onPress={handleCopy} />
                </View>
              </LinearGradient>
            </Animated.View>

            {/* Section Title */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Previous Hadith</Text>
            </View>
          </>
        }
        renderItem={({ item, index }) => (
          <PreviousHadithCard
            hadith={item}
            index={index}
            onPress={() => selectHadith(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="book-open"
            title="No previous hadith"
            subtitle="Check back tomorrow for more authentic narrations"
          />
        }
        ListFooterComponent={
          <>
            {/* Bottom Info Card */}
            <Animated.View entering={FadeInUp.delay(400).duration(500)}>
              <LinearGradient
                colors={['rgba(10,123,79,0.15)', 'rgba(28,35,51,0.2)']}
                style={styles.infoCard}
              >
                <View style={styles.infoRow}>
                  <Icon name="check-circle" size="sm" color={colors.emerald} />
                  <Text style={styles.infoText}>
                    Hadith are sourced from authentic collections verified by scholars
                  </Text>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* Bottom padding */}
            <View style={{ height: spacing.xxl }} />
          </>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  loadingContainer: {
    flex: 1,
    padding: spacing.base,
    paddingTop: 100,
  },
  scrollContent: {
    padding: spacing.base,
    paddingTop: 100,
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  iconBackground: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  arabicText: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    textAlign: 'right',
    lineHeight: 36,
    marginBottom: spacing.md,
    writingDirection: 'rtl',
  },
  englishText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  attributionContainer: {
    marginBottom: spacing.lg,
  },
  sourceText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.tertiary,
    marginBottom: spacing.xs,
  },
  narratorText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  actionLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  sectionHeader: {
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  previousCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  previousCardContent: {
    flex: 1,
  },
  previousEnglish: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  previousMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previousSource: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  previousDate: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  bookmarkIndicator: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  infoCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
    marginTop: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    flex: 1,
    lineHeight: 20,
  },
});
