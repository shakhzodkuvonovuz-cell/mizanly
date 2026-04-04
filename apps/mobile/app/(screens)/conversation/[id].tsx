import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  KeyboardAvoidingView, Platform, FlatList, LayoutAnimation,
} from 'react-native';
import { Swipeable, PanGestureHandler } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { format, isToday, isYesterday, isSameDay, differenceInMinutes, formatDistanceToNowStrict } from 'date-fns';
import { getDateFnsLocale } from '@/utils/localeFormat';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { GlassHeader } from '@/components/ui/GlassHeader';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { BrandedRefreshControl } from '@/components/ui/BrandedRefreshControl';
import { showToast } from '@/components/ui/Toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeColors } from '@/hooks/useThemeColors';
import { colors, spacing, fontSize, radius, animation, fontSizeExt, fonts } from '@/theme';
import { messagesApi } from '@/services/api';
import {
  encryptMessage as signalEncrypt,
  hasEstablishedSession,
  createInitiatorSession,
  fetchPreKeyBundle,
  generateSenderKey,
  encryptGroupMessage,
} from '@/services/signal';
import { toBase64 } from '@/services/signal/crypto';
import { loadKnownIdentityKey, loadIdentityKeyPair } from '@/services/signal/storage';
import { sealMessage } from '@/services/signal/sealed-sender';
import type { Message, Conversation, ConversationMember } from '@/types';
import { rtlFlexRow, rtlTextAlign, rtlArrow, rtlMargin, rtlBorderStart } from '@/utils/rtl';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { RichText } from '@/components/ui/RichText';
import { navigate } from '@/utils/navigation';
import { TypingIndicator } from '@/components/risalah/TypingIndicator';
import { Audio } from 'expo-av';
import { aiApi } from '@/services/api';

// Hooks
import {
  useConversationMessages,
  useMessageSend,
  useVoiceRecording,
  useConversationEncryption,
} from '@/hooks/conversation';
import type { PendingMessage, EmitEncryptedMessageFn, EncryptedMessage } from '@/hooks/conversation';

// #region Types & Constants
import { searchGiphy, getTrending, type GiphyMediaItem } from '@/services/giphyService';

const QUICK_REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🤲'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function messageTimestamp(dateStr: string, t: (key: string) => string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `${t('common.yesterday')} ${format(d, 'HH:mm')}`;
  return format(d, 'MMM d, HH:mm');
}

function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Highlight search matches in message text
function highlightSearchText(text: string, query: string) {
  if (!query.trim()) return [{ text, highlight: false }];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const segments = [];
  let lastIndex = 0;
  let index = lowerText.indexOf(lowerQuery);
  while (index !== -1) {
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), highlight: false });
    }
    segments.push({ text: text.slice(index, index + query.length), highlight: true });
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlight: false });
  }
  return segments;
}

// TypingDots removed — now using shared <TypingIndicator /> from @/components/risalah

// ── Message list with grouping + date separators ──────────────────────────
const GROUP_GAP_MS = 2 * 60 * 1000; // 2 min gap breaks a group

type ListItem =
  | { type: 'date'; label: string; key: string }
  | { type: 'msg'; message: Message; isGroupStart: boolean; isGroupEnd: boolean; key: string }
  | { type: 'pending'; pending: PendingMessage; key: string };

function buildMessageList(messages: Message[], t: (key: string) => string): ListItem[] {
  const items: ListItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;

    // Date separator when day changes
    if (!prev || !isSameDay(new Date(msg.createdAt), new Date(prev.createdAt))) {
      const d = new Date(msg.createdAt);
      const label = isToday(d) ? t('common.today') : isYesterday(d) ? t('common.yesterday') : format(d, 'MMMM d, yyyy');
      items.push({ type: 'date', label, key: `date-${msg.id}` });
    }

    const diffPrev = prev ? new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() : Infinity;
    const diffNext = next ? new Date(next.createdAt).getTime() - new Date(msg.createdAt).getTime() : Infinity;
    const isGroupStart = !prev || prev.sender.id !== msg.sender.id || diffPrev > GROUP_GAP_MS;
    const isGroupEnd   = !next || next.sender.id !== msg.sender.id || diffNext > GROUP_GAP_MS;

    items.push({ type: 'msg', message: msg, isGroupStart, isGroupEnd, key: msg.id });
  }
  return items;
}

function DateSeparator({ label }: { label: string }) {
  const tc = useThemeColors();
  return (
    <View style={styles.dateSep}>
      <View style={[styles.dateSepLine, { backgroundColor: tc.border }]} />
      <Text style={[styles.dateSepText, { color: tc.text.tertiary }]}>{label}</Text>
      <View style={[styles.dateSepLine, { backgroundColor: tc.border }]} />
    </View>
  );
}

const SPEED_OPTIONS = [1, 1.5, 2] as const;

function VoicePlayer({ mediaUrl, isOwn }: { mediaUrl: string; isOwn: boolean }) {
  const tc = useThemeColors();
  const [playing, setPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  // Deterministic waveform bar heights — no Math.random to avoid re-render flicker
  const waveformHeights = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => 4 + Math.sin(i * 0.8) * 8 + Math.cos(i * 1.3) * 3),
  []);

  const toggle = useCallback(async () => {
    if (playing) {
      await soundRef.current?.pauseAsync();
      setPlaying(false);
    } else {
      if (soundRef.current) {
        await soundRef.current.playAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(
          { uri: mediaUrl },
          { shouldPlay: true, rate: SPEED_OPTIONS[speedIndex], shouldCorrectPitch: true },
        );
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlaying(false);
            soundRef.current = null;
          }
        });
      }
      setPlaying(true);
    }
  }, [playing, mediaUrl, speedIndex]);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync(); };
  }, []);

  return (
    <Pressable style={styles.voicePlayer} onPress={toggle} accessibilityRole="button" accessibilityLabel={playing ? 'Pause voice message' : 'Play voice message'}>
      <Icon name={playing ? 'volume-x' : 'play'} size={18} color={isOwn ? tc.text.onColor : colors.emerald} />
      <View style={styles.voiceWaveform}>
        {waveformHeights.map((height, i) => (
          <View
            key={i}
            style={[
              styles.voiceBar,
              { height },
              isOwn ? styles.voiceBarOwn : styles.voiceBarOther,
            ]}
          />
        ))}
      </View>
      {/* Speed control — tap to cycle 1x → 1.5x → 2x */}
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const next = (speedIndex + 1) % SPEED_OPTIONS.length;
          setSpeedIndex(next);
          soundRef.current?.setRateAsync(SPEED_OPTIONS[next], true);
        }}
        hitSlop={8}
        style={{ paddingHorizontal: 4 }}
        accessibilityLabel={`Playback speed ${SPEED_OPTIONS[speedIndex]}x`}
      >
        <Text style={{ color: isOwn ? tc.text.onColor : colors.emerald, fontSize: 11, fontFamily: fonts.bodyBold }}>
          {SPEED_OPTIONS[speedIndex]}x
        </Text>
      </Pressable>
    </Pressable>
  );
}
function GifPicker({ visible, onClose, onSelect }: {
  visible: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<GiphyMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const tc = useThemeColors();

  const fetchGifs = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const data = query.trim()
        ? await searchGiphy({ query, type: 'gifs', limit: 30 })
        : await getTrending('gifs', 30);
      setResults(data);
      if (data.length === 0 && !process.env.EXPO_PUBLIC_GIPHY_API_KEY) {
        showToast({ message: t('errors.gifServiceNotConfigured'), variant: 'error' });
      }
    } catch {
      showToast({ message: t('errors.gifLoadFailed'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (visible) {
      fetchGifs('');
    }
  }, [visible, fetchGifs]);

  const renderGifItem = useCallback(
    ({ item }: { item: GiphyMediaItem }) => (
      <Pressable
        style={[styles.gifItem, { backgroundColor: tc.bgElevated }]}
        onPress={() => onSelect(item.url)}
        accessibilityRole="button"
        accessibilityLabel={t('gif.selectGif')}
      >
        <ProgressiveImage
          uri={item.previewUrl || item.url}
          width="100%"
          height={150}
          blurhash={null}
        />
      </Pressable>
    ),
    [onSelect, tc.bgElevated, t],
  );

  const handleSearch = useCallback(() => {
    fetchGifs(search);
  }, [search, fetchGifs]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      snapPoint={400}
    >
      <View style={styles.gifPicker}>
        <View style={[styles.gifSearchRow, { borderBottomColor: tc.border }]}>
          <TextInput
            style={[styles.gifSearchInput, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
            placeholder={t('gif.searchPlaceholder')}
            placeholderTextColor={tc.text.tertiary}
            accessibilityLabel={t('gif.search')}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <Pressable onPress={handleSearch} style={styles.gifSearchButton} accessibilityRole="button" accessibilityLabel={t('gif.search')}>
            <Icon name="search" size="sm" color={tc.text.secondary} />
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.gifLoader}>
            <Skeleton.Rect width={120} height={120} borderRadius={radius.sm} />
            <Skeleton.Rect width={120} height={120} borderRadius={radius.sm} />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.gifGrid}
            renderItem={renderGifItem}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const ReadReceiptIcon = ({ status }: { status: 'sent' | 'delivered' | 'read' }) => {
  const { isRTL } = useTranslation();
  const tc = useThemeColors();
  const color = status === 'read' ? colors.emerald : tc.text.tertiary;
  return (
    <View style={{ flexDirection: rtlFlexRow(isRTL), ...rtlMargin(isRTL, 4, 0) }}>
      <Icon name="check" size={12} color={color} />
      {(status === 'delivered' || status === 'read') && (
        <View style={rtlMargin(isRTL, -6, 0)}><Icon name="check" size={12} color={color} /></View>
      )}
    </View>
  );
};

const getMessageStatus = (msg: Message, readByMembers: ConversationMember[], deliveredMessages: Set<string>): 'sent' | 'delivered' | 'read' => {
  if (readByMembers && readByMembers.length > 0) return 'read';
  if (deliveredMessages.has(msg.id)) return 'delivered';
  return 'sent';
};

// #endregion

// #region MessageBubble Component (~360 lines)
const MessageBubble = memo(function MessageBubble({
  message, isOwn, isGroupStart, isGroupEnd, onLongPress, isNew = false,
  searchQuery = '', onSearchResultPress, readByMembers = [],
  conversationId, deliveredMessages = new Set<string>(),
}: {
  message: Message; isOwn: boolean; isGroupStart: boolean; isGroupEnd: boolean;
  onLongPress: (msg: Message) => void; isNew?: boolean;
  searchQuery?: string; onSearchResultPress?: (msgId: string) => void;
  readByMembers?: ConversationMember[];
  conversationId: string;
  deliveredMessages?: Set<string>;
}) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const { t, isRTL } = useTranslation();
  const tc = useThemeColors();
  const [isReacting, setIsReacting] = useState(false);
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const spoilerOpacity = useSharedValue(1);
  const spoilerAnimStyle = useAnimatedStyle(() => ({
    opacity: spoilerOpacity.value,
  }));
  const time = messageTimestamp(message.createdAt, t);
  const AVATAR_SIZE = 28;

  const handleReactionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    haptic.like();
  };

  // Animation for new messages
  const translateY = useSharedValue(isNew ? 100 : 0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    if (isNew) {
      translateY.value = withSpring(0, animation.spring.responsive);
    }
  }, [isNew, translateY]);

  // System message (e.g., security code changed)
  if (message.messageType === 'SYSTEM') {
    const isSecurityMsg = message.content?.includes('Security code changed');
    return (
      <View style={styles.systemMessageWrap}>
        <View style={styles.systemMessageBubble}>
          <Icon name={isSecurityMsg ? 'lock' : 'bell'} size="xs" color={tc.text.tertiary} />
          <Text style={[styles.systemMessageText, { color: tc.text.tertiary }]}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  if (message.isDeleted) {
    return (
      <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn, !isGroupEnd && styles.bubbleWrapGrouped]}>
        {!isOwn && <View style={{ width: AVATAR_SIZE }} />}
        <Text style={[styles.deletedMsg, { color: tc.text.tertiary }]}>{t('messages.deleted')}</Text>
      </View>
    );
  }

  // Corner radius system (WhatsApp style)
  const ownRadius = {
    borderTopStartRadius: radius.lg,
    borderTopEndRadius: isGroupStart ? radius.xl : 4,
    borderBottomStartRadius: radius.lg,
    borderBottomEndRadius: isGroupEnd ? 4 : radius.xl,
  };
  const otherRadius = {
    borderTopStartRadius: isGroupStart ? radius.xl : 4,
    borderTopEndRadius: radius.lg,
    borderBottomStartRadius: isGroupEnd ? 4 : radius.xl,
    borderBottomEndRadius: radius.lg,
  };

  return (
    <Animated.View style={[
      styles.bubbleWrap,
      isOwn && styles.bubbleWrapOwn,
      !isGroupEnd && styles.bubbleWrapGrouped,
      animatedStyle,
    ]}>
      {/* Avatar: show on last message of a group, spacer otherwise */}
      {!isOwn && (
        isGroupEnd
          ? <Avatar uri={message.sender.avatarUrl} name={message.sender.displayName} size="xs" />
          : <View style={{ width: AVATAR_SIZE }} />
      )}

      <Pressable
        onLongPress={() => onLongPress(message)}
        onPress={() => searchQuery.trim() && onSearchResultPress?.(message.id)}
        style={[
          styles.bubble,
          isOwn ? [styles.bubbleOwn, ownRadius, { overflow: 'hidden' as const }] : [styles.bubbleOther, otherRadius, { backgroundColor: tc.surface, borderColor: tc.borderLight }],
        ]}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={`${message.sender.displayName}: ${message.content || t('common.media')}`}
      >
        {isOwn && (
          <LinearGradient
            colors={[colors.emerald, colors.emeraldDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Sender name in groups (only on group start for others) */}
        {!isOwn && isGroupStart && (
          <Text style={styles.senderName}>{message.sender.displayName}</Text>
        )}
        {message.isForwarded && (
          <View style={[styles.forwardedLabel, { flexDirection: rtlFlexRow(isRTL) }]}>
            <Icon name="share" size={10} color={tc.text.tertiary} />
            <Text style={[styles.forwardedText, { color: tc.text.tertiary }]}>{t('messages.forwarded')}</Text>
          </View>
        )}
        {message.replyTo && (
          <View style={[styles.replyPreview, { backgroundColor: tc.bgElevated }, rtlBorderStart(isRTL, 3, colors.emerald)]}>
            <Text style={[styles.replyPreviewUser, !isOwn && styles.replyPreviewUserOther]}>
              {message.replyTo.sender.username}
            </Text>
            <Text style={[styles.replyPreviewText, !isOwn && styles.replyPreviewTextOther]} numberOfLines={1}>
              {message.replyTo.content ?? t('common.media')}
            </Text>
          </View>
        )}
        {/* View Once badge */}
        {message.isViewOnce && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingTop: spacing.xs }}>
            <Icon name="clock" size={12} color={isOwn ? tc.text.onColor : colors.gold} />
            <Text style={{ fontSize: fontSize.xs, color: isOwn ? tc.text.onColor : colors.gold, fontWeight: '600' }}>
              {message.viewedAt ? t('risalah.viewOnceOpened') : t('risalah.viewOnce')}
            </Text>
          </View>
        )}
        {/* Spoiler overlay */}
        {message.isSpoiler && !spoilerRevealed ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.tick();
              setSpoilerRevealed(true);
              spoilerOpacity.value = withTiming(0, { duration: 300 });
            }}
            style={{ position: 'relative', overflow: 'hidden' }}
          >
            {message.content && (
              <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn, { opacity: 0 }]}>
                {message.content}
              </Text>
            )}
            <Animated.View style={[{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: isOwn ? 'rgba(10,123,79,0.85)' : 'rgba(45,53,72,0.9)',
              borderRadius: radius.sm,
              justifyContent: 'center',
              alignItems: 'center',
              flexDirection: 'row',
              gap: spacing.xs,
            }, spoilerAnimStyle]}>
              <Icon name="eye-off" size={14} color={tc.text.secondary} />
              <Text style={{ color: tc.text.secondary, fontSize: fontSize.sm, fontWeight: '500' }}>
                {t('risalah.tapToReveal')}
              </Text>
            </Animated.View>
          </Pressable>
        ) : message.messageType === 'VOICE' && message.mediaUrl ? (
          <VoicePlayer mediaUrl={message.mediaUrl} isOwn={isOwn} />
        ) : (message.messageType as string) === 'CONTACT' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('accessibility.openProfile')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: `${colors.emerald}10`, borderRadius: radius.sm }}
            onPress={() => {
              try {
                const contact = JSON.parse(message.content || '{}');
                if (contact.username) navigate(`/(screens)/profile/${contact.username}`);
              } catch {}
            }}
          >
            <Icon name="user" size="sm" color={colors.emerald} />
            <View>
              <Text style={{ color: isOwn ? tc.text.onColor : tc.text.primary, fontFamily: fonts.bodyMedium, fontSize: 14 }}>
                {(() => { try { return JSON.parse(message.content || '{}').displayName || 'Contact'; } catch { return 'Contact'; } })()}
              </Text>
              <Text style={{ color: isOwn ? tc.text.onColor : tc.text.secondary, fontSize: 12 }}>
                {t('messages.tapToViewProfile', 'Tap to view profile')}
              </Text>
            </View>
          </Pressable>
        ) : (
          <>
            {message.mediaUrl && (
              <Pressable
                onPress={() => { haptic.navigate(); setLightboxImage(message.mediaUrl!); }}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.sharedMedia')}
              >
                <ProgressiveImage uri={message.mediaUrl} width={200} height={200} borderRadius={radius.md} style={{ marginBottom: spacing.xs }} accessibilityLabel={t('accessibility.sharedMedia')} />
              </Pressable>
            )}
            {message.content && (
              searchQuery.trim() ? (
                <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
                  {highlightSearchText(message.content, searchQuery).map((seg, idx) => (
                    <Text
                      key={idx}
                      style={seg.highlight ? { backgroundColor: colors.gold + '80' } : {}}
                    >
                      {seg.text}
                    </Text>
                  ))}
                </Text>
              ) : (
                <RichText text={message.content} style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]} />
              )
            )}
            {lightboxImage && (
              <ImageLightbox
                images={[lightboxImage]}
                visible={true}
                onClose={() => setLightboxImage(null)}
              />
            )}
          </>
        )}
        {/* Inline translation — Instagram 2026 */}
        {translatedText && (
          <View style={{ marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 0.5, borderTopColor: isOwn ? 'rgba(255,255,255,0.15)' : tc.border }}>
            <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn, { fontStyle: 'italic' }]}>{translatedText}</Text>
            <Pressable onPress={() => setTranslatedText(null)} hitSlop={8}>
              <Text style={{ color: isOwn ? 'rgba(255,255,255,0.5)' : tc.text.tertiary, fontSize: fontSizeExt.tiny }}>{t('ai.showOriginal')}</Text>
            </Pressable>
          </View>
        )}
        {message.content && !translatedText && !isOwn && (
          <Pressable
            accessibilityRole="button"
            onPress={async () => {
              setIsTranslating(true);
              try {
                const result = await aiApi.translate(message.content!, 'auto');
                if (result?.translatedText) setTranslatedText(result.translatedText);
              } catch { /* silent */ }
              setIsTranslating(false);
            }}
            hitSlop={8}
            style={{ marginTop: 2 }}
          >
            <Text style={{ color: tc.text.tertiary, fontSize: fontSizeExt.tiny }}>
              {isTranslating ? t('ai.translating') : t('ai.translate')}
            </Text>
          </Pressable>
        )}
        <View style={[styles.bubbleMeta, { flexDirection: rtlFlexRow(isRTL) }]}>
          {message.editedAt && (
            <Text style={[styles.editedLabel, isOwn && styles.editedLabelOwn]}>{t('messages.edited')}</Text>
          )}
          <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{time}</Text>
          {isOwn && (
            <View style={styles.receiptRow}>
              <ReadReceiptIcon status={getMessageStatus(message, readByMembers, deliveredMessages)} />
              {readByMembers.length > 0 && readByMembers[0]?.lastReadAt && (
                <Text style={[styles.readTime, { color: tc.text.tertiary }]}>{format(new Date(readByMembers[0].lastReadAt), 'HH:mm')}</Text>
              )}
              {readByMembers.length > 0 && (
                <View style={styles.readReceipts}>
                  {readByMembers.slice(0, 3).map(member => (
                    <Avatar
                      key={member.userId}
                      uri={member.user.avatarUrl}
                      name={member.user.displayName}
                      size="xs"
                    />
                  ))}
                  {readByMembers.length > 3 && (
                    <Text style={[styles.readReceiptMore, { color: tc.text.tertiary }]}>+{readByMembers.length - 3}</Text>
                  )}
                </View>
              )}
            </View>
          )}
          {message.expiresAt && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Icon name="clock" size={10} color={tc.text.tertiary} />
              <Text style={{ color: tc.text.tertiary, fontSize: fontSizeExt.tiny, marginStart: 2 }}>
                {formatDistanceToNowStrict(new Date(message.expiresAt), { addSuffix: false, locale: getDateFnsLocale() })}
              </Text>
            </View>
          )}
        </View>
        {message.reactions && message.reactions.length > 0 && (
          <View style={styles.reactions}>
            {Object.entries(
              message.reactions.reduce<Record<string, { count: number; hasOwn: boolean }>>((acc, r) => {
                if (!acc[r.emoji]) acc[r.emoji] = { count: 0, hasOwn: false };
                acc[r.emoji].count++;
                if (r.userId === user?.id) acc[r.emoji].hasOwn = true;
                return acc;
              }, {})
            ).map(([emoji, { count, hasOwn }]) => (
              <Pressable
                accessibilityRole="button"
                key={emoji}
                style={[styles.reactionChip, { backgroundColor: tc.surface }, hasOwn && styles.reactionChipOwn]}
                disabled={isReacting}
                onPress={() => {
                  if (isReacting) return;
                  setIsReacting(true);
                  if (hasOwn) {
                    messagesApi.removeReaction(conversationId, message.id, emoji)
                      .then(handleReactionSuccess)
                      .catch(() => showToast({ message: t('errors.removeReactionFailed'), variant: 'error' }))
                      .finally(() => setIsReacting(false));
                  } else {
                    messagesApi.reactToMessage(conversationId, message.id, emoji)
                      .then(handleReactionSuccess)
                      .catch(() => showToast({ message: t('errors.addReactionFailed'), variant: 'error' }))
                      .finally(() => setIsReacting(false));
                  }
                }}
                accessibilityLabel={`${emoji} ${count}`}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
                {count > 1 && <Text style={[styles.reactionCount, { color: tc.text.secondary }]}>{count}</Text>}
              </Pressable>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

function conversationName(convo: Conversation, myId?: string, t?: (key: string) => string): string {
  if (convo.isGroup) return convo.groupName ?? (t ? t('common.group') : 'Group');
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.displayName ?? (t ? t('common.chat') : 'Chat');
}

function conversationAvatar(convo: Conversation, myId?: string): string | undefined {
  if (convo.isGroup) return convo.groupAvatarUrl;
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.avatarUrl;
}

function PendingMessageRow({ pending }: { pending: PendingMessage }) {
  const tc = useThemeColors();
  return (
    <View style={[styles.pendingRow, { backgroundColor: tc.bgCard }]}>
      <Text style={[styles.pendingText, { color: tc.text.secondary }]}>{pending.content}</Text>
      <Icon name="clock" size={14} color={tc.text.tertiary} />
    </View>
  );
}

// #endregion

// #region ConversationScreen — Main Screen Component
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const tc = useThemeColors();

  // Ref-based bridge to break circular dependency between useMessageSend and useConversationMessages.
  // useMessageSend creates emitEncryptedMessage; useConversationMessages needs it for socket reconnect.
  // We assign the ref after useMessageSend returns, so useConversationMessages reads it lazily.
  const emitEncryptedMessageRef = useRef<EmitEncryptedMessageFn | null>(null);

  // ── Hook: Messages (queries, socket listeners, pending state) ──
  const {
    convoQuery,
    messagesQuery,
    messages,
    pendingMessages,
    setPendingMessages,
    pendingMessagesRef,
    deliveredMessages,
    pinnedMessage,
    setPinnedMessage,
    refreshing,
    onRefresh,
    otherTyping,
    flatListRef,
    initialScrollDoneRef,
    newMessageIdsRef,
    socketRef,
  } = useConversationMessages({
    conversationId: id,
    emitEncryptedMessageRef,
  });

  // ── Hook: Send (text, media, typing, undo) ──
  const {
    text,
    setText,
    handleChangeText,
    handleSend,
    isSending,
    pickAndSendMedia,
    uploadingMedia,
    undoPending,
    handleUndoSend,
    replyTo,
    setReplyTo,
    editingMsg,
    setEditingMsg,
    sendAsSpoiler,
    setSendAsSpoiler,
    sendAsViewOnce,
    setSendAsViewOnce,
    inputRef,
    emitEncryptedMessage,
  } = useMessageSend({
    conversationId: id,
    conversationData: convoQuery.data,
    setPendingMessages,
    socketRef,
  });

  // Bridge: assign emitEncryptedMessage to the ref so useConversationMessages can read it
  emitEncryptedMessageRef.current = emitEncryptedMessage;

  // ── Hook: Voice recording ──
  const {
    isRecording,
    uploadingVoice,
    recordingTime,
    slideOffset,
    setSlideOffset,
    cancelled,
    setCancelled,
    handleVoiceStart,
    handleVoiceStop,
    cancelRecording,
  } = useVoiceRecording({
    conversationId: id,
    conversationData: convoQuery.data,
    replyTo,
    setReplyTo,
    emitEncryptedMessage,
  });

  // ── Hook: Encryption (decrypt, cache, disappearing) ──
  const {
    isEncrypted,
    decryptedContents,
  } = useConversationEncryption({
    conversationId: id,
    conversationData: convoQuery.data,
    messages,
  });

  // ── Local UI state ──
  const [contextMenuMsg, setContextMenuMsg] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [chatThemeBg, setChatThemeBg] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(`chat-theme:${id}`).then((val) => {
      if (val) {
        try {
          const saved = JSON.parse(val) as { themeId: string; opacity: number; blur: number };
          const THEME_COLORS: Record<string, string> = {
            'default': '', midnight: '#1a1a2e', purple: '#2d1b4e', forest: '#0d3322',
            charcoal: '#242424', navy: '#1a237e', slate: '#263238', burgundy: '#3e1c1c',
            teal: '#004d40', espresso: '#3e2723', graphite: '#333333', obsidian: '#1c1c1c',
          };
          const color = THEME_COLORS[saved.themeId];
          if (color) setChatThemeBg(color);
        } catch { /* ignore */ }
      }
    });
  }, [id]);

  // Send button animation
  const sendScale = useSharedValue(0);
  useEffect(() => {
    sendScale.value = withSpring(text.trim().length > 0 ? 1 : 0, animation.spring.bouncy);
  }, [text, sendScale]);

  const sendButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: sendScale.value }],
    opacity: sendScale.value,
  }));

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
    enabled: !!forwardMsg,
  });

  const handleContextMenu = useCallback((msg: Message) => {
    haptic.longPress();
    setContextMenuMsg(msg);
  }, [haptic]);

  const handleSwipeReply = useCallback((msg: Message) => {
    haptic.tick();
    setReplyTo({
      id: msg.id,
      content: msg.content,
      username: msg.sender.username,
    });
    inputRef.current?.focus();
  }, [haptic, setReplyTo, inputRef]);

  const isMessageEditable = useCallback((msg: Message): boolean => {
    if (msg.sender.id !== user?.id) return false;
    const ageMinutes = differenceInMinutes(new Date(), new Date(msg.createdAt));
    return ageMinutes < 15;
  }, [user?.id]);

  const isMessageDeletableForEveryone = useCallback((msg: Message): boolean => {
    if (msg.sender.id !== user?.id) return false;
    const ageMinutes = differenceInMinutes(new Date(), new Date(msg.createdAt));
    return ageMinutes < 15;
  }, [user?.id]);

  const scrollToMessageIndex = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, [flatListRef]);

  const handleSearchResultPress = useCallback((index: number) => {
    scrollToMessageIndex(index);
  }, [scrollToMessageIndex]);

  const convo = convoQuery.data;
  const name = convo ? conversationName(convo, user?.id, t) : '';
  const avatarUri = convo ? conversationAvatar(convo, user?.id) : undefined;

  // Build list items combining real messages and pending messages
  const filteredRealMessages = searchQuery.trim()
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;
  const listItems = buildMessageList(filteredRealMessages, t);
  pendingMessages.forEach(pending => {
    listItems.push({
      type: 'pending',
      pending,
      key: pending.id,
    });
  });

  const renderMessageItem = useCallback(({ item, index }: { item: typeof listItems[number]; index: number }) => {
    if (item.type === 'date') return <DateSeparator label={item.label} />;
    if (item.type === 'pending') {
      return <PendingMessageRow pending={item.pending} />;
    }
    const readByMembers = convoQuery.data?.members?.filter(member =>
      member.userId !== user?.id &&
      member.lastReadAt &&
      new Date(member.lastReadAt) >= new Date(item.message.createdAt)
    ).slice(0, 3) ?? [];
    const encMsg = item.message as EncryptedMessage;
    // V6-F2a: Client-side E2E enforcement.
    let displayMessage: typeof item.message;
    if (encMsg.encryptedContent && decryptedContents.has(encMsg.id)) {
      displayMessage = { ...item.message, content: decryptedContents.get(encMsg.id) ?? item.message.content };
    } else if (encMsg.encryptedContent) {
      displayMessage = { ...item.message, content: '🔒' };
    } else if (item.message.messageType !== 'SYSTEM') {
      displayMessage = { ...item.message, content: '⚠ This message was not end-to-end encrypted' };
    } else {
      displayMessage = item.message;
    }
    return (
      <Swipeable
        renderRightActions={() => (
          <View style={[styles.swipeAction, { backgroundColor: tc.bgElevated }]}>
            <Icon name="message-circle" size="sm" color={colors.emerald} />
          </View>
        )}
        onSwipeableWillOpen={() => handleSwipeReply(item.message)}
        rightThreshold={40}
      >
        <MessageBubble
          message={displayMessage}
          isOwn={item.message.sender.id === user?.id}
          isGroupStart={item.isGroupStart}
          isGroupEnd={item.isGroupEnd}
          onLongPress={handleContextMenu}
          isNew={newMessageIdsRef.current.has(item.message.id)}
          searchQuery={searchQuery}
          readByMembers={readByMembers}
          onSearchResultPress={() => handleSearchResultPress(index)}
          conversationId={id}
          deliveredMessages={deliveredMessages}
        />
      </Swipeable>
    );
  }, [convoQuery.data?.members, user?.id, decryptedContents, handleSwipeReply, handleContextMenu, searchQuery, handleSearchResultPress, id, deliveredMessages, tc.bgElevated, newMessageIdsRef]);

  const glassHeaderHeight = insets.top + 52;

  if (convoQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: tc.bg }]}>
        <GlassHeader
          title={t('common.chat')}
          leftAction={{ icon: 'arrow-left', onPress: () => router.back(), accessibilityLabel: t('common.goBack') }}
        />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="flag"
            title={t('errors.conversationLoadFailed')}
            subtitle={t('errors.checkConnection')}
            actionLabel={t('common.retry')}
            onAction={() => convoQuery.refetch()}
          />
        </View>
      </View>
    );
  }

  const chatListEmpty = useMemo(() => (
    <View style={styles.emptyWrap}>
      <Avatar uri={avatarUri} name={name} size="2xl" />
      <Text style={[styles.emptyName, { color: tc.text.primary }]}>{name}</Text>
      <Text style={[styles.emptyHint, { color: tc.text.secondary }]}>{t('risalah.startConversation')}</Text>
    </View>
  ), [avatarUri, name, tc.text.primary, tc.text.secondary, t]);

  return (
    <ScreenErrorBoundary>
    <View style={[styles.container, { backgroundColor: chatThemeBg || tc.bg }]}>
      {/* Header */}
      {searchMode ? (
        <SafeAreaView edges={['top']} style={{ backgroundColor: tc.bg }}>
          <View style={[styles.searchHeader, { borderBottomColor: tc.border }]}>
            <Pressable onPress={() => { setSearchMode(false); setSearchQuery(''); }} hitSlop={8} style={styles.backBtn}>
              <Icon name="arrow-left" size="md" color={tc.text.primary} />
            </Pressable>
            <View style={[styles.searchInputWrap, { backgroundColor: tc.bgCard }]}>
              <Icon name="search" size="sm" color={tc.text.secondary} />
              <TextInput
                style={[styles.searchInput, { color: tc.text.primary }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('messages.searchPlaceholder')}
                placeholderTextColor={tc.text.tertiary}
                accessibilityLabel={t('messages.search')}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Icon name="x" size="xs" color={tc.text.secondary} />
                </Pressable>
              )}
            </View>
            <Pressable onPress={() => { setSearchMode(false); setSearchQuery(''); }} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      ) : (
        <GlassHeader
          leftAction={{
            icon: 'arrow-left',
            onPress: () => router.back(),
            accessibilityLabel: t('common.goBack'),
          }}
          titleComponent={
            <Pressable style={styles.headerCenter} onPress={() => router.push(`/(screens)/conversation-info?id=${id}`)}>
              <Avatar uri={avatarUri} name={name} size="sm" showOnline />
              <View>
                <Text style={[styles.headerName, { color: tc.text.primary }]} numberOfLines={1}>{name}</Text>
                {otherTyping ? (
                  <TypingIndicator label={t('messages.typing')} dotSize={5} variant="bubble" />
                ) : !convo?.isGroup && (() => {
                  const other = convo?.members?.find((m: ConversationMember) => m.userId !== user?.id);
                  const lastActive = (other as Record<string, unknown> | undefined)?.lastActiveAt as string | undefined;
                  if (!lastActive) return null;
                  const diffMs = Date.now() - new Date(lastActive).getTime();
                  if (diffMs < 5 * 60 * 1000) return <Text style={{ color: colors.emerald, fontSize: 11 }}>{t('common.online', 'Online')}</Text>;
                  return null;
                })()}
              </View>
            </Pressable>
          }
          rightActions={[
            {
              icon: 'image',
              onPress: () => router.push(`/(screens)/conversation-media?id=${id}`),
              accessibilityLabel: t('common.viewMedia'),
            },
            {
              icon: 'search',
              onPress: () => setSearchMode(true),
              accessibilityLabel: t('messages.search'),
            },
            {
              icon: 'more-horizontal',
              onPress: () => router.push(`/(screens)/conversation-info?id=${id}`),
              accessibilityLabel: t('common.conversationInfo'),
            },
          ]}
        />
      )}

      {/* Spacer for GlassHeader (absolute positioned) */}
      {!searchMode && <View style={{ height: glassHeaderHeight }} />}

      {/* E2E encryption banner */}
      {isEncrypted && (
        <Animated.View entering={FadeIn} style={styles.encryptionBanner}>
          <Icon name="lock" size="xs" color={colors.emerald} />
          <Text style={styles.encryptionBannerText}>{t('chat.e2eEncrypted')}</Text>
        </Animated.View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {messagesQuery.isLoading ? (
          <View style={styles.loaderWrap}>
            <Skeleton.Rect width={200} height={40} borderRadius={radius.lg} style={{ alignSelf: 'flex-end' }} />
            <Skeleton.Rect width={180} height={40} borderRadius={radius.lg} style={{ alignSelf: 'flex-start', marginTop: spacing.sm }} />
            <Skeleton.Rect width={220} height={40} borderRadius={radius.lg} style={{ alignSelf: 'flex-end', marginTop: spacing.sm }} />
          </View>
        ) : (
          <>
            {pinnedMessage && (
              <Pressable
                onPress={() => {
                  const idx = listItems.findIndex(item => item.type === 'msg' && item.message.id === pinnedMessage.id);
                  if (idx >= 0) scrollToMessageIndex(idx);
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: tc.bgElevated,
                  paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
                  borderBottomWidth: 1, borderBottomColor: tc.border,
                }}
                accessibilityRole="button"
                accessibilityLabel={t('risalah.pinnedMessage')}
              >
                <Icon name="map-pin" size="xs" color={colors.emerald} />
                <View style={{ flex: 1, marginStart: spacing.sm }}>
                  <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs }}>
                    {t('risalah.pinnedMessage')}
                  </Text>
                  <Text numberOfLines={1} style={{ color: tc.text.primary, fontSize: fontSize.sm }}>
                    {pinnedMessage.content}
                  </Text>
                </View>
                <Pressable onPress={() => setPinnedMessage(null)}>
                  <Icon name="x" size="xs" color={tc.text.tertiary} />
                </Pressable>
              </Pressable>
            )}
            <FlatList
            ref={flatListRef}
            data={listItems}
            keyExtractor={(item) => item.key}
            removeClippedSubviews={true}
            renderItem={renderMessageItem}
            onEndReached={() => {
              if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
                messagesQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.1}
            onScroll={(event) => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
              setShowScrollToBottom(distanceFromBottom > 200);
            }}
            scrollEventThrottle={100}
            refreshControl={
              <BrandedRefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
              />
            }
            ListEmptyComponent={chatListEmpty}
            contentContainerStyle={styles.messageList}
            onScrollToIndexFailed={({ index }) => flatListRef.current?.scrollToOffset({ offset: index * 100 })}
            onLayout={initialScrollDoneRef.current ? undefined : () => { initialScrollDoneRef.current = true; flatListRef.current?.scrollToEnd({ animated: false }); }}
          />
          {showScrollToBottom && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accessibility.scrollToBottom')}
              onPress={() => {
                flatListRef.current?.scrollToEnd({ animated: true });
                setShowScrollToBottom(false);
              }}
              style={[styles.scrollToBottomFab, { backgroundColor: tc.bgElevated }]}
            >
              <Icon name="chevron-down" size="sm" color={tc.text.primary} />
            </Pressable>
          )}
          </>
        )}

        {/* Undo send bar */}
        {undoPending && (
          <Animated.View
            entering={FadeIn}
            exiting={FadeOut}
            style={[styles.undoSendBar, { backgroundColor: tc.bgCard }]}
          >
            <Text style={[styles.undoSendText, { color: tc.text.secondary }]}>
              {t('undoSend.sending')}
            </Text>
            <Pressable onPress={handleUndoSend} hitSlop={8}>
              <Text style={styles.undoSendAction}>
                {t('undoSend.undo')}
              </Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Input area */}
        <View style={[styles.inputWrap, { backgroundColor: tc.bg, borderTopColor: tc.border }]}>
          {replyTo && (
            <View style={[styles.replyBanner, { backgroundColor: tc.bgElevated }]}>
              <View style={styles.replyBannerContent}>
                <Text style={styles.replyBannerUser}>@{replyTo.username}</Text>
                <Text style={[styles.replyBannerText, { color: tc.text.secondary }]} numberOfLines={1}>
                  {replyTo.content ?? t('common.media')}
                </Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                <Icon name="x" size="xs" color={tc.text.secondary} />
              </Pressable>
            </View>
          )}
          {editingMsg && (
            <View style={[styles.replyBanner, { backgroundColor: tc.bgElevated }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.emerald, fontSize: fontSize.xs, fontWeight: '600' }}>{t('risalah.editingMessage')}</Text>
                <Text style={{ color: tc.text.secondary, fontSize: fontSize.xs }} numberOfLines={1}>
                  {editingMsg.content}
                </Text>
              </View>
              <Pressable onPress={() => { setEditingMsg(null); setText(''); }} hitSlop={8}>
                <Icon name="x" size="xs" color={tc.text.tertiary} />
              </Pressable>
            </View>
          )}
          {/* Spoiler / View Once toggle bar */}
          {(sendAsSpoiler || sendAsViewOnce) && (
            <View style={{ flexDirection: 'row', paddingHorizontal: spacing.base, paddingVertical: spacing.xs, gap: spacing.sm }}>
              {sendAsSpoiler && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: tc.surface, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, gap: 4 }}>
                  <Icon name="eye-off" size={12} color={colors.emerald} />
                  <Text style={{ color: colors.emerald, fontSize: fontSize.xs, fontWeight: '600' }}>{t('risalah.spoiler')}</Text>
                  <Pressable onPress={() => setSendAsSpoiler(false)} hitSlop={8}>
                    <Icon name="x" size={12} color={tc.text.tertiary} />
                  </Pressable>
                </View>
              )}
              {sendAsViewOnce && (
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: tc.surface, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, gap: 4 }}>
                  <Icon name="clock" size={12} color={colors.gold} />
                  <Text style={{ color: colors.gold, fontSize: fontSize.xs, fontWeight: '600' }}>{t('risalah.viewOnce')}</Text>
                  <Pressable onPress={() => setSendAsViewOnce(false)} hitSlop={8}>
                    <Icon name="x" size={12} color={tc.text.tertiary} />
                  </Pressable>
                </View>
              )}
            </View>
          )}
          <View style={styles.inputRow}>
            <Pressable
              style={[styles.attachBtn, uploadingMedia && { opacity: 0.4 }]}
              hitSlop={8}
              onPress={pickAndSendMedia}
              disabled={uploadingMedia}
              accessibilityLabel={t('accessibility.attachMedia')}
              accessibilityRole="button"
            >
              <Icon
                name="paperclip"
                size="sm"
                color={uploadingMedia ? colors.text.tertiary : tc.text.secondary}
              />
            </Pressable>
            <Pressable
              style={styles.attachBtn}
              hitSlop={8}
              onPress={() => setSendAsSpoiler(!sendAsSpoiler)}
              accessibilityLabel={t('risalah.spoiler')}
              accessibilityRole="button"
            >
              <Icon name="eye-off" size="sm" color={sendAsSpoiler ? colors.emerald : tc.text.secondary} />
            </Pressable>
            <Pressable
              style={styles.attachBtn}
              hitSlop={8}
              onPress={() => setSendAsViewOnce(!sendAsViewOnce)}
              accessibilityLabel={t('risalah.viewOnce')}
              accessibilityRole="button"
            >
              <Icon name="clock" size="sm" color={sendAsViewOnce ? colors.gold : tc.text.secondary} />
            </Pressable>
            <Pressable
              style={styles.gifBtn}
              hitSlop={8}
              onPress={() => setShowGifPicker(true)}
              disabled={uploadingMedia}
              accessibilityLabel={t('accessibility.gifPicker')}
              accessibilityRole="button"
            >
              <Icon name="smile" size="sm" color={tc.text.secondary} />
            </Pressable>
            <Pressable
              style={styles.gifBtn}
              hitSlop={8}
              onPress={() => navigate('/(screens)/sticker-browser', { conversationId: id })}
              accessibilityLabel={t('risalah.stickers')}
              accessibilityRole="button"
            >
              <Icon name="heart" size="sm" color={tc.text.secondary} />
            </Pressable>
            <TextInput
              ref={inputRef}
              style={[styles.input, { backgroundColor: tc.bgElevated, borderColor: tc.border }]}
              placeholder={t('risalah.typeMessage')}
              placeholderTextColor={tc.text.tertiary}
              accessibilityLabel={t('accessibility.messageInput')}
              value={text}
              onChangeText={handleChangeText}
              multiline
              maxLength={2000}
            />
            {text.trim().length > 0 ? (
              <Animated.View style={sendButtonStyle}>
                <AnimatedPressable
                  onPress={handleSend}
                  disabled={isSending}
                  style={styles.sendCircle}
                  accessibilityLabel={t('accessibility.sendMessage')}
                  accessibilityRole="button"
                >
                  <Icon name="send" size="xs" color="#FFF" />
                </AnimatedPressable>
              </Animated.View>
            ) : (
              <PanGestureHandler
                onGestureEvent={(event) => {
                  const translationX = event.nativeEvent.translationX;
                  setSlideOffset(translationX);
                  if (translationX < -60) {
                    setCancelled(true);
                  }
                }}
                onEnded={() => {
                  if (cancelled) {
                    cancelRecording();
                  }
                  setSlideOffset(0);
                }}
              >
                <View style={styles.micButtonWrap}>
                  <Pressable
                    hitSlop={8}
                    style={[styles.micBtn, isRecording && styles.micBtnRecording]}
                    onPressIn={handleVoiceStart}
                    onPressOut={handleVoiceStop}
                    disabled={uploadingVoice}
                    accessibilityLabel={t('accessibility.recordVoice')}
                    accessibilityRole="button"
                  >
                    <Icon
                      name="mic"
                      size="sm"
                      color={isRecording ? colors.error : uploadingVoice ? colors.text.tertiary : tc.text.secondary}
                    />
                  </Pressable>
                  {isRecording && (
                    <View style={[styles.slideCancelIndicator, { backgroundColor: tc.bgElevated }, { transform: [{ translateX: slideOffset }] }]}>
                      <Icon name="x" size="sm" color={tc.text.secondary} />
                    </View>
                  )}
                </View>
              </PanGestureHandler>
            )}
          </View>
          {/* Recording overlay */}
          {isRecording && (
            <View style={[styles.recordingOverlay, { backgroundColor: tc.bg, borderTopColor: tc.border }]}>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={[styles.recordingTimer, { color: tc.text.primary }]}>{formatRecordingTime(recordingTime)}</Text>
              </View>
              <Text style={[styles.slideCancelHint, { color: tc.text.secondary }]}>{t('risalah.slideToCancel')}</Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Message context menu */}
      <BottomSheet
        visible={!!contextMenuMsg && !showReactionPicker}
        onClose={() => {
          setContextMenuMsg(null);
          setShowReactionPicker(false);
        }}
        blurBackdrop={true}
      >
        {/* Quick Reaction Bar */}
        <View style={[styles.quickReactions, { borderBottomColor: tc.border }]}>
          {QUICK_REACTION_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              style={[styles.quickReactionBtn, { backgroundColor: tc.surface }]}
              onPress={() => {
                if (contextMenuMsg) {
                  messagesApi.reactToMessage(id, contextMenuMsg.id, emoji)
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: ['messages', id] });
                      haptic.like();
                    })
                    .catch(() => showToast({ message: t('errors.addReactionFailed'), variant: 'error' }));
                }
                setContextMenuMsg(null);
              }}
              accessibilityLabel={`React with ${emoji}`}
              accessibilityRole="button"
            >
              <Text style={styles.quickReactionEmoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
        {contextMenuMsg?.content ? (
          <BottomSheetItem
            label={t('common.copy')}
            icon={<Icon name="edit" size="sm" color={tc.text.secondary} />}
            onPress={() => {
              Clipboard.setStringAsync(contextMenuMsg.content ?? '');
              setContextMenuMsg(null);
            }}
          />
        ) : null}
        <BottomSheetItem
          label={t('common.reply')}
          icon={<Icon name="message-circle" size="sm" color={tc.text.secondary} />}
          onPress={() => {
            if (contextMenuMsg) {
              setReplyTo({
                id: contextMenuMsg.id,
                content: contextMenuMsg.content,
                username: contextMenuMsg.sender.username,
              });
              setContextMenuMsg(null);
              inputRef.current?.focus();
            }
          }}
        />
        <BottomSheetItem
          label={t('risalah.forward')}
          icon={<Icon name="repeat" size="sm" color={tc.text.secondary} />}
          onPress={() => {
            if (contextMenuMsg) {
              setForwardMsg(contextMenuMsg);
              setContextMenuMsg(null);
            }
          }}
        />
        <BottomSheetItem
          label={contextMenuMsg?.isPinned ? t('risalah.unpinMessage') : t('risalah.pinMessage')}
          icon={<Icon name="map-pin" size="sm" color={contextMenuMsg?.isPinned ? colors.error : tc.text.primary} />}
          onPress={() => {
            if (contextMenuMsg) {
              if (contextMenuMsg?.isPinned) {
                messagesApi.unpin(id as string, contextMenuMsg.id).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['messages', id] });
                });
              } else {
                messagesApi.pin(id as string, contextMenuMsg.id).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['messages', id] });
                });
              }
              setContextMenuMsg(null);
            }
          }}
        />
        <BottomSheetItem
          label={contextMenuMsg?.starredBy?.includes(user?.id ?? '') ? t('risalah.unstarMessage') : t('risalah.starMessage')}
          icon={<Icon name="bookmark" size="sm" color={contextMenuMsg?.starredBy?.includes(user?.id ?? '') ? colors.gold : tc.text.primary} />}
          onPress={() => {
            if (contextMenuMsg) {
              messagesApi.toggleStar(id as string, contextMenuMsg.id).then(() => {
                queryClient.invalidateQueries({ queryKey: ['messages', id] });
              });
              setContextMenuMsg(null);
            }
          }}
        />
        <BottomSheetItem
          label={t('risalah.react')}
          icon={<Icon name="smile" size="sm" color={tc.text.secondary} />}
          onPress={() => {
            setShowReactionPicker(true);
          }}
        />
        {/* Encryption is always on via Signal Protocol — no manual enable button needed */}
        {contextMenuMsg && contextMenuMsg.sender.id === user?.id && (
          <>
            {isMessageEditable(contextMenuMsg) && (
              <BottomSheetItem
                label={t('common.edit')}
                icon={<Icon name="pencil" size="sm" color={tc.text.secondary} />}
                onPress={() => {
                  setEditingMsg(contextMenuMsg);
                  setText(contextMenuMsg.content ?? '');
                  setContextMenuMsg(null);
                  inputRef.current?.focus();
                }}
              />
            )}
            {isMessageDeletableForEveryone(contextMenuMsg) ? (
              <BottomSheetItem
                label={t('risalah.deleteForEveryone')}
                icon={<Icon name="trash" size="sm" color={colors.error} />}
                destructive
                onPress={() => {
                  messagesApi.deleteMessage(id, contextMenuMsg.id).then(() => {
                    queryClient.invalidateQueries({ queryKey: ['messages', id] });
                  }).catch(() => {
                    showToast({ message: t('errors.deleteMessageFailed'), variant: 'error' });
                    queryClient.invalidateQueries({ queryKey: ['messages', id] });
                  });
                  setContextMenuMsg(null);
                }}
              />
            ) : (
              <BottomSheetItem
                label={t('common.delete')}
                icon={<Icon name="trash" size="sm" color={colors.error} />}
                destructive
                onPress={() => {
                  messagesApi.deleteMessage(id, contextMenuMsg.id).then(() => {
                    queryClient.invalidateQueries({ queryKey: ['messages', id] });
                  }).catch(() => {
                    showToast({ message: t('errors.deleteMessageFailed'), variant: 'error' });
                    queryClient.invalidateQueries({ queryKey: ['messages', id] });
                  });
                  setContextMenuMsg(null);
                }}
              />
            )}
          </>
        )}
      </BottomSheet>

      {/* Forward picker */}
      <BottomSheet visible={!!forwardMsg} onClose={() => setForwardMsg(null)}>
        <Text style={{ color: tc.text.primary, fontSize: fontSize.md, fontWeight: '600', padding: spacing.base }}>
          {t('risalah.forwardTo')}
        </Text>
        {conversationsQuery.isLoading ? (
          <View style={{ padding: spacing.base, gap: spacing.sm }}>
            {[1,2,3].map(i => <Skeleton.ConversationItem key={i} />)}
          </View>
        ) : (
          (conversationsQuery.data || []).filter(c => c.id !== id).map(conv => (
            <BottomSheetItem
              key={conv.id}
              label={conversationName(conv, user?.id, t)}
              icon={<Avatar uri={conversationAvatar(conv, user?.id)} name={conversationName(conv, user?.id, t)} size="sm" />}
              onPress={async () => {
                if (!forwardMsg) return;
                try {
                  const targetMember = conv.members?.find((m: ConversationMember) => m.userId !== user?.id);
                  const targetRecipientId = targetMember?.userId;
                  const forwardContent = forwardMsg.content || forwardMsg.mediaUrl || '';

                  if (targetRecipientId && forwardContent) {
                    const has = await hasEstablishedSession(targetRecipientId);
                    if (!has) {
                      const { bundle } = await fetchPreKeyBundle(targetRecipientId);
                      await createInitiatorSession(targetRecipientId, 1, bundle);
                    }
                    const signalMsg = await signalEncrypt(targetRecipientId, 1, forwardContent);
                    const clientMessageId = `fwd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                    const e2eFields = {
                      conversationId: conv.id,
                      clientMessageId,
                      encryptedContent: toBase64(signalMsg.ciphertext),
                      e2eVersion: 1,
                      e2eSenderDeviceId: 1,
                      e2eSenderRatchetKey: toBase64(signalMsg.header.senderRatchetKey),
                      e2eCounter: signalMsg.header.counter,
                      e2ePreviousCounter: signalMsg.header.previousCounter,
                      messageType: forwardMsg.messageType || 'TEXT',
                    };
                    // F5: Try sealed sender for forward path too
                    try {
                      const recipientKey = await loadKnownIdentityKey(targetRecipientId);
                      if (recipientKey && user?.id) {
                        const envelope = await sealMessage(targetRecipientId, recipientKey, user.id, 1, toBase64(signalMsg.ciphertext));
                        socketRef.current?.emit('send_sealed_message', {
                          ...e2eFields,
                          recipientId: envelope.recipientId,
                          ephemeralKey: envelope.ephemeralKey,
                          sealedCiphertext: envelope.sealedCiphertext,
                        });
                      } else {
                        socketRef.current?.emit('send_message', e2eFields);
                      }
                    } catch {
                      socketRef.current?.emit('send_message', e2eFields);
                    }
                  }
                  setForwardMsg(null);
                  haptic.success();
                  showToast({ message: t('messages.forwardedSuccess', { name: conversationName(conv, user?.id, t) }), variant: 'success' });
                } catch {
                  showToast({ message: t('errors.encryptionFailed'), variant: 'error' });
                }
              }}
            />
          ))
        )}
      </BottomSheet>

      {/* Reaction picker */}
      <BottomSheet
        visible={!!contextMenuMsg && showReactionPicker}
        onClose={() => {
          setShowReactionPicker(false);
          setContextMenuMsg(null);
        }}
        snapPoint={180}
      >
        <View style={styles.reactionPicker}>
          <Text style={[styles.reactionPickerTitle, { color: tc.text.secondary }]}>{t('risalah.reactWith')}</Text>
          <View style={styles.reactionGrid}>
            {['❤️', '👍', '😂', '😮', '😢', '🤲'].map((emoji) => (
              <Pressable
                accessibilityLabel={t('accessibility.close')}
                accessibilityRole="button"
                key={emoji}
                style={[styles.reactionButton, { backgroundColor: tc.bgElevated }]}
                onPress={() => {
                  if (contextMenuMsg) {
                    messagesApi.reactToMessage(id, contextMenuMsg.id, emoji)
                      .then(() => {
                        queryClient.invalidateQueries({ queryKey: ['messages', id] });
                        haptic.like();
                      })
                      .catch(() => showToast({ message: t('errors.addReactionFailed'), variant: 'error' }));
                  }
                  setShowReactionPicker(false);
                  setContextMenuMsg(null);
                }}
              >
                <Text style={styles.reactionEmojiBig}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </BottomSheet>

      {/* GIF picker */}
      <GifPicker
        visible={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onSelect={async (gifUrl) => {
          const convoData = convoQuery.data;
          const isGroup = convoData?.isGroup === true;
          const wrappedGif = JSON.stringify({ t: 'GIF', c: gifUrl });
          const clientMessageId = `gif_${Date.now()}_${Math.random().toString(36).slice(2)}`;

          try {
            if (isGroup) {
              let senderKeyMsg;
              try {
                senderKeyMsg = await encryptGroupMessage(id, wrappedGif);
              } catch (err) {
                if (String(err).includes('No sender key')) {
                  await generateSenderKey(id);
                  senderKeyMsg = await encryptGroupMessage(id, wrappedGif);
                } else { throw err; }
              }
              emitEncryptedMessage({
                e2ePayload: {
                  encryptedContent: toBase64(senderKeyMsg.ciphertext),
                  e2eVersion: 1,
                  e2eSenderDeviceId: 1,
                  e2eSenderRatchetKey: toBase64(senderKeyMsg.signature),
                  e2eCounter: senderKeyMsg.counter,
                  e2ePreviousCounter: senderKeyMsg.generation,
                  clientMessageId,
                  e2eSenderKeyId: senderKeyMsg.chainId,
                },
                replyToId: replyTo?.id,
              });
            } else {
              const otherMember = convoData?.members?.find((m: ConversationMember) => m.userId !== user?.id);
              if (otherMember?.userId) {
                const hasSession = await hasEstablishedSession(otherMember.userId);
                if (!hasSession) {
                  const { bundle } = await fetchPreKeyBundle(otherMember.userId);
                  await createInitiatorSession(otherMember.userId, 1, bundle);
                }
                const signalMsg = await signalEncrypt(otherMember.userId, 1, wrappedGif);
                emitEncryptedMessage({
                  e2ePayload: {
                    encryptedContent: toBase64(signalMsg.ciphertext),
                    e2eVersion: 1,
                    e2eSenderDeviceId: 1,
                    e2eSenderRatchetKey: toBase64(signalMsg.header.senderRatchetKey),
                    e2eCounter: signalMsg.header.counter,
                    e2ePreviousCounter: signalMsg.header.previousCounter,
                    clientMessageId,
                  },
                  replyToId: replyTo?.id,
                });
              }
            }
          } catch {
            showToast({ message: t('errors.encryptionFailed'), variant: 'error' });
          }
          setShowGifPicker(false);
          setReplyTo(null);
        }}
      />
    </View>
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    gap: spacing.sm,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },

  // Search header
  searchHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    gap: spacing.sm,
  },
  searchInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.dark.bgCard, borderRadius: radius.full,
  },
  searchInput: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
  },
  cancelBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
  },
  cancelText: {
    color: colors.emerald, fontSize: fontSize.base, fontWeight: '600',
  },

  // Typing styles moved to shared <TypingIndicator /> component

  loaderWrap: { flex: 1, padding: spacing.base, justifyContent: 'center' },
  messageList: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, flexGrow: 1 },
  scrollToBottomFab: {
    position: 'absolute',
    end: spacing.base,
    bottom: 80,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgSheet,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: colors.glass.border,
  },

  dateSep: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: spacing.md, paddingHorizontal: spacing.base, gap: spacing.sm,
  },
  dateSepLine: { flex: 1, height: 0.5, backgroundColor: colors.dark.border },
  dateSepText: { color: colors.text.tertiary, fontSize: fontSize.xs, fontWeight: '500' },

  senderName: {
    color: colors.emerald, fontSize: fontSize.xs, fontWeight: '700',
    marginBottom: 2,
  },

  bubbleWrap: {
    flexDirection: 'row', alignItems: 'flex-end', marginVertical: 1, gap: spacing.xs,
  },
  bubbleWrapOwn: { flexDirection: 'row-reverse' },
  bubbleWrapGrouped: { marginVertical: 1 },
  bubble: {
    maxWidth: '78%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2,
  },
  bubbleOwn: { backgroundColor: 'transparent' },
  bubbleOther: { backgroundColor: colors.dark.surface, borderWidth: 1, borderColor: colors.dark.borderLight },
  deletedMsg: { color: colors.text.tertiary, fontSize: fontSize.sm, fontStyle: 'italic', paddingVertical: spacing.xs },
  systemMessageWrap: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
  },
  systemMessageBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  systemMessageText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    flex: 1,
  },
  replyPreview: {
    borderStartWidth: 3, borderStartColor: 'rgba(255,255,255,0.4)',
    paddingStart: spacing.xs, marginBottom: spacing.xs,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.sm,
    padding: spacing.xs,
  },
  replyPreviewEmeraldBorder: { borderStartColor: colors.emerald },
  forwardedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  forwardedText: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
  replyPreviewUser: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.xs, fontWeight: '700' },
  replyPreviewUserOther: { color: colors.emerald },
  replyPreviewText: { color: 'rgba(255,255,255,0.6)', fontSize: fontSize.xs },
  replyPreviewTextOther: { color: colors.text.secondary },
  bubbleMedia: { width: 200, height: 200, borderRadius: radius.md, marginBottom: spacing.xs },
  bubbleText: { color: colors.text.inverse, fontSize: fontSize.base, lineHeight: 22 },
  bubbleTextOwn: { color: '#fff' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2, justifyContent: 'flex-end' },
  editedLabel: { color: 'rgba(0,0,0,0.4)', fontSize: fontSizeExt.tiny },
  editedLabelOwn: { color: 'rgba(255,255,255,0.6)' },
  bubbleTime: { color: 'rgba(0,0,0,0.4)', fontSize: fontSizeExt.tiny },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.6)' },
  reactions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginEnd: spacing.xs,
    marginTop: spacing.xs,
  },
  reactionChipOwn: {
    backgroundColor: colors.active.emerald10,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: {
    fontSize: 11,
    color: colors.text.secondary,
    marginStart: 2,
  },

  emptyWrap: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 80, gap: spacing.md },
  emptyName: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  emptyHint: { color: colors.text.secondary, fontSize: fontSize.sm },

  inputWrap: {
    borderTopWidth: 0.5, borderTopColor: colors.dark.border,
    backgroundColor: colors.dark.bg,
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : spacing.sm,
  },
  replyBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.base, paddingVertical: spacing.xs,
    backgroundColor: colors.dark.bgElevated,
    borderStartWidth: 3, borderStartColor: colors.emerald,
  },
  replyBannerContent: { flex: 1 },
  replyBannerUser: { color: colors.emerald, fontSize: fontSize.xs, fontWeight: '700' },
  replyBannerText: { color: colors.text.secondary, fontSize: fontSize.xs },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.sm, paddingTop: spacing.sm, gap: spacing.sm,
  },
  attachBtn: { paddingBottom: spacing.sm },
  input: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    maxHeight: 120, minHeight: 38,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full, paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 6,
    borderWidth: 0.5, borderColor: colors.dark.border,
  },
  sendCircle: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center',
  },
  micBtn: { paddingBottom: spacing.sm },
  micBtnRecording: { opacity: 0.7 },
  voicePlayer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.xs, minWidth: 140,
  },
  voiceWaveform: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 24,
  },
  voiceBar: { width: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
  voiceBarOwn: { backgroundColor: 'rgba(255,255,255,0.6)' },
  voiceBarOther: { backgroundColor: colors.emerald },
  swipeAction: { justifyContent: "center", alignItems: "center", width: 60, backgroundColor: colors.dark.bgElevated },
  reactionPicker: {
    padding: spacing.base,
    alignItems: 'center',
  },
  reactionPickerTitle: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  reactionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  reactionButton: {
    padding: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.dark.bgElevated,
  },
  reactionEmojiBig: {
    fontSize: fontSizeExt.heading,
  },
  gifPicker: {
    flex: 1,
    maxHeight: 400,
  },
  gifSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
    gap: spacing.sm,
  },
  gifSearchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: fontSize.base,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 6,
    borderWidth: 0.5,
    borderColor: colors.dark.border,
  },
  gifSearchButton: {
    padding: spacing.sm,
  },
  gifLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  gifGrid: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  gifItem: {
    flex: 1,
    margin: spacing.xs,
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.dark.bgElevated,
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  gifBtn: { paddingBottom: spacing.sm },
  micButtonWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slideCancelIndicator: {
    position: 'absolute',
    start: 50,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: radius.full,
    padding: spacing.xs,
  },
  recordingOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dark.bg,
    borderTopWidth: 0.5,
    borderTopColor: colors.dark.border,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.error,
  },
  recordingTimer: {
    color: colors.text.primary,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  slideCancelHint: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dark.bgCard,
    marginHorizontal: spacing.base,
    marginVertical: spacing.xs,
    borderRadius: radius.md,
    opacity: 0.7,
  },
  pendingText: {
    color: colors.text.secondary,
    fontSize: fontSize.base,
    flex: 1,
    marginEnd: spacing.sm,
  },
  readReceipts: {
    flexDirection: 'row',
    alignItems: 'center',
    marginStart: spacing.xs,
  },
  readReceiptAvatar: {
    marginStart: -6,
    borderWidth: 1,
    borderColor: colors.dark.bg,
  },
  readReceiptMore: {
    marginStart: 2,
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  readTime: {
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    marginStart: spacing.xs,
  },
  quickReactions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.dark.border,
    marginBottom: spacing.xs,
  },
  quickReactionBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickReactionEmoji: {
    fontSize: fontSize.xl,
  },
  encryptionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.active.emerald10,
    gap: spacing.xs,
  },
  encryptionBannerText: {
    color: colors.emerald,
    fontSize: fontSize.xs,
  },
  undoSendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dark.bgCard,
    padding: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    marginHorizontal: spacing.base,
    marginBottom: spacing.xs,
  },
  undoSendText: {
    color: colors.text.secondary,
    fontSize: fontSize.sm,
  },
  undoSendAction: {
    color: colors.emerald,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
});
