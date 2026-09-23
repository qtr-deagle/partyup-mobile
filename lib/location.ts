import { withRequestTimeout } from '@/lib/social';
import { supabase } from '@/lib/supabase';
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

let trackingPrecise: boolean | null = null;

// Precise mode (High accuracy, ~5 m steps) is used while a pair session is
// active so the server can detect the 10 m meet-up; otherwise stay battery-friendly.
export async function startBackgroundLocationTracking(options: { precise?: boolean } = {}) {
  // Callers that don't care (Home, Warning Mode) keep whatever mode the map chose.
  const precise = options.precise ?? trackingPrecise ?? false;
  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  const alreadyStarted = alreadyRegistered && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME));
  if (alreadyStarted && (trackingPrecise === precise || (trackingPrecise === null && !precise))) {
    return;
  }
  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced,
    timeInterval: precise ? 10000 : 30000,
    distanceInterval: precise ? 5 : 50,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'PartyUp',
      notificationBody: 'Sharing your location with your trusted circle & connections',
    },
  });
  trackingPrecise = precise;
}

export async function stopLocationTracking() {
  const alreadyRegistered = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
  if (!alreadyRegistered) {
    return;
  }
  const isStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  if (isStarted) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }
  trackingPrecise = null;
}
