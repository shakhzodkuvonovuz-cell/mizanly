import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';

const { width } = Dimensions.get('window');

type AppealReason =
  | 'no-violation'
  | 'out-of-context'
  | 'educational'
  | 'posted-by-mistake'
  | 'other';

type AppealStatus = 'submitted' | 'review' | 'decision';

interface AppealHistory {
  id: string;
  number: number;
  submittedDate: string;
  status: AppealStatus;
}

// APPEAL_REASONS moved inside component

const MOCK_HISTORY: AppealHistory = {
  id: '1',
  number: 1,
  submittedDate: 'March 12, 2026',
  status: 'review',
};

export default function AppealModerationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState<AppealReason | null>(null);
  const [details, setDetails] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const APPEAL_REASONS: { id: AppealReason; label: string }[] = [
    { id: 'no-violation', label: t('appealModeration.reason.noViolation') },
    { id: 'out-of-context', label: t('appealModeration.reason.outOfContext') },
    { id: 'educational', label: t('appealModeration.reason.educational') },
    { id: 'posted-by-mistake', label: t('appealModeration.reason.postedByMistake') },
    { id: 'other', label: t('appealModeration.reason.other') },
  ];

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const isSubmitDisabled = !selectedReason || details.length < 50;

  const getStatusBadge = (status: AppealStatus) => {
    switch (status) {
      case 'submitted':
        return { colors: [colors.dark.surface, colors.dark.surface] as [string, string], text: t('appealModeration.status.submitted') };
      case 'review':
        return { colors: [colors.gold, colors.goldLight] as [string, string], text: t('appealModeration.status.underReview') };
      case 'decision':
        return { colors: [colors.emerald, colors.emeraldDark] as [string, string], text: t('appealModeration.status.decisionMade') };
    }
  };

  const getTimelineStyle = (step: AppealStatus) => {
    const statusOrder: AppealStatus[] = ['submitted', 'review', 'decision'];
    const currentIndex = statusOrder.indexOf(MOCK_HISTORY.status);
    const stepIndex = statusOrder.indexOf(step);

    if (stepIndex < currentIndex) {
      return { dot: styles.timelineDotCompleted, line: styles.timelineLineCompleted };
    } else if (stepIndex === currentIndex) {
      return { dot: styles.timelineDotCurrent, line: styles.timelineLineUpcoming };
    } else {
      return { dot: styles.timelineDotUpcoming, line: styles.timelineLineUpcoming };
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader title={t('appealModeration.title')} onBack={() => router.back()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl tintColor={colors.emerald} refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Moderation Action Card */}
        <Animated.View entering={FadeInUp.duration(400)}>
          <LinearGradient
            colors={['rgba(248,81,73,0.15)', 'rgba(248,81,73,0.05)']}
            style={[styles.actionCard, { borderColor: colors.error }]}
          >
            <LinearGradient
              colors={['rgba(248,81,73,0.3)', 'rgba(248,81,73,0.15)']}
              style={styles.actionIconBg}
            >
              <Icon name="flag" size="sm" color={colors.error} />
            </LinearGradient>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>{t('appealModeration.actionTitle')}</Text>
              <Text style={styles.actionReason}>
                {t('appealModeration.actionReason')}
              </Text>
              <View style={styles.actionMeta}>
                <Icon name="clock" size="xs" color={colors.text.tertiary} />
                <Text style={styles.actionDate}>{t('appealModeration.actionDate')}</Text>
              </View>
              <Text style={styles.actionId}>{t('appealModeration.actionId')}</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Content Preview Card */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.sectionMargin}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.contentCard}
          >
            <Text style={styles.contentHeader}>{t('appealModeration.contentHeader')}</Text>

            <View style={styles.contentPreview}>
              <View style={styles.contentTextContainer}>
                <Text style={styles.contentText} numberOfLines={2}>
                  Breaking: New study shows significant benefits of intermittent fasting during Ramadan for metabolic health...
                </Text>
              </View>
              <View style={styles.contentThumbnail}>
                <Icon name="image" size="md" color={colors.text.tertiary} />
              </View>
            </View>

            <TouchableOpacity style={styles.guidelinesLink} activeOpacity={0.8}>
              <Icon name="link" size="xs" color={colors.emerald} />
              <Text style={styles.guidelinesText}>{t('appealModeration.guidelinesText')}</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>

        {/* Appeal Form */}
        <Animated.View entering={FadeInUp.delay(150).duration(400)} style={styles.sectionMargin}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.formCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.formIconBg}
              >
                <Icon name="pencil" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formTitle}>{t('appealModeration.formTitle')}</Text>
            </View>

            {/* Reason Selector */}
            <Text style={styles.reasonLabel}>{t('appealModeration.reasonLabel')}</Text>
            {APPEAL_REASONS.map((reason, index) => (
              <TouchableOpacity
                key={reason.id}
                style={[
                  styles.reasonRow,
                  index < APPEAL_REASONS.length - 1 && styles.reasonRowBorder,
                ]}
                onPress={() => setSelectedReason(reason.id)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.radioCircle,
                    selectedReason === reason.id && styles.radioCircleSelected,
                  ]}
                >
                  {selectedReason === reason.id && (
                    <View style={styles.radioInner} />
                  )}
                </View>
                <Text
                  style={[
                    styles.reasonText,
                    selectedReason === reason.id && styles.reasonTextSelected,
                  ]}
                >
                  {reason.label}
                </Text>
              </TouchableOpacity>
            ))}

            {/* Details Input */}
            <View style={styles.detailsContainer}>
              <LinearGradient
                colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                style={styles.detailsCard}
              >
                <TextInput
                  style={styles.detailsInput}
                  placeholder={t('appealModeration.detailsPlaceholder')}
                  placeholderTextColor={colors.text.tertiary}
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  numberOfLines={5}
                  maxLength={1000}
                  textAlignVertical="top"
                />
                <View style={styles.charCountContainer}>
                  <CharCountRing current={details.length} max={1000} size={28} />
                </View>
              </LinearGradient>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Evidence Section */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.sectionMargin}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.evidenceCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.formIconBg}
              >
                <Icon name="paperclip" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formTitle}>{t('appealModeration.evidenceTitle')}</Text>
            </View>

            <Text style={styles.evidenceLabel}>{t('appealModeration.evidenceLabel')}</Text>

            <View style={styles.evidenceButtons}>
              <TouchableOpacity style={styles.evidenceButton} activeOpacity={0.8}>
                <View style={styles.evidenceButtonInner}>
                  <Icon name="image" size="md" color={colors.emerald} />
                  <Icon name="plus" size="xs" color={colors.gold} style={styles.evidencePlus} />
                  <Text style={styles.evidenceButtonText}>{t('appealModeration.uploadImage')}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.evidenceButton} activeOpacity={0.8}>
                <View style={styles.evidenceButtonInner}>
                  <Icon name="paperclip" size="md" color={colors.emerald} />
                  <Icon name="plus" size="xs" color={colors.gold} style={styles.evidencePlus} />
                  <Text style={styles.evidenceButtonText}>{t('appealModeration.uploadDocument')}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Appeal History */}
        <Animated.View entering={FadeInUp.delay(250).duration(400)} style={styles.sectionMargin}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.historyCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.formIconBg}
              >
                <Icon name="clock" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formTitle}>{t('appealModeration.historyTitle')}</Text>
            </View>

            <View style={styles.historyEntry}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>{t('appealModeration.appealNumber')}{MOCK_HISTORY.number}</Text>
                <LinearGradient
                  colors={getStatusBadge(MOCK_HISTORY.status).colors}
                  style={styles.statusBadge}
                >
                  <Text
                    style={[
                      styles.statusText,
                      MOCK_HISTORY.status === 'review' && { color: colors.dark.bg },
                    ]}
                  >
                    {getStatusBadge(MOCK_HISTORY.status).text}
                  </Text>
                </LinearGradient>
              </View>
              <Text style={styles.historyDate}>{t('appealModeration.submitted')} {MOCK_HISTORY.submittedDate}</Text>

              {/* Timeline */}
              <View style={styles.timeline}>
                {(['submitted', 'review', 'decision'] as AppealStatus[]).map((step, index) => {
                  const styles_result = getTimelineStyle(step);
                  const isLast = index === 2;
                  return (
                    <View key={step} style={styles.timelineItem}>
                      <View style={styles.timelineDotContainer}>
                        <View style={[styles.timelineDotBase, styles_result.dot]}>
                          {step === 'review' && MOCK_HISTORY.status === 'review' && (
                            <LinearGradient
                              colors={[colors.gold, colors.goldLight]}
                              style={styles.timelineDotPulse}
                            />
                          )}
                        </View>
                      </View>
                      {!isLast && <View style={[styles.timelineLine, styles_result.line]} />}
                      <Text
                        style={[
                          styles.timelineLabel,
                          step === MOCK_HISTORY.status && styles.timelineLabelActive,
                        ]}
                      >
                        {step === 'submitted' ? t('appealModeration.status.submitted') : step === 'review' ? t('appealModeration.status.underReview') : t('appealModeration.status.decision')}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Important Notes */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.sectionMargin}>
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.notesCard}
          >
            <View style={styles.formHeader}>
              <LinearGradient
                colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                style={styles.formIconBg}
              >
                <Icon name="check-circle" size="xs" color={colors.emerald} />
              </LinearGradient>
              <Text style={styles.formTitle}>{t('appealModeration.importantNotes')}</Text>
            </View>

            <View style={styles.noteItem}>
              <View style={styles.noteBullet} />
              <Text style={styles.noteText}>{t('appealModeration.note1')}</Text>
            </View>
            <View style={styles.noteItem}>
              <View style={styles.noteBullet} />
              <Text style={styles.noteText}>{t('appealModeration.note2')}</Text>
            </View>
            <View style={styles.noteItem}>
              <View style={styles.noteBullet} />
              <Text style={styles.noteText}>{t('appealModeration.note3')}</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={isSubmitDisabled} activeOpacity={0.8}>
          <LinearGradient
            colors={isSubmitDisabled ? ['rgba(45,53,72,0.6)', 'rgba(28,35,51,0.4)'] : [colors.emerald, colors.emeraldDark]}
            style={[styles.submitButton, isSubmitDisabled && styles.submitButtonDisabled]}
          >
            <Text style={[styles.submitText, isSubmitDisabled && styles.submitTextDisabled]}>
              {t('appealModeration.submitAppeal')}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollContent: {
    padding: spacing.base,
  },
  actionCard: {
    flexDirection: 'row',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  actionIconBg: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  actionTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  actionReason: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  actionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  actionDate: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
  },
  actionId: {
    fontSize: fontSize.xs,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
  },
  sectionMargin: {
    marginTop: spacing.md,
  },
  contentCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  contentHeader: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  contentPreview: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  contentTextContainer: {
    flex: 1,
  },
  contentText: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  contentThumbnail: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guidelinesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  guidelinesText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.emerald,
  },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  formIconBg: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formTitle: {
    fontSize: fontSize.md,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  reasonLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  reasonRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.dark.surface,
    backgroundColor: colors.dark.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  radioCircleSelected: {
    borderColor: colors.emerald,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
  },
  reasonText: {
    flex: 1,
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
  },
  reasonTextSelected: {
    color: colors.text.primary,
    fontFamily: fonts.medium,
  },
  detailsContainer: {
    marginTop: spacing.lg,
  },
  detailsCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.sm,
  },
  detailsInput: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.primary,
    minHeight: 100,
  },
  charCountContainer: {
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  evidenceCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  evidenceLabel: {
    fontSize: fontSize.base,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  evidenceButtons: {
    flexDirection: 'row',
    gap: spacing.base,
  },
  evidenceButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    backgroundColor: 'transparent',
  },
  evidenceButtonInner: {
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    position: 'relative',
  },
  evidencePlus: {
    position: 'absolute',
    top: '40%',
    right: '35%',
  },
  evidenceButtonText: {
    fontSize: fontSize.sm,
    fontFamily: fonts.medium,
    color: colors.emerald,
    marginTop: spacing.xs,
  },
  historyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  historyEntry: {
    marginTop: spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  historyDate: {
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  timeline: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  timelineItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  timelineDotContainer: {
    position: 'relative',
    zIndex: 2,
  },
  timelineDotBase: {
    width: 16,
    height: 16,
    borderRadius: radius.full,
  },
  timelineDotCompleted: {
    backgroundColor: colors.emerald,
  },
  timelineDotCurrent: {
    backgroundColor: colors.gold,
  },
  timelineDotUpcoming: {
    backgroundColor: colors.dark.surface,
  },
  timelineDotPulse: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: radius.full,
    opacity: 0.3,
  },
  timelineLine: {
    position: 'absolute',
    top: 7,
    left: '50%',
    right: '-50%',
    height: 2,
    zIndex: 1,
  },
  timelineLineCompleted: {
    backgroundColor: colors.emerald,
  },
  timelineLineUpcoming: {
    backgroundColor: colors.dark.surface,
  },
  timelineLabel: {
    fontSize: fontSize.xs,
    fontFamily: fonts.medium,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
  timelineLabelActive: {
    color: colors.text.primary,
  },
  notesCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: spacing.base,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  noteBullet: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.emerald,
    marginTop: 6,
    marginRight: spacing.sm,
  },
  noteText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
  },
  bottomSpacer: {
    height: 100,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.base,
    backgroundColor: colors.dark.bg,
    borderTopWidth: 1,
    borderTopColor: colors.dark.border,
  },
  cancelText: {
    fontSize: fontSize.base,
    fontFamily: fonts.medium,
    color: colors.text.secondary,
    padding: spacing.sm,
  },
  submitButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: fontSize.base,
    fontFamily: fonts.semibold,
    color: colors.text.primary,
  },
  submitTextDisabled: {
    color: colors.text.tertiary,
  },
});
