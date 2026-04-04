/**
 * Event-driven notification system.
 *
 * Services emit NotificationRequestedEvent instead of injecting NotificationsService directly.
 * NotificationEventListener (in NotificationsModule) handles these events and delegates
 * to NotificationsService.create().
 *
 * This decouples producers from the notification pipeline, breaking circular dependencies
 * (e.g., QueueModule <-> NotificationsModule) and reducing the god-dependency where
 * 21+ services import NotificationsModule.
 */

export const NOTIFICATION_REQUESTED = 'notification.requested';

export class NotificationRequestedEvent {
  /** User who receives the notification */
  readonly userId: string;
  /** User who triggered the action (null for system notifications) */
  readonly actorId: string | null;
  /** Notification type — must match NotificationType Prisma enum */
  readonly type: string;
  /** Optional content references */
  readonly postId?: string;
  readonly threadId?: string;
  readonly commentId?: string;
  readonly reelId?: string;
  readonly videoId?: string;
  readonly conversationId?: string;
  readonly followRequestId?: string;
  readonly circleId?: string;
  /** Optional push notification content */
  readonly title?: string;
  readonly body?: string;

  constructor(params: {
    userId: string;
    actorId: string | null;
    type: string;
    postId?: string;
    threadId?: string;
    commentId?: string;
    reelId?: string;
    videoId?: string;
    conversationId?: string;
    followRequestId?: string;
    circleId?: string;
    title?: string;
    body?: string;
  }) {
    this.userId = params.userId;
    this.actorId = params.actorId;
    this.type = params.type;
    this.postId = params.postId;
    this.threadId = params.threadId;
    this.commentId = params.commentId;
    this.reelId = params.reelId;
    this.videoId = params.videoId;
    this.conversationId = params.conversationId;
    this.followRequestId = params.followRequestId;
    this.circleId = params.circleId;
    this.title = params.title;
    this.body = params.body;
  }
}
