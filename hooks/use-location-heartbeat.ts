import { upsertCurrentLocation } from '@/lib/location';
import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';

const HEARTBEAT_INTERVAL_MS = 60000;

// Background tracking only reports after ~50 m of movement, so a stationary user
// would look offline. While the app is in the foreground, refresh the location
// row every minute so Nearby Travelers can treat stale rows as offline.
export function useLocationHeartbeat() {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function beat() {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          return;
        }
        const position =
          (await Location.getLastKnownPositionAsync({ maxAge: HEARTBEAT_INTERVAL_MS })) ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
        await upsertCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      } catch {
        // Location services off or offline; the next beat will retry.
      }
    }

    function start() {
      if (intervalId) {
        return;
      }
      void beat();
      intervalId = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
    }

    function stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    if (AppState.currentState === 'active') {
      start();
    }
    const subscription = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));

    return () => {
      subscription.remove();
      stop();
    };
  }, []);
}
