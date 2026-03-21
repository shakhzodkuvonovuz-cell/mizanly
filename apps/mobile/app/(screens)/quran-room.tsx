import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { io, Socket } from 'socket.io-client';
import { Icon } from '@/components/ui/Icon';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GradientButton } from '@/components/ui/GradientButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { colors, spacing, radius, fontSize } from '@/theme';
import { useTranslation } from '@/hooks/useTranslation';
import { useHaptic } from '@/hooks/useHaptic';
import { islamicApi } from '@/services/islamicApi';
import type { QuranRoomState } from '@/types/islamic';
import { navigate } from '@/utils/navigation';
import type { QuranVerse } from '@/types/islamic';

const SOCKET_URL = `${(process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000')}/chat`;

interface VerseChangeEvent {
  surahNumber: number;
  verseNumber: number;
}

interface ReciterUpdateEvent {
  reciterId: string;
}

export default function QuranRoomScreen() {
  const { t } = useTranslation();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const haptic = useHaptic();

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomState, setRoomState] = useState<QuranRoomState | null>(null);
  const [verseText, setVerseText] = useState<QuranVerse | null>(null);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showHostControls, setShowHostControls] = useState(false);
  const [loadingVerse, setLoadingVerse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentUserId = user?.id ?? '';

  // Socket connection
  useEffect(() => {
    if (!roomId) return;

    let mounted = true;

    const connect = async () => {
      try {
        const token = await getToken();
        if (!token || !mounted) return;

        const socket = io(SOCKET_URL, {
          auth: { token },
          transports: ['websocket'],
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
  }, [roomId, getToken, t]);

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
    haptic.light();
    emitVerseSync(roomState.currentSurah, roomState.currentVerse + 1);
    setShowHostControls(false);
  }, [roomState, emitVerseSync, haptic]);

  const handlePrevVerse = useCallback(() => {
    if (!roomState || roomState.currentVerse <= 1) return;
    haptic.light();
    emitVerseSync(roomState.currentSurah, roomState.currentVerse - 1);
    setShowHostControls(false);
  }, [roomState, emitVerseSync, haptic]);

  const handleLeave = useCallback(() => {
    haptic.light();
    router.back();
  }, [router, haptic]);

  const handleToggleTranslation = useCallback(() => {
    haptic.light();
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
            <RefreshControl
              tintColor={colors.emerald}
              refreshing={false}
              onRefresh={() => {}}
            />
          }
        >
          {/* Participant count */}
          <View style={styles.participantBadge}>
            <Icon name="users" size="sm" color={colors.emerald} />
            <Text style={styles.participantText}>
              {t('quranRoom.participants', { count: roomState?.participantCount ?? 0 })}
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

          {/* Translation toggle */}
          <Pressable
            accessibilityRole="button"
            onPress={handleToggleTranslation}
            style={styles.toggleRow}
          >
            <Icon name="globe" size="sm" color={colors.text.secondary} />
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
            icon={<Icon name="chevron-right" size="sm" color={colors.text.primary} />}
            onPress={handleNextVerse}
          />
          <BottomSheetItem
            label={t('quranRoom.prevVerse')}
            icon={<Icon name="chevron-left" size="sm" color={colors.text.primary} />}
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
              haptic.light();
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark.bg,
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
    borderColor: colors.dark.border,
  },
  arabicVerse: {
    color: colors.gold,
    fontSize: 28,
    lineHeight: 48,
    textAlign: 'center',
    fontWeight: '500',
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dark.bgCard,
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
    borderColor: colors.dark.border,
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
