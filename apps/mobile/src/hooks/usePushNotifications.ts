import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { devicesApi } from '@/services/api';

/**
 * Registers this device for push notifications and syncs the token
 * with the Mizanly backend (/devices endpoint).
 *
 * Requires expo-notifications and expo-device to be installed:
 *   npx expo install expo-notifications expo-device
 *
 * And app.json must include the plugin:
 *   { "expo": { "plugins": ["expo-notifications"] } }
 */
export function usePushNotifications(isSignedIn: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    if (!isSignedIn || registered.current) return;

    const register = async () => {
      try {
        // Dynamically import so the hook doesn't crash if package isn't installed yet
        const Notifications = await import('expo-notifications');
        const Device = await import('expo-device');

        if (!Device.default.isDevice) return; // Push tokens only work on real devices

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') return;

        // Configure Android channel
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
        // Push registration is non-critical — silently fail
      }
    };

    register();
  }, [isSignedIn]);
}
