import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { useQueryClient } from '@tanstack/react-query';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useContextualHaptic } from '@/hooks/useContextualHaptic';
import { useTranslation } from '@/hooks/useTranslation';
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
} from '@/services/signal';
import { toBase64 } from '@/services/signal/crypto';
import type { Conversation, ConversationMember } from '@/types';
import type { PendingMessage } from './useConversationMessages';

interface UseVoiceRecordingParams {
  conversationId: string;
  conversationData: Conversation | undefined;
  replyTo: { id: string; content?: string; username: string } | null;
  setReplyTo: (val: { id: string; content?: string; username: string } | null) => void;
  emitEncryptedMessage: (payload: {
    e2ePayload: NonNullable<PendingMessage['e2ePayload']>;
    replyToId?: string;
  }) => Promise<string | null>;
}

export function useVoiceRecording({
  conversationId,
  conversationData,
  replyTo,
  setReplyTo,
  emitEncryptedMessage,
}: UseVoiceRecordingParams) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const haptic = useContextualHaptic();
  const { t } = useTranslation();

  const [isRecording, setIsRecording] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [slideOffset, setSlideOffset] = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const handleVoiceStart = useCallback(async () => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) { showToast({ message: t('errors.microphoneAccessRequired'), variant: 'error' }); return; }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();
    recordingRef.current = recording;
    setRecordingTime(0);
    setSlideOffset(0);
    setCancelled(false);
    setIsRecording(true);
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
    haptic.longPress();
  }, [haptic, t]);

  const cancelRecording = useCallback(async () => {
    if (!recordingRef.current) return;
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
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
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

      const convoData = conversationData;
      const isGroup = convoData?.isGroup === true;
      const wrappedVoice = JSON.stringify({ t: 'VOICE', c: voicePayload });
      const clientMessageId = `voice_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      if (isGroup) {
        let senderKeyMsg;
        try {
          senderKeyMsg = await encryptGroupMessage(conversationId, wrappedVoice);
        } catch (err) {
          if (String(err).includes('No sender key')) {
            await generateSenderKey(conversationId);
            senderKeyMsg = await encryptGroupMessage(conversationId, wrappedVoice);
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
  }, [conversationId, replyTo, haptic, cancelled, conversationData, user?.id, emitEncryptedMessage, getToken, recordingTime, setReplyTo, t]);

  return {
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
  };
}
