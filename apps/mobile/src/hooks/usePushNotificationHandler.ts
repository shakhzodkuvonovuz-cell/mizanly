import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';

type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'message'
  | 'mention'
  | 'live'
  | 'prayer'
  | 'event'
  | 'tip'
  | 'membership'
  | 'audio_room'
  | 'rsvp'
  | 'admin'
  | 'system';

type NotificationData = {
  type: NotificationType;
  postId?: string;
  threadId?: string;
  reelId?: string;
  videoId?: string;
  conversationId?: string;
  username?: string;
  userId?: string;
  eventId?: string;
  audioRoomId?: string;
  prayerName?: string;
  message?: string;
  // Additional metadata
  [key: string]: unknown;
};

/**
 * Hook that handles incoming push notifications in foreground/background
 * and maps them to navigation routes
 */
export function usePushNotificationHandler(isSignedIn: boolean = true) {
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  // Configure notification handler for foreground behavior
  useEffect(() => {
    const configureForegroundHandler = async () => {
      try {
        const Notifications = await import('expo-notifications');

        Notifications.setNotificationHandler({
          handleNotification: async (notification) => {
            const { data, title, body } = notification.request.content;

            // In-app banner behavior
            return {
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: true,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            };
          },
        });
      } catch (error) {
        console.error('Error setting notification handler:', error);
      }
    };

    configureForegroundHandler();
  }, []);

  // Set up listeners for notification received and response
  useEffect(() => {
    if (!isSignedIn) return;

    const setupListeners = async () => {
      try {
        const Notifications = await import('expo-notifications');

        // Listener for notifications received while app is foregrounded
        notificationListener.current = Notifications.addNotificationReceivedListener(
          (notification) => {
            const { data, title, body } = notification.request.content;
            console.log('Notification received in foreground:', { title, body, data });

            // Update badge count, store locally, etc.
            // Could dispatch to Zustand store for unread counts
          }
        );

        // Listener for notification tap response (app opened from background/quit)
        responseListener.current = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            const data = response.notification.request.content.data as NotificationData;
            handleNotificationNavigation(data);
          }
        );

        console.log('Push notification listeners registered');
      } catch (error) {
        console.error('Error setting up notification listeners:', error);
      }
    };

    setupListeners();

    return () => {
      // Cleanup listeners
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isSignedIn]);

  /**
   * Navigate to appropriate screen based on notification type
   */
  const handleNotificationNavigation = (data: NotificationData) => {
    if (!data.type) {
      // Fallback to notifications screen
      router.push('/(screens)/notifications' as never);
      return;
    }

    switch (data.type) {
      case 'like':
      case 'comment':
        if (data.postId) {
          router.push(`/(screens)/post/${data.postId}` as never);
        } else if (data.threadId) {
          router.push(`/(screens)/thread/${data.threadId}` as never);
        } else if (data.reelId) {
          router.push(`/(screens)/reel/${data.reelId}` as never);
        } else if (data.videoId) {
          router.push(`/(screens)/video/${data.videoId}` as never);
        } else {
          router.push('/(screens)/notifications' as never);
        }
        break;

      case 'follow':
        if (data.username) {
          router.push(`/(screens)/profile/${data.username}` as never);
        } else if (data.userId) {
          // Could fetch username or navigate to user profile by ID
          router.push(`/(screens)/profile/${data.userId}` as never);
        } else {
          router.push('/(screens)/notifications' as never);
        }
        break;

      case 'message':
        if (data.conversationId) {
          router.push(`/(screens)/conversation/${data.conversationId}` as never);
        } else {
          router.push('/(tabs)/risalah' as never);
        }
        break;

      case 'mention':
        if (data.postId) {
          router.push(`/(screens)/post/${data.postId}` as never);
        } else if (data.threadId) {
          router.push(`/(screens)/thread/${data.threadId}` as never);
        } else if (data.reelId) {
          router.push(`/(screens)/reel/${data.reelId}` as never);
        } else if (data.videoId) {
          router.push(`/(screens)/video/${data.videoId}` as never);
        } else {
          router.push('/(screens)/notifications' as never);
        }
        break;

      case 'live':
        if (data.videoId) {
          // Assuming live streams use videoId or a dedicated liveId
          router.push(`/(screens)/live/${data.videoId}` as never);
        } else {
          router.push('/(tabs)/minbar' as never);
        }
        break;

      case 'prayer':
        router.push('/(screens)/prayer-times' as never);
        break;

      case 'event':
        if (data.eventId) {
          // TODO: Create event-detail screen
          router.push(`/(screens)/event-detail/${data.eventId}` as never);
        } else {
          router.push('/(screens)/events' as never);
        }
        break;

      case 'tip':
      case 'membership':
        router.push('/(screens)/monetization' as never);
        break;

      case 'audio_room':
        if (data.audioRoomId) {
          router.push(`/(screens)/audio-room/${data.audioRoomId}` as never);
        } else {
          router.push('/(screens)/audio-rooms' as never);
        }
        break;

      case 'rsvp':
        if (data.eventId) {
          router.push(`/(screens)/event-detail/${data.eventId}` as never);
        } else {
          router.push('/(screens)/events' as never);
        }
        break;

      case 'admin':
      case 'system':
      default:
        router.push('/(screens)/notifications' as never);
        break;
    }
  };

  /**
   * Manual trigger for notification navigation (useful for deep links)
   */
  const navigateFromNotification = (data: NotificationData) => {
    handleNotificationNavigation(data);
  };

  return { navigateFromNotification };
}