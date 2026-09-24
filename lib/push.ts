import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';

export const SOS_CHANNEL_ID = 'sos';

// Expo Go on Android dropped remote push support (SDK 53+), and merely
// importing expo-notifications there throws -- which took down the whole root
// layout via SosAlertOverlay. So the module is only loaded outside Expo Go;
// in Expo Go SOS alerts still arrive in-app via realtime, just not as pushes.
const isAndroidExpoGo = Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';

let notificationsModule: typeof NotificationsModule | null | undefined;

export function getNotifications() {
  if (notificationsModule === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy, see above
    notificationsModule = Platform.OS === 'web' || isAndroidExpoGo ? null : (require('expo-notifications') as typeof NotificationsModule);
    notificationsModule?.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
  return notificationsModule;
}

async function ensureAndroidChannels(Notifications: typeof NotificationsModule) {
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
  const Notifications = getNotifications();
  if (!Notifications) {
    return { error: null };
  }

  try {
    await ensureAndroidChannels(Notifications);

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
