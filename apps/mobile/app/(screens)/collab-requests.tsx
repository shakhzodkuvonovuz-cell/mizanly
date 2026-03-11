import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
  FlatList, ActivityIndicator, Alert, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabSelector } from '@/components/ui/TabSelector';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { GradientButton } from '@/components/ui/GradientButton';
import { colors, spacing, fontSize, radius } from '@/theme';
import { collabsApi } from '@/services/api';
import type { PostCollab, Post, User } from '@/types';

type CollabItem = PostCollab & { post: Post };
interface AcceptedResponse {
  data: CollabItem[];
  meta: { cursor: string | null; hasMore: boolean };
}

type TabKey = 'pending' | 'accepted';

export default function CollabRequestsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [refreshing, setRefreshing] = useState(false);

  // Pending invites (non‑paginated)
  const pendingQuery = useQuery({
    queryKey: ['collabs', 'pending'],
    queryFn: () => collabsApi.getPending(),
    enabled: activeTab === 'pending',
  });

  // Accepted collabs (paginated)
  const acceptedQuery = useInfiniteQuery({
    queryKey: ['collabs', 'accepted'],
    queryFn: ({ pageParam }) => collabsApi.getAccepted(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: AcceptedResponse) => last.meta?.hasMore ? last.meta.cursor : undefined,
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
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const declineMutation = useMutation({
    mutationFn: (collabId: string) => collabsApi.decline(collabId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collabs', 'pending'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (collabId: string) => collabsApi.remove(collabId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collabs', 'accepted'] }),
    onError: (err: Error) => Alert.alert('Error', err.message),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'pending') await pendingQuery.refetch();
    else await acceptedQuery.refetch();
    setRefreshing(false);
  };

  const confirmAccept = (collab: CollabItem) => {
    Alert.alert(
      'Accept collaboration?',
      `You'll be added as a collaborator to "${collab.post.content?.substring(0, 50) ?? 'this post'}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Accept', onPress: () => acceptMutation.mutate(collab.id) },
      ],
    );
  };

  const confirmDecline = (collab: CollabItem) => {
    Alert.alert(
      'Decline invitation?',
      'The post owner will be notified.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', onPress: () => declineMutation.mutate(collab.id) },
      ],
    );
  };

  const confirmRemove = (collab: CollabItem) => {
    Alert.alert(
      'Remove collaboration?',
      'You will no longer be listed as a collaborator on this post.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', onPress: () => removeMutation.mutate(collab.id) },
      ],
    );
  };

  const renderPendingItem = ({ item }: { item: CollabItem }) => {
    const post = item.post;
    const thumbnail = post.mediaUrls?.[0];
    return (
      <View style={styles.row}>
        <Avatar uri={post.user.avatarUrl} name={post.user.displayName} size="md" />
        <View style={styles.info}>
          <View style={styles.userRow}>
            <Text style={styles.name}>{post.user.displayName}</Text>
            <Text style={styles.username}>@{post.user.username}</Text>
          </View>
          <View style={styles.postPreview}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={styles.thumbnail} resizeMode="cover" />
            ) : (
              <View style={[styles.thumbnail, styles.noThumbnail]}>
                <Icon name="paperclip" size="sm" color={colors.text.secondary} />
              </View>
            )}
            <Text style={styles.postContent} numberOfLines={2}>
              {post.content || 'No caption'}
            </Text>
          </View>
          <View style={styles.actionRow}>
            <GradientButton
              label={acceptMutation.isPending && acceptMutation.variables === item.id ? '…' : 'Accept'}
              onPress={() => confirmAccept(item)}
              disabled={acceptMutation.isPending && acceptMutation.variables === item.id}
            />
            <GradientButton
              label={declineMutation.isPending && declineMutation.variables === item.id ? '…' : 'Decline'}
              onPress={() => confirmDecline(item)}
              variant="secondary"
              disabled={declineMutation.isPending && declineMutation.variables === item.id}
            />
          </View>
        </View>
      </View>
    );
  };

  const renderAcceptedItem = ({ item }: { item: CollabItem }) => {
    const post = item.post;
    const thumbnail = post.mediaUrls?.[0];
    return (
      <View style={styles.row}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumbnailLarge} resizeMode="cover" />
        ) : (
          <View style={[styles.thumbnailLarge, styles.noThumbnail]}>
            <Icon name="paperclip" size="md" color={colors.text.secondary} />
          </View>
        )}
        <View style={styles.info}>
          <Text style={styles.postContent} numberOfLines={3}>
            {post.content || 'No caption'}
          </Text>
          <View style={styles.postMeta}>
            <Icon name="user" size="xs" color={colors.text.secondary} />
            <Text style={styles.metaText}>by @{post.user.username}</Text>
            <Text style={styles.metaDot}>•</Text>
            <Text style={styles.metaText}>{new Date(post.createdAt).toLocaleDateString()}</Text>
          </View>
          <GradientButton
            label={removeMutation.isPending && removeMutation.variables === item.id ? '…' : 'Remove'}
            onPress={() => confirmRemove(item)}
            variant="ghost"
            disabled={removeMutation.isPending && removeMutation.variables === item.id}
          />
        </View>
      </View>
    );
  };

  const tabs = [
    { key: 'pending', label: 'Pending' },
    { key: 'accepted', label: 'Accepted' },
  ] as const;

  const isLoading = activeTab === 'pending' ? pendingQuery.isLoading : acceptedQuery.isLoading;
  const isFetchingNextPage = acceptedQuery.isFetchingNextPage;
  const data = activeTab === 'pending' ? pendingCollabs : acceptedCollabs;
  const renderItem = activeTab === 'pending' ? renderPendingItem : renderAcceptedItem;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <GlassHeader
        title="Collaboration Requests"
        leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: 'Back' }}
      />

      <TabSelector
        tabs={tabs}
        activeKey={activeTab}
        onTabChange={(key) => setActiveTab(key as TabKey)}
        variant="underline"
        style={[styles.tabSelector, { marginTop: insets.top + 52 }]}
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.emerald} />
          }
          renderItem={renderItem}
          ListFooterComponent={() =>
            isFetchingNextPage ? (
              <View style={styles.skeletonRow}>
                <Skeleton.Circle size={46} />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Skeleton.Rect width={120} height={14} />
                  <Skeleton.Rect width={80} height={11} />
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={() => (
            <EmptyState
              icon="users"
              title={activeTab === 'pending' ? 'No pending invites' : 'No accepted collaborations'}
              subtitle={
                activeTab === 'pending'
                  ? 'Invitations to collaborate on posts will appear here.'
                  : 'Posts you collaborate on will appear here.'
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  tabSelector: { marginHorizontal: spacing.base, marginTop: spacing.sm },

  list: { paddingBottom: 40 },
  skeletonList: { padding: spacing.base, gap: spacing.md },
  skeletonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.base, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
  },
  info: { flex: 1, gap: spacing.sm },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.text.primary, fontSize: fontSize.sm, fontWeight: '700' },
  username: { color: colors.text.secondary, fontSize: fontSize.xs, marginTop: 1 },
  postPreview: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  thumbnail: {
    width: 50, height: 50, borderRadius: radius.sm,
    backgroundColor: colors.dark.bgElevated, justifyContent: 'center', alignItems: 'center',
  },
  thumbnailLarge: {
    width: 70, height: 70, borderRadius: radius.md,
    backgroundColor: colors.dark.bgElevated, justifyContent: 'center', alignItems: 'center',
  },
  noThumbnail: { borderWidth: 0.5, borderColor: colors.dark.border },
  postContent: {
    color: colors.text.secondary, fontSize: fontSize.sm, flex: 1,
  },
  postMeta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },
  metaText: { color: colors.text.tertiary, fontSize: fontSize.xs },
  metaDot: { color: colors.text.tertiary, fontSize: fontSize.xs, marginHorizontal: 2 },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});