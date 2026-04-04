import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, Alert,
} from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabSelector } from '@/components/ui/TabSelector';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { showToast } from '@/components/ui/Toast';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { collabsApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import type { PostCollab, Post, User } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type CollabItem = PostCollab;
interface AcceptedResponse {
  data: CollabItem[];
  meta: { cursor: string | null; hasMore: boolean };
}

type TabKey = 'pending' | 'accepted';

export default function CollabRequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tc = useThemeColors();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const [activeTab, setActiveTab] = useState<TabKey>((params.tab as TabKey) || 'pending');
  const [refreshing, setRefreshing] = useState(false);

  // Pending invites (non‑paginated)
  const pendingQuery = useQuery({
    queryKey: ['collabs', 'pending'],
    queryFn: () => collabsApi.getMyPending(),
    enabled: activeTab === 'pending',
  });

  // Accepted collabs (paginated)
  const acceptedQuery = useInfiniteQuery({
    queryKey: ['collabs', 'accepted'],
    queryFn: ({ pageParam }) => collabsApi.getAccepted(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last?.meta?.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: activeTab === 'accepted',
  });

  const pendingCollabs: CollabItem[] = pendingQuery.data ?? [];
  const acceptedCollabs: CollabItem[] = acceptedQuery.data?.pages.flatMap(p => p.data ?? []) ?? [];

  const acceptMutation = useMutation({
    mutationFn: (collabId: string) => collabsApi.accept(collabId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collabs', 'pending'] });
      queryClient.invalidateQueries({ queryKey: ['collabs', 'accepted'] });
    },
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const declineMutation = useMutation({
    mutationFn: (collabId: string) => collabsApi.decline(collabId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collabs', 'pending'] }),
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const removeMutation = useMutation({
    mutationFn: (collabId: string) => collabsApi.remove(collabId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collabs', 'accepted'] }),
    onError: (err: Error) => showToast({ message: err.message, variant: 'error' }),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'pending') await pendingQuery.refetch();
    else await acceptedQuery.refetch();
    setRefreshing(false);
  };

  const confirmAccept = (collab: CollabItem) => {
    haptic.tick();
    Alert.alert(
      t('collabRequests.acceptAlert.title'),
      t('collabRequests.acceptAlert.message', { postPreview: collab.post?.content?.substring(0, 50) ?? t('collabRequests.thisPost') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('collabRequests.accept'), onPress: () => acceptMutation.mutate(collab.id) },
      ],
    );
  };

  const confirmDecline = (collab: CollabItem) => {
    haptic.delete();
    Alert.alert(
      t('collabRequests.declineAlert.title'),
      t('collabRequests.declineAlert.message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('collabRequests.decline'), onPress: () => declineMutation.mutate(collab.id) },
      ],
    );
  };

  const confirmRemove = (collab: CollabItem) => {
    haptic.delete();
    Alert.alert(
      t('collabRequests.removeAlert.title'),
      t('collabRequests.removeAlert.message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('collabRequests.remove'), onPress: () => removeMutation.mutate(collab.id) },
      ],
    );
  };

  const renderPendingItem = ({ item, index }: { item: CollabItem; index: number }) => {
    const post = item.post;
    if (!post) return null;
    const thumbnail = post.mediaUrls?.[0];
    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 50).duration(400)}>
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.row}
        >
          <Avatar uri={post.user.avatarUrl} name={post.user.displayName} size="md" />
          <View style={styles.info}>
            <View style={styles.userRow}>
              <Text style={[styles.name, { color: tc.text.primary }]}>{post.user.displayName}</Text>
              <Text style={[styles.username, { color: tc.text.secondary }]}>@{post.user.username}</Text>
            </View>
            <View style={styles.postPreview}>
              {thumbnail ? (
                <ProgressiveImage uri={thumbnail} width={50} height={50} borderRadius={radius.sm} />
              ) : (
                <LinearGradient
                  colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
                  style={[styles.thumbnail, styles.noThumbnail]}
                >
                  <Icon name="paperclip" size="sm" color={tc.text.secondary} />
                </LinearGradient>
              )}
              <Text style={[styles.postContent, { color: tc.text.secondary }]} numberOfLines={2}>
                {post.content || t('collabRequests.noCaption')}
              </Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => confirmAccept(item)}
                disabled={acceptMutation.isPending && acceptMutation.variables === item.id}
              >
                <LinearGradient
                  colors={['rgba(10,123,79,0.4)', 'rgba(10,123,79,0.2)']}
                  style={styles.actionBtn}
                >
                  <Text style={styles.actionBtnText}>{t('collabRequests.accept')}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => confirmDecline(item)}
                disabled={declineMutation.isPending && declineMutation.variables === item.id}
              >
                <LinearGradient
                  colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
                  style={styles.actionBtn}
                >
                  <Text style={[styles.actionBtnText, { color: colors.error }]}>{t('collabRequests.decline')}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderAcceptedItem = ({ item, index }: { item: CollabItem; index: number }) => {
    const post = item.post;
    if (!post) return null;
    const thumbnail = post.mediaUrls?.[0];
    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 15) * 50).duration(400)}>
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.row}
        >
          {thumbnail ? (
            <ProgressiveImage uri={thumbnail} width={70} height={70} borderRadius={radius.md} />
          ) : (
            <LinearGradient
              colors={['rgba(10,123,79,0.1)', 'rgba(200,150,62,0.05)']}
              style={[styles.thumbnailLarge, styles.noThumbnail]}
            >
              <Icon name="paperclip" size="md" color={tc.text.secondary} />
            </LinearGradient>
          )}
          <View style={styles.info}>
            <Text style={[styles.postContent, { color: tc.text.secondary }]} numberOfLines={3}>
              {post.content || t('collabRequests.noCaption')}
            </Text>
            <View style={styles.postMeta}>
              <Icon name="user" size="xs" color={tc.text.secondary} />
              <Text style={[styles.metaText, { color: tc.text.tertiary }]}>{t('collabRequests.by')} @{post.user.username}</Text>
              <Text style={[styles.metaDot, { color: tc.text.tertiary }]}>•</Text>
              <Text style={[styles.metaText, { color: tc.text.tertiary }]}>{new Date(post.createdAt).toLocaleDateString()}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              style={styles.removeBtn}
              onPress={() => confirmRemove(item)}
              disabled={removeMutation.isPending && removeMutation.variables === item.id}
            >
              <LinearGradient
                colors={['rgba(248,81,73,0.2)', 'rgba(248,81,73,0.1)']}
                style={styles.removeBtnGradient}
              >
                <Text style={styles.removeBtnText}>{t('collabRequests.remove')}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  const tabs = [
    { key: 'pending', label: t('collabRequests.tab.pending') },
    { key: 'accepted', label: t('collabRequests.tab.accepted') },
  ] as const;

  const isLoading = activeTab === 'pending' ? pendingQuery.isLoading : acceptedQuery.isLoading;
  const isFetchingNextPage = acceptedQuery.isFetchingNextPage;
  const data = activeTab === 'pending' ? pendingCollabs : acceptedCollabs;
  const renderItem = activeTab === 'pending' ? renderPendingItem : renderAcceptedItem;

  const isError = activeTab === 'pending' ? pendingQuery.isError : acceptedQuery.isError;

  const listFooter = useMemo(() =>
    isFetchingNextPage ? (
      <View style={styles.skeletonRow}>
        <Skeleton.Circle size={46} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Skeleton.Rect width={120} height={14} />
          <Skeleton.Rect width={80} height={11} />
        </View>
      </View>
    ) : null
  , [isFetchingNextPage]);

  const listEmpty = useMemo(() => (
    <EmptyState
      icon="users"
      title={activeTab === 'pending' ? t('collabRequests.emptyState.noPendingInvites') : t('collabRequests.emptyState.noAcceptedCollaborations')}
      subtitle={
        activeTab === 'pending'
          ? t('collabRequests.emptyState.pendingSubtitle')
          : t('collabRequests.emptyState.acceptedSubtitle')
      }
    />
  ), [activeTab, t]);

  if (isError) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top']}>
        <GlassHeader
          title={t('collabRequests.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <EmptyState
          icon="flag"
          title={t('common.error.loadContent')}
          subtitle={t('common.error.checkConnection')}
          actionLabel={t('common.retry')}
          onAction={() => activeTab === 'pending' ? pendingQuery.refetch() : acceptedQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={[styles.container, { backgroundColor: tc.bg }]} edges={['top', 'bottom']}>
        <GlassHeader
          title={t('collabRequests.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        <TabSelector
          tabs={tabs}
          activeKey={activeTab}
          onTabChange={(key) => setActiveTab(key as TabKey)}
          variant="underline"
          style={[styles.tabSelector, { marginTop: insets.top + spacing['4xl'] + spacing.xs }]}
        />

        {isLoading ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <View key={i} style={styles.skeletonRow}>
                <Skeleton.Circle size={46} />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Skeleton.Rect width={120} height={14} />
                  <Skeleton.Rect width={80} height={11} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <FlatList
            removeClippedSubviews={true}
            data={data}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            onEndReached={() => {
              if (activeTab === 'accepted' && acceptedQuery.hasNextPage && !isFetchingNextPage) {
                acceptedQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
            refreshControl={
              <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            renderItem={renderItem}
            ListFooterComponent={listFooter}
            ListEmptyComponent={listEmpty}
          />
        )}
      </SafeAreaView>
  
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabSelector: { marginHorizontal: spacing.base, marginTop: spacing.sm },

  list: { paddingBottom: 40, paddingHorizontal: spacing.base, gap: spacing.md },
  skeletonList: { padding: spacing.base, gap: spacing.md, paddingTop: spacing.lg },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    marginBottom: spacing.sm,
  },
  info: { flex: 1, gap: spacing.sm },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: fontSize.sm, fontFamily: fonts.bodyBold },
  username: { fontSize: fontSize.xs, fontFamily: fonts.body, marginTop: 1 },
  postPreview: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumbnail: {
    width: 50, height: 50, borderRadius: radius.sm,
    justifyContent: 'center', alignItems: 'center',
  },
  thumbnailLarge: {
    width: 70, height: 70, borderRadius: radius.md,
    justifyContent: 'center', alignItems: 'center',
  },
  noThumbnail: { borderWidth: 0.5, borderColor: colors.dark.border },
  postContent: {
    fontSize: fontSize.sm, fontFamily: fonts.body, flex: 1,
  },
  postMeta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  metaText: { fontSize: fontSize.xs, fontFamily: fonts.body },
  metaDot: { fontSize: fontSize.xs, marginHorizontal: 2 },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
  removeBtn: {
    alignSelf: 'flex-start',
  },
  removeBtnGradient: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  removeBtnText: {
    color: colors.error,
    fontSize: fontSize.sm,
    fontFamily: fonts.bodySemiBold,
  },
});