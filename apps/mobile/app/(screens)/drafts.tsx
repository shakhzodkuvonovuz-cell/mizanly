import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { colors, spacing, fontSize, radius } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { draftsApi } from '@/services/api';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type DraftItem = {
  id: string;
  space: string;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};


const SPACE_ICONS: Record<string, React.ComponentProps<typeof Icon>['name']> = {
  SAF: 'image',
  MAJLIS: 'message-circle',
  BAKRA: 'play',
  MINBAR: 'video',
};

export default function DraftsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { t } = useTranslation();

  const { data: drafts, isLoading, isError, refetch } = useQuery({
    queryKey: ['drafts'],
    queryFn: () => draftsApi.getAll(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => draftsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drafts'] }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['drafts'] });
    setRefreshing(false);
  }, [queryClient]);

  const handleDelete = (id: string) => {
    Alert.alert(t('screens.drafts.deleteAlertTitle'), t('screens.drafts.deleteAlertMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const handleOpen = (draft: DraftItem) => {
    const screenMap: Record<string, string> = {
      SAF: '/(screens)/create-post',
      MAJLIS: '/(screens)/create-thread',
      BAKRA: '/(screens)/create-reel',
      MINBAR: '/(screens)/create-video',
    };
    const screen = screenMap[draft.space] ?? '/(screens)/create-post';
    router.push({ pathname: screen, params: { draftId: draft.id } } as never);
  };

  const renderDraft = ({ item, index }: { item: DraftItem; index: number }) => {
    const data = item.data as Record<string, string>;
    const preview = data.content ?? data.caption ?? data.title ?? t('screens.drafts.untitledDraft');
    const time = formatDistanceToNowStrict(new Date(item.updatedAt), { addSuffix: true });

    return (
      <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
        <Pressable
          onPress={() => handleOpen(item)}
          accessibilityLabel={t('screens.drafts.draftLabel', { preview })}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={['rgba(45,53,72,0.4)', 'rgba(28,35,51,0.2)']}
            style={styles.draftItem}
          >
            <LinearGradient
              colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
              style={styles.draftIcon}
            >
              <Icon name={SPACE_ICONS[item.space] ?? 'image'} size="sm" color={colors.emerald} />
            </LinearGradient>
            <View style={styles.draftContent}>
              <Text style={styles.draftType}>{t(`screens.drafts.spaceLabels.${item.space}`, { defaultValue: 'Draft' })}</Text>
              <Text style={styles.draftPreview} numberOfLines={2}>{preview}</Text>
              <Text style={styles.draftTime}>{time}</Text>
            </View>
            <Pressable
              style={styles.draftDeleteBtn}
              onPress={() => handleDelete(item.id)}
              hitSlop={8}
              accessibilityLabel={t('screens.drafts.deleteDraftLabel')}
              accessibilityRole="button"
            >
              <LinearGradient
                colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
                style={styles.deleteBtnGradient}
              >
                <Icon name="trash" size="sm" color={colors.error} />
              </LinearGradient>
            </Pressable>
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  };

  if (isError) {
    return (
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.drafts.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="flag"
          title={t('screens.drafts.errorTitle')}
          subtitle={t('screens.drafts.errorSubtitle')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('screens.drafts.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={styles.headerSpacer} />

        {isLoading ? (
          <View style={styles.skeletonWrap}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton.Rect key={i} width="100%" height={80} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />
            ))}
          </View>
        ) : !drafts?.length ? (
          <EmptyState
            icon="layers"
            title={t('screens.drafts.emptyTitle')}
            subtitle={t('screens.drafts.emptySubtitle')}
          />
        ) : (
          <FlatList
            removeClippedSubviews={true}
            data={drafts}
            keyExtractor={(item) => item.id}
            renderItem={renderDraft}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
            }
          />
        )}
      </View>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  headerSpacer: { height: 100 },
  list: { padding: spacing.base },
  skeletonWrap: { padding: spacing.base },
  draftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  draftIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  draftContent: { flex: 1 },
  draftType: {
    color: colors.gold, fontSize: fontSize.xs,
    fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  draftPreview: { color: colors.text.primary, fontSize: fontSize.base, marginTop: 2 },
  draftTime: { color: colors.text.tertiary, fontSize: fontSize.xs, marginTop: 2 },
  draftDeleteBtn: { marginLeft: spacing.sm },
  deleteBtnGradient: {
    width: 32, height: 32, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
});