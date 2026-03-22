import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  Switch, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, spacing, fontSize, radius } from '@/theme';
import { settingsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { rtlFlexRow, rtlTextAlign, rtlMargin } from '@/utils/rtl';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

function buildTimeOptions(): string[] {
  const options: string[] = [];
  for (const h of HOURS) {
    for (const m of MINUTES) {
      options.push(`${h}:${m}`);
    }
  }
  return options;
}

const TIME_OPTIONS = buildTimeOptions();

export default function QuietModeScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const queryClient = useQueryClient();

  const [isActive, setIsActive] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [startTime, setStartTime] = useState('22:00');
  const [endTime, setEndTime] = useState('07:00');
  const [autoReply, setAutoReply] = useState('');
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const query = useQuery({
    queryKey: ['quiet-mode'],
    queryFn: () => settingsApi.getQuietMode(),
  });

  useEffect(() => {
    if (query.data) {
      const d = query.data;
      setIsActive(d.isActive ?? false);
      setIsScheduled(d.isScheduled ?? false);
      setStartTime(d.startTime ?? '22:00');
      setEndTime(d.endTime ?? '07:00');
      setAutoReply(d.autoReply ?? '');
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: settingsApi.updateQuietMode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiet-mode'] });
    },
  });

  const save = (updates: Parameters<typeof settingsApi.updateQuietMode>[0]) => {
    mutation.mutate(updates);
  };

  const handleToggleActive = (v: boolean) => {
    haptic.light();
    setIsActive(v);
    save({ isActive: v });
  };

  const handleToggleSchedule = (v: boolean) => {
    haptic.light();
    setIsScheduled(v);
    save({ isScheduled: v });
  };

  const handleSelectStartTime = (time: string) => {
    setStartTime(time);
    setShowStartPicker(false);
    save({ startTime: time });
  };

  const handleSelectEndTime = (time: string) => {
    setEndTime(time);
    setShowEndPicker(false);
    save({ endTime: time });
  };

  const handleAutoReplyBlur = () => {
    save({ autoReply: autoReply || undefined });
  };

  if (query.isLoading) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('quietMode.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={[styles.loadingContainer, { paddingTop: insets.top + 80 }]}>
          <Skeleton.Rect width="100%" height={120} />
          <Skeleton.Rect width="100%" height={56} />
          <Skeleton.Rect width="100%" height={56} />
          <Skeleton.Rect width="100%" height={100} />
        </View>
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('quietMode.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 60 }]}
        >
          {/* Hero Icon Card */}
          <LinearGradient
            colors={['rgba(10,123,79,0.15)', 'rgba(10,123,79,0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroIconWrap}>
              <Icon name="volume-x" size="xl" color={colors.emerald} />
            </View>
            <Text style={[styles.heroTitle, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('quietMode.title')}
            </Text>
            <Text style={[styles.heroSubtitle, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('quietMode.settingsHint')}
            </Text>
          </LinearGradient>

          {/* Main Toggle */}
          <LinearGradient
            colors={isActive
              ? ['rgba(10,123,79,0.25)', 'rgba(10,123,79,0.1)']
              : colors.gradient.cardDark
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.toggleCard}
          >
            <View style={[styles.toggleRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.05)']}
                style={[styles.toggleIconWrap, rtlMargin(isRTL, 0, spacing.sm)]}
              >
                <Icon name="volume-x" size="sm" color={colors.emerald} />
              </LinearGradient>
              <View style={[styles.toggleTextWrap, rtlMargin(isRTL, 0, spacing.md)]}>
                <Text style={[styles.toggleLabel, { textAlign: rtlTextAlign(isRTL) }]}>
                  {t('quietMode.enable')}
                </Text>
                {isActive && (
                  <Text style={[styles.toggleHint, { textAlign: rtlTextAlign(isRTL), color: colors.emerald }]}>
                    {t('quietMode.active')}
                  </Text>
                )}
              </View>
              <Switch
                value={isActive}
                onValueChange={handleToggleActive}
                trackColor={{ false: tc.border, true: colors.emerald }}
                thumbColor="#fff"
              />
            </View>
          </LinearGradient>

          {/* Schedule Section */}
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={[styles.toggleRow, { flexDirection: rtlFlexRow(isRTL) }]}>
              <LinearGradient
                colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.05)']}
                style={[styles.toggleIconWrap, rtlMargin(isRTL, 0, spacing.sm)]}
              >
                <Icon name="clock" size="sm" color={colors.gold} />
              </LinearGradient>
              <View style={[styles.toggleTextWrap, rtlMargin(isRTL, 0, spacing.md)]}>
                <Text style={[styles.toggleLabel, { textAlign: rtlTextAlign(isRTL) }]}>
                  {t('quietMode.schedule')}
                </Text>
                <Text style={[styles.toggleHint, { textAlign: rtlTextAlign(isRTL) }]}>
                  {t('quietMode.scheduleHint')}
                </Text>
              </View>
              <Switch
                value={isScheduled}
                onValueChange={handleToggleSchedule}
                trackColor={{ false: tc.border, true: colors.emerald }}
                thumbColor="#fff"
              />
            </View>

            {isScheduled && (
              <>
                <View style={styles.divider} />
                <View style={[styles.timeRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                  <Text style={[styles.timeLabel, { textAlign: rtlTextAlign(isRTL) }]}>
                    {t('quietMode.startTime')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.timeButton}
                    onPress={() => { haptic.selection(); setShowStartPicker(true); }}
                  >
                    <Text style={styles.timeButtonText}>{startTime}</Text>
                    <Icon name="chevron-down" size="xs" color={colors.text.tertiary} />
                  </Pressable>
                </View>
                <View style={styles.divider} />
                <View style={[styles.timeRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                  <Text style={[styles.timeLabel, { textAlign: rtlTextAlign(isRTL) }]}>
                    {t('quietMode.endTime')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.timeButton}
                    onPress={() => { haptic.selection(); setShowEndPicker(true); }}
                  >
                    <Text style={styles.timeButtonText}>{endTime}</Text>
                    <Icon name="chevron-down" size="xs" color={colors.text.tertiary} />
                  </Pressable>
                </View>
              </>
            )}
          </LinearGradient>

          {/* Auto-reply Section */}
          <LinearGradient
            colors={colors.gradient.cardDark}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={[styles.autoReplyHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Text style={[styles.autoReplyLabel, { textAlign: rtlTextAlign(isRTL) }]}>
                {t('quietMode.autoReply')}
              </Text>
              <CharCountRing current={autoReply.length} max={200} size={28} />
            </View>
            <TextInput
              style={[styles.autoReplyInput, { textAlign: rtlTextAlign(isRTL) }]}
              value={autoReply}
              onChangeText={(text) => setAutoReply(text.slice(0, 200))}
              onBlur={handleAutoReplyBlur}
              placeholder={t('quietMode.autoReplyPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={200}
            />
            <Text style={[styles.autoReplyHint, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('quietMode.autoReplyHint')}
            </Text>
          </LinearGradient>

          {/* Info Card */}
          <LinearGradient
            colors={['rgba(200,150,62,0.1)', 'rgba(200,150,62,0.03)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.infoCard}
          >
            <View style={[styles.infoHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
              <Icon name="eye" size="sm" color={colors.gold} />
              <Text style={[styles.infoTitle, { textAlign: rtlTextAlign(isRTL) }]}>
                {t('quietMode.infoTitle')}
              </Text>
            </View>
            <Text style={[styles.infoBody, { textAlign: rtlTextAlign(isRTL) }]}>
              {t('quietMode.infoBody')}
            </Text>
          </LinearGradient>
        </ScrollView>

        {/* Start Time Picker BottomSheet */}
        <BottomSheet visible={showStartPicker} onClose={() => setShowStartPicker(false)}>
          <ScrollView style={styles.pickerScroll}>
            {TIME_OPTIONS.map((time) => (
              <BottomSheetItem
                key={time}
                label={time}
                icon={time === startTime ? <Icon name="check" size="sm" color={colors.emerald} /> : undefined}
                onPress={() => handleSelectStartTime(time)}
              />
            ))}
          </ScrollView>
        </BottomSheet>

        {/* End Time Picker BottomSheet */}
        <BottomSheet visible={showEndPicker} onClose={() => setShowEndPicker(false)}>
          <ScrollView style={styles.pickerScroll}>
            {TIME_OPTIONS.map((time) => (
              <BottomSheetItem
                key={time}
                label={time}
                icon={time === endTime ? <Icon name="check" size="sm" color={colors.emerald} /> : undefined}
                onPress={() => handleSelectEndTime(time)}
              />
            ))}
          </ScrollView>
        </BottomSheet>
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
    gap: spacing.md,
  },
  loadingContainer: {
    paddingHorizontal: spacing.base,
    gap: spacing.lg,
  },

  // Hero card
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.emerald20,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.active.emerald10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  heroTitle: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },

  // Toggle card
  toggleCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  toggleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTextWrap: {
    flex: 1,
  },
  toggleLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
  },
  toggleHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },

  // Card
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(45,53,72,0.3)',
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(45,53,72,0.5)',
    marginLeft: spacing.base + 40,
  },

  // Time row
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  timeLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(45,53,72,0.5)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  timeButtonText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // Auto-reply
  autoReplyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  autoReplyLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '500',
    flex: 1,
  },
  autoReplyInput: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  autoReplyHint: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },

  // Info card
  infoCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.gold15,
    padding: spacing.base,
    gap: spacing.sm,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  infoTitle: {
    color: colors.gold,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  infoBody: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },

  // Time picker
  pickerScroll: {
    maxHeight: 300,
  },
});
