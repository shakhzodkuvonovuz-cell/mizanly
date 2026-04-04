import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Share } from 'react-native';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useTranslation } from '@/hooks/useTranslation';
import { colors, spacing, fontSize, radius, fonts } from '@/theme';
import { rtlFlexRow } from '@/utils/rtl';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { api, videosApi } from '@/services/api';
import { showToast } from '@/components/ui/Toast';
import { formatCount } from '@/utils/formatCount';
import type { Video } from '@/types';

export default function WatchPartyScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const router = useRouter();
  const { t, isRTL } = useTranslation();
  const haptic = useContextualHaptic();
  const queryClient = useQueryClient();
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [debouncedVideoSearch, setDebouncedVideoSearch] = useState('');
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isNavigatingRef = useRef(false);

  // Debounce video search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedVideoSearch(videoSearchQuery), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [videoSearchQuery]);

  const partiesQuery = useQuery({
    queryKey: ['watch-parties'],
    queryFn: () => api.get<Array<Record<string, unknown>>>('/watch-parties'),
  });

  // Video browse/search: use feed when no search query, otherwise search
  const videoBrowseQuery = useQuery({
    queryKey: ['watch-party-videos', debouncedVideoSearch],
    queryFn: () => videosApi.getFeed(undefined, undefined),
    enabled: videoPickerOpen && debouncedVideoSearch.trim().length === 0,
  });

  const videoSearchResults = useQuery({
    queryKey: ['watch-party-video-search', debouncedVideoSearch],
    queryFn: () => api.get<{ data: Video[] }>(`/videos/feed?search=${encodeURIComponent(debouncedVideoSearch)}`),
    enabled: videoPickerOpen && debouncedVideoSearch.trim().length >= 2,
  });

  const renderVideoPickerItem = useCallback(
    ({ item }: { item: Video }) => (
      <Pressable
        accessibilityLabel={t('accessibility.pickVideo')}
        accessibilityRole="button"
        style={styles.videoPickerRow}
        onPress={() => {
          haptic.tick();
          setSelectedVideo(item);
          setVideoPickerOpen(false);
          setVideoSearchQuery('');
        }}
      >
        {item.thumbnailUrl ? (
          <ProgressiveImage uri={item.thumbnailUrl} width={80} height={48} borderRadius={radius.sm} />
        ) : (
          <View style={[styles.videoThumbPlaceholder, { width: 80, height: 48 }]}>
            <Icon name="video" size="sm" color={tc.text.tertiary} />
          </View>
        )}
        <View style={styles.videoPickerInfo}>
          <Text style={styles.videoPickerTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.videoPickerMeta}>
            <Text style={styles.videoPickerDuration}>{Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}</Text>
            {typeof item.viewsCount === 'number' && (
              <Text style={styles.videoPickerViews}>{formatCount(item.viewsCount)} {t('common.views')}</Text>
            )}
          </View>
        </View>
      </Pressable>
    ),
    [haptic, tc.text.tertiary, t],
  );

  const availableVideos: Video[] = (() => {
    if (debouncedVideoSearch.trim().length >= 2) {
      const searchData = videoSearchResults.data;
      if (Array.isArray(searchData)) return searchData;
      if (searchData && Array.isArray((searchData as unknown as Record<string, unknown>).data)) return (searchData as unknown as Record<string, unknown>).data as Video[];
      return [];
    }
    const browseData = videoBrowseQuery.data;
    if (Array.isArray(browseData)) return browseData;
    if (browseData && Array.isArray((browseData as unknown as Record<string, unknown>).data)) return (browseData as unknown as Record<string, unknown>).data as Video[];
    return [];
  })();

  const isLoadingVideos = debouncedVideoSearch.trim().length >= 2 ? videoSearchResults.isLoading : videoBrowseQuery.isLoading;

  const createMutation = useMutation({
    mutationFn: () => api.post<Record<string, unknown>>('/watch-parties', { videoId: selectedVideo?.id, title: newTitle }),
    onSuccess: () => {
      setCreateSheetOpen(false);
      setNewTitle('');
      setSelectedVideo(null);
      queryClient.invalidateQueries({ queryKey: ['watch-parties'] });
      haptic.save();
      showToast({ message: t('community.watchPartyCreated'), variant: 'success' });
    },
    onError: () => {
      showToast({ message: t('common.somethingWentWrong'), variant: 'error' });
    },
  });

  const handleSharePartyLink = async (partyId: string, partyTitle: string) => {
    haptic.tick();
    try {
      await Share.share({
        message: `${t('community.joinMyWatchParty')}: ${partyTitle}\nmizanly://watch-party/${partyId}`,
        url: `mizanly://watch-party/${partyId}`,
      });
    } catch {
      // User cancelled share
    }
  };

  const parties = Array.isArray(partiesQuery.data) ? partiesQuery.data : [];

  const renderParty = ({ item, index }: { item: Record<string, unknown>; index: number }) => {
    const host = item.host as Record<string, unknown> | undefined;
    const isLive = item.isActive as boolean;

    return (
      <Animated.View entering={FadeInUp.delay(index * 60).duration(300)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.title as string}
          style={styles.partyCard}
          onPress={() => {
            if (isNavigatingRef.current) return;
            isNavigatingRef.current = true;
            haptic.tick();
            router.push(`/(screens)/watch-party/${item.id}` as never);
            setTimeout(() => { isNavigatingRef.current = false; }, 500);
          }}
        >
          <View style={[styles.partyHeader, { flexDirection: rtlFlexRow(isRTL) }]}>
            {isLive && (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            )}
            <Text style={styles.partyTitle}>{item.title as string}</Text>
          </View>

          <View style={styles.partyInfo}>
            {host && (
              <View style={[styles.hostRow, { flexDirection: rtlFlexRow(isRTL) }]}>
                <Avatar uri={host.avatarUrl as string | null} name={host.displayName as string || ''} size="sm" />
                <Text style={styles.hostName}>{t('community.hostedBy', { name: host.displayName as string })}</Text>
              </View>
            )}
            <View style={styles.viewerRow}>
              <Icon name="eye" size="xs" color={tc.text.tertiary} />
              <Text style={styles.viewerCount}>{t('community.watchingCount', { count: item.viewerCount as number })}</Text>
            </View>
          </View>

          <View style={[styles.partyActions, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Pressable
              style={styles.joinBtn}
              onPress={() => {
                if (isNavigatingRef.current) return;
                isNavigatingRef.current = true;
                haptic.navigate();
                router.push(`/(screens)/watch-party/${item.id}` as never);
                setTimeout(() => { isNavigatingRef.current = false; }, 500);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('community.joinParty')}
            >
              <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.joinBtnGradient}>
                <Icon name="play" size="sm" color="#FFF" />
                <Text style={styles.joinBtnText}>{t('community.joinParty')}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              style={styles.shareBtn}
              onPress={() => handleSharePartyLink(item.id as string, item.title as string)}
              accessibilityRole="button"
              accessibilityLabel={t('community.sharePartyLink')}
            >
              <Icon name="share" size="sm" color={tc.text.secondary} />
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    );
  };

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('community.watchParties')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightAction={{ icon: 'plus', onPress: () => { setCreateSheetOpen(true); haptic.tick(); } }}
        />

        <FlatList
          data={parties}
          renderItem={renderParty}
          keyExtractor={(item) => item.id as string}
          contentContainerStyle={styles.list}
          refreshControl={
            <BrandedRefreshControl refreshing={partiesQuery.isRefetching} onRefresh={() => partiesQuery.refetch()} />
          }
          ListEmptyComponent={
            partiesQuery.isLoading ? (
              <View style={styles.skeletons}>
                {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={160} borderRadius={radius.lg} />)}
              </View>
            ) : partiesQuery.isError ? (
              <EmptyState icon="alert-circle" title={t('common.error')} subtitle={t('common.tryAgain')} actionLabel={t('common.retry')} onAction={() => partiesQuery.refetch()} />
            ) : (
              <EmptyState icon="video" title={t('community.noWatchParties')} subtitle={t('community.watchPartyHint')} actionLabel={t('community.startParty')} onAction={() => setCreateSheetOpen(true)} />
            )
          }
        />

        {/* Create Sheet */}
        <BottomSheet visible={createSheetOpen} onClose={() => { setCreateSheetOpen(false); setSelectedVideo(null); setNewTitle(''); }}>
          <View style={styles.createForm}>
            <Text style={styles.createTitle}>{t('community.startParty')}</Text>
            <TextInput
              style={styles.createInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder={t('community.partyNamePlaceholder')}
              placeholderTextColor={tc.text.tertiary}
            />

            {/* Video picker button */}
            {selectedVideo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('community.changeVideo')}
                style={styles.selectedVideoCard}
                onPress={() => setVideoPickerOpen(true)}
              >
                {selectedVideo.thumbnailUrl ? (
                  <ProgressiveImage uri={selectedVideo.thumbnailUrl} width={64} height={40} borderRadius={radius.sm} />
                ) : (
                  <View style={styles.videoThumbPlaceholder}>
                    <Icon name="video" size="sm" color={tc.text.tertiary} />
                  </View>
                )}
                <View style={styles.selectedVideoInfo}>
                  <Text style={styles.selectedVideoTitle} numberOfLines={1}>{selectedVideo.title}</Text>
                  <Text style={styles.selectedVideoDuration}>{Math.floor(selectedVideo.duration / 60)}:{String(selectedVideo.duration % 60).padStart(2, '0')}</Text>
                </View>
                <Icon name="pencil" size="xs" color={tc.text.tertiary} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('community.selectVideo')}
                style={styles.selectVideoBtn}
                onPress={() => setVideoPickerOpen(true)}
              >
                <Icon name="video" size="sm" color={colors.emerald} />
                <Text style={styles.selectVideoText}>{t('community.selectVideo')}</Text>
              </Pressable>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('community.start')}
              style={[styles.createBtn, (!newTitle || !selectedVideo) && { opacity: 0.5 }]}
              onPress={() => createMutation.mutate()}
              disabled={!newTitle || !selectedVideo || createMutation.isPending}
            >
              <LinearGradient colors={[colors.emerald, '#0D9B63']} style={styles.createBtnGradient}>
                <Text style={styles.createBtnText}>{t('community.start')}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </BottomSheet>

        {/* Video Picker Sheet */}
        <BottomSheet visible={videoPickerOpen} onClose={() => { setVideoPickerOpen(false); setVideoSearchQuery(''); }} snapPoint={0.85}>
          <View style={styles.createForm}>
            <Text style={styles.createTitle}>{t('community.selectVideo')}</Text>

            {/* Search input */}
            <View style={styles.videoSearchWrap}>
              <Icon name="search" size="sm" color={tc.text.secondary} />
              <TextInput
                style={styles.videoSearchInput}
                value={videoSearchQuery}
                onChangeText={setVideoSearchQuery}
                placeholder={t('community.searchVideos')}
                placeholderTextColor={tc.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {videoSearchQuery.length > 0 && (
                <Pressable onPress={() => setVideoSearchQuery('')} hitSlop={8} accessibilityLabel={t('accessibility.clearSearch')}>
                  <Icon name="x" size="xs" color={tc.text.secondary} />
                </Pressable>
              )}
            </View>

            {/* Video list */}
            {isLoadingVideos ? (
              <View style={styles.videoListLoader}>
                {[1, 2, 3].map(i => <Skeleton.Rect key={i} width="100%" height={64} borderRadius={radius.sm} />)}
              </View>
            ) : (
              <FlatList
                data={availableVideos}
                style={styles.videoList}
                keyExtractor={(item) => item.id}
                refreshControl={<BrandedRefreshControl refreshing={false} onRefresh={() => {}} />}
                renderItem={renderVideoPickerItem}
                ListEmptyComponent={
                  <EmptyState
                    icon="video"
                    title={t('community.noVideosFound')}
                    subtitle={t('community.tryDifferentSearch')}
                  />
                }
              />
            )}
          </View>
        </BottomSheet>
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: tc.bg },
  list: { paddingHorizontal: spacing.base, paddingBottom: spacing['2xl'] },
  skeletons: { gap: spacing.md },
  partyCard: { backgroundColor: tc.bgCard, borderRadius: radius.lg, padding: spacing.base, borderWidth: 1, borderColor: tc.border, marginBottom: spacing.md },
  partyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: '#F85149' + '20', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  liveDot: { width: 6, height: 6, borderRadius: radius.full, backgroundColor: '#F85149' },
  liveText: { color: '#F85149', fontSize: fontSize.xs, fontFamily: fonts.bodyBold },
  partyTitle: { color: tc.text.primary, fontSize: fontSize.md, fontFamily: fonts.bodySemiBold, flex: 1 },
  partyInfo: { gap: spacing.sm, marginBottom: spacing.md },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  hostName: { color: tc.text.secondary, fontSize: fontSize.sm },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  viewerCount: { color: tc.text.tertiary, fontSize: fontSize.sm },
  partyActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  joinBtn: { flex: 1, borderRadius: radius.md, overflow: 'hidden' },
  joinBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md },
  joinBtnText: { color: '#FFF', fontSize: fontSize.base, fontFamily: fonts.bodySemiBold },
  shareBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: tc.bgCard, borderWidth: 1, borderColor: tc.border, alignItems: 'center', justifyContent: 'center' },
  createForm: { padding: spacing.base, gap: spacing.md },
  createTitle: { color: tc.text.primary, fontSize: fontSize.lg, fontFamily: fonts.bodyBold },
  createInput: { backgroundColor: tc.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: tc.border, padding: spacing.md, color: tc.text.primary, fontSize: fontSize.base },
  createBtn: { borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.sm },
  createBtnGradient: { paddingVertical: spacing.md, alignItems: 'center', borderRadius: radius.md },
  createBtnText: { color: '#FFF', fontSize: fontSize.md, fontFamily: fonts.bodyBold },
  selectVideoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: tc.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: tc.border, borderStyle: 'dashed', padding: spacing.lg },
  selectVideoText: { color: colors.emerald, fontSize: fontSize.base, fontFamily: fonts.bodySemiBold },
  selectedVideoCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: tc.bgCard, borderRadius: radius.md, borderWidth: 1, borderColor: tc.border, padding: spacing.md },
  selectedVideoInfo: { flex: 1 },
  selectedVideoTitle: { color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodyMedium },
  selectedVideoDuration: { color: tc.text.tertiary, fontSize: fontSize.sm, marginTop: 2 },
  videoThumbPlaceholder: { width: 64, height: 40, borderRadius: radius.sm, backgroundColor: tc.surface, alignItems: 'center', justifyContent: 'center' },
  videoSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: tc.bgCard, borderRadius: radius.full, borderWidth: 1, borderColor: tc.border },
  videoSearchInput: { flex: 1, color: tc.text.primary, fontSize: fontSize.base },
  videoListLoader: { gap: spacing.sm, marginTop: spacing.sm },
  videoList: { maxHeight: 360 },
  videoPickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 0.5, borderBottomColor: tc.border },
  videoPickerInfo: { flex: 1 },
  videoPickerTitle: { color: tc.text.primary, fontSize: fontSize.base, fontFamily: fonts.bodyMedium },
  videoPickerMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  videoPickerDuration: { color: tc.text.tertiary, fontSize: fontSize.sm },
  videoPickerViews: { color: tc.text.tertiary, fontSize: fontSize.sm },
});
