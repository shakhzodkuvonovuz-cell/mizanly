import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../config/prisma.service';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('MessagesController', () => {
  let controller: MessagesController;
  let service: MessagesService;

  const mockService = {
    getConversations: jest.fn(),
    getConversation: jest.fn(),
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
    deleteMessage: jest.fn(),
    editMessage: jest.fn(),
    reactToMessage: jest.fn(),
    removeReaction: jest.fn(),
    markRead: jest.fn(),
    muteConversation: jest.fn(),
    archiveConversation: jest.fn(),
    createDM: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    addGroupMembers: jest.fn(),
    removeGroupMember: jest.fn(),
    leaveGroup: jest.fn(),
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn((key: string) => key === 'CLERK_SECRET_KEY' ? 'test-secret' : null),
    };
    const mockPrismaService = {};

    const module = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        ...globalMockProviders,
        { provide: MessagesService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
        { provide: OptionalClerkAuthGuard, useValue: { canActivate: jest.fn(() => true) } },
      ],
    }).compile();

    controller = module.get(MessagesController);
    service = module.get(MessagesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getConversations', () => {
    it('should call service.getConversations with userId', async () => {
      mockService.getConversations.mockResolvedValue([]);
      await controller.getConversations('user-1');
      expect(mockService.getConversations).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getConversation', () => {
    it('should call service.getConversation with id and userId', async () => {
      mockService.getConversation.mockResolvedValue({ id: 'conv-1' });
      await controller.getConversation('conv-1', 'user-1');
      expect(mockService.getConversation).toHaveBeenCalledWith('conv-1', 'user-1');
    });
  });

  describe('getMessages', () => {
    it('should call service.getMessages with conversationId, userId, cursor', async () => {
      mockService.getMessages.mockResolvedValue({ data: [], meta: {} });
      await controller.getMessages('conv-1', 'user-1', 'cursor-123');
      expect(mockService.getMessages).toHaveBeenCalledWith('conv-1', 'user-1', 'cursor-123');
    });

    it('should call service.getMessages with undefined cursor', async () => {
      mockService.getMessages.mockResolvedValue({ data: [], meta: {} });
      await controller.getMessages('conv-1', 'user-1', undefined);
      expect(mockService.getMessages).toHaveBeenCalledWith('conv-1', 'user-1', undefined);
    });
  });

  describe('sendMessage', () => {
    it('should call service.sendMessage with conversationId, userId, dto', async () => {
      const dto = { content: 'Hello' };
      mockService.sendMessage.mockResolvedValue({ id: 'msg-1' });
      await controller.sendMessage('conv-1', 'user-1', dto);
      expect(mockService.sendMessage).toHaveBeenCalledWith('conv-1', 'user-1', dto);
    });
  });

  describe('deleteMessage', () => {
    it('should call service.deleteMessage with messageId, userId', async () => {
      mockService.deleteMessage.mockResolvedValue({ deleted: true });
      await controller.deleteMessage('msg-1', 'user-1');
      expect(mockService.deleteMessage).toHaveBeenCalledWith('msg-1', 'user-1');
    });
  });

  describe('editMessage', () => {
    it('should call service.editMessage with messageId, userId, content', async () => {
      const dto = { content: 'Updated' };
      mockService.editMessage.mockResolvedValue({ message: { id: 'msg-1' } });
      await controller.editMessage('msg-1', 'user-1', dto);
      expect(mockService.editMessage).toHaveBeenCalledWith('msg-1', 'user-1', 'Updated');
    });
  });

  describe('reactToMessage', () => {
    it('should call service.reactToMessage with messageId, userId, emoji', async () => {
      const dto = { emoji: '❤️' };
      mockService.reactToMessage.mockResolvedValue({ reacted: true });
      await controller.reactToMessage('msg-1', 'user-1', dto);
      expect(mockService.reactToMessage).toHaveBeenCalledWith('msg-1', 'user-1', '❤️');
    });
  });

  describe('removeReaction', () => {
    it('should call service.removeReaction with messageId, userId, emoji', async () => {
      const dto = { emoji: '❤️' };
      mockService.removeReaction.mockResolvedValue({ removed: true });
      await controller.removeReaction('msg-1', 'user-1', dto);
      expect(mockService.removeReaction).toHaveBeenCalledWith('msg-1', 'user-1', '❤️');
    });
  });

  describe('markRead', () => {
    it('should call service.markRead with conversationId, userId', async () => {
      mockService.markRead.mockResolvedValue({ read: true });
      await controller.markRead('conv-1', 'user-1');
      expect(mockService.markRead).toHaveBeenCalledWith('conv-1', 'user-1');
    });
  });

  describe('mute', () => {
    it('should call service.muteConversation with conversationId, userId, muted', async () => {
      mockService.muteConversation.mockResolvedValue({ muted: true });
      await controller.mute('conv-1', 'user-1', true);
      expect(mockService.muteConversation).toHaveBeenCalledWith('conv-1', 'user-1', true);
    });
  });

  describe('archive', () => {
    it('should call service.archiveConversation with conversationId, userId, archived', async () => {
      mockService.archiveConversation.mockResolvedValue({ archived: true });
      await controller.archive('conv-1', 'user-1', true);
      expect(mockService.archiveConversation).toHaveBeenCalledWith('conv-1', 'user-1', true);
    });
  });

  describe('createDM', () => {
    it('should call service.createDM with userId, targetUserId', async () => {
      mockService.createDM.mockResolvedValue({ id: 'conv-1' });
      await controller.createDM('user-1', { targetUserId: 'user-2' } as any);
      expect(mockService.createDM).toHaveBeenCalledWith('user-1', 'user-2');
    });
  });

  describe('createGroup', () => {
    it('should call service.createGroup with userId, groupName, memberIds', async () => {
      const dto = { groupName: 'Group', memberIds: ['user-2', 'user-3'] };
      mockService.createGroup.mockResolvedValue({ id: 'group-1' });
      await controller.createGroup('user-1', dto);
      expect(mockService.createGroup).toHaveBeenCalledWith('user-1', 'Group', ['user-2', 'user-3']);
    });
  });

  describe('updateGroup', () => {
    it('should call service.updateGroup with id, userId, dto', async () => {
      const dto = { groupName: 'Updated' };
      mockService.updateGroup.mockResolvedValue({ id: 'group-1' });
      await controller.updateGroup('group-1', 'user-1', dto);
      expect(mockService.updateGroup).toHaveBeenCalledWith('group-1', 'user-1', dto);
    });
  });

  describe('addMembers', () => {
    it('should call service.addGroupMembers with id, userId, memberIds', async () => {
      const dto = { memberIds: ['user-2'] };
      mockService.addGroupMembers.mockResolvedValue({ added: true });
      await controller.addMembers('group-1', 'user-1', dto);
      expect(mockService.addGroupMembers).toHaveBeenCalledWith('group-1', 'user-1', ['user-2']);
    });
  });

  describe('removeMember', () => {
    it('should call service.removeGroupMember with id, userId, targetUserId', async () => {
      mockService.removeGroupMember.mockResolvedValue({ removed: true });
      await controller.removeMember('group-1', 'user-1', 'user-2');
      expect(mockService.removeGroupMember).toHaveBeenCalledWith('group-1', 'user-1', 'user-2');
    });
  });

  describe('leaveGroup', () => {
    it('should call service.leaveGroup with id, userId', async () => {
      mockService.leaveGroup.mockResolvedValue({ left: true });
      await controller.leaveGroup('group-1', 'user-1');
      expect(mockService.leaveGroup).toHaveBeenCalledWith('group-1', 'user-1');
    });
  });
});