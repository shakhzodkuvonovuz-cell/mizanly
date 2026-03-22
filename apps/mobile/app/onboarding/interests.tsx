import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { authApi, usersApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const INTERESTS: { id: string; label: string; icon: IconName }[] = [
  { id: 'quran', label: 'onboarding.interests.quran', icon: 'book-open' },
  { id: 'fiqh', label: 'onboarding.interests.fiqh', icon: 'shield' },
  { id: 'history', label: 'onboarding.interests.history', icon: 'clock' },
  { id: 'family', label: 'onboarding.interests.family', icon: 'users' },
  { id: 'health', label: 'onboarding.interests.health', icon: 'heart' },
  { id: 'business', label: 'onboarding.interests.business', icon: 'briefcase' },
  { id: 'tech', label: 'onboarding.interests.tech', icon: 'globe' },
  { id: 'arts', label: 'onboarding.interests.arts', icon: 'pencil' },
  { id: 'travel', label: 'onboarding.interests.travel', icon: 'map-pin' },
  { id: 'education', label: 'onboarding.interests.education', icon: 'file-text' },
  { id: 'social', label: 'onboarding.interests.social', icon: 'smile' },
  { id: 'sports', label: 'onboarding.interests.sports', icon: 'trending-up' },
];

// Islamic madhab options (74.8)
const MADHABS: { id: string; label: string }[] = [
  { id: 'hanafi', label: 'onboarding.madhab.hanafi' },
  { id: 'maliki', label: 'onboarding.madhab.maliki' },
  { id: 'shafii', label: 'onboarding.madhab.shafii' },
  { id: 'hanbali', label: 'onboarding.madhab.hanbali' },
  { id: 'none', label: 'onboarding.madhab.noPreference' },
];

function InterestsScreenContent() {
  const router = useRouter();
  const { user } = useUser();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedMadhab, setSelectedMadhab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const haptic = useHaptic();
  const { t } = useTranslation();
  const tc = useThemeColors();

  const toggle = (id: string) => {
    haptic.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const markOnboardingComplete = async () => {
    try {
      await user?.update({ unsafeMetadata: { ...user.unsafeMetadata, onboardingComplete: true } });
    } catch {
      // Non-critical — AuthGuard will redirect if needed
    }
  };

  const handleContinue = async () => {
    if (selected.size < 3) return;
    setLoading(true);
    try {
      await authApi.setInterests(Array.from(selected));
      if (selectedMadhab && selectedMadhab !== 'none') {
        await usersApi.updateMe({ madhab: selectedMadhab }).catch(() => {});
      }
    } catch {
      // continue anyway
    } finally {
      await markOnboardingComplete();
      setLoading(false);
      router.replace('/(tabs)/saf');
    }
  };

  const handleSkip = async () => {
    haptic.light();
    await markOnboardingComplete();
    router.replace('/(tabs)/saf');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]}>
      <View style={styles.progress}>
        {[1, 2].map((i) => (
          <View key={i} style={[styles.dot, { backgroundColor: tc.border }, i <= 1 && styles.dotActive, i === 2 && { backgroundColor: colors.active.emerald50 }]} />
        ))}
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>{t('onboarding.interests.title')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.interests.subtitle')}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {INTERESTS.map((item) => {
          const on = selected.has(item.id);
          return (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              style={[styles.chip, { borderColor: tc.border, backgroundColor: tc.bgElevated }, on && styles.chipOn]}
              onPress={() => toggle(item.id)}
            >
              <Icon name={item.icon} size="sm" color={on ? colors.emerald : colors.text.secondary} />
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{t(item.label)}</Text>
            </Pressable>
          );
        })}

        {/* Madhab selector (74.8) */}
        <View style={[styles.madhabSection, { borderTopColor: tc.border }]}>
          <Text style={styles.madhabTitle}>{t('onboarding.madhab.title')}</Text>
          <Text style={styles.madhabSubtitle}>{t('onboarding.madhab.subtitle')}</Text>
          <View style={styles.madhabRow}>
            {MADHABS.map((m) => (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                style={[styles.chip, { borderColor: tc.border, backgroundColor: tc.bgElevated }, selectedMadhab === m.id && styles.chipOn]}
                onPress={() => { haptic.selection(); setSelectedMadhab(m.id); }}
              >
                <Text style={[styles.chipLabel, selectedMadhab === m.id && styles.chipLabelOn]}>{t(m.label)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.count}>
          {t('onboarding.interests.selectedCount', { count: selected.size })} {selected.size < 3 ? t('onboarding.interests.needMore', { count: 3 - selected.size }) : ''}
        </Text>
        <GradientButton
          label={t('common.continue')}
          onPress={handleContinue}
          loading={loading}
          disabled={selected.size < 3}
          fullWidth
        />
        <Pressable onPress={handleSkip} style={styles.skipBtn} accessibilityRole="button">
          <Text style={styles.skipText}>{t('common.skipForNow')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default function InterestsScreen() {
  return (
    <ScreenErrorBoundary>
      <InterestsScreenContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  progress: { flexDirection: 'row', gap: spacing.sm, marginHorizontal: spacing.xl, marginTop: spacing['2xl'], marginBottom: spacing.xl },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.dark.border },
  dotActive: { backgroundColor: colors.emerald },
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  title: { color: colors.text.primary, fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.sm },
  subtitle: { color: colors.text.secondary, fontSize: fontSize.base },
  scroll: { flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.dark.border,
    backgroundColor: colors.dark.bgElevated,
  },
  chipOn: { borderColor: colors.emerald, backgroundColor: `${colors.emerald}20` },
  chipLabel: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500' },
  chipLabelOn: { color: colors.emerald, fontWeight: '600' },
  madhabSection: {
    width: '100%',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  madhabTitle: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600', marginBottom: spacing.xs },
  madhabSubtitle: { color: colors.text.secondary, fontSize: fontSize.sm, marginBottom: spacing.md },
  madhabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  count: { color: colors.text.secondary, fontSize: fontSize.sm, textAlign: 'center' },
  skipBtn: { alignSelf: 'center', paddingVertical: spacing.sm },
  skipText: { color: colors.text.secondary, fontSize: fontSize.sm },
});
