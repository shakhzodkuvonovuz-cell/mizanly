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

    // ── T01 Webhook Tests (#9-13) ──

    it('should call trackLogin on session.created event (T01 #9)', async () => {
      const eventData = { type: 'session.created', data: { id: 'sess_1', user_id: 'clerk_user_1' } };
      mockVerify.mockReturnValue(eventData);
      (authService as any).trackLogin = jest.fn().mockResolvedValue(undefined);

      const result = await controller.handleClerkWebhook(makeReq(eventData) as any, 'id-9', 'ts', 'sig');

      expect((authService as any).trackLogin).toHaveBeenCalledWith('clerk_user_1');
      expect(result).toEqual({ received: true });
    });

    it('should publish session revocation on session.revoked (T01 #10)', async () => {
      const eventData = { type: 'session.revoked', data: { id: 'sess_2', user_id: 'clerk_user_2' } };
      mockVerify.mockReturnValue(eventData);
      (authService as any).findByClerkId = jest.fn().mockResolvedValue({ id: 'internal-user-2' });
      const mockPublish = jest.fn().mockResolvedValue(1);
      (authService as any).getRedis = jest.fn().mockReturnValue({ publish: mockPublish });

      const result = await controller.handleClerkWebhook(makeReq(eventData) as any, 'id-10', 'ts', 'sig');

      expect((authService as any).findByClerkId).toHaveBeenCalledWith('clerk_user_2');
      expect(mockPublish).toHaveBeenCalledWith('user:session_revoked', JSON.stringify({ userId: 'internal-user-2' }));
      expect(result).toEqual({ received: true });
    });

    it('should skip and return deduplicated on duplicate svix-id (T01 #11)', async () => {
      const eventData = { type: 'user.created', data: { id: 'c1', email_addresses: [{ email_address: 'x@x.com' }] } };
      mockVerify.mockReturnValue(eventData);
      // Redis returns non-null → already processed
      const redis = (controller as any).redis;
      redis.get.mockResolvedValue('1');

      const result = await controller.handleClerkWebhook(makeReq(eventData) as any, 'dup-id', 'ts', 'sig');

      expect(result).toEqual({ received: true, deduplicated: true });
      expect(authService.syncClerkUser).not.toHaveBeenCalled();
    });

    it('should log warning for unhandled event type (T01 #12)', async () => {
      const eventData = { type: 'unknown.event', data: { id: 'x' } };
      mockVerify.mockReturnValue(eventData);

      const result = await controller.handleClerkWebhook(makeReq(eventData) as any, 'id-12', 'ts', 'sig');

      expect(result).toEqual({ received: true });
      // Should not throw — just logs and returns
    });

    it('should handle session.ended without error (T01 #14)', async () => {
      const eventData = { type: 'session.ended', data: { id: 'sess_3', user_id: 'clerk_user_3' } };
      mockVerify.mockReturnValue(eventData);

      const result = await controller.handleClerkWebhook(makeReq(eventData) as any, 'id-14', 'ts', 'sig');

      expect(result).toEqual({ received: true });
    });

    it('should handle session.removed same as session.revoked (T01 #15)', async () => {
      const eventData = { type: 'session.removed', data: { id: 'sess_4', user_id: 'clerk_user_4' } };
      mockVerify.mockReturnValue(eventData);
      (authService as any).findByClerkId = jest.fn().mockResolvedValue({ id: 'internal-user-4' });
      const mockPublish = jest.fn().mockResolvedValue(1);
      (authService as any).getRedis = jest.fn().mockReturnValue({ publish: mockPublish });

      const result = await controller.handleClerkWebhook(makeReq(eventData) as any, 'id-15', 'ts', 'sig');

      expect((authService as any).findByClerkId).toHaveBeenCalledWith('clerk_user_4');
      expect(mockPublish).toHaveBeenCalledWith('user:session_revoked', JSON.stringify({ userId: 'internal-user-4' }));
      expect(result).toEqual({ received: true });
    });

    it('should acknowledge organization events without error (T01 #16)', async () => {
      const eventData = { type: 'organization.membership.deleted', data: { id: 'org_mem_1' } };
      mockVerify.mockReturnValue(eventData);

      const result = await controller.handleClerkWebhook(makeReq(eventData) as any, 'id-16', 'ts', 'sig');

      expect(result).toEqual({ received: true });
    });

    it('should sync username on user.updated with username change (T01 #13)', async () => {
      const eventData = {
        type: 'user.updated',
        data: {
          id: 'clerk_user_1',
          email_addresses: [{ email_address: 'test@x.com' }],
          first_name: 'Test',
          last_name: '',
          username: 'new_username',
        },
      };
      mockVerify.mockReturnValue(eventData);
      authService.syncClerkUser.mockResolvedValue(undefined as any);

      await controller.handleClerkWebhook(makeReq(eventData) as any, 'id-13', 'ts', 'sig');

      expect(authService.syncClerkUser).toHaveBeenCalledWith('clerk_user_1', expect.objectContaining({
        username: 'new_username',
      }));
    });
  });
});
