import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';

import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { colors, spacing, fontSize, radius } from '@/theme';
import { audioTracksApi } from '@/services/api';
import type { AudioTrack } from '@/types';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { formatCount } from '@/utils/formatCount';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { navigate } from '@/utils/navigation';

export default function TrendingAudioScreen() {
  const tc = useThemeColors();
  const styles = useMemo(() => createStyles(tc), [tc]);
  const { t, isRTL } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useContextualHaptic();
  const [refreshing, setRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playingIdRef = useRef<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioMutex = useRef(false);

  const playAudio = useCallback(async (id: string, uri: string) => {
    if (audioMutex.current) return;
    audioMutex.current = true;
    try {
      // Stop current if playing something
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      if (playingIdRef.current === id) {
        // Was playing this one — toggle off
        playingIdRef.current = null;
        setPlayingId(null);
        return;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      playingIdRef.current = id;
      setPlayingId(id);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          playingIdRef.current = null;
          setPlayingId(null);
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
      });
    } catch (err) {
      if (__DEV__) console.warn('Audio playback failed:', err);
      playingIdRef.current = null;
      setPlayingId(null);
    } finally {
      audioMutex.current = false;
    }
  }, []);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  const { data: tracksResponse, isLoading, isError, refetch } = useQuery({
    queryKey: ['trending-audio'],
    queryFn: () => audioTracksApi.getTrending(),
  });
  const tracks = tracksResponse?.data;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptic.tick();
    await refetch();
    setRefreshing(false);
  }, [refetch, haptic]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatUsage = (count: number) => `${formatCount(count)} ${t('screens.trending-audio.reels')}`;

  const renderItem = ({ item, index }: { item: AudioTrack; index: number }) => (
    <Animated.View entering={FadeInUp.delay(Math.min(index * 80, 400)).duration(400)}>
      <LinearGradient
        colors={tc.isDark ? colors.gradient.cardDark : ['rgba(230,235,240,0.6)', 'rgba(240,242,245,0.3)'] as [string, string]}
        style={styles.row}
      >
        <Text style={[styles.rank, index < 3 && styles.rankGold]}>{index + 1}</Text>

        <View style={styles.coverWrap}>
          {item.coverUrl ? (
            <ProgressiveImage uri={item.coverUrl} width={50} height={50} borderRadius={radius.sm} />
          ) : (
            <LinearGradient
              colors={['rgba(200,150,62,0.2)', 'rgba(200,150,62,0.1)']}
              style={[styles.cover, styles.placeholderCover]}
            >
              <Icon name="music" size="md" color={colors.gold} />
            </LinearGradient>
          )}
          {/* Play button overlay */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.tick();
              playAudio(item.id, item.audioUrl);
            }}
            hitSlop={8}
          >
            <LinearGradient
              colors={[colors.emerald, colors.emeraldDark]}
              style={styles.playButton}
            >
              <Icon name={playingId === item.id ? 'loader' : 'play'} size="xs" color={tc.text.primary} />
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
          <Text style={styles.stats}>
            {formatDuration(item.duration)} • <Text style={styles.statsGold}>{formatUsage(item.usageCount)}</Text>
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={styles.useButton}
          onPress={() => {
            haptic.navigate();
            navigate('/(screens)/create-reel', { audioId: item.id });
          }}
        >
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            style={styles.useButtonGradient}
          >
            <Text style={styles.useButtonText}>{t('screens.trending-audio.use')}</Text>
          </LinearGradient>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );

  if (isError) {
    return (
      <ScreenErrorBoundary>
        <View style={styles.container}>
          <GlassHeader
            title={t('screens.trending-audio.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          />
          <View style={{ height: insets.top + 52 }} />
          <EmptyState
            icon="music"
            title={t('screens.trending-audio.errorTitle')}
            subtitle={t('screens.trending-audio.errorSubtitle')}
            actionLabel={t('common.retry')}
            onAction={() => refetch()}
          />
        </View>
      </ScreenErrorBoundary>
    );
  }

  if (isLoading && !tracks) {
    return (
      <ScreenErrorBoundary>
        <View style={styles.container}>
          <GlassHeader
            title={t('screens.trending-audio.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }}
          />
          <View style={{ height: insets.top + 52 }} />
          <View style={{ padding: spacing.base, gap: spacing.md }}>
            <Skeleton.Rect width="100%" height={70} borderRadius={radius.md} />
            <Skeleton.Rect width="100%" height={70} borderRadius={radius.md} />
            <Skeleton.Rect width="100%" height={70} borderRadius={radius.md} />
          </View>
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader 
          title={t('screens.trending-audio.title')} 
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('accessibility.goBack') }} 
        />
      
        <FlatList
          data={tracks || []}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingTop: insets.top + 52 + spacing.md }]}
          removeClippedSubviews={true}
          refreshControl={
            <BrandedRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState 
                icon="music" 
                title={t('screens.trending-audio.emptyTitle')}
                subtitle={t('screens.trending-audio.emptySubtitle')} 
              />
            </View>
          }
        />
      </View>
  
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg
  },
  listContent: {
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
  },
  emptyWrap: {
    marginTop: spacing['2xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: tc.border,
    gap: spacing.md,
  },
  rank: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: tc.text.tertiary,
    width: 32,
    textAlign: 'center',
  },
  rankGold: {
    color: colors.gold,
  },
  coverWrap: {
    width: 50,
    height: 50,
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  cover: {
    width: '100%',
    height: '100%',
    backgroundColor: tc.surface,
  },
  placeholderCover: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    position: 'absolute',
    bottom: 2,
    end: 2,
    width: 20,
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  title: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: tc.text.primary,
  },
  artist: {
    fontSize: fontSize.sm,
    color: tc.text.secondary,
  },
  stats: {
    fontSize: fontSize.xs,
    color: tc.text.tertiary,
    marginTop: 2,
  },
  statsGold: {
    color: colors.gold,
  },
  useButton: {
    overflow: 'hidden',
    borderRadius: radius.full,
  },
  useButtonGradient: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  useButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: tc.text.primary,
  },
});
