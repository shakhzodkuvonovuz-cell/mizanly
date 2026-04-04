import { useState, useRef, useCallback, useEffect } from 'react';
import { FlatList } from 'react-native';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-expo';
import { messagesApi } from '@/services/api';
import { useSocket } from '@/providers/SocketProvider';
import { useStore } from '@/store';
import {
  getRetryableMessages,
  processQueue,
  dequeueMessage as dequeueOfflineMessage,
} from '@/services/offlineMessageQueue';
import type { Message } from '@/types';
import type { EncryptedMessage } from './useConversationEncryption';
import type { MutableRefObject } from 'react';

export type PendingMessage = {
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

export type EmitEncryptedMessageFn = (payload: {
  e2ePayload: NonNullable<PendingMessage['e2ePayload']>;
  replyToId?: string;
  sealedEnvelope?: { recipientId: string; ephemeralKey: string; sealedCiphertext: string };
}) => Promise<string | null>;

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

interface UseConversationMessagesParams {
  conversationId: string;
  /** Ref-based to break circular dependency: useMessageSend provides the fn after init */
  emitEncryptedMessageRef: MutableRefObject<EmitEncryptedMessageFn | null>;
}

export function useConversationMessages({
  conversationId,
  emitEncryptedMessageRef,
}: UseConversationMessagesParams) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const socketRef = useRef(socket);
  useEffect(() => { socketRef.current = socket; }, [socket]);
  const isOffline = useStore((s) => s.isOffline);

  const flatListRef = useRef<FlatList>(null);
  const initialScrollDoneRef = useRef(false);
  const newMessageIdsRef = useRef(new Set<string>());

  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [deliveredMessages, setDeliveredMessages] = useState<Set<string>>(() => new Set());
  const [pinnedMessage, setPinnedMessage] = useState<Message | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingMessagesRef = useRef(pendingMessages);
  useEffect(() => {
    pendingMessagesRef.current = pendingMessages;
  }, [pendingMessages]);

  // Load persisted offline queue messages into React state on mount.
  useEffect(() => {
    const queued = getRetryableMessages(conversationId);
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
        const existingIds = new Set(prev.map(p => p.id));
        const newMsgs = restored.filter(r => !existingIds.has(r.id));
        return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
      });
    }
  // Only run on mount (id is stable for this screen instance)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const convoQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => messagesApi.getConversation(conversationId),
  });

  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: ({ pageParam }) =>
      messagesApi.getMessages(conversationId, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasMore ? last.meta.cursor ?? undefined : undefined,
    select: selectMessagesReversed,
  });

  // Pinned messages query
  const pinnedQuery = useQuery({
    queryKey: ['pinned-messages', conversationId],
    queryFn: () => messagesApi.getPinned(conversationId),
    enabled: !!conversationId,
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

  // Register event listeners on the shared socket for this conversation
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      socket.emit('join_conversation', { conversationId });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      // Process persistent offline queue — messages survive app crash.
      const emitFn = emitEncryptedMessageRef.current;
      if (emitFn) {
        processQueue(async (queuedMsg) => {
          if (!queuedMsg.e2ePayload) return false;
          const result = await emitFn({
            e2ePayload: queuedMsg.e2ePayload,
            replyToId: queuedMsg.replyToId,
            sealedEnvelope: queuedMsg.sealedEnvelope,
          });
          return result !== null;
        }, conversationId).then(({ sent }) => {
          if (sent > 0) {
            const retryable = new Set(getRetryableMessages(conversationId).map(m => m.id));
            setPendingMessages(prev => prev.filter(p => retryable.has(p.id)));
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          }
        });
      }
      // Also retry React-state-only pending messages
      const pending = pendingMessagesRef.current.filter(p => p.status === 'pending' && p.e2ePayload);
      pending.forEach(p => {
        if (p.e2ePayload && emitEncryptedMessageRef.current) {
          emitEncryptedMessageRef.current({
            e2ePayload: p.e2ePayload,
            replyToId: p.replyToId,
            sealedEnvelope: p.sealedEnvelope,
          });
        }
      });
    };

    const handleNewMessage = (msg: Message & { clientId?: string }) => {
      newMessageIdsRef.current.add(msg.id);
      const pending = pendingMessagesRef.current;
      const matchedIndex = pending.findIndex(p =>
        p.id === msg.clientId ||
        (p.content === msg.content && Date.now() - new Date(p.createdAt).getTime() < 30000)
      );
      if (matchedIndex >= 0) {
        const matchedMsg = pending[matchedIndex];
        if (matchedMsg.id.startsWith('q_')) {
          dequeueOfflineMessage(matchedMsg.id);
        }
        setPendingMessages(prev => prev.filter((_, i) => i !== matchedIndex));
      }
      queryClient.setQueryData<{ pages: { data: Message[]; meta: { cursor: string | null; hasMore: boolean } }[]; pageParams: (string | undefined)[] }>(['messages', conversationId], (old) => {
        if (!old) return old;
        const pages = [...old.pages];
        const lastPage = { ...pages[pages.length - 1] };
        lastPage.data = [...lastPage.data, msg];
        pages[pages.length - 1] = lastPage;
        return { ...old, pages };
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      setTimeout(() => {
        newMessageIdsRef.current.delete(msg.id);
      }, 500);
      if (msg.sender?.id !== user?.id) {
        socket.emit('message_delivered', { messageId: msg.id, conversationId });
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
        if (typing) {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 5000);
        } else if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }
    };

    const handleMessagesRead = ({ userId: readerId }: { userId: string }) => {
      if (readerId !== user?.id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      }
    };

    // F5: Handle sealed sender messages
    const handleSealedMessage = async (data: {
      ephemeralKey: string;
      sealedCiphertext: string;
      conversationId: string;
    }) => {
      if (data.conversationId !== conversationId) return;
      try {
        const { unsealMessage } = await import('@/services/signal/sealed-sender');
        await unsealMessage({
          recipientId: user?.id ?? '',
          ephemeralKey: data.ephemeralKey,
          sealedCiphertext: data.sealedCiphertext,
        });
      } catch {
        // Unsealing failed — the regular new_message event will still arrive
      }
    };

    socket.on('connect', handleConnect);
    socket.on('new_message', handleNewMessage);
    socket.on('delivery_receipt', handleDeliveryReceipt);
    socket.on('user_typing', handleUserTyping);
    socket.on('messages_read', handleMessagesRead);
    socket.on('sealed_message', handleSealedMessage);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.emit('leave_conversation', { conversationId });
      socket.off('connect', handleConnect);
      socket.off('new_message', handleNewMessage);
      socket.off('delivery_receipt', handleDeliveryReceipt);
      socket.off('user_typing', handleUserTyping);
      socket.off('messages_read', handleMessagesRead);
      socket.off('sealed_message', handleSealedMessage);
    };
  // emitEncryptedMessageRef is a stable ref — no need in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversationId, user?.id, queryClient]);

  // Mark conversation as read
  const markedReadRef = useRef<string | null>(null);
  useEffect(() => {
    if (markedReadRef.current === conversationId) return;
    markedReadRef.current = conversationId;
    messagesApi.markRead(conversationId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }))
      .catch(() => {});
  }, [conversationId, queryClient]);

  // Retry pending messages when network comes back online
  useEffect(() => {
    if (isOffline || !socketRef.current?.connected) return;
    const emitFn = emitEncryptedMessageRef.current;
    if (!emitFn) return;
    processQueue(async (queuedMsg) => {
      if (!queuedMsg.e2ePayload) return false;
      const result = await emitFn({
        e2ePayload: queuedMsg.e2ePayload,
        replyToId: queuedMsg.replyToId,
        sealedEnvelope: queuedMsg.sealedEnvelope,
      });
      return result !== null;
    }, conversationId).then(({ sent }) => {
      if (sent > 0) {
        const retryable = new Set(getRetryableMessages(conversationId).map(m => m.id));
        setPendingMessages(prev => prev.filter(p => retryable.has(p.id)));
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      }
    });
    const toRetry = pendingMessages.filter(p => p.status === 'pending' && p.e2ePayload);
    toRetry.forEach(pending => {
      if (pending.e2ePayload) {
        emitFn({ e2ePayload: pending.e2ePayload, replyToId: pending.replyToId }).then((result) => {
          if (result !== null) {
            setPendingMessages(prev => prev.filter(p => p.id !== pending.id));
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          }
        });
      }
    });
  // emitEncryptedMessageRef is a stable ref — no need in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOffline, pendingMessages, conversationId, queryClient]);

  return {
    // Queries
    convoQuery,
    messagesQuery,
    messages,
    // Pending messages
    pendingMessages,
    setPendingMessages,
    pendingMessagesRef,
    // Delivered messages
    deliveredMessages,
    // Pinned
    pinnedMessage,
    setPinnedMessage,
    // Refresh
    refreshing,
    onRefresh,
    // Typing
    otherTyping,
    // Refs
    flatListRef,
    initialScrollDoneRef,
    newMessageIdsRef,
    // Socket ref (shared with useMessageSend)
    socketRef,
  };
}
