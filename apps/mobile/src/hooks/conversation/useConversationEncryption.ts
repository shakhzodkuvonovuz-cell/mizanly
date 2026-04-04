import { useState, useCallback, useEffect, useRef } from 'react';
import {
  encryptMessage as signalEncrypt,
  decryptMessage as signalDecrypt,
  createResponderSession,
  cacheDecryptedMessage,
  indexMessage,
  decryptGroupMessage,
} from '@/services/signal';
import { fromBase64 } from '@/services/signal/crypto';
import type { PreKeySignalMessage } from '@/services/signal/types';
import type { Message, Conversation } from '@/types';

// Extended message type for Signal Protocol E2E encryption fields (server passthrough)
export interface EncryptedMessage extends Message {
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

interface UseConversationEncryptionParams {
  conversationId: string;
  conversationData: Conversation | undefined;
  messages: EncryptedMessage[];
}

export function useConversationEncryption({
  conversationId,
  conversationData,
  messages,
}: UseConversationEncryptionParams) {
  // E2E encryption — Signal Protocol is always on for all conversations.
  // Signal init happens in _layout.tsx at app startup. Here we just track
  // session readiness for UI indicators and decrypted content cache.
  const [isEncrypted] = useState(true); // Always encrypted via Signal Protocol
  const [decryptedContents, setDecryptedContents] = useState<Map<string, string>>(new Map());
  // Fix #166: Ref-based cache prevents O(n) re-decryption on every new message.
  // The ref is the canonical source of truth (survives stale closures in the
  // batched decrypt effect). State is synced from ref for re-rendering only.
  const decryptedCacheRef = useRef<Map<string, string>>(new Map());
  // Track message IDs currently being decrypted to avoid duplicate work
  const inFlightRef = useRef<Set<string>>(new Set());

  // Decrypt incoming E2E encrypted messages via Signal Protocol.
  // Handles 3 message types:
  //   1. PreKeySignalMessage (first contact — has e2eIdentityKey + e2eEphemeralKey)
  //   2. Regular SignalMessage (established session — has e2eSenderRatchetKey, no e2eIdentityKey)
  //   3. SenderKeyMessage (group — has e2eSenderKeyId)
  const getDecryptedContent = useCallback(async (message: EncryptedMessage) => {
    // Check ref cache first to avoid re-decryption
    const cached = decryptedCacheRef.current.get(message.id);
    if (cached !== undefined) return cached;

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
        // -- GROUP MESSAGE (Sender Key) --
        decrypted = await decryptGroupMessage(conversationId, senderId, {
          groupId: conversationId,
          chainId: message.e2eSenderKeyId!,
          generation: message.e2ePreviousCounter ?? 0,
          counter: message.e2eCounter ?? 0,
          ciphertext: fromBase64(message.encryptedContent),
          signature: fromBase64(message.e2eSenderRatchetKey ?? ''),
        });
      } else if (isPreKeyMsg) {
        // -- FIRST-CONTACT MESSAGE (PreKeySignalMessage -> create responder session) --
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
        // -- REGULAR MESSAGE (established Double Ratchet session) --
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
      const disappearSec = conversationData?.disappearingDuration;
      const createdAtMs = new Date(message.createdAt).getTime();
      const expiresAt = disappearSec && disappearSec > 0
        ? createdAtMs + disappearSec * 1000
        : undefined;

      cacheDecryptedMessage({
        messageId: message.id,
        conversationId,
        senderId,
        content: realContent,
        messageType: realMessageType,
        createdAt: createdAtMs,
        expiresAt,
      }).catch(() => {});
      // Don't index disappearing messages for search (they should vanish completely)
      if (!expiresAt) {
        indexMessage(message.id, conversationId, realContent, createdAtMs).catch(() => {});
      }
      // Store in ref cache so subsequent calls skip re-decryption
      decryptedCacheRef.current.set(message.id, realContent);
      return realContent;
    } catch {
      // V5-F3: Do NOT auto-reset sessions on decrypt failure.
      // Previously: a corrupted message from a malicious server triggered resetSession(),
      // forcing re-establishment via X3DH with a potentially substituted bundle (MITM).
      // Now: display error, let the user manually reset if needed via conversation info.
      // The session state is preserved — subsequent messages may still decrypt.
      return '[Encrypted message]';
    }
  }, [conversationId, conversationData?.disappearingDuration]);

  // C7: Disappearing message enforcement — periodic cleanup of expired cached messages.
  useEffect(() => {
    const disappearSec = conversationData?.disappearingDuration;
    if (!disappearSec || disappearSec <= 0) return;
    const interval = setInterval(() => {
      setDecryptedContents(prev => new Map(prev)); // Force re-render -> cache filters expired
    }, Math.min(disappearSec * 1000, 30000));
    return () => clearInterval(interval);
  }, [conversationData?.disappearingDuration]);

  // Pre-decrypt E2E encrypted messages with concurrency limit to avoid ANR (#2)
  // Fix #166: Use ref-based cache to only decrypt truly new messages (O(1) per new message
  // instead of O(n) re-checking the entire history via stale state closure).
  useEffect(() => {
    const DECRYPT_BATCH_SIZE = 5;
    const cache = decryptedCacheRef.current;
    const inFlight = inFlightRef.current;
    const toDecrypt = messages.filter(
      msg => msg.encryptedContent && msg.e2eVersion && !cache.has(msg.id) && !inFlight.has(msg.id),
    );
    if (toDecrypt.length === 0) return;

    // Mark as in-flight to prevent duplicate decrypt attempts from re-renders
    for (const msg of toDecrypt) {
      inFlight.add(msg.id);
    }

    let cancelled = false;
    (async () => {
      for (let i = 0; i < toDecrypt.length; i += DECRYPT_BATCH_SIZE) {
        if (cancelled) break;
        const batch = toDecrypt.slice(i, i + DECRYPT_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(msg => getDecryptedContent(msg).then(d => ({ id: msg.id, content: d }))),
        );
        if (cancelled) break;
        // Sync ref cache to state for rendering
        setDecryptedContents(prev => {
          const next = new Map(prev);
          let changed = false;
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value.content) {
              cache.set(r.value.id, r.value.content);
              if (!next.has(r.value.id)) {
                next.set(r.value.id, r.value.content);
                changed = true;
              }
            }
            // Remove from in-flight regardless of success/failure
            if (r.status === 'fulfilled') inFlight.delete(r.value.id);
            else {
              const failedMsg = batch[results.indexOf(r)];
              if (failedMsg) inFlight.delete(failedMsg.id);
            }
          }
          return changed ? next : prev;
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  return {
    isEncrypted,
    decryptedContents,
    getDecryptedContent,
  };
}
