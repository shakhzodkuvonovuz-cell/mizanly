import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { liveApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

type LiveType = 'VIDEO' | 'AUDIO';

// i18n: moved inside component
// const LIVE_TYPE_OPTIONS: { value: LiveType; label: string; iconName: React.ComponentProps<typeof Icon>['name'] }[] = [
//   { value: 'VIDEO', label: 'Video Stream', iconName: 'video' },
//   { value: 'AUDIO', label: 'Audio Space', iconName: 'mic' },
// ];

export default function GoLiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { t } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const LIVE_TYPE_OPTIONS = useMemo(() => [
    { value: 'VIDEO' as LiveType, label: t('live.videoStream'), iconName: 'video' as React.ComponentProps<typeof Icon>['name'] },
    { value: 'AUDIO' as LiveType, label: t('live.audioSpace'), iconName: 'mic' as React.ComponentProps<typeof Icon>['name'] },
  ], [t]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [liveType, setLiveType] = useState<LiveType>('VIDEO');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showLiveTypePicker, setShowLiveTypePicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Schedule date time handling
  const [tempDate, setTempDate] = useState(new Date());

  const createMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        liveType,
        scheduledAt: isScheduled && scheduleDate ? scheduleDate.toISOString() : undefined,
      };
      return liveApi.create(payload);
    },
    onSuccess: (live) => {
      haptic.success();
      setUploading(false);
      showToast({ message: t('live.streamStarted'), variant: 'success' });
      router.back();
      router.push(`/(screens)/live/${live.id}`);
    },
    onError: (err: Error) => {
      haptic.error();
      setUploading(false);
      showToast({ message: err.message || t('live.failedToStartStream'), variant: 'error' });
    },
  });

  const canGoLive = title.trim().length > 0 && !createMutation.isPending;

  const handleScheduleToggle = useCallback((value: boolean) => {
    haptic.tick();
    setIsScheduled(value);
    if (value && !scheduleDate) {
      // Default to 30 minutes from now
      const future = new Date(Date.now() + 30 * 60 * 1000);
      setScheduleDate(future);
      setTempDate(future);
    }
  }, [scheduleDate, haptic]);

  const handleDateSelect = useCallback((date: Date) => {
    setScheduleDate(date);
    setShowDatePicker(false);
  }, []);

  const rehearseMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);
      return liveApi.rehearse({ title: title.trim(), description: description.trim() || undefined, liveType });
    },
    onSuccess: (live) => {
      setUploading(false);
      showToast({ message: t('live.rehearsalStarted'), variant: 'success' });
      router.back();
      router.push(`/(screens)/live/${live.id}`);
    },
    onError: (err: Error) => {
      setUploading(false);
      showToast({ message: err.message || t('live.failedToStartRehearsal'), variant: 'error' });
    },
  });

  const handleGoLive = () => {
    if (!canGoLive || createMutation.isPending) return;
    haptic.send();
    createMutation.mutate();
  };

  const handleRehearsal = () => {
    if (!canGoLive) return;
    haptic.tick();
    rehearseMutation.mutate();
  };

  const selectedLiveType = LIVE_TYPE_OPTIONS.find(opt => opt.value === liveType)!;

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('live.goLive')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.body}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 52 + spacing.base }]}
        >
          {/* Title input */}
          <Animated.View entering={FadeInUp.delay(0).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.inputCard}
            >
              <Text style={[styles.inputLabel, { color: tc.text.primary }]}>{t('common.title')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
                placeholder={t('minbar.streamTitlePlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                accessibilityLabel={t('accessibility.streamTitle')}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
                autoFocus
              />
              <View style={styles.charCountWrapper}>
                <CharCountRing current={title.length} max={100} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Description input */}
          <Animated.View entering={FadeInUp.delay(100).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.inputCard}
            >
              <Text style={[styles.inputLabel, { color: tc.text.primary }]}>{t('common.descriptionOptional')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: tc.bgElevated, borderColor: tc.border }, styles.textArea]}
                placeholder={t('minbar.streamDescPlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                accessibilityLabel={t('accessibility.streamDesc')}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
                numberOfLines={4}
              />
              <View style={styles.charCountWrapper}>
                <CharCountRing current={description.length} max={500} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Live type selection */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.inputCard}
            >
              <Text style={[styles.inputLabel, { color: tc.text.primary }]}>{t('live.streamType')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('live.selectStreamType')}
                style={[styles.typeSelector, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
                onPress={() => setShowLiveTypePicker(true)}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
                  style={styles.typeIconBg}
                >
                  <Icon name={selectedLiveType.iconName} size="sm" color={colors.emerald} />
                </LinearGradient>
                <Text style={[styles.typeSelectorText, { color: tc.text.primary }]}>{selectedLiveType.label}</Text>
                <Icon name="chevron-right" size="sm" color={tc.text.tertiary} />
              </Pressable>
            </LinearGradient>
          </Animated.View>

          {/* Schedule toggle */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.inputCard}
            >
              <View style={styles.scheduleRow}>
                <View>
                  <Text style={[styles.inputLabel, { color: tc.text.primary }]}>{t('live.scheduleForLater')}</Text>
                  <Text style={[styles.scheduleSubtitle, { color: tc.text.tertiary }]}>
                    {t('live.scheduleSubtitle')}
                  </Text>
                </View>
                <Switch
                  value={isScheduled}
                  onValueChange={handleScheduleToggle}
                  trackColor={{ false: tc.border, true: colors.emerald }}
                  thumbColor={tc.text.primary}
                  ios_backgroundColor={tc.border}
                />
              </View>

              {isScheduled && scheduleDate && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('live.scheduleTime')}
                  style={[styles.scheduleDisplay, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(10,123,79,0.1)']}
                    style={styles.scheduleIconBg}
                  >
                    <Icon name="clock" size="sm" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.scheduleText}>
                    {scheduleDate.toLocaleString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Icon name="edit" size="sm" color={tc.text.tertiary} />
                </Pressable>
              )}
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(400).duration(400)} style={{ gap: spacing.sm }}>
            <GradientButton
              label={createMutation.isPending ? t('live.starting') : t('live.goLive')}
              onPress={handleGoLive}
              disabled={!canGoLive}
            />
            <Pressable
              style={[styles.rehearseButton, { borderColor: tc.border, backgroundColor: tc.bgElevated }, !canGoLive && { opacity: 0.4 }]}
              onPress={handleRehearsal}
              disabled={!canGoLive}
              accessibilityLabel={t('live.rehearse')}
              accessibilityRole="button"
            >
              <Icon name="eye-off" size="sm" color={tc.text.secondary} />
              <Text style={[styles.rehearseText, { color: tc.text.secondary }]}>{t('live.rehearse')}</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
        </KeyboardAvoidingView>

        {/* Live type picker bottom sheet */}
        <BottomSheet visible={showLiveTypePicker} onClose={() => setShowLiveTypePicker(false)}>
          <Text style={[styles.sheetTitle, { color: tc.text.primary }]}>{t('live.selectStreamType')}</Text>
          {LIVE_TYPE_OPTIONS.map((opt) => (
            <BottomSheetItem
              key={opt.value}
              label={opt.label}
              icon={<Icon name={opt.iconName} size="sm" color={tc.text.primary} />}
              onPress={() => {
                setLiveType(opt.value);
                setShowLiveTypePicker(false);
              }}
            />
          ))}
        </BottomSheet>

        {/* Date picker bottom sheet */}
        <BottomSheet visible={showDatePicker} onClose={() => setShowDatePicker(false)} snapPoint={0.6}>
          <Text style={[styles.sheetTitle, { color: tc.text.primary }]}>{t('live.scheduleTime')}</Text>
          {/* In a real app, you would use DateTimePicker component */}
          <View style={styles.datePickerPlaceholder}>
            <Text style={[styles.datePickerText, { color: tc.text.primary }]}>
              {t('live.datePickerPlaceholder')}
            </Text>
            <Text style={[styles.datePickerHint, { color: tc.text.secondary }]}>
              {t('live.datePickerHint')}
            </Text>
            <GradientButton label={t('common.confirm')} onPress={() => handleDateSelect(tempDate)} />
          </View>
        </BottomSheet>

        {/* Upload overlay */}
        {uploading && (
          <View style={styles.uploadOverlay}>
            <Skeleton.Circle size={64} />
            <Text style={[styles.uploadText, { color: tc.text.primary }]}>{t('live.preparingStream')}</Text>
          </View>
        )}
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Body
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 80, gap: spacing.lg },
  // Input cards
  inputCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
  },
  inputLabel: {
    fontSize: fontSize.base, fontFamily: fonts.bodySemiBold,
    marginBottom: spacing.sm,
  },
  input: {
    fontSize: fontSize.base,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  textArea: {
    minHeight: 100, textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  charCountWrapper: {
    position: 'absolute', bottom: spacing.sm, end: spacing.sm,
  },
  // Type selector
  typeSelector: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1,
  },
  typeIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSelectorText: { fontSize: fontSize.base, flex: 1 },
  // Schedule
  scheduleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  scheduleSubtitle: {
    fontSize: fontSize.sm, marginTop: spacing.xs,
  },
  scheduleDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginTop: spacing.sm, borderWidth: 1,
  },
  scheduleIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleText: { flex: 1, color: colors.emerald, fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold },
  // Sheet
  sheetTitle: {
    fontSize: fontSize.base, fontFamily: fonts.bodyBold,
    paddingHorizontal: spacing.xl, paddingBottom: spacing.sm,
  },
  datePickerPlaceholder: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.xl,
    alignItems: 'center', gap: spacing.md,
  },
  datePickerText: {
    fontSize: fontSize.base, fontFamily: fonts.bodySemiBold,
  },
  datePickerHint: {
    fontSize: fontSize.sm, textAlign: 'center',
  },
  // Upload overlay
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,17,23,0.85)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  uploadText: { fontSize: fontSize.base },
  rehearseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  rehearseText: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
  },
});