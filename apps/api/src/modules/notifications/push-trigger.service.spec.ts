import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { PushTriggerService } from './push-trigger.service';
import { PushService } from './push.service';

describe('PushTriggerService', () => {
  let service: PushTriggerService;
  let prisma: any;
  let push: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushTriggerService,
        {
          provide: PrismaService,
          useValue: {
            notification: { findUnique: jest.fn() },
            user: { findUnique: jest.fn() },
          },
        },
        {
          provide: PushService,
          useValue: {
            sendToUser: jest.fn().mockResolvedValue(undefined),
            buildLikeNotification: jest.fn().mockReturnValue({ title: 'Like', body: 'liked your post', data: {} }),
            buildCommentNotification: jest.fn().mockReturnValue({ title: 'Comment', body: 'commented', data: {} }),
            buildFollowNotification: jest.fn().mockReturnValue({ title: 'Follow', body: 'followed you', data: {} }),
            buildMessageNotification: jest.fn().mockReturnValue({ title: 'Message', body: 'sent a message', data: {} }),
            buildMentionNotification: jest.fn().mockReturnValue({ title: 'Mention', body: 'mentioned you', data: {} }),
            buildReplyNotification: jest.fn().mockReturnValue({ title: 'Reply', body: 'replied', data: {} }),
          },
        },
      ],
    }).compile();

    service = module.get<PushTriggerService>(PushTriggerService);
    prisma = module.get(PrismaService) as any;
    push = module.get(PushService) as any;
  });

  describe('triggerPush', () => {
    it('should trigger push for LIKE notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n1', type: 'LIKE', userId: 'user-1', postId: 'post-1',
        actor: { displayName: 'John' }, actorId: 'actor-1',
      });

      await service.triggerPush('n1');
      expect(push.buildLikeNotification).toHaveBeenCalledWith('John', 'post-1');
    });

    it('should trigger push for COMMENT notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n2', type: 'COMMENT', userId: 'user-1', postId: 'post-1',
        actor: { displayName: 'Jane' }, actorId: 'actor-2', body: 'Great post!',
      });

      await service.triggerPush('n2');
      expect(push.buildCommentNotification).toHaveBeenCalled();
    });

    it('should trigger push for FOLLOW notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n3', type: 'FOLLOW', userId: 'user-1',
        actor: { displayName: 'Ali' }, actorId: 'actor-3',
      });

      await service.triggerPush('n3');
      expect(push.buildFollowNotification).toHaveBeenCalledWith('Ali', 'actor-3');
    });

    it('should handle FOLLOW_REQUEST notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n4', type: 'FOLLOW_REQUEST', userId: 'user-1',
        actor: { displayName: 'Sara' }, actorId: 'actor-4',
      });

      await service.triggerPush('n4');
      // Should send without throwing
    });

    it('should handle missing notification gracefully', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);
      await service.triggerPush('missing');
      expect(push.sendToUser).not.toHaveBeenCalled();
    });

    it('should use "Someone" when actor has no displayName', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n5', type: 'LIKE', userId: 'user-1', postId: 'post-1',
        actor: { displayName: null }, actorId: 'actor-5',
      });

      await service.triggerPush('n5');
      expect(push.buildLikeNotification).toHaveBeenCalledWith('Someone', 'post-1');
    });

    it('should handle MESSAGE notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n6', type: 'MESSAGE', userId: 'user-1', conversationId: 'conv-1',
        actor: { displayName: 'Ahmed' }, actorId: 'actor-6', body: 'Hello!',
      });

      await service.triggerPush('n6');
      // Should process message notification
    });

    it('should truncate long notification bodies', async () => {
      const longBody = 'x'.repeat(200);
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n7', type: 'COMMENT', userId: 'user-1', postId: 'post-1',
        actor: { displayName: 'User' }, actorId: 'a7', body: longBody,
      });

      await service.triggerPush('n7');
      // Should truncate to ~80 chars
    });

    it('should handle FOLLOW_REQUEST_ACCEPTED notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n8', type: 'FOLLOW_REQUEST_ACCEPTED', userId: 'user-1',
        actor: { displayName: 'Fatima' }, actorId: 'actor-8',
      });

      await service.triggerPush('n8');
    });

    it('should not send push when LIKE notification has no postId', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n9', type: 'LIKE', userId: 'user-1', postId: null,
        actor: { displayName: 'User' }, actorId: 'a9',
      });

      await service.triggerPush('n9');
      expect(push.buildLikeNotification).not.toHaveBeenCalled();
    });
  });
});
