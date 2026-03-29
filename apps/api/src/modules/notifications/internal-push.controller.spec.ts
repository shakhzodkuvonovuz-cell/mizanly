import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { InternalPushController } from './internal-push.controller';
import { PushService } from './push.service';

describe('InternalPushController', () => {
  let controller: InternalPushController;
  let pushService: jest.Mocked<PushService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalPushController],
      providers: [
        {
          provide: PushService,
          useValue: { sendToUsers: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string, defaultVal: string) => key === 'INTERNAL_SERVICE_KEY' ? 'test-secret-key' : defaultVal) },
        },
      ],
    }).compile();

    controller = module.get(InternalPushController);
    pushService = module.get(PushService) as jest.Mocked<PushService>;
  });

  describe('pushToUsers', () => {
    it('sends push to users with valid key', async () => {
      const result = await controller.pushToUsers('test-secret-key', {
        userIds: ['u1', 'u2'],
        title: 'Incoming Call',
        body: 'You have a call',
        data: { type: 'incoming_call', roomName: 'room-1' },
      });

      expect(result).toEqual({ success: true, sent: 2 });
      expect(pushService.sendToUsers).toHaveBeenCalledWith(
        ['u1', 'u2'],
        { title: 'Incoming Call', body: 'You have a call', data: { type: 'incoming_call', roomName: 'room-1' } },
      );
    });

    it('rejects invalid key', async () => {
      await expect(
        controller.pushToUsers('wrong-key', {
          userIds: ['u1'],
          title: 'Test',
          body: 'Test',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(pushService.sendToUsers).not.toHaveBeenCalled();
    });

    it('rejects missing key', async () => {
      await expect(
        controller.pushToUsers('', {
          userIds: ['u1'],
          title: 'Test',
          body: 'Test',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns sent=0 for empty userIds', async () => {
      const result = await controller.pushToUsers('test-secret-key', {
        userIds: [],
        title: 'Test',
        body: 'Test',
      });

      expect(result).toEqual({ success: true, sent: 0 });
      expect(pushService.sendToUsers).not.toHaveBeenCalled();
    });

    it('caps userIds at 100', async () => {
      const userIds = Array.from({ length: 150 }, (_, i) => `user-${i}`);
      await controller.pushToUsers('test-secret-key', {
        userIds,
        title: 'Test',
        body: 'Test',
      });

      expect(pushService.sendToUsers).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
      );
      const calledWith = pushService.sendToUsers.mock.calls[0][0];
      expect(calledWith.length).toBe(100);
    });

    it('throws 500 on push service failure', async () => {
      pushService.sendToUsers.mockRejectedValue(new Error('Push failed'));

      // [F40 fix] Now throws InternalServerErrorException (500) instead of returning { success: false }
      await expect(
        controller.pushToUsers('test-secret-key', {
          userIds: ['u1'],
          title: 'Test',
          body: 'Test',
        }),
      ).rejects.toThrow('Push delivery failed');
    });
  });
});
