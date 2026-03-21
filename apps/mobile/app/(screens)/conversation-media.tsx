import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList,
  RefreshControl, Linking,
  Pressable,
} from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { TabSelector } from '@/components/ui/TabSelector';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { VideoPlayer } from '@/components/ui/VideoPlayer';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { useAnimatedPress } from '@/hooks/useAnimatedPress';
import { colors, spacing, fontSize, radius } from '@/theme';
import { messagesApi } from '@/services/api';
import { useTranslation } from '@/hooks/useTranslation';
import type { Message } from '@/types';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';

type TabKey = 'media' | 'links' | 'docs';

interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  thumbnailUrl?: string;
  messageId: string;
  createdAt: string;
}

interface LinkItem {
  id: string;
  url: string;
  preview?: string;
  messageId: string;
  createdAt: string;
}

interface DocItem {
  id: string;
  url: string;
  fileName: string;
  fileSize?: number;
  messageId: string;
  createdAt: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ScaleMediaItem({ item, onImagePress, onVideoPress }: {
  item: MediaItem;
  onImagePress: () => void;
  onVideoPress: () => void;
}) {
  const { onPressIn, onPressOut, animatedStyle } = useAnimatedPress({ scaleTo: 0.96 });
  const { t } = useTranslation();

  return (
    <AnimatedPressable
      style={[styles.mediaItem, animatedStyle]}
      onPress={item.type === 'image' ? onImagePress : onVideoPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityLabel={item.type === 'image' ? t('conversationMedia.accessibility.viewImage') : t('conversationMedia.accessibility.playVideo')}
      accessibilityRole="button"
    >
      <Image
        source={{ uri: item.url }}
        style={styles.mediaThumbnail}
        contentFit="cover"
        transition={200}
        accessibilityLabel={item.type === 'image' ? t('conversationMedia.accessibility.imageShared') : t('conversationMedia.accessibility.videoThumbnail')}
        accessibilityRole="image"
      />
      {item.type === 'video' && (
        <View style={styles.videoOverlay}>
          <Icon name="play" size={28} color={colors.text.primary} />
        </View>
      )}
    </AnimatedPressable>
  );
}

// Regex to find URLs in text
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ?? [];
}

function isImageMediaType(mediaType?: string): boolean {
  return mediaType?.startsWith('image/') ?? false;
}

function isVideoMediaType(mediaType?: string): boolean {
  return mediaType?.startsWith('video/') ?? false;
}

export default function ConversationMediaScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('media');
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [videoPlayerVisible, setVideoPlayerVisible] = useState(false);
  const [selectedVideoUri, setSelectedVideoUri] = useState<string>('');

  // Fetch messages with infinite scroll
  const {
    data: messagesPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useInfiniteQuery({
    queryKey: ['conversation-messages', conversationId],
    queryFn: ({ pageParam }) => messagesApi.getMessages(conversationId, pageParam),
    getNextPageParam: (lastPage) => lastPage.meta.cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });

  // Flatten all messages from all pages
  const allMessages = useMemo(() => {
    return messagesPages?.pages.flatMap(page => page.data) ?? [];
  }, [messagesPages]);

  // Extract media, links, docs from messages
  const { mediaItems, linkItems, docItems } = useMemo(() => {
    const media: MediaItem[] = [];
    const links: LinkItem[] = [];
    const docs: DocItem[] = [];

    allMessages.forEach(msg => {
      // Media (image or video)
      if (msg.mediaUrl && msg.mediaType) {
        if (isImageMediaType(msg.mediaType)) {
          media.push({
            id: `${msg.id}-media`,
            url: msg.mediaUrl,
            type: 'image',
            messageId: msg.id,
            createdAt: msg.createdAt,
          });
        } else if (isVideoMediaType(msg.mediaType)) {
          media.push({
            id: `${msg.id}-media`,
            url: msg.mediaUrl,
            type: 'video',
            thumbnailUrl: msg.mediaUrl, // Could have separate thumbnail, but use same for now
            messageId: msg.id,
            createdAt: msg.createdAt,
          });
        }
      }

      // Links from content
      if (msg.content) {
        const urls = extractUrls(msg.content);
        urls.forEach((url, idx) => {
          links.push({
            id: `${msg.id}-link-${idx}`,
            url,
            messageId: msg.id,
            createdAt: msg.createdAt,
          });
        });
      }

      // Docs (file attachments)
      if (msg.mediaUrl && msg.fileName && !isImageMediaType(msg.mediaType) && !isVideoMediaType(msg.mediaType)) {
        docs.push({
          id: `${msg.id}-doc`,
          url: msg.mediaUrl,
          fileName: msg.fileName,
          fileSize: msg.fileSize,
          messageId: msg.id,
          createdAt: msg.createdAt,
        });
      }
    });

    return { mediaItems: media, linkItems: links, docItems: docs };
  }, [allMessages]);

  const handleOpenImageLightbox = useCallback((images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxVisible(true);
  }, []);

  const handleOpenVideoPlayer = useCallback((uri: string) => {
    setSelectedVideoUri(uri);
    setVideoPlayerVisible(true);
  }, []);

  const handleOpenLink = useCallback((url: string) => {
    Linking.openURL(url).catch(err => { if (__DEV__) console.error('Failed to open link:', err); });
  }, []);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const tabs = [
    { key: 'media', label: `${t('conversationMedia.tab.media')} (${mediaItems.length})` },
    { key: 'links', label: `${t('conversationMedia.tab.links')} (${linkItems.length})` },
    { key: 'docs', label: `${t('conversationMedia.tab.docs')} (${docItems.length})` },
  ] as const;

  const renderMediaItem = ({ item, index }: { item: MediaItem; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 50).duration(400)}>
      <ScaleMediaItem
        item={item}
        onImagePress={() => {
          const imageUrls = mediaItems.filter(m => m.type === 'image').map(m => m.url);
          const idx = imageUrls.indexOf(item.url);
          handleOpenImageLightbox(imageUrls, idx);
        }}
        onVideoPress={() => handleOpenVideoPlayer(item.url)}
      />
    </Animated.View>
  );

  const renderLinkItem = ({ item, index }: { item: LinkItem; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <Pressable
        style={styles.linkItem}
        onPress={() => handleOpenLink(item.url)}

        accessibilityLabel={`${t('conversationMedia.accessibility.openLink')} ${item.url}`}
        accessibilityRole="link"
      >
        <LinearGradient
          colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
          style={styles.linkIcon}
        >
          <Icon name="link" size="sm" color={colors.emerald} />
        </LinearGradient>
        <View style={styles.linkContent}>
          <Text style={styles.linkUrl} numberOfLines={1}>
            {item.url}
          </Text>
          <Text style={styles.linkDate}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Icon name="chevron-right" size="sm" color={colors.text.tertiary} />
      </Pressable>
    </Animated.View>
  );

  const renderDocItem = ({ item, index }: { item: DocItem; index: number }) => (
    <Animated.View entering={FadeInUp.delay(index * 80).duration(400)}>
      <Pressable
        style={styles.docItem}
        onPress={() => handleOpenLink(item.url)}

        accessibilityLabel={`${t('conversationMedia.accessibility.openDocument')} ${item.fileName}`}
        accessibilityRole="link"
      >
        <LinearGradient
          colors={['rgba(10,123,79,0.2)', 'rgba(200,150,62,0.1)']}
          style={styles.docIcon}
        >
          <Icon name="paperclip" size="sm" color={colors.emerald} />
        </LinearGradient>
        <View style={styles.docContent}>
          <Text style={styles.docName} numberOfLines={1}>
            {item.fileName}
          </Text>
          {item.fileSize && (
            <Text style={styles.docSize}>
              {t('conversationMedia.fileSizeKB', { size: (item.fileSize / 1024).toFixed(1) })}
            </Text>
          )}
          <Text style={styles.docDate}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Icon name="download" size="sm" color={colors.text.tertiary} />
      </Pressable>
    </Animated.View>
  );

  const renderEmpty = () => {
    const icons = { media: 'image', links: 'link', docs: 'paperclip' } as const;
    const titles = {
      media: t('conversationMedia.emptyState.noMedia'),
      links: t('conversationMedia.emptyState.noLinks'),
      docs: t('conversationMedia.emptyState.noDocs'),
    } as const;
    const subtitles = {
      media: t('conversationMedia.emptyState.mediaSubtitle'),
      links: t('conversationMedia.emptyState.linksSubtitle'),
      docs: t('conversationMedia.emptyState.docsSubtitle'),
    } as const;
    return (
      <EmptyState
        icon={icons[activeTab]}
        title={titles[activeTab]}
        subtitle={subtitles[activeTab]}
      />
    );
  };

  if (isLoading && !messagesPages) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Skeleton.ProfileHeader />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EmptyState
          icon="slash"
          title={t('conversationMedia.error.loadMedia')}
          subtitle={t('conversationMedia.error.pullToRefresh')}
          actionLabel={t('common.retry')}
          onAction={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <ScreenErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top']}>
        <GlassHeader
          title={t('conversationMedia.title')}
          leftAction={{ icon: <Icon name="arrow-left" size="md" color={colors.text.primary} />, onPress: () => router.back(), accessibilityLabel: t('common.back') }}
        />

        {/* Tabs */}
        <TabSelector
          tabs={tabs}
          activeKey={activeTab}
          onTabChange={(key: string) => setActiveTab(key as TabKey)}
          variant="underline"
          style={styles.tabSelector}
        />

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'media' && (
            <FlatList
            removeClippedSubviews={true}
              data={mediaItems}
              renderItem={renderMediaItem}
              keyExtractor={item => item.id}
              numColumns={3}
              columnWrapperStyle={styles.mediaGrid}
              contentContainerStyle={styles.mediaList}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.emerald} />}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={renderEmpty}
              ListFooterComponent={isFetchingNextPage ? <Skeleton.Rect width="100%" height={100} /> : null}
            />
          )}
          {activeTab === 'links' && (
            <FlatList
            removeClippedSubviews={true}
              data={linkItems}
              renderItem={renderLinkItem}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContainer}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.emerald} />}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={renderEmpty}
              ListFooterComponent={isFetchingNextPage ? <Skeleton.Rect width="100%" height={60} /> : null}
            />
          )}
          {activeTab === 'docs' && (
            <FlatList
            removeClippedSubviews={true}
              data={docItems}
              renderItem={renderDocItem}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContainer}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.emerald} />}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={renderEmpty}
              ListFooterComponent={isFetchingNextPage ? <Skeleton.Rect width="100%" height={60} /> : null}
            />
          )}
        </View>

        {/* Image Lightbox */}
        <ImageLightbox
          visible={lightboxVisible}
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxVisible(false)}
        />

        {/* Video Player BottomSheet */}
        <BottomSheet
          visible={videoPlayerVisible}
          onClose={() => setVideoPlayerVisible(false)}
          snapPoint={0.85}
        >
          <View style={styles.videoSheet}>
            <VideoPlayer uri={selectedVideoUri} autoPlay />
          </View>
        </BottomSheet>
      </SafeAreaView>

    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  tabSelector: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
  },
  content: { flex: 1 },
  mediaList: {
    padding: spacing.sm,
  },
  mediaGrid: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  mediaItem: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgCard,
  },
  mediaThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    paddingVertical: spacing.sm,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  linkContent: { flex: 1 },
  linkUrl: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    marginBottom: 2,
  },
  linkDate: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.sm,
    backgroundColor: colors.dark.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  docContent: { flex: 1 },
  docName: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    marginBottom: 2,
  },
  docSize: {
    color: colors.text.secondary,
    fontSize: fontSize.xs,
    marginBottom: 2,
  },
  docDate: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
  },
  videoSheet: {
    padding: spacing.base,
  },
});