import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Alert,
  ScrollView,
, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { postsApi, threadsApi, reelsApi, videosApi, usersApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const REASONS = [
  { labelKey: 'screens.report.reasonSpam', value: 'SPAM' },
  { labelKey: 'screens.report.reasonHarassment', value: 'HARASSMENT' },
  { labelKey: 'screens.report.reasonHateSpeech', value: 'HATE_SPEECH' },
  { labelKey: 'screens.report.reasonNudity', value: 'NUDITY' },
  { labelKey: 'screens.report.reasonViolence', value: 'VIOLENCE' },
  { labelKey: 'screens.report.reasonMisinformation', value: 'MISINFORMATION' },
  { labelKey: 'screens.report.reasonImpersonation', value: 'IMPERSONATION' },
  { labelKey: 'screens.report.reasonOther', value: 'OTHER' },
] as const;

export default function ReportScreen() {
  const params = useLocalSearchParams<{ type: string; id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [details, setDetails] = useState('');

  const reportMutation = useMutation({
    mutationFn: async () => {
      const { type, id } = params;
      const reason = selectedReason;
      if (!reason) throw new Error(t('screens.report.selectReason'));

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
      Alert.alert(t('screens.report.successTitle'), t('screens.report.successMessage'));
      router.back();
    },
    onError: (error: Error) => {
      Alert.alert(t('screens.report.errorTitle'), error.message);
    },
  });

  const handleSubmit = () => {
    reportMutation.mutate();
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.report.title')}
          leftAction={{ 
            icon: 'arrow-left', 
            onPress: () => router.back(),
            accessibilityLabel: 'Go back'
          }}
        />
        <View style={styles.headerSpacer} />

        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
          <Animated.View entering={FadeInUp.delay(0).duration(400)}>
            <LinearGradient
              colors={['rgba(248,81,73,0.1)', 'rgba(200,150,62,0.05)']}
              style={styles.promptCard}
            >
              <Icon name="flag" size="lg" color={colors.error} />
              <Text style={styles.prompt}>
                {t('screens.report.whyReporting', { type: params.type })}
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* Reason list */}
          <View style={styles.reasonList}>
            {REASONS.map((reason, index) => (
              <Animated.View
                key={reason.value}
                entering={FadeInUp.delay(100 + index * 50).duration(400)}
              >
                <Pressable
                  style={[styles.reasonItem, selectedReason === reason.value && styles.reasonItemSelected]}
                  onPress={() => setSelectedReason(reason.value)}
                  accessibilityLabel={t(reason.labelKey)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedReason === reason.value }}
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
                      {t(reason.labelKey)}
                    </Text>
                    {selectedReason === reason.value && (
                      <LinearGradient
                        colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                        style={styles.checkIconBg}
                      >
                        <Icon name="check" size="xs" color={colors.emerald} />
                      </LinearGradient>
                    )}
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            ))}
          </View>

          {/* Additional details */}
          <Animated.View entering={FadeInUp.delay(500).duration(400)}>
            <LinearGradient
              colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
              style={styles.detailsCard}
            >
              <Text style={styles.detailsLabel}>{t('screens.report.additionalDetails')}</Text>
              <TextInput
                style={styles.detailsInput}
                placeholder={t('screens.report.detailsPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                value={details}
                onChangeText={setDetails}
                multiline
                maxLength={500}
                textAlignVertical="top"
                accessibilityLabel={t('screens.report.additionalDetails')}
              />
              <Text style={styles.charCount}>
                {details.length}/500
              </Text>
            </LinearGradient>
          </Animated.View>

          {/* Submit button */}
          <Animated.View entering={FadeInUp.delay(600).duration(400)}>
            <GradientButton
              label={t('screens.report.submitReport')}
              onPress={handleSubmit}
              disabled={!selectedReason}
              loading={reportMutation.isPending}
              fullWidth
              size="lg"
            />
          </Animated.View>
        </ScrollView>
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  headerSpacer: {
    height: 100,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
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
    gap: spacing.sm,
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
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
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
  checkIconBg: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    textAlign: 'right',
  },
});