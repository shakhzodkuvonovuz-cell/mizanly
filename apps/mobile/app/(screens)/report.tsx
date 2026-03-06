import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { postsApi, threadsApi, reelsApi, videosApi, usersApi } from '@/services/api';

const REASONS = [
  { label: 'Spam', value: 'SPAM' },
  { label: 'Harassment', value: 'HARASSMENT' },
  { label: 'Hate speech', value: 'HATE_SPEECH' },
  { label: 'Nudity', value: 'NUDITY' },
  { label: 'Violence', value: 'VIOLENCE' },
  { label: 'Misinformation', value: 'MISINFORMATION' },
  { label: 'Impersonation', value: 'IMPERSONATION' },
  { label: 'Other', value: 'OTHER' },
] as const;

export default function ReportScreen() {
  const params = useLocalSearchParams<{ type: string; id: string }>();
  const router = useRouter();
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [details, setDetails] = useState('');

  const reportMutation = useMutation({
    mutationFn: async () => {
      const { type, id } = params;
      const reason = selectedReason;
      if (!reason) throw new Error('Please select a reason');

      switch (type) {
        case 'post':
          return postsApi.report(id, reason);
        case 'thread':
          return threadsApi.report(id, reason);
        case 'reel':
          return reelsApi.report(id, reason);
        case 'video':
          return videosApi.report(id, reason);
        case 'user':
          return usersApi.report(id, reason);
        case 'channel':
          // channels don't have a separate report endpoint — report as video content issue
          return videosApi.report(id, reason);
        default:
          throw new Error(`Unsupported report type: ${type}`);
      }
    },
    onSuccess: () => {
      Alert.alert('Report Submitted', 'Thank you. We will review this content.');
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const handleSubmit = () => {
    reportMutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Icon name="arrow-left" size="md" color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Report</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.prompt}>
          Why are you reporting this {params.type}?
        </Text>

        {/* Reason list */}
        <View style={styles.reasonList}>
          {REASONS.map((reason) => (
            <Pressable
              key={reason.value}
              style={styles.reasonItem}
              onPress={() => setSelectedReason(reason.value)}
            >
              <View style={styles.radioOuter}>
                {selectedReason === reason.value && (
                  <View style={styles.radioInner} />
                )}
              </View>
              <Text style={styles.reasonLabel}>{reason.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Additional details */}
        <Text style={styles.detailsLabel}>Additional details (optional)</Text>
        <TextInput
          style={styles.detailsInput}
          placeholder="Provide more information..."
          placeholderTextColor={colors.text.tertiary}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>
          {details.length}/500
        </Text>

        {/* Submit button */}
        <Pressable
          style={[styles.submitBtn, !selectedReason && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!selectedReason || reportMutation.isPending}
        >
          {reportMutation.isPending ? (
            <Icon name="loader" size="sm" color={colors.text.primary} />
          ) : (
            <Text style={styles.submitBtnText}>Submit Report</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
    backgroundColor: 'rgba(13, 17, 23, 0.95)',
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
  },
  prompt: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.xl,
  },
  reasonList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  reasonLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  detailsLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  detailsInput: {
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    color: colors.text.primary,
    fontSize: fontSize.base,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 100,
    marginBottom: spacing.xs,
  },
  charCount: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    textAlign: 'right',
    marginBottom: spacing.xl,
  },
  submitBtn: {
    backgroundColor: colors.emerald,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
});