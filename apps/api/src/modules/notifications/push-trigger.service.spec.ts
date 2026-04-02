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
            // W7-T1: Added missing builder methods
            buildRepostNotification: jest.fn().mockReturnValue({ title: 'Repost', body: 'reposted', data: {} }),
            buildQuotePostNotification: jest.fn().mockReturnValue({ title: 'Quote', body: 'quoted', data: {} }),
            buildChannelPostNotification: jest.fn().mockReturnValue({ title: 'Channel', body: 'posted', data: {} }),
            buildLiveStartedNotification: jest.fn().mockReturnValue({ title: 'Live', body: 'went live', data: {} }),
            buildVideoPublishedNotification: jest.fn().mockReturnValue({ title: 'Video', body: 'published', data: {} }),
            buildReelLikeNotification: jest.fn().mockReturnValue({ title: 'Like', body: 'liked your reel', data: {} }),
            buildReelCommentNotification: jest.fn().mockReturnValue({ title: 'Comment', body: 'commented on reel', data: {} }),
            buildVideoLikeNotification: jest.fn().mockReturnValue({ title: 'Like', body: 'liked your video', data: {} }),
            buildVideoCommentNotification: jest.fn().mockReturnValue({ title: 'Comment', body: 'commented on video', data: {} }),
            buildStoryReplyNotification: jest.fn().mockReturnValue({ title: 'Story Reply', body: 'replied', data: {} }),
            buildPollVoteNotification: jest.fn().mockReturnValue({ title: 'Poll', body: 'voted', data: {} }),
            buildCircleInviteNotification: jest.fn().mockReturnValue({ title: 'Circle', body: 'invited you', data: {} }),
            buildCircleJoinNotification: jest.fn().mockReturnValue({ title: 'Circle', body: 'joined', data: {} }),
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

    // ── W7-T1 T07: 17 untested notification types (C severity) ──

    it('should trigger push for MENTION notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n10', type: 'MENTION', userId: 'u1', postId: 'p1',
        actor: { displayName: 'Ali' }, actorId: 'a10',
      });
      await service.triggerPush('n10');
      expect(push.buildMentionNotification).toHaveBeenCalledWith('Ali', 'p1', 'post');
    });

    it('should trigger push for MENTION with threadId', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n10b', type: 'MENTION', userId: 'u1', postId: null, threadId: 't1', reelId: null,
        actor: { displayName: 'Ali' }, actorId: 'a10',
      });
      await service.triggerPush('n10b');
      expect(push.buildMentionNotification).toHaveBeenCalledWith('Ali', 't1', 'thread');
    });

    it('should trigger push for THREAD_REPLY notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n11', type: 'THREAD_REPLY', userId: 'u1', threadId: 't1',
        actor: { displayName: 'Sara' }, actorId: 'a11', body: 'Great thread!',
      });
      await service.triggerPush('n11');
      expect(push.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({
        title: 'New reply',
        body: expect.stringContaining('Sara replied'),
      }));
    });

    it('should trigger push for REPLY notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n12', type: 'REPLY', userId: 'u1', threadId: 't1',
        actor: { displayName: 'Omar' }, actorId: 'a12', body: 'Nice!',
      });
      await service.triggerPush('n12');
      expect(push.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({
        title: 'New reply',
      }));
    });

    it('should trigger push for REPOST with postId', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n13', type: 'REPOST', userId: 'u1', postId: 'p1',
        actor: { displayName: 'Ahmad' }, actorId: 'a13',
      });
      await service.triggerPush('n13');
      expect(push.buildRepostNotification).toHaveBeenCalledWith('Ahmad', 'p1');
    });

    it('should trigger push for REPOST with threadId', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n13b', type: 'REPOST', userId: 'u1', postId: null, threadId: 't1',
        actor: { displayName: 'Ahmad' }, actorId: 'a13',
      });
      await service.triggerPush('n13b');
      expect(push.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({
        title: 'Repost',
        body: 'Ahmad reposted your thread',
      }));
    });

    it('should trigger push for QUOTE_POST notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n14', type: 'QUOTE_POST', userId: 'u1', postId: 'p1',
        actor: { displayName: 'Fatima' }, actorId: 'a14',
      });
      await service.triggerPush('n14');
      expect(push.buildQuotePostNotification).toHaveBeenCalledWith('Fatima', 'p1');
    });

    it('should trigger push for CHANNEL_POST notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n15', type: 'CHANNEL_POST', userId: 'u1', postId: 'p1', title: 'Tech Updates',
        actor: { displayName: 'Admin' }, actorId: 'a15',
      });
      await service.triggerPush('n15');
      expect(push.buildChannelPostNotification).toHaveBeenCalledWith('Admin', 'Tech Updates', 'p1');
    });

    it('should trigger push for LIVE_STARTED notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n16', type: 'LIVE_STARTED', userId: 'u1', videoId: 'v1',
        actor: { displayName: 'Streamer' }, actorId: 'a16',
      });
      await service.triggerPush('n16');
      expect(push.buildLiveStartedNotification).toHaveBeenCalledWith('Streamer', 'v1');
    });

    it('should trigger push for VIDEO_PUBLISHED notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n17', type: 'VIDEO_PUBLISHED', userId: 'u1', videoId: 'v1', title: 'My Video',
        actor: { displayName: 'Creator' }, actorId: 'a17',
      });
      await service.triggerPush('n17');
      expect(push.buildVideoPublishedNotification).toHaveBeenCalledWith('Creator', 'v1', 'My Video');
    });

    it('should trigger push for REEL_LIKE notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n18', type: 'REEL_LIKE', userId: 'u1', reelId: 'r1',
        actor: { displayName: 'Fan' }, actorId: 'a18',
      });
      await service.triggerPush('n18');
      expect(push.buildReelLikeNotification).toHaveBeenCalledWith('Fan', 'r1');
    });

    it('should trigger push for REEL_COMMENT notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n19', type: 'REEL_COMMENT', userId: 'u1', reelId: 'r1',
        actor: { displayName: 'Viewer' }, actorId: 'a19', body: 'Cool reel!',
      });
      await service.triggerPush('n19');
      expect(push.buildReelCommentNotification).toHaveBeenCalledWith('Viewer', 'r1', expect.any(String));
    });

    it('should trigger push for VIDEO_LIKE notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n20', type: 'VIDEO_LIKE', userId: 'u1', videoId: 'v1',
        actor: { displayName: 'Fan' }, actorId: 'a20',
      });
      await service.triggerPush('n20');
      expect(push.buildVideoLikeNotification).toHaveBeenCalledWith('Fan', 'v1');
    });

    it('should trigger push for VIDEO_COMMENT notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n21', type: 'VIDEO_COMMENT', userId: 'u1', videoId: 'v1',
        actor: { displayName: 'Viewer' }, actorId: 'a21', body: 'Great video!',
      });
      await service.triggerPush('n21');
      expect(push.buildVideoCommentNotification).toHaveBeenCalledWith('Viewer', 'v1', expect.any(String));
    });

    it('should trigger push for STORY_REPLY notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n22', type: 'STORY_REPLY', userId: 'u1',
        actor: { displayName: 'Friend' }, actorId: 'a22', body: 'Amazing!',
      });
      await service.triggerPush('n22');
      expect(push.buildStoryReplyNotification).toHaveBeenCalledWith('Friend', expect.any(String));
    });

    it('should trigger push for POLL_VOTE notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n23', type: 'POLL_VOTE', userId: 'u1', postId: 'p1',
        actor: { displayName: 'Voter' }, actorId: 'a23',
      });
      await service.triggerPush('n23');
      expect(push.buildPollVoteNotification).toHaveBeenCalledWith('Voter', 'p1');
    });

    it('should trigger push for CIRCLE_INVITE notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n24', type: 'CIRCLE_INVITE', userId: 'u1', title: 'Quran Study',
        actor: { displayName: 'Admin' }, actorId: 'a24',
      });
      await service.triggerPush('n24');
      expect(push.buildCircleInviteNotification).toHaveBeenCalledWith('Admin', 'Quran Study');
    });

    it('should trigger push for CIRCLE_JOIN notification', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n25', type: 'CIRCLE_JOIN', userId: 'u1', title: 'My Circle',
        actor: { displayName: 'NewMember' }, actorId: 'a25',
      });
      await service.triggerPush('n25');
      expect(push.buildCircleJoinNotification).toHaveBeenCalledWith('NewMember', 'My Circle');
    });

    it('should trigger push for SYSTEM notification with title and body', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n26', type: 'SYSTEM', userId: 'u1', title: 'Welcome!', body: 'Enjoy Mizanly',
        actor: null, actorId: null,
      });
      await service.triggerPush('n26');
      expect(push.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({
        title: 'Welcome!',
        body: 'Enjoy Mizanly',
      }));
    });

    it('should trigger push for LIKE notification with threadId (not postId)', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        id: 'n27', type: 'LIKE', userId: 'u1', postId: null, threadId: 't1',
        actor: { displayName: 'Fan' }, actorId: 'a27',
      });
      await service.triggerPush('n27');
      expect(push.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({
        title: 'Like',
        body: 'Fan liked your thread',
      }));
    });
  });
});
