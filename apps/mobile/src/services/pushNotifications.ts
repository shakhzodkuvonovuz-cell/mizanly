import { Platform } from 'react-native';
import { devicesApi } from './api';
import Constants from 'expo-constants';

// Re-export types from expo-notifications for convenience
export type NotificationChannel = {
  id: string;
  name: string;
  importance: 'default' | 'max' | 'high' | 'low' | 'min';
  vibrationPattern?: number[];
  sound?: boolean;
  lights?: boolean;
};

/**
 * Request push notification permissions and register device token with backend
 * @returns ExpoPushToken string if successful, null otherwise
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');

    if (!Device.default.isDevice) {
      if (__DEV__) console.log('Push notifications not supported on simulator/emulator');
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      if (__DEV__) console.log('Push notification permission denied');
      return null;
    }

    // Configure default notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Mizanly',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableLights: true,
      });
    }

    // Get the ExpoPushToken
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: Constants.expoConfig?.extra?.eas?.projectId || process.env.EXPO_PUBLIC_PROJECT_ID,
    });

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    await devicesApi.register(tokenData.data, platform);

    if (__DEV__) console.log('Push token registered:', tokenData.data);
    return tokenData.data;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Configure notification channels for Android (categories)
 * Each channel can be customized for different notification types
 */
export async function configurePushChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const Notifications = await import('expo-notifications');

    const channels: NotificationChannel[] = [
      {
        id: 'messages',
        name: 'Messages',
        importance: 'max',
        vibrationPattern: [0, 250, 250, 250],
        sound: true,
        lights: true,
      },
      {
        id: 'likes',
        name: 'Likes & Comments',
        importance: 'high',
        vibrationPattern: [0, 150],
        sound: true,
        lights: false,
      },
      {
        id: 'follows',
        name: 'Follows',
        importance: 'high',
        vibrationPattern: [0, 300],
        sound: true,
        lights: false,
      },
      {
        id: 'mentions',
        name: 'Mentions',
        importance: 'max',
        vibrationPattern: [0, 200, 200, 200],
        sound: true,
        lights: true,
      },
      {
        id: 'live',
        name: 'Live Streams',
        importance: 'max',
        vibrationPattern: [0, 500, 250, 500],
        sound: true,
        lights: true,
      },
      {
        id: 'islamic',
        name: 'Islamic Reminders',
        importance: 'high',
        vibrationPattern: [0, 400],
        sound: true,
        lights: false,
      },
    ];

    for (const channel of channels) {
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: Notifications.AndroidImportance[channel.importance.toUpperCase() as keyof typeof Notifications.AndroidImportance] ?? Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: channel.vibrationPattern ?? undefined,
        sound: channel.sound ? 'default' : null,
        enableLights: channel.lights ?? false,
      });
    }

    if (__DEV__) console.log('Notification channels configured');
  } catch (error) {
    console.error('Error configuring notification channels:', error);
  }
}

/**
 * Schedule a local notification for prayer times
 * @param prayerName Name of the prayer (e.g., 'Fajr', 'Dhuhr')
 * @param time Date object representing prayer time
 * @param customSound Optional custom sound file name (without extension)
 */
export async function schedulePrayerNotification(
  prayerName: string,
  time: Date,
  customSound?: string
): Promise<string | null> {
  try {
    const Notifications = await import('expo-notifications');

    const trigger = new Date(time.getTime());
    // Schedule 5 minutes before prayer time
    trigger.setMinutes(trigger.getMinutes() - 5);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🕌 ${prayerName} Prayer`,
        body: `${prayerName} prayer is in 5 minutes. Prepare for Salah.`,
        data: { type: 'prayer', prayerName, time: time.toISOString() },
        sound: customSound ? `${customSound}.wav` : true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: 'islamic',
      },
    });

    if (__DEV__) console.log(`Prayer notification scheduled for ${prayerName} at ${trigger}`);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling prayer notification:', error);
    return null;
  }
}

/**
 * Schedule a Ramadan reminder notification
 * @param type 'iftar' or 'suhoor'
 * @param time Date object for notification time
 * @param customMessage Optional custom message
 */
export async function scheduleRamadanNotification(
  type: 'iftar' | 'suhoor',
  time: Date,
  customMessage?: string
): Promise<string | null> {
  try {
    const Notifications = await import('expo-notifications');

    const trigger = new Date(time.getTime());
    // Schedule 15 minutes before iftar/suhoor
    trigger.setMinutes(trigger.getMinutes() - 15);

    const messages = {
      iftar: {
        title: '🕌 Iftar Time Reminder',
        body: customMessage || 'Iftar time is in 15 minutes. May your fast be accepted.',
      },
      suhoor: {
        title: '🕌 Suhoor Time Reminder',
        body: customMessage || 'Suhoor time is in 15 minutes. Remember to eat before Fajr.',
      },
    };

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        ...messages[type],
        data: { type: 'ramadan', ramadanType: type, time: time.toISOString() },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: 'islamic',
      },
    });

    if (__DEV__) console.log(`Ramadan ${type} notification scheduled at ${trigger}`);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling Ramadan notification:', error);
    return null;
  }
}

/**
 * Cancel a scheduled notification by ID
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error('Error canceling notification:', error);
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error canceling all notifications:', error);
  }
}

/**
 * Get all scheduled notifications
 */
export async function getAllScheduledNotifications(): Promise<
  Array<{ identifier: string; content: unknown; trigger: unknown }>
> {
  try {
    const Notifications = await import('expo-notifications');
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
}

/**
 * Unregister device token from backend (on logout)
 * @param pushToken The ExpoPushToken to unregister
 */
export async function unregisterPushToken(pushToken: string): Promise<void> {
  try {
    await devicesApi.unregister(pushToken);
    if (__DEV__) console.log('Push token unregistered');
  } catch (error) {
    console.error('Error unregistering push token:', error);
  }
}