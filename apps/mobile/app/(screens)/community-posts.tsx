import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable,
  FlatList, TextInput, KeyboardAvoidingView, Platform, Image as RNImage, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useUser } from '@clerk/clerk-expo';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { RichText } from '@/components/ui/RichText';
import { colors, spacing, fontSize, radius } from '@/theme';
import { formatCount } from '@/utils/formatCount';
import { channelsApi, channelPostsApi, uploadApi } from '@/services/api';
import { showToast } from '@/components/ui/Toast';
import type { ChannelPost, Channel, PaginatedResponse } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

const POST_MAX_LENGTH = 5000;

function CommunityPostItem({ post, isOwnChannel, onLike, onLongPress, index }: {
  post: ChannelPost;
  isOwnChannel: boolean;
  onLike: (postId: string, liked: boolean) => void;
  onLongPress: (post: ChannelPost) => void;
  index: number;
}) {
  const router = useRouter();
  const tc = useThemeColors();
  const [liked, setLiked] = useState(post.isLiked ?? false);
  const [likeCount, setLikeCount] = useState(post.likesCount);

  useEffect(() => {
    setLiked(post.isLiked ?? false);
    setLikeCount(post.likesCount);
  }, [post.isLiked, post.likesCount]);

  const handleLike = useCallback(() => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(prev => newLiked ? prev + 1 : Math.max(0, prev - 1));
    onLike(post.id, newLiked);
  }, [liked, onLike, post.id]);

  const handlePressUser = useCallback(() => {
    router.push(`/(screens)/profile/${post.user.username}`);
  }, [router, post.user.username]);

  const handleLongPress = useCallback(() => {
    onLongPress(post);
  }, [onLongPress, post]);

  return (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <Pressable
        style={styles.postCard}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <LinearGradient
          colors={colors.gradient.cardDark}
          style={styles.postCardGradient}
        >
      <View style={styles.postHeader}>
        <Pressable style={styles.postUser} onPress={handlePressUser}>
          <Avatar
            uri={post.user.avatarUrl}
            name={post.user.displayName}
            size="sm"
            showRing={false}
          />
          <View style={styles.postUserInfo}>
            <Text style={[styles.postUserName, { color: tc.text.primary }]} numberOfLines={1}>
              {post.user.displayName}
            </Text>
            <Text style={[styles.postTime, { color: tc.text.tertiary }]}>
              {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true, locale: getDateFnsLocale() })}
            </Text>
          </View>
        </Pressable>
        {post.isPinned && (
          <View style={styles.pinBadge}>
            <Icon name="map-pin" size="xs" color={colors.emerald} />
          </View>
        )}
      </View>

      {post.content ? (
        <RichText text={post.content} style={styles.postContent} />
      ) : null}

      {post.mediaUrls.length > 0 && (
        <View style={styles.postMedia}>
          <ProgressiveImage
            uri={post.mediaUrls[0]}
            width="100%"
            height={250}
            borderRadius={radius.sm}
          />
        </View>
      )}

      <View style={[styles.postActions, { borderTopColor: tc.borderLight }]}>
        <Pressable style={styles.postAction} onPress={handleLike} accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'}>
          <Icon
            name={liked ? 'heart-filled' : 'heart'}
            size="sm"
            color={liked ? colors.error : tc.text.secondary}
          />
          <Text style={[styles.postActionCount, liked && styles.likedCount]}>
            {formatCount(likeCount)}
          </Text>
        </Pressable>
        <Pressable style={styles.postAction} accessibilityRole="button" accessibilityLabel="Comments">
          <Icon name="message-circle" size="sm" color={tc.text.secondary} />
          <Text style={[styles.postActionCount, { color: tc.text.secondary }]}>{formatCount(post.commentsCount)}</Text>
        </Pressable>
        <Pressable style={styles.postAction} accessibilityRole="button" accessibilityLabel="Share">
          <Icon name="share" size="sm" color={tc.text.secondary} />
        </Pressable>
      </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function CommunityPostsScreen() {
  const { channelId: handle } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ChannelPost | null>(null);
  const [selectedMediaList, setSelectedMediaList] = useState<{ uri: string; type: 'image' | 'video' }[]>([]);
  const composeInputRef = useRef<TextInput>(null);

  // Fetch channel details
  const channelQuery = useQuery({
    queryKey: ['channel', handle],
    queryFn: () => channelsApi.getByHandle(handle),
    enabled: !!handle,
  });

  const channel = channelQuery.data;
  const channelId = channel?.id;
  const isOwnChannel = !!user && !!channel && channel.userId === user.id;

  // Fetch community posts (infinite scroll)
  const postsQuery = useInfiniteQuery({
    queryKey: ['channel-posts', handle],
    queryFn: ({ pageParam }) => channelPostsApi.list(handle, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    enabled: !!handle,
  });

  const posts: ChannelPost[] = postsQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const createMutation = useMutation({
    mutationFn: (data: { content: string; mediaUrls?: string[] }) =>
      channelPostsApi.create(handle, {
        content: data.content,
        mediaUrls: data.mediaUrls,
        postType: data.mediaUrls && data.mediaUrls.length > 0 ? (selectedMediaList[0]?.type === 'image' ? 'image' : 'video') : 'text'
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-posts', handle] });
      setComposeText('');
      setSelectedMediaList([]);
      setShowCreateSheet(false);
      showToast({ message: t('communityPosts.postCreated'), variant: 'success' });
    },
    onError: (error) => {
      showToast({ message: t('communityPosts.createError'), variant: 'error' });
      if (__DEV__) console.error('Create post error:', error);
    },
  });

  const likeMutation = useMutation({
    mutationFn: ({ postId, liked }: { postId: string; liked: boolean }) =>
      liked ? channelPostsApi.like(handle, postId) : channelPostsApi.unlike(handle, postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-posts', handle] });
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([channelQuery.refetch(), postsQuery.refetch()]);
    setRefreshing(false);
  }, [channelQuery, postsQuery]);

  const handleCreatePost = useCallback(async () => {
    if (!composeText.trim() && selectedMediaList.length === 0) return;

    let uploadedUrls: string[] = [];
    if (selectedMediaList.length > 0) {
      try {
        uploadedUrls = await Promise.all(
          selectedMediaList.map(async (media) => {
            const contentType = media.type === 'video' ? 'video/mp4' : 'image/jpeg';
            const presign = await uploadApi.getPresignUrl(contentType, 'community-posts');
            const response = await fetch(media.uri);
            const blob = await response.blob();
            await fetch(presign.uploadUrl, {
              method: 'PUT',
              body: blob,
              headers: { 'Content-Type': contentType },
            });
            return presign.publicUrl;
          })
        );
      } catch {
        showToast({ message: t('communityPosts.uploadFailed') || 'Image upload not available', variant: 'error' });
        return;
      }
    }

    createMutation.mutate({
      content: composeText.trim(),
      mediaUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
    });
  }, [composeText, selectedMediaList, createMutation, t]);

  const handleLike = useCallback((postId: string, liked: boolean) => {
    likeMutation.mutate({ postId, liked });
  }, [likeMutation]);

  const deleteMutation = useMutation({
    mutationFn: (postId: string) => channelPostsApi.delete(handle, postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-posts', handle] });
      showToast({ message: t('communityPosts.postDeleted'), variant: 'success' });
    },
    onError: (error) => {
      showToast({ message: t('communityPosts.deleteError'), variant: 'error' });
      if (__DEV__) console.error('Delete post error:', error);
    },
  });

  const handleDeletePost = useCallback((postId: string) => {
    deleteMutation.mutate(postId);
    setSelectedPost(null);
  }, [deleteMutation]);

  const handleCopyText = useCallback(async (content: string) => {
    await Clipboard.setStringAsync(content);
    showToast({ message: t('common.copiedToClipboard'), variant: 'success' });
    setSelectedPost(null);
  }, [t]);

  const handleLongPress = useCallback((post: ChannelPost) => {
    setSelectedPost(post);
  }, []);

  const renderPostItem = useCallback(({ item, index }: { item: ChannelPost; index: number }) => (
    <CommunityPostItem
      post={item}
      isOwnChannel={isOwnChannel}
      onLike={handleLike}
      onLongPress={handleLongPress}
      index={index}
    />
  ), [isOwnChannel, handleLike, handleLongPress]);

  const renderSkeleton = useCallback(() => (
    <View style={styles.skeletonContainer}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton.PostCard key={i} />
      ))}
    </View>
  ), []);

  if (postsQuery.isError || channelQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('communityPosts.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={styles.headerSpacer} />
        <EmptyState
          icon="flag"
          title={t('common.error.loadContent')}
          subtitle={t('common.error.checkConnection')}
          actionLabel={t('common.retry')}
          onAction={() => handleRefresh()}
        />
      </View>
    );
  }

  if (channelQuery.isLoading || postsQuery.isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('communityPosts.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />
        <View style={styles.headerSpacer} />
        {renderSkeleton()}
      </View>
    );
  }

  return (
    <ScreenErrorBoundary>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.container, { backgroundColor: tc.bg }]}>
          <GlassHeader
            title={t('communityPosts.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.back') }}
          />
          <View style={styles.headerSpacer} />

          {isOwnChannel && (
            <Animated.View entering={FadeInUp.delay(0).duration(400)}>
              <LinearGradient
                colors={colors.gradient.cardDark}
                style={styles.composeContainerOuter}
              >
                {selectedMediaList.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.mediaPreviewScroll}
                    contentContainerStyle={styles.mediaPreviewContent}
                  >
                    {selectedMediaList.map((media, idx) => (
                      <View key={idx} style={styles.mediaPreviewItem}>
                        <RNImage source={{ uri: media.uri }} style={styles.mediaPreview} resizeMode="cover" />
                        <Pressable
                          style={styles.mediaPreviewClose}
                          onPress={() => setSelectedMediaList(prev => prev.filter((_, i) => i !== idx))}
                          accessibilityLabel={t('communityPosts.removeSelectedMedia')}
                          accessibilityRole="button"
                        >
                          <Icon name="x" size="xs" color={tc.text.primary} />
                        </Pressable>
                        {media.type === 'video' && (
                          <View style={styles.videoBadge}>
                            <Icon name="play" size={10} color="#fff" />
                          </View>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                )}
                <View style={styles.composeContainer}>
                  <TextInput
                    ref={composeInputRef}
                    style={[styles.composeInput, { backgroundColor: tc.bgElevated }]}
                    placeholder={t('communityPosts.placeholder')}
                    placeholderTextColor={tc.text.tertiary}
                    value={composeText}
                    onChangeText={setComposeText}
                    multiline
                    maxLength={POST_MAX_LENGTH}
                  />
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.composeButton, !composeText.trim() && selectedMediaList.length === 0 && styles.composeButtonDisabled]}
                    onPress={handleCreatePost}
                    disabled={!composeText.trim() && selectedMediaList.length === 0 || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Icon name="loader" size="sm" color={tc.text.secondary} />
                    ) : (
                      <LinearGradient
                        colors={['rgba(10,123,79,0.3)', 'rgba(10,123,79,0.1)']}
                        style={styles.composeButtonGradient}
                      >
                        <Icon name="send" size="sm" color={colors.emerald} />
                      </LinearGradient>
                    )}
                  </Pressable>
                </View>
              </LinearGradient>
            </Animated.View>
          )}

        <FlatList
            removeClippedSubviews={true}
            data={posts}
            renderItem={renderPostItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <BrandedRefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <EmptyState
                  icon="message-circle"
                  title={t('communityPosts.emptyState.quiet')}
                  subtitle={isOwnChannel ? t('communityPosts.emptyState.ownerHint') : t('communityPosts.emptyState.memberHint')}
                />
              </View>
            }
            onEndReached={() => postsQuery.hasNextPage && postsQuery.fetchNextPage()}
            onEndReachedThreshold={0.5}
          />

          <BottomSheet
            visible={showCreateSheet}
            onClose={() => setShowCreateSheet(false)}
            snapPoint={0.6}
          >
            <BottomSheetItem
              label={t('communityPosts.addImage')}
              icon={<Icon name="image" size="md" color={tc.text.primary} />}
              onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsMultipleSelection: true });
                if (!result.canceled && result.assets) {
                  const newMedia = result.assets.map(asset => ({ uri: asset.uri, type: 'image' as const }));
                  setSelectedMediaList(prev => [...prev, ...newMedia]);
                  setShowCreateSheet(false);
                }
              }}
            />
            <BottomSheetItem
              label={t('communityPosts.addVideo')}
              icon={<Icon name="video" size="md" color={tc.text.primary} />}
              onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 0.8 });
                if (!result.canceled && result.assets[0]) {
                  setSelectedMediaList(prev => [...prev, { uri: result.assets[0].uri, type: 'video' }]);
                  setShowCreateSheet(false);
                }
              }}
            />
            <BottomSheetItem
              label={t('communityPosts.addPoll')}
              icon={<Icon name="bar-chart-2" size="md" color={tc.text.primary} />}
              onPress={() => showToast({ message: t('communityPosts.pollsComing'), variant: 'info' })}
            />
          </BottomSheet>

          <BottomSheet
            visible={!!selectedPost}
            onClose={() => setSelectedPost(null)}
            snapPoint={selectedPost?.content && isOwnChannel ? 0.3 : 0.2}
          >
            {isOwnChannel && selectedPost && (
              <BottomSheetItem
                label={t('communityPosts.deletePost')}
                icon={<Icon name="trash" size="sm" color={colors.error} />}
                onPress={() => handleDeletePost(selectedPost.id)}
              />
            )}
            {selectedPost?.content && (
              <BottomSheetItem
                label={t('communityPosts.copyText')}
                icon={<Icon name="link" size="sm" color={tc.text.primary} />}
                onPress={() => handleCopyText(selectedPost.content!)}
              />
            )}
          </BottomSheet>
        </View>
      </KeyboardAvoidingView>
  
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
  composeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  composeContainerOuter: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
    marginHorizontal: spacing.base,
    marginBottom: spacing.md,
  },
  mediaPreviewScroll: {
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
  },
  mediaPreviewContent: {
    gap: spacing.sm,
    paddingRight: spacing.base,
  },
  mediaPreviewItem: {
    width: 120,
    height: 120,
    position: 'relative',
  },
  mediaPreview: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  mediaPreviewClose: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.full,
    padding: 2,
  },
  videoBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.sm,
    padding: 2,
  },
  composeInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: fontSize.base,
    marginRight: spacing.sm,
  },
  composeButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  composeButtonGradient: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeButtonDisabled: {
    opacity: 0.5,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  postCard: {
    marginHorizontal: spacing.base,
    marginVertical: spacing.xs,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  postCardGradient: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.active.white6,
    padding: spacing.base,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  postUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  postUserInfo: {
    marginLeft: spacing.sm,
    flex: 1,
  },
  postUserName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text.primary,
  },
  postTime: {
    fontSize: fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  pinBadge: {
    padding: spacing.xs,
  },
  postContent: {
    fontSize: fontSize.base,
    color: colors.text.primary,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  postMedia: {
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  postImage: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: radius.sm,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.dark.borderLight,
    paddingTop: spacing.sm,
  },
  postAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.xl,
  },
  postActionCount: {
    fontSize: fontSize.sm,
    color: colors.text.secondary,
    marginLeft: spacing.xs,
  },
  likedCount: {
    color: colors.error,
  },
  skeletonContainer: {
    padding: spacing.base,
  },
  emptyState: {
    marginTop: spacing['2xl'],
  },
});