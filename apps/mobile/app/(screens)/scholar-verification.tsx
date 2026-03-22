import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import { colors, spacing, radius, fontSize, fonts } from '@/theme';
import { useHaptic } from '@/hooks/useHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { islamicApi } from '@/services/islamicApi';
import type { ScholarVerification } from '@/types/islamic';

type Specialization = 'fiqh' | 'hadith' | 'tafsir' | 'aqeedah' | 'general';
type Madhab = 'hanafi' | 'maliki' | 'shafii' | 'hanbali';

const SPECIALIZATIONS: { key: Specialization; label: string }[] = [
  { key: 'fiqh', label: 'Fiqh' },
  { key: 'hadith', label: 'Hadith' },
  { key: 'tafsir', label: 'Tafsir' },
  { key: 'aqeedah', label: 'Aqeedah' },
  { key: 'general', label: 'General' },
];

const MADHABS: { key: Madhab; label: string }[] = [
  { key: 'hanafi', label: 'Hanafi' },
  { key: 'maliki', label: 'Maliki' },
  { key: 'shafii', label: 'Shafii' },
  { key: 'hanbali', label: 'Hanbali' },
];

function StatusTracker({ status }: { status: string }) {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const steps = [
    { key: 'pending', label: t('scholar.pending') },
    { key: 'under_review', label: t('scholar.status') },
    { key: 'approved', label: t('scholar.approved') },
  ];

  const getStepState = (stepKey: string) => {
    if (status === 'rejected') {
      if (stepKey === 'pending') return 'done';
      if (stepKey === 'under_review') return 'done';
      if (stepKey === 'approved') return 'rejected';
    }
    if (status === 'approved') return 'done';
    if (status === 'under_review') {
      if (stepKey === 'pending') return 'done';
      if (stepKey === 'under_review') return 'active';
      return 'pending';
    }
    // pending
    if (stepKey === 'pending') return 'active';
    return 'pending';
  };

  return (
    <View style={styles.statusTracker}>
      {steps.map((step, index) => {
        const state = getStepState(step.key);
        const isRejected = step.key === 'approved' && status === 'rejected';
        return (
          <View key={step.key} style={styles.statusStep}>
            <View style={styles.statusDotRow}>
              {index > 0 && (
                <View
                  style={[
                    styles.statusLine,
                    state === 'done' || state === 'active'
                      ? styles.statusLineDone
                      : isRejected
                        ? styles.statusLineRejected
                        : styles.statusLinePending,
                  ]}
                />
              )}
              <View
                style={[
                  styles.statusDot,
                  state === 'done'
                    ? styles.statusDotDone
                    : state === 'active'
                      ? styles.statusDotActive
                      : isRejected
                        ? styles.statusDotRejected
                        : styles.statusDotPending,
                ]}
              >
                {state === 'done' && (
                  <Icon name="check" size={12} color="#FFFFFF" />
                )}
                {isRejected && (
                  <Icon name="x" size={12} color="#FFFFFF" />
                )}
              </View>
            </View>
            <Text
              style={[
                styles.statusLabel,
                isRejected && { color: colors.error },
                state === 'active' && { color: colors.gold },
              ]}
            >
              {isRejected ? t('scholar.rejected') : step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ScholarVerificationContent() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const router = useRouter();
  const haptic = useHaptic();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<ScholarVerification | null>(null);

  const [institution, setInstitution] = useState('');
  const [specialization, setSpecialization] = useState<Specialization | undefined>();
  const [madhab, setMadhab] = useState<Madhab | undefined>();
  const [documentUrls, setDocumentUrls] = useState<string[]>([]);

  const [specSheetVisible, setSpecSheetVisible] = useState(false);
  const [madhabSheetVisible, setMadhabSheetVisible] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await islamicApi.getScholarVerificationStatus();
      setVerification(res ?? null);
    } catch {
      // no existing application
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  }, [fetchStatus]);

  const handleAddDocument = useCallback(async () => {
    // TODO: Replace with expo-document-picker when installed:
    // const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'] });
    // Then upload via presigned R2 URL and use real URL.
    // For now, alert user that document upload requires the file picker dependency.
    Alert.alert(
      t('scholar.addDocument'),
      t('scholar.documentUploadPlaceholder'),
    );
    haptic.light();
  }, [haptic, t]);

  const handleRemoveDocument = useCallback((index: number) => {
    setDocumentUrls(prev => prev.filter((_, i) => i !== index));
    haptic.light();
  }, [haptic]);

  const handleSubmit = useCallback(async () => {
    if (!institution.trim()) {
      Alert.alert(t('common.error'), t('scholar.institution'));
      return;
    }
    if (documentUrls.length === 0) {
      Alert.alert(t('common.error'), t('scholar.documents'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await islamicApi.applyScholarVerification({
        institution: institution.trim(),
        specialization,
        madhab,
        documentUrls,
      });
      setVerification(res ?? null);
      haptic.success();
    } catch {
      Alert.alert(t('common.error'), t('scholar.alreadyApplied'));
    } finally {
      setSubmitting(false);
    }
  }, [institution, specialization, madhab, documentUrls, t, haptic]);

  if (loading) {
    return (
      <View style={styles.skeletonContainer}>
        <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
        <View style={{ height: spacing.md }} />
        <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
        <View style={{ height: spacing.md }} />
        <Skeleton.Rect width="100%" height={48} borderRadius={radius.md} />
        <View style={{ height: spacing.md }} />
        <Skeleton.Rect width="100%" height={120} borderRadius={radius.md} />
      </View>
    );
  }

  // Already applied — show status
  if (verification) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.emerald}
          />
        }
      >
        <Animated.View entering={FadeInUp.duration(400)} style={styles.statusCard}>
          <LinearGradient
            colors={[tc.bgCard, tc.bgSheet]}
            style={styles.cardGradient}
          >
            <Text style={styles.sectionTitle}>{t('scholar.status')}</Text>
            <StatusTracker status={verification.status} />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('scholar.institution')}</Text>
              <Text style={styles.infoValue}>{verification.institution}</Text>
            </View>

            {verification.specialization && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('scholar.specialization')}</Text>
                <Text style={styles.infoValue}>{verification.specialization}</Text>
              </View>
            )}

            {verification.madhab && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('scholar.madhab')}</Text>
                <Text style={styles.infoValue}>{verification.madhab}</Text>
              </View>
            )}
          </LinearGradient>
        </Animated.View>

        {verification.status === 'approved' && (
          <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.badgePreviewCard}>
            <LinearGradient
              colors={['rgba(200, 150, 62, 0.15)', 'rgba(200, 150, 62, 0.05)']}
              style={styles.cardGradient}
            >
              <Text style={styles.sectionTitle}>{t('scholar.badgePreview')}</Text>
              <View style={styles.badgePreviewRow}>
                <VerifiedBadge size={48} variant="scholar" />
                <View style={styles.badgePreviewText}>
                  <Text style={styles.badgePreviewName}>
                    {t('scholar.title')}
                  </Text>
                  <View style={styles.badgeInline}>
                    <Text style={styles.badgePreviewDesc}>
                      {t('scholar.displayedOnProfile')}
                    </Text>
                    <VerifiedBadge size={16} variant="scholar" />
                  </View>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        )}
      </ScrollView>
    );
  }

  // Application form
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.emerald}
        />
      }
    >
      {/* Institution */}
      <Animated.View entering={FadeInUp.duration(400)} style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{t('scholar.institution')}</Text>
        <TextInput
          style={styles.textInput}
          value={institution}
          onChangeText={setInstitution}
          placeholder={t('scholar.institution')}
          placeholderTextColor={colors.text.tertiary}
          maxLength={200}
        />
      </Animated.View>

      {/* Specialization */}
      <Animated.View entering={FadeInUp.delay(100).duration(400)} style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{t('scholar.specialization')}</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.pickerButton}
          onPress={() => setSpecSheetVisible(true)}
         
        >
          <Text style={[styles.pickerText, !specialization && styles.pickerPlaceholder]}>
            {specialization
              ? SPECIALIZATIONS.find(s => s.key === specialization)?.label
              : t('scholar.specialization')}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.text.secondary} />
        </Pressable>
      </Animated.View>

      {/* Madhab */}
      <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{t('scholar.madhab')}</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.pickerButton}
          onPress={() => setMadhabSheetVisible(true)}
         
        >
          <Text style={[styles.pickerText, !madhab && styles.pickerPlaceholder]}>
            {madhab
              ? MADHABS.find(m => m.key === madhab)?.label
              : t('scholar.madhab')}
          </Text>
          <Icon name="chevron-down" size={18} color={colors.text.secondary} />
        </Pressable>
      </Animated.View>

      {/* Documents */}
      <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>{t('scholar.documents')}</Text>

        {documentUrls.map((url, index) => (
          <View key={index} style={styles.documentRow}>
            <Icon name="paperclip" size={18} color={colors.emerald} />
            <Text style={styles.documentText} numberOfLines={1}>
              {url.split('/').pop()}
            </Text>
            <Pressable onPress={() => handleRemoveDocument(index)}>
              <Icon name="x" size={16} color={colors.error} />
            </Pressable>
          </View>
        ))}

        <Pressable style={styles.addDocButton} onPress={handleAddDocument}>
          <Icon name="plus" size={18} color={colors.emerald} />
          <Text style={styles.addDocText}>{t('scholar.addDocument')}</Text>
        </Pressable>
      </Animated.View>

      {/* Submit */}
      <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.submitContainer}>
        <GradientButton
          label={t('scholar.apply')}
          onPress={handleSubmit}
          loading={submitting}
          disabled={!institution.trim() || documentUrls.length === 0}
          fullWidth
          icon="send"
        />
      </Animated.View>

      {/* Specialization BottomSheet */}
      <BottomSheet visible={specSheetVisible} onClose={() => setSpecSheetVisible(false)}>
        {SPECIALIZATIONS.map(spec => (
          <BottomSheetItem
            key={spec.key}
            label={spec.label}
            icon={<Icon name="book-open" size="sm" color={colors.text.primary} />}
            onPress={() => {
              setSpecialization(spec.key);
              setSpecSheetVisible(false);
              haptic.light();
            }}
          />
        ))}
      </BottomSheet>

      {/* Madhab BottomSheet */}
      <BottomSheet visible={madhabSheetVisible} onClose={() => setMadhabSheetVisible(false)}>
        {MADHABS.map(m => (
          <BottomSheetItem
            key={m.key}
            label={m.label}
            icon={<Icon name="book-open" size="sm" color={colors.text.primary} />}
            onPress={() => {
              setMadhab(m.key);
              setMadhabSheetVisible(false);
              haptic.light();
            }}
          />
        ))}
      </BottomSheet>
    </ScrollView>
  );
}

export default function ScholarVerificationScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <GlassHeader title={t('scholar.title')} showBack />
        <ScholarVerificationContent />
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  skeletonContainer: {
    padding: spacing.lg,
  },
  fieldContainer: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  textInput: {
    backgroundColor: tc.bgCard,
    borderWidth: 1,
    borderColor: tc.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.text.primary,
    fontFamily: fonts.body,
    fontSize: fontSize.base,
  },
  pickerButton: {
    backgroundColor: tc.bgCard,
    borderWidth: 1,
    borderColor: tc.border,
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerText: {
    fontFamily: fonts.body,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  pickerPlaceholder: {
    color: colors.text.tertiary,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tc.bgCard,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  documentText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  addDocButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.active.emerald10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.emerald,
    borderStyle: 'dashed',
    padding: spacing.md,
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  addDocText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.emerald,
  },
  submitContainer: {
    marginTop: spacing.md,
  },
  // Status view styles
  statusCard: {
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  cardGradient: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: tc.border,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.lg,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  statusTracker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  statusStep: {
    alignItems: 'center',
    flex: 1,
  },
  statusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusLine: {
    height: 2,
    width: 40,
    marginRight: spacing.xs,
  },
  statusLineDone: {
    backgroundColor: colors.emerald,
  },
  statusLinePending: {
    backgroundColor: tc.surface,
  },
  statusLineRejected: {
    backgroundColor: colors.error,
  },
  statusDot: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotDone: {
    backgroundColor: colors.emerald,
  },
  statusDotActive: {
    backgroundColor: colors.gold,
  },
  statusDotPending: {
    backgroundColor: tc.surface,
  },
  statusDotRejected: {
    backgroundColor: colors.error,
  },
  statusLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: tc.border,
  },
  infoLabel: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  infoValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
    textTransform: 'capitalize',
  },
  // Badge preview
  badgePreviewCard: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  badgePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  badgePreviewText: {
    flex: 1,
  },
  badgePreviewName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.gold,
    marginBottom: spacing.xs,
  },
  badgePreviewDesc: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginRight: spacing.xs,
  },
  badgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
