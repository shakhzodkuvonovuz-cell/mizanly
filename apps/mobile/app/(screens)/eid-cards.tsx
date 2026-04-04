import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Share, StatusBar, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { EidFrame } from '@/components/islamic/EidFrame';
import type { Occasion } from '@/components/islamic/EidFrame';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';

interface OccasionItem {
  id: Occasion;
  name: string;
  nameAr: string;
  icon: IconName;
}

const CARD_GRADIENTS: Record<string, [string, string]> = {
  'eid-fitr': ['#0A7B4F', '#065535'],
  'eid-adha': ['#C8963E', '#8B6914'],
  'ramadan': ['#1a1a2e', '#16213e'],
  'mawlid': ['#6B2FA0', '#3B0764'],
  'isra-miraj': ['#0D4F86', '#0A2647'],
  'hijri-new-year': ['#0D1117', '#161B22'],
};

const occasions: OccasionItem[] = [
  { id: 'eid-fitr', name: 'Eid al-Fitr', nameAr: 'عيد الفطر', icon: 'star' },
  { id: 'eid-adha', name: 'Eid al-Adha', nameAr: 'عيد الأضحى', icon: 'star' },
  { id: 'ramadan', name: 'Ramadan', nameAr: 'رمضان', icon: 'moon' },
  { id: 'mawlid', name: 'Mawlid al-Nabi', nameAr: 'المولد النبوي', icon: 'heart' },
  { id: 'isra-miraj', name: "Isra' & Mi'raj", nameAr: 'الإسراء والمعراج', icon: 'globe' },
  { id: 'hijri-new-year', name: 'Islamic New Year', nameAr: 'رأس السنة الهجرية', icon: 'calendar' },
];

export default function EidCardsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const [selectedOccasion, setSelectedOccasion] = useState<Occasion | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const tc = useThemeColors();
  const haptic = useContextualHaptic();

  // Responsive card width: 2 columns with gap
  const cardWidth = (screenWidth - spacing.base * 2 - spacing.md) / 2;

  // StatusBar management with cleanup
  useEffect(() => {
    StatusBar.setBarStyle('light-content');
    return () => { StatusBar.setBarStyle('default'); };
  }, []);

  const handleOccasionPress = (id: Occasion) => {
    haptic.tick();
    setSelectedOccasion(id);
    setPreviewVisible(true);
  };

  const handleShareAsStory = () => {
    if (!selectedOccasion) return;
    setPreviewVisible(false);
    router.push({
      pathname: '/(screens)/create-story',
      params: { eidFrame: selectedOccasion },
    });
  };

  const handleShareDirect = async () => {
    if (!selectedOccasion) return;
    const occ = occasions.find(o => o.id === selectedOccasion);
    if (!occ) return;
    try {
      await Share.share({
        message: `${occ.nameAr}\n${occ.name}\n\nSent with Mizanly`,
      });
    } catch {
      // User cancelled share
    }
  };

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top', 'bottom']}>
        <GlassHeader
          title={t('eidCards.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => { haptic.tick(); router.back(); } }}
        />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xl }]}
        >
          <View style={styles.grid}>
            {occasions.map((occ, index) => (
              <Animated.View key={occ.id} entering={FadeInUp.delay(Math.min(index, 15) * 80).duration(400).springify()}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${occ.name} - ${occ.nameAr}`}
                  onPress={() => handleOccasionPress(occ.id)}
                  style={({ pressed }) => [styles.cardOuter, { width: cardWidth }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                >
                  <LinearGradient
                    colors={CARD_GRADIENTS[occ.id] || ['#0A7B4F', '#065535']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.card}
                  >
                    <View style={styles.cardIconRing}>
                      <Icon name={occ.icon} size="xl" color={colors.gold} />
                    </View>
                    <Text style={styles.cardNameAr}>{occ.nameAr}</Text>
                    <Text style={styles.cardName}>{occ.name}</Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </ScrollView>

        {/* Preview BottomSheet */}
        <BottomSheet visible={previewVisible} onClose={() => setPreviewVisible(false)}>
          {selectedOccasion && (
            <View style={styles.previewContainer}>
              <EidFrame occasion={selectedOccasion}>
                <View style={styles.previewContent}>
                  <Text style={[styles.previewText, { color: tc.text.secondary }]}>{t('eidCards.preview')}</Text>
                </View>
              </EidFrame>
              <View style={styles.actionRow}>
                <GradientButton
                  label={t('eidCards.shareAsStory')}
                  onPress={handleShareAsStory}
                  fullWidth
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.share')}
                onPress={handleShareDirect}
                style={styles.shareDirectBtn}
              >
                <Icon name="share" size="sm" color={colors.gold} />
                <Text style={styles.shareDirectText}>{t('common.share')}</Text>
              </Pressable>
            </View>
          )}
        </BottomSheet>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollContent: {
    padding: spacing.base,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cardOuter: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    minHeight: 140,
    justifyContent: 'center',
  },
  cardIconRing: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: 'rgba(200, 150, 62, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardNameAr: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontFamily: fonts.arabicBold,
    marginTop: spacing.sm,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardName: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  previewContainer: {
    padding: spacing.base,
  },
  previewContent: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  shareDirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  shareDirectText: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
