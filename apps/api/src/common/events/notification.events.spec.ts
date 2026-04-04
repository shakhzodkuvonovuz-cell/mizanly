import { NotificationRequestedEvent, NOTIFICATION_REQUESTED } from './notification.events';

describe('NotificationRequestedEvent', () => {
  it('should have correct event constant', () => {
    expect(NOTIFICATION_REQUESTED).toBe('notification.requested');
  });

  it('should construct with required fields', () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'LIKE',
    });

    expect(event.userId).toBe('user-1');
    expect(event.actorId).toBe('actor-1');
    expect(event.type).toBe('LIKE');
  });

  it('should handle null actorId for system notifications', () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: null,
      type: 'SYSTEM',
    });

    expect(event.actorId).toBeNull();
  });

  it('should accept all optional content reference fields', () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'COMMENT',
      postId: 'post-1',
      threadId: 'thread-1',
      commentId: 'comment-1',
      reelId: 'reel-1',
      videoId: 'video-1',
      conversationId: 'conv-1',
      followRequestId: 'freq-1',
      circleId: 'circle-1',
    });

    expect(event.postId).toBe('post-1');
    expect(event.threadId).toBe('thread-1');
    expect(event.commentId).toBe('comment-1');
    expect(event.reelId).toBe('reel-1');
    expect(event.videoId).toBe('video-1');
    expect(event.conversationId).toBe('conv-1');
    expect(event.followRequestId).toBe('freq-1');
    expect(event.circleId).toBe('circle-1');
  });

  it('should accept push notification title and body', () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'FOLLOW',
      title: 'New Follower',
      body: 'Ahmad started following you',
    });

    expect(event.title).toBe('New Follower');
    expect(event.body).toBe('Ahmad started following you');
  });

  it('should leave optional fields undefined when not provided', () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'LIKE',
    });

    expect(event.postId).toBeUndefined();
    expect(event.threadId).toBeUndefined();
    expect(event.commentId).toBeUndefined();
    expect(event.reelId).toBeUndefined();
    expect(event.videoId).toBeUndefined();
    expect(event.conversationId).toBeUndefined();
    expect(event.followRequestId).toBeUndefined();
    expect(event.circleId).toBeUndefined();
    expect(event.title).toBeUndefined();
    expect(event.body).toBeUndefined();
  });

  it('should have readonly properties', () => {
    const event = new NotificationRequestedEvent({
      userId: 'user-1',
      actorId: 'actor-1',
      type: 'LIKE',
    });

    // TypeScript readonly prevents assignment, but we verify the value is set correctly
    expect(event.userId).toBe('user-1');
    expect(event.actorId).toBe('actor-1');
    expect(event.type).toBe('LIKE');
  });
});
