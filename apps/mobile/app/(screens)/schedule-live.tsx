import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Alert, Platform, ActivityIndicator, Image as RNImage,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { liveApi, uploadApi } from '@/services/api';

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

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
  const dayOptions = generateDayOptions();
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
  }, [selectedDayIndex, selectedHour, selectedMinute, dayOptions]);

  // Thumbnail picker
  const pickThumbnail = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.9,
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
      router.back();
      // Navigate to live session detail
      router.push(`/(screens)/live/${live.id}`);
    },
    onError: (err: Error) => {
      setUploading(false);
      Alert.alert('Error', err.message || 'Failed to schedule live stream. Please try again.');
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Schedule Live"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />

      <ScrollView
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 52 + spacing.base }]}
      >
        {/* Title input */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Title *</Text>
          <TextInput
            style={styles.input}
            placeholder="What are you streaming?"
            placeholderTextColor={colors.text.tertiary}
            accessibilityLabel="Live stream title"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            autoFocus
          />
          <View style={styles.charCountWrapper}>
            <CharCountRing current={title.length} max={100} />
          </View>
        </View>

        {/* Description input */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Tell viewers what your stream is about"
            placeholderTextColor={colors.text.tertiary}
            accessibilityLabel="Live stream description"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={500}
            numberOfLines={4}
          />
          <View style={styles.charCountWrapper}>
            <CharCountRing current={description.length} max={500} />
          </View>
        </View>

        {/* Thumbnail picker */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Thumbnail (optional)</Text>
          {thumbnail ? (
            <View style={styles.thumbnailPreview}>
              <Image source={{ uri: thumbnail.uri }} style={styles.thumbnailImage} contentFit="cover" />
              <TouchableOpacity style={styles.removeThumbnail} onPress={removeThumbnail}>
                <Icon name="x" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.thumbnailPlaceholder} onPress={pickThumbnail}>
              <Icon name="image" size="lg" color={colors.text.tertiary} />
              <Text style={styles.thumbnailPlaceholderText}>Add a thumbnail</Text>
              <Text style={styles.thumbnailHint}>Recommended: 16:9 ratio</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Date/time picker */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Schedule Time *</Text>
          <TouchableOpacity
            style={styles.dateSelector}
            onPress={() => setShowDatePicker(true)}
          >
            <Icon name="clock" size="sm" color={colors.emerald} />
            <Text style={styles.dateSelectorText}>{formattedDate}</Text>
            <Icon name="edit" size="sm" color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        <GradientButton
          label={scheduleMutation.isPending ? 'Scheduling…' : 'Schedule Live'}
          onPress={handleSchedule}
          disabled={!canSchedule}
        />
      </ScrollView>

      {/* Date picker bottom sheet */}
      <BottomSheet visible={showDatePicker} onClose={() => setShowDatePicker(false)} snapPoint={0.6}>
        <Text style={styles.sheetTitle}>Schedule Time</Text>

        {/* Day selection */}
        <View style={styles.pickerSection}>
          <Text style={styles.pickerLabel}>Day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
            {dayOptions.map((day, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.pickerChip, selectedDayIndex === idx && styles.pickerChipActive]}
                onPress={() => setSelectedDayIndex(idx)}
              >
                <Text style={[styles.pickerChipText, selectedDayIndex === idx && styles.pickerChipTextActive]}>
                  {day.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Hour selection */}
        <View style={styles.pickerSection}>
          <Text style={styles.pickerLabel}>Hour</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
            {HOURS.map((hour) => (
              <TouchableOpacity
                key={hour}
                style={[styles.pickerChip, selectedHour === hour && styles.pickerChipActive]}
                onPress={() => setSelectedHour(hour)}
              >
                <Text style={[styles.pickerChipText, selectedHour === hour && styles.pickerChipTextActive]}>
                  {hour.toString().padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Minute selection */}
        <View style={styles.pickerSection}>
          <Text style={styles.pickerLabel}>Minute</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
            {MINUTES.map((minute) => (
              <TouchableOpacity
                key={minute}
                style={[styles.pickerChip, selectedMinute === minute && styles.pickerChipActive]}
                onPress={() => setSelectedMinute(minute)}
              >
                <Text style={[styles.pickerChipText, selectedMinute === minute && styles.pickerChipTextActive]}>
                  {minute.toString().padStart(2, '0')}
                </Text>
              </TouchableOpacity>
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

        <GradientButton label="Confirm" onPress={handleDateSelect} />
      </BottomSheet>

      {/* Upload overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <Skeleton.Circle size={48} />
          <Text style={styles.uploadText}>Uploading thumbnail...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  // Body
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 80 },
  // Input groups
  inputGroup: { marginBottom: spacing.lg },
  inputLabel: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600',
    marginBottom: spacing.sm,
  },
  input: {
    color: colors.text.primary, fontSize: fontSize.base,
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.dark.border,
  },
  textArea: {
    minHeight: 100, textAlignVertical: 'top',
    paddingTop: spacing.sm,
  },
  charCountWrapper: {
    position: 'absolute', bottom: spacing.sm, right: spacing.sm,
  },
  // Thumbnail
  thumbnailPreview: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md,
    overflow: 'hidden', backgroundColor: colors.dark.bgElevated,
    position: 'relative',
  },
  thumbnailImage: { width: '100%', height: '100%' },
  removeThumbnail: {
    position: 'absolute', top: spacing.xs, right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: radius.md,
    width: 24, height: 24, alignItems: 'center', justifyContent: 'center',
  },
  thumbnailPlaceholder: {
    width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dark.border,
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  thumbnailPlaceholderText: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600',
  },
  thumbnailHint: {
    color: colors.text.tertiary, fontSize: fontSize.sm,
  },
  // Date selector
  dateSelector: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.active.emerald10, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.emerald,
  },
  dateSelectorText: { flex: 1, color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },
  // Picker sheet
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.sm,
  },
  pickerSection: { marginBottom: spacing.lg, paddingHorizontal: spacing.xl },
  pickerLabel: {
    color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600',
    marginBottom: spacing.sm,
  },
  pickerRow: { flexDirection: 'row' },
  pickerChip: {
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderWidth: 1, borderColor: colors.dark.border,
  },
  pickerChipActive: {
    backgroundColor: colors.active.emerald10, borderColor: colors.emerald,
  },
  pickerChipText: { color: colors.text.secondary, fontSize: fontSize.sm, fontWeight: '600' },
  pickerChipTextActive: { color: colors.emerald },
  pickerPreview: {
    alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.lg,
  },
  pickerPreviewText: {
    color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700',
  },
  // Upload overlay
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,17,23,0.85)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  uploadText: { color: colors.text.primary, fontSize: fontSize.base },
});