import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { io, Socket } from 'socket.io-client';
import { Audio } from 'expo-av';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GradientButton } from '@/components/ui/GradientButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/Toast';
import { colors, spacing, radius, fontSize, fontSizeExt, fonts } from '@/theme';
import { formatCount } from '@/utils/formatCount';
import { useTranslation } from '@/hooks/useTranslation';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useThemeColors } from '@/hooks/useThemeColors';
import { islamicApi } from '@/services/islamicApi';
import { SOCKET_URL } from '@/services/api';
import type { QuranRoomState } from '@/types/islamic';
import { navigate } from '@/utils/navigation';
import type { QuranVerse } from '@/types/islamic';

// SOCKET_URL imported from @/services/api

interface VerseChangeEvent {
  surahNumber: number;
  verseNumber: number;
}

interface ReciterUpdateEvent {
  reciterId: string;
}

/**
 * Construct Quran verse audio URL from cdn.islamic.network (Mishary Alafasy).
 * This is the same CDN the backend uses. The audio number is the cumulative
 * ayah index across all surahs.
 */
const SURAH_OFFSETS = [
  0, 7, 293, 493, 669, 789, 954, 1160, 1235, 1364, 1473, 1596, 1707, 1750,
  1802, 1901, 2029, 2140, 2250, 2348, 2483, 2595, 2673, 2791, 2855, 2932,
  3159, 3252, 3340, 3409, 3469, 3503, 3533, 3606, 3660, 3705, 3788, 3970,
  4058, 4133, 4218, 4272, 4325, 4414, 4473, 4510, 4545, 4583, 4612, 4630,
  4675, 4735, 4784, 4846, 4901, 4979, 5075, 5104, 5126, 5150, 5163, 5177,
  5188, 5199, 5217, 5229, 5241, 5271, 5323, 5367, 5395, 5423, 5451, 5507,
  5542, 5573, 5623, 5663, 5709, 5755, 5784, 5813, 5849, 5874, 5896, 5913,
  5932, 5958, 5988, 6008, 6023, 6044, 6058, 6066, 6074, 6093, 6098, 6106,
  6117, 6125, 6130, 6138, 6146, 6154, 6162, 6170, 6176, 6179, 6182, 6185,
  6188, 6193, 6197, 6204,
];

function getQuranAudioUrl(surah: number, ayah: number): string {
  const offset = SURAH_OFFSETS[surah - 1] ?? 0;
  const audioNumber = offset + ayah;
  return `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${audioNumber}.mp3`;
}

export default function QuranRoomScreen() {
  const tc = useThemeColors();
  const styles = createStyles(tc);
  const { t } = useTranslation();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const haptic = useContextualHaptic();

  const socketRef = useRef<Socket | null>(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const [isConnected, setIsConnected] = useState(false);
  const [roomState, setRoomState] = useState<QuranRoomState | null>(null);
  const [verseText, setVerseText] = useState<QuranVerse | null>(null);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showHostControls, setShowHostControls] = useState(false);
  const [loadingVerse, setLoadingVerse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio playback for Quran verse recitation
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const currentUserId = user?.id ?? '';

  const playVerseAudio = useCallback(async () => {
    try {
      // Stop if already playing (toggle behavior)
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        if (isPlaying) { setIsPlaying(false); return; }
      }

      if (!roomState) return;

      // Use audioUrl from backend response, or construct from CDN directly
      const audioUrl = verseText?.audioUrl ?? getQuranAudioUrl(roomState.currentSurah, roomState.currentVerse);

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
      );
      soundRef.current = sound;
      setIsPlaying(true);

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch {
      showToast({ message: t('islamic.audioPlaybackUnavailable', { defaultValue: 'Audio playback unavailable' }), variant: 'info' });
      setIsPlaying(false);
    }
  }, [isPlaying, roomState, verseText, t]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  // Stop audio when verse changes
  useEffect(() => {
    if (soundRef.current) {
      soundRef.current.stopAsync().then(() => soundRef.current?.unloadAsync()).catch(() => {});
      soundRef.current = null;
      setIsPlaying(false);
    }
  }, [roomState?.currentSurah, roomState?.currentVerse]);

  // Socket connection
  useEffect(() => {
    if (!roomId) return;

    let mounted = true;

    const connect = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token || !mounted) return;

        const socket = io(SOCKET_URL, {
          auth: { token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
        });

        socket.on('connect_error', async () => {
          if (!mounted) return;
          const freshToken = await getTokenRef.current();
          if (freshToken && socket) {
            socket.auth = { token: freshToken };
          }
        });

        socket.on('connect', () => {
          if (!mounted) return;
          setIsConnected(true);
          socket.emit('join_quran_room', { roomId });
        });

        socket.on('disconnect', () => {
          if (!mounted) return;
          setIsConnected(false);
        });

        socket.on('quran_room_update', (data: QuranRoomState & { roomId: string }) => {
          if (!mounted) return;
          setRoomState({
            hostId: data.hostId,
            currentSurah: data.currentSurah,
            currentVerse: data.currentVerse,
            reciterId: data.reciterId,
            participantCount: data.participantCount,
          });
        });

        socket.on('quran_verse_changed', (data: VerseChangeEvent) => {
          if (!mounted) return;
          setRoomState(prev =>
            prev
              ? { ...prev, currentSurah: data.surahNumber, currentVerse: data.verseNumber }
              : prev,
          );
        });

        socket.on('quran_reciter_updated', (data: ReciterUpdateEvent) => {
          if (!mounted) return;
          setRoomState(prev =>
            prev ? { ...prev, reciterId: data.reciterId } : prev,
          );
        });

        socketRef.current = socket;
      } catch {
        if (mounted) setError(t('common.error'));
      }
    };

    connect();

    return () => {
      mounted = false;
      if (socketRef.current) {
        socketRef.current.emit('leave_quran_room', { roomId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [roomId]);

  // Fetch verse when it changes
  useEffect(() => {
    if (!roomState) return;

    let cancelled = false;
    setLoadingVerse(true);

    islamicApi
      .getVerse(roomState.currentSurah, roomState.currentVerse)
      .then(response => {
        if (!cancelled) {
          setVerseText(response);
          setLoadingVerse(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingVerse(false);
      });

    return () => {
      cancelled = true;
    };
  }, [roomState?.currentSurah, roomState?.currentVerse]);

  const emitVerseSync = useCallback(
    (surahNumber: number, verseNumber: number) => {
      socketRef.current?.emit('quran_verse_sync', {
        roomId,
        surahNumber,
        verseNumber,
      });
    },
    [roomId],
  );

  const handleNextVerse = useCallback(() => {
    if (!roomState) return;
    haptic.navigate();
    emitVerseSync(roomState.currentSurah, roomState.currentVerse + 1);
    setShowHostControls(false);
  }, [roomState, emitVerseSync, haptic]);

  const handlePrevVerse = useCallback(() => {
    if (!roomState || roomState.currentVerse <= 1) return;
    haptic.navigate();
    emitVerseSync(roomState.currentSurah, roomState.currentVerse - 1);
    setShowHostControls(false);
  }, [roomState, emitVerseSync, haptic]);

  const handleLeave = useCallback(() => {
    haptic.navigate();
    router.back();
  }, [router, haptic]);

  const handleToggleTranslation = useCallback(() => {
    haptic.navigate();
    setShowTranslation(prev => !prev);
  }, [haptic]);

  if (error) {
    return (
      <ScreenErrorBoundary>
        <View style={styles.container}>
          <GlassHeader
            title={t('quranRoom.title')}
            leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          />
          <EmptyState
            icon="slash"
            title={t('common.error')}
            subtitle={error}
            actionLabel={t('common.retry')}
            onAction={() => setError(null)}
          />
        </View>
      </ScreenErrorBoundary>
    );
  }

  return (
    <ScreenErrorBoundary>
      <View style={styles.container}>
        <GlassHeader
          title={t('quranRoom.title')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back() }}
          rightActions={[
            {
              icon: 'share',
              onPress: () => navigate('/(screens)/quran-share'),
              accessibilityLabel: t('tafsir.share'),
            },
            {
              icon: (
                <View
                  style={[
                    styles.connectionDot,
                    { backgroundColor: isConnected ? colors.emerald : colors.error },
                  ]}
                />
              ),
              onPress: () => {},
              accessibilityLabel: isConnected ? 'Connected' : 'Disconnected',
            },
          ]}
        />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <BrandedRefreshControl
              refreshing={loadingVerse}
              onRefresh={() => {
                if (roomState) {
                  setLoadingVerse(true);
                  islamicApi.getVerse(roomState.currentSurah, roomState.currentVerse)
                    .then(response => { setVerseText(response); setLoadingVerse(false); })
                    .catch(() => setLoadingVerse(false));
                }
              }}
            />
          }
        >
          {/* Participant count */}
          <View style={styles.participantBadge}>
            <Icon name="users" size="sm" color={colors.emerald} />
            <Text style={styles.participantText}>
              {t('quranRoom.participants', { count: formatCount(roomState?.participantCount ?? 0) })}
            </Text>
          </View>

          {/* Current verse display */}
          {loadingVerse || !verseText ? (
            <View style={styles.skeletonContainer}>
              <Skeleton.Rect width="100%" height={200} borderRadius={radius.lg} />
            </View>
          ) : (
            <LinearGradient
              colors={['#1a2a1a', '#0D1117', '#1a1a2a']}
              style={styles.verseContainer}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.arabicVerse}>{verseText.arabic}</Text>
              {showTranslation && (
                <Text style={styles.translationText}>{verseText.translation}</Text>
              )}
              <Text style={styles.verseRef}>
                {t('quranRoom.surah')} {roomState?.currentSurah}:{roomState?.currentVerse}
              </Text>
            </LinearGradient>
          )}

          {/* Verse audio playback */}
          <Pressable
            accessibilityRole="button"
            onPress={playVerseAudio}
            style={styles.audioPlayButton}
          >
            <Icon name={isPlaying ? 'loader' : 'play'} size="md" color={isPlaying ? colors.gold : colors.emerald} />
            <Text style={styles.audioPlayText}>
              {isPlaying ? t('quranRoom.playing', { defaultValue: 'Playing...' }) : t('quranRoom.listenToVerse', { defaultValue: 'Listen to verse' })}
            </Text>
          </Pressable>

          {/* Translation toggle */}
          <Pressable
            accessibilityRole="button"
            onPress={handleToggleTranslation}
            style={styles.toggleRow}
          >
            <Icon name="globe" size="sm" color={tc.text.secondary} />
            <Text style={styles.toggleText}>{t('quranRoom.showTranslation')}</Text>
            <View
              style={[
                styles.toggleIndicator,
                showTranslation && styles.toggleActive,
              ]}
            />
          </Pressable>

          {/* Reciter indicator */}
          {roomState?.reciterId && (
            <View style={styles.reciterBadge}>
              <Icon name="mic" size="sm" color={colors.gold} />
              <Text style={styles.reciterText}>{t('quranRoom.reciting')}</Text>
            </View>
          )}

          {/* Spacer */}
          <View style={styles.spacer} />

          {/* Leave button */}
          <GradientButton
            label={t('quranRoom.leave')}
            variant="ghost"
            icon="log-out"
            onPress={handleLeave}
          />
        </ScrollView>

        {/* Host controls BottomSheet */}
        <BottomSheet
          visible={showHostControls}
          onClose={() => setShowHostControls(false)}
        >
          <BottomSheetItem
            label={t('quranRoom.nextVerse')}
            icon={<Icon name="chevron-right" size="sm" color={tc.text.primary} />}
            onPress={handleNextVerse}
          />
          <BottomSheetItem
            label={t('quranRoom.prevVerse')}
            icon={<Icon name="chevron-left" size="sm" color={tc.text.primary} />}
            onPress={handlePrevVerse}
            disabled={!roomState || roomState.currentVerse <= 1}
          />
        </BottomSheet>

        {/* Host FAB */}
        {roomState?.hostId === currentUserId && (
          <Pressable
            accessibilityRole="button"
            style={styles.hostFab}
            onPress={() => {
              haptic.navigate();
              setShowHostControls(true);
            }}
          >
            <LinearGradient
              colors={[colors.emerald, '#065f3e']}
              style={styles.hostFabGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Icon name="sliders" size="md" color="#fff" />
            </LinearGradient>
          </Pressable>
        )}
      </View>
    </ScreenErrorBoundary>
  );
}

const createStyles = (tc: ReturnType<typeof useThemeColors>) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollContent: {
    padding: spacing.base,
    alignItems: 'center',
    paddingBottom: 100,
  },
  participantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginBottom: spacing.xl,
  },
  participantText: {
    color: colors.emerald,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  skeletonContainer: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  verseContainer: {
    width: '100%',
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: tc.border,
  },
  arabicVerse: {
    color: colors.gold,
    fontSize: fontSizeExt.heading,
    fontFamily: fonts.arabicBold,
    lineHeight: 48,
    textAlign: 'center',
    marginBottom: spacing.base,
  },
  translationText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  verseRef: {
    color: colors.text.tertiary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  audioPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.active.emerald10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  audioPlayText: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: tc.bgCard,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.base,
    width: '100%',
  },
  toggleText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    flex: 1,
  },
  toggleIndicator: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: tc.border,
  },
  toggleActive: {
    backgroundColor: colors.emerald,
    borderColor: colors.emerald,
  },
  reciterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(200, 150, 62, 0.1)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginBottom: spacing.base,
  },
  reciterText: {
    color: colors.gold,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  spacer: {
    height: spacing.xl,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  hostFab: {
    position: 'absolute',
    bottom: 32,
    right: spacing.base,
  },
  hostFabGradient: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
