import { Test, TestingModule } from '@nestjs/testing';
import { NotificationEventListener } from './notification-event.listener';
import { NotificationsService } from './notifications.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../../common/events/notification.events';

describe('NotificationEventListener', () => {
  let listener: NotificationEventListener;
  let notificationsService: { create: jest.Mock };

  beforeEach(async () => {
    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventListener,
        { provide: NotificationsService, useValue: notificationsService },
      ],
    }).compile();

    listener = module.get(NotificationEventListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  it('should delegate to NotificationsService.create', async () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'POLL_VOTE',
      threadId: 'thread-1',
      title: 'Poll vote',
      body: 'Someone voted on your poll',
    });

    await listener.handleNotificationRequested(event);

    expect(notificationsService.create).toHaveBeenCalledWith({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'POLL_VOTE',
      postId: undefined,
      threadId: 'thread-1',
      commentId: undefined,
      reelId: undefined,
      videoId: undefined,
      conversationId: undefined,
      followRequestId: undefined,
      circleId: undefined,
      title: 'Poll vote',
      body: 'Someone voted on your poll',
    });
  });

  it('should handle system notifications (null actorId)', async () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: null,
      type: 'SYSTEM',
      title: 'Content Warning',
      body: 'Your content was flagged',
    });

    await listener.handleNotificationRequested(event);

    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        actorId: null,
        type: 'SYSTEM',
        title: 'Content Warning',
        body: 'Your content was flagged',
      }),
    );
  });

  it('should pass all optional content IDs', async () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'COMMENT',
      postId: 'post-1',
      commentId: 'comment-1',
      reelId: 'reel-1',
      videoId: 'video-1',
      conversationId: 'conv-1',
      followRequestId: 'fr-1',
      circleId: 'circle-1',
    });

    await listener.handleNotificationRequested(event);

    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'post-1',
        commentId: 'comment-1',
        reelId: 'reel-1',
        videoId: 'video-1',
        conversationId: 'conv-1',
        followRequestId: 'fr-1',
        circleId: 'circle-1',
      }),
    );
  });

  it('should not throw when NotificationsService.create fails', async () => {
    notificationsService.create.mockRejectedValueOnce(new Error('DB connection lost'));

    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'SYSTEM',
      title: 'Test',
      body: 'Test body',
    });

    // Should not throw — error is caught internally
    await expect(listener.handleNotificationRequested(event)).resolves.toBeUndefined();
    expect(notificationsService.create).toHaveBeenCalled();
  });

  it('should handle events with minimal fields', async () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: null,
      type: 'SYSTEM',
    });

    await listener.handleNotificationRequested(event);

    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        actorId: null,
        type: 'SYSTEM',
      }),
    );
  });
});

describe('NotificationRequestedEvent', () => {
  it('should construct with all fields', () => {
    const event = new NotificationRequestedEvent({
      userId: 'u1',
      actorId: 'a1',
      type: 'LIKE',
      postId: 'p1',
      threadId: 't1',
      commentId: 'c1',
      reelId: 'r1',
      videoId: 'v1',
      conversationId: 'conv1',
      followRequestId: 'fr1',
      circleId: 'circle1',
      title: 'Title',
      body: 'Body',
    });

    expect(event.userId).toBe('u1');
    expect(event.actorId).toBe('a1');
    expect(event.type).toBe('LIKE');
    expect(event.postId).toBe('p1');
    expect(event.threadId).toBe('t1');
    expect(event.commentId).toBe('c1');
    expect(event.reelId).toBe('r1');
    expect(event.videoId).toBe('v1');
    expect(event.conversationId).toBe('conv1');
    expect(event.followRequestId).toBe('fr1');
    expect(event.circleId).toBe('circle1');
    expect(event.title).toBe('Title');
    expect(event.body).toBe('Body');
  });

  it('should construct with minimal fields', () => {
    const event = new NotificationRequestedEvent({
      userId: 'u1',
      actorId: null,
      type: 'SYSTEM',
    });

    expect(event.userId).toBe('u1');
    expect(event.actorId).toBeNull();
    expect(event.type).toBe('SYSTEM');
    expect(event.postId).toBeUndefined();
    expect(event.title).toBeUndefined();
    expect(event.body).toBeUndefined();
  });

  it('should expose the NOTIFICATION_REQUESTED constant', () => {
    expect(NOTIFICATION_REQUESTED).toBe('notification.requested');
  });
});
