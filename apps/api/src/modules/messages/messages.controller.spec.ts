import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ChatGateway } from '../../gateways/chat.gateway';
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
    getTotalUnreadCount: jest.fn(),
    getArchivedConversations: jest.fn(),
    setLockCode: jest.fn(),
    verifyLockCode: jest.fn(),
    setNewMemberHistoryCount: jest.fn(),
    setMemberTag: jest.fn(),
    searchAllMessages: jest.fn(),
    searchMessages: jest.fn(),
    forwardMessage: jest.fn(),
    markDelivered: jest.fn(),
    getMediaGallery: jest.fn(),
    setDisappearingTimer: jest.fn(),
    archiveConversationForUser: jest.fn(),
    unarchiveConversationForUser: jest.fn(),
    scheduleMessage: jest.fn(),
    getStarredMessages: jest.fn(),
    starMessage: jest.fn(),
    unstarMessage: jest.fn(),
    pinMessage: jest.fn(),
    unpinMessage: jest.fn(),
    getPinnedMessages: jest.fn(),
    sendViewOnceMessage: jest.fn(),
    markViewOnceViewed: jest.fn(),
    promoteToAdmin: jest.fn(),
    demoteFromAdmin: jest.fn(),
    banMember: jest.fn(),
    pinConversation: jest.fn(),
    setConversationWallpaper: jest.fn(),
    setCustomTone: jest.fn(),
    createDMNote: jest.fn(),
    getDMNote: jest.fn(),
    deleteDMNote: jest.fn(),
    getDMNotesForContacts: jest.fn(),
    changeGroupRole: jest.fn(),
    generateGroupInviteLink: jest.fn(),
    joinViaInviteLink: jest.fn(),
    createGroupTopic: jest.fn(),
    getGroupTopics: jest.fn(),
    setMessageExpiry: jest.fn(),
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
        { provide: ChatGateway, useValue: { server: { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } } },
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

  describe('getConversations', () => {
    it('should call service.getConversations with userId', async () => {
      mockService.getConversations.mockResolvedValue([]);
      await controller.getConversations('user-1');
      expect(mockService.getConversations).toHaveBeenCalledWith('user-1', undefined);
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
      mockService.reactToMessage.mockResolvedValue({ reacted: true });
      await controller.reactToMessage('msg-1', 'user-1', { emoji: 'heart' } as any);
      expect(mockService.reactToMessage).toHaveBeenCalledWith('msg-1', 'user-1', 'heart');
    });
  });

  describe('removeReaction', () => {
    it('should call service.removeReaction with messageId, userId, emoji', async () => {
      mockService.removeReaction.mockResolvedValue({ removed: true });
      await controller.removeReaction('msg-1', 'user-1', { emoji: 'heart' } as any);
      expect(mockService.removeReaction).toHaveBeenCalledWith('msg-1', 'user-1', 'heart');
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
      await controller.mute('conv-1', 'user-1', { muted: true } as any);
      expect(mockService.muteConversation).toHaveBeenCalledWith('conv-1', 'user-1', true);
    });
  });

  describe('archive', () => {
    it('should call service.archiveConversation with conversationId, userId, archived', async () => {
      mockService.archiveConversation.mockResolvedValue({ archived: true });
      await controller.archive('conv-1', 'user-1', { archived: true } as any);
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

  describe('getUnreadCount', () => {
    it('should call service.getTotalUnreadCount with userId', async () => {
      mockService.getTotalUnreadCount.mockResolvedValue({ count: 5 });
      const result = await controller.getUnreadCount('user-1');
      expect(mockService.getTotalUnreadCount).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ count: 5 });
    });
  });

  describe('getArchivedConversations', () => {
    it('should call service.getArchivedConversations with userId and cursor', async () => {
      mockService.getArchivedConversations.mockResolvedValue({ data: [], meta: {} });
      await controller.getArchivedConversations('user-1', 'cursor-1');
      expect(mockService.getArchivedConversations).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('setLockCode', () => {
    it('should call service.setLockCode with id, userId, and code', async () => {
      mockService.setLockCode.mockResolvedValue({ locked: true });
      await controller.setLockCode('conv-1', 'user-1', { code: '1234' } as any);
      expect(mockService.setLockCode).toHaveBeenCalledWith('conv-1', 'user-1', '1234');
    });

    it('should pass null when code is undefined (remove lock)', async () => {
      mockService.setLockCode.mockResolvedValue({ locked: false });
      await controller.setLockCode('conv-1', 'user-1', {} as any);
      expect(mockService.setLockCode).toHaveBeenCalledWith('conv-1', 'user-1', null);
    });
  });

  describe('verifyLockCode', () => {
    it('should call service.verifyLockCode with id, userId, and code', async () => {
      mockService.verifyLockCode.mockResolvedValue({ verified: true });
      await controller.verifyLockCode('conv-1', 'user-1', { code: '1234' } as any);
      expect(mockService.verifyLockCode).toHaveBeenCalledWith('conv-1', 'user-1', '1234');
    });
  });

  describe('setHistoryCount', () => {
    it('should call service.setNewMemberHistoryCount with id, userId, and count', async () => {
      mockService.setNewMemberHistoryCount.mockResolvedValue({ count: 50 });
      await controller.setHistoryCount('group-1', 'user-1', { count: 50 } as any);
      expect(mockService.setNewMemberHistoryCount).toHaveBeenCalledWith('group-1', 'user-1', 50);
    });
  });

  describe('setMemberTag', () => {
    it('should call service.setMemberTag with id, userId, and tag', async () => {
      mockService.setMemberTag.mockResolvedValue({ tag: 'Admin' });
      await controller.setMemberTag('group-1', 'user-1', { tag: 'Admin' } as any);
      expect(mockService.setMemberTag).toHaveBeenCalledWith('group-1', 'user-1', 'Admin');
    });

    it('should pass null when tag is undefined (remove tag)', async () => {
      mockService.setMemberTag.mockResolvedValue({ tag: null });
      await controller.setMemberTag('group-1', 'user-1', {} as any);
      expect(mockService.setMemberTag).toHaveBeenCalledWith('group-1', 'user-1', null);
    });
  });

  describe('searchAllMessages', () => {
    it('should call service.searchAllMessages with userId and query', async () => {
      mockService.searchAllMessages.mockResolvedValue({ data: [{ id: 'msg-1' }] });
      const result = await controller.searchAllMessages('user-1', 'hello');
      expect(mockService.searchAllMessages).toHaveBeenCalledWith('user-1', 'hello');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('searchMessages', () => {
    it('should call service.searchMessages with conversationId, userId, query, and cursor', async () => {
      mockService.searchMessages.mockResolvedValue({ data: [] });
      await controller.searchMessages('conv-1', 'user-1', 'test', 'cursor-1');
      expect(mockService.searchMessages).toHaveBeenCalledWith('conv-1', 'user-1', 'test', 'cursor-1');
    });
  });

  describe('forward', () => {
    it('should call service.forwardMessage with messageId, userId, and conversationIds', async () => {
      mockService.forwardMessage.mockResolvedValue({ forwarded: 2 });
      await controller.forward('msg-1', 'user-1', { conversationIds: ['conv-2', 'conv-3'] } as any);
      expect(mockService.forwardMessage).toHaveBeenCalledWith('msg-1', 'user-1', ['conv-2', 'conv-3']);
    });
  });

  describe('delivered', () => {
    it('should call service.markDelivered with messageId and userId', async () => {
      mockService.markDelivered.mockResolvedValue({ delivered: true });
      await controller.delivered('msg-1', 'user-1');
      expect(mockService.markDelivered).toHaveBeenCalledWith('msg-1', 'user-1');
    });
  });

  describe('media', () => {
    it('should call service.getMediaGallery with conversationId, userId, and cursor', async () => {
      mockService.getMediaGallery.mockResolvedValue({ data: [], meta: {} });
      await controller.media('conv-1', 'user-1', 'cursor-1');
      expect(mockService.getMediaGallery).toHaveBeenCalledWith('conv-1', 'user-1', 'cursor-1');
    });
  });

  describe('setDisappearingTimer', () => {
    it('should call service.setDisappearingTimer with id, userId, and duration', async () => {
      mockService.setDisappearingTimer.mockResolvedValue({ duration: 86400 });
      await controller.setDisappearingTimer('conv-1', 'user-1', { duration: 86400 } as any);
      expect(mockService.setDisappearingTimer).toHaveBeenCalledWith('conv-1', 'user-1', 86400);
    });

    it('should pass null when duration is undefined (disable)', async () => {
      mockService.setDisappearingTimer.mockResolvedValue({ duration: null });
      await controller.setDisappearingTimer('conv-1', 'user-1', {} as any);
      expect(mockService.setDisappearingTimer).toHaveBeenCalledWith('conv-1', 'user-1', null);
    });
  });

  describe('archiveConversation (PUT)', () => {
    it('should call service.archiveConversationForUser with id and userId', async () => {
      mockService.archiveConversationForUser.mockResolvedValue({ archived: true });
      await controller.archiveConversation('conv-1', 'user-1');
      expect(mockService.archiveConversationForUser).toHaveBeenCalledWith('conv-1', 'user-1');
    });
  });

  describe('unarchiveConversation', () => {
    it('should call service.unarchiveConversationForUser with id and userId', async () => {
      mockService.unarchiveConversationForUser.mockResolvedValue({ archived: false });
      await controller.unarchiveConversation('conv-1', 'user-1');
      expect(mockService.unarchiveConversationForUser).toHaveBeenCalledWith('conv-1', 'user-1');
    });
  });

  describe('scheduleMessage', () => {
    it('should call service.scheduleMessage with parsed Date and params', async () => {
      mockService.scheduleMessage.mockResolvedValue({ id: 'sch-1' });
      const dto = { conversationId: 'conv-1', content: 'Hello later', scheduledAt: '2026-04-05T10:00:00Z', messageType: 'TEXT' };
      await controller.scheduleMessage('user-1', dto as any);
      expect(mockService.scheduleMessage).toHaveBeenCalledWith('conv-1', 'user-1', 'Hello later', expect.any(Date), 'TEXT');
    });
  });

  describe('getStarredMessages', () => {
    it('should call service.getStarredMessages with userId and cursor', async () => {
      mockService.getStarredMessages.mockResolvedValue({ data: [] });
      await controller.getStarredMessages('user-1', 'cursor-1');
      expect(mockService.getStarredMessages).toHaveBeenCalledWith('user-1', 'cursor-1');
    });
  });

  describe('starMessage', () => {
    it('should call service.starMessage with userId and messageId', async () => {
      mockService.starMessage.mockResolvedValue({ starred: true });
      await controller.starMessage('msg-1', 'user-1');
      expect(mockService.starMessage).toHaveBeenCalledWith('user-1', 'msg-1');
    });
  });

  describe('unstarMessage', () => {
    it('should call service.unstarMessage with userId and messageId', async () => {
      mockService.unstarMessage.mockResolvedValue({ unstarred: true });
      await controller.unstarMessage('msg-1', 'user-1');
      expect(mockService.unstarMessage).toHaveBeenCalledWith('user-1', 'msg-1');
    });
  });

  describe('pinMessage', () => {
    it('should call service.pinMessage with conversationId, messageId, and userId', async () => {
      mockService.pinMessage.mockResolvedValue({ pinned: true });
      await controller.pinMessage('conv-1', 'msg-1', 'user-1');
      expect(mockService.pinMessage).toHaveBeenCalledWith('conv-1', 'msg-1', 'user-1');
    });
  });

  describe('unpinMessage', () => {
    it('should call service.unpinMessage with conversationId, messageId, and userId', async () => {
      mockService.unpinMessage.mockResolvedValue({ unpinned: true });
      await controller.unpinMessage('conv-1', 'msg-1', 'user-1');
      expect(mockService.unpinMessage).toHaveBeenCalledWith('conv-1', 'msg-1', 'user-1');
    });
  });

  describe('getPinnedMessages', () => {
    it('should call service.getPinnedMessages with conversationId and userId', async () => {
      mockService.getPinnedMessages.mockResolvedValue([{ id: 'msg-1', pinned: true }]);
      const result = await controller.getPinnedMessages('conv-1', 'user-1');
      expect(mockService.getPinnedMessages).toHaveBeenCalledWith('conv-1', 'user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('sendViewOnceMessage', () => {
    it('should call service.sendViewOnceMessage with conversationId, userId, and dto', async () => {
      const dto = { mediaUrl: 'https://cdn.example.com/photo.jpg', messageType: 'IMAGE' };
      mockService.sendViewOnceMessage.mockResolvedValue({ id: 'vo-1' });
      await controller.sendViewOnceMessage('conv-1', 'user-1', dto as any);
      expect(mockService.sendViewOnceMessage).toHaveBeenCalledWith('conv-1', 'user-1', dto);
    });
  });

  describe('markViewOnceViewed', () => {
    it('should call service.markViewOnceViewed with messageId and userId', async () => {
      mockService.markViewOnceViewed.mockResolvedValue({ viewed: true });
      await controller.markViewOnceViewed('msg-1', 'user-1');
      expect(mockService.markViewOnceViewed).toHaveBeenCalledWith('msg-1', 'user-1');
    });
  });

  describe('promoteToAdmin', () => {
    it('should call service.promoteToAdmin with conversationId, userId, and targetUserId', async () => {
      mockService.promoteToAdmin.mockResolvedValue({ promoted: true });
      await controller.promoteToAdmin('conv-1', 'user-2', 'user-1');
      expect(mockService.promoteToAdmin).toHaveBeenCalledWith('conv-1', 'user-1', 'user-2');
    });
  });

  describe('demoteFromAdmin', () => {
    it('should call service.demoteFromAdmin with conversationId, userId, and targetUserId', async () => {
      mockService.demoteFromAdmin.mockResolvedValue({ demoted: true });
      await controller.demoteFromAdmin('conv-1', 'user-2', 'user-1');
      expect(mockService.demoteFromAdmin).toHaveBeenCalledWith('conv-1', 'user-1', 'user-2');
    });
  });

  describe('banMember', () => {
    it('should call service.banMember and emit room_evicted event', async () => {
      mockService.banMember.mockResolvedValue({ banned: true });
      await controller.banMember('conv-1', 'user-2', 'user-1');
      expect(mockService.banMember).toHaveBeenCalledWith('conv-1', 'user-1', 'user-2');
    });
  });

  describe('pinConversation', () => {
    it('should call service.pinConversation with conversationId, userId, and isPinned', async () => {
      mockService.pinConversation.mockResolvedValue({ pinned: true });
      await controller.pinConversation('conv-1', 'user-1', { isPinned: true } as any);
      expect(mockService.pinConversation).toHaveBeenCalledWith('conv-1', 'user-1', true);
    });
  });

  describe('setWallpaper', () => {
    it('should call service.setConversationWallpaper with url', async () => {
      mockService.setConversationWallpaper.mockResolvedValue({ wallpaper: 'https://cdn.example.com/bg.jpg' });
      await controller.setWallpaper('conv-1', 'user-1', { wallpaperUrl: 'https://cdn.example.com/bg.jpg' } as any);
      expect(mockService.setConversationWallpaper).toHaveBeenCalledWith('conv-1', 'user-1', 'https://cdn.example.com/bg.jpg');
    });

    it('should pass null when wallpaperUrl is undefined (remove wallpaper)', async () => {
      mockService.setConversationWallpaper.mockResolvedValue({ wallpaper: null });
      await controller.setWallpaper('conv-1', 'user-1', {} as any);
      expect(mockService.setConversationWallpaper).toHaveBeenCalledWith('conv-1', 'user-1', null);
    });
  });

  describe('setTone', () => {
    it('should call service.setCustomTone with tone', async () => {
      mockService.setCustomTone.mockResolvedValue({ tone: 'ding' });
      await controller.setTone('conv-1', 'user-1', { tone: 'ding' } as any);
      expect(mockService.setCustomTone).toHaveBeenCalledWith('conv-1', 'user-1', 'ding');
    });

    it('should pass null when tone is undefined', async () => {
      mockService.setCustomTone.mockResolvedValue({ tone: null });
      await controller.setTone('conv-1', 'user-1', {} as any);
      expect(mockService.setCustomTone).toHaveBeenCalledWith('conv-1', 'user-1', null);
    });
  });

  describe('createDMNote', () => {
    it('should call service.createDMNote with userId, content, and expiresInHours', async () => {
      mockService.createDMNote.mockResolvedValue({ id: 'note-1' });
      await controller.createDMNote('user-1', { content: 'My status', expiresInHours: 24 } as any);
      expect(mockService.createDMNote).toHaveBeenCalledWith('user-1', 'My status', 24);
    });
  });

  describe('getMyDMNote', () => {
    it('should call service.getDMNote with userId', async () => {
      mockService.getDMNote.mockResolvedValue({ content: 'My status' });
      await controller.getMyDMNote('user-1');
      expect(mockService.getDMNote).toHaveBeenCalledWith('user-1');
    });
  });

  describe('deleteDMNote', () => {
    it('should call service.deleteDMNote with userId', async () => {
      mockService.deleteDMNote.mockResolvedValue({ deleted: true });
      await controller.deleteDMNote('user-1');
      expect(mockService.deleteDMNote).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getContactDMNotes', () => {
    it('should call service.getDMNotesForContacts with userId', async () => {
      mockService.getDMNotesForContacts.mockResolvedValue([{ userId: 'u2', content: 'Busy' }]);
      const result = await controller.getContactDMNotes('user-1');
      expect(mockService.getDMNotesForContacts).toHaveBeenCalledWith('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('changeGroupRole', () => {
    it('should call service.changeGroupRole with all params', async () => {
      mockService.changeGroupRole.mockResolvedValue({ role: 'admin' });
      await controller.changeGroupRole('conv-1', 'user-2', 'user-1', { role: 'admin' } as any);
      expect(mockService.changeGroupRole).toHaveBeenCalledWith('conv-1', 'user-1', 'user-2', 'admin');
    });
  });

  describe('generateInviteLink', () => {
    it('should call service.generateGroupInviteLink with conversationId and userId', async () => {
      mockService.generateGroupInviteLink.mockResolvedValue({ inviteCode: 'abc123' });
      await controller.generateInviteLink('conv-1', 'user-1');
      expect(mockService.generateGroupInviteLink).toHaveBeenCalledWith('conv-1', 'user-1');
    });
  });

  describe('joinViaInviteLink', () => {
    it('should call service.joinViaInviteLink with inviteCode and userId', async () => {
      mockService.joinViaInviteLink.mockResolvedValue({ joined: true });
      await controller.joinViaInviteLink('abc123', 'user-1');
      expect(mockService.joinViaInviteLink).toHaveBeenCalledWith('abc123', 'user-1');
    });
  });

  describe('createGroupTopic', () => {
    it('should call service.createGroupTopic with all params', async () => {
      mockService.createGroupTopic.mockResolvedValue({ id: 'topic-1' });
      await controller.createGroupTopic('conv-1', 'user-1', { name: 'General', iconEmoji: 'chat' } as any);
      expect(mockService.createGroupTopic).toHaveBeenCalledWith('conv-1', 'user-1', 'General', 'chat');
    });
  });

  describe('getGroupTopics', () => {
    it('should call service.getGroupTopics with conversationId and userId', async () => {
      mockService.getGroupTopics.mockResolvedValue([{ id: 'topic-1', name: 'General' }]);
      await controller.getGroupTopics('conv-1', 'user-1');
      expect(mockService.getGroupTopics).toHaveBeenCalledWith('conv-1', 'user-1');
    });
  });

  describe('setMessageExpiry', () => {
    it('should call service.setMessageExpiry with conversationId, userId, and expiryDays', async () => {
      mockService.setMessageExpiry.mockResolvedValue({ expiryDays: 7 });
      await controller.setMessageExpiry('conv-1', 'user-1', { expiryDays: 7 } as any);
      expect(mockService.setMessageExpiry).toHaveBeenCalledWith('conv-1', 'user-1', 7);
    });
  });
});
