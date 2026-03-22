import { useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import type { Subscription } from 'expo-notifications';
import { devicesApi } from '@/services/api';
import { usePushNotificationHandler } from './usePushNotificationHandler';

export function usePushNotifications(isSignedIn: boolean) {
  const registered = useRef(false);
  const tokenSubscription = useRef<Subscription | null>(null);
  const appStateSubscription = useRef<ReturnType<typeof AppState.addEventListener> | null>(null);

  // Wire up the notification handler (foreground behavior + tap navigation)
  usePushNotificationHandler(isSignedIn);

  // Reset badge count when app comes to foreground
  useEffect(() => {
    const resetBadge = async () => {
      try {
        const Notifications = await import('expo-notifications');
        await Notifications.setBadgeCountAsync(0);
      } catch {
        // Badge reset is non-critical
      }
    };

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && isSignedIn) {
        resetBadge();
      }
    });
    appStateSubscription.current = subscription;

    // Also reset on mount if already active
    if (isSignedIn) {
      resetBadge();
    }

    return () => {
      subscription.remove();
      appStateSubscription.current = null;
    };
  }, [isSignedIn]);

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

        const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
        if (!projectId || projectId === 'SET_ME') {
          if (__DEV__) console.warn('[Push] EXPO_PUBLIC_PROJECT_ID not configured — push notifications disabled');
          return;
        }
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

        const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
        await devicesApi.register(tokenData.data, platform);
        registered.current = true;

        // Listen for native token refreshes (e.g. after app reinstall, OS token rotation).
        // The native token (APNs/FCM) is not what Expo Push API uses — we need to re-fetch
        // the Expo push token which wraps the native token.
        tokenSubscription.current = Notifications.addPushTokenListener(async () => {
          try {
            const refreshedToken = await Notifications.getExpoPushTokenAsync({
              projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
            });
            const newPlatform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
            await devicesApi.register(refreshedToken.data, newPlatform);
          } catch {
            // Token refresh registration is non-critical
          }
        });
      } catch {
        // Push registration is non-critical
      }
    };

    register();

    return () => {
      if (tokenSubscription.current) {
        tokenSubscription.current.remove();
        tokenSubscription.current = null;
      }
    };
  }, [isSignedIn]);

  // Reset registered ref when user signs out so re-registration happens on next sign-in
  useEffect(() => {
    if (!isSignedIn) {
      registered.current = false;
    }
  }, [isSignedIn]);
}
