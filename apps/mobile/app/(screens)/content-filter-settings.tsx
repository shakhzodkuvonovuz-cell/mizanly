import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { showToast } from '@/components/ui/Toast';
import { islamicApi } from '@/services/islamicApi';
import type { ContentFilterSetting } from '@/types/islamic';

type StrictnessLevel = 'relaxed' | 'moderate' | 'strict' | 'family';

interface LevelOption {
  key: StrictnessLevel;
  labelKey: string;
  descKey: string;
  iconName: 'eye' | 'filter' | 'lock' | 'users';
}

const LEVELS: LevelOption[] = [
  { key: 'relaxed', labelKey: 'contentFilter.relaxed', descKey: 'contentFilter.relaxedDesc', iconName: 'eye' },
  { key: 'moderate', labelKey: 'contentFilter.moderate', descKey: 'contentFilter.moderateDesc', iconName: 'filter' },
  { key: 'strict', labelKey: 'contentFilter.strict', descKey: 'contentFilter.strictDesc', iconName: 'lock' },
  { key: 'family', labelKey: 'contentFilter.family', descKey: 'contentFilter.familyDesc', iconName: 'users' },
];

function ContentFilterSettingsContent() {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();

  const settingsQuery = useQuery({
    queryKey: ['content-filter-settings'],
    queryFn: () => islamicApi.getContentFilterSettings(),
  });

  const settings = settingsQuery.data as ContentFilterSetting | undefined;

  const [localLevel, setLocalLevel] = useState<StrictnessLevel | null>(null);
  const [localBlurHaram, setLocalBlurHaram] = useState<boolean | null>(null);
  const [localHideMusic, setLocalHideMusic] = useState<boolean | null>(null);
  const [localHideMixedGender, setLocalHideMixedGender] = useState<boolean | null>(null);

  const currentLevel = (localLevel ?? settings?.strictnessLevel ?? 'moderate') as StrictnessLevel;
  const currentBlurHaram = localBlurHaram ?? settings?.blurHaram ?? true;
  const currentHideMusic = localHideMusic ?? settings?.hideMusic ?? false;
  const currentHideMixedGender = localHideMixedGender ?? settings?.hideMixedGender ?? false;

  const mutation = useMutation({
    mutationFn: (data: Partial<ContentFilterSetting>) =>
      islamicApi.updateContentFilterSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-filter-settings'] });
    },
    onError: (err: Error) => {
      // Rollback optimistic local state on failure
      setLocalLevel(null);
      setLocalBlurHaram(null);
      setLocalHideMusic(null);
      setLocalHideMixedGender(null);
      showToast({ message: err.message || t('common.error'), variant: 'error' });
    },
  });

  const handleLevelChange = useCallback(
    (level: StrictnessLevel) => {
      haptic.tick();
      setLocalLevel(level);
      mutation.mutate({ strictnessLevel: level });
    },
    [mutation, haptic],
  );

  const handleToggleBlurHaram = useCallback(
    (val: boolean) => {
      haptic.tick();
      setLocalBlurHaram(val);
      mutation.mutate({ blurHaram: val });
    },
    [mutation, haptic],
  );

  const handleToggleHideMusic = useCallback(
    (val: boolean) => {
      haptic.tick();
      setLocalHideMusic(val);
      mutation.mutate({ hideMusic: val });
    },
    [mutation, haptic],
  );

  const handleToggleHideMixedGender = useCallback(
    (val: boolean) => {
      haptic.tick();
      setLocalHideMixedGender(val);
      mutation.mutate({ hideMixedGender: val });
    },
    [mutation, haptic],
  );

  if (settingsQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <StatusBar barStyle="light-content" />
        <GlassHeader
          title={t('contentFilter.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />
        <View style={[styles.skeletonWrap, { paddingTop: insets.top + 72 }]}>
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
          <Skeleton.Rect width="100%" height={80} borderRadius={radius.lg} />
          <Skeleton.Rect width="100%" height={52} borderRadius={radius.lg} />
          <Skeleton.Rect width="100%" height={52} borderRadius={radius.lg} />
          <Skeleton.Rect width="100%" height={52} borderRadius={radius.lg} />
        </View>
      </View>
    );
  }

  if (settingsQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <StatusBar barStyle="light-content" />
        <GlassHeader
          title={t('contentFilter.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />
        <View style={{ flex: 1, justifyContent: 'center', paddingTop: insets.top + 72 }}>
          <EmptyState
            icon="alert-circle"
            title={t('common.error.loadContent', 'Failed to load')}
            subtitle={t('common.error.checkConnection', 'Check your connection and try again')}
            actionLabel={t('common.retry')}
            onAction={() => settingsQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <StatusBar barStyle="light-content" />
      <GlassHeader
        title={t('contentFilter.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 72 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Strictness Level Section */}
        <Animated.View entering={FadeInUp.delay(0).duration(400)}>
        <Text style={[styles.sectionHeader, { color: tc.text.secondary }]}>{t('contentFilter.strictness')}</Text>

        {LEVELS.map((level) => {
          const isSelected = currentLevel === level.key;
          return (
            <Pressable
              key={level.key}
              onPress={() => handleLevelChange(level.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={t(level.labelKey)}
            >
              <LinearGradient
                colors={
                  isSelected
                    ? ['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']
                    : colors.gradient.cardDark
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.levelCard,
                  { borderColor: tc.border },
                  isSelected && styles.levelCardSelected,
                ]}
              >
                <View style={[styles.levelIconWrap, { backgroundColor: tc.surface }]}>
                  <Icon
                    name={level.iconName}
                    size="md"
                    color={isSelected ? colors.emerald : tc.text.secondary}
                  />
                </View>
                <View style={styles.levelTextWrap}>
                  <Text
                    style={[
                      styles.levelTitle,
                      { color: tc.text.primary },
                      isSelected && styles.levelTitleSelected,
                    ]}
                  >
                    {t(level.labelKey)}
                  </Text>
                  <Text style={[styles.levelDesc, { color: tc.text.secondary }]}>{t(level.descKey)}</Text>
                </View>
                {isSelected && (
                  <Icon name="check-circle" size="md" color={colors.emerald} />
                )}
              </LinearGradient>
            </Pressable>
          );
        })}

        </Animated.View>

        {/* Individual Toggles Section */}
        <Animated.View entering={FadeInUp.delay(60).duration(400)}>
        <Text style={[styles.sectionHeader, { marginTop: spacing.xl, color: tc.text.secondary }]}>
          {t('contentFilter.title')}
        </Text>

        <LinearGradient
          colors={colors.gradient.cardDark}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.toggleCard, { borderColor: tc.border }]}
        >
          <View style={styles.toggleRow}>
            <Icon name="eye-off" size="sm" color={tc.text.secondary} />
            <Text style={[styles.toggleLabel, { color: tc.text.primary }]}>{t('contentFilter.blurHaram')}</Text>
            <Switch
              value={currentBlurHaram}
              onValueChange={handleToggleBlurHaram}
              trackColor={{ false: tc.border, true: colors.emerald }}
              thumbColor={tc.bgCard}
            />
          </View>

          <View style={[styles.separator, { backgroundColor: tc.border }]} />

          <View style={styles.toggleRow}>
            <Icon name="volume-x" size="sm" color={tc.text.secondary} />
            <Text style={[styles.toggleLabel, { color: tc.text.primary }]}>{t('contentFilter.hideMusic')}</Text>
            <Switch
              value={currentHideMusic}
              onValueChange={handleToggleHideMusic}
              trackColor={{ false: tc.border, true: colors.emerald }}
              thumbColor={tc.bgCard}
            />
          </View>

          <View style={[styles.separator, { backgroundColor: tc.border }]} />

          <View style={styles.toggleRow}>
            <Icon name="users" size="sm" color={tc.text.secondary} />
            <Text style={[styles.toggleLabel, { color: tc.text.primary }]}>
              {t('contentFilter.hideMixedGender')}
            </Text>
            <Switch
              value={currentHideMixedGender}
              onValueChange={handleToggleHideMixedGender}
              trackColor={{ false: tc.border, true: colors.emerald }}
              thumbColor={tc.bgCard}
            />
          </View>
        </LinearGradient>

        </Animated.View>

        {/* Info footer */}
        <Animated.View entering={FadeInUp.delay(120).duration(400)}>
        <View style={styles.infoRow}>
          <Icon name="eye" size="sm" color={tc.text.tertiary} />
          <Text style={[styles.infoText, { color: tc.text.tertiary }]}>
            {t('contentFilter.moderateDesc')}
          </Text>
        </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

export default function ContentFilterSettingsScreen() {
  return (
    <ScreenErrorBoundary>
      <ContentFilterSettingsContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.base,
    paddingBottom: 60,
  },
  skeletonWrap: {
    padding: spacing.base,
    gap: spacing.md,
  },
  sectionHeader: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    paddingStart: spacing.xs,
  },
  levelCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
    padding: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  levelCardSelected: {
    borderColor: colors.emerald,
  },
  levelIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(45,53,72,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelTextWrap: {
    flex: 1,
  },
  levelTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  levelTitleSelected: {
    color: colors.emerald,
  },
  levelDesc: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  toggleCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
    padding: spacing.base,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(45,53,72,0.5)',
    marginVertical: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  infoText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    flex: 1,
    lineHeight: 16,
  },
});
