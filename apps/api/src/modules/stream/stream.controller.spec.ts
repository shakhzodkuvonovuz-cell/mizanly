import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('StreamController', () => {
  let controller: StreamController;
  let service: jest.Mocked<StreamService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StreamController],
      providers: [
        ...globalMockProviders,
        {
          provide: StreamService,
          useValue: {
            handleStreamReady: jest.fn(),
            handleStreamError: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    controller = module.get(StreamController);
    service = module.get(StreamService) as jest.Mocked<StreamService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleWebhook', () => {
    it('should return received true when uid is missing', async () => {
      const result = await controller.handleWebhook({ uid: '' } as any, undefined);

      expect(result).toEqual({ received: true });
    });

    it('should call handleStreamReady when readyToStream is true', async () => {
      service.handleStreamReady.mockResolvedValue(undefined as any);

      const result = await controller.handleWebhook({ uid: 'vid-1', readyToStream: true } as any, undefined);

      expect(service.handleStreamReady).toHaveBeenCalledWith('vid-1');
      expect(result).toEqual({ received: true });
    });

    it('should call handleStreamError when status.state is error', async () => {
      service.handleStreamError.mockResolvedValue(undefined as any);

      const result = await controller.handleWebhook({ uid: 'vid-1', status: { state: 'error', errorReasonCode: 'corrupt' } } as any, undefined);

      expect(service.handleStreamError).toHaveBeenCalledWith('vid-1', 'corrupt');
      expect(result).toEqual({ received: true });
    });
  });
});
