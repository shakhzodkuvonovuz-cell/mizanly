import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Alert, Switch, Platform,
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
import { EmptyState } from '@/components/ui/EmptyState';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { liveApi } from '@/services/api';

type LiveType = 'VIDEO' | 'AUDIO';

const LIVE_TYPE_OPTIONS: { value: LiveType; label: string; iconName: React.ComponentProps<typeof Icon>['name'] }[] = [
  { value: 'VIDEO', label: 'Video Stream', iconName: 'video' },
  { value: 'AUDIO', label: 'Audio Space', iconName: 'mic' },
];

export default function GoLiveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useUser();

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
      setUploading(false);
      router.back();
      // Navigate to live viewer screen
      router.push(`/(screens)/live/${live.id}`);
    },
    onError: (err: Error) => {
      setUploading(false);
      Alert.alert('Error', err.message || 'Failed to start live stream. Please try again.');
    },
  });

  const canGoLive = title.trim().length > 0 && !createMutation.isPending;

  const handleScheduleToggle = useCallback((value: boolean) => {
    setIsScheduled(value);
    if (value && !scheduleDate) {
      // Default to 30 minutes from now
      const future = new Date(Date.now() + 30 * 60 * 1000);
      setScheduleDate(future);
      setTempDate(future);
    }
  }, [scheduleDate]);

  const handleDateSelect = useCallback((date: Date) => {
    setScheduleDate(date);
    setShowDatePicker(false);
  }, []);

  const handleGoLive = () => {
    if (!canGoLive) return;
    createMutation.mutate();
  };

  const selectedLiveType = LIVE_TYPE_OPTIONS.find(opt => opt.value === liveType)!;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Go Live"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />

      <ScrollView
        style={styles.body}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.bodyContent, { paddingTop: insets.top + 52 + spacing.base }]}
      >
        {/* Title input */}
        <Animated.View entering={FadeInUp.delay(0).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.inputCard}
          >
            <Text style={styles.inputLabel}>Title</Text>
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
          </LinearGradient>
        </Animated.View>

        {/* Description input */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.inputCard}
          >
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
          </LinearGradient>
        </Animated.View>

        {/* Live type selection */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.inputCard}
          >
            <Text style={styles.inputLabel}>Stream Type</Text>
            <TouchableOpacity
              style={styles.typeSelector}
              onPress={() => setShowLiveTypePicker(true)}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.1)']}
                style={styles.typeIconBg}
              >
                <Icon name={selectedLiveType.iconName} size="sm" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.typeSelectorText}>{selectedLiveType.label}</Text>
              <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Schedule toggle */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.inputCard}
          >
            <View style={styles.scheduleRow}>
              <View>
                <Text style={styles.inputLabel}>Schedule for later</Text>
                <Text style={styles.scheduleSubtitle}>
                  Start your stream at a specific time
                </Text>
              </View>
              <Switch
                value={isScheduled}
                onValueChange={handleScheduleToggle}
                trackColor={{ false: colors.dark.border, true: colors.emerald }}
                thumbColor={colors.text.primary}
                ios_backgroundColor={colors.dark.border}
              />
            </View>

            {isScheduled && scheduleDate && (
              <TouchableOpacity
                style={styles.scheduleDisplay}
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
                <Icon name="edit" size="sm" color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </LinearGradient>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(400).duration(400)}>
          <GradientButton
            label={createMutation.isPending ? 'Starting…' : 'Go Live'}
            onPress={handleGoLive}
            disabled={!canGoLive}
          />
        </Animated.View>
      </ScrollView>

      {/* Live type picker bottom sheet */}
      <BottomSheet visible={showLiveTypePicker} onClose={() => setShowLiveTypePicker(false)}>
        <Text style={styles.sheetTitle}>Select Stream Type</Text>
        {LIVE_TYPE_OPTIONS.map((opt) => (
          <BottomSheetItem
            key={opt.value}
            label={opt.label}
            icon={<Icon name={opt.iconName} size="sm" color={colors.text.primary} />}
            onPress={() => {
              setLiveType(opt.value);
              setShowLiveTypePicker(false);
            }}
          />
        ))}
      </BottomSheet>

      {/* Date picker bottom sheet */}
      <BottomSheet visible={showDatePicker} onClose={() => setShowDatePicker(false)} snapPoint={0.6}>
        <Text style={styles.sheetTitle}>Schedule Time</Text>
        {/* In a real app, you would use DateTimePicker component */}
        <View style={styles.datePickerPlaceholder}>
          <Text style={styles.datePickerText}>
            Date/time picker would appear here
          </Text>
          <Text style={styles.datePickerHint}>
            For simplicity, we'll schedule for 30 minutes from now.
          </Text>
          <GradientButton label="Confirm" onPress={() => handleDateSelect(tempDate)} />
        </View>
      </BottomSheet>

      {/* Upload overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <Skeleton.Circle size={64} />
          <Text style={styles.uploadText}>Preparing live stream…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  // Body
  body: { flex: 1 },
  bodyContent: { padding: spacing.base, paddingBottom: 80, gap: spacing.lg },
  // Input cards
  inputCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
  },
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
  // Type selector
  typeSelector: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderWidth: 1, borderColor: colors.dark.border,
  },
  typeIconBg: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSelectorText: { color: colors.text.primary, fontSize: fontSize.base, flex: 1 },
  // Schedule
  scheduleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  scheduleSubtitle: {
    color: colors.text.tertiary, fontSize: fontSize.sm, marginTop: spacing.xs,
  },
  scheduleDisplay: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.dark.bgElevated, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginTop: spacing.sm, borderWidth: 1, borderColor: colors.dark.border,
  },
  scheduleIconBg: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleText: { flex: 1, color: colors.emerald, fontSize: fontSize.sm, fontWeight: '600' },
  // Sheet
  sheetTitle: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.sm,
  },
  datePickerPlaceholder: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.xl,
    alignItems: 'center', gap: spacing.md,
  },
  datePickerText: {
    color: colors.text.primary, fontSize: fontSize.base, fontWeight: '600',
  },
  datePickerHint: {
    color: colors.text.secondary, fontSize: fontSize.sm, textAlign: 'center',
  },
  // Upload overlay
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,17,23,0.85)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  uploadText: { color: colors.text.primary, fontSize: fontSize.base },
});