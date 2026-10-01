import LeafletMap, { MAP_STYLE_ATTRIBUTION, type LeafletMarker, type MapStyle as TileStyle } from '@/components/LeafletMap';
import WarningModeModal from '@/components/WarningModeModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  endLocationShare,
  getNearbyTravelers,
  listSharedLocations,
  requestLocationPermissions,
  restartLocationShare,
  setLocationVisibility,
  startBackgroundLocationTracking,
  upsertCurrentLocation,
  type NearbyTraveler,
  type SharedLocation,
} from '@/lib/location';
import { createOrGetDirectThread, getFriendRequestStatuses, respondToFriendRequest, sendFriendRequest } from '@/lib/social';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Check, Eye, EyeOff, Layers, MapPin, Navigation, Shield, UserPlus, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

type RequestStatus = 'incoming_pending' | 'outgoing_pending' | 'accepted' | null;

type Traveler = NearbyTraveler & {
  request_status: RequestStatus;
  request_id: string | null;
};

type PermissionState = { foreground: boolean; background: boolean };

const DEFAULT_DELTA = 0.06;
const MAP_STYLE_STORAGE_KEY = 'partyup.mapStyle';
// 'default' is the native map: Google Maps on Android, Apple Maps on iOS.
type MapStyle = 'default' | TileStyle;
// Google Maps renders black in Expo Go on Android, so it's only offered in real builds there.
const DEFAULT_MAP_AVAILABLE = Platform.OS !== 'android' || Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
const ALL_MAP_STYLES: { value: MapStyle; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'plain', label: 'Plain' },
  { value: 'streets', label: 'Streets' },
  { value: 'satellite', label: 'Satellite' },
  { value: 'terrain', label: 'Terrain' },
];
const MAP_STYLES = ALL_MAP_STYLES.filter((option) => option.value !== 'default' || DEFAULT_MAP_AVAILABLE);
// Apple Maps has no terrain layer, so iOS shows its standard map for it.
const IOS_MAP_TYPE = { default: 'standard', plain: 'mutedStandard', streets: 'standard', satellite: 'hybrid', terrain: 'standard' } as const;
const POLL_INTERVAL_MS = 45000;

export default function MapScreen() {
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const myUserId = session?.user.id ?? null;
  // Set when arriving from an SOS alert: center the map on that person.
  const params = useLocalSearchParams<{ focus?: string; lat?: string; lng?: string }>();

  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region | null>(null);
  const [myPosition, setMyPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [travelers, setTravelers] = useState<Traveler[]>([]);
  const [shared, setShared] = useState<SharedLocation[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [livePositions, setLivePositions] = useState<Record<string, { latitude: number; longitude: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningModeVisible, setWarningModeVisible] = useState(false);
  const [locationUnavailable, setLocationUnavailable] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>(DEFAULT_MAP_AVAILABLE ? 'default' : 'plain');
  const [stylePickerOpen, setStylePickerOpen] = useState(false);

  const channelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const mapRef = useRef<MapView>(null);
  const namesRef = useRef<Map<string, string>>(new Map());

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F7F8FB]';
  const mapShellBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-black/5 bg-[#EAF0F5]';
  const infoCardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#B8C7FA] bg-[#F4F7FF]';
  const travelerCardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#EBEFF7] bg-white';
  const primaryText = isDark ? 'text-white' : 'text-[#17233F]';
  const secondaryText = isDark ? 'text-[#94A3B8]' : 'text-[#64708A]';

  useEffect(() => {
    AsyncStorage.getItem(MAP_STYLE_STORAGE_KEY)
      .then((saved) => {
        if (MAP_STYLES.some((option) => option.value === saved)) {
          setMapStyle(saved as MapStyle);
        }
      })
      .catch(() => {});
  }, []);

  function chooseMapStyle(next: MapStyle) {
    setMapStyle(next);
    setStylePickerOpen(false);
    AsyncStorage.setItem(MAP_STYLE_STORAGE_KEY, next).catch(() => {});
  }

  const loadShared = useCallback(async () => {
    const { data, error } = await listSharedLocations();
    if (!error) {
      setShared(data);
    }
  }, []);

  const loadNearby = useCallback(async () => {
    void loadShared();
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
  }, [loadShared]);

  const requestPermissions = useCallback(async () => {
    const result = await requestLocationPermissions();
    setPermission(result);
    return result;
  }, []);

  const fetchPosition = useCallback(async () => {
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
      setLocationUnavailable(false);
      return true;
    } catch {
      // Most commonly the device's Location Services (GPS) are turned off.
      setLocationUnavailable(true);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const result = await requestPermissions();
      if (cancelled || !result.foreground) {
        setLoading(false);
        return;
      }

      await fetchPosition();
      if (cancelled) {
        return;
      }

      await startBackgroundLocationTracking();
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestPermissions, fetchPosition]);

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
    const friendIds = new Set(shared.map((person) => person.user_id));
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
        .channel(uniqueChannelName(`location:${id}`))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'current_locations', filter: `user_id=eq.${id}` }, (payload) => {
          const next = payload.new as { latitude: number; longitude: number };
          setLivePositions((current) => ({ ...current, [id]: { latitude: next.latitude, longitude: next.longitude } }));
        })
        .subscribe();
      channels.set(id, channel);
    }
  }, [shared]);

  useEffect(() => {
    for (const person of [...shared, ...travelers]) {
      namesRef.current.set(person.user_id, person.display_name);
    }
  }, [shared, travelers]);

  // Pair sessions starting/ending (e.g. auto-off when two people meet within 10 m).
  useEffect(() => {
    if (!myUserId) {
      return;
    }
    const onChange = (payload: { new: Record<string, unknown> }) => {
      const next = payload.new as { user_a?: string; user_b?: string; status?: string; ended_reason?: string | null };
      if (next.status === 'ended' && next.ended_reason === 'proximity') {
        const otherId = next.user_a === myUserId ? next.user_b : next.user_a;
        const name = (otherId && namesRef.current.get(otherId)) ?? 'your match';
        setBanner(`You met up with ${name} — location sharing turned off for privacy.`);
      }
      void loadNearby();
    };
    const channel = supabase
      .channel(uniqueChannelName(`pair-sessions:${myUserId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_pair_sessions', filter: `user_a=eq.${myUserId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'location_pair_sessions', filter: `user_b=eq.${myUserId}` }, onChange)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myUserId, loadNearby]);

  // Track precisely only while a pair session is active, so the 10 m meet-up can be detected.
  const hasActivePair = shared.some((person) => person.share_kind === 'pair');
  useEffect(() => {
    if (!permission?.foreground || loading) {
      return;
    }
    void startBackgroundLocationTracking({ precise: hasActivePair });
  }, [hasActivePair, permission?.foreground, loading]);

  // Android draws every style except the native Google map with Leaflet.
  const useLeaflet = Platform.OS === 'android' && mapStyle !== 'default';

  const focusLat = Number(params.lat);
  const focusLng = Number(params.lng);
  const focus = params.lat && params.lng && Number.isFinite(focusLat) && Number.isFinite(focusLng) ? { latitude: focusLat, longitude: focusLng } : null;

  const sharedMarkers = useMemo<LeafletMarker[]>(
    () =>
      shared.map((person) => ({
        id: person.user_id,
        ...(livePositions[person.user_id] ?? { latitude: person.latitude, longitude: person.longitude }),
        title: person.display_name,
        subtitle: person.share_kind === 'trusted' ? 'Trusted circle' : 'Sharing until you meet',
        color: person.share_kind === 'trusted' ? '#7C3AED' : '#179B67',
      })),
    [shared, livePositions]
  );

  useEffect(() => {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    if (useLeaflet || !region || !params.lat || !params.lng || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }
    mapRef.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
  }, [params.lat, params.lng, region, useLeaflet]);

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
      void loadShared();
    }
    setTravelers((current) =>
      current.map((item) =>
        item.user_id === traveler.user_id
          ? { ...item, request_status: traveler.request_status === 'incoming_pending' ? 'accepted' : 'outgoing_pending', request_id: data?.id ?? item.request_id }
          : item
      )
    );
  }

  async function handleShareToggle(userId: string, currentlySharing: boolean) {
    setSharingId(userId);
    setErrorMessage(null);
    const { error } = currentlySharing ? await endLocationShare(userId) : await restartLocationShare(userId);
    setSharingId(null);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    await loadNearby();
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
              {useLeaflet ? (
                // Leaflet in a WebView needs no Maps SDK or key, so it works in Expo Go too.
                <LeafletMap
                  // A fresh page per style, so the chosen tiles are baked in rather than swapped by injected JS.
                  key={mapStyle}
                  mapStyle={mapStyle}
                  initialCenter={region}
                  myPosition={myPosition}
                  radiusM={5000}
                  markers={sharedMarkers}
                  focus={focus}
                  isDark={isDark}
                  onMarkerPress={setSelectedId}
                />
              ) : (
                <MapView
                  ref={mapRef}
                  // Android only reads userInterfaceStyle when the map is created, so remount on theme change.
                  key={Platform.OS === 'android' ? (isDark ? 'dark' : 'light') : 'map'}
                  style={{ flex: 1 }}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  initialRegion={region}
                  mapType={Platform.OS === 'android' ? 'standard' : IOS_MAP_TYPE[mapStyle]}
                  showsUserLocation
                  showsMyLocationButton={false}
                  userInterfaceStyle={isDark ? 'dark' : 'light'}>
                  {myPosition && <Circle center={myPosition} radius={5000} strokeColor="rgba(34,70,199,0.35)" fillColor="rgba(34,70,199,0.08)" />}
                  {sharedMarkers.map((marker) => (
                    <Marker
                      key={marker.id}
                      coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
                      title={marker.title}
                      description={marker.subtitle}
                      pinColor={marker.color}
                      onPress={() => setSelectedId(marker.id)}
                    />
                  ))}
                </MapView>
              )}

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

              <TouchableOpacity
                onPress={() => setStylePickerOpen((open) => !open)}
                className={`absolute right-3 top-[124px] h-12 w-12 items-center justify-center rounded-full shadow-sm ${isDark ? 'bg-[#111B2E] shadow-black/20' : 'bg-white shadow-black/15'}`}
                accessibilityLabel="Change map style">
                <Layers size={20} color={stylePickerOpen ? '#2246C7' : '#65728B'} />
              </TouchableOpacity>

              {stylePickerOpen && (
                <View className={`absolute right-[68px] top-[124px] overflow-hidden rounded-2xl shadow-md ${isDark ? 'bg-[#111B2E] shadow-black/30' : 'bg-white shadow-black/15'}`}>
                  {MAP_STYLES.map((option) => {
                    const active = option.value === mapStyle;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => chooseMapStyle(option.value)}
                        className={`flex-row items-center justify-between gap-4 px-4 py-3 ${active ? (isDark ? 'bg-[#1B2A45]' : 'bg-[#EEF3FF]') : ''}`}>
                        <Text className={`text-[14px] ${active ? 'font-bold text-[#2246C7]' : primaryText}`}>{option.label}</Text>
                        {active ? <Check size={16} color="#2246C7" /> : <View style={{ width: 16 }} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {useLeaflet && (
                <View className={`absolute bottom-3 left-3 right-3 rounded-full px-2 py-1 shadow-sm ${isDark ? 'bg-[#0F172A]/80 shadow-black/20' : 'bg-white/80 shadow-black/10'}`}>
                  <Text numberOfLines={1} className={`text-[11px] ${secondaryText}`}>{MAP_STYLE_ATTRIBUTION[mapStyle]}</Text>
                </View>
              )}
            </>
          ) : locationUnavailable ? (
            <View className="flex-1 items-center justify-center gap-3 px-6">
              <MapPin size={28} color="#65728B" />
              <Text className={`text-center text-[15px] ${secondaryText}`}>Couldn&apos;t get your location — check that Location Services is turned on.</Text>
              <View className="flex-row gap-3">
                <TouchableOpacity onPress={() => void fetchPosition()} className="rounded-full bg-[#2246C7] px-5 py-2.5">
                  <Text className="font-semibold text-white">Try Again</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void Linking.openSettings()} className="rounded-full border border-[#2246C7] px-5 py-2.5">
                  <Text className="font-semibold text-[#2246C7]">Open Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
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

        {banner && (
          <View className="mt-4 flex-row items-start gap-2 rounded-[16px] border border-[#179B67]/30 bg-[#E7F6EF] px-4 py-3">
            <Check size={16} color="#179B67" />
            <Text className="flex-1 text-[13px] leading-5 text-[#0F6B47]">{banner}</Text>
            <TouchableOpacity onPress={() => setBanner(null)} accessibilityLabel="Dismiss">
              <X size={16} color="#0F6B47" />
            </TouchableOpacity>
          </View>
        )}

        <View className={`mt-4 gap-2 rounded-[20px] border px-4 py-4 ${infoCardBackground}`}>
          <View className="flex-row items-start gap-2">
            <Shield size={16} color="#7C3AED" />
            <Text className="flex-1 text-[14px] leading-5 text-[#2246C7]">Only your trusted circle sees you 24/7.</Text>
          </View>
          <View className="flex-row items-start gap-2">
            <Navigation size={16} color="#179B67" />
            <Text className="flex-1 text-[14px] leading-5 text-[#2246C7]">Connected travelers see you until you meet (within 10 m), then sharing turns off automatically.</Text>
          </View>
        </View>

        {shared.length > 0 && (
          <>
            <Text className={`mt-5 text-[18px] font-bold ${primaryText}`}>Sharing with you</Text>
            <View className="mt-3 gap-2">
              {shared.map((person) => (
                <TouchableOpacity
                  key={person.user_id}
                  onPress={() => {
                    setSelectedId(person.user_id);
                    const position = livePositions[person.user_id] ?? { latitude: person.latitude, longitude: person.longitude };
                    mapRef.current?.animateToRegion({ ...position, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
                  }}
                  className={`flex-row items-center justify-between gap-3 rounded-[16px] border px-4 py-3 ${travelerCardBackground}`}>
                  <View className="flex-1 flex-row items-center gap-3">
                    <View className={`h-3 w-3 rounded-full ${person.share_kind === 'trusted' ? 'bg-[#7C3AED]' : 'bg-[#179B67]'}`} />
                    <View className="flex-1">
                      <Text className={`text-[15px] font-semibold ${primaryText}`}>{person.display_name}</Text>
                      <Text className={`text-[13px] ${secondaryText}`}>
                        {person.share_kind === 'trusted' ? 'Trusted circle · always visible' : 'Sharing until you meet'}
                        {person.distance_m != null ? ` · ${formatDistance(person.distance_m)}` : ''}
                      </Text>
                    </View>
                  </View>
                  {person.share_kind === 'pair' && (
                    <TouchableOpacity
                      onPress={() => void handleShareToggle(person.user_id, true)}
                      disabled={sharingId === person.user_id}
                      className="rounded-full border border-[#D93025]/40 px-3 py-1.5">
                      {sharingId === person.user_id ? <ActivityIndicator color="#D93025" /> : <Text className="text-[12px] font-semibold text-[#D93025]">Stop sharing</Text>}
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {errorMessage && <Text className="mt-3 text-[13px] text-[#D93025]">{errorMessage}</Text>}

        <Text className={`mt-5 text-headline-28 font-bold ${primaryText}`}>Nearby Travelers</Text>

        <View className="mt-5 gap-3">
          {travelers.length === 0 ? (
            <Text className={`text-[14px] ${secondaryText}`}>{permission?.foreground ? 'No travelers within 5 km right now.' : 'Enable location to find nearby travelers.'}</Text>
          ) : (
            travelers.map((traveler) => {
              const isSelected = (selectedId ?? params.focus) === traveler.user_id;
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
                      {isMatched && traveler.share_kind === 'trusted' ? (
                        <View className="flex-row items-center gap-2">
                          <Shield size={14} color="#7C3AED" />
                          <Text className="text-[13px] text-[#2246C7]">Trusted circle — you always see each other</Text>
                        </View>
                      ) : isMatched && traveler.share_kind === 'pair' ? (
                        <View className="flex-row items-center gap-2">
                          <MapPin size={14} color="#2246C7" />
                          <Text className="text-[13px] text-[#2246C7]">Sharing live location until you meet</Text>
                        </View>
                      ) : isMatched ? (
                        <TouchableOpacity
                          onPress={() => void handleShareToggle(traveler.user_id, false)}
                          disabled={sharingId === traveler.user_id}
                          className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#179B67] py-3">
                          {sharingId === traveler.user_id ? (
                            <ActivityIndicator color="#FFFFFF" />
                          ) : (
                            <>
                              <Navigation size={16} color="#FFFFFF" />
                              <Text className="font-bold text-white">Share location again</Text>
                            </>
                          )}
                        </TouchableOpacity>
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

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`;
}
