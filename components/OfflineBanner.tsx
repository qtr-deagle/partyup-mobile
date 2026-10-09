import { WifiOff } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// JS-only connectivity check (NetInfo would need a native rebuild): ping the
// Supabase auth health endpoint. Any HTTP answer means we're online; only a
// failed or timed-out request counts as offline. Checks more often while
// offline so the banner clears soon after the connection comes back.
const HEALTH_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/health`;
const ONLINE_INTERVAL_MS = 20_000;
const OFFLINE_INTERVAL_MS = 4_000;
const TIMEOUT_MS = 6_000;
// Two misses in a row before showing it, so one slow request doesn't flash it.
const MISSES_BEFORE_OFFLINE = 2;

async function reachable() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(HEALTH_URL, {
      signal: controller.signal,
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  const misses = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      clearTimeout(timer);
      const ok = await reachable();
      if (cancelled) return;
      misses.current = ok ? 0 : misses.current + 1;
      const isOffline = misses.current >= MISSES_BEFORE_OFFLINE;
      setOffline(isOffline);
      // A single miss rechecks quickly to confirm.
      timer = setTimeout(() => void check(), ok ? ONLINE_INTERVAL_MS : OFFLINE_INTERVAL_MS);
    }

    void check();
    // Coming back to the app is the most likely moment the network changed.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
      else clearTimeout(timer);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  if (!offline) return null;

  return (
    <Animated.View
      key="offline-banner"
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(250)}
      pointerEvents="none"
      style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12, zIndex: 900 }}>
      <View
        className="flex-row items-center gap-2.5 rounded-2xl bg-[#273142] px-4 py-3"
        style={{ elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
        <WifiOff size={17} color="#FFFFFF" />
        <View className="flex-1">
          <Text className="text-[14px] font-bold text-white">You&apos;re offline</Text>
          <Text className="text-[12px] text-white/75">Check your connection. We&apos;ll reconnect automatically.</Text>
        </View>
      </View>
    </Animated.View>
  );
}
