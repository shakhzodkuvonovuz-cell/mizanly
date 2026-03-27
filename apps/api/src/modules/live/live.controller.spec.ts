import { Test, TestingModule } from '@nestjs/testing';
import { LiveController } from './live.controller';
import { LiveService } from './live.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('LiveController', () => {
  let controller: LiveController;
  let service: LiveService;

  const mockService = {
    create: jest.fn(),
    getById: jest.fn(),
    getActive: jest.fn(),
    getScheduled: jest.fn(),
    startLive: jest.fn(),
    endLive: jest.fn(),
    cancelLive: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    raiseHand: jest.fn(),
    promoteToSpeaker: jest.fn(),
    demoteToViewer: jest.fn(),
    updateRecording: jest.fn(),
    getHostSessions: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiveController],
      providers: [
        ...globalMockProviders,
        { provide: LiveService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<LiveController>(LiveController);
    service = module.get<LiveService>(LiveService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call service.create', async () => {
      const dto = { title: 'Test', liveType: 'video' };
      const userId = 'user-1';
      mockService.create.mockResolvedValue({ id: '1', ...dto });
      const result = await controller.create(userId, dto as any);
      expect(service.create).toHaveBeenCalledWith(userId, dto);
      expect(result).toEqual({ id: '1', ...dto });
    });
  });

  describe('getActive', () => {
    it('should call service.getActive', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getActive.mockResolvedValue(expected);
      const result = await controller.getActive(undefined, undefined);
      expect(service.getActive).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('getScheduled', () => {
    it('should call service.getScheduled', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getScheduled.mockResolvedValue(expected);
      const result = await controller.getScheduled(undefined);
      expect(service.getScheduled).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('mySessions', () => {
    it('should call service.getHostSessions', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getHostSessions.mockResolvedValue(expected);
      const result = await controller.mySessions('user-1', undefined);
      expect(service.getHostSessions).toHaveBeenCalledWith('user-1', undefined);
      expect(result).toEqual(expected);
    });
  });

  describe('getById', () => {
    it('should call service.getById', async () => {
      const expected = { id: 'session-1', title: 'Test' };
      mockService.getById.mockResolvedValue(expected);
      const result = await controller.getById('session-1');
      expect(service.getById).toHaveBeenCalledWith('session-1');
      expect(result).toEqual(expected);
    });
  });

  describe('start', () => {
    it('should call service.startLive', async () => {
      mockService.startLive.mockResolvedValue({ status: 'LIVE' });
      await controller.start('session-1', 'user-1');
      expect(service.startLive).toHaveBeenCalledWith('session-1', 'user-1');
    });
  });

  describe('end', () => {
    it('should call service.endLive', async () => {
      mockService.endLive.mockResolvedValue({ status: 'ENDED' });
      await controller.end('session-1', 'user-1');
      expect(service.endLive).toHaveBeenCalledWith('session-1', 'user-1');
    });
  });

  describe('cancel', () => {
    it('should call service.cancelLive', async () => {
      mockService.cancelLive.mockResolvedValue({ status: 'CANCELLED' });
      await controller.cancel('session-1', 'user-1');
      expect(service.cancelLive).toHaveBeenCalledWith('session-1', 'user-1');
    });
  });

  describe('join', () => {
    it('should call service.join', async () => {
      mockService.join.mockResolvedValue({ joined: true });
      await controller.join('session-1', 'user-1');
      expect(service.join).toHaveBeenCalledWith('session-1', 'user-1');
    });
  });

  describe('leave', () => {
    it('should call service.leave', async () => {
      mockService.leave.mockResolvedValue({ left: true });
      await controller.leave('session-1', 'user-1');
      expect(service.leave).toHaveBeenCalledWith('session-1', 'user-1');
    });
  });

  describe('raiseHand', () => {
    it('should call service.raiseHand', async () => {
      mockService.raiseHand.mockResolvedValue({ role: 'raised_hand' });
      await controller.raiseHand('session-1', 'user-1');
      expect(service.raiseHand).toHaveBeenCalledWith('session-1', 'user-1');
    });
  });

  describe('promote', () => {
    it('should call service.promoteToSpeaker', async () => {
      mockService.promoteToSpeaker.mockResolvedValue({ role: 'speaker' });
      await controller.promote('session-1', 'target-1', 'user-1');
      expect(service.promoteToSpeaker).toHaveBeenCalledWith('session-1', 'user-1', 'target-1');
    });
  });

  describe('demote', () => {
    it('should call service.demoteToViewer', async () => {
      mockService.demoteToViewer.mockResolvedValue({ role: 'viewer' });
      await controller.demote('session-1', 'target-1', 'user-1');
      expect(service.demoteToViewer).toHaveBeenCalledWith('session-1', 'user-1', 'target-1');
    });
  });

  describe('setRecording', () => {
    it('should call service.updateRecording', async () => {
      mockService.updateRecording.mockResolvedValue({ recordingUrl: 'url' });
      await controller.setRecording('session-1', 'user-1', { recordingUrl: 'url' } as any);
      expect(service.updateRecording).toHaveBeenCalledWith('session-1', 'user-1', 'url');
    });
  });
});