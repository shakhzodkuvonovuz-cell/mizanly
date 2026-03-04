import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, Pressable, TextInput,
  KeyboardAvoidingView, Platform, FlatList, Alert,
} from 'react-native';
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
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useHaptic } from '@/hooks/useHaptic';
import { colors, spacing, fontSize, radius, animation } from '@/theme';
import { messagesApi, uploadApi } from '@/services/api';
import type { Message, Conversation } from '@/types';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = `${(process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000')}/chat`;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function messageTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
  return format(d, 'MMM d, HH:mm');
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

type ListItem =
  | { type: 'date'; label: string; key: string }
  | { type: 'msg'; message: Message; isGroupStart: boolean; isGroupEnd: boolean; key: string };

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

function MessageBubble({
  message, isOwn, isGroupStart, isGroupEnd,
}: {
  message: Message; isOwn: boolean; isGroupStart: boolean; isGroupEnd: boolean;
}) {
  const time = messageTimestamp(message.createdAt);
  const AVATAR_SIZE = 28;

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
    borderTopLeftRadius: 20,
    borderTopRightRadius: isGroupStart ? 20 : 4,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: isGroupEnd ? 4 : 20,
  };
  const otherRadius = {
    borderTopLeftRadius: isGroupStart ? 20 : 4,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: isGroupEnd ? 4 : 20,
    borderBottomRightRadius: 20,
  };

  return (
    <View style={[
      styles.bubbleWrap,
      isOwn && styles.bubbleWrapOwn,
      !isGroupEnd && styles.bubbleWrapGrouped,
    ]}>
      {/* Avatar: show on last message of a group, spacer otherwise */}
      {!isOwn && (
        isGroupEnd
          ? <Avatar uri={message.sender.avatarUrl} name={message.sender.displayName} size="xs" />
          : <View style={{ width: AVATAR_SIZE }} />
      )}

      <View style={[
        styles.bubble,
        isOwn ? [styles.bubbleOwn, ownRadius] : [styles.bubbleOther, otherRadius],
      ]}>
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
        {message.mediaUrl && (
          <Image source={{ uri: message.mediaUrl }} style={styles.bubbleMedia} contentFit="cover" />
        )}
        {message.content && (
          <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
            {message.content}
          </Text>
        )}
        <View style={styles.bubbleMeta}>
          {message.editedAt && (
            <Text style={[styles.editedLabel, isOwn && styles.editedLabelOwn]}>edited</Text>
          )}
          <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{time}</Text>
          {isOwn && (
            <Icon name="check-check" size={12} color="rgba(255,255,255,0.6)" />
          )}
        </View>
        {message.reactions && message.reactions.length > 0 && (
          <View style={styles.reactions}>
            {message.reactions.slice(0, 5).map((r) => (
              <Text key={r.id} style={styles.reactionEmoji}>{r.emoji}</Text>
            ))}
          </View>
        )}
      </View>
    </View>
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

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; content?: string; username: string } | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    select: (data) => ({
      ...data,
      pages: [...data.pages].reverse().map((p) => ({
        ...p,
        data: [...p.data].reverse(),
      })),
    }),
  });

  const messages: Message[] = messagesQuery.data?.pages.flatMap((p) => p.data) ?? [];

  useEffect(() => {
    let mounted = true;
    const connect = async () => {
      const token = await getToken();
      if (!token || !mounted) return;
      const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket'] });
      socket.on('connect', () => { socket.emit('join_conversation', { conversationId: id }); });
      socket.on('new_message', (msg: Message) => {
        queryClient.setQueryData(['messages', id], (old: any) => {
          if (!old) return old;
          const pages = [...old.pages];
          const lastPage = { ...pages[pages.length - 1] };
          lastPage.data = [...lastPage.data, msg];
          pages[pages.length - 1] = lastPage;
          return { ...old, pages };
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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

  const sendMutation = useMutation({
    mutationFn: () =>
      messagesApi.sendMessage(id, {
        content: text.trim(),
        replyToId: replyTo?.id,
        messageType: 'TEXT',
      }),
    onSuccess: () => {
      setText('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
    },
  });

  const handleSend = useCallback(() => {
    if (!text.trim() || sendMutation.isPending) return;
    haptic.medium();
    socketRef.current?.emit('send_message', {
      conversationId: id,
      content: text.trim(),
      replyToId: replyTo?.id,
      messageType: 'TEXT',
    });
    sendMutation.mutate();
  }, [text, replyTo, id, sendMutation, haptic]);

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
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
        <Pressable hitSlop={8} onPress={() => router.push(`/(screens)/conversation-info?id=${id}`)}>
          <Icon name="more-horizontal" size="sm" color={colors.text.secondary} />
        </Pressable>
      </View>

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
            data={buildMessageList(messages)}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => {
              if (item.type === 'date') return <DateSeparator label={item.label} />;
              return (
                <MessageBubble
                  message={item.message}
                  isOwn={item.message.sender.id === user?.id}
                  isGroupStart={item.isGroupStart}
                  isGroupEnd={item.isGroupEnd}
                />
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
            >
              <Icon
                name="paperclip"
                size="sm"
                color={uploadingMedia ? colors.text.tertiary : colors.text.secondary}
              />
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
                  disabled={sendMutation.isPending}
                  style={styles.sendCircle}
                >
                  <Icon name="send" size="xs" color="#FFF" />
                </AnimatedPressable>
              </Animated.View>
            ) : (
              <Pressable hitSlop={8} style={styles.micBtn}>
                <Icon name="mic" size="sm" color={colors.text.secondary} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, justifyContent: 'flex-end' },
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
  attachBtn: { paddingBottom: 8 },
  input: {
    flex: 1, color: colors.text.primary, fontSize: fontSize.base,
    maxHeight: 120, minHeight: 38,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: 20, paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 6,
    borderWidth: 0.5, borderColor: colors.dark.border,
  },
  sendCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center',
  },
  micBtn: { paddingBottom: 8 },
});
