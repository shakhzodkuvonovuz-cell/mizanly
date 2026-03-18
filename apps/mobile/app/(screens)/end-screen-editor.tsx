import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, Alert,
  KeyboardAvoidingView, Platform, ScrollView, RefreshControl,
  Pressable,
, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { CharCountRing } from '@/components/ui/CharCountRing';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { colors, fonts, fontSize, spacing, radius } from '@/theme';
import { videosApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import type { EndScreen } from '@/types';
import type { IconName } from '@/components/ui/Icon';

const MAX_LABEL = 60;
const MAX_ITEMS = 4;

type EndScreenType = 'subscribe' | 'watch_next' | 'playlist' | 'link';
type EndScreenPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center-left' | 'center-right';

interface EndScreenDraft {
  id: string;
  type: EndScreenType;
  targetId: string;
  label: string;
  url: string;
  position: EndScreenPosition;
  showAtSeconds: number;
}

const TYPE_OPTIONS: { type: EndScreenType; icon: IconName; labelKey: string }[] = [
  { type: 'subscribe', icon: 'user', labelKey: 'endScreens.typeSubscribe' },
  { type: 'watch_next', icon: 'play', labelKey: 'endScreens.typeWatchNext' },
  { type: 'playlist', icon: 'layers', labelKey: 'endScreens.typePlaylist' },
  { type: 'link', icon: 'globe', labelKey: 'endScreens.typeLink' },
];

const POSITION_OPTIONS: { value: EndScreenPosition; label: string }[] = [
  { value: 'top-left', label: 'TL' },
  { value: 'top-right', label: 'TR' },
  { value: 'center-left', label: 'CL' },
  { value: 'center-right', label: 'CR' },
  { value: 'bottom-left', label: 'BL' },
  { value: 'bottom-right', label: 'BR' },
];

function createDraft(): EndScreenDraft {
  return {
    id: Date.now().toString(),
    type: 'subscribe',
    targetId: '',
    label: '',
    url: '',
    position: 'bottom-right',
    showAtSeconds: 10,
  };
}

function mapToEndScreenDraft(es: EndScreen): EndScreenDraft {
  return {
    id: es.id,
    type: es.type as EndScreenType,
    targetId: es.targetId ?? '',
    label: es.label,
    url: es.url ?? '',
    position: es.position as EndScreenPosition,
    showAtSeconds: es.showAtSeconds,
  };
}

export default function EndScreenEditorScreen() {
  const router = useRouter();
  const { videoId } = useLocalSearchParams<{ videoId: string }>();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [items, setItems] = useState<EndScreenDraft[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [positionSheetIndex, setPositionSheetIndex] = useState<number | null>(null);

  const {
    isLoading,
    refetch,
  } = useQuery<EndScreen[]>({
    queryKey: ['end-screens', videoId],
    queryFn: () => videosApi.getEndScreens(videoId ?? ''),
    enabled: !!videoId,
    select: (data) => {
      if (!initialized && data) {
        setItems(data.map(mapToEndScreenDraft));
        setInitialized(true);
      }
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      videosApi.setEndScreens(videoId ?? '', items.map((item) => ({
        type: item.type,
        targetId: item.targetId || undefined,
        label: item.label,
        url: item.url || undefined,
        position: item.position,
        showAtSeconds: item.showAtSeconds,
      }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['end-screens', videoId] });
      Alert.alert(t('endScreens.saved'));
      router.back();
    },
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const handleAddItem = useCallback(() => {
    if (items.length >= MAX_ITEMS) return;
    setItems((prev) => [...prev, createDraft()]);
  }, [items.length]);

  const handleRemoveItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateItem = useCallback(<K extends keyof EndScreenDraft>(
    index: number,
    key: K,
    value: EndScreenDraft[K],
  ) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)),
    );
  }, []);

  const handleSave = useCallback(() => {
    const invalid = items.find((item) => !item.label.trim());
    if (invalid) {
      Alert.alert(t('common.error'), t('endScreens.labelRequired'));
      return;
    }
    saveMutation.mutate();
  }, [items, saveMutation, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('endScreens.title')}
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.back'),
          }}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.emerald}
              />
            }
          >
            {isLoading ? (
              <View style={styles.skeletonWrap}>
                <Skeleton.Rect width="100%" height={120} />
                <Skeleton.Rect width="100%" height={120} />
              </View>
            ) : (
              <Animated.View entering={FadeInUp.duration(400)}>
                {/* Info text */}
                <LinearGradient
                  colors={['rgba(10,123,79,0.12)', 'rgba(200,150,62,0.06)']}
                  style={styles.infoCard}
                >
                  <Icon name="layers" size="sm" color={colors.emerald} />
                  <Text style={styles.infoText}>{t('endScreens.info')}</Text>
                </LinearGradient>

                {/* End screen items */}
                {items.map((item, index) => (
                  <Animated.View
                    key={item.id}
                    entering={FadeInUp.delay(index * 80).duration(300)}
                  >
                    <LinearGradient
                      colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
                      style={styles.itemCard}
                    >
                      {/* Header row with delete */}
                      <View style={styles.itemHeader}>
                        <Text style={styles.itemNumber}>
                          {t('endScreens.item')} {index + 1}
                        </Text>
                        <Pressable
                          onPress={() => handleRemoveItem(index)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={t('common.delete')}
                        >
                          <Icon name="trash" size="sm" color={colors.error} />
                        </Pressable>
                      </View>

                      {/* Type selector */}
                      <Text style={styles.fieldLabel}>{t('endScreens.typeLabel')}</Text>
                      <View style={styles.typeRow}>
                        {TYPE_OPTIONS.map((opt) => (
                          <Pressable
                            key={opt.type}
                            onPress={() => handleUpdateItem(index, 'type', opt.type)}
                            style={[
                              styles.typeButton,
                              item.type === opt.type && styles.typeButtonActive,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={t(opt.labelKey)}
                          >
                            <Icon
                              name={opt.icon}
                              size="sm"
                              color={item.type === opt.type ? colors.emerald : colors.text.secondary}
                            />
                            <Text
                              style={[
                                styles.typeButtonText,
                                item.type === opt.type && styles.typeButtonTextActive,
                              ]}
                              numberOfLines={1}
                            >
                              {t(opt.labelKey)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      {/* Label input */}
                      <View style={styles.labelRow}>
                        <Text style={styles.fieldLabel}>{t('endScreens.labelField')}</Text>
                        <CharCountRing current={item.label.length} max={MAX_LABEL} />
                      </View>
                      <TextInput
                        style={styles.textInput}
                        value={item.label}
                        onChangeText={(text) => handleUpdateItem(index, 'label', text)}
                        maxLength={MAX_LABEL}
                        placeholder={t('endScreens.labelPlaceholder')}
                        placeholderTextColor={colors.text.tertiary}
                        accessibilityLabel={t('endScreens.labelField')}
                      />

                      {/* Target ID (for subscribe, watch_next, playlist) */}
                      {item.type !== 'link' && (
                        <>
                          <Text style={styles.fieldLabel}>{t('endScreens.targetId')}</Text>
                          <TextInput
                            style={styles.textInput}
                            value={item.targetId}
                            onChangeText={(text) => handleUpdateItem(index, 'targetId', text)}
                            placeholder={t('endScreens.targetIdPlaceholder')}
                            placeholderTextColor={colors.text.tertiary}
                            accessibilityLabel={t('endScreens.targetId')}
                          />
                        </>
                      )}

                      {/* URL (for link type) */}
                      {item.type === 'link' && (
                        <>
                          <Text style={styles.fieldLabel}>{t('endScreens.url')}</Text>
                          <TextInput
                            style={styles.textInput}
                            value={item.url}
                            onChangeText={(text) => handleUpdateItem(index, 'url', text)}
                            placeholder="https://..."
                            placeholderTextColor={colors.text.tertiary}
                            keyboardType="url"
                            autoCapitalize="none"
                            accessibilityLabel={t('endScreens.url')}
                          />
                        </>
                      )}

                      {/* Position picker */}
                      <Text style={styles.fieldLabel}>{t('endScreens.position')}</Text>
                      <View style={styles.positionGrid}>
                        {POSITION_OPTIONS.map((pos) => (
                          <Pressable
                            key={pos.value}
                            onPress={() => handleUpdateItem(index, 'position', pos.value)}
                            style={[
                              styles.positionCell,
                              item.position === pos.value && styles.positionCellActive,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={pos.label}
                          >
                            <Text
                              style={[
                                styles.positionCellText,
                                item.position === pos.value && styles.positionCellTextActive,
                              ]}
                            >
                              {pos.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>

                      {/* Timing controls */}
                      <Text style={styles.fieldLabel}>
                        {t('endScreens.timing')}: {item.showAtSeconds}s
                      </Text>
                      <View style={styles.timingRow}>
                        <Pressable
                          onPress={() =>
                            handleUpdateItem(
                              index,
                              'showAtSeconds',
                              Math.max(5, item.showAtSeconds - 1),
                            )
                          }
                          style={styles.timingButton}
                          accessibilityRole="button"
                          accessibilityLabel={t('endScreens.decrease')}
                        >
                          <Text style={styles.timingButtonText}>-</Text>
                        </Pressable>
                        <View style={styles.timingBar}>
                          <View
                            style={[
                              styles.timingFill,
                              { width: `${((item.showAtSeconds - 5) / 25) * 100}%` },
                            ]}
                          />
                        </View>
                        <Pressable
                          onPress={() =>
                            handleUpdateItem(
                              index,
                              'showAtSeconds',
                              Math.min(30, item.showAtSeconds + 1),
                            )
                          }
                          style={styles.timingButton}
                          accessibilityRole="button"
                          accessibilityLabel={t('endScreens.increase')}
                        >
                          <Text style={styles.timingButtonText}>+</Text>
                        </Pressable>
                      </View>
                      <Text style={styles.timingHint}>
                        {t('endScreens.timingHint', { seconds: item.showAtSeconds })}
                      </Text>
                    </LinearGradient>
                  </Animated.View>
                ))}

                {/* Add button */}
                {items.length < MAX_ITEMS && (
                  <GradientButton
                    label={t('endScreens.add')}
                    onPress={handleAddItem}
                    variant="secondary"
                    icon="circle-plus"
                    fullWidth
                  />
                )}

                {items.length >= MAX_ITEMS && (
                  <Text style={styles.maxHint}>{t('endScreens.maxReached')}</Text>
                )}

                {/* Empty state */}
                {items.length === 0 && !isLoading && (
                  <View style={styles.emptyWrap}>
                    <EmptyState
                      icon="layers"
                      title={t('endScreens.empty')}
                      subtitle={t('endScreens.emptySubtitle')}
                      actionLabel={t('endScreens.add')}
                      onAction={handleAddItem}
                    />
                  </View>
                )}

                {/* Save button */}
                {items.length > 0 && (
                  <View style={styles.saveWrap}>
                    <GradientButton
                      label={t('endScreens.save')}
                      onPress={handleSave}
                      disabled={saveMutation.isPending}
                      loading={saveMutation.isPending}
                      fullWidth
                      icon="check"
                    />
                  </View>
                )}
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Position picker bottom sheet */}
        <BottomSheet
          visible={positionSheetIndex !== null}
          onClose={() => setPositionSheetIndex(null)}
        >
          {POSITION_OPTIONS.map((pos) => (
            <BottomSheetItem
              key={pos.value}
              label={pos.label}
              icon="map-pin"
              onPress={() => {
                if (positionSheetIndex !== null) {
                  handleUpdateItem(positionSheetIndex, 'position', pos.value);
                }
                setPositionSheetIndex(null);
              }}
            />
          ))}
        </BottomSheet>
      </SafeAreaView>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
  },
  scrollContent: {
    paddingTop: 100,
    paddingHorizontal: spacing.base,
    paddingBottom: 40,
    gap: spacing.md,
  },
  skeletonWrap: {
    gap: spacing.md,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(10,123,79,0.2)',
  },
  infoText: {
    flex: 1,
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  itemCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: spacing.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemNumber: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.base,
    color: colors.text.primary,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeButton: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
    backgroundColor: colors.dark.bgCard,
  },
  typeButtonActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  typeButtonText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  typeButtonTextActive: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textInput: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  positionCell: {
    width: 48,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
    backgroundColor: colors.dark.bgCard,
  },
  positionCellActive: {
    borderColor: colors.emerald,
    backgroundColor: colors.active.emerald10,
  },
  positionCellText: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.secondary,
  },
  positionCellTextActive: {
    color: colors.emerald,
    fontFamily: fonts.bodySemiBold,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timingButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timingButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.text.primary,
  },
  timingBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  timingFill: {
    height: '100%',
    backgroundColor: colors.emerald,
    borderRadius: radius.full,
  },
  timingHint: {
    fontFamily: fonts.body,
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
  },
  maxHint: {
    textAlign: 'center',
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
  },
  emptyWrap: {
    marginTop: spacing.xl,
  },
  saveWrap: {
    marginTop: spacing.md,
  },
});
