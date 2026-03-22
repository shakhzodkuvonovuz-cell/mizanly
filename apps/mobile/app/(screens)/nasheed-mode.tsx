import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useMutation } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useStore } from '@/store';
import { usersApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRouter } from 'expo-router';

const SAMPLE_NASHEEDS = [
  { title: 'Tala al-Badru Alayna', artist: 'Traditional' },
  { title: 'Maher Zain - Insha Allah', artist: 'Maher Zain' },
  { title: 'Labbayk Allahumma', artist: 'Mishary Rashid Alafasy' },
  { title: 'Hasbi Rabbi', artist: 'Sami Yusuf' },
];

export default function NasheedModeScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const nasheedMode = useStore((s) => s.nasheedMode);
  const setNasheedMode = useStore((s) => s.setNasheedMode);

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => usersApi.updateNasheedMode(enabled),
    onError: () => {
      // Revert on failure
      setNasheedMode(!nasheedMode);
    },
  });

  const handleToggle = (val: boolean) => {
    setNasheedMode(val);
    mutation.mutate(val);
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('nasheed.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 60 }]}
        >
          {/* Explanation card */}
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={styles.cardIconRow}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                style={styles.iconContainer}
              >
                <Icon name="mic" size="xl" color={colors.emerald} />
              </LinearGradient>
            </View>
            <Text style={styles.heading}>{t('nasheed.heading')}</Text>
            <Text style={styles.description}>{t('nasheed.description')}</Text>
          </LinearGradient>

          {/* Toggle row */}
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.toggleCard}
          >
            <Text style={styles.toggleLabel}>{t('nasheed.enable')}</Text>
            <Switch
              value={nasheedMode}
              onValueChange={handleToggle}
              trackColor={{ false: tc.border, true: colors.emerald }}
              thumbColor="#fff"
            />
          </LinearGradient>

          {/* Sample nasheeds */}
          <Text style={styles.sectionHeader}>{t('nasheed.sampleTitle')}</Text>
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {SAMPLE_NASHEEDS.map((nasheed, i) => (
              <Animated.View key={i} entering={FadeInUp.delay(Math.min(i, 15) * 40).duration(350).springify()} style={[styles.nasheedRow, i < SAMPLE_NASHEEDS.length - 1 && styles.nasheedRowBorder]}>
                <LinearGradient
                  colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']}
                  style={styles.playIconContainer}
                >
                  <Icon name="play" size="sm" color={colors.gold} />
                </LinearGradient>
                <View style={styles.nasheedInfo}>
                  <Text style={styles.nasheedTitle}>{nasheed.title}</Text>
                  <Text style={styles.nasheedArtist}>{nasheed.artist}</Text>
                </View>
              </Animated.View>
            ))}
          </LinearGradient>

          {/* Info text */}
          <View style={styles.infoRow}>
            <Icon name="eye" size="sm" color={colors.text.tertiary} />
            <Text style={styles.infoText}>{t('nasheed.info')}</Text>
          </View>
        </ScrollView>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.base,
    paddingBottom: 60,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardIconRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  toggleCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  toggleLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  sectionHeader: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    paddingLeft: spacing.xs,
  },
  nasheedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  nasheedRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(45,53,72,0.5)',
  },
  playIconContainer: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nasheedInfo: {
    flex: 1,
  },
  nasheedTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  nasheedArtist: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  infoText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    flex: 1,
    lineHeight: 16,
  },
});
