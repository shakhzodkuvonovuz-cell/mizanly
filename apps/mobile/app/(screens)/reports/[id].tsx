import { useState, useEffect } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reportsApi } from '@/services/api';

const REASONS = [
  { label: 'Hate speech', value: 'HATE_SPEECH' },
  { label: 'Harassment', value: 'HARASSMENT' },
  { label: 'Violence', value: 'VIOLENCE' },
  { label: 'Spam', value: 'SPAM' },
  { label: 'Misinformation', value: 'MISINFORMATION' },
  { label: 'Nudity', value: 'NUDITY' },
  { label: 'Self‑harm', value: 'SELF_HARM' },
  { label: 'Terrorism', value: 'TERRORISM' },
  { label: 'Doxxing', value: 'DOXXING' },
  { label: 'Copyright', value: 'COPYRIGHT' },
  { label: 'Impersonation', value: 'IMPERSONATION' },
  { label: 'Other', value: 'OTHER' },
] as const;

type ReportReason = typeof REASONS[number]['value'];

type ContentType = 'post' | 'user' | 'comment' | 'message';

const CONTENT_TYPE_FIELD_MAP: Record<ContentType, keyof Pick<CreateReportDto, 'reportedPostId' | 'reportedUserId' | 'reportedCommentId' | 'reportedMessageId'>> = {
  post: 'reportedPostId',
  user: 'reportedUserId',
  comment: 'reportedCommentId',
  message: 'reportedMessageId',
};

// Temporary DTO shape until types are updated
interface CreateReportDto {
  reason: ReportReason;
  description?: string;
  reportedPostId?: string;
  reportedUserId?: string;
  reportedCommentId?: string;
  reportedMessageId?: string;
}

export default function ReportScreen() {
  const params = useLocalSearchParams<{ contentType: string; id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Brief loading state while params resolve
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  const contentType = params.contentType as ContentType;
  const contentId = params.id;

  // Validate content type
  const validContentTypes: ContentType[] = ['post', 'user', 'comment', 'message'];
  const isValidType = validContentTypes.includes(contentType);
  const field = isValidType ? CONTENT_TYPE_FIELD_MAP[contentType] : undefined;

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!selectedReason) throw new Error('Please select a reason');
      if (!contentType || !contentId) throw new Error('Missing content info');
      if (!isValidType || !field) throw new Error('Invalid content type');

      const dto: CreateReportDto = {
        reason: selectedReason,
        description: details.trim() || undefined,
        [field]: contentId,
      };

      return reportsApi.create(dto);
    },
    onSuccess: () => {
      Alert.alert(
        'Report Submitted',
        'Thank you for your report. Our moderation team will review it shortly.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (error: Error) => {
      Alert.alert('Error', error.message);
    },
  });

  const handleSubmit = () => {
    reportMutation.mutate();
  };

  const isValid = selectedReason && contentType && contentId && isValidType;

  return (
    <View style={styles.container}>
      <GlassHeader
        title="Report"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />

      {isLoading ? (
        <View style={{ padding: spacing.base, gap: spacing.lg, paddingTop: insets.top + 52 + spacing.base }}>
          <Skeleton.Text width="70%" />
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Skeleton.Circle size={20} />
              <Skeleton.Rect width={120} height={14} />
            </View>
          ))}
          <Skeleton.Rect width="100%" height={100} borderRadius={radius.md} />
          <Skeleton.Rect width="100%" height={44} borderRadius={radius.md} />
        </View>
      ) : (
      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 52 + spacing.base }]}
      >
        <Text style={styles.prompt}>
          Why are you reporting this {contentType}?
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
          maxLength={1000}
          textAlignVertical="top"
        />
        <View style={styles.charCount}>
          <CharCountRing current={details.length} max={1000} size={24} />
        </View>

        {/* Submit button */}
        <GradientButton
          label={reportMutation.isPending ? 'Submitting...' : 'Submit Report'}
          onPress={handleSubmit}
          disabled={!isValid || reportMutation.isPending}
        />
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
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
    alignItems: 'flex-end',
    marginBottom: spacing.xl,
  },
});