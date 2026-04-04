import { Test, TestingModule } from '@nestjs/testing';
import { DiscordFeaturesController } from './discord-features.controller';
import { DiscordFeaturesService } from './discord-features.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('DiscordFeaturesController', () => {
  let controller: DiscordFeaturesController;
  let service: jest.Mocked<DiscordFeaturesService>;

  const userId = 'user-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DiscordFeaturesController],
      providers: [
        ...globalMockProviders,
        {
          provide: DiscordFeaturesService,
          useValue: {
            createForumThread: jest.fn(),
            getForumThreads: jest.fn(),
            getForumThread: jest.fn(),
            replyToForumThread: jest.fn(),
            getForumReplies: jest.fn(),
            lockForumThread: jest.fn(),
            pinForumThread: jest.fn(),
            createWebhook: jest.fn(),
            getWebhooks: jest.fn(),
            deleteWebhook: jest.fn(),
            executeWebhook: jest.fn(),
            createStageSession: jest.fn(),
            startStageSession: jest.fn(),
            endStageSession: jest.fn(),
            inviteSpeaker: jest.fn(),
            getActiveStageSessions: jest.fn(),
            deleteForumThread: jest.fn(),
            deleteForumReply: jest.fn(),
            removeSpeaker: jest.fn(),
            joinStageAsListener: jest.fn(),
            leaveStageAsListener: jest.fn(),
          },
        },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(DiscordFeaturesController);
    service = module.get(DiscordFeaturesService) as jest.Mocked<DiscordFeaturesService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('createForumThread', () => {
    it('should call service.createForumThread with userId, circleId, dto', async () => {
      const dto = { title: 'Discussion', content: 'Hello' };
      service.createForumThread.mockResolvedValue({ id: 'ft-1' } as any);

      const result = await controller.createForumThread(userId, 'circle-1', dto as any);

      expect(service.createForumThread).toHaveBeenCalledWith(userId, 'circle-1', dto);
      expect(result).toEqual(expect.objectContaining({ id: 'ft-1' }));
    });
  });

  describe('getForumThreads', () => {
    it('should call service.getForumThreads with circleId and cursor', async () => {
      service.getForumThreads.mockResolvedValue({ data: [] } as any);

      await controller.getForumThreads('circle-1', 'cursor-1');

      expect(service.getForumThreads).toHaveBeenCalledWith('circle-1', 'cursor-1');
    });
  });

  describe('replyToForumThread', () => {
    it('should call service.replyToForumThread with userId, threadId, content', async () => {
      service.replyToForumThread.mockResolvedValue({ id: 'reply-1' } as any);

      await controller.replyToForumThread(userId, 'ft-1', { content: 'My reply' } as any);

      expect(service.replyToForumThread).toHaveBeenCalledWith(userId, 'ft-1', 'My reply');
    });
  });

  describe('createWebhook', () => {
    it('should call service.createWebhook with userId, circleId, dto', async () => {
      const dto = { name: 'GitHub Bot', url: 'https://webhook.url' };
      service.createWebhook.mockResolvedValue({ id: 'wh-1', token: 'abc' } as any);

      await controller.createWebhook(userId, 'circle-1', dto as any);

      expect(service.createWebhook).toHaveBeenCalledWith(userId, 'circle-1', dto);
    });
  });

  describe('deleteWebhook', () => {
    it('should call service.deleteWebhook with id and userId', async () => {
      service.deleteWebhook.mockResolvedValue({ deleted: true } as any);

      await controller.deleteWebhook(userId, 'wh-1');

      expect(service.deleteWebhook).toHaveBeenCalledWith('wh-1', userId);
    });
  });

  describe('executeWebhook', () => {
    it('should call service.executeWebhook with token and dto', async () => {
      const dto = { content: 'New commit pushed' };
      service.executeWebhook.mockResolvedValue({ sent: true } as any);

      await controller.executeWebhook('token-abc', dto as any);

      expect(service.executeWebhook).toHaveBeenCalledWith('token-abc', dto);
    });
  });

  describe('createStageSession', () => {
    it('should call service.createStageSession with userId, circleId, dto', async () => {
      const dto = { title: 'Friday Talk', topic: 'Islamic Finance' };
      service.createStageSession.mockResolvedValue({ id: 'stage-1' } as any);

      await controller.createStageSession(userId, 'circle-1', dto as any);

      expect(service.createStageSession).toHaveBeenCalledWith(userId, 'circle-1', dto);
    });
  });

  describe('inviteSpeaker', () => {
    it('should call service.inviteSpeaker with id, userId, speakerId', async () => {
      service.inviteSpeaker.mockResolvedValue({ invited: true } as any);

      await controller.inviteSpeaker(userId, 'stage-1', { speakerId: 'user-2' } as any);

      expect(service.inviteSpeaker).toHaveBeenCalledWith('stage-1', userId, 'user-2');
    });
  });

  describe('getActiveStageSessions', () => {
    it('should call service.getActiveStageSessions with circleId', async () => {
      service.getActiveStageSessions.mockResolvedValue([{ id: 'stage-1' }] as any);
      const result = await controller.getActiveStageSessions('circle-1');
      expect(service.getActiveStageSessions).toHaveBeenCalledWith('circle-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getForumThread', () => {
    it('delegates to service.getForumThread', async () => {
      service.getForumThread.mockResolvedValue({ id: 'ft-1' } as any);
      await controller.getForumThread('ft-1');
      expect(service.getForumThread).toHaveBeenCalledWith('ft-1');
    });
  });

  describe('getForumReplies', () => {
    it('delegates to service.getForumReplies', async () => {
      service.getForumReplies.mockResolvedValue({ data: [] } as any);
      await controller.getForumReplies('ft-1', 'cursor-1');
      expect(service.getForumReplies).toHaveBeenCalledWith('ft-1', 'cursor-1');
    });
  });

  describe('lockForumThread', () => {
    it('delegates to service.lockForumThread', async () => {
      service.lockForumThread.mockResolvedValue({ locked: true } as any);
      await controller.lockForumThread(userId, 'ft-1');
      expect(service.lockForumThread).toHaveBeenCalledWith('ft-1', userId);
    });
  });

  describe('pinForumThread', () => {
    it('delegates to service.pinForumThread', async () => {
      service.pinForumThread.mockResolvedValue({ pinned: true } as any);
      await controller.pinForumThread(userId, 'ft-1');
      expect(service.pinForumThread).toHaveBeenCalledWith('ft-1', userId);
    });
  });

  describe('deleteForumThread', () => {
    it('delegates to service.deleteForumThread', async () => {
      service.deleteForumThread.mockResolvedValue({ deleted: true } as any);
      await controller.deleteForumThread(userId, 'ft-1');
      expect(service.deleteForumThread).toHaveBeenCalledWith('ft-1', userId);
    });
  });

  describe('deleteForumReply', () => {
    it('delegates to service.deleteForumReply', async () => {
      service.deleteForumReply.mockResolvedValue({ deleted: true } as any);
      await controller.deleteForumReply(userId, 'reply-1');
      expect(service.deleteForumReply).toHaveBeenCalledWith('reply-1', userId);
    });
  });

  describe('getWebhooks', () => {
    it('delegates to service.getWebhooks', async () => {
      service.getWebhooks.mockResolvedValue([{ id: 'wh-1' }] as any);
      await controller.getWebhooks(userId, 'circle-1');
      expect(service.getWebhooks).toHaveBeenCalledWith('circle-1', userId);
    });
  });

  describe('startStage', () => {
    it('delegates to service.startStageSession', async () => {
      service.startStageSession.mockResolvedValue({ started: true } as any);
      await controller.startStage(userId, 'stage-1');
      expect(service.startStageSession).toHaveBeenCalledWith('stage-1', userId);
    });
  });

  describe('endStage', () => {
    it('delegates to service.endStageSession', async () => {
      service.endStageSession.mockResolvedValue({ ended: true } as any);
      await controller.endStage(userId, 'stage-1');
      expect(service.endStageSession).toHaveBeenCalledWith('stage-1', userId);
    });
  });

  describe('removeSpeaker', () => {
    it('delegates to service.removeSpeaker', async () => {
      service.removeSpeaker.mockResolvedValue({ removed: true } as any);
      await controller.removeSpeaker(userId, 'stage-1', { speakerId: 'user-2' } as any);
      expect(service.removeSpeaker).toHaveBeenCalledWith('stage-1', userId, 'user-2');
    });
  });

  describe('joinStage', () => {
    it('delegates to service.joinStageAsListener', async () => {
      service.joinStageAsListener.mockResolvedValue({ joined: true } as any);
      await controller.joinStage(userId, 'stage-1');
      expect(service.joinStageAsListener).toHaveBeenCalledWith('stage-1', userId);
    });
  });

  describe('leaveStage', () => {
    it('delegates to service.leaveStageAsListener', async () => {
      service.leaveStageAsListener.mockResolvedValue({ left: true } as any);
      await controller.leaveStage(userId, 'stage-1');
      expect(service.leaveStageAsListener).toHaveBeenCalledWith('stage-1', userId);
    });
  });
});
