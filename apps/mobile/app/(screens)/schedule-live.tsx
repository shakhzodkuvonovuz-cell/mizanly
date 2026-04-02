import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput, ScrollView,
  Platform, Image as RNImage,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { liveApi, uploadApi } from '@/services/api';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

interface Thumbnail {
  uri: string;
  type: 'image';
  width?: number;
  height?: number;
}

// Generate next 7 days for date picker
const generateDayOptions = () => {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push({
      label: date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
      value: date,
    });
  }
  return days;
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

export default function ScheduleLiveScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const haptic = useContextualHaptic();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [thumbnail, setThumbnail] = useState<Thumbnail | null>(null);
  const [scheduleDate, setScheduleDate] = useState<Date>(() => {
    // Default to 30 minutes from now
    const date = new Date();
    date.setMinutes(date.getMinutes() + 30);
    return date;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Date picker state
  const [tempDate, setTempDate] = useState(scheduleDate);
  const dayOptions = useMemo(() => generateDayOptions(), []);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedHour, setSelectedHour] = useState(scheduleDate.getHours());
  const [selectedMinute, setSelectedMinute] = useState(
    MINUTES.reduce((prev, curr) => (Math.abs(curr - scheduleDate.getMinutes()) < Math.abs(prev - scheduleDate.getMinutes()) ? curr : prev))
  );

  // Update temp date when hour/minute/day changes
  useEffect(() => {
    const day = dayOptions[selectedDayIndex]?.value;
    if (!day) return;
    const newDate = new Date(day);
    newDate.setHours(selectedHour, selectedMinute, 0, 0);
    setTempDate(newDate);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dayOptions is memoized (stable reference)
  }, [selectedDayIndex, selectedHour, selectedMinute]);

  // Thumbnail picker
  const pickThumbnail = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
      exif: false,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setThumbnail({
        uri: asset.uri,
        type: 'image',
        width: asset.width,
        height: asset.height,
      });
    }
  };

  const removeThumbnail = () => setThumbnail(null);

  // Upload thumbnail and create live session
  const scheduleMutation = useMutation({
    mutationFn: async () => {
      setUploading(true);

      let thumbnailUrl: string | undefined;
      if (thumbnail) {
        const ext = thumbnail.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
        const contentType = `image/${ext}`;
        const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(contentType, 'live-thumbnails');

        const fileRes = await fetch(thumbnail.uri);
        const blob = await fileRes.blob();
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': contentType },
        });
        if (!uploadRes.ok) throw new Error('Thumbnail upload failed');
        thumbnailUrl = publicUrl;
      }

      setUploading(false);

      return liveApi.create({
        title: title.trim(),
        description: description.trim() || undefined,
        thumbnailUrl,
        scheduledAt: scheduleDate.toISOString(),
      });
    },
    onSuccess: (live) => {
      haptic.success();
      showToast({ message: t('live.scheduled'), variant: 'success' });
      router.replace(`/(screens)/live/${live.id}`);
    },
    onError: (err: Error) => {
      setUploading(false);
      haptic.error();
      showToast({ message: err.message || t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const canSchedule = title.trim().length > 0 && !scheduleMutation.isPending;

  const handleSchedule = () => {
    if (!canSchedule) return;
    scheduleMutation.mutate();
  };

  const handleDateSelect = () => {
    setScheduleDate(tempDate);
    setShowDatePicker(false);
  };

  // Format date for display
  const formattedDate = scheduleDate.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('screens.schedule-live.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />

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
              <Text style={styles.inputLabel}>{t('screens.schedule-live.titleLabel')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('screens.schedule-live.titlePlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                accessibilityLabel={t('screens.schedule-live.titleLabel')}
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
              <Text style={styles.inputLabel}>{t('screens.schedule-live.descriptionLabel')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={t('screens.schedule-live.descriptionPlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                accessibilityLabel={t('screens.schedule-live.descriptionLabel')}
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

          {/* Thumbnail picker */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.inputCard}
            >
              <Text style={styles.inputLabel}>{t('screens.schedule-live.thumbnailLabel')}</Text>
              {thumbnail ? (
                <View style={styles.thumbnailPreview}>
                  <ProgressiveImage uri={thumbnail.uri} width="100%" height={200} />
                  <Pressable style={styles.removeThumbnail} onPress={removeThumbnail} accessibilityRole="button" accessibilityLabel={t('screens.schedule-live.removeThumbnail')}>
                    <Icon name="x" size={12} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.thumbnailPlaceholder} onPress={pickThumbnail} accessibilityRole="button" accessibilityLabel={t('screens.schedule-live.addThumbnail')}>
                  <LinearGradient
                    colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                    style={styles.thumbnailIconBg}
                  >
                    <Icon name="image" size="lg" color={colors.emerald} />
                  </LinearGradient>
                  <Text style={styles.thumbnailPlaceholderText}>{t('screens.schedule-live.addThumbnail')}</Text>
                  <Text style={styles.thumbnailHint}>{t('screens.schedule-live.thumbnailHint')}</Text>
                </Pressable>
              )}
            </LinearGradient>
          </Animated.View>

          {/* Date/time picker */}
          <Animated.View entering={FadeInUp.delay(300).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.inputCard}
            >
              <Text style={styles.inputLabel}>{t('screens.schedule-live.scheduleTimeLabel')}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('screens.schedule-live.scheduleTimeLabel')}
                style={styles.dateSelector}
                onPress={() => setShowDatePicker(true)}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                  style={styles.dateIconBg}
                >
                  <Icon name="clock" size="sm" color={colors.emerald} />
                </LinearGradient>
                <Text style={styles.dateSelectorText}>{formattedDate}</Text>
                <Icon name="edit" size="sm" color={tc.text.tertiary} />
              </Pressable>
            </LinearGradient>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(400).duration(400)}>
            <GradientButton
              label={scheduleMutation.isPending ? t('screens.schedule-live.scheduling') : t('screens.schedule-live.scheduleLive')}
              onPress={handleSchedule}
              disabled={!canSchedule}
            />
          </Animated.View>
        </ScrollView>

        {/* Date picker bottom sheet */}
        <BottomSheet visible={showDatePicker} onClose={() => setShowDatePicker(false)} snapPoint={0.6}>
          <Text style={styles.sheetTitle}>{t('screens.schedule-live.scheduleTimeLabel')}</Text>

          {/* Day selection */}
          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>{t('screens.schedule-live.day')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
              {dayOptions.map((day, idx) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={day.label}
                  key={idx}
                  style={[styles.pickerChip, selectedDayIndex === idx && styles.pickerChipActive]}
                  onPress={() => setSelectedDayIndex(idx)}
                >
                  <Text style={[styles.pickerChipText, selectedDayIndex === idx && styles.pickerChipTextActive]}>
                    {day.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Hour selection */}
          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>{t('screens.schedule-live.hour')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
              {HOURS.map((hour) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('screens.schedule-live.hour')} ${hour.toString().padStart(2, '0')}`}
                  key={hour}
                  style={[styles.pickerChip, selectedHour === hour && styles.pickerChipActive]}
                  onPress={() => setSelectedHour(hour)}
                >
                  <Text style={[styles.pickerChipText, selectedHour === hour && styles.pickerChipTextActive]}>
                    {hour.toString().padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Minute selection */}
          <View style={styles.pickerSection}>
            <Text style={styles.pickerLabel}>{t('screens.schedule-live.minute')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
              {MINUTES.map((minute) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('screens.schedule-live.minute')} ${minute.toString().padStart(2, '0')}`}
                  key={minute}
                  style={[styles.pickerChip, selectedMinute === minute && styles.pickerChipActive]}
                  onPress={() => setSelectedMinute(minute)}
                >
                  <Text style={[styles.pickerChipText, selectedMinute === minute && styles.pickerChipTextActive]}>
                    {minute.toString().padStart(2, '0')}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.pickerPreview}>
            <Text style={styles.pickerPreviewText}>
              {tempDate.toLocaleString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>

          <GradientButton label={t('common.confirm')} onPress={handleDateSelect} />
        </BottomSheet>

        {/* Upload overlay */}
        {uploading && (
          <View style={styles.uploadOverlay}>
            <Skeleton.Circle size={48} />
            <Text style={styles.uploadText}>{t('screens.schedule-live.uploadingThumbnail')}</Text>
          </View>
        )}
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
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
    color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodySemiBold,
    marginBottom: spacing.sm,
  },
  input: {
    color: tc.text.primary, fontSize: fontSize.base,
    backgroundColor: tc.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: tc.border,
  },
  textArea: {
    minHeight: 100, textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  charCountWrapper: {
    position: 'absolute', bottom: spacing.sm, end: spacing.sm,
  },
  // Thumbnail
  thumbnailPreview: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md,
    overflow: 'hidden', backgroundColor: tc.bgElevated,
    position: 'relative',
  },
  thumbnailImage: { width: '100%', height: '100%' },
  removeThumbnail: {
    position: 'absolute', top: spacing.xs, end: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.md,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  thumbnailPlaceholder: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: tc.border,
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  thumbnailIconBg: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailPlaceholderText: {
    color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodySemiBold,
  },
  thumbnailHint: {
    color: tc.text.tertiary, fontSize: fontSize.sm,
  },
  // Date selector
  dateSelector: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: tc.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: tc.border,
  },
  dateIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSelectorText: { flex: 1, color: colors.emerald, fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold },
  // Picker sheet
  sheetTitle: {
    color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodyBold,
    paddingHorizontal: spacing.xl, paddingBottom: spacing.sm,
  },
  pickerSection: { marginBottom: spacing.lg, paddingHorizontal: spacing.xl },
  pickerLabel: {
    color: tc.text.secondary, fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold,
    marginBottom: spacing.sm,
  },
  pickerRow: { flexDirection: 'row' },
  pickerChip: {
    backgroundColor: tc.bgElevated, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginEnd: spacing.sm,
    borderWidth: 1, borderColor: tc.border,
  },
  pickerChipActive: {
    backgroundColor: colors.active.emerald10, borderColor: colors.emerald,
  },
  pickerChipText: { color: tc.text.secondary, fontSize: fontSize.sm, fontFamily: fonts.bodySemiBold },
  pickerChipTextActive: { color: colors.emerald },
  pickerPreview: {
    alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.lg,
  },
  pickerPreviewText: {
    color: tc.text.primary, fontSize: fontSize.lg, fontFamily: fonts.bodyBold,
  },
  // Upload overlay
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,17,23,0.85)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  uploadText: { color: tc.text.primary, fontSize: fontSize.base },
});