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
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { reportsApi } from '@/services/api';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

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
    <ScreenErrorBoundary>
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
          <Animated.View entering={FadeInUp.delay(0).duration(400)}>
            <LinearGradient
              colors={['rgba(248,81,73,0.1)', 'rgba(200,150,62,0.05)']}
              style={styles.promptCard}
            >
              <Icon name="flag" size="lg" color={colors.error} />
              <Text style={styles.prompt}>
                Why are you reporting this {contentType}?
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* Reason list */}
          <View style={styles.reasonList}>
            {REASONS.map((reason, index) => (
              <Animated.View key={reason.value} entering={FadeInUp.delay(100 + index * 40).duration(400)}>
                <Pressable
                  style={[styles.reasonItem, selectedReason === reason.value && styles.reasonItemSelected]}
                  onPress={() => setSelectedReason(reason.value)}
                >
                  <LinearGradient
                    colors={selectedReason === reason.value ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : ['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                    style={styles.reasonGradient}
                  >
                    <LinearGradient
                      colors={selectedReason === reason.value ? ['rgba(10,123,79,0.4)', 'rgba(200,150,62,0.2)'] : ['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
                      style={styles.radioOuter}
                    >
                      {selectedReason === reason.value && (
                        <LinearGradient
                          colors={['rgba(10,123,79,0.8)', 'rgba(10,123,79,0.4)']}
                          style={styles.radioInner}
                        />
                      )}
                    </LinearGradient>
                    <Text style={[styles.reasonLabel, selectedReason === reason.value && styles.reasonLabelSelected]}>
                      {reason.label}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            ))}
          </View>

          {/* Additional details */}
          <Animated.View entering={FadeInUp.delay(600).duration(400)}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.detailsCard}
            >
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
            </LinearGradient>
          </Animated.View>

          {/* Submit button */}
          <Animated.View entering={FadeInUp.delay(700).duration(400)}>
            <GradientButton
              label={reportMutation.isPending ? 'Submitting...' : 'Submit Report'}
              onPress={handleSubmit}
              disabled={!isValid || reportMutation.isPending}
            />
          </Animated.View>
        </ScrollView>
        )}
      </View>
  
    </ScreenErrorBoundary>
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
  promptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(248,81,73,0.2)',
    marginBottom: spacing.xl,
  },
  prompt: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    flex: 1,
  },
  reasonList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  reasonItem: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  reasonItemSelected: {
    borderColor: 'rgba(10,123,79,0.3)',
  },
  reasonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  reasonLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    flex: 1,
  },
  reasonLabelSelected: {
    color: colors.emerald,
    fontWeight: '600',
  },
  detailsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.md,
    marginBottom: spacing.xl,
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