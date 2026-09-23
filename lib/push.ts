import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SOS_CHANNEL_ID = 'sos';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(SOS_CHANNEL_ID, {
    name: 'Emergency SOS alerts',
    description: 'Alerts when someone in your trusted circle needs help',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    lightColor: '#E32727',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    sound: 'default',
  });
}

// Asks for notification permission and stores this device's Expo push token
// for the signed-in user. Safe to call on every launch.
export async function registerForPushNotifications() {
  if (Platform.OS === 'web') {
    return { error: null };
  }

  try {
    await ensureAndroidChannels();

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      const requested = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowSound: true, allowBadge: true, allowCriticalAlerts: true },
      });
      granted = requested.granted;
    }
    if (!granted) {
      return { error: new Error('Notification permission not granted.') };
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    return { error };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error('Unable to register for notifications.') };
  }
}
