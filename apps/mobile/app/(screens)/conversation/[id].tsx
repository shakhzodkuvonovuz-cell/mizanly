import { useState, useRef, useCallback, useEffect } from 'react';
import { ActivityIndicator,
  View, Text, StyleSheet, Pressable, TextInput,
  KeyboardAvoidingView, Platform, FlatList, Alert, LayoutAnimation,
} from 'react-native';
import { Swipeable, PanGestureHandler } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { format, isToday, isYesterday, isSameDay, differenceInMinutes } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { BottomSheet, BottomSheetItem } from '@/components/ui/BottomSheet';
import { useHaptic } from '@/hooks/useHaptic';
import { useStore } from '@/store';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { messagesApi, uploadApi } from '@/services/api';
import type { Message, Conversation } from '@/types';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = `${(process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000')}/chat`;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Stable module-level select function — React Query memoizes when reference is stable
function selectMessagesReversed(data: { pages: Array<{ data: Message[]; meta: { cursor?: string; hasMore: boolean } }>; pageParams: unknown[] }) {
  return {
    ...data,
    pages: [...data.pages].reverse().map((p) => ({
      ...p,
      data: [...p.data].reverse(),
    })),
  };
}

function messageTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
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

function TypingDots() {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const bounce = (delay: number) =>
      withRepeat(
        withSequence(
          withTiming(0, { duration: delay }),
          withTiming(-4, { duration: 300, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 300, easing: Easing.in(Easing.ease) }),
        ),
        -1,
      );
    dot1.value = bounce(0);
    dot2.value = bounce(150);
    dot3.value = bounce(300);
  }, [dot1, dot2, dot3]);

  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  return (
    <View style={styles.typingDots}>
      <Animated.View style={[styles.dot, s1]} />
      <Animated.View style={[styles.dot, s2]} />
      <Animated.View style={[styles.dot, s3]} />
    </View>
  );
}

// ── Message list with grouping + date separators ──────────────────────────
const GROUP_GAP_MS = 2 * 60 * 1000; // 2 min gap breaks a group

type PendingMessage = {
  id: string; // client-generated temporary ID
  content: string;
  createdAt: string;
  status: 'pending' | 'failed';
  replyToId?: string;
};

type ListItem =
  | { type: 'date'; label: string; key: string }
  | { type: 'msg'; message: Message; isGroupStart: boolean; isGroupEnd: boolean; key: string }
  | { type: 'pending'; pending: PendingMessage; key: string };

function buildMessageList(messages: Message[]): ListItem[] {
  const items: ListItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;

    // Date separator when day changes
    if (!prev || !isSameDay(new Date(msg.createdAt), new Date(prev.createdAt))) {
      const d = new Date(msg.createdAt);
      const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMMM d, yyyy');
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
  return (
    <View style={styles.dateSep}>
      <View style={styles.dateSepLine} />
      <Text style={styles.dateSepText}>{label}</Text>
      <View style={styles.dateSepLine} />
    </View>
  );
}

function VoicePlayer({ mediaUrl, isOwn }: { mediaUrl: string; isOwn: boolean }) {
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

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
          { shouldPlay: true },
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
    <Pressable style={styles.voicePlayer} onPress={toggle}>
      <Icon name={playing ? 'volume-x' : 'play'} size={18} color={isOwn ? '#fff' : colors.emerald} />
      <View style={styles.voiceWaveform}>
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.voiceBar,
              { height: 4 + Math.sin(i * 0.8) * 8 + Math.random() * 4 },
              isOwn ? styles.voiceBarOwn : styles.voiceBarOther,
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}
function GifPicker({ visible, onClose, onSelect }: {
  visible: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const apiKey = process.env.EXPO_PUBLIC_TENOR_API_KEY;

  const fetchGifs = useCallback(async (query: string) => {
    if (!apiKey) {
      Alert.alert('Error', 'GIF service not configured.');
      return;
    }
    setLoading(true);
    try {
      const url = query.trim()
        ? `https://tenor.googleapis.com/v2/search?key=${apiKey}&q=${encodeURIComponent(query)}&limit=30`
        : `https://tenor.googleapis.com/v2/featured?key=${apiKey}&limit=30`;
      const resp = await fetch(url);
      const data = await resp.json();
      setResults(data.results || []);
    } catch (err) {
      Alert.alert('Error', 'Failed to load GIFs.');
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

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
        <View style={styles.gifSearchRow}>
          <TextInput
            style={styles.gifSearchInput}
            placeholder="Search GIFs..."
            placeholderTextColor={colors.text.tertiary}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <Pressable onPress={handleSearch} style={styles.gifSearchButton}>
            <Icon name="search" size="sm" color={colors.text.secondary} />
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.gifLoader}>
            <ActivityIndicator size="small" color={colors.emerald} />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={styles.gifGrid}
            renderItem={({ item }) => (
              <Pressable
                style={styles.gifItem}
                onPress={() => onSelect(item.media_formats.gif.url)}
              >
                <Image
                  source={{ uri: item.media_formats.gif.url }}
                  style={styles.gifImage}
                  contentFit="cover"
                />
              </Pressable>
            )}
          />
        )}
      </View>
    </BottomSheet>
  );
}

function MessageBubble({
  message, isOwn, isGroupStart, isGroupEnd, onLongPress, isNew = false,
  searchQuery = '', onSearchResultPress, readByMembers = [],
}: {
  message: Message; isOwn: boolean; isGroupStart: boolean; isGroupEnd: boolean;
  onLongPress: (msg: Message) => void; isNew?: boolean;
  searchQuery?: string; onSearchResultPress?: (msgId: string) => void;
  readByMembers?: any[];
}) {
  const time = messageTimestamp(message.createdAt);
  const AVATAR_SIZE = 28;

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

  if (message.isDeleted) {
    return (
      <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn, !isGroupEnd && styles.bubbleWrapGrouped]}>
        {!isOwn && <View style={{ width: AVATAR_SIZE }} />}
        <Text style={styles.deletedMsg}>Message deleted</Text>
      </View>
    );
  }

  // Corner radius system (WhatsApp style)
  const ownRadius = {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: isGroupStart ? 20 : 4,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: isGroupEnd ? 4 : 20,
  };
  const otherRadius = {
    borderTopLeftRadius: isGroupStart ? 20 : 4,
    borderTopRightRadius: radius.lg,
    borderBottomLeftRadius: isGroupEnd ? 4 : 20,
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
          isOwn ? [styles.bubbleOwn, ownRadius] : [styles.bubbleOther, otherRadius],
        ]}
        delayLongPress={300}
      >
        {/* Sender name in groups (only on group start for others) */}
        {!isOwn && isGroupStart && (
          <Text style={styles.senderName}>{message.sender.displayName}</Text>
        )}
        {message.replyTo && (
          <View style={[styles.replyPreview, !isOwn && styles.replyPreviewOther]}>
            <Text style={[styles.replyPreviewUser, !isOwn && styles.replyPreviewUserOther]}>
              {message.replyTo.sender.username}
            </Text>
            <Text style={[styles.replyPreviewText, !isOwn && styles.replyPreviewTextOther]} numberOfLines={1}>
              {message.replyTo.content ?? 'Media'}
            </Text>
          </View>
        )}
        {message.messageType === 'VOICE' && message.mediaUrl ? (
          <VoicePlayer mediaUrl={message.mediaUrl} isOwn={isOwn} />
        ) : (
          <>
            {message.mediaUrl && (
              <Image source={{ uri: message.mediaUrl }} style={styles.bubbleMedia} contentFit="cover" />
            )}
            {message.content && (
              <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
                {searchQuery.trim() ? (
                  highlightSearchText(message.content, searchQuery).map((seg, idx) => (
                    <Text
                      key={idx}
                      style={seg.highlight ? { backgroundColor: colors.gold + '80' } : {}}
                    >
                      {seg.text}
                    </Text>
                  ))
                ) : (
                  message.content
                )}
              </Text>
            )}
          </>
        )}
        <View style={styles.bubbleMeta}>
          {message.editedAt && (
            <Text style={[styles.editedLabel, isOwn && styles.editedLabelOwn]}>edited</Text>
          )}
          <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{time}</Text>
          {isOwn && (
            <Icon name="check-check" size={12} color="rgba(255,255,255,0.6)" />
          )}
          {readByMembers.length > 0 && (
            <View style={styles.readReceipts}>
              {readByMembers.slice(0, 3).map(member => (
                <Avatar
                  key={member.userId}
                  uri={member.user.avatarUrl}
                  name={member.user.displayName}
                  size="xs"
                  style={styles.readReceiptAvatar}
                />
              ))}
              {readByMembers.length > 3 && (
                <Text style={styles.readReceiptMore}>+{readByMembers.length - 3}</Text>
              )}
            </View>
          )}
        </View>
        {message.reactions && message.reactions.length > 0 && (
          <View style={styles.reactions}>
            {message.reactions.slice(0, 5).map((r) => (
              <Text key={r.id} style={styles.reactionEmoji}>{r.emoji}</Text>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function conversationName(convo: Conversation, myId?: string): string {
  if (convo.isGroup) return convo.groupName ?? 'Group';
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.displayName ?? 'Chat';
}

function conversationAvatar(convo: Conversation, myId?: string): string | undefined {
  if (convo.isGroup) return convo.groupAvatarUrl;
  const other = convo.members.find((m) => m.user.id !== myId);
  return other?.user.avatarUrl;
}

function PendingMessageRow({ pending }: { pending: PendingMessage }) {
  return (
    <View style={styles.pendingRow}>
      <Text style={styles.pendingText}>{pending.content}</Text>
      <ActivityIndicator size="small" color={colors.text.tertiary} />
    </View>
  );
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const isOffline = useStore((s) => s.isOffline);
  const haptic = useHaptic();
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<TextInput>(null);
  const newMessageIdsRef = useRef(new Set<string>());
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; content?: string; username: string } | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const pendingMessagesRef = useRef(pendingMessages);
  useEffect(() => {
    pendingMessagesRef.current = pendingMessages;
  }, [pendingMessages]);
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Context menu
  const [contextMenuMsg, setContextMenuMsg] = useState<Message | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  // GIF picker
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [gifResults, setGifResults] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  // Message search
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

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

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', id],
    queryFn: ({ pageParam }) =>
      messagesApi.getMessages(id, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    select: selectMessagesReversed,
  });

  const messages: Message[] = messagesQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const combinedMessages = [...messages, ...pendingMessages.map(p => ({
    ...p,
    // Convert PendingMessage to a shape compatible with Message
    id: p.id,
    content: p.content,
    createdAt: p.createdAt,
    sender: user ? { id: user.id, displayName: user.fullName || user.username, avatarUrl: user.imageUrl, username: user.username } : { id: 'pending', displayName: 'You', avatarUrl: '', username: 'pending' },
    messageType: 'TEXT',
    replyToId: p.replyToId,
  } as unknown as Message))];
  const filteredMessages = searchQuery.trim()
    ? combinedMessages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : combinedMessages;
  // We'll need to adjust buildMessageList to handle pending vs real messages

  useEffect(() => {
    let mounted = true;
    const connect = async () => {
      const token = await getToken();
      if (!token || !mounted) return;
      const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
      socket.on('connect', () => {
        socket.emit('join_conversation', { conversationId: id });
        // Retry pending messages on reconnect
        const pending = pendingMessagesRef.current.filter(p => p.status === 'pending');
        pending.forEach(pending => {
          socket.emit('send_message', {
            conversationId: id,
            content: pending.content,
            replyToId: pending.replyToId,
            messageType: 'TEXT',
            clientId: pending.id,
          });
        });
      });
      socket.on('new_message', (msg: Message & { clientId?: string }) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
        newMessageIdsRef.current.add(msg.id);
        // Remove any pending message that matches this incoming message
        const pending = pendingMessagesRef.current;
        const matchedIndex = pending.findIndex(p =>
          p.id === msg.clientId ||
          (p.content === msg.content && Date.now() - new Date(p.createdAt).getTime() < 30000)
        );
        if (matchedIndex >= 0) {
          setPendingMessages(prev => prev.filter((_, i) => i !== matchedIndex));
        }
        queryClient.setQueryData(['messages', id], (old: any) => {
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
      });
      socket.on('user_typing', ({ userId, isTyping: typing }: { userId: string; isTyping: boolean }) => {
        if (userId !== user?.id) setOtherTyping(typing);
      });
      socketRef.current = socket;
    };
    connect();
    return () => { mounted = false; socketRef.current?.disconnect(); socketRef.current = null; };
  }, [id, getToken, user?.id, queryClient]);

  useEffect(() => {
    messagesApi.markRead(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => {});
  }, [id, queryClient]);

  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(() => {
    if (!text.trim() || isSending) return;
    haptic.medium();
    setIsSending(true);
    const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const pendingMessage: PendingMessage = {
      id: pendingId,
      content: text.trim(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      replyToId: replyTo?.id,
    };
    setPendingMessages(prev => [...prev, pendingMessage]);
    setText('');
    setReplyTo(null);
    setIsSending(false);

    // If online, attempt to send via socket
    if (!isOffline && socketRef.current?.connected) {
      socketRef.current.emit('send_message', {
        conversationId: id,
        content: text.trim(),
        replyToId: replyTo?.id,
        messageType: 'TEXT',
        clientId: pendingId, // custom field for matching
      });
    } else {
      // Offline or socket not connected: message stays pending
      // Will be retried when network returns (see useEffect below)
    }
  }, [text, replyTo, id, isSending, haptic, isOffline]);

  // Retry pending messages when network comes back online
  useEffect(() => {
    if (isOffline || !socketRef.current?.connected) return;
    // Filter pending messages that haven't been sent yet
    const toRetry = pendingMessages.filter(p => p.status === 'pending');
    toRetry.forEach(pending => {
      socketRef.current?.emit('send_message', {
        conversationId: id,
        content: pending.content,
        replyToId: pending.replyToId,
        messageType: 'TEXT',
        clientId: pending.id,
      });
    });
  }, [isOffline, pendingMessages, id]);

  const pickAndSendMedia = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const ext = asset.uri.split('.').pop() ?? 'jpg';
    setUploadingMedia(true);
    try {
      const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl(`image/${ext}`, 'messages');
      const blob = await (await fetch(asset.uri)).blob();
      await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': `image/${ext}` } });
      await messagesApi.sendMessage(id, {
        messageType: 'IMAGE',
        mediaUrl: publicUrl,
        mediaType: 'image',
        replyToId: replyTo?.id,
      });
      haptic.success();
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
    } catch {
      Alert.alert('Error', 'Failed to send image.');
    } finally {
      setUploadingMedia(false);
    }
  }, [id, replyTo, queryClient, haptic]);

  const handleVoiceStart = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) { Alert.alert('Permission needed', 'Microphone access is required.'); return; }
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
    haptic.medium();
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
      const { uploadUrl, publicUrl } = await uploadApi.getPresignUrl('audio/m4a', 'messages');
      const blob = await (await fetch(uri)).blob();
      await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'audio/m4a' } });
      socketRef.current?.emit('send_message', {
        conversationId: id,
        content: '',
        messageType: 'VOICE',
        mediaUrl: publicUrl,
        mediaType: 'audio',
        replyToId: replyTo?.id,
      });
      setReplyTo(null);
      haptic.success();
    } catch {
      Alert.alert('Error', 'Failed to send voice message.');
    } finally {
      setUploadingVoice(false);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    }
  }, [id, replyTo, haptic, cancelled]);

  const handleContextMenu = useCallback((msg: Message) => {
    haptic.medium();
    setContextMenuMsg(msg);
  }, [haptic]);

  const handleSwipeReply = useCallback((msg: Message) => {
    haptic.medium();
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
  const name = convo ? conversationName(convo, user?.id) : '';
  const avatarUri = convo ? conversationAvatar(convo, user?.id) : undefined;

  // Build list items combining real messages and pending messages
  const filteredRealMessages = searchQuery.trim()
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;
  const listItems = buildMessageList(filteredRealMessages);
  pendingMessages.forEach(pending => {
    listItems.push({
      type: 'pending',
      pending,
      key: pending.id,
    });
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      {searchMode ? (
        <View style={styles.searchHeader}>
          <Pressable onPress={() => { setSearchMode(false); setSearchQuery(''); }} hitSlop={8} style={styles.backBtn}>
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </Pressable>
          <View style={styles.searchInputWrap}>
            <Icon name="search" size="sm" color={colors.text.secondary} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search messages…"
              placeholderTextColor={colors.text.tertiary}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Icon name="x" size="xs" color={colors.text.secondary} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => { setSearchMode(false); setSearchQuery(''); }} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <Icon name="arrow-left" size="md" color={colors.text.primary} />
          </Pressable>
          <Pressable style={styles.headerCenter} onPress={() => router.push(`/(screens)/conversation-info?id=${id}`)}>
            <Avatar uri={avatarUri} name={name} size="sm" showOnline />
            <View>
              <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
              {otherTyping && <TypingDots />}
            </View>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable hitSlop={8} onPress={() => setSearchMode(true)}>
              <Icon name="search" size="sm" color={colors.text.secondary} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => router.push(`/(screens)/conversation-info?id=${id}`)}>
              <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
            </Pressable>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {messagesQuery.isLoading ? (
          <View style={styles.loaderWrap}>
            <Skeleton.Rect width={200} height={40} borderRadius={18} style={{ alignSelf: 'flex-end' }} />
            <Skeleton.Rect width={180} height={40} borderRadius={18} style={{ alignSelf: 'flex-start', marginTop: spacing.sm }} />
            <Skeleton.Rect width={220} height={40} borderRadius={18} style={{ alignSelf: 'flex-end', marginTop: spacing.sm }} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listItems}
            keyExtractor={(item) => item.key}
            renderItem={({ item, index }) => {
              if (item.type === 'date') return <DateSeparator label={item.label} />;
              if (item.type === 'pending') {
                // Render pending message with opacity/spinner
                return <PendingMessageRow pending={item.pending} />;
              }
              const readByMembers = convoQuery.data?.members?.filter(member =>
                member.userId !== user?.id &&
                member.lastReadAt &&
                new Date(member.lastReadAt) >= new Date(item.message.createdAt)
              ).slice(0, 3) ?? [];
              return (
                <Swipeable
                  renderRightActions={() => (
                    <View style={styles.swipeAction}>
                      <Icon name="message-circle" size="sm" color={colors.emerald} />
                    </View>
                  )}
                  onSwipeableWillOpen={() => handleSwipeReply(item.message)}
                  rightThreshold={40}
                >
                  <MessageBubble
                    message={item.message}
                    isOwn={item.message.sender.id === user?.id}
                    isGroupStart={item.isGroupStart}
                    isGroupEnd={item.isGroupEnd}
                    onLongPress={handleContextMenu}
                    isNew={newMessageIdsRef.current.has(item.message.id)}
                    searchQuery={searchQuery}
                    readByMembers={readByMembers}
                    onSearchResultPress={() => handleSearchResultPress(index)}
                  />
                </Swipeable>
              );
            }}
            onEndReached={() => {
              if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
                messagesQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.1}
            ListEmptyComponent={() => (
              <View style={styles.emptyWrap}>
                <Avatar uri={avatarUri} name={name} size="2xl" />
                <Text style={styles.emptyName}>{name}</Text>
                <Text style={styles.emptyHint}>Send a message to start the conversation</Text>
              </View>
            )}
            contentContainerStyle={styles.messageList}
            onScrollToIndexFailed={({ index }) => flatListRef.current?.scrollToOffset({ offset: index * 100 })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input area */}
        <View style={styles.inputWrap}>
          {replyTo && (
            <View style={styles.replyBanner}>
              <View style={styles.replyBannerContent}>
                <Text style={styles.replyBannerUser}>@{replyTo.username}</Text>
                <Text style={styles.replyBannerText} numberOfLines={1}>
                  {replyTo.content ?? 'Media'}
                </Text>
              </View>
              <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                <Icon name="x" size="xs" color={colors.text.secondary} />
              </Pressable>
            </View>
          )}
          <View style={styles.inputRow}>
            <Pressable
              style={styles.attachBtn}
              hitSlop={8}
              onPress={pickAndSendMedia}
              disabled={uploadingMedia}
              accessibilityLabel="Attach media"
              accessibilityRole="button"
            >
              <Icon
                name="paperclip"
                size="sm"
                color={uploadingMedia ? colors.text.tertiary : colors.text.secondary}
              />
            </Pressable>
            <Pressable
              style={styles.gifBtn}
              hitSlop={8}
              onPress={() => setShowGifPicker(true)}
              disabled={uploadingMedia}
              accessibilityLabel="GIF picker"
              accessibilityRole="button"
            >
              <Icon name="smile" size="sm" color={colors.text.secondary} />
            </Pressable>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Message…"
              placeholderTextColor={colors.text.tertiary}
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
                  accessibilityLabel="Send message"
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
                    accessibilityLabel="Record voice message"
                    accessibilityRole="button"
                  >
                    <Icon
                      name="mic"
                      size="sm"
                      color={isRecording ? colors.error : uploadingVoice ? colors.text.tertiary : colors.text.secondary}
                    />
                  </Pressable>
                  {isRecording && (
                    <View style={[styles.slideCancelIndicator, { transform: [{ translateX: slideOffset }] }]}>
                      <Icon name="x" size="sm" color={colors.text.secondary} />
                    </View>
                  )}
                </View>
              </PanGestureHandler>
            )}
          </View>
          {/* Recording overlay */}
          {isRecording && (
            <View style={styles.recordingOverlay}>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTimer}>{formatRecordingTime(recordingTime)}</Text>
              </View>
              <Text style={styles.slideCancelHint}>Slide to cancel</Text>
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
      >
        {contextMenuMsg?.content ? (
          <BottomSheetItem
            label="Copy Text"
            icon={<Icon name="edit" size="sm" color={colors.text.secondary} />}
            onPress={() => {
              Clipboard.setStringAsync(contextMenuMsg.content ?? '');
              setContextMenuMsg(null);
            }}
          />
        ) : null}
        <BottomSheetItem
          label="Reply"
          icon={<Icon name="message-circle" size="sm" color={colors.text.secondary} />}
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
          label="Forward"
          icon={<Icon name="repeat" size="sm" color={colors.text.secondary} />}
          onPress={() => {
            // TODO: Implement forward picker
            Alert.alert('Coming Soon', 'Forward feature will be available soon.');
            setContextMenuMsg(null);
          }}
        />
        <BottomSheetItem
          label="React"
          icon={<Icon name="smile" size="sm" color={colors.text.secondary} />}
          onPress={() => {
            setShowReactionPicker(true);
          }}
        />
        {contextMenuMsg?.sender.id === user?.id && (
          <>
            {isMessageEditable(contextMenuMsg) && (
              <BottomSheetItem
                label="Edit"
                icon={<Icon name="pencil" size="sm" color={colors.text.secondary} />}
                onPress={() => {
                  if (contextMenuMsg) {
                    // TODO: Implement inline edit mode
                    Alert.alert('Coming Soon', 'Edit feature will be available soon.');
                    setContextMenuMsg(null);
                  }
                }}
              />
            )}
            {isMessageDeletableForEveryone(contextMenuMsg) ? (
              <BottomSheetItem
                label="Delete for Everyone"
                icon={<Icon name="trash" size="sm" color={colors.error} />}
                destructive
                onPress={() => {
                  if (contextMenuMsg) {
                    messagesApi.deleteMessage(id, contextMenuMsg.id).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['messages', id] });
                    }).catch(() => Alert.alert('Error', 'Could not delete message.'));
                    setContextMenuMsg(null);
                  }
                }}
              />
            ) : (
              <BottomSheetItem
                label="Delete"
                icon={<Icon name="trash" size="sm" color={colors.error} />}
                destructive
                onPress={() => {
                  if (contextMenuMsg) {
                    messagesApi.deleteMessage(id, contextMenuMsg.id).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['messages', id] });
                    }).catch(() => Alert.alert('Error', 'Could not delete message.'));
                    setContextMenuMsg(null);
                  }
                }}
              />
            )}
          </>
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
          <Text style={styles.reactionPickerTitle}>React with</Text>
          <View style={styles.reactionGrid}>
            {['❤️', '👍', '😂', '😮', '😢', '🤲'].map((emoji) => (
              <Pressable
                key={emoji}
                style={styles.reactionButton}
                onPress={() => {
                  if (contextMenuMsg) {
                    messagesApi.reactToMessage(id, contextMenuMsg.id, emoji)
                      .then(() => {
                        queryClient.invalidateQueries({ queryKey: ['messages', id] });
                      })
                      .catch(() => Alert.alert('Error', 'Could not add reaction.'));
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
        onSelect={(gifUrl) => {
          socketRef.current?.emit('send_message', {
            conversationId: id,
            content: '',
            messageType: 'GIF',
            mediaUrl: gifUrl,
            mediaType: 'gif',
            replyToId: replyTo?.id,
          });
          setShowGifPicker(false);
          setReplyTo(null);
        }}
      />
    </SafeAreaView>
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

  typingDots: { flexDirection: 'row', gap: 3, paddingTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.emerald },

  loaderWrap: { flex: 1, padding: spacing.base, justifyContent: 'center' },
  messageList: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, flexGrow: 1 },

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
  },
  bubbleOwn: { backgroundColor: colors.emerald },
  bubbleOther: { backgroundColor: colors.dark.bgElevated },
  deletedMsg: { color: colors.text.tertiary, fontSize: fontSize.sm, fontStyle: 'italic', paddingVertical: spacing.xs },
  replyPreview: {
    borderLeftWidth: 3, borderLeftColor: 'rgba(255,255,255,0.4)',
    paddingLeft: spacing.xs, marginBottom: spacing.xs,
  },
  replyPreviewOther: { borderLeftColor: colors.emerald },
  replyPreviewUser: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.xs, fontWeight: '700' },
  replyPreviewUserOther: { color: colors.emerald },
  replyPreviewText: { color: 'rgba(255,255,255,0.6)', fontSize: fontSize.xs },
  replyPreviewTextOther: { color: colors.text.secondary },
  bubbleMedia: { width: 200, height: 200, borderRadius: radius.md, marginBottom: spacing.xs },
  bubbleText: { color: colors.text.inverse, fontSize: fontSize.base, lineHeight: 22 },
  bubbleTextOwn: { color: '#fff' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2, justifyContent: 'flex-end' },
  editedLabel: { color: 'rgba(0,0,0,0.4)', fontSize: 10 },
  editedLabelOwn: { color: 'rgba(255,255,255,0.6)' },
  bubbleTime: { color: 'rgba(0,0,0,0.4)', fontSize: 10 },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.6)' },
  reactions: { flexDirection: 'row', gap: 2, marginTop: spacing.xs },
  reactionEmoji: { fontSize: 14 },

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
    borderLeftWidth: 3, borderLeftColor: colors.emerald,
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
    fontSize: 28,
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
    left: 50,
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
    marginRight: spacing.sm,
  },
  readReceipts: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  readReceiptAvatar: {
    marginLeft: -6,
    borderWidth: 1,
    borderColor: colors.dark.bg,
  },
  readReceiptMore: {
    marginLeft: 2,
    color: colors.text.tertiary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
