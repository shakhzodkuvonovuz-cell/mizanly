import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GradientButton } from '@/components/ui/GradientButton';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius } from '@/theme';
import { authApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';

const INTERESTS = [
  { id: 'quran', label: 'onboarding.interests.quran', emoji: '📖' },
  { id: 'fiqh', label: 'onboarding.interests.fiqh', emoji: '⚖️' },
  { id: 'history', label: 'onboarding.interests.history', emoji: '🕌' },
  { id: 'family', label: 'onboarding.interests.family', emoji: '👨‍👩‍👧' },
  { id: 'health', label: 'onboarding.interests.health', emoji: '🌿' },
  { id: 'business', label: 'onboarding.interests.business', emoji: '💼' },
  { id: 'tech', label: 'onboarding.interests.tech', emoji: '💻' },
  { id: 'arts', label: 'onboarding.interests.arts', emoji: '🎨' },
  { id: 'travel', label: 'onboarding.interests.travel', emoji: '✈️' },
  { id: 'education', label: 'onboarding.interests.education', emoji: '📚' },
  { id: 'social', label: 'onboarding.interests.social', emoji: '🤝' },
  { id: 'sports', label: 'onboarding.interests.sports', emoji: '⚽' },
];

export default function InterestsScreen() {
  const router = useRouter();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user } = useUser();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const haptic = useHaptic();
  const { t } = useTranslation();

  const toggle = (id: string) => {
    haptic.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleContinue = async () => {
    if (selected.size < 3) return;
    setLoading(true);
    try {
      await authApi.setInterests(Array.from(selected));
      router.push('/onboarding/suggested');
    } catch {
      // continue anyway
      router.push('/onboarding/suggested');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progress}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.dot, i <= 3 && styles.dotActive]} />
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
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => toggle(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipEmoji}>{item.emoji}</Text>
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{t(item.label)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.count}>
          {selected.size} selected {selected.size < 3 ? `(need ${3 - selected.size} more)` : ''}
        </Text>
        <GradientButton
          label="Continue"
          onPress={handleContinue}
          loading={loading}
          disabled={selected.size < 3}
          fullWidth
        />
      </View>
    </SafeAreaView>
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
  chipEmoji: { fontSize: 18 },
  chipLabel: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '500' },
  chipLabelOn: { color: colors.emerald, fontWeight: '600' },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl, gap: spacing.md },
  count: { color: colors.text.secondary, fontSize: fontSize.sm, textAlign: 'center' },
});
