import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhooksController } from './webhooks.controller';
import { AuthService } from './auth.service';

// Mock svix at module level
jest.mock('svix', () => ({
  Webhook: jest.fn().mockImplementation(() => ({
    verify: jest.fn(),
  })),
}));

import { Webhook } from 'svix';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let authService: jest.Mocked<AuthService>;
  let configService: jest.Mocked<ConfigService>;
  let mockVerify: jest.Mock;

  beforeEach(async () => {
    mockVerify = jest.fn();
    (Webhook as unknown as jest.Mock).mockImplementation(() => ({
      verify: mockVerify,
    }));

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            syncClerkUser: jest.fn(),
            deactivateByClerkId: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('whsec_test_secret'),
          },
        },
        {
          provide: 'REDIS',
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            setex: jest.fn().mockResolvedValue('OK'),
          },
        },
      ],
    }).compile();

    controller = module.get(WebhooksController);
    authService = module.get(AuthService) as jest.Mocked<AuthService>;
    configService = module.get(ConfigService) as jest.Mocked<ConfigService>;
  });

  afterEach(() => jest.clearAllMocks());

  const makeReq = (body: object) => ({
    rawBody: Buffer.from(JSON.stringify(body)),
  });

  describe('handleClerkWebhook', () => {
    it('should sync user on user.created event', async () => {
      const eventData = {
        type: 'user.created',
        data: {
          id: 'clerk_user_1',
          email_addresses: [{ email_address: 'test@example.com' }],
          first_name: 'Ahmad',
          last_name: 'Khan',
          image_url: 'https://img.clerk.dev/avatar.jpg',
        },
      };
      mockVerify.mockReturnValue(eventData);
      authService.syncClerkUser.mockResolvedValue(undefined as any);

      const result = await controller.handleClerkWebhook(
        makeReq(eventData) as any,
        'svix-id-1', 'ts-1', 'sig-1',
      );

      expect(authService.syncClerkUser).toHaveBeenCalledWith('clerk_user_1', {
        email: 'test@example.com',
        displayName: 'Ahmad Khan',
        avatarUrl: 'https://img.clerk.dev/avatar.jpg',
      });
      expect(result).toEqual({ received: true });
    });

    it('should sync user on user.updated event', async () => {
      const eventData = {
        type: 'user.updated',
        data: {
          id: 'clerk_user_1',
          email_addresses: [{ email_address: 'updated@example.com' }],
          first_name: 'Updated',
          last_name: '',
          image_url: null,
        },
      };
      mockVerify.mockReturnValue(eventData);
      authService.syncClerkUser.mockResolvedValue(undefined as any);

      await controller.handleClerkWebhook(makeReq(eventData) as any, 'id', 'ts', 'sig');

      expect(authService.syncClerkUser).toHaveBeenCalledWith('clerk_user_1', {
        email: 'updated@example.com',
        displayName: 'Updated',
        avatarUrl: undefined,
      });
    });

    it('should deactivate user on user.deleted event', async () => {
      const eventData = { type: 'user.deleted', data: { id: 'clerk_user_1' } };
      mockVerify.mockReturnValue(eventData);
      authService.deactivateByClerkId.mockResolvedValue(undefined as any);

      const result = await controller.handleClerkWebhook(makeReq(eventData) as any, 'id', 'ts', 'sig');

      expect(authService.deactivateByClerkId).toHaveBeenCalledWith('clerk_user_1');
      expect(result).toEqual({ received: true });
    });

    it('should throw BadRequestException on invalid signature', async () => {
      mockVerify.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        controller.handleClerkWebhook(makeReq({}) as any, 'id', 'ts', 'bad-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when webhook secret not configured', async () => {
      configService.get.mockReturnValue(undefined);

      await expect(
        controller.handleClerkWebhook(makeReq({}) as any, 'id', 'ts', 'sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when rawBody not available', async () => {
      const req = { rawBody: undefined } as any;

      await expect(
        controller.handleClerkWebhook(req, 'id', 'ts', 'sig'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
