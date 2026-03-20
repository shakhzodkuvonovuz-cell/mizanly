import { Test, TestingModule } from '@nestjs/testing';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('CallsController', () => {
  let controller: CallsController;
  let service: CallsService;

  const mockService = {
    initiate: jest.fn(),
    answer: jest.fn(),
    decline: jest.fn(),
    end: jest.fn(),
    missedCall: jest.fn(),
    getHistory: jest.fn(),
    getActiveCall: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CallsController],
      providers: [
        ...globalMockProviders,
        { provide: CallsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<CallsController>(CallsController);
    service = module.get<CallsService>(CallsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(CallsController);
  });

  describe('initiate', () => {
    it('should call service.initiate', async () => {
      const dto = { targetUserId: 'user-2', callType: 'audio' };
      const expected = { id: 'call-1' };
      mockService.initiate.mockResolvedValue(expected);
      const result = await controller.initiate('user-1', dto as any);
      expect(service.initiate).toHaveBeenCalledWith('user-1', dto.targetUserId, dto.callType);
      expect(result).toEqual(expected);
    });
  });

  describe('answer', () => {
    it('should call service.answer', async () => {
      mockService.answer.mockResolvedValue({ status: 'ACTIVE' });
      await controller.answer('call-1', 'user-1');
      expect(service.answer).toHaveBeenCalledWith('call-1', 'user-1');
    });
  });

  describe('decline', () => {
    it('should call service.decline', async () => {
      mockService.decline.mockResolvedValue({ status: 'DECLINED' });
      await controller.decline('call-1', 'user-1');
      expect(service.decline).toHaveBeenCalledWith('call-1', 'user-1');
    });
  });

  describe('end', () => {
    it('should call service.end', async () => {
      mockService.end.mockResolvedValue({ status: 'ENDED' });
      await controller.end('call-1', 'user-1');
      expect(service.end).toHaveBeenCalledWith('call-1', 'user-1');
    });
  });

  describe('active', () => {
    it('should call service.getActiveCall', async () => {
      const expected = { id: 'call-1' };
      mockService.getActiveCall.mockResolvedValue(expected);
      const result = await controller.active('user-1');
      expect(service.getActiveCall).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expected);
    });
  });

  describe('history', () => {
    it('should call service.getHistory', async () => {
      const expected = { data: [], meta: { cursor: null, hasMore: false } };
      mockService.getHistory.mockResolvedValue(expected);
      const result = await controller.history('user-1', undefined);
      expect(service.getHistory).toHaveBeenCalledWith('user-1', undefined);
      expect(result).toEqual(expected);
    });
  });
});