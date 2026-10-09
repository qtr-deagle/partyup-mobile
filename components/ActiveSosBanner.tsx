import { useAuth } from '@/hooks/auth-provider';
import { setSosTracking, upsertCurrentLocation } from '@/lib/location';
import { getMyActiveSosAlert, markSosSafe, onSosChange, type SosAlert } from '@/lib/safety';
import { feedback } from '@/lib/sounds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import * as Location from 'expo-location';
import { ShieldCheck, Siren } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
const WATCH_INTERVAL_MS = 5000;

// Global, app-wide: while the signed-in user has an active SOS, keeps a red
// bar on screen, streams GPS every ~5 s so staff can follow them live, and
// offers "I'm safe". Resumes after an app restart and clears itself when staff
// resolve the alert from the website.
export default function ActiveSosBanner() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const insets = useSafeAreaInsets();
  const [alert, setAlert] = useState<SosAlert | null>(null);
  const [ending, setEnding] = useState(false);
  const alertIdRef = useRef<string | null>(null);
  const activeAlertId = alert?.id ?? null;

  useEffect(() => {
    if (!userId) {
      alertIdRef.current = null;
      setAlert(null);
      return;
    }

    const apply = (next: SosAlert) => {
      if (next.status === 'active') {
        alertIdRef.current = next.id;
        setAlert(next);
        return;
      }
      if (alertIdRef.current !== next.id) {
        return;
      }
      alertIdRef.current = null;
      setAlert(null);
      if (next.resolved_by && next.resolved_by !== userId) {
        showAlert('SOS resolved', 'A PartyUp admin marked your emergency alert as resolved. Live location sharing has stopped.');
      }
    };

    void getMyActiveSosAlert(userId).then((row) => row && apply(row));
    const unsubscribe = onSosChange(apply);

    const channel = supabase
      .channel(uniqueChannelName(`my-sos:${userId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts', filter: `user_id=eq.${userId}` }, (payload) => {
        apply(payload.new as SosAlert);
      })
      .subscribe();

    return () => {
      unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Live GPS while the alert is active: faster background tracking, plus a
  // foreground watcher (the only source in Expo Go, and fresher when the app is open).
  useEffect(() => {
    if (!activeAlertId) {
      return;
    }
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    void setSosTracking(true);
    void (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) {
          return;
        }
        const watcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: WATCH_INTERVAL_MS, distanceInterval: 0 },
          (position) => {
            void upsertCurrentLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            });
          }
        );
        if (cancelled) {
          watcher.remove();
        } else {
          subscription = watcher;
        }
      } catch (error) {
        console.warn('[sos] live location watcher unavailable', error);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      void setSosTracking(false);
    };
  }, [activeAlertId]);

  function confirmSafe() {
    if (!alert) {
      return;
    }
    showAlert("I'm safe", 'End the emergency alert and stop sharing your live location with PartyUp Guild Leaders?', [
      { text: 'Keep SOS on', style: 'cancel' },
      {
        text: "Yes, I'm safe",
        onPress: async () => {
          setEnding(true);
          const { error } = await markSosSafe(alert.id);
          setEnding(false);
          if (error) {
            feedback.error();
            showAlert('Unable to end SOS', error.message);
            return;
          }
          feedback.notify();
        },
      },
    ]);
  }

  if (!alert) {
    return null;
  }

  return (
    <Animated.View
      key={alert.id}
      entering={FadeInUp.duration(250)}
      exiting={FadeOutUp.duration(200)}
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12, zIndex: 900 }}>
      <View
        className="flex-row items-center rounded-2xl bg-[#C81E1E] px-3.5 py-3"
        style={{ shadowColor: '#7F1D1D', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
        <View className="h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <Siren size={18} color="#FFFFFF" />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-[14px] font-bold text-white">SOS active</Text>
          <Text numberOfLines={2} className="mt-0.5 text-[12px] leading-4 text-white/85">
            Guild Leaders and your trusted circle can see your live location.
          </Text>
        </View>
        <TouchableOpacity
          onPress={confirmSafe}
          disabled={ending}
          className="ml-2 flex-row items-center gap-1.5 rounded-xl bg-white px-3 py-2"
          accessibilityLabel="I'm safe, end SOS">
          {ending ? <ActivityIndicator size="small" color="#C81E1E" /> : <ShieldCheck size={16} color="#C81E1E" />}
          <Text className="text-[13px] font-bold text-[#C81E1E]">I&apos;m safe</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
