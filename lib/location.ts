import { withRequestTimeout } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LOCATION_TASK_NAME } from '@/lib/location-task';

export type NearbyTraveler = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  distance_km: number;
  is_friend: boolean;
  latitude: number | null;
  longitude: number | null;
  share_kind: ShareKind | null;
};

// 'trusted': trusted circle, visible 24/7.
// 'pair': connected travelers, visible until they meet (within 10 m).
export type ShareKind = 'trusted' | 'pair';

export type SharedLocation = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  latitude: number;
  longitude: number;
  updated_at: string;
  distance_m: number | null;
  share_kind: ShareKind;
};

export async function listSharedLocations() {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('list_shared_locations'), 'Loading shared locations');
  } catch (error) {
    return { data: [] as SharedLocation[], error: error instanceof Error ? error : new Error('Unable to load shared locations.') };
  }
  const { data, error } = response;
  return {
    data: ((data ?? []) as SharedLocation[]).map((row) => ({ ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) })),
    error,
  };
}

export async function restartLocationShare(otherUserId: string) {
  return withRequestTimeout(supabase.rpc('restart_location_share', { p_other_user_id: otherUserId }), 'Sharing location');
}

export async function endLocationShare(otherUserId: string) {
  return withRequestTimeout(supabase.rpc('end_location_share', { p_other_user_id: otherUserId }), 'Stopping location sharing');
}

export async function getNearbyTravelers(radiusKm = 5) {
  let response;
  try {
    response = await withRequestTimeout(supabase.rpc('get_nearby_travelers', { p_radius_km: radiusKm }), 'Finding nearby travelers');
  } catch (error) {
    return { data: [] as NearbyTraveler[], error: error instanceof Error ? error : new Error('Unable to find nearby travelers.') };
  }
  const { data, error } = response;
  return { data: (data ?? []) as NearbyTraveler[], error };
}

export async function setLocationVisibility(isVisible: boolean) {
  return withRequestTimeout(supabase.rpc('set_location_visibility', { p_is_visible: isVisible }), 'Updating location visibility');
}

export async function upsertCurrentLocation(coords: { latitude: number; longitude: number; accuracy: number | null }) {
  const { data: sessionResult } = await supabase.auth.getSession();
  const userId = sessionResult.session?.user.id;
  if (!userId) {
    return { error: new Error('You are not signed in.') };
  }

  const { error } = await supabase.from('current_locations').upsert(
    {
      user_id: userId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy_m: coords.accuracy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  return { error };
}

export type LocationPermissionResult = { foreground: boolean; background: boolean };

export async function requestLocationPermissions(): Promise<LocationPermissionResult> {
  const foregroundResult = await Location.requestForegroundPermissionsAsync();
  if (foregroundResult.status !== 'granted') {
    return { foreground: false, background: false };
  }

  const backgroundResult = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: backgroundResult.status === 'granted' };
}

export async function getLocationPermissionStatus(): Promise<LocationPermissionResult> {
  const foregroundResult = await Location.getForegroundPermissionsAsync();
  const backgroundResult = await Location.getBackgroundPermissionsAsync();
  return {
    foreground: foregroundResult.status === 'granted',
    background: backgroundResult.status === 'granted',
  };
}

type TrackingMode = 'balanced' | 'precise' | 'sos';

const TRACKING_OPTIONS: Record<TrackingMode, Location.LocationTaskOptions> = {
  balanced: { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 50 },
  precise: { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 5 },
  // Staff follow the traveler live during an SOS, so report every ~5 s even when standing still.
  sos: { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 0 },
};

// The mode the running task was started with (null = unknown or not started).
let trackingMode: TrackingMode | null = null;
// What the map last asked for; SOS overrides it and restores it afterwards.
let preferredPrecise: boolean | null = null;
let sosActive = false;
let wasTrackingBeforeSos = false;

// Expo Go can't run background location (not at all on Android), so skip it there;
// the foreground heartbeat still keeps our position fresh while the app is open.
const backgroundLocationSupported = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// Precise mode (High accuracy, ~5 m steps) is used while a pair session is
// active so the server can detect the 10 m meet-up; otherwise stay battery-friendly.
export async function startBackgroundLocationTracking(options: { precise?: boolean } = {}) {
  // Callers that don't care (Home, Warning Mode) keep whatever mode the map chose.
  preferredPrecise = options.precise ?? preferredPrecise ?? false;
  if (!backgroundLocationSupported) {
    return;
  }
  try {
    await startTracking(sosActive ? 'sos' : preferredPrecise ? 'precise' : 'balanced');
  } catch (error) {
    // Never let a tracking failure break the screen that asked for it (map, Home, Warning Mode).
    console.warn('[location] background tracking unavailable', error);
  }
}

// Switches background tracking into (or out of) the 5 s SOS mode. On the way
// out it restores whatever the map had chosen, or stops if nothing was running.
export async function setSosTracking(active: boolean) {
  if (active === sosActive || !backgroundLocationSupported) {
    sosActive = active;
    return;
  }
  sosActive = active;
  try {
    if (active) {
      wasTrackingBeforeSos = await isTrackingStarted();
      await startTracking('sos');
    } else if (wasTrackingBeforeSos) {
      await startTracking(preferredPrecise ? 'precise' : 'balanced');
    } else {
      await stopLocationTracking();
    }
  } catch (error) {
    console.warn('[location] SOS tracking unavailable', error);
  }
}

async function isTrackingStarted() {
  const registered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  return registered && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME));
}

async function startTracking(mode: TrackingMode) {
  const alreadyStarted = await isTrackingStarted();
  if (alreadyStarted && (trackingMode === mode || (trackingMode === null && mode === 'balanced'))) {
    return;
  }
  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    ...TRACKING_OPTIONS[mode],
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: mode === 'sos' ? 'PartyUp SOS active' : 'PartyUp',
      notificationBody:
        mode === 'sos'
          ? 'Sharing your live location with PartyUp staff and your trusted circle'
          : 'Sharing your location with your trusted circle & connections',
    },
  });
  trackingMode = mode;
}

export async function stopLocationTracking() {
  if (!backgroundLocationSupported || sosActive) {
    return;
  }
  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (!alreadyRegistered) {
    return;
  }
  const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  trackingMode = null;
}
