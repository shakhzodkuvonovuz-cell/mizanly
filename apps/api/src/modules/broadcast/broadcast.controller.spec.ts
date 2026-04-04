import { Test, TestingModule } from '@nestjs/testing';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('BroadcastController', () => {
  let controller: BroadcastController;
  let service: BroadcastService;

  const mockService = {
    create: jest.fn(),
    getBySlug: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    getSubscribers: jest.fn(),
    sendMessage: jest.fn(),
    getMessages: jest.fn(),
    pinMessage: jest.fn(),
    unpinMessage: jest.fn(),
    deleteMessage: jest.fn(),
    getPinnedMessages: jest.fn(),
    muteChannel: jest.fn(),
    getMyChannels: jest.fn(),
    discover: jest.fn(),
    promoteToAdmin: jest.fn(),
    demoteFromAdmin: jest.fn(),
    removeSubscriber: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BroadcastController],
      providers: [
        ...globalMockProviders,
        { provide: BroadcastService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<BroadcastController>(BroadcastController);
    service = module.get<BroadcastService>(BroadcastService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { name: 'Test', slug: 'test' };
      const userId = 'user-1';
      mockService.create.mockResolvedValue({ id: '1', ...dto });
      const result = await controller.create(userId, dto as any);
      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual({ id: '1', ...dto });
    });
  });

  describe('discover', () => {
    it('should return paginated channels', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.discover.mockResolvedValue(expected);
      const result = await controller.discover(undefined);
      expect(service.discover).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });
  });

  describe('subscribe', () => {
    it('should call service.subscribe', async () => {
      mockService.subscribe.mockResolvedValue(undefined);
      await controller.subscribe('channel-1', 'user-1');
      expect(service.subscribe).toHaveBeenCalledWith('channel-1', 'user-1');
    });
  });

  describe('unsubscribe', () => {
    it('should call service.unsubscribe', async () => {
      mockService.unsubscribe.mockResolvedValue({ unsubscribed: true });
      await controller.unsubscribe('channel-1', 'user-1');
      expect(service.unsubscribe).toHaveBeenCalledWith('channel-1', 'user-1');
    });
  });

  describe('sendMessage', () => {
    it('should call service.sendMessage', async () => {
      const dto = { content: 'Hello' };
      mockService.sendMessage.mockResolvedValue({ id: 'msg-1', content: 'Hello' });
      const result = await controller.sendMessage('channel-1', 'user-1', dto as any);
      expect(service.sendMessage).toHaveBeenCalledWith('channel-1', 'user-1', dto);
      expect(result.content).toBe('Hello');
    });
  });

  describe('getMessages', () => {
    it('should call service.getMessages', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getMessages.mockResolvedValue(expected);
      const result = await controller.getMessages('channel-1', undefined);
      expect(service.getMessages).toHaveBeenCalledWith('channel-1', undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('pinMessage', () => {
    it('should call service.pinMessage', async () => {
      mockService.pinMessage.mockResolvedValue({ isPinned: true });
      await controller.pinMessage('msg-1', 'user-1');
      expect(service.pinMessage).toHaveBeenCalledWith('msg-1', 'user-1');
    });
  });

  describe('unpinMessage', () => {
    it('should call service.unpinMessage', async () => {
      mockService.unpinMessage.mockResolvedValue({ isPinned: false });
      await controller.unpinMessage('msg-1', 'user-1');
      expect(service.unpinMessage).toHaveBeenCalledWith('msg-1', 'user-1');
    });
  });

  describe('deleteMessage', () => {
    it('should call service.deleteMessage', async () => {
      mockService.deleteMessage.mockResolvedValue({ deleted: true });
      await controller.deleteMessage('msg-1', 'user-1');
      expect(service.deleteMessage).toHaveBeenCalledWith('msg-1', 'user-1');
    });
  });

  describe('getPinnedMessages', () => {
    it('should call service.getPinnedMessages', async () => {
      const expected = [{ id: 'msg-1', isPinned: true }];
      mockService.getPinnedMessages.mockResolvedValue(expected);
      const result = await controller.getPinned('channel-1');
      expect(service.getPinnedMessages).toHaveBeenCalledWith('channel-1');
      expect(result).toEqual(expected);
    });
  });

  describe('muteChannel', () => {
    it('should call service.muteChannel', async () => {
      mockService.muteChannel.mockResolvedValue({ isMuted: true });
      await controller.mute('channel-1', 'user-1', { muted: true } as any);
      expect(service.muteChannel).toHaveBeenCalledWith('channel-1', 'user-1', true);
    });
  });

  describe('getMyChannels', () => {
    it('should call service.getMyChannels', async () => {
      const expected = [{ id: 'channel-1' }];
      mockService.getMyChannels.mockResolvedValue(expected);
      const result = await controller.myChannels('user-1');
      expect(service.getMyChannels).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expected);
    });
  });

  describe('promoteToAdmin', () => {
    it('should call service.promoteToAdmin', async () => {
      mockService.promoteToAdmin.mockResolvedValue({ role: 'ADMIN' });
      await controller.promote('channel-1', 'target-1', 'user-1');
      expect(service.promoteToAdmin).toHaveBeenCalledWith('channel-1', 'user-1', 'target-1');
    });
  });

  describe('demoteFromAdmin', () => {
    it('should call service.demoteFromAdmin', async () => {
      mockService.demoteFromAdmin.mockResolvedValue({ role: 'SUBSCRIBER' });
      await controller.demote('channel-1', 'target-1', 'user-1');
      expect(service.demoteFromAdmin).toHaveBeenCalledWith('channel-1', 'user-1', 'target-1');
    });
  });

  describe('removeSubscriber', () => {
    it('should call service.removeSubscriber', async () => {
      mockService.removeSubscriber.mockResolvedValue({ removed: true });
      await controller.removeSubscriber('channel-1', 'target-1', 'user-1');
      expect(service.removeSubscriber).toHaveBeenCalledWith('channel-1', 'user-1', 'target-1');
    });
  });

  describe('getBySlug', () => {
    it('should call service.getBySlug', async () => {
      const expected = { id: 'channel-1', slug: 'test' };
      mockService.getBySlug.mockResolvedValue(expected);
      const result = await controller.getBySlug('test');
      expect(service.getBySlug).toHaveBeenCalledWith('test');
      expect(result).toEqual(expected);
    });
  });

  describe('update', () => {
    it('should call service.update', async () => {
      const dto = { name: 'Updated' };
      const expected = { id: 'channel-1', ...dto };
      mockService.update.mockResolvedValue(expected);
      const result = await controller.update('channel-1', 'user-1', dto as any);
      expect(service.update).toHaveBeenCalledWith('channel-1', 'user-1', dto);
      expect(result).toEqual(expected);
    });
  });

  describe('delete', () => {
    it('should call service.delete', async () => {
      mockService.delete.mockResolvedValue({ deleted: true });
      const result = await controller.delete('channel-1', 'user-1');
      expect(service.delete).toHaveBeenCalledWith('channel-1', 'user-1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('subscribers', () => {
    it('should call service.getSubscribers', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getSubscribers.mockResolvedValue(expected);
      const result = await controller.subscribers('channel-1', 'user-1', undefined);
      expect(service.getSubscribers).toHaveBeenCalledWith('channel-1', undefined, 'user-1');
      expect(result).toEqual(expected);
    });
  });
});