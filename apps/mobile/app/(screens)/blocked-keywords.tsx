import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { settingsApi } from '@/services/api';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import type { BlockedKeyword } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { showToast } from '@/components/ui/Toast';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';

export default function BlockedKeywordsScreen() {
  const router = useRouter();
  const tc = useThemeColors();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const haptic = useContextualHaptic();
  const [newWord, setNewWord] = useState('');

  const [refreshing, setRefreshing] = useState(false);

  const { data: keywords = [], isLoading, isError, refetch } = useQuery<BlockedKeyword[]>({
    queryKey: ['blocked-keywords'],
    queryFn: () => settingsApi.getBlockedKeywords(),
  });

  const addMutation = useMutation({
    mutationFn: (word: string) => settingsApi.addBlockedKeyword(word),
    onSuccess: () => {
      haptic.success();
      showToast({ message: t('screens.blockedKeywords.addSuccess'), variant: 'success' });
      setNewWord('');
      queryClient.invalidateQueries({ queryKey: ['blocked-keywords'] });
    },
    onError: (err: Error) => {
      haptic.error();
      showToast({ message: err.message, variant: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => settingsApi.deleteBlockedKeyword(id),
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ['blocked-keywords'] });
    },
    onError: (err: Error) => {
      haptic.error();
      showToast({ message: err.message, variant: 'error' });
    },
  });

  const handleAdd = useCallback(() => {
    const word = newWord.trim();
    if (!word) return;
    addMutation.mutate(word);
  }, [newWord, addMutation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleDelete = useCallback((id: string, word: string) => {
    haptic.delete();
    Alert.alert(
      t('screens.blockedKeywords.removeAlertTitle'),
      t('screens.blockedKeywords.removeAlertMessage', { word }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('screens.blockedKeywords.removeButton'), style: 'destructive', onPress: () => deleteMutation.mutate(id) },
      ]
    );
  }, [deleteMutation, haptic]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('screens.blockedKeywords.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <EmptyState
          icon="flag"
          title={t('screens.blockedKeywords.errorTitle')}
          subtitle={t('screens.blockedKeywords.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('screens.blockedKeywords.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Text style={[styles.hint, { color: tc.text.secondary }]}>
            {t('screens.blockedKeywords.hint')}
          </Text>

          {/* Add new keyword row */}
          <Animated.View entering={FadeInUp.delay(0).duration(400)}>
            <LinearGradient
              colors={colors.gradient.cardDark}
              style={styles.addRow}
            >
              <LinearGradient
                colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
                style={styles.inputWrap}
              >
                <Icon name="plus" size="sm" color={colors.emerald} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: tc.text.primary }]}
                  placeholder={t('screens.blockedKeywords.placeholder')}
                  placeholderTextColor={tc.text.tertiary}
                  value={newWord}
                  onChangeText={setNewWord}
                  onSubmitEditing={handleAdd}
                  returnKeyType="done"
                  autoCapitalize="none"
                  accessibilityLabel={t('screens.blockedKeywords.addKeywordLabel')}
                  maxLength={50}
                />
              </LinearGradient>
              <Pressable
                onPress={handleAdd}
                disabled={!newWord.trim() || addMutation.isPending}
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                accessibilityLabel={t('screens.blockedKeywords.addKeywordLabel')}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={(!newWord.trim() || addMutation.isPending) ? ['rgba(10,123,79,0.1)', 'rgba(10,123,79,0.05)'] : ['rgba(10,123,79,0.4)', 'rgba(200,150,62,0.2)']}
                  style={[styles.addBtn, (!newWord.trim() || addMutation.isPending) && styles.addBtnDisabled]}
                >
                  <Text style={styles.addBtnText}>{t('screens.blockedKeywords.addButton')}</Text>
                </LinearGradient>
              </Pressable>
            </LinearGradient>
          </Animated.View>

          {/* Keywords list */}
          {isLoading ? (
            <View style={{ padding: spacing.base, gap: spacing.sm }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton.Rect key={i} width="100%" height={44} />
              ))}
            </View>
          ) : (
            <FlatList
              data={keywords}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              removeClippedSubviews={true}
              refreshControl={
                <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
              }
              renderItem={({ item, index }) => (
                <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
                  <LinearGradient
                    colors={colors.gradient.cardDark}
                    style={styles.keywordRow}
                  >
                    <LinearGradient
                      colors={['rgba(248,81,73,0.1)', 'rgba(248,81,73,0.05)']}
                      style={styles.keywordIconBg}
                    >
                      <Icon name="slash" size="xs" color={colors.error} />
                    </LinearGradient>
                    <Text style={[styles.keywordText, { color: tc.text.primary }]}>{item.word}</Text>
                    <Pressable
                      onPress={() => handleDelete(item.id, item.word)}
                      hitSlop={8}
                      disabled={deleteMutation.isPending}
                      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                      accessibilityLabel={t('screens.blockedKeywords.removeKeywordLabel')}
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
                        style={styles.deleteBtnBg}
                      >
                        <Icon name="x" size="sm" color={colors.error} />
                      </LinearGradient>
                    </Pressable>
                  </LinearGradient>
                </Animated.View>
              )}
              ItemSeparatorComponent={() => <View style={styles.divider} />}
              ListEmptyComponent={
                <EmptyState
                  icon="slash"
                  title={t('screens.blockedKeywords.emptyTitle')}
                  subtitle={t('screens.blockedKeywords.emptySubtitle')}
                />
              }
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hint: {
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: spacing.sm,
    lineHeight: 19,
  },
  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.active.white6,
  },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  inputIcon: {
    marginEnd: spacing.xs,
  },
  input: {
    flex: 1, fontSize: fontSize.base,
    paddingVertical: spacing.sm,
  },
  addBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: fontSize.sm },
  keywordRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.active.white6,
  },
  keywordIconBg: {
    width: 28, height: 28, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
    marginEnd: spacing.md,
  },
  keywordText: { fontSize: fontSize.base, flex: 1 },
  deleteBtnBg: {
    width: 28, height: 28, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  divider: { height: 0 },
});
