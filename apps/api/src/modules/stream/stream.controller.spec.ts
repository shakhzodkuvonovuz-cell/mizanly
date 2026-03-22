import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { globalMockProviders } from '../../common/test/mock-providers';
import { createHmac } from 'crypto';

const WEBHOOK_SECRET = 'test-webhook-secret-123';

function makeSignature(body: Record<string, unknown>, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${timestamp}.${JSON.stringify(body)}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `time=${timestamp},sig1=${sig}`;
}

function makeReq(body: Record<string, unknown>): any {
  return { rawBody: Buffer.from(JSON.stringify(body)) };
}

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
          useValue: { get: jest.fn().mockReturnValue(WEBHOOK_SECRET) },
        },
      ],
    }).compile();

    controller = module.get(StreamController);
    service = module.get(StreamService) as jest.Mocked<StreamService>;
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleWebhook', () => {
    it('should return received true when uid is missing', async () => {
      const body = { uid: '' } as any;
      const sig = makeSignature(body, WEBHOOK_SECRET);
      const result = await controller.handleWebhook(makeReq(body), body, sig);
      expect(result).toEqual({ received: true });
    });

    it('should call handleStreamReady when readyToStream is true', async () => {
      service.handleStreamReady.mockResolvedValue(undefined as any);
      const body = { uid: 'vid-1', readyToStream: true } as any;
      const sig = makeSignature(body, WEBHOOK_SECRET);

      const result = await controller.handleWebhook(makeReq(body), body, sig);
      expect(service.handleStreamReady).toHaveBeenCalledWith('vid-1');
      expect(result).toEqual({ received: true });
    });

    it('should call handleStreamError when status.state is error', async () => {
      service.handleStreamError.mockResolvedValue(undefined as any);
      const body = { uid: 'vid-1', status: { state: 'error', errorReasonCode: 'corrupt' } } as any;
      const sig = makeSignature(body, WEBHOOK_SECRET);

      const result = await controller.handleWebhook(makeReq(body), body, sig);
      expect(service.handleStreamError).toHaveBeenCalledWith('vid-1', 'corrupt');
      expect(result).toEqual({ received: true });
    });

    it('should reject missing signature', async () => {
      await expect(controller.handleWebhook(makeReq({ uid: 'vid-1' }), { uid: 'vid-1' } as any, undefined))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject invalid signature', async () => {
      await expect(controller.handleWebhook(makeReq({ uid: 'vid-1' }), { uid: 'vid-1' } as any, 'time=123,sig1=invalid'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should reject expired signature', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 min ago
      const body = { uid: 'vid-1' };
      const payload = `${oldTimestamp}.${JSON.stringify(body)}`;
      const sig = createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');
      await expect(controller.handleWebhook(makeReq(body), body as any, `time=${oldTimestamp},sig1=${sig}`))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('handleWebhook — no secret configured', () => {
    it('should reject all webhooks when secret is empty', async () => {
      const moduleNoSecret = await Test.createTestingModule({
        controllers: [StreamController],
        providers: [
          ...globalMockProviders,
          { provide: StreamService, useValue: { handleStreamReady: jest.fn(), handleStreamError: jest.fn() } },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
        ],
      }).compile();

      const ctrl = moduleNoSecret.get(StreamController);
      await expect(ctrl.handleWebhook(makeReq({ uid: 'vid-1' }), { uid: 'vid-1' } as any, undefined))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});
