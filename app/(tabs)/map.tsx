import WarningModeModal from '@/components/WarningModeModal';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getNearbyTravelers, requestLocationPermissions, setLocationVisibility, startBackgroundLocationTracking, upsertCurrentLocation, type NearbyTraveler } from '@/lib/location';
import { createOrGetDirectThread, getFriendRequestStatuses, respondToFriendRequest, sendFriendRequest } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { Check, Eye, EyeOff, MapPin, Shield, UserPlus, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, UrlTile, type Region } from 'react-native-maps';

type RequestStatus = 'incoming_pending' | 'outgoing_pending' | 'accepted' | null;

type Traveler = NearbyTraveler & {
  request_status: RequestStatus;
  request_id: string | null;
};

type PermissionState = { foreground: boolean; background: boolean };

const DEFAULT_DELTA = 0.06;
const POLL_INTERVAL_MS = 45000;

export default function MapScreen() {
  const isDark = useColorScheme() === 'dark';

  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [myPosition, setMyPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [livePositions, setLivePositions] = useState<Record<string, { latitude: number; longitude: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningModeVisible, setWarningModeVisible] = useState(false);

  const channelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F7F8FB]';
  const mapShellBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-black/5 bg-[#EAF0F5]';
  const infoCardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#B8C7FA] bg-[#F4F7FF]';
  const travelerCardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#EBEFF7] bg-white';
  const primaryText = isDark ? 'text-white' : 'text-[#17233F]';
  const secondaryText = isDark ? 'text-[#94A3B8]' : 'text-[#64708A]';

  const loadNearby = useCallback(async () => {
    const { data, error } = await getNearbyTravelers(5);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setErrorMessage(null);

    const statuses = await getFriendRequestStatuses(data.map((traveler) => traveler.user_id));
    setTravelers(
      data.map((traveler) => ({
        ...traveler,
        request_status: traveler.is_friend ? 'accepted' : (statuses.get(traveler.user_id)?.status ?? null),
        request_id: statuses.get(traveler.user_id)?.requestId ?? null,
      }))
    );
  }, []);

  const requestPermissions = useCallback(async () => {
    const result = await requestLocationPermissions();
    setPermission(result);
    return result;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await requestPermissions();
      if (cancelled || !result.foreground) {
        setLoading(false);
        return;
      }

      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) {
          return;
        }
        setMyPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setRegion({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: DEFAULT_DELTA,
          longitudeDelta: DEFAULT_DELTA,
        });
        await upsertCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      } catch {
        // Background task will populate the location shortly.
      }

      await startBackgroundLocationTracking();
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestPermissions]);

  useFocusEffect(
    useCallback(() => {
      if (!permission?.foreground) {
        return;
      }
      void loadNearby();
      const intervalId = setInterval(() => void loadNearby(), POLL_INTERVAL_MS);
      return () => clearInterval(intervalId);
    }, [permission?.foreground, loadNearby])
  );

  useEffect(() => {
    const friendIds = new Set(travelers.filter((traveler) => traveler.request_status === 'accepted').map((traveler) => traveler.user_id));
    const channels = channelsRef.current;

    for (const [id, channel] of channels) {
      if (!friendIds.has(id)) {
        supabase.removeChannel(channel);
        channels.delete(id);
      }
    }

    for (const id of friendIds) {
      if (channels.has(id)) {
        continue;
      }
      const channel = supabase
        .channel(`location:${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'current_locations', filter: `user_id=eq.${id}` }, (payload) => {
          const next = payload.new as { latitude: number; longitude: number };
          setLivePositions((current) => ({ ...current, [id]: { latitude: next.latitude, longitude: next.longitude } }));
        })
        .subscribe();
      channels.set(id, channel);
    }
  }, [travelers]);

  useEffect(() => {
    const channels = channelsRef.current;
    return () => {
      for (const channel of channels.values()) {
        supabase.removeChannel(channel);
      }
      channels.clear();
    };
  }, []);

  async function handleToggleVisibility() {
    const next = !isVisible;
    setIsVisible(next);
    const { error } = await setLocationVisibility(next);
    if (error) {
      setIsVisible(!next);
      setErrorMessage(error.message);
    }
  }

  async function handleConnect(traveler: Traveler) {
    setRequestingId(traveler.user_id);
    setErrorMessage(null);

    if (traveler.request_status === 'outgoing_pending' && traveler.request_id) {
      const requestId = traveler.request_id;
      Alert.alert('Cancel friend request?', `Cancel your request to ${traveler.display_name}?`, [
        { text: 'Keep request', style: 'cancel', onPress: () => setRequestingId(null) },
        { text: 'Cancel request', style: 'destructive', onPress: () => void cancelRequest(traveler.user_id, requestId) },
      ]);
      return;
    }

    const { data, error } =
      traveler.request_status === 'incoming_pending' && traveler.request_id
        ? await respondToFriendRequest(traveler.request_id, 'accepted')
        : await sendFriendRequest(traveler.user_id);
    setRequestingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (traveler.request_status === 'incoming_pending') {
      await createOrGetDirectThread(traveler.user_id);
    }
    setTravelers((current) =>
      current.map((item) =>
        item.user_id === traveler.user_id
          ? { ...item, request_status: traveler.request_status === 'incoming_pending' ? 'accepted' : 'outgoing_pending', request_id: data?.id ?? item.request_id }
          : item
      )
    );
  }

  async function cancelRequest(travelerId: string, requestId: string) {
    const { error } = await respondToFriendRequest(requestId, 'cancelled');
    setRequestingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setTravelers((current) => current.map((item) => (item.user_id === travelerId ? { ...item, request_status: null, request_id: null } : item)));
  }

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className="px-4 pt-4">
        <View className={`relative h-[380px] overflow-hidden rounded-[28px] border shadow-sm ${mapShellBackground} ${isDark ? 'shadow-black/20' : 'shadow-black/5'}`}>
          {!permission?.foreground ? (
            <View className="flex-1 items-center justify-center gap-3 px-6">
              <MapPin size={28} color="#65728B" />
              <Text className={`text-center text-[15px] ${secondaryText}`}>
                {loading ? 'Checking location access…' : 'Enable location to see nearby travelers within 5 km.'}
              </Text>
              {!loading && (
                <View className="flex-row gap-3">
                  <TouchableOpacity onPress={() => void requestPermissions()} className="rounded-full bg-[#2246C7] px-5 py-2.5">
                    <Text className="font-semibold text-white">Enable Location</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void Linking.openSettings()} className="rounded-full border border-[#2246C7] px-5 py-2.5">
                    <Text className="font-semibold text-[#2246C7]">Open Settings</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : region ? (
            <>
              <MapView
                style={{ flex: 1 }}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                initialRegion={region}
                showsUserLocation
                showsMyLocationButton={false}
                userInterfaceStyle={isDark ? 'dark' : 'light'}>
                {Platform.OS === 'android' && (
                  <UrlTile
                    urlTemplate={
                      isDark
                        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                    }
                    maximumZ={19}
                    flipY={false}
                  />
                )}
                {myPosition && <Circle center={myPosition} radius={5000} strokeColor="rgba(34,70,199,0.35)" fillColor="rgba(34,70,199,0.08)" />}
                {travelers
                  .filter((traveler) => traveler.request_status === 'accepted')
                  .map((traveler) => {
                    const position =
                      livePositions[traveler.user_id] ??
                      (traveler.latitude != null && traveler.longitude != null ? { latitude: traveler.latitude, longitude: traveler.longitude } : null);
                    if (!position) {
                      return null;
                    }
                    return <Marker key={traveler.user_id} coordinate={position} title={traveler.display_name} pinColor="#179B67" onPress={() => setSelectedId(traveler.user_id)} />;
                  })}
              </MapView>

              <TouchableOpacity
                onPress={() => void handleToggleVisibility()}
                className={`absolute right-3 top-3 h-12 w-12 items-center justify-center rounded-full shadow-sm ${isDark ? 'bg-[#111B2E] shadow-black/20' : 'bg-white shadow-black/15'}`}>
                {isVisible ? <EyeOff size={20} color="#65728B" /> : <Eye size={20} color="#65728B" />}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setWarningModeVisible(true)}
                className="absolute right-3 top-[68px] h-12 w-12 items-center justify-center rounded-full bg-[#E32727] shadow-sm shadow-black/20"
                accessibilityLabel="Activate Warning Mode">
                <Shield size={20} color="#FFFFFF" />
              </TouchableOpacity>

              {Platform.OS === 'android' && (
                <View className={`absolute bottom-3 left-3 right-3 rounded-full px-2 py-1 shadow-sm ${isDark ? 'bg-[#0F172A]/80 shadow-black/20' : 'bg-white/80 shadow-black/10'}`}>
                  <Text className={`text-[11px] ${secondaryText}`}>© OpenStreetMap contributors © CARTO</Text>
                </View>
              )}
            </>
          ) : (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#2246C7" />
            </View>
          )}
        </View>

        {permission?.foreground && !permission.background && (
          <View className={`mt-3 rounded-[16px] border px-4 py-3 ${infoCardBackground}`}>
            <Text className="text-[13px] leading-5 text-[#2246C7]">
              Turn on &quot;Always Allow&quot; location so matched friends see your position even when the app is in the background.
            </Text>
            <View className="mt-2 flex-row gap-4">
              <TouchableOpacity onPress={() => void requestPermissions()}>
                <Text className="text-[13px] font-semibold text-[#2246C7]">Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void Linking.openSettings()}>
                <Text className="text-[13px] font-semibold text-[#2246C7]">Open Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View className={`mt-4 rounded-[20px] border px-4 py-4 ${infoCardBackground}`}>
          <View className="flex-row items-start gap-2">
            <Text className="text-[#2246C7]">✓</Text>
            <Text className="flex-1 text-[15px] leading-6 text-[#2246C7]">Your location is hidden until you match with someone</Text>
          </View>
        </View>

        {errorMessage && <Text className="mt-3 text-[13px] text-[#D93025]">{errorMessage}</Text>}

        <Text className={`mt-5 text-[28px] font-black ${primaryText}`}>Nearby Travelers</Text>

        <View className="mt-5 gap-3">
          {travelers.length === 0 ? (
            <Text className={`text-[14px] ${secondaryText}`}>{permission?.foreground ? 'No travelers within 5 km right now.' : 'Enable location to find nearby travelers.'}</Text>
          ) : (
            travelers.map((traveler) => {
              const isSelected = selectedId === traveler.user_id;
              const isMatched = traveler.request_status === 'accepted';

              return (
                <TouchableOpacity
                  key={traveler.user_id}
                  onPress={() => setSelectedId(traveler.user_id)}
                  className={`rounded-[18px] border px-4 py-4 shadow-sm ${travelerCardBackground} ${isDark ? 'shadow-black/20' : 'shadow-black/5'}`}>
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-row items-center gap-3 flex-1">
                      <View className={`h-4 w-4 rounded-full ${isMatched ? 'bg-[#179B67]' : 'bg-[#C4CDEB]'}`} />
                      <View>
                        <Text className={`text-[16px] font-semibold ${primaryText}`}>{traveler.display_name}</Text>
                        <Text className={`text-[14px] ${secondaryText}`}>{traveler.distance_km} km</Text>
                      </View>
                    </View>

                    {isMatched ? (
                      <View className="rounded-full bg-[#E7F6EF] px-3 py-1.5">
                        <Text className="text-[14px] font-semibold text-[#179B67]">✓ Matched</Text>
                      </View>
                    ) : traveler.request_status === 'outgoing_pending' ? (
                      <View className="rounded-full bg-[#EEF1F8] px-3 py-1.5">
                        <Text className="text-[13px] font-semibold text-[#64708A]">Requested</Text>
                      </View>
                    ) : traveler.request_status === 'incoming_pending' ? (
                      <View className="rounded-full bg-[#E9EEFF] px-3 py-1.5">
                        <Text className="text-[13px] font-semibold text-[#2246C7]">Wants to connect</Text>
                      </View>
                    ) : (
                      <View className="h-2.5 w-2.5 rounded-full bg-transparent" />
                    )}
                  </View>

                  {isSelected && (
                    <View className={`mt-3 rounded-2xl px-3 py-2 ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F7FF]'}`}>
                      {isMatched ? (
                        <View className="flex-row items-center gap-2">
                          <MapPin size={14} color="#2246C7" />
                          <Text className="text-[13px] text-[#2246C7]">Live proximity updated for {traveler.display_name}</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => void handleConnect(traveler)}
                          disabled={requestingId === traveler.user_id}
                          className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#2246C7] py-3">
                          {requestingId === traveler.user_id ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <>
                              {traveler.request_status === 'outgoing_pending' ? (
                                <X size={16} color="#FFFFFF" />
                              ) : traveler.request_status === 'incoming_pending' ? (
                                <Check size={16} color="#FFFFFF" />
                              ) : (
                                <UserPlus size={16} color="#FFFFFF" />
                              )}
                              <Text className="font-bold text-white">
                                {traveler.request_status === 'outgoing_pending' ? 'Cancel request' : traveler.request_status === 'incoming_pending' ? 'Confirm connection' : 'Request to Connect'}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>
      <WarningModeModal visible={warningModeVisible} onClose={() => setWarningModeVisible(false)} isDark={isDark} />
    </ScrollView>
  );
}
