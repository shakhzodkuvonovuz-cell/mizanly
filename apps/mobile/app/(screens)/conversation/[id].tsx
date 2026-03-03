import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { formatDistanceToNowStrict, format, isToday, isYesterday } from 'date-fns';
import { Avatar } from '@/components/ui/Avatar';
import { colors, spacing, fontSize } from '@/theme';
import { messagesApi, uploadApi } from '@/services/api';
import type { Message, Conversation } from '@/types';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

function messageTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
  return format(d, 'MMM d, HH:mm');
}

function MessageBubble({
  message,
  isOwn,
}: {
  message: Message;
  isOwn: boolean;
}) {
  const time = messageTimestamp(message.createdAt);

  if (message.isDeleted) {
    return (
      <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
        <Text style={styles.deletedMsg}>Message deleted</Text>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleWrap, isOwn && styles.bubbleWrapOwn]}>
      {!isOwn && (
        <Avatar uri={message.sender.avatarUrl} name={message.sender.displayName} size="xs" />
      )}
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {/* Reply preview */}
        {message.replyTo && (
          <View style={styles.replyPreview}>
            <Text style={styles.replyPreviewUser}>@{message.replyTo.sender.username}</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {message.replyTo.content ?? '📎 Media'}
            </Text>
          </View>
        )}
        {/* Media */}
        {message.mediaUrl ? (
          <Image
            source={{ uri: message.mediaUrl }}
            style={styles.bubbleMedia}
            contentFit="cover"
          />
        ) : null}
        {/* Content */}
        {message.content ? (
          <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
            {message.content}
          </Text>
        ) : null}
        {/* Timestamp + status */}
        <View style={styles.bubbleMeta}>
          {message.editedAt && (
            <Text style={[styles.editedLabel, isOwn && styles.editedLabelOwn]}>edited</Text>
          )}
          <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>{time}</Text>
          {isOwn && <Text style={styles.bubbleStatus}>✓</Text>}
        </View>
        {/* Reactions */}
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
  const flatListRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; content?: string; username: string } | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data ──
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
      // Reverse pages so newest is at bottom
      pages: [...data.pages].reverse().map((p) => ({
        ...p,
        data: [...p.data].reverse(),
      })),
    }),
  });

  const messages: Message[] = messagesQuery.data?.pages.flatMap((p) => p.data) ?? [];

  // ── Socket.io ──
  useEffect(() => {
    let mounted = true;

    const connect = async () => {
      const token = await getToken();
      if (!token || !mounted) return;

      const socket = io(API_URL, {
        auth: { token },
        transports: ['websocket'],
      });

      socket.on('connect', () => {
        socket.emit('join_conversation', { conversationId: id });
      });

      socket.on('new_message', (msg: Message) => {
        // Optimistically append to cache
        queryClient.setQueryData(['messages', id], (old: any) => {
          if (!old) return old;
          const pages = [...old.pages];
          const lastPage = { ...pages[pages.length - 1] };
          lastPage.data = [...lastPage.data, msg];
          pages[pages.length - 1] = lastPage;
          return { ...old, pages };
        });
        // Scroll to bottom
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      });

      socket.on('typing', ({ userId }: { userId: string }) => {
        if (userId !== user?.id) setOtherTyping(true);
      });

      socket.on('stop_typing', ({ userId }: { userId: string }) => {
        if (userId !== user?.id) setOtherTyping(false);
      });

      socketRef.current = socket;
    };

    connect();

    return () => {
      mounted = false;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [id, getToken, user?.id, queryClient]);

  // Mark read on mount
  useEffect(() => {
    messagesApi.markRead(id).catch(() => {});
  }, [id]);

  // ── Send ──
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
    // Also emit via socket for real-time delivery
    socketRef.current?.emit('send_message', {
      conversationId: id,
      content: text.trim(),
      replyToId: replyTo?.id,
      messageType: 'TEXT',
    });
    sendMutation.mutate();
  }, [text, replyTo, id, sendMutation]);

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
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['messages', id] });
    } catch {
      Alert.alert('Error', 'Failed to send image.');
    } finally {
      setUploadingMedia(false);
    }
  }, [id, replyTo, queryClient]);

  // ── Typing indicator ──
  const handleChangeText = (val: string) => {
    setText(val);
    if (!isTyping) {
      setIsTyping(true);
      socketRef.current?.emit('typing', { conversationId: id });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit('stop_typing', { conversationId: id });
    }, 2000);
  };

  const convo = convoQuery.data;
  const name = convo ? conversationName(convo, user?.id) : '…';
  const avatarUri = convo ? conversationAvatar(convo, user?.id) : undefined;
  const canSend = text.trim().length > 0 && !sendMutation.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerCenter} activeOpacity={0.8}>
          <Avatar uri={avatarUri} name={name} size="sm" />
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
            {otherTyping && (
              <Text style={styles.typingLabel}>typing…</Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={8}>
          <Text style={styles.headerAction}>⋯</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Messages list */}
        {messagesQuery.isLoading ? (
          <ActivityIndicator color={colors.emerald} style={styles.loader} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                isOwn={item.sender.id === user?.id}
              />
            )}
            onEndReached={() => {
              if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
                messagesQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.1}
            ListHeaderComponent={() =>
              messagesQuery.isFetchingNextPage ? (
                <ActivityIndicator color={colors.emerald} style={{ paddingVertical: spacing.md }} />
              ) : null
            }
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
                  {replyTo.content ?? '📎 Media'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
                <Text style={styles.replyClose}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn} hitSlop={8} onPress={pickAndSendMedia} disabled={uploadingMedia}>
              {uploadingMedia
                ? <ActivityIndicator color={colors.emerald} size="small" />
                : <Text style={styles.attachIcon}>📎</Text>
              }
            </TouchableOpacity>
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
              <TouchableOpacity
                onPress={handleSend}
                disabled={!canSend}
                style={[styles.sendCircle, !canSend && styles.sendCircleDisabled]}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sendArrow}>↑</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity hitSlop={8}>
                <Text style={styles.micIcon}>🎙️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.base, paddingVertical: spacing.sm,
    borderBottomWidth: 0.5, borderBottomColor: colors.dark.border,
    gap: spacing.sm,
  },
  backBtn: { width: 36, alignItems: 'flex-start' },
  backIcon: { color: colors.text.primary, fontSize: 22 },
  headerCenter: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  headerName: { color: colors.text.primary, fontSize: fontSize.base, fontWeight: '700' },
  typingLabel: { color: colors.emerald, fontSize: fontSize.xs },
  headerAction: { color: colors.text.secondary, fontSize: 22 },

  loader: { flex: 1, marginTop: 60 },

  // Message list
  messageList: { paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, flexGrow: 1 },

  // Bubbles
  bubbleWrap: {
    flexDirection: 'row', alignItems: 'flex-end',
    marginVertical: 2, gap: spacing.xs,
  },
  bubbleWrapOwn: { flexDirection: 'row-reverse' },
  bubble: {
    maxWidth: '78%', borderRadius: 18, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleOwn: {
    backgroundColor: colors.emerald,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.dark.bgElevated,
    borderBottomLeftRadius: 4,
  },
  deletedMsg: { color: colors.text.tertiary, fontSize: fontSize.sm, fontStyle: 'italic', paddingVertical: spacing.xs },
  replyPreview: {
    borderLeftWidth: 3, borderLeftColor: 'rgba(255,255,255,0.4)',
    paddingLeft: spacing.xs, marginBottom: spacing.xs,
  },
  replyPreviewUser: { color: 'rgba(255,255,255,0.8)', fontSize: fontSize.xs, fontWeight: '700' },
  replyPreviewText: { color: 'rgba(255,255,255,0.6)', fontSize: fontSize.xs },
  bubbleMedia: { width: 200, height: 200, borderRadius: 10, marginBottom: spacing.xs },
  bubbleText: { color: colors.text.inverse, fontSize: fontSize.base, lineHeight: 22 },
  bubbleTextOwn: { color: '#fff' },
  bubbleMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, justifyContent: 'flex-end' },
  editedLabel: { color: 'rgba(0,0,0,0.4)', fontSize: 10 },
  editedLabelOwn: { color: 'rgba(255,255,255,0.6)' },
  bubbleTime: { color: 'rgba(0,0,0,0.4)', fontSize: 10 },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.6)' },
  bubbleStatus: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },
  reactions: { flexDirection: 'row', gap: 2, marginTop: spacing.xs },
  reactionEmoji: { fontSize: 14 },

  // Empty state
  emptyWrap: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 80, gap: spacing.md },
  emptyName: { color: colors.text.primary, fontSize: fontSize.lg, fontWeight: '700' },
  emptyHint: { color: colors.text.secondary, fontSize: fontSize.sm },

  // Input
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
  replyClose: { color: colors.text.secondary, fontSize: fontSize.sm, paddingLeft: spacing.sm },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingHorizontal: spacing.sm, paddingTop: spacing.sm, gap: spacing.sm,
  },
  attachBtn: { paddingBottom: 6 },
  attachIcon: { fontSize: 22 },
  input: {
    flex: 1,
    color: colors.text.primary, fontSize: fontSize.base,
    maxHeight: 120, minHeight: 36,
    backgroundColor: colors.dark.bgElevated,
    borderRadius: 20, paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : 6,
  },
  sendCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center',
  },
  sendCircleDisabled: { backgroundColor: colors.dark.surface },
  sendArrow: { color: '#fff', fontSize: 18, fontWeight: '700' },
  micIcon: { fontSize: 22, paddingBottom: 6 },
});
