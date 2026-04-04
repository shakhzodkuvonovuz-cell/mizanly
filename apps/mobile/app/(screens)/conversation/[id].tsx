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
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { ProgressiveImage } from '@/components/ui/ProgressiveImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser, useAuth } from '@clerk/clerk-expo';
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
import { useStore } from '@/store';
import { colors, spacing, fontSize, radius, animation, fontSizeExt, fonts } from '@/theme';
import { messagesApi, uploadApi, aiApi } from '@/services/api';
import { resizeForUpload } from '@/utils/imageResize';
import {
  encryptMessage as signalEncrypt,
  decryptMessage as signalDecrypt,
  hasEstablishedSession,
  createInitiatorSession,
  createResponderSession,
  fetchPreKeyBundle,
  cacheDecryptedMessage,
  indexMessage,
  generateSenderKey,
  encryptGroupMessage,
  decryptGroupMessage,
  resetSession,
  encryptSmallMediaFile,
  uploadEncryptedMedia,
} from '@/services/signal';
import { encryptMessage as signalEncryptRaw } from '@/services/signal/session';
import { uploadSenderKey } from '@/services/signal/e2eApi';
import { toBase64, fromBase64, utf8Encode } from '@/services/signal/crypto';
import { loadIdentityKeyPair, loadRegistrationId, loadKnownIdentityKey } from '@/services/signal/storage';
import { sealMessage } from '@/services/signal/sealed-sender';
import type { PreKeySignalMessage } from '@/services/signal/types';
import type { Message, Conversation, ConversationMember } from '@/types';
import { rtlFlexRow, rtlTextAlign, rtlArrow, rtlMargin, rtlBorderStart } from '@/utils/rtl';
import { useSocket } from '@/providers/SocketProvider';
import {
  enqueueMessage as enqueueOfflineMessage,
  dequeueMessage as dequeueOfflineMessage,
  getRetryableMessages,
  processQueue,
} from '@/services/offlineMessageQueue';
import { ScreenErrorBoundary } from '@/components/ui/ScreenErrorBoundary';
import { ImageLightbox } from '@/components/ui/ImageLightbox';
import { RichText } from '@/components/ui/RichText';
import { navigate } from '@/utils/navigation';
import { TypingIndicator } from '@/components/risalah/TypingIndicator';

// #region Types & Constants
import { TenorGifResult, searchTenorGifs, getTenorFeatured } from '@/services/tenorService';

// Extended message type for Signal Protocol E2E encryption fields (server passthrough)
interface EncryptedMessage extends Message {
  isEncrypted?: boolean;
  encryptedContent?: string; // Base64 ciphertext
  e2eVersion?: number;
  e2eSenderDeviceId?: number;
  e2eSenderRatchetKey?: string; // Base64: DH public key (1:1) or signature (group)
  e2eCounter?: number;
  e2ePreviousCounter?: number;
  e2eSenderKeyId?: number;       // Present ONLY for group messages (Sender Key chainId)
  senderId?: string;
  // PreKeySignalMessage fields (present only on first-contact messages)
  e2eIdentityKey?: string;       // Base64: sender's Ed25519 identity key
  e2eEphemeralKey?: string;      // Base64: sender's X25519 ephemeral key
  e2eSignedPreKeyId?: number;    // ID of our SPK they used
  e2ePreKeyId?: number;          // ID of our OTP they used (optional)
  e2eRegistrationId?: number;    // Sender's registration ID
}


const QUICK_REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🤲'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Stable module-level select function — React Query memoizes when reference is stable
function selectMessagesReversed(data: { pages: Array<{ data: Message[]; meta: { cursor: string | null; hasMore: boolean } }>; pageParams: unknown[] }) {
  return {
    ...data,
    pages: [...data.pages].reverse().map((p) => ({
      ...p,
      data: [...p.data].reverse(),
    })),
  };
}

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

type PendingMessage = {
  id: string; // client-generated temporary ID
  content: string;
  createdAt: string;
  status: 'pending' | 'failed';
  replyToId?: string;
  // Signal Protocol E2E fields (populated by encrypt, used by emit)
  e2ePayload?: {
    encryptedContent: string;
    e2eVersion: number;
    e2eSenderDeviceId: number;
    e2eSenderRatchetKey: string;
    e2eCounter: number;
    e2ePreviousCounter: number;
    clientMessageId: string;
    // Group messages: sender key chainId for disambiguation
    e2eSenderKeyId?: number;
    // PreKeySignalMessage fields (first-contact only)
    e2eIdentityKey?: string;
    e2eEphemeralKey?: string;
    e2eSignedPreKeyId?: number;
    e2ePreKeyId?: number;
    e2eRegistrationId?: number;
    // Message type + media (encrypted payload metadata)
    messageType?: string;
    mediaUrl?: string;
  };
  // Sealed sender envelope for 1:1 retries
  sealedEnvelope?: { recipientId: string; ephemeralKey: string; sealedCiphertext: string };
};

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
  }, [playing, mediaUrl]);

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
  const [results, setResults] = useState<TenorGifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const tc = useThemeColors();

  const fetchGifs = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const data = query.trim()
        ? await searchTenorGifs(query)
        : await getTenorFeatured();
      setResults(data);
      if (data.length === 0 && !process.env.EXPO_PUBLIC_TENOR_API_KEY) {
        showToast({ message: t('errors.gifServiceNotConfigured'), variant: 'error' });
      }
    } catch (err) {
      showToast({ message: t('errors.gifLoadFailed'), variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchGifs('');
    }
  }, [visible, fetchGifs]);

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
            renderItem={({ item }) => (
              <Pressable
                style={[styles.gifItem, { backgroundColor: tc.bgElevated }]}
                onPress={() => onSelect(item.media_formats.gif.url)}
                accessibilityRole="button"
                accessibilityLabel={t('gif.selectGif')}
              >
                <ProgressiveImage
                  uri={item.media_formats.gif.url}
                  width="100%"
                  height={150}
                  blurhash={null}
                />
              </Pressable>
            )}
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
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: isGroupStart ? radius.xl : 4,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: isGroupEnd ? 4 : radius.xl,
  };
  const otherRadius = {
    borderTopLeftRadius: isGroupStart ? radius.xl : 4,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: isGroupEnd ? 4 : radius.xl,
    borderBottomRightRadius: radius.lg,
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
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const isOffline = useStore((s) => s.isOffline);
  const haptic = useContextualHaptic();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const flatListRef = useRef<FlatList>(null);
  const initialScrollDoneRef = useRef(false); // #27: Only scroll to end on initial load
  const { socket, isConnected: socketConnected } = useSocket();
  const socketRef = useRef(socket);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  const inputRef = useRef<TextInput>(null);
  const newMessageIdsRef = useRef(new Set<string>());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [text, setText] = useState('');
  const [sendAsSpoiler, setSendAsSpoiler] = useState(false);
  const [sendAsViewOnce, setSendAsViewOnce] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; content?: string; username: string } | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [deliveredMessages, setDeliveredMessages] = useState<Set<string>>(() => new Set());
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const pendingMessagesRef = useRef(pendingMessages);
  useEffect(() => {
    pendingMessagesRef.current = pendingMessages;
  }, [pendingMessages]);

  // Load persisted offline queue messages into React state on mount.
  // This ensures messages survive app crash / kill and are displayed immediately.
  useEffect(() => {
    const queued = getRetryableMessages(id);
    if (queued.length > 0) {
      const restored: PendingMessage[] = queued.map(q => ({
        id: q.id,
        content: q.content,
        createdAt: new Date(q.createdAt).toISOString(),
        status: 'pending' as const,
        replyToId: q.replyToId,
        e2ePayload: q.e2ePayload,
        sealedEnvelope: q.sealedEnvelope,
      }));
      setPendingMessages(prev => {
        // Avoid duplicates: only add messages not already in state
        const existingIds = new Set(prev.map(p => p.id));
        const newMsgs = restored.filter(r => !existingIds.has(r.id));
        return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
      });
    }
  // Only run on mount (id is stable for this screen instance)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingCounterRef = useRef(0);
  // Context menu
  const [contextMenuMsg, setContextMenuMsg] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  // GIF picker
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [gifResults, setGifResults] = useState<TenorGifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  // Message search
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Chat theme
  const [chatThemeBg, setChatThemeBg] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(`chat-theme:${id}`).then((val) => {
      if (val) {
        try {
          const saved = JSON.parse(val) as { themeId: string; opacity: number; blur: number };
          // Map theme ID to background color
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

  // E2E encryption — Signal Protocol is always on for all conversations.
  // Signal init happens in _layout.tsx at app startup. Here we just track
  // session readiness for UI indicators and decrypted content cache.
  const [isEncrypted] = useState(true); // Always encrypted via Signal Protocol
  const [decryptedContents, setDecryptedContents] = useState<Map<string, string>>(new Map());

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  // C7: Disappearing message enforcement is below, after convoQuery declaration.

  // Decrypt incoming E2E encrypted messages via Signal Protocol.
  // Handles 3 message types:
  //   1. PreKeySignalMessage (first contact — has e2eIdentityKey + e2eEphemeralKey)
  //   2. Regular SignalMessage (established session — has e2eSenderRatchetKey, no e2eIdentityKey)
  //   3. SenderKeyMessage (group — has e2eSenderKeyId)
  const getDecryptedContent = useCallback(async (message: EncryptedMessage) => {
    if (!message.encryptedContent || !message.e2eVersion) {
      // V5-F1: SYSTEM messages (join/leave, security code changed) are legitimately
      // plaintext from the server. All other message types MUST have E2E encryption
      // fields. A message without encryptedContent in an E2E conversation is either
      // a legacy pre-E2E message or a server-injected forgery. Show a warning.
      if (message.messageType === 'SYSTEM') {
        return message.content;
      }
      // Telemetry: a non-SYSTEM plaintext message in an E2E conversation
      // is either a legacy pre-E2E message or a server-injected forgery.
      import('@/services/signal/telemetry').then(({ recordE2EEvent }) =>
        recordE2EEvent({ event: 'message_decrypt_failed', metadata: { reason: 'plaintext_in_e2e_conversation', messageType: message.messageType ?? 'unknown' } }),
      ).catch(() => {});
      return '[This message was not end-to-end encrypted]';
    }
    const senderId = message.senderId ?? message.sender?.id;
    if (!senderId) return '[Encrypted message]';

    let decrypted: string;
    try {
      const isGroupMsg = message.e2eSenderKeyId !== undefined && message.e2eSenderKeyId !== null;
      const isPreKeyMsg = !!message.e2eIdentityKey && !!message.e2eEphemeralKey;

      if (isGroupMsg) {
        // ── GROUP MESSAGE (Sender Key) ──
        decrypted = await decryptGroupMessage(id, senderId, {
          groupId: id,
          chainId: message.e2eSenderKeyId!,
          generation: message.e2ePreviousCounter ?? 0,
          counter: message.e2eCounter ?? 0,
          ciphertext: fromBase64(message.encryptedContent),
          signature: fromBase64(message.e2eSenderRatchetKey ?? ''),
        });
      } else if (isPreKeyMsg) {
        // ── FIRST-CONTACT MESSAGE (PreKeySignalMessage → create responder session) ──
        const preKeyMsg: PreKeySignalMessage = {
          registrationId: message.e2eRegistrationId ?? 0,
          deviceId: message.e2eSenderDeviceId ?? 1,
          preKeyId: message.e2ePreKeyId,
          signedPreKeyId: message.e2eSignedPreKeyId ?? 0,
          identityKey: fromBase64(message.e2eIdentityKey!),
          ephemeralKey: fromBase64(message.e2eEphemeralKey!),
          message: {
            header: {
              senderRatchetKey: fromBase64(message.e2eSenderRatchetKey ?? ''),
              counter: message.e2eCounter ?? 0,
              previousCounter: message.e2ePreviousCounter ?? 0,
            },
            ciphertext: fromBase64(message.encryptedContent),
          },
        };
        // Create responder session from X3DH material, then decrypt
        await createResponderSession(senderId, preKeyMsg.deviceId, preKeyMsg);
        decrypted = await signalDecrypt(
          senderId,
          preKeyMsg.deviceId,
          preKeyMsg.message,
          preKeyMsg.preKeyId,
        );
      } else {
        // ── REGULAR MESSAGE (established Double Ratchet session) ──
        decrypted = await signalDecrypt(
          senderId,
          message.e2eSenderDeviceId ?? 1,
          {
            header: {
              senderRatchetKey: fromBase64(message.e2eSenderRatchetKey ?? ''),
              counter: message.e2eCounter ?? 0,
              previousCounter: message.e2ePreviousCounter ?? 0,
            },
            ciphertext: fromBase64(message.encryptedContent),
          },
        );
      }

      // E3: Unwrap the JSON envelope to extract real message type + content.
      // The envelope format is { t: 'TEXT', c: 'actual content' }.
      // Backward compat: if decrypted string is not valid JSON or has no 't' field,
      // treat the entire string as plaintext TEXT content.
      let realContent = decrypted;
      let realMessageType = message.messageType ?? 'TEXT';
      try {
        const envelope = JSON.parse(decrypted);
        if (envelope && typeof envelope.c === 'string' && typeof envelope.t === 'string') {
          realContent = envelope.c;
          realMessageType = envelope.t;
        }
      } catch {
        // Not a JSON envelope — legacy plaintext message, use as-is
      }

      // Cache and index for search.
      // C7: Disappearing messages — if conversation has a timer, set expiresAt.
      const convo = convoQuery.data;
      const disappearSec = convo?.disappearingDuration;
      const createdAtMs = new Date(message.createdAt).getTime();
      const expiresAt = disappearSec && disappearSec > 0
        ? createdAtMs + disappearSec * 1000
        : undefined;

      cacheDecryptedMessage({
        messageId: message.id,
        conversationId: id,
        senderId,
        content: realContent,
        messageType: realMessageType,
        createdAt: createdAtMs,
        expiresAt,
      }).catch(() => {});
      // Don't index disappearing messages for search (they should vanish completely)
      if (!expiresAt) {
        indexMessage(message.id, id, realContent, createdAtMs).catch(() => {});
      }
      return realContent;
    } catch (err) {
      // V5-F3: Do NOT auto-reset sessions on decrypt failure.
      // Previously: a corrupted message from a malicious server triggered resetSession(),
      // forcing re-establishment via X3DH with a potentially substituted bundle (MITM).
      // Now: display error, let the user manually reset if needed via conversation info.
      // The session state is preserved — subsequent messages may still decrypt.
      return '[Encrypted message]';
    }
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

  const convoQuery = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => messagesApi.getConversation(id),
  });

  // C7: Disappearing message enforcement — periodic cleanup of expired cached messages.
  useEffect(() => {
    const disappearSec = convoQuery.data?.disappearingDuration;
    if (!disappearSec || disappearSec <= 0) return;
    const interval = setInterval(() => {
      setDecryptedContents(prev => new Map(prev)); // Force re-render → cache filters expired
    }, Math.min(disappearSec * 1000, 30000));
    return () => clearInterval(interval);
  }, [convoQuery.data]);

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', id],
    queryFn: ({ pageParam }) =>
      messagesApi.getMessages(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    select: selectMessagesReversed,
  });

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.getConversations(),
    enabled: !!forwardMsg,
  });

  // Pinned messages query
  const pinnedQuery = useQuery({
    queryKey: ['pinned-messages', id],
    queryFn: () => messagesApi.getPinned(id as string),
    enabled: !!id,
  });

  useEffect(() => {
    if (pinnedQuery.data && Array.isArray(pinnedQuery.data) && pinnedQuery.data.length > 0) {
      setPinnedMessage(pinnedQuery.data[0]);
    }
  }, [pinnedQuery.data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([messagesQuery.refetch(), convoQuery.refetch()]);
    setRefreshing(false);
  }, [messagesQuery, convoQuery]);

  const messages = (messagesQuery.data?.pages.flatMap((p) => p.data) ?? []) as EncryptedMessage[];

  // Pre-decrypt E2E encrypted messages with concurrency limit to avoid ANR (#2)
  useEffect(() => {
    const DECRYPT_BATCH_SIZE = 5;
    const toDecrypt = messages.filter(
      msg => msg.encryptedContent && msg.e2eVersion && !decryptedContents.has(msg.id),
    );
    if (toDecrypt.length === 0) return;

    let cancelled = false;
    (async () => {
      for (let i = 0; i < toDecrypt.length; i += DECRYPT_BATCH_SIZE) {
        if (cancelled) break;
        const batch = toDecrypt.slice(i, i + DECRYPT_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(msg => getDecryptedContent(msg).then(d => ({ id: msg.id, content: d }))),
        );
        if (cancelled) break;
        setDecryptedContents(prev => {
          const next = new Map(prev);
          let changed = false;
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value.content && !next.has(r.value.id)) {
              next.set(r.value.id, r.value.content);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const combinedMessages = [...messages, ...pendingMessages.map(p => ({
    ...p,
    // Convert PendingMessage to a shape compatible with Message
    id: p.id,
    content: p.content,
    createdAt: p.createdAt,
    sender: user ? { id: user.id, displayName: user.fullName || user.username, avatarUrl: user.imageUrl, username: user.username } : { id: 'pending', displayName: 'You', avatarUrl: '', username: 'pending' },
    messageType: 'TEXT',
    replyToId: p.replyToId,
  isForwarded: false, isDeleted: false,
  } as Message))];
  const filteredMessages = searchQuery.trim()
    ? combinedMessages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : combinedMessages;
  // We'll need to adjust buildMessageList to handle pending vs real messages

  // Register event listeners on the shared socket for this conversation
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      socket.emit('join_conversation', { conversationId: id });
      // Refetch messages to catch any missed during disconnection
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
      // Process persistent offline queue — messages survive app crash.
      // Only retries messages with e2ePayload (already encrypted before disconnect).
      // Codex-V7-F1 FIX: Never sends plaintext on reconnect.
      processQueue(async (queuedMsg) => {
        if (!queuedMsg.e2ePayload) return false; // Never send unencrypted
        const result = await emitEncryptedMessage({
          e2ePayload: queuedMsg.e2ePayload,
          replyToId: queuedMsg.replyToId,
          sealedEnvelope: queuedMsg.sealedEnvelope,
        });
        return result !== null; // null = still offline
      }, id).then(({ sent }) => {
        if (sent > 0) {
          // Remove successfully sent messages from React state
          const retryable = new Set(getRetryableMessages(id).map(m => m.id));
          setPendingMessages(prev => prev.filter(p => retryable.has(p.id)));
          queryClient.invalidateQueries({ queryKey: ['messages', id] });
        }
      });
      // Also retry React-state-only pending messages (sent in current session, not yet in MMKV)
      const pending = pendingMessagesRef.current.filter(p => p.status === 'pending' && p.e2ePayload);
      pending.forEach(p => {
        if (p.e2ePayload) {
          emitEncryptedMessage({
            e2ePayload: p.e2ePayload,
            replyToId: p.replyToId,
            sealedEnvelope: p.sealedEnvelope,
          });
        }
      });
    };

    const handleNewMessage = (msg: Message & { clientId?: string }) => {
      // Note: LayoutAnimation removed to avoid conflicts with react-native-reanimated
      newMessageIdsRef.current.add(msg.id);
      // Remove any pending message that matches this incoming message
      const pending = pendingMessagesRef.current;
      const matchedIndex = pending.findIndex(p =>
        p.id === msg.clientId ||
        (p.content === msg.content && Date.now() - new Date(p.createdAt).getTime() < 30000)
      );
      if (matchedIndex >= 0) {
        // Also remove from persistent MMKV queue if it was a crash-survived message
        const matchedMsg = pending[matchedIndex];
        if (matchedMsg.id.startsWith('q_')) {
          dequeueOfflineMessage(matchedMsg.id);
        }
        setPendingMessages(prev => prev.filter((_, i) => i !== matchedIndex));
      }
      queryClient.setQueryData<{ pages: { data: Message[]; meta: { cursor: string | null; hasMore: boolean } }[]; pageParams: (string | undefined)[] }>(['messages', id], (old) => {
        if (!old) return old;
        const pages = [...old.pages];
        const lastPage = { ...pages[pages.length - 1] };
        lastPage.data = [...lastPage.data, msg];
        pages[pages.length - 1] = lastPage;
        return { ...old, pages };
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      // Remove from new message set after animation completes
      setTimeout(() => {
        newMessageIdsRef.current.delete(msg.id);
      }, 500);
      // Delivery receipt: the messageId is a server-assigned ID that the server
      // already knows (it created the message record). Encrypting it provides
      // zero additional confidentiality. The real metadata concern (C8) is WHEN
      // you read — which is the event timestamp, visible regardless of encryption.
      // True receipt privacy requires sealed sender (C11) to hide WHO read it.
      if (msg.sender?.id !== user?.id) {
        socket.emit('message_delivered', { messageId: msg.id, conversationId: id });
      }
    };

    const handleDeliveryReceipt = ({ messageId }: { messageId: string; deliveredAt: string; deliveredTo: string }) => {
      setDeliveredMessages(prev => {
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });
    };

    const handleUserTyping = ({ userId, isTyping: typing }: { userId: string; isTyping: boolean }) => {
      if (userId !== user?.id) {
        setOtherTyping(typing);
        // Auto-clear typing indicator after 5 seconds in case isTyping:false is never sent
        if (typing) {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 5000);
        } else if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }
    };

    // Listen for read receipts — refetch conversation to update readByMembers timestamps
    const handleMessagesRead = ({ userId: readerId }: { userId: string }) => {
      if (readerId !== user?.id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', id] });
      }
    };

    // F5: Handle sealed sender messages — unseal the envelope to reveal sender + inner ciphertext
    const handleSealedMessage = async (data: {
      ephemeralKey: string;
      sealedCiphertext: string;
      conversationId: string;
    }) => {
      if (data.conversationId !== id) return;
      try {
        const { unsealMessage } = await import('@/services/signal/sealed-sender');
        const unsealed = await unsealMessage({
          recipientId: user?.id ?? '',
          ephemeralKey: data.ephemeralKey,
          sealedCiphertext: data.sealedCiphertext,
        });
        // The unsealed content reveals the sender and the inner Signal ciphertext.
        // The actual message will arrive via new_message from the server's persistence.
        // This sealed_message event is for real-time delivery — the DB message follows.
        // For now, we just log that sealed delivery succeeded (the new_message handler
        // will add the message to the UI when the server broadcasts it).
      } catch {
        // Unsealing failed — the message may be forged or from an unknown sender.
        // The regular new_message event will still arrive from server persistence.
      }
    };

    socket.on('connect', handleConnect);
    socket.on('new_message', handleNewMessage);
    socket.on('delivery_receipt', handleDeliveryReceipt);
    socket.on('user_typing', handleUserTyping);
    socket.on('messages_read', handleMessagesRead);
    socket.on('sealed_message', handleSealedMessage);

    // If already connected when this effect runs, join the room
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      // Leave conversation room on unmount
      socket.emit('leave_conversation', { conversationId: id });
      socket.off('connect', handleConnect);
      socket.off('new_message', handleNewMessage);
      socket.off('delivery_receipt', handleDeliveryReceipt);
      socket.off('user_typing', handleUserTyping);
      socket.off('messages_read', handleMessagesRead);
      socket.off('sealed_message', handleSealedMessage);
    };
  }, [socket, id, user?.id, queryClient]);

  const markedReadRef = useRef<string | null>(null);
  useEffect(() => {
    if (markedReadRef.current === id) return;
    markedReadRef.current = id;
    messagesApi.markRead(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => {});
  }, [id, queryClient]);

  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false); // #15: Ref-based guard to prevent double-tap (setState is async)
  const tc = useThemeColors();
  // Undo-via-delete: message is sent IMMEDIATELY to server (Telegram-fast),
  // but user has 5 seconds to undo. Undo = server-side delete before recipient reads.
  // This gives ~100ms recipient latency instead of 5000ms.
  const [undoPending, setUndoPending] = useState<{
    pendingId: string;
    serverMessageId: string | null; // Set after ACK from server
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Clean up undo timer on unmount
  useEffect(() => {
    return () => {
      if (undoPending?.timer) clearTimeout(undoPending.timer);
    };
  }, [undoPending]);

  const handleUndoSend = useCallback(() => {
    if (!undoPending) return;
    clearTimeout(undoPending.timer);
    // Remove optimistic pending message from UI
    setPendingMessages(prev => prev.filter(p => p.id !== undoPending.pendingId));
    // Delete from server (message was already sent — undo = "delete for everyone")
    if (undoPending.serverMessageId) {
      messagesApi.deleteMessage(id, undoPending.serverMessageId).catch(() => {
        // Server delete failed — message stays. This is the edge case where
        // recipient may have already seen it. Same as WhatsApp "Delete for Everyone".
      });
    }
    setUndoPending(null);
    haptic.delete();
  }, [undoPending, haptic, id]);

  /**
   * Emit an encrypted message to the server IMMEDIATELY via socket.
   * Returns the server-assigned messageId from the ACK callback.
   * The message reaches the recipient in ~100ms (network latency only).
   *
   * F5: For 1:1 messages, wraps in a sealed envelope and sends via
   * `send_sealed_message` — the server cannot determine the sender from
   * socket metadata. For group messages, uses regular `send_message`.
   */
  const emitEncryptedMessage = useCallback((payload: {
    e2ePayload: NonNullable<PendingMessage['e2ePayload']>;
    replyToId?: string;
    isSpoiler?: boolean;
    isViewOnce?: boolean;
    messageType?: string;
    mediaUrl?: string;
    // F5: Sealed sender fields (1:1 only)
    sealedEnvelope?: { recipientId: string; ephemeralKey: string; sealedCiphertext: string };
  }): Promise<string | null> => {
    return new Promise((resolve) => {
      if (isOffline || !socketRef.current?.connected) {
        resolve(null);
        return;
      }

      const isGroupMessage = payload.e2ePayload.e2eSenderKeyId !== undefined;

      if (!isGroupMessage && payload.sealedEnvelope) {
        // F5: 1:1 message — use sealed sender (server can't see sender identity)
        socketRef.current.emit('send_sealed_message', {
          conversationId: id,
          recipientId: payload.sealedEnvelope.recipientId,
          ephemeralKey: payload.sealedEnvelope.ephemeralKey,
          sealedCiphertext: payload.sealedEnvelope.sealedCiphertext,
          // Pass through E2E fields for server-side persistence
          clientMessageId: payload.e2ePayload.clientMessageId,
          encryptedContent: payload.e2ePayload.encryptedContent,
          e2eVersion: payload.e2ePayload.e2eVersion,
          e2eSenderDeviceId: payload.e2ePayload.e2eSenderDeviceId,
          e2eSenderRatchetKey: payload.e2ePayload.e2eSenderRatchetKey,
          e2eCounter: payload.e2ePayload.e2eCounter,
          e2ePreviousCounter: payload.e2ePayload.e2ePreviousCounter,
          ...(payload.e2ePayload.e2eIdentityKey ? { e2eIdentityKey: payload.e2ePayload.e2eIdentityKey } : {}),
          ...(payload.e2ePayload.e2eEphemeralKey ? { e2eEphemeralKey: payload.e2ePayload.e2eEphemeralKey } : {}),
          ...(payload.e2ePayload.e2eSignedPreKeyId !== undefined ? { e2eSignedPreKeyId: payload.e2ePayload.e2eSignedPreKeyId } : {}),
          ...(payload.e2ePayload.e2ePreKeyId !== undefined ? { e2ePreKeyId: payload.e2ePayload.e2ePreKeyId } : {}),
          ...(payload.e2ePayload.e2eRegistrationId !== undefined ? { e2eRegistrationId: payload.e2ePayload.e2eRegistrationId } : {}),
          messageType: payload.e2ePayload.messageType ?? payload.messageType ?? 'TEXT',
          replyToId: payload.replyToId,
          mediaUrl: payload.mediaUrl,
          ...(payload.isSpoiler ? { isSpoiler: true } : {}),
          ...(payload.isViewOnce ? { isViewOnce: true } : {}),
        }, (ack: { success?: boolean; messageId?: string } | undefined) => {
          resolve(ack?.messageId ?? null);
        });
      } else {
        // Group message or no sealed envelope — use regular send_message
        socketRef.current.emit('send_message', {
          conversationId: id,
          clientMessageId: payload.e2ePayload.clientMessageId,
          encryptedContent: payload.e2ePayload.encryptedContent,
          e2eVersion: payload.e2ePayload.e2eVersion,
          e2eSenderDeviceId: payload.e2ePayload.e2eSenderDeviceId,
          e2eSenderRatchetKey: payload.e2ePayload.e2eSenderRatchetKey,
          e2eCounter: payload.e2ePayload.e2eCounter,
          e2ePreviousCounter: payload.e2ePayload.e2ePreviousCounter,
          ...(payload.e2ePayload.e2eSenderKeyId !== undefined ? { e2eSenderKeyId: payload.e2ePayload.e2eSenderKeyId } : {}),
          ...(payload.e2ePayload.e2eIdentityKey ? { e2eIdentityKey: payload.e2ePayload.e2eIdentityKey } : {}),
          ...(payload.e2ePayload.e2eEphemeralKey ? { e2eEphemeralKey: payload.e2ePayload.e2eEphemeralKey } : {}),
          ...(payload.e2ePayload.e2eSignedPreKeyId !== undefined ? { e2eSignedPreKeyId: payload.e2ePayload.e2eSignedPreKeyId } : {}),
          ...(payload.e2ePayload.e2ePreKeyId !== undefined ? { e2ePreKeyId: payload.e2ePayload.e2ePreKeyId } : {}),
          ...(payload.e2ePayload.e2eRegistrationId !== undefined ? { e2eRegistrationId: payload.e2ePayload.e2eRegistrationId } : {}),
          messageType: payload.e2ePayload.messageType ?? payload.messageType ?? 'TEXT',
          replyToId: payload.replyToId,
          mediaUrl: payload.mediaUrl,
          ...(payload.isSpoiler ? { isSpoiler: true } : {}),
          ...(payload.isViewOnce ? { isViewOnce: true } : {}),
        }, (ack: { success?: boolean; messageId?: string } | undefined) => {
          resolve(ack?.messageId ?? null);
        });
      }
      setTimeout(() => resolve(null), 3000);
    });
  }, [id, isOffline]);

  const lastSentRef = useRef<number>(0);
  const handleSend = useCallback(async () => {
    if (!text.trim() || isSending || isSendingRef.current) return;
    isSendingRef.current = true;

    // Finding #366: Slow mode enforcement — check client-side cooldown
    const slowMode = (convo as Record<string, unknown> | undefined)?.slowModeSeconds as number | undefined;
    if (slowMode && slowMode > 0) {
      const elapsed = (Date.now() - lastSentRef.current) / 1000;
      if (elapsed < slowMode) {
        const remaining = Math.ceil(slowMode - elapsed);
        showToast({ message: t('messages.slowMode', { seconds: remaining }), variant: 'info' });
        return;
      }
    }

    // Edit mode
    if (editingMsg) {
      setIsSending(true);
      messagesApi.editMessage(id, editingMsg.id, text.trim())
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['messages', id] });
          setEditingMsg(null);
          setText('');
        })
        .catch(() => showToast({ message: t('errors.editMessageFailed'), variant: 'error' }))
        .finally(() => setIsSending(false));
      return;
    }
    haptic.send();
    setIsSending(true);

    // E2E encryption via Signal Protocol — always on, never falls back to plaintext
    const messageContent = text.trim();
    let e2ePayload: PendingMessage['e2ePayload'] | undefined;
    // F5: Sealed sender envelope for 1:1 messages (set in the 1:1 encryption branch)
    let sealedEnvelopeForEmit: { recipientId: string; ephemeralKey: string; sealedCiphertext: string } | undefined;

    // Find the other conversation member for 1:1 encryption
    const convoData = convoQuery.data;
    const otherMember = convoData?.members?.find((m: ConversationMember) => m.userId !== user?.id);
    const recipientId = otherMember?.userId;

    const isGroupChat = convoData?.isGroup === true;

    if (isGroupChat) {
      // ── GROUP ENCRYPTION: Sender Keys (O(1) encrypt per message) ──
      try {
        // Helper: generate + distribute sender key to all members
        const ensureSenderKeyDistributed = async () => {
          await generateSenderKey(id);
          const memberIds = convoData?.members
            ?.map((m: ConversationMember) => m.userId)
            .filter((uid): uid is string => !!uid && uid !== user?.id) ?? [];
          // Establish pairwise sessions with each member for key distribution
          for (const memberId of memberIds) {
            const has = await hasEstablishedSession(memberId);
            if (!has) {
              try {
                const { bundle } = await fetchPreKeyBundle(memberId);
                await createInitiatorSession(memberId, 1, bundle);
              } catch { /* Member may not have E2E keys yet — they'll request redistribution */ }
            }
          }
          // Distribute: encrypt sender key bytes with each member's pairwise Double Ratchet session.
          // We use the session's encrypt function which produces a SignalMessage.
          // The sender key bytes (76 bytes) are small enough to fit in a single message.
          // We base64-encode the sender key bytes and encrypt as a text message,
          // then the recipient base64-decodes after decryption.
          const encryptForMember = async (rid: string, senderKeyBytes: Uint8Array): Promise<Uint8Array> => {
            const b64 = toBase64(senderKeyBytes);
            const msg = await signalEncryptRaw(rid, 1, b64);
            // Serialize: [ratchetKey:32][counter:4BE][prevCounter:4BE][ciphertextLen:4BE][ciphertext]
            const ct = msg.ciphertext;
            const serialized = new Uint8Array(32 + 4 + 4 + 4 + ct.length);
            serialized.set(msg.header.senderRatchetKey, 0);
            const view = new DataView(serialized.buffer);
            view.setUint32(32, msg.header.counter, false);
            view.setUint32(36, msg.header.previousCounter, false);
            view.setUint32(40, ct.length, false);
            serialized.set(ct, 44);
            return serialized;
          };
          const uploadToServer = async (groupId: string, recipientId: string, encKey: Uint8Array, chainId: number, gen: number) => {
            await uploadSenderKey(groupId, recipientId, encKey, chainId, gen);
          };
          await import('@/services/signal').then(s =>
            s.distributeSenderKeyToMembers(id, memberIds, encryptForMember, uploadToServer)
          );
        };

        let senderKeyMsg;
        try {
          senderKeyMsg = await encryptGroupMessage(id, messageContent);
        } catch (err) {
          if (String(err).includes('No sender key')) {
            await ensureSenderKeyDistributed();
            senderKeyMsg = await encryptGroupMessage(id, messageContent);
          } else {
            throw err;
          }
        }

        const clientMessageId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        e2ePayload = {
          encryptedContent: toBase64(senderKeyMsg.ciphertext),
          e2eVersion: 1,
          e2eSenderDeviceId: 1,
          e2eSenderRatchetKey: toBase64(senderKeyMsg.signature),
          e2eCounter: senderKeyMsg.counter,
          e2ePreviousCounter: senderKeyMsg.generation,
          clientMessageId,
          e2eSenderKeyId: senderKeyMsg.chainId, // A3: group message disambiguation
        };
      } catch {
        showToast({ message: t('errors.encryptionFailed'), variant: 'error' });
        setIsSending(false);
        isSendingRef.current = false;
        return;
      }
    } else if (recipientId) {
      // ── 1:1 ENCRYPTION: Double Ratchet ──
      try {
        const isFirstMessage = !(await hasEstablishedSession(recipientId));
        let signedPreKeyId: number | undefined;
        let oneTimePreKeyId: number | undefined;

        if (isFirstMessage) {
          // First contact: X3DH session establishment
          const { bundle } = await fetchPreKeyBundle(recipientId);
          const result = await createInitiatorSession(recipientId, 1, bundle);
          signedPreKeyId = result.signedPreKeyId;
          oneTimePreKeyId = result.oneTimePreKeyId;
        }

        // E3: Wrap plaintext with message type INSIDE the encryption envelope.
        // The server sees messageType:'TEXT' (opaque) for all encrypted messages.
        // The real type is inside the ciphertext — an observer cannot distinguish
        // text from images from voice notes by looking at the wire format.
        const wrappedContent = JSON.stringify({ t: 'TEXT', c: messageContent });
        const signalMsg = await signalEncrypt(recipientId, 1, wrappedContent);
        const clientMessageId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

        e2ePayload = {
          encryptedContent: toBase64(signalMsg.ciphertext),
          e2eVersion: 1,
          e2eSenderDeviceId: 1,
          e2eSenderRatchetKey: toBase64(signalMsg.header.senderRatchetKey),
          e2eCounter: signalMsg.header.counter,
          e2ePreviousCounter: signalMsg.header.previousCounter,
          clientMessageId,
        };

        // A1: For first-contact messages, include PreKeySignalMessage fields
        // so the RECEIVER can establish a responder session via X3DH
        if (isFirstMessage) {
          const identityKeyPair = await loadIdentityKeyPair();
          const regId = await loadRegistrationId();
          if (identityKeyPair && regId !== null) {
            e2ePayload.e2eIdentityKey = toBase64(identityKeyPair.publicKey);
            e2ePayload.e2eEphemeralKey = e2ePayload.e2eSenderRatchetKey;
            e2ePayload.e2eSignedPreKeyId = signedPreKeyId;
            e2ePayload.e2ePreKeyId = oneTimePreKeyId;
            e2ePayload.e2eRegistrationId = regId;
          }
        }

        // F5: Create sealed envelope for 1:1 messages.
        // The sealed envelope hides the sender's identity from the server.
        // The recipient unseals it client-side to reveal who sent it.
        try {
          const recipientIdentityKey = await loadKnownIdentityKey(recipientId);
          const senderIdentityPair = await loadIdentityKeyPair();
          if (recipientIdentityKey && senderIdentityPair && user?.id) {
            const envelope = await sealMessage(
              recipientId,
              recipientIdentityKey,
              user.id,
              1, // deviceId
              toBase64(signalMsg.ciphertext), // Inner content = Signal ciphertext
            );
            sealedEnvelopeForEmit = {
              recipientId: envelope.recipientId,
              ephemeralKey: envelope.ephemeralKey,
              sealedCiphertext: envelope.sealedCiphertext,
            };
          }
        } catch {
          // Sealed sender creation failed — fall back to regular send_message.
          // This is non-fatal: the message is still E2E encrypted, just without
          // the additional metadata protection layer.
        }
      } catch (err) {
        // CRITICAL: never send plaintext on encryption failure
        showToast({ message: t('errors.encryptionFailed'), variant: 'error' });
        setIsSending(false);
        isSendingRef.current = false;
        return;
      }
    }

    const pendingId = `pending_${Date.now()}_${++pendingCounterRef.current}`;
    const pendingMessage: PendingMessage = {
      id: pendingId,
      content: messageContent, // Displayed locally (never sent unencrypted)
      createdAt: new Date().toISOString(),
      status: 'pending',
      replyToId: replyTo?.id,
      e2ePayload,
    };
    setPendingMessages(prev => [...prev, pendingMessage]);
    lastSentRef.current = Date.now(); // Slow mode: track last send time
    const savedReplyToId = replyTo?.id;
    const savedSpoiler = sendAsSpoiler;
    const savedViewOnce = sendAsViewOnce;
    setText('');
    setReplyTo(null);
    setIsSending(false);
    isSendingRef.current = false;

    // Cancel any existing undo timer (previous undo window ends)
    if (undoPending?.timer) {
      clearTimeout(undoPending.timer);
    }

    // TELEGRAM-FAST: Send encrypted message IMMEDIATELY to server.
    // Recipient sees it in ~100ms (network latency only).
    // Undo = server-side delete within 5 seconds (like WhatsApp "Delete for Everyone").
    if (e2ePayload) {
      emitEncryptedMessage({
        e2ePayload,
        replyToId: savedReplyToId,
        sealedEnvelope: sealedEnvelopeForEmit, // F5: sealed sender for 1:1
        isSpoiler: savedSpoiler || undefined,
        isViewOnce: savedViewOnce || undefined,
      }).then((serverMessageId) => {
        if (serverMessageId === null) {
          // Offline or socket disconnected — persist to MMKV so message survives app crash.
          // The message is already in React state (pendingMessages) for immediate display.
          enqueueOfflineMessage({
            conversationId: id,
            content: messageContent,
            e2ePayload,
            sealedEnvelope: sealedEnvelopeForEmit,
            replyToId: savedReplyToId,
          });
          return;
        }
        // Start 5-second undo window AFTER emit (message is already in transit)
        const timer = setTimeout(() => {
          setUndoPending(null);
          // Remove from pending — server message takes over in the query cache
          setPendingMessages(prev => prev.filter(p => p.id !== pendingId));
          queryClient.invalidateQueries({ queryKey: ['messages', id] });
        }, 5000);
        setUndoPending({ pendingId, serverMessageId, timer });
      });
    }

    setSendAsSpoiler(false);
    setSendAsViewOnce(false);
  }, [text, replyTo, id, isSending, haptic, isOffline, editingMsg, queryClient, convoQuery.data, user?.id, undoPending, emitEncryptedMessage]);

  // Retry pending messages when network comes back online — process persistent MMKV queue.
  useEffect(() => {
    if (isOffline || !socketRef.current?.connected) return;
    // Process the persistent queue (MMKV) — handles crash-survived messages
    processQueue(async (queuedMsg) => {
      if (!queuedMsg.e2ePayload) return false;
      const result = await emitEncryptedMessage({
        e2ePayload: queuedMsg.e2ePayload,
        replyToId: queuedMsg.replyToId,
        sealedEnvelope: queuedMsg.sealedEnvelope,
      });
      return result !== null;
    }, id).then(({ sent }) => {
      if (sent > 0) {
        // Remove sent messages from React state
        const retryable = new Set(getRetryableMessages(id).map(m => m.id));
        setPendingMessages(prev => prev.filter(p => retryable.has(p.id)));
        queryClient.invalidateQueries({ queryKey: ['messages', id] });
      }
    });
    // Also retry React-state-only pending messages (current session, not in MMKV)
    const toRetry = pendingMessages.filter(p => p.status === 'pending' && p.e2ePayload);
    toRetry.forEach(pending => {
      if (pending.e2ePayload) {
        emitEncryptedMessage({ e2ePayload: pending.e2ePayload, replyToId: pending.replyToId }).then((result) => {
          if (result !== null) {
            setPendingMessages(prev => prev.filter(p => p.id !== pending.id));
            queryClient.invalidateQueries({ queryKey: ['messages', id] });
          }
        });
      }
    });
  }, [isOffline, pendingMessages, id]);

  const pickAndSendMedia = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploadingMedia(true);
    try {
      // Resize + strip EXIF before encryption (prevents GPS leak in encrypted payload)
      const resized = await resizeForUpload(asset.uri, asset.width, asset.height);

      // A4: Encrypt media file with per-file random key, upload encrypted blob to R2
      const encResult = await encryptSmallMediaFile(resized.uri, resized.mimeType, {
        width: resized.width,
        height: resized.height,
      });

      // Upload the encrypted file to R2
      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
      const token = await getToken() ?? '';
      const mediaUrl = await uploadEncryptedMedia(
        encResult.encryptedFileUri,
        // Encrypted size: header(11) + totalChunks * authTag(16) + fileSize
        11 + encResult.totalChunks * 16 + encResult.fileSize,
        apiUrl.replace('/api/v1', ''),
        token,
      );

      // Encrypt the media metadata (key, hash, URL) as the message content
      // The mediaKey travels INSIDE the E2E message — server never sees it
      const mediaPayload = JSON.stringify({
        type: 'IMAGE',
        mediaUrl,
        mediaKey: encResult.mediaKey ? toBase64(encResult.mediaKey) : '',
        mediaSha256: encResult.mediaSha256 ? toBase64(encResult.mediaSha256) : '',
        totalChunks: encResult.totalChunks,
        fileSize: encResult.fileSize,
        mimeType: resized.mimeType,
        width: resized.width,
        height: resized.height,
      });

      // Codex-V7-F7+F6 FIX: Encrypt media for group (sender keys) OR 1:1 (Double Ratchet).
      // Previously: always used 1:1 signalEncrypt to otherMember — in groups, only one
      // member could decrypt. Now mirrors the text send path's group/1:1 branching.
      // F6: Wrap type inside ciphertext — server sees opaque 'TEXT', not 'IMAGE'.
      const convoData = convoQuery.data;
      const isGroup = convoData?.isGroup === true;
      const wrappedMedia = JSON.stringify({ t: 'IMAGE', c: mediaPayload });
      const clientMessageId = `media_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      if (isGroup) {
        // Group: use sender keys (O(1) encrypt for all members)
        let senderKeyMsg;
        try {
          senderKeyMsg = await encryptGroupMessage(id, wrappedMedia);
        } catch (err) {
          if (String(err).includes('No sender key')) {
            await generateSenderKey(id);
            senderKeyMsg = await encryptGroupMessage(id, wrappedMedia);
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
          const has = await hasEstablishedSession(otherMember.userId);
          if (!has) {
            const { bundle } = await fetchPreKeyBundle(otherMember.userId);
            await createInitiatorSession(otherMember.userId, 1, bundle);
          }
          const signalMsg = await signalEncrypt(otherMember.userId, 1, wrappedMedia);
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
      haptic.success();
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
    } catch {
      showToast({ message: t('errors.sendImageFailed'), variant: 'error' });
    } finally {
      setUploadingMedia(false);
    }
  }, [id, replyTo, queryClient, haptic, convoQuery.data, user?.id, emitEncryptedMessage]);

  const handleVoiceStart = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) { showToast({ message: t('errors.microphoneAccessRequired'), variant: 'error' }); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();
    recordingRef.current = recording;
    // Reset states
    setRecordingTime(0);
    setSlideOffset(0);
    setCancelled(false);
    setIsRecording(true);
    // Start timer
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
    haptic.longPress();
  }, [haptic]);

  const cancelRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    // Clear timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recording = recordingRef.current;
    recordingRef.current = null;
    await recording.stopAndUnloadAsync();
    setCancelled(true);
    setIsRecording(false);
    setRecordingTime(0);
    setSlideOffset(0);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  }, []);

  const handleVoiceStop = useCallback(async () => {
    if (!recordingRef.current) return;
    // Clear timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    // If cancelled, do not send
    if (cancelled) {
      setCancelled(false);
      setIsRecording(false);
      setRecordingTime(0);
      setSlideOffset(0);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      return;
    }
    setIsRecording(false);
    const recording = recordingRef.current;
    recordingRef.current = null;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    if (!uri) return;
    setUploadingVoice(true);
    try {
      // A4: Encrypt voice note with per-file key, upload encrypted blob
      const encResult = await encryptSmallMediaFile(uri, 'audio/m4a', {
        duration: recordingTime,
      });

      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
      const token = await getToken() ?? '';
      const mediaUrl = await uploadEncryptedMedia(
        encResult.encryptedFileUri,
        encResult.fileSize + 200,
        apiUrl.replace('/api/v1', ''),
        token,
      );

      // Encrypt voice metadata (key, hash, duration) inside E2E message
      const voicePayload = JSON.stringify({
        type: 'VOICE',
        mediaUrl,
        mediaKey: encResult.mediaKey ? toBase64(encResult.mediaKey) : '',
        mediaSha256: encResult.mediaSha256 ? toBase64(encResult.mediaSha256) : '',
        totalChunks: encResult.totalChunks,
        fileSize: encResult.fileSize,
        mimeType: 'audio/m4a',
        duration: recordingTime,
      });

      // Codex-V7-F7+F6 FIX: Group voice uses sender keys, type wrapped inside ciphertext
      const convoData = convoQuery.data;
      const isGroup = convoData?.isGroup === true;
      const wrappedVoice = JSON.stringify({ t: 'VOICE', c: voicePayload });
      const clientMessageId = `voice_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      if (isGroup) {
        let senderKeyMsg;
        try {
          senderKeyMsg = await encryptGroupMessage(id, wrappedVoice);
        } catch (err) {
          if (String(err).includes('No sender key')) {
            await generateSenderKey(id);
            senderKeyMsg = await encryptGroupMessage(id, wrappedVoice);
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
          const has = await hasEstablishedSession(otherMember.userId);
          if (!has) {
            const { bundle } = await fetchPreKeyBundle(otherMember.userId);
            await createInitiatorSession(otherMember.userId, 1, bundle);
          }
          const signalMsg = await signalEncrypt(otherMember.userId, 1, wrappedVoice);
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
      setReplyTo(null);
      haptic.success();
    } catch {
      showToast({ message: t('errors.sendVoiceFailed'), variant: 'error' });
    } finally {
      setUploadingVoice(false);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
  }, [id, replyTo, haptic, cancelled]);

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
  }, [haptic]);

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
  }, []);

  const handleSearchResultPress = useCallback((index: number) => {
    scrollToMessageIndex(index);
  }, [scrollToMessageIndex]);

  // Typing indicators: the server needs { conversationId, isTyping } to route
  // the event to the correct conversation room. Encrypting the boolean is
  // security theater — the server sees the event EXISTS (timing metadata).
  // True typing privacy requires sealed sender (C11) to hide WHO is typing.
  // That's implemented in sealed-sender.ts and will be wired when the server
  // supports sealed sender envelope routing.
  const handleChangeText = (val: string) => {
    setText(val);
    if (!isTyping) {
      setIsTyping(true);
      socketRef.current?.emit('typing', { conversationId: id, isTyping: true });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit('typing', { conversationId: id, isTyping: false });
    }, 2000);
  };

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
    // V6-F2a: Client-side E2E enforcement. Three cases:
    // 1. Encrypted + decrypted → show decrypted content
    // 2. Encrypted + not yet decrypted → show "[Encrypted message]"
    // 3. Not encrypted (no encryptedContent) → block plaintext injection
    //    EXCEPT for SYSTEM messages (join/leave/security code changed)
    let displayMessage: typeof item.message;
    if (encMsg.encryptedContent && decryptedContents.has(encMsg.id)) {
      displayMessage = { ...item.message, content: decryptedContents.get(encMsg.id) ?? item.message.content };
    } else if (encMsg.encryptedContent) {
      displayMessage = { ...item.message, content: '🔒' };
    } else if (item.message.messageType !== 'SYSTEM') {
      // V6-F2a: Plaintext message in an E2E conversation — possible server injection.
      // Display a warning instead of the attacker-controlled content.
      displayMessage = { ...item.message, content: '⚠ This message was not end-to-end encrypted' };
    } else {
      displayMessage = item.message; // SYSTEM messages are legitimate plaintext
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
  }, [convoQuery.data?.members, user?.id, decryptedContents, handleSwipeReply, handleContextMenu, searchQuery, handleSearchResultPress, id, deliveredMessages]);

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
                    queryClient.invalidateQueries({ queryKey: ['messages', id] }); // Refetch to restore message on failure
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
                    queryClient.invalidateQueries({ queryKey: ['messages', id] }); // Refetch to restore message on failure
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
                  // E2E encrypt for the TARGET conversation's recipient
                  const targetMember = conv.members?.find((m: ConversationMember) => m.userId !== user?.id);
                  const targetRecipientId = targetMember?.userId;
                  const forwardContent = forwardMsg.content || forwardMsg.mediaUrl || '';

                  if (targetRecipientId && forwardContent) {
                    // Ensure session with target recipient
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
          // Codex-V7-F7+F6 FIX: Group GIF uses sender keys. Type + URL wrapped inside ciphertext.
          // Previously: 1:1 encrypt only + mediaUrl in cleartext outside ciphertext.
          const convoData = convoQuery.data;
          const isGroup = convoData?.isGroup === true;
          // F6: Wrap GIF URL and type INSIDE the ciphertext — server sees opaque blob only
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
                // F6: NO messageType or mediaUrl outside ciphertext
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
    backgroundColor: colors.dark.bgSheet, // Overridden inline with tc.bgElevated
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
  replyPreviewEmeraldBorder: { borderLeftColor: colors.emerald },
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
    paddingHorizontal: spacing.sm, // 8 — use token instead of arithmetic
    paddingVertical: 2,
    marginRight: spacing.xs,
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
