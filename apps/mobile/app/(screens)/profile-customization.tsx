import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { gamificationApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { rtlFlexRow, rtlTextAlign } from '@/utils/rtl';

interface ProfileCustomization {
  accentColor: string;
  layoutStyle: string;
  bioFont: string;
  showBadges: boolean;
  showLevel: boolean;
  showStreak: boolean;
  backgroundImageUrl?: string;
  profileMusicUrl?: string;
}

const ACCENT_COLORS = [
  colors.emerald,
  '#0D9B63',
  '#58A6FF',
  '#A371F7',
  colors.gold,
  '#F85149',
  '#FF7B72',
  '#D29922',
  '#3FB950',
  '#F778BA',
  '#79C0FF',
  '#D2A8FF',
];

const LAYOUT_STYLES = [
  { key: 'default', label: 'gamification.profileCustomization.layoutDefault' },
  { key: 'grid', label: 'gamification.profileCustomization.layoutGrid' },
  { key: 'magazine', label: 'gamification.profileCustomization.layoutMagazine' },
  { key: 'minimal', label: 'gamification.profileCustomization.layoutMinimal' },
];

const BIO_FONTS = [
  { key: 'default', label: 'gamification.profileCustomization.fontDefault', fontFamily: fonts.body },
  { key: 'serif', label: 'gamification.profileCustomization.fontSerif', fontFamily: fonts.heading },
  { key: 'mono', label: 'gamification.profileCustomization.fontMono', fontFamily: fonts.mono },
  { key: 'arabic', label: 'gamification.profileCustomization.fontArabic', fontFamily: fonts.arabic },
];

const LAYOUT_ICONS: Record<string, 'layout' | 'layers' | 'book-open' | 'eye'> = {
  default: 'layout',
  grid: 'layout',
  magazine: 'book-open',
  minimal: 'eye',
};

function SectionLabel({ text, delay }: { text: string; delay: number }) {
  return (
    <Animated.View entering={FadeInUp.delay(delay).duration(400)}>
      <Text style={styles.sectionLabel}>{text}</Text>
    </Animated.View>
  );
}

function ToggleRow({
  label,
  value,
  onToggle,
  isRTL,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  isRTL: boolean;
}) {
  const haptic = useHaptic();

  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onToggle(!value);
      }}
      style={[styles.toggleRow, { flexDirection: rtlFlexRow(isRTL) }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Text style={[styles.toggleLabel, { textAlign: rtlTextAlign(isRTL) }]}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackActive]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </View>
    </Pressable>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <Skeleton.Rect width={120} height={18} borderRadius={radius.sm} />
      <View style={styles.colorGridSkeleton}>
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton.Circle key={i} size={44} />
        ))}
      </View>
      <Skeleton.Rect width={120} height={18} borderRadius={radius.sm} />
      <View style={styles.layoutGridSkeleton}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton.Rect key={i} width="47%" height={100} borderRadius={radius.lg} />
        ))}
      </View>
      <Skeleton.Rect width={120} height={18} borderRadius={radius.sm} />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton.Rect key={i} width="100%" height={48} borderRadius={radius.md} />
      ))}
    </View>
  );
}

function ProfileCustomizationScreen() {
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['profile-customization'],
    queryFn: async () => {
      const res = await gamificationApi.getProfileCustomization();
      return res.data as ProfileCustomization;
    },
  });

  const [accentColor, setAccentColor] = useState(colors.emerald);
  const [layoutStyle, setLayoutStyle] = useState('default');
  const [bioFont, setBioFont] = useState('default');
  const [showBadges, setShowBadges] = useState(true);
  const [showLevel, setShowLevel] = useState(true);
  const [showStreak, setShowStreak] = useState(true);
  const [musicUrl, setMusicUrl] = useState('');

  useEffect(() => {
    if (data) {
      setAccentColor(data.accentColor || colors.emerald);
      setLayoutStyle(data.layoutStyle || 'default');
      setBioFont(data.bioFont || 'default');
      setShowBadges(data.showBadges ?? true);
      setShowLevel(data.showLevel ?? true);
      setShowStreak(data.showStreak ?? true);
      setMusicUrl(data.profileMusicUrl || '');
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (dto: Record<string, unknown>) => gamificationApi.updateProfileCustomization(dto),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['profile-customization'] });
    },
    onError: () => {
      haptic.error();
    },
  });

  const handleSave = useCallback(() => {
    haptic.medium();
    saveMutation.mutate({
      accentColor,
      layoutStyle,
      bioFont,
      showBadges,
      showLevel,
      showStreak,
      profileMusicUrl: musicUrl || undefined,
    });
  }, [accentColor, layoutStyle, bioFont, showBadges, showLevel, showStreak, musicUrl, haptic, saveMutation]);

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <View style={styles.container}>
      <GlassHeader
        title={t('gamification.profileCustomization.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 56 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.emerald}
          />
        }
      >
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* Accent Color */}
            <SectionLabel text={t('gamification.profileCustomization.accentColor')} delay={0} />
            <Animated.View entering={FadeInUp.delay(50).duration(400)} style={styles.colorGrid}>
              {ACCENT_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => {
                    haptic.light();
                    setAccentColor(color);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: accentColor === color }}
                  accessibilityLabel={`Color ${color}`}
                >
                  <View style={[styles.colorCircleOuter, accentColor === color && { borderColor: color }]}>
                    <View style={[styles.colorCircle, { backgroundColor: color }]}>
                      {accentColor === color && (
                        <Icon name="check" size={16} color="#FFF" />
                      )}
                    </View>
                  </View>
                </Pressable>
              ))}
            </Animated.View>

            {/* Layout Style */}
            <SectionLabel text={t('gamification.profileCustomization.layout')} delay={100} />
            <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.layoutGrid}>
              {LAYOUT_STYLES.map((layout) => (
                <Pressable
                  key={layout.key}
                  onPress={() => {
                    haptic.light();
                    setLayoutStyle(layout.key);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: layoutStyle === layout.key }}
                  accessibilityLabel={t(layout.label)}
                  style={styles.layoutPressable}
                >
                  <LinearGradient
                    colors={
                      layoutStyle === layout.key
                        ? ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                    }
                    style={[
                      styles.layoutCard,
                      layoutStyle === layout.key && styles.layoutCardActive,
                    ]}
                  >
                    <Icon
                      name={LAYOUT_ICONS[layout.key] ?? 'layout'}
                      size="lg"
                      color={layoutStyle === layout.key ? colors.emerald : colors.text.tertiary}
                    />
                    <Text
                      style={[
                        styles.layoutLabel,
                        layoutStyle === layout.key && styles.layoutLabelActive,
                      ]}
                    >
                      {t(layout.label)}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </Animated.View>

            {/* Bio Font */}
            <SectionLabel text={t('gamification.profileCustomization.bioFont')} delay={200} />
            <Animated.View entering={FadeInUp.delay(250).duration(400)} style={styles.fontGrid}>
              {BIO_FONTS.map((font) => (
                <Pressable
                  key={font.key}
                  onPress={() => {
                    haptic.light();
                    setBioFont(font.key);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: bioFont === font.key }}
                  accessibilityLabel={t(font.label)}
                  style={styles.fontPressable}
                >
                  <LinearGradient
                    colors={
                      bioFont === font.key
                        ? ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']
                        : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']
                    }
                    style={[
                      styles.fontCard,
                      bioFont === font.key && styles.fontCardActive,
                    ]}
                  >
                    <Text style={[styles.fontPreview, { fontFamily: font.fontFamily }]}>
                      Aa
                    </Text>
                    <Text
                      style={[
                        styles.fontLabel,
                        bioFont === font.key && styles.fontLabelActive,
                      ]}
                    >
                      {t(font.label)}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ))}
            </Animated.View>

            {/* Toggles */}
            <SectionLabel text={t('gamification.profileCustomization.showBadges')} delay={300} />
            <Animated.View entering={FadeInUp.delay(350).duration(400)}>
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                style={styles.togglesCard}
              >
                <ToggleRow
                  label={t('gamification.profileCustomization.showBadges')}
                  value={showBadges}
                  onToggle={setShowBadges}
                  isRTL={isRTL}
                />
                <View style={styles.divider} />
                <ToggleRow
                  label={t('gamification.profileCustomization.showLevel')}
                  value={showLevel}
                  onToggle={setShowLevel}
                  isRTL={isRTL}
                />
                <View style={styles.divider} />
                <ToggleRow
                  label={t('gamification.profileCustomization.showStreak')}
                  value={showStreak}
                  onToggle={setShowStreak}
                  isRTL={isRTL}
                />
              </LinearGradient>
            </Animated.View>

            {/* Background Image Upload */}
            <SectionLabel text={t('gamification.profileCustomization.background')} delay={400} />
            <Animated.View entering={FadeInUp.delay(450).duration(400)}>
              <Pressable
                onPress={() => haptic.light()}
                style={styles.uploadButton}
                accessibilityRole="button"
                accessibilityLabel={t('gamification.profileCustomization.uploadBackground')}
              >
                <LinearGradient
                  colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                  style={[styles.uploadInner, { flexDirection: rtlFlexRow(isRTL) }]}
                >
                  <Icon name="image" size="md" color={colors.text.secondary} />
                  <Text style={styles.uploadText}>
                    {t('gamification.profileCustomization.uploadBackground')}
                  </Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>

            {/* Music URL */}
            <SectionLabel text={t('gamification.profileCustomization.music')} delay={500} />
            <Animated.View entering={FadeInUp.delay(550).duration(400)}>
              <View style={styles.inputContainer}>
                <Icon name="music" size="sm" color={colors.text.tertiary} />
                <TextInput
                  style={[styles.textInput, { textAlign: rtlTextAlign(isRTL) }]}
                  value={musicUrl}
                  onChangeText={setMusicUrl}
                  placeholder={t('gamification.profileCustomization.musicUrl')}
                  placeholderTextColor={colors.text.tertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>
            </Animated.View>

            {/* Save Button */}
            <Animated.View entering={FadeInUp.delay(600).duration(400)} style={styles.saveWrap}>
              <GradientButton
                label={t('gamification.profileCustomization.save')}
                onPress={handleSave}
                fullWidth
                loading={saveMutation.isPending}
              />
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

export default function ProfileCustomizationScreenWrapper() {
  return (
    <ScreenErrorBoundary>
      <ProfileCustomizationScreen />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['3xl'],
  },
  // Sections
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  // Color Picker
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  colorCircleOuter: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    borderWidth: 2.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Layout picker
  layoutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  layoutPressable: {
    width: '47%' as unknown as number,
    flexGrow: 1,
  },
  layoutCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
    minHeight: 100,
  },
  layoutCardActive: {
    borderColor: colors.emerald,
  },
  layoutLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  layoutLabelActive: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  // Font picker
  fontGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  fontPressable: {
    width: '47%' as unknown as number,
    flexGrow: 1,
  },
  fontCard: {
    borderRadius: radius.lg,
    padding: spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.dark.border,
    minHeight: 80,
  },
  fontCardActive: {
    borderColor: colors.emerald,
  },
  fontPreview: {
    fontSize: fontSize['2xl'],
    color: colors.text.primary,
  },
  fontLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  fontLabelActive: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  // Toggles
  togglesCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  toggleLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.primary,
    flex: 1,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: radius.lg,
    backgroundColor: colors.dark.surface,
    padding: 3,
    justifyContent: 'center',
  },
  toggleTrackActive: {
    backgroundColor: colors.emerald,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: '#FFF',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(45,53,72,0.5)',
    marginLeft: spacing.base,
  },
  // Upload
  uploadButton: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  uploadInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderStyle: 'dashed',
  },
  uploadText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.secondary,
  },
  // Music input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  textInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
    paddingVertical: spacing.sm,
  },
  // Save
  saveWrap: {
    marginTop: spacing['2xl'],
  },
  // Skeleton
  skeletonWrap: {
    gap: spacing.lg,
    paddingTop: spacing.xl,
  },
  colorGridSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  layoutGridSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
