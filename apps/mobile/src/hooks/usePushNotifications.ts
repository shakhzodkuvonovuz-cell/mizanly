import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { devicesApi } from '@/services/api';

export function usePushNotifications(isSignedIn: boolean) {
  const registered = useRef(false);

  // Register push token (only when signed in)
  useEffect(() => {
    if (!isSignedIn || registered.current) return;

    const register = async () => {
      try {
        const Notifications = await import('expo-notifications');
        const Device = await import('expo-device');

        if (!Device.default.isDevice) return;

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Mizanly',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
          });
        }

        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
        });

        const platform = Platform.OS === 'ios' ? 'ios' : 'android';
        await devicesApi.register(tokenData.data, platform);
        registered.current = true;
      } catch {
        // Push registration is non-critical
      }
    };

    register();
  }, [isSignedIn]);

  // Handle notification taps (always active, regardless of sign-in state)
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;

    const setup = async () => {
      try {
        const Notifications = await import('expo-notifications');
        const { router } = await import('expo-router');

        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data;
          if (!data) return;

          if (data.postId && typeof data.postId === 'string' && data.postId.length < 100) {
            router.push(`/(screens)/post/${data.postId}` as never);
          } else if (data.threadId && typeof data.threadId === 'string' && data.threadId.length < 100) {
            router.push(`/(screens)/thread/${data.threadId}` as never);
          } else if (data.reelId && typeof data.reelId === 'string' && data.reelId.length < 100) {
            router.push(`/(screens)/reel/${data.reelId}` as never);
          } else if (data.videoId && typeof data.videoId === 'string' && data.videoId.length < 100) {
            router.push(`/(screens)/video/${data.videoId}` as never);
          } else if (data.conversationId && typeof data.conversationId === 'string' && data.conversationId.length < 100) {
            router.push(`/(screens)/conversation/${data.conversationId}` as never);
          } else if (data.username && typeof data.username === 'string' && data.username.length < 100) {
            router.push(`/(screens)/profile/${data.username}` as never);
          } else {
            router.push('/(screens)/notifications' as never);
          }
        });
      } catch {
        // Notification handling is non-critical
      }
    };

    setup();
    return () => subscription?.remove();
  }, []);
}