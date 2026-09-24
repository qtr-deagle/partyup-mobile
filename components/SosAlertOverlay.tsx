import { useAuth } from '@/hooks/auth-provider';
import { markNotificationRead } from '@/lib/notifications';
import { getNotifications, registerForPushNotifications } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';
import type { NotificationResponse } from 'expo-notifications';
import { useRouter } from 'expo-router';
import { MapPin, ShieldAlert } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Text, TouchableOpacity, Vibration, View } from 'react-native';

type SosNotification = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  data: { from_user_id?: string; latitude?: number | null; longitude?: number | null } | null;
};

// Alerts missed while offline still pop up if they are this recent.
const RECENT_WINDOW_MS = 30 * 60 * 1000;
const VIBRATION_PATTERN = [0, 800, 400, 800, 400];

// Global listener for SOS alerts from the trusted circle: registers the push
// token, subscribes to new `safety` notifications in realtime, and shows a
// full-screen alert that keeps vibrating until it is acknowledged.
export default function SosAlertOverlay() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const router = useRouter();
  const [queue, setQueue] = useState<SosNotification[]>([]);
  const current = queue[0] ?? null;

  const enqueue = useCallback((alert: SosNotification) => {
    setQueue((existing) => (existing.some((item) => item.id === alert.id) ? existing : [...existing, alert]));
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }
    void registerForPushNotifications();

    void (async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, message, created_at, data')
        .eq('user_id', userId)
        .eq('type', 'safety')
        .eq('read', false)
        .gte('created_at', new Date(Date.now() - RECENT_WINDOW_MS).toISOString())
        .order('created_at', { ascending: true });
      for (const row of (data ?? []) as SosNotification[]) {
        enqueue(row);
      }
    })();

    const channel = supabase
      .channel(`sos-notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as SosNotification & { type: string };
        if (row.type === 'safety') {
          enqueue(row);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enqueue]);

  // Tapping the push notification (app in background or closed). Not
  // available in Android Expo Go, where getNotifications() returns null.
  useEffect(() => {
    const Notifications = getNotifications();
    if (!userId || !Notifications) {
      return;
    }

    const handleResponse = (response: NotificationResponse | null) => {
      const data = response?.notification.request.content.data as { type?: string; notification_id?: string } | undefined;
      if (data?.type !== 'sos' || !data.notification_id) {
        return;
      }
      // The last response survives relaunches, so only show it if still unacknowledged.
      void (async () => {
        const { data: row } = await supabase
          .from('notifications')
          .select('id, title, message, created_at, data, read')
          .eq('id', data.notification_id!)
          .maybeSingle();
        if (row && !row.read) {
          enqueue(row as SosNotification);
        }
      })();
    };

    void Notifications.getLastNotificationResponseAsync().then(handleResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => subscription.remove();
  }, [userId, enqueue]);

  useEffect(() => {
    if (!current) {
      return;
    }
    Vibration.vibrate(VIBRATION_PATTERN, true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return () => Vibration.cancel();
  }, [current]);

  function acknowledge(openMap: boolean) {
    if (!current) {
      return;
    }
    Vibration.cancel();
    void markNotificationRead(current.id);
    setQueue((existing) => existing.slice(1));

    if (openMap) {
      const { from_user_id, latitude, longitude } = current.data ?? {};
      router.push({
        pathname: '/(tabs)/map',
        params: {
          ...(from_user_id ? { focus: from_user_id } : {}),
          ...(latitude != null && longitude != null ? { lat: String(latitude), lng: String(longitude) } : {}),
        },
      });
    }
  }

  const hasLocation = current?.data?.latitude != null && current?.data?.longitude != null;

  return (
    <Modal visible={!!current} animationType="fade" transparent={false} statusBarTranslucent onRequestClose={() => acknowledge(false)}>
      <View className="flex-1 items-center justify-center bg-[#C81E1E] px-6" style={{ paddingTop: Platform.OS === 'ios' ? 60 : 32 }}>
        <View className="h-28 w-28 items-center justify-center rounded-full bg-white/15">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-white">
            <ShieldAlert size={42} color="#C81E1E" />
          </View>
        </View>

        <Text className="mt-8 text-center text-[13px] font-bold uppercase tracking-[3px] text-white/80">Emergency SOS</Text>
        <Text className="mt-2 text-center text-[30px] font-extrabold leading-9 text-white">{current?.title ?? ''}</Text>
        <Text className="mt-3 text-center text-[16px] leading-6 text-white/90">{current?.message ?? ''}</Text>
        {current && (
          <Text className="mt-2 text-center text-[13px] text-white/70">
            {new Date(current.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
        )}

        <View className="mt-10 w-full gap-3">
          <TouchableOpacity
            onPress={() => acknowledge(true)}
            className="flex-row items-center justify-center gap-2 rounded-2xl bg-white py-4"
            accessibilityLabel="View on map">
            <MapPin size={20} color="#C81E1E" />
            <Text className="text-[17px] font-bold text-[#C81E1E]">{hasLocation ? 'View on map' : 'Open map'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => acknowledge(false)} className="items-center rounded-2xl border border-white/60 py-4">
            <Text className="text-[16px] font-semibold text-white">Dismiss</Text>
          </TouchableOpacity>
        </View>

        {queue.length > 1 && <Text className="mt-6 text-[13px] text-white/80">+{queue.length - 1} more alert{queue.length > 2 ? 's' : ''}</Text>}
      </View>
    </Modal>
  );
}
