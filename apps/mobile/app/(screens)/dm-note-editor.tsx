import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, Alert,
  KeyboardAvoidingView, Platform, ScrollView, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
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
import { colors, spacing, fontSize, radius } from '@/theme';
import { messagesApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { DMNote } from '@/types';

const MAX_LENGTH = 60;

const EXPIRY_OPTIONS = [
  { key: '1h', hours: 1 },
  { key: '4h', hours: 4 },
  { key: '12h', hours: 12 },
  { key: '24h', hours: 24 },
  { key: '48h', hours: 48 },
  { key: '72h', hours: 72 },
] as const;

export default function DMNoteEditorScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [content, setContent] = useState('');
  const [expiryHours, setExpiryHours] = useState(24);
  const [expirySheetVisible, setExpirySheetVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const tc = useThemeColors();

  const {
    data: existingNote,
    isLoading,
    refetch,
  } = useQuery<DMNote | null>({
    queryKey: ['dm-note', 'me'],
    queryFn: () => messagesApi.getMyDMNote(),
  });

  // Hydrate content from existing note on initial load
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (existingNote && !hydrated) {
      setContent(existingNote.content);
      setHydrated(true);
    }
  }, [existingNote, hydrated]);

  const createMutation = useMutation({
    mutationFn: () => messagesApi.createDMNote(content.trim(), expiryHours),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dm-note'] });
      Alert.alert(t('dmNotes.posted'));
    },
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => messagesApi.deleteDMNote(),
    onSuccess: () => {
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['dm-note'] });
      Alert.alert(t('dmNotes.deleted'));
    },
    onError: (err: Error) => Alert.alert(t('common.error'), err.message),
  });

  const handlePost = useCallback(() => {
    if (!content.trim()) return;
    createMutation.mutate();
  }, [content, createMutation]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t('dmNotes.delete'),
      t('dmNotes.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate() },
      ],
    );
  }, [deleteMutation, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const selectedExpiryLabel = t(
    `dmNotes.expiryOptions.${EXPIRY_OPTIONS.find((o) => o.hours === expiryHours)?.key ?? '24h'}`,
  );

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('dmNotes.title')}
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
                <Skeleton.Rect width="60%" height={40} />
                <Skeleton.Rect width="100%" height={48} />
              </View>
            ) : (
              <Animated.View entering={FadeInUp.duration(400)}>
                {/* Input area */}
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.inputCard}
                >
                  <View style={styles.inputHeader}>
                    <Icon name="edit" size="sm" color={colors.emerald} />
                    <Text style={styles.inputLabel}>{t('dmNotes.placeholder')}</Text>
                    <CharCountRing current={content.length} max={MAX_LENGTH} />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={content}
                    onChangeText={setContent}
                    maxLength={MAX_LENGTH}
                    multiline
                    placeholder={t('dmNotes.placeholder')}
                    placeholderTextColor={colors.text.tertiary}
                    accessibilityLabel={t('dmNotes.placeholder')}
                  />
                </LinearGradient>

                {/* Expiry picker trigger */}
                <LinearGradient
                  colors={colors.gradient.cardDark}
                  style={styles.expiryCard}
                >
                  <View style={styles.expiryRow}>
                    <Icon name="clock" size="sm" color={colors.gold} />
                    <Text style={styles.expiryLabel}>{t('dmNotes.expiry')}</Text>
                    <View style={{ flex: 1 }} />
                    <GradientButton
                      label={selectedExpiryLabel}
                      onPress={() => setExpirySheetVisible(true)}
                      variant="secondary"
                      size="sm"
                      icon="chevron-down"
                    />
                  </View>
                </LinearGradient>

                {/* Preview */}
                {content.trim().length > 0 && (
                  <Animated.View entering={FadeInUp.delay(100).duration(300)}>
                    <LinearGradient
                      colors={['rgba(10,123,79,0.15)', 'rgba(200,150,62,0.08)']}
                      style={styles.previewCard}
                    >
                      <Text style={styles.previewTitle}>{t('dmNotes.preview')}</Text>
                      <LinearGradient
                        colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
                        style={styles.previewBubble}
                      >
                        <Text style={styles.previewText}>{content.trim()}</Text>
                      </LinearGradient>
                    </LinearGradient>
                  </Animated.View>
                )}

                {/* Action buttons */}
                <View style={styles.actions}>
                  <GradientButton
                    label={existingNote ? t('dmNotes.update') : t('dmNotes.post')}
                    onPress={handlePost}
                    disabled={!content.trim() || createMutation.isPending}
                    loading={createMutation.isPending}
                    fullWidth
                    icon="send"
                  />

                  {existingNote && (
                    <GradientButton
                      label={t('dmNotes.delete')}
                      onPress={handleDelete}
                      variant="ghost"
                      disabled={deleteMutation.isPending}
                      loading={deleteMutation.isPending}
                      fullWidth
                      icon="trash"
                    />
                  )}
                </View>

                {/* Current note info */}
                {existingNote && (
                  <LinearGradient
                    colors={['rgba(45,53,72,0.3)', 'rgba(28,35,51,0.15)']}
                    style={styles.currentNoteCard}
                  >
                    <Icon name="check-circle" size="sm" color={colors.text.secondary} />
                    <Text style={styles.currentNoteText}>
                      {t('dmNotes.currentNote')}
                    </Text>
                  </LinearGradient>
                )}

                {!existingNote && !isLoading && (
                  <View style={styles.emptyWrap}>
                    <EmptyState
                      icon="edit"
                      title={t('dmNotes.noNote')}
                    />
                  </View>
                )}
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Expiry picker bottom sheet */}
        <BottomSheet
          visible={expirySheetVisible}
          onClose={() => setExpirySheetVisible(false)}
        >
          {EXPIRY_OPTIONS.map((option) => (
            <BottomSheetItem
              key={option.key}
              label={t(`dmNotes.expiryOptions.${option.key}`)}
              icon={option.hours === expiryHours ? 'check-circle' : 'clock'}
              onPress={() => {
                setExpiryHours(option.hours);
                setExpirySheetVisible(false);
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
  inputCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  inputLabel: {
    flex: 1,
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  textInput: {
    color: colors.text.primary,
    fontSize: fontSize.lg,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  expiryCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  expiryLabel: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  previewCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.emerald20,
  },
  previewTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  previewBubble: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  previewText: {
    color: colors.text.primary,
    fontSize: fontSize.base,
  },
  actions: {
    gap: spacing.sm,
  },
  currentNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
  },
  currentNoteText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  emptyWrap: {
    marginTop: spacing.xl,
  },
});
