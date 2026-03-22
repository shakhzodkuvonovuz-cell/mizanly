import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Switch,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { promotionsApi } from '@/services/promotionsApi';

function BrandedContentContent() {
  const router = useRouter();
  const tc = useThemeColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { postId } = useLocalSearchParams<{ postId: string }>();

  const [isPaidPartnership, setIsPaidPartnership] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!postId) return;
    setSaving(true);
    try {
      if (isPaidPartnership && partnerName.trim()) {
        await promotionsApi.markBranded(postId, partnerName.trim());
      } else if (!isPaidPartnership) {
        await promotionsApi.removeBranded(postId);
      }
      Alert.alert(
        t('branded.savedTitle'),
        t('branded.savedMessage'),
        [{ text: t('common.ok'), onPress: () => router.back() }],
      );
    } catch {
      Alert.alert(t('common.error'), t('branded.saveError'));
    } finally {
      setSaving(false);
    }
  }, [postId, isPaidPartnership, partnerName, router, t]);

  if (!postId) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <EmptyState
          icon="slash"
          title={t('branded.noPost')}
          subtitle={t('branded.noPostSub')}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: tc.bg }]}>
      <GlassHeader
        title={t('branded.title')}
        leftAction={{
          icon: 'arrow-left',
          onPress: () => router.back(),
          accessibilityLabel: t('common.back'),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 60 + spacing.base, paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {/* Form screen — no data to refresh */}}
            tintColor={colors.emerald}
          />
        }
      >
        {/* Toggle */}
        <Animated.View entering={FadeInUp.delay(100).duration(400)} style={[styles.toggleCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>{t('branded.paidPartnership')}</Text>
              <Text style={styles.toggleSub}>{t('branded.paidPartnershipSub')}</Text>
            </View>
            <Switch
              value={isPaidPartnership}
              onValueChange={setIsPaidPartnership}
              trackColor={{ false: tc.surface, true: colors.active.emerald20 }}
              thumbColor={isPaidPartnership ? colors.emerald : colors.text.tertiary}
              accessibilityLabel={t('branded.togglePartnership')}
            />
          </View>
        </Animated.View>

        {/* Partner Name Input */}
        {isPaidPartnership && (
          <Animated.View entering={FadeIn.duration(300)} style={[styles.inputCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
            <Text style={styles.inputLabel}>{t('branded.partnerName')}</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: tc.surface, borderColor: tc.border }]}
              value={partnerName}
              onChangeText={setPartnerName}
              placeholder={t('branded.partnerPlaceholder')}
              placeholderTextColor={colors.text.tertiary}
              maxLength={100}
              accessibilityLabel={t('branded.partnerNameLabel')}
            />
          </Animated.View>
        )}

        {/* Preview Card */}
        <Animated.View entering={FadeInUp.delay(200).duration(400)} style={[styles.previewCard, { backgroundColor: tc.bgCard, borderColor: tc.border }]}>
          <Text style={styles.sectionTitle}>{t('branded.preview')}</Text>
          <View style={styles.previewPost}>
            <View style={styles.previewHeader}>
              <View style={[styles.previewAvatar, { backgroundColor: tc.surface }]} />
              <View style={styles.previewNameCol}>
                <Text style={styles.previewName}>{t('branded.yourName')}</Text>
                {isPaidPartnership && partnerName.trim() ? (
                  <View style={styles.partnershipBadge}>
                    <Icon name="check-circle" size="xs" color={colors.text.secondary} />
                    <Text style={styles.partnershipText}>
                      {t('branded.paidPartnershipWith', { partner: partnerName.trim() })}
                    </Text>
                  </View>
                ) : isPaidPartnership ? (
                  <View style={styles.partnershipBadge}>
                    <Icon name="check-circle" size="xs" color={colors.text.secondary} />
                    <Text style={styles.partnershipText}>
                      {t('branded.paidPartnershipLabel')}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={[styles.previewImagePlaceholder, { backgroundColor: tc.surface }]}>
              <Icon name="image" size="xl" color={colors.text.tertiary} />
            </View>
          </View>
        </Animated.View>

        {/* Info Section */}
        <Animated.View entering={FadeInUp.delay(300).duration(400)} style={styles.infoCard}>
          <Icon name="flag" size="md" color={colors.gold} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>{t('branded.disclosureTitle')}</Text>
            <Text style={styles.infoText}>{t('branded.disclosureText')}</Text>
          </View>
        </Animated.View>

        {/* Save Button */}
        <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.buttonWrapper}>
          <GradientButton
            label={t('branded.save')}
            onPress={handleSave}
            loading={saving}
            disabled={isPaidPartnership && !partnerName.trim()}
            fullWidth
            size="lg"
            icon="check"
          />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

export default function BrandedContentScreen() {
  return (
    <ScreenErrorBoundary>
      <BrandedContentContent />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.base,
    gap: spacing.lg,
  },
  toggleCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleInfo: {
    flex: 1,
    marginRight: spacing.base,
    gap: spacing.xs,
  },
  toggleLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  toggleSub: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    lineHeight: 16,
  },
  inputCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
    gap: spacing.sm,
  },
  inputLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
  },
  textInput: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.base,
    color: colors.text.primary,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  previewCard: {
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dark.border,
    padding: spacing.base,
  },
  previewPost: {
    gap: spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewAvatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
  },
  previewNameCol: {
    flex: 1,
    gap: 2,
  },
  previewName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.text.primary,
  },
  partnershipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  partnershipText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  previewImagePlaceholder: {
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.active.gold10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: spacing.base,
  },
  infoContent: {
    flex: 1,
    gap: spacing.xs,
  },
  infoTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.sm,
    color: colors.gold,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  buttonWrapper: {
    marginTop: spacing.sm,
  },
});
