import { useState, useRef, useCallback, useEffect } from 'react';
import { TextInput } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useUser, useAuth } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
import { useStore } from '@/store';
import { messagesApi } from '@/services/api';
import { resizeForUpload } from '@/utils/imageResize';
import { showToast } from '@/components/ui/Toast';
import {
  encryptMessage as signalEncrypt,
  hasEstablishedSession,
  createInitiatorSession,
  fetchPreKeyBundle,
  generateSenderKey,
  encryptGroupMessage,
  encryptSmallMediaFile,
  uploadEncryptedMedia,
  distributeSenderKeyToMembers,
} from '@/services/signal';
import { encryptMessage as signalEncryptRaw } from '@/services/signal/session';
import { uploadSenderKey } from '@/services/signal/e2eApi';
import { toBase64 } from '@/services/signal/crypto';
import { loadIdentityKeyPair, loadRegistrationId, loadKnownIdentityKey } from '@/services/signal/storage';
import { sealMessage } from '@/services/signal/sealed-sender';
import { enqueueMessage as enqueueOfflineMessage } from '@/services/offlineMessageQueue';
import type { Conversation, ConversationMember, Message } from '@/types';
import type { PendingMessage } from './useConversationMessages';
import type { MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';

interface UseMessageSendParams {
  conversationId: string;
  conversationData: Conversation | undefined;
  setPendingMessages: React.Dispatch<React.SetStateAction<PendingMessage[]>>;
  socketRef: MutableRefObject<Socket | null>;
}

export function useMessageSend({
  conversationId,
  conversationData,
  setPendingMessages,
  socketRef,
}: UseMessageSendParams) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();
  const isOffline = useStore((s) => s.isOffline);
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState('');
  const [sendAsSpoiler, setSendAsSpoiler] = useState(false);
  const [sendAsViewOnce, setSendAsViewOnce] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; content?: string; username: string } | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCounterRef = useRef(0);
  const lastSentRef = useRef<number>(0);

  // Undo-via-delete
  const [undoPending, setUndoPending] = useState<{
    pendingId: string;
    serverMessageId: string | null;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (undoPending?.timer) clearTimeout(undoPending.timer);
    };
  }, [undoPending]);

  const handleUndoSend = useCallback(() => {
    if (!undoPending) return;
    clearTimeout(undoPending.timer);
    setPendingMessages(prev => prev.filter(p => p.id !== undoPending.pendingId));
    if (undoPending.serverMessageId) {
      messagesApi.deleteMessage(conversationId, undoPending.serverMessageId).catch(() => {});
    }
    setUndoPending(null);
    haptic.delete();
  }, [undoPending, haptic, conversationId, setPendingMessages]);

  /**
   * Emit an encrypted message to the server IMMEDIATELY via socket.
   * Returns the server-assigned messageId from the ACK callback.
   */
  const emitEncryptedMessage = useCallback((payload: {
    e2ePayload: NonNullable<PendingMessage['e2ePayload']>;
    replyToId?: string;
    isSpoiler?: boolean;
    isViewOnce?: boolean;
    messageType?: string;
    mediaUrl?: string;
    sealedEnvelope?: { recipientId: string; ephemeralKey: string; sealedCiphertext: string };
  }): Promise<string | null> => {
    return new Promise((resolve) => {
      if (isOffline || !socketRef.current?.connected) {
        resolve(null);
        return;
      }

      const isGroupMessage = payload.e2ePayload.e2eSenderKeyId !== undefined;

      if (!isGroupMessage && payload.sealedEnvelope) {
        // F5: 1:1 message — use sealed sender
        socketRef.current.emit('send_sealed_message', {
          conversationId,
          recipientId: payload.sealedEnvelope.recipientId,
          ephemeralKey: payload.sealedEnvelope.ephemeralKey,
          sealedCiphertext: payload.sealedEnvelope.sealedCiphertext,
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
          conversationId,
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
  }, [conversationId, isOffline, socketRef]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || isSending || isSendingRef.current) return;
    isSendingRef.current = true;

    const convo = conversationData;
    // Finding #366: Slow mode enforcement
    const slowMode = (convo as Record<string, unknown> | undefined)?.slowModeSeconds as number | undefined;
    if (slowMode && slowMode > 0) {
      const elapsed = (Date.now() - lastSentRef.current) / 1000;
      if (elapsed < slowMode) {
        const remaining = Math.ceil(slowMode - elapsed);
        showToast({ message: t('messages.slowMode', { seconds: remaining }), variant: 'info' });
        isSendingRef.current = false;
        return;
      }
    }

    // Edit mode
    if (editingMsg) {
      setIsSending(true);
      messagesApi.editMessage(conversationId, editingMsg.id, text.trim())
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          setEditingMsg(null);
          setText('');
        })
        .catch(() => showToast({ message: t('errors.editMessageFailed'), variant: 'error' }))
        .finally(() => { setIsSending(false); isSendingRef.current = false; });
      return;
    }
    haptic.send();
    setIsSending(true);

    const messageContent = text.trim();
    let e2ePayload: PendingMessage['e2ePayload'] | undefined;
    let sealedEnvelopeForEmit: { recipientId: string; ephemeralKey: string; sealedCiphertext: string } | undefined;

    const otherMember = convo?.members?.find((m: ConversationMember) => m.userId !== user?.id);
    const recipientId = otherMember?.userId;
    const isGroupChat = convo?.isGroup === true;

    if (isGroupChat) {
      // -- GROUP ENCRYPTION: Sender Keys (O(1) encrypt per message) --
      try {
        const ensureSenderKeyDistributed = async () => {
          await generateSenderKey(conversationId);
          const memberIds = convo?.members
            ?.map((m: ConversationMember) => m.userId)
            .filter((uid): uid is string => !!uid && uid !== user?.id) ?? [];
          for (const memberId of memberIds) {
            const has = await hasEstablishedSession(memberId);
            if (!has) {
              try {
                const { bundle } = await fetchPreKeyBundle(memberId);
                await createInitiatorSession(memberId, 1, bundle);
              } catch { /* Member may not have E2E keys yet */ }
            }
          }
          const encryptForMember = async (rid: string, senderKeyBytes: Uint8Array): Promise<Uint8Array> => {
            const b64 = toBase64(senderKeyBytes);
            const msg = await signalEncryptRaw(rid, 1, b64);
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
          const uploadToServer = async (groupId: string, recipientIdParam: string, encKey: Uint8Array, chainId: number, gen: number) => {
            await uploadSenderKey(groupId, recipientIdParam, encKey, chainId, gen);
          };
          await distributeSenderKeyToMembers(conversationId, memberIds, encryptForMember, uploadToServer);
        };

        let senderKeyMsg;
        try {
          senderKeyMsg = await encryptGroupMessage(conversationId, messageContent);
        } catch (err) {
          if (String(err).includes('No sender key')) {
            await ensureSenderKeyDistributed();
            senderKeyMsg = await encryptGroupMessage(conversationId, messageContent);
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
          e2eSenderKeyId: senderKeyMsg.chainId,
        };
      } catch {
        showToast({ message: t('errors.encryptionFailed'), variant: 'error' });
        setIsSending(false);
        isSendingRef.current = false;
        return;
      }
    } else if (recipientId) {
      // -- 1:1 ENCRYPTION: Double Ratchet --
      try {
        const isFirstMessage = !(await hasEstablishedSession(recipientId));
        let signedPreKeyId: number | undefined;
        let oneTimePreKeyId: number | undefined;

        if (isFirstMessage) {
          const { bundle } = await fetchPreKeyBundle(recipientId);
          const result = await createInitiatorSession(recipientId, 1, bundle);
          signedPreKeyId = result.signedPreKeyId;
          oneTimePreKeyId = result.oneTimePreKeyId;
        }

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

        // F5: Create sealed envelope for 1:1 messages
        try {
          const recipientIdentityKey = await loadKnownIdentityKey(recipientId);
          const senderIdentityPair = await loadIdentityKeyPair();
          if (recipientIdentityKey && senderIdentityPair && user?.id) {
            const envelope = await sealMessage(
              recipientId,
              recipientIdentityKey,
              user.id,
              1,
              toBase64(signalMsg.ciphertext),
            );
            sealedEnvelopeForEmit = {
              recipientId: envelope.recipientId,
              ephemeralKey: envelope.ephemeralKey,
              sealedCiphertext: envelope.sealedCiphertext,
            };
          }
        } catch {
          // Sealed sender creation failed — fall back to regular send_message
        }
      } catch {
        showToast({ message: t('errors.encryptionFailed'), variant: 'error' });
        setIsSending(false);
        isSendingRef.current = false;
        return;
      }
    }

    const pendingId = `pending_${Date.now()}_${++pendingCounterRef.current}`;
    const pendingMessage: PendingMessage = {
      id: pendingId,
      content: messageContent,
      createdAt: new Date().toISOString(),
      status: 'pending',
      replyToId: replyTo?.id,
      e2ePayload,
    };
    setPendingMessages(prev => [...prev, pendingMessage]);
    lastSentRef.current = Date.now();
    const savedReplyToId = replyTo?.id;
    const savedSpoiler = sendAsSpoiler;
    const savedViewOnce = sendAsViewOnce;
    setText('');
    setReplyTo(null);
    setIsSending(false);
    isSendingRef.current = false;

    if (undoPending?.timer) {
      clearTimeout(undoPending.timer);
    }

    if (e2ePayload) {
      emitEncryptedMessage({
        e2ePayload,
        replyToId: savedReplyToId,
        sealedEnvelope: sealedEnvelopeForEmit,
        isSpoiler: savedSpoiler || undefined,
        isViewOnce: savedViewOnce || undefined,
      }).then((serverMessageId) => {
        if (serverMessageId === null) {
          enqueueOfflineMessage({
            conversationId,
            content: messageContent,
            e2ePayload,
            sealedEnvelope: sealedEnvelopeForEmit,
            replyToId: savedReplyToId,
          });
          return;
        }
        const timer = setTimeout(() => {
          setUndoPending(null);
          setPendingMessages(prev => prev.filter(p => p.id !== pendingId));
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }, 5000);
        setUndoPending({ pendingId, serverMessageId, timer });
      });
    }

    setSendAsSpoiler(false);
    setSendAsViewOnce(false);
  }, [text, replyTo, conversationId, isSending, haptic, isOffline, editingMsg, queryClient, conversationData, user?.id, undoPending, emitEncryptedMessage, setPendingMessages, sendAsSpoiler, sendAsViewOnce, t]);

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
      const resized = await resizeForUpload(asset.uri, asset.width, asset.height);
      const encResult = await encryptSmallMediaFile(resized.uri, resized.mimeType, {
        width: resized.width,
        height: resized.height,
      });

      const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
      const token = await getToken() ?? '';
      const mediaUrl = await uploadEncryptedMedia(
        encResult.encryptedFileUri,
        11 + encResult.totalChunks * 16 + encResult.fileSize,
        apiUrl.replace('/api/v1', ''),
        token,
      );

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

      const convoData = conversationData;
      const isGroup = convoData?.isGroup === true;
      const wrappedMedia = JSON.stringify({ t: 'IMAGE', c: mediaPayload });
      const clientMessageId = `media_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      if (isGroup) {
        let senderKeyMsg;
        try {
          senderKeyMsg = await encryptGroupMessage(conversationId, wrappedMedia);
        } catch (err) {
          if (String(err).includes('No sender key')) {
            await generateSenderKey(conversationId);
            senderKeyMsg = await encryptGroupMessage(conversationId, wrappedMedia);
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
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    } catch {
      showToast({ message: t('errors.sendImageFailed'), variant: 'error' });
    } finally {
      setUploadingMedia(false);
    }
  }, [conversationId, replyTo, queryClient, haptic, conversationData, user?.id, emitEncryptedMessage, getToken, t]);

  // Typing indicators
  const handleChangeText = useCallback((val: string) => {
    setText(val);
    if (!isTyping) {
      setIsTyping(true);
      socketRef.current?.emit('typing', { conversationId, isTyping: true });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      setIsTyping(false);
      socketRef.current?.emit('typing', { conversationId, isTyping: false });
    }, 2000);
  }, [conversationId, isTyping, socketRef]);

  return {
    // Text state
    text,
    setText,
    handleChangeText,
    // Send
    handleSend,
    isSending,
    // Media
    pickAndSendMedia,
    uploadingMedia,
    // Undo
    undoPending,
    handleUndoSend,
    // Reply
    replyTo,
    setReplyTo,
    // Edit
    editingMsg,
    setEditingMsg,
    // Spoiler / View Once
    sendAsSpoiler,
    setSendAsSpoiler,
    sendAsViewOnce,
    setSendAsViewOnce,
    // Refs
    inputRef,
    // Emit (exposed for GIF picker, voice, forward)
    emitEncryptedMessage,
  };
}
