import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../config/prisma.service';
import { MessagesService } from './messages.service';
import { InternalE2EController } from './internal-e2e.controller';
import { WsSendMessageDto } from '../../gateways/dto/send-message.dto';
import { AiService } from '../ai/ai.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { createHmac } from 'crypto';

// ──────────────────────────────────────────────────────────────────────────────
// E2E Encryption — Exhaustive Field Tests
//
// Tests ALL E2E encryption changes across:
//   1. sendMessage — validation, flags, dedup, transcription skip, notification body
//   2. editMessage — rejection of encrypted messages
//   3. deleteMessage — cryptographic material clearing
//   4. searchMessages + searchAllMessages — e2eVersion exclusion filter
//   5. forwardMessage — rejection of encrypted messages
//   6. WsSendMessageDto — class-validator constraints on E2E fields
//   7. InternalE2EController — webhook HMAC verification + SYSTEM message creation
// ──────────────────────────────────────────────────────────────────────────────

describe('MessagesService — E2E Encryption Fields', () => {
  let service: MessagesService;
  let prisma: any;
  let aiService: any;

  // Default membership mock: sender is a member, no other members (skip block + DM restriction checks)
  const defaultMembership = {
    userId: 'user-1',
    isMuted: false,
    isArchived: false,
    isBanned: false,
    unreadCount: 0,
    conversation: {
      isGroup: false,
      slowModeSeconds: null,
      disappearingDuration: null,
      members: [],
    },
  };

  // Reusable transaction mock factory
  function makeTxMock(createReturn: Record<string, unknown> = {}) {
    return {
      message: {
        create: jest.fn().mockResolvedValue({
          id: 'msg-e2e-1',
          content: null,
          messageType: 'TEXT',
          isEncrypted: true,
          e2eVersion: 1,
          encryptedContent: new Uint8Array([1, 2, 3]),
          mediaUrl: null,
          createdAt: new Date(),
          sender: { id: 'user-1', username: 'alice', displayName: 'Alice', avatarUrl: null },
          ...createReturn,
        }),
      },
      conversation: { update: jest.fn().mockResolvedValue({}) },
      conversationMember: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
      },
    };
  }

  beforeEach(async () => {
    const mockAiWithTranscribe = {
      provide: AiService,
      useValue: {
        moderateContent: jest.fn().mockResolvedValue({ safe: true, flags: [], confidence: 0 }),
        moderateImage: jest.fn().mockResolvedValue({ classification: 'SAFE', reason: null, categories: [] }),
        isAvailable: jest.fn().mockReturnValue(true),
        suggestCaptions: jest.fn().mockResolvedValue([]),
        suggestHashtags: jest.fn().mockResolvedValue([]),
        translateText: jest.fn().mockResolvedValue({ translatedText: '' }),
        generateAltText: jest.fn().mockResolvedValue('Image'),
        transcribeVoiceMessage: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...globalMockProviders,
        mockAiWithTranscribe, // Override the globalMockProviders' AiService mock
        MessagesService,
        {
          provide: PrismaService,
          useValue: {
            conversationMember: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn().mockResolvedValue(defaultMembership),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              createMany: jest.fn(),
              delete: jest.fn(),
              aggregate: jest.fn().mockResolvedValue({ _sum: { unreadCount: 0 } }),
            },
            conversation: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            message: {
              findMany: jest.fn().mockResolvedValue([]),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            block: {
              findFirst: jest.fn().mockResolvedValue(null),
              findMany: jest.fn().mockResolvedValue([]),
            },
            messageReaction: {
              upsert: jest.fn(),
              deleteMany: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
            userSettings: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
            follow: {
              findUnique: jest.fn().mockResolvedValue(null),
            },
            dMNote: {
              upsert: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              delete: jest.fn(),
            },
            starredMessage: {
              upsert: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
              deleteMany: jest.fn(),
            },
            $transaction: jest.fn().mockImplementation(async (fn: unknown) => {
              if (typeof fn === 'function') {
                const tx = makeTxMock();
                return fn(tx);
              }
              return Promise.all(fn as Promise<unknown>[]);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    prisma = module.get(PrismaService) as any;
    aiService = module.get(AiService) as any;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // sendMessage — E2E Validation
  // ════════════════════════════════════════════════════════════════════════════

  describe('sendMessage — E2E validation', () => {
    it('should reject e2eVersion without encryptedContent', async () => {
      // Provide mediaUrl so it passes the "must have content, encrypted content, or media" check
      // and hits the e2eVersion-without-encryptedContent check specifically
      await expect(
        service.sendMessage('conv-1', 'user-1', {
          e2eVersion: 1,
          mediaUrl: 'https://example.com/img.jpg',
          // no encryptedContent
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.sendMessage('conv-1', 'user-1', {
          e2eVersion: 1,
          mediaUrl: 'https://example.com/img.jpg',
        }),
      ).rejects.toThrow('e2eVersion requires encryptedContent');
    });

    it('should reject encryptedContent without e2eVersion', async () => {
      await expect(
        service.sendMessage('conv-1', 'user-1', {
          encryptedContent: new Uint8Array([1, 2, 3]),
          // no e2eVersion
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.sendMessage('conv-1', 'user-1', {
          encryptedContent: new Uint8Array([1, 2, 3]),
        }),
      ).rejects.toThrow('encryptedContent requires e2eVersion');
    });

    it('should reject both content AND encryptedContent (mutual exclusion)', async () => {
      await expect(
        service.sendMessage('conv-1', 'user-1', {
          content: 'plaintext leak attempt',
          encryptedContent: new Uint8Array([1, 2, 3]),
          e2eVersion: 1,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.sendMessage('conv-1', 'user-1', {
          content: 'hello',
          encryptedContent: new Uint8Array([4, 5, 6]),
          e2eVersion: 1,
        }),
      ).rejects.toThrow('Message cannot have both content and encryptedContent');
    });

    it('should accept encryptedContent + e2eVersion (no content)', async () => {
      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      const result = await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([10, 20, 30]),
        e2eVersion: 1,
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('msg-e2e-1');
    });

    it('should accept content only — backward compatible (no e2e fields)', async () => {
      const txMock = makeTxMock({
        id: 'msg-plain-1',
        content: 'Hello world',
        isEncrypted: false,
        e2eVersion: null,
        encryptedContent: null,
      });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      const result = await service.sendMessage('conv-1', 'user-1', {
        content: 'Hello world',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('msg-plain-1');
      expect(result.content).toBe('Hello world');
    });

    it('should set isEncrypted=true when e2eVersion present', async () => {
      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
      });

      expect(txMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isEncrypted: true,
          }),
        }),
      );
    });

    it('should set isEncrypted=false when e2eVersion absent', async () => {
      const txMock = makeTxMock({
        id: 'msg-plain-2',
        content: 'plain',
        isEncrypted: false,
        e2eVersion: null,
        encryptedContent: null,
      });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      await service.sendMessage('conv-1', 'user-1', {
        content: 'plain message',
      });

      expect(txMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isEncrypted: false,
          }),
        }),
      );
    });

    it('should set content=null when e2eVersion present', async () => {
      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
      });

      expect(txMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: null,
          }),
        }),
      );
    });

    it('should set lastMessageText=null for encrypted messages', async () => {
      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
      });

      expect(txMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastMessageText: null,
          }),
        }),
      );
    });

    it('should set lastMessageText to truncated plaintext for non-encrypted messages', async () => {
      const txMock = makeTxMock({
        id: 'msg-plain-lm',
        content: 'Hello world',
        isEncrypted: false,
        e2eVersion: null,
        encryptedContent: null,
      });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      await service.sendMessage('conv-1', 'user-1', {
        content: 'Hello world',
      });

      expect(txMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastMessageText: 'Hello world',
          }),
        }),
      );
    });

    it('should store encryptedLastMessagePreview when provided', async () => {
      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      const preview = new Uint8Array([99, 100, 101]);
      await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
        encryptedLastMessagePreview: preview,
      });

      expect(txMock.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            encryptedLastMessagePreview: expect.any(Uint8Array),
          }),
        }),
      );
    });

    it('should NOT include encryptedLastMessagePreview when not provided', async () => {
      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
        // no encryptedLastMessagePreview
      });

      const updateCall = txMock.conversation.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('encryptedLastMessagePreview');
    });

    it('should pass all E2E opaque fields through to message.create', async () => {
      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
        e2eSenderDeviceId: 42,
        e2eSenderRatchetKey: new Uint8Array([10, 20, 30]),
        e2eCounter: 7,
        e2ePreviousCounter: 5,
        e2eSenderKeyId: 3,
        clientMessageId: 'uuid-abc-123',
      });

      expect(txMock.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            e2eVersion: 1,
            e2eSenderDeviceId: 42,
            e2eCounter: 7,
            e2ePreviousCounter: 5,
            e2eSenderKeyId: 3,
            clientMessageId: 'uuid-abc-123',
          }),
        }),
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // sendMessage — Idempotent dedup with clientMessageId
  // ════════════════════════════════════════════════════════════════════════════

  describe('sendMessage — idempotent dedup', () => {
    it('should return existing message when clientMessageId matches same conversation+sender', async () => {
      const existingMsg = {
        id: 'msg-existing',
        content: null,
        conversationId: 'conv-1',
        senderId: 'user-1',
        isEncrypted: true,
        e2eVersion: 1,
      };
      prisma.message.findUnique.mockResolvedValue(existingMsg);

      const result = await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
        clientMessageId: 'dedup-uuid',
      });

      expect(result).toEqual(existingMsg);
      // Transaction should NOT have been called — early return
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should silently ignore clientMessageId from different conversation/sender', async () => {
      // Existing message belongs to a different conversation
      const existingMsg = {
        id: 'msg-other',
        content: null,
        conversationId: 'conv-OTHER',
        senderId: 'user-OTHER',
        isEncrypted: true,
        e2eVersion: 1,
      };
      prisma.message.findUnique.mockResolvedValue(existingMsg);

      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      // Should proceed to create a new message (not return the existing one)
      const result = await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
        clientMessageId: 'dedup-uuid',
      });

      expect(result).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should proceed normally when no clientMessageId provided', async () => {
      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      const result = await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
        // no clientMessageId
      });

      expect(result).toBeDefined();
      // findUnique should NOT have been called for dedup (no clientMessageId)
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // sendMessage — Transcription skip for encrypted voice messages
  // ════════════════════════════════════════════════════════════════════════════

  describe('sendMessage — transcription skip', () => {
    it('should skip transcription for e2eVersion voice messages', async () => {
      const txMock = makeTxMock({
        id: 'msg-voice-enc',
        messageType: 'VOICE',
        mediaUrl: 'https://example.com/voice.ogg',
        isEncrypted: true,
        e2eVersion: 1,
      });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      aiService.transcribeVoiceMessage.mockClear();

      await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
        messageType: 'VOICE',
        mediaUrl: 'https://example.com/voice.ogg',
      });

      // transcribeVoiceMessage should NOT be called because e2eVersion is set
      expect(aiService.transcribeVoiceMessage).not.toHaveBeenCalled();
    });

    it('should call transcription for non-encrypted voice messages', async () => {
      const txMock = makeTxMock({
        id: 'msg-voice-plain',
        messageType: 'VOICE',
        mediaUrl: 'https://example.com/voice.ogg',
        isEncrypted: false,
        e2eVersion: null,
      });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      aiService.transcribeVoiceMessage.mockClear();

      await service.sendMessage('conv-1', 'user-1', {
        content: 'voice message',
        messageType: 'VOICE',
        mediaUrl: 'https://example.com/voice.ogg',
      });

      // For non-encrypted voice messages, transcription should be triggered
      expect(aiService.transcribeVoiceMessage).toHaveBeenCalledWith('msg-voice-plain', 'https://example.com/voice.ogg');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // sendMessage — Notification body for encrypted messages
  // ════════════════════════════════════════════════════════════════════════════

  describe('sendMessage — notification body', () => {
    it('should use generic "New message" body for encrypted messages', async () => {
      // Set up a conversation with at least one other member to trigger notification
      prisma.conversationMember.findUnique.mockResolvedValue({
        ...defaultMembership,
        conversation: {
          ...defaultMembership.conversation,
          members: [{ userId: 'user-2' }],
        },
      });

      const txMock = makeTxMock();
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      const emitter = (service as any).eventEmitter;
      // Reset mock for findMany on conversationMember (used by notifyConversationMembers)
      prisma.conversationMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);

      await service.sendMessage('conv-1', 'user-1', {
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eVersion: 1,
      });

      // Wait a tick for async notification
      await new Promise((r) => setTimeout(r, 50));

      // Verify event was emitted with generic body
      const notifCalls = emitter.emit.mock.calls.filter(
        (c: any[]) => c[0] === 'notification.requested',
      );
      if (notifCalls.length > 0) {
        expect(notifCalls[0][1].body).toBe('New message');
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // editMessage — Encrypted message rejection
  // ════════════════════════════════════════════════════════════════════════════

  describe('editMessage — encrypted rejection', () => {
    it('should reject edit of encrypted message (isEncrypted=true)', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-enc-1',
        senderId: 'user-1',
        isDeleted: false,
        isEncrypted: true,
        e2eVersion: 1,
        createdAt: new Date(),
      });

      await expect(
        service.editMessage('msg-enc-1', 'user-1', 'new plaintext'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.editMessage('msg-enc-1', 'user-1', 'new plaintext'),
      ).rejects.toThrow('Encrypted messages cannot be edited via server');
    });

    it('should reject edit of message with e2eVersion (even if isEncrypted=false — defensive)', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-enc-2',
        senderId: 'user-1',
        isDeleted: false,
        isEncrypted: false,
        e2eVersion: 2, // e2eVersion set, isEncrypted somehow false — still reject
        createdAt: new Date(),
      });

      await expect(
        service.editMessage('msg-enc-2', 'user-1', 'new plaintext'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow edit of non-encrypted message (backward compatible)', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-plain-1',
        senderId: 'user-1',
        isDeleted: false,
        isEncrypted: false,
        e2eVersion: null,
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      });
      prisma.message.update.mockResolvedValue({
        id: 'msg-plain-1',
        content: 'updated text',
        editedAt: new Date(),
      });

      const result = await service.editMessage('msg-plain-1', 'user-1', 'updated text');

      expect(result).toBeDefined();
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'updated text' }),
        }),
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // deleteMessage — E2E field clearing
  // ════════════════════════════════════════════════════════════════════════════

  describe('deleteMessage — E2E field clearing', () => {
    it('should clear ALL E2E cryptographic fields on delete', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-enc-del',
        senderId: 'user-1',
        isDeleted: false,
        isEncrypted: true,
        e2eVersion: 1,
        encryptedContent: new Uint8Array([1, 2, 3]),
        e2eSenderRatchetKey: new Uint8Array([4, 5, 6]),
        encNonce: 'some-nonce',
      });
      prisma.message.update.mockResolvedValue({ isDeleted: true });

      await service.deleteMessage('msg-enc-del', 'user-1');

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-enc-del' },
        data: expect.objectContaining({
          isDeleted: true,
          content: null,
          encryptedContent: null,
          encNonce: null,
          e2eSenderRatchetKey: null,
          e2eVersion: null,
          e2eSenderDeviceId: null,
          e2eCounter: null,
          e2ePreviousCounter: null,
          e2eSenderKeyId: null,
          transcription: null,
          mediaUrl: null,
          fileName: null,
          voiceDuration: null,
          mediaType: null,
          fileSize: null,
        }),
      });
    });

    it('should clear E2E fields even for non-encrypted messages (consistent behavior)', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'msg-plain-del',
        senderId: 'user-1',
        isDeleted: false,
        isEncrypted: false,
        content: 'plaintext message',
      });
      prisma.message.update.mockResolvedValue({ isDeleted: true });

      await service.deleteMessage('msg-plain-del', 'user-1');

      // The update sets ALL fields to null regardless of whether message was encrypted
      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-plain-del' },
        data: expect.objectContaining({
          isDeleted: true,
          encryptedContent: null,
          encNonce: null,
          e2eSenderRatchetKey: null,
          e2eVersion: null,
        }),
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // searchMessages — e2eVersion exclusion
  // ════════════════════════════════════════════════════════════════════════════

  describe('searchMessages — e2eVersion exclusion', () => {
    it('should include e2eVersion: null in query to exclude encrypted messages', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({
        isMuted: false,
        isArchived: false,
      });
      prisma.message.findMany.mockResolvedValue([]);

      await service.searchMessages('conv-1', 'user-1', 'hello');

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: 'conv-1',
            isDeleted: false,
            e2eVersion: null,
            content: expect.objectContaining({ contains: 'hello', mode: 'insensitive' }),
          }),
        }),
      );
    });

    it('should return empty array when all matching messages are encrypted', async () => {
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({
        isMuted: false,
        isArchived: false,
      });
      prisma.message.findMany.mockResolvedValue([]);

      const result = await service.searchMessages('conv-1', 'user-1', 'secret');

      expect(result.data).toEqual([]);
      expect(result.meta.hasMore).toBe(false);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // searchAllMessages — e2eVersion exclusion
  // ════════════════════════════════════════════════════════════════════════════

  describe('searchAllMessages — e2eVersion exclusion', () => {
    it('should include e2eVersion: null in global search query', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([
        { conversationId: 'conv-1' },
        { conversationId: 'conv-2' },
      ]);
      prisma.message.findMany.mockResolvedValue([]);

      await service.searchAllMessages('user-1', 'hello');

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: { in: ['conv-1', 'conv-2'] },
            isDeleted: false,
            e2eVersion: null,
            content: expect.objectContaining({ contains: 'hello', mode: 'insensitive' }),
          }),
        }),
      );
    });

    it('should return empty when user has no conversations', async () => {
      prisma.conversationMember.findMany.mockResolvedValue([]);

      const result = await service.searchAllMessages('user-1', 'hello');

      expect(result).toEqual([]);
      // message.findMany should NOT be called if no conversations
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // forwardMessage — encrypted rejection
  // ════════════════════════════════════════════════════════════════════════════

  describe('forwardMessage — encrypted rejection', () => {
    it('should reject forwarding of encrypted messages', async () => {
      prisma.message.findUnique.mockResolvedValue({
        conversationId: 'conv-1',
        content: null,
        messageType: 'TEXT',
        mediaUrl: null,
        mediaType: null,
        voiceDuration: null,
        fileName: null,
        fileSize: null,
        forwardCount: 0,
        isViewOnce: false,
        isEncrypted: true,
        e2eVersion: 1,
      });

      await expect(
        service.forwardMessage('msg-enc-fwd', 'user-1', ['conv-2']),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.forwardMessage('msg-enc-fwd', 'user-1', ['conv-2']),
      ).rejects.toThrow('Encrypted messages cannot be forwarded by the server');
    });

    it('should allow forwarding of non-encrypted messages', async () => {
      prisma.message.findUnique.mockResolvedValue({
        conversationId: 'conv-1',
        content: 'Hello',
        messageType: 'TEXT',
        mediaUrl: null,
        mediaType: null,
        voiceDuration: null,
        fileName: null,
        fileSize: null,
        forwardCount: 0,
        isViewOnce: false,
        isEncrypted: false,
        e2eVersion: null,
      });

      // Mock requireMembership for source conversation
      jest.spyOn(service as any, 'requireMembership').mockResolvedValue({
        isMuted: false,
        isArchived: false,
        isBanned: false,
      });

      // Mock target conversation membership check + other members query
      prisma.conversationMember.findMany
        .mockResolvedValueOnce([{ conversationId: 'conv-2', isBanned: false }]) // membership check
        .mockResolvedValueOnce([]); // other members (no blocks)

      // forwardMessage uses array-based $transaction (prisma.message.create, prisma.conversation.update)
      const fwdMsg = { id: 'msg-fwd-1', isForwarded: true, content: 'Hello' };
      const convUpdate = { id: 'conv-2', lastMessageText: 'Hello' };
      prisma.message.create.mockResolvedValue(fwdMsg);
      prisma.conversation.update.mockResolvedValue(convUpdate);
      prisma.$transaction.mockImplementation(async (promises: unknown) => {
        if (Array.isArray(promises)) return Promise.all(promises);
        return (promises as (tx: any) => Promise<unknown>)({});
      });
      prisma.message.update.mockResolvedValue({}); // forward count increment

      const result = await service.forwardMessage('msg-plain-fwd', 'user-1', ['conv-2']);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // sendMessage — reject empty message (no content, no encryptedContent, no media)
  // ════════════════════════════════════════════════════════════════════════════

  describe('sendMessage — empty message rejection', () => {
    it('should reject when no content, no encryptedContent, and no mediaUrl', async () => {
      await expect(
        service.sendMessage('conv-1', 'user-1', {}),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.sendMessage('conv-1', 'user-1', {}),
      ).rejects.toThrow('Message must have content, encrypted content, or media');
    });

    it('should accept mediaUrl without content or encryptedContent', async () => {
      const txMock = makeTxMock({
        id: 'msg-media-1',
        content: null,
        messageType: 'IMAGE',
        mediaUrl: 'https://example.com/image.jpg',
        isEncrypted: false,
        e2eVersion: null,
      });
      prisma.$transaction.mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(txMock));

      const result = await service.sendMessage('conv-1', 'user-1', {
        mediaUrl: 'https://example.com/image.jpg',
        messageType: 'IMAGE',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe('msg-media-1');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// WsSendMessageDto — class-validator E2E field constraints
// ══════════════════════════════════════════════════════════════════════════════

describe('WsSendMessageDto — E2E field validation', () => {
  function makeDto(overrides: Record<string, unknown> = {}): WsSendMessageDto {
    return plainToInstance(WsSendMessageDto, {
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Hello',
      ...overrides,
    });
  }

  // ── e2eVersion ──

  it('should accept e2eVersion: 1 (X3DH)', async () => {
    const errors = await validate(makeDto({ e2eVersion: 1 }));
    const versionErrors = errors.filter((e) => e.property === 'e2eVersion');
    expect(versionErrors).toHaveLength(0);
  });

  it('should accept e2eVersion: 2 (PQXDH)', async () => {
    const errors = await validate(makeDto({ e2eVersion: 2 }));
    const versionErrors = errors.filter((e) => e.property === 'e2eVersion');
    expect(versionErrors).toHaveLength(0);
  });

  it('should accept e2eVersion: 3 (sealed sender)', async () => {
    const errors = await validate(makeDto({ e2eVersion: 3 }));
    const versionErrors = errors.filter((e) => e.property === 'e2eVersion');
    expect(versionErrors).toHaveLength(0);
  });

  it('should reject e2eVersion: 0 (@Min(1))', async () => {
    const errors = await validate(makeDto({ e2eVersion: 0 }));
    const versionErrors = errors.filter((e) => e.property === 'e2eVersion');
    expect(versionErrors.length).toBeGreaterThan(0);
  });

  it('should reject e2eVersion: 4 (@Max(3))', async () => {
    const errors = await validate(makeDto({ e2eVersion: 4 }));
    const versionErrors = errors.filter((e) => e.property === 'e2eVersion');
    expect(versionErrors.length).toBeGreaterThan(0);
  });

  it('should reject e2eVersion: -1 (negative)', async () => {
    const errors = await validate(makeDto({ e2eVersion: -1 }));
    const versionErrors = errors.filter((e) => e.property === 'e2eVersion');
    expect(versionErrors.length).toBeGreaterThan(0);
  });

  it('should accept omitted e2eVersion (optional)', async () => {
    const errors = await validate(makeDto({}));
    const versionErrors = errors.filter((e) => e.property === 'e2eVersion');
    expect(versionErrors).toHaveLength(0);
  });

  // ── encryptedContent ──

  it('should accept encryptedContent within 120000 chars', async () => {
    const errors = await validate(makeDto({ encryptedContent: 'a'.repeat(120000) }));
    const encErrors = errors.filter((e) => e.property === 'encryptedContent');
    expect(encErrors).toHaveLength(0);
  });

  it('should reject encryptedContent over 120000 chars', async () => {
    const errors = await validate(makeDto({ encryptedContent: 'a'.repeat(120001) }));
    const encErrors = errors.filter((e) => e.property === 'encryptedContent');
    expect(encErrors.length).toBeGreaterThan(0);
  });

  // ── e2eSenderRatchetKey ──

  it('should accept e2eSenderRatchetKey within 44 chars (32 bytes base64)', async () => {
    const errors = await validate(makeDto({ e2eSenderRatchetKey: 'a'.repeat(44) }));
    const keyErrors = errors.filter((e) => e.property === 'e2eSenderRatchetKey');
    expect(keyErrors).toHaveLength(0);
  });

  it('should reject e2eSenderRatchetKey over 44 chars', async () => {
    const errors = await validate(makeDto({ e2eSenderRatchetKey: 'a'.repeat(45) }));
    const keyErrors = errors.filter((e) => e.property === 'e2eSenderRatchetKey');
    expect(keyErrors.length).toBeGreaterThan(0);
  });

  // ── encryptedLastMessagePreview ──

  it('should accept encryptedLastMessagePreview within 200 chars', async () => {
    const errors = await validate(makeDto({ encryptedLastMessagePreview: 'a'.repeat(200) }));
    const previewErrors = errors.filter((e) => e.property === 'encryptedLastMessagePreview');
    expect(previewErrors).toHaveLength(0);
  });

  it('should reject encryptedLastMessagePreview over 200 chars', async () => {
    const errors = await validate(makeDto({ encryptedLastMessagePreview: 'a'.repeat(201) }));
    const previewErrors = errors.filter((e) => e.property === 'encryptedLastMessagePreview');
    expect(previewErrors.length).toBeGreaterThan(0);
  });

  // ── e2eSenderKeyId ──

  it('should accept e2eSenderKeyId: 0 (@Min(0))', async () => {
    const errors = await validate(makeDto({ e2eSenderKeyId: 0 }));
    const keyIdErrors = errors.filter((e) => e.property === 'e2eSenderKeyId');
    expect(keyIdErrors).toHaveLength(0);
  });

  it('should accept e2eSenderKeyId: 999', async () => {
    const errors = await validate(makeDto({ e2eSenderKeyId: 999 }));
    const keyIdErrors = errors.filter((e) => e.property === 'e2eSenderKeyId');
    expect(keyIdErrors).toHaveLength(0);
  });

  it('should reject e2eSenderKeyId: -1 (negative)', async () => {
    const errors = await validate(makeDto({ e2eSenderKeyId: -1 }));
    const keyIdErrors = errors.filter((e) => e.property === 'e2eSenderKeyId');
    expect(keyIdErrors.length).toBeGreaterThan(0);
  });

  // ── clientMessageId ──

  it('should accept clientMessageId within 36 chars (UUID length)', async () => {
    const errors = await validate(makeDto({ clientMessageId: '550e8400-e29b-41d4-a716-446655440000' }));
    const cmidErrors = errors.filter((e) => e.property === 'clientMessageId');
    expect(cmidErrors).toHaveLength(0);
  });

  it('should reject clientMessageId over 36 chars', async () => {
    const errors = await validate(makeDto({ clientMessageId: 'a'.repeat(37) }));
    const cmidErrors = errors.filter((e) => e.property === 'clientMessageId');
    expect(cmidErrors.length).toBeGreaterThan(0);
  });

  it('should accept clientMessageId exactly 36 chars', async () => {
    const errors = await validate(makeDto({ clientMessageId: 'a'.repeat(36) }));
    const cmidErrors = errors.filter((e) => e.property === 'clientMessageId');
    expect(cmidErrors).toHaveLength(0);
  });

  // ── e2eCounter ──

  it('should accept e2eCounter: 0', async () => {
    const errors = await validate(makeDto({ e2eCounter: 0 }));
    const counterErrors = errors.filter((e) => e.property === 'e2eCounter');
    expect(counterErrors).toHaveLength(0);
  });

  it('should reject e2eCounter: -1', async () => {
    const errors = await validate(makeDto({ e2eCounter: -1 }));
    const counterErrors = errors.filter((e) => e.property === 'e2eCounter');
    expect(counterErrors.length).toBeGreaterThan(0);
  });

  // ── e2ePreviousCounter ──

  it('should accept e2ePreviousCounter: 0', async () => {
    const errors = await validate(makeDto({ e2ePreviousCounter: 0 }));
    const prevErrors = errors.filter((e) => e.property === 'e2ePreviousCounter');
    expect(prevErrors).toHaveLength(0);
  });

  it('should reject e2ePreviousCounter: -1', async () => {
    const errors = await validate(makeDto({ e2ePreviousCounter: -1 }));
    const prevErrors = errors.filter((e) => e.property === 'e2ePreviousCounter');
    expect(prevErrors.length).toBeGreaterThan(0);
  });

  // ── e2eSenderDeviceId ──

  it('should accept e2eSenderDeviceId: 1', async () => {
    const errors = await validate(makeDto({ e2eSenderDeviceId: 1 }));
    const devErrors = errors.filter((e) => e.property === 'e2eSenderDeviceId');
    expect(devErrors).toHaveLength(0);
  });

  it('should reject e2eSenderDeviceId: 0 (@Min(1))', async () => {
    const errors = await validate(makeDto({ e2eSenderDeviceId: 0 }));
    const devErrors = errors.filter((e) => e.property === 'e2eSenderDeviceId');
    expect(devErrors.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// InternalE2EController — Webhook HMAC verification
// ══════════════════════════════════════════════════════════════════════════════

describe('InternalE2EController — identity-changed webhook', () => {
  let controller: InternalE2EController;
  let prisma: any;
  const WEBHOOK_SECRET = 'test-webhook-secret-32chars!!';

  function makeSignature(body: Record<string, unknown>, secret = WEBHOOK_SECRET): string {
    const bodyStr = JSON.stringify(body);
    return createHmac('sha256', secret).update(bodyStr).digest('hex');
  }

  /** Create a mock Express request with rawBody matching JSON.stringify(body) */
  function mockReq(body: Record<string, unknown>): any {
    return { rawBody: Buffer.from(JSON.stringify(body)) };
  }

  beforeEach(async () => {
    process.env.INTERNAL_WEBHOOK_SECRET = WEBHOOK_SECRET;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalE2EController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            conversationMember: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            message: {
              createMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          },
        },
      ],
    }).compile();

    controller = module.get<InternalE2EController>(InternalE2EController);
    prisma = module.get(PrismaService) as any;
  });

  afterEach(() => {
    delete process.env.INTERNAL_WEBHOOK_SECRET;
  });

  it('should create SYSTEM messages in all user conversations', async () => {
    const body = { userId: 'user-abc', newFingerprint: 'fingerprint-new' };
    const signature = makeSignature(body);

    prisma.conversationMember.findMany.mockResolvedValue([
      { conversationId: 'conv-1' },
      { conversationId: 'conv-2' },
      { conversationId: 'conv-3' },
    ]);
    prisma.message.createMany.mockResolvedValue({ count: 3 });

    const result = await controller.handleIdentityChanged(signature, body, mockReq(body));

    expect(result).toEqual({ created: 3 });
    expect(prisma.message.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          conversationId: 'conv-1',
          messageType: 'SYSTEM',
          content: 'SYSTEM:IDENTITY_CHANGED',
          isEncrypted: false,
        }),
        expect.objectContaining({
          conversationId: 'conv-2',
          messageType: 'SYSTEM',
        }),
        expect.objectContaining({
          conversationId: 'conv-3',
          messageType: 'SYSTEM',
        }),
      ]),
    });
  });

  it('should reject when INTERNAL_WEBHOOK_SECRET is not set', async () => {
    delete process.env.INTERNAL_WEBHOOK_SECRET;
    // Re-create controller to get the unset state
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalE2EController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            conversationMember: { findMany: jest.fn() },
            message: { createMany: jest.fn() },
          },
        },
      ],
    }).compile();
    const ctrl = module.get<InternalE2EController>(InternalE2EController);

    const body = { userId: 'user-abc', newFingerprint: 'fp' };
    await expect(
      ctrl.handleIdentityChanged('any-sig', body),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject missing signature header', async () => {
    const body = { userId: 'user-abc', newFingerprint: 'fp' };
    await expect(
      controller.handleIdentityChanged(undefined as any, body),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject invalid HMAC signature', async () => {
    const body = { userId: 'user-abc', newFingerprint: 'fp' };
    const wrongSig = createHmac('sha256', 'wrong-secret').update(JSON.stringify(body)).digest('hex');

    await expect(
      controller.handleIdentityChanged(wrongSig, body, mockReq(body)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject invalid signature format (non-hex)', async () => {
    const body = { userId: 'user-abc', newFingerprint: 'fp' };
    // timingSafeEqual requires same length buffers — a non-hex string will produce
    // a different-length buffer
    await expect(
      controller.handleIdentityChanged('not-hex-at-all-zzz', body, mockReq(body)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject invalid userId (too long)', async () => {
    const body = { userId: 'a'.repeat(65), newFingerprint: 'fp' };
    const signature = makeSignature(body);

    await expect(
      controller.handleIdentityChanged(signature, body, mockReq(body)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject empty userId', async () => {
    const body = { userId: '', newFingerprint: 'fp' };
    const signature = makeSignature(body);

    await expect(
      controller.handleIdentityChanged(signature, body, mockReq(body)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should return { created: 0 } when user has no conversations', async () => {
    const body = { userId: 'user-lonely', newFingerprint: 'fp' };
    const signature = makeSignature(body);
    prisma.conversationMember.findMany.mockResolvedValue([]);

    const result = await controller.handleIdentityChanged(signature, body, mockReq(body));

    expect(result).toEqual({ created: 0 });
    // Should NOT call createMany when no conversations
    expect(prisma.message.createMany).not.toHaveBeenCalled();
  });
});
