import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
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
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { reportsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';

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
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const haptic = useContextualHaptic();
  const params = useLocalSearchParams<{ contentType: string; id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const isNavigatingRef = useRef(false);

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
      haptic.success();
      showToast({ message: t('screens.reports-detail.successMessage'), variant: 'success' });
      router.back();
    },
    onError: (error: Error) => {
      haptic.error();
      showToast({ message: error.message || t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const handleSubmit = useCallback(() => {
    if (reportMutation.isPending) return;
    haptic.delete();
    Alert.alert(
      t('screens.reports-detail.confirmTitle', 'Submit Report'),
      t('screens.reports-detail.confirmMessage', 'Are you sure you want to submit this report?'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('screens.reports-detail.submitReport'),
          style: 'destructive',
          onPress: () => reportMutation.mutate(),
        },
      ],
    );
  }, [reportMutation, haptic, t]);

  const isValid = selectedReason && contentType && contentId && isValidType;

  return (
    <ScreenErrorBoundary>
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('screens.reports-detail.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
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
              <Text style={[styles.prompt, { color: tc.text.primary }]}>
                {t('screens.report.whyReporting', { type: contentType })}
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* Reason list */}
          <View style={styles.reasonList}>
            {REASONS.map((reason, index) => (
              <Animated.View key={reason.value} entering={FadeInUp.delay(100 + index * 40).duration(400)}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.reasonItem, selectedReason === reason.value && styles.reasonItemSelected, pressed && { opacity: 0.7 }]}
                  onPress={() => { haptic.tick(); setSelectedReason(reason.value); }}
                >
                  <LinearGradient
                    colors={selectedReason === reason.value ? ['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)'] : colors.gradient.cardDark}
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
                    <Text style={[styles.reasonLabel, { color: tc.text.primary }, selectedReason === reason.value && styles.reasonLabelSelected]}>
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
              colors={colors.gradient.cardDark}
              style={styles.detailsCard}
            >
              <Text style={[styles.detailsLabel, { color: tc.text.primary }]}>{t('screens.reports-detail.additionalDetails', 'Additional Details')}</Text>
              <TextInput
                style={[styles.detailsInput, { color: tc.text.primary, backgroundColor: tc.bgElevated, borderColor: tc.border }]}
                placeholder={t('screens.reports-detail.detailsPlaceholder')}
                placeholderTextColor={tc.text.tertiary}
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
              label={reportMutation.isPending ? t('screens.reports-detail.submitting') : t('screens.reports-detail.submitReport')}
              onPress={handleSubmit}
              disabled={!isValid || reportMutation.isPending}
            />
          </Animated.View>
        </ScrollView>
        </KeyboardAvoidingView>
      </View>

    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
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
    fontSize: fontSize.lg,
    fontFamily: fonts.bodyBold,
    flex: 1,
  },
  reasonList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  reasonItem: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    overflow: 'hidden',
  },
  reasonItemSelected: {
    borderColor: colors.active.emerald30,
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
    fontSize: fontSize.base,
    fontFamily: fonts.body,
    flex: 1,
  },
  reasonLabelSelected: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  detailsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  detailsLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.bodySemiBold,
    marginBottom: spacing.sm,
  },
  detailsInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: fontSize.base,
    fontFamily: fonts.body,
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