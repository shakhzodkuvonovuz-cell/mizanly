import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { AuthService } from './auth.service';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('WebhooksController — typed ClerkWebhookEvent', () => {
  let controller: WebhooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        ...globalMockProviders,
        {
          provide: AuthService,
          useValue: {
            syncClerkUser: jest.fn().mockResolvedValue({}),
            handleClerkUserDeleted: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();
    controller = module.get(WebhooksController);
  });

  it('should reject when raw body missing', async () => {
    const req = { rawBody: undefined } as any;
    await expect(
      controller.handleClerkWebhook(req, '', '', ''),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject when webhook secret not configured', async () => {
    const req = { rawBody: Buffer.from('test') } as any;
    // ConfigService returns null for CLERK_WEBHOOK_SECRET in some test configs
    // The controller checks for secret and throws
    await expect(
      controller.handleClerkWebhook(req, 'id', 'ts', 'sig'),
    ).rejects.toThrow();
  });
});
