import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import {
  NOTIFICATION_REQUESTED,
  NotificationRequestedEvent,
} from '../../common/events/notification.events';

/**
 * Listens for notification.requested events and delegates to NotificationsService.
 *
 * This is the bridge between event-emitting services and the notification pipeline.
 * Services no longer need to import NotificationsModule — they just emit events.
 */
@Injectable()
export class NotificationEventListener {
  private readonly logger = new Logger(NotificationEventListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(NOTIFICATION_REQUESTED, { async: true })
  async handleNotificationRequested(event: NotificationRequestedEvent): Promise<void> {
    try {
      await this.notifications.create({
        userId: event.userId,
        actorId: event.actorId,
        type: event.type,
        postId: event.postId,
        threadId: event.threadId,
        commentId: event.commentId,
        reelId: event.reelId,
        videoId: event.videoId,
        conversationId: event.conversationId,
        followRequestId: event.followRequestId,
        circleId: event.circleId,
        title: event.title,
        body: event.body,
      });
    } catch (error) {
      // Never let a notification failure propagate to the emitter
      this.logger.warn(
        `Failed to process notification event: userId=${event.userId} type=${event.type}`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
