import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { navigate } from '@/utils/navigation';
import { handleIncomingCallPush } from '@/services/callkit';

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
  | 'system'
  | 'incoming_call';

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
  // Call notification fields
  roomName?: string;
  sessionId?: string;
  callType?: string;
  callerName?: string;
};

/**
 * Hook that handles incoming push notifications in foreground/background
 * and maps them to navigation routes.
 * Called from usePushNotifications — do not call separately.
 */
export function usePushNotificationHandler(isSignedIn: boolean = true) {
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  // Configure notification handler for foreground behavior
  useEffect(() => {
    const configureForegroundHandler = async () => {
      try {
        const Notifications = await import('expo-notifications');

        const handler = {
          handleNotification: async () => ({
            shouldShowAlert: true as boolean,
            shouldPlaySound: true as boolean,
            shouldSetBadge: true as boolean,
          }),
        };
        Notifications.setNotificationHandler(handler as unknown as Parameters<typeof Notifications.setNotificationHandler>[0]);
      } catch {
        // Notification handler config is non-critical
      }
    };

    configureForegroundHandler();
  }, []);

  // Set up listeners for notification received and response
  useEffect(() => {
    if (!isSignedIn) return;

    let cancelled = false;
    const setupListeners = async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (cancelled) return; // Guard against unmount during async import

        // Listener for notifications received while app is foregrounded
        notificationListener.current = Notifications.addNotificationReceivedListener(
          (notification) => {
            // Foreground notification received — badge/count updates are handled
            // by shouldSetBadge: true in the handler above.
            // For incoming calls, display native CallKit/ConnectionService UI
            const data = notification.request.content.data;
            if (data && typeof data === 'object' && (data as Record<string, unknown>).type === 'incoming_call') {
              handleIncomingCallPush(data as Record<string, string>);
            }
          }
        );

        // Listener for notification tap response (app opened from background/quit)
        responseListener.current = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            const data = response.notification.request.content.data;
            if (!data || typeof data !== 'object') return;
            handleNotificationNavigation(data as NotificationData);
          }
        );
      } catch {
        // Notification listener setup is non-critical
      }
    };

    setupListeners();

    return () => {
      cancelled = true;
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
  const handleNotificationNavigation = useCallback((data: NotificationData) => {
    if (!data.type) {
      // Fallback to notifications screen
      navigate('/(screens)/notifications');
      return;
    }

    switch (data.type) {
      case 'like':
      case 'comment':
        if (data.postId) {
          navigate(`/(screens)/post/${data.postId}`);
        } else if (data.threadId) {
          navigate(`/(screens)/thread/${data.threadId}`);
        } else if (data.reelId) {
          navigate(`/(screens)/reel/${data.reelId}`);
        } else if (data.videoId) {
          navigate(`/(screens)/video/${data.videoId}`);
        } else {
          navigate('/(screens)/notifications');
        }
        break;

      case 'follow':
        if (data.username) {
          navigate(`/(screens)/profile/${data.username}`);
        } else if (data.userId) {
          navigate(`/(screens)/profile/${data.userId}`);
        } else {
          navigate('/(screens)/notifications');
        }
        break;

      case 'message':
        if (data.conversationId) {
          navigate(`/(screens)/conversation/${data.conversationId}`);
        } else {
          navigate('/(tabs)/risalah');
        }
        break;

      case 'mention':
        if (data.postId) {
          navigate(`/(screens)/post/${data.postId}`);
        } else if (data.threadId) {
          navigate(`/(screens)/thread/${data.threadId}`);
        } else if (data.reelId) {
          navigate(`/(screens)/reel/${data.reelId}`);
        } else if (data.videoId) {
          navigate(`/(screens)/video/${data.videoId}`);
        } else {
          navigate('/(screens)/notifications');
        }
        break;

      case 'live':
        if (data.videoId) {
          navigate(`/(screens)/live/${data.videoId}`);
        } else {
          navigate('/(tabs)/minbar');
        }
        break;

      case 'prayer':
        navigate('/(screens)/prayer-times');
        break;

      case 'event':
        if (data.eventId) {
          navigate(`/(screens)/event-detail/${data.eventId}`);
        } else {
          navigate('/(screens)/events');
        }
        break;

      case 'tip':
      case 'membership':
        navigate('/(screens)/monetization');
        break;

      case 'audio_room':
        if (data.audioRoomId) {
          navigate(`/(screens)/audio-room/${data.audioRoomId}`);
        } else {
          navigate('/(screens)/audio-rooms');
        }
        break;

      case 'rsvp':
        if (data.eventId) {
          navigate(`/(screens)/event-detail/${data.eventId}`);
        } else {
          navigate('/(screens)/events');
        }
        break;

      case 'incoming_call':
        if (data.roomName && data.sessionId) {
          navigate(`/(screens)/call/${data.sessionId}`, {
            roomName: data.roomName,
            sessionId: data.sessionId,
            callType: data.callType || 'VOICE',
            callerName: data.callerName || '',
          });
        }
        break;

      case 'admin':
      case 'system':
      default:
        navigate('/(screens)/notifications');
        break;
    }
  }, []);

  /**
   * Manual trigger for notification navigation (useful for deep links)
   */
  const navigateFromNotification = useCallback((data: NotificationData) => {
    handleNotificationNavigation(data);
  }, [handleNotificationNavigation]);

  return { navigateFromNotification };
}
