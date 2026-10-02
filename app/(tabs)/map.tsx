import LeafletMap, { MAP_STYLE_ATTRIBUTION, type LeafletMapHandle, type LeafletMarker, type MapStyle as TileStyle } from '@/components/LeafletMap';
import AvatarPin, { ClusterPin, MeetupPin } from '@/components/map/AvatarPin';
import MapBottomSheet, { SHEET_PEEK_HEIGHT, type MapBottomSheetHandle } from '@/components/map/MapBottomSheet';
import PersonCard, { MeetupCard, type PersonCardData } from '@/components/map/PersonCard';
import { riseIn } from '@/components/ui/motion';
import WarningModeModal from '@/components/WarningModeModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/hooks/auth-provider';
import { getTripDetail } from '@/lib/carpool';
import { getActiveTripSummary } from '@/lib/homeDashboard';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Eye, EyeOff, Info, Layers, LocateFixed, MapPin, Minus, Navigation, Plus, Shield, UserPlus, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Circle, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Animated, { FadeOut, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

type RequestStatus = 'incoming_pending' | 'outgoing_pending' | 'accepted' | null;

type Traveler = NearbyTraveler & {
  request_status: RequestStatus;
  request_id: string | null;
};

type PermissionState = { foreground: boolean; background: boolean };

type TripMeetup = { tripId: string; tripTitle: string; label: string; latitude: number; longitude: number };

type LatLng = { latitude: number; longitude: number };
type PinGroup = { key: string; ids: string[]; latitude: number; longitude: number };

const CLUSTER_PX = 46;

// Greedy grouping of pins closer than CLUSTER_PX on screen; the selected person keeps their own pin.
function clusterPins(pins: (LatLng & { id: string })[], region: Region | null, mapWidth: number, selectedId: string | null): PinGroup[] {
  const singles = (list: typeof pins) => list.map((pin) => ({ key: pin.id, ids: [pin.id], latitude: pin.latitude, longitude: pin.longitude }));
  if (!region || mapWidth <= 0 || region.longitudeDelta < 0.0015) {
    return singles(pins);
  }
  const pxPerLng = mapWidth / region.longitudeDelta;
  const pxPerLat = pxPerLng / Math.cos((region.latitude * Math.PI) / 180);
  const used = new Set<string>();
  const groups: PinGroup[] = [];
  for (const pin of pins) {
    if (used.has(pin.id)) {
      continue;
    }
    used.add(pin.id);
    const members = [pin];
    if (pin.id !== selectedId) {
      for (const other of pins) {
        if (used.has(other.id) || other.id === selectedId) {
          continue;
        }
        const dx = (other.longitude - pin.longitude) * pxPerLng;
        const dy = (other.latitude - pin.latitude) * pxPerLat;
        if (Math.hypot(dx, dy) < CLUSTER_PX) {
          used.add(other.id);
          members.push(other);
        }
      }
    }
    groups.push({
      key: members.map((member) => member.id).join(','),
      ids: members.map((member) => member.id),
      latitude: members.reduce((sum, member) => sum + member.latitude, 0) / members.length,
      longitude: members.reduce((sum, member) => sum + member.longitude, 0) / members.length,
    });
  }
  return groups;
}

function distanceMeters(a: LatLng, b: LatLng) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

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
const TRUSTED_COLOR = '#7C3AED';
const PAIR_COLOR = '#179B67';

type Filter = 'all' | 'trusted' | 'matched' | 'nearby';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'trusted', label: 'Trusted' },
  { value: 'matched', label: 'Matched' },
  { value: 'nearby', label: 'Nearby' },
];

export default function MapScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
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
  const [visibilityToast, setVisibilityToast] = useState<{ id: number; message: string } | null>(null);
  const visibilityToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningModeVisible, setWarningModeVisible] = useState(false);
  const [locationUnavailable, setLocationUnavailable] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>(DEFAULT_MAP_AVAILABLE ? 'default' : 'plain');
  const [stylePickerOpen, setStylePickerOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [nativeRegion, setNativeRegion] = useState<Region | null>(null);
  const [meetup, setMeetup] = useState<TripMeetup | null>(null);
  const [meetupSelected, setMeetupSelected] = useState(false);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [messagingId, setMessagingId] = useState<string | null>(null);

  const channelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const mapRef = useRef<MapView>(null);
  const leafletRef = useRef<LeafletMapHandle>(null);
  const sheetRef = useRef<MapBottomSheetHandle>(null);
  // How much of the bottom sheet is showing; overlays above it follow this.
  const sheetHeight = useSharedValue(SHEET_PEEK_HEIGHT);
  const aboveSheetStyle = useAnimatedStyle(() => ({ bottom: sheetHeight.get() + 10 }));
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

  // The active trip's meetup point, if it has one.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: trip } = await getActiveTripSummary();
        if (!trip) {
          if (!cancelled) setMeetup(null);
          return;
        }
        const { data: detail } = await getTripDetail(trip.trip_id);
        if (cancelled) {
          return;
        }
        setMeetup(
          detail?.meetup_lat != null && detail.meetup_lng != null
            ? {
                tripId: trip.trip_id,
                tripTitle: trip.title,
                label: detail.meetup_landmark || detail.meetup_municipality || 'Meetup point',
                latitude: detail.meetup_lat,
                longitude: detail.meetup_lng,
              }
            : null
        );
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

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

  // Only people sharing with you have coordinates; strangers stay list-only.
  const visibleShared = useMemo(
    () => shared.filter((person) => filter === 'all' || (filter === 'trusted' ? person.share_kind === 'trusted' : filter === 'matched' && person.share_kind === 'pair')),
    [shared, filter]
  );
  const sharedIds = useMemo(() => new Set(shared.map((person) => person.user_id)), [shared]);
  const visibleTravelers = useMemo(() => {
    switch (filter) {
      case 'trusted':
        return [];
      case 'matched':
        // Matched but not currently sharing, so they can be asked to share again.
        return travelers.filter((traveler) => traveler.request_status === 'accepted' && !sharedIds.has(traveler.user_id));
      case 'nearby':
        return travelers.filter((traveler) => traveler.request_status !== 'accepted');
      default:
        return travelers;
    }
  }, [travelers, filter, sharedIds]);
  const visibleCount = new Set([...visibleShared.map((person) => person.user_id), ...visibleTravelers.map((traveler) => traveler.user_id)]).size;

  const sharedMarkers = useMemo<LeafletMarker[]>(
    () =>
      visibleShared.map((person) => ({
        id: person.user_id,
        ...(livePositions[person.user_id] ?? { latitude: person.latitude, longitude: person.longitude }),
        title: person.display_name,
        subtitle: person.share_kind === 'trusted' ? 'Trusted circle' : 'Sharing until you meet',
        color: person.share_kind === 'trusted' ? TRUSTED_COLOR : PAIR_COLOR,
        avatarUrl: person.avatar_url,
      })),
    [visibleShared, livePositions]
  );

  const selectedShared = visibleShared.find((person) => person.user_id === selectedId) ?? null;
  const selectedCard: PersonCardData | null = selectedShared
    ? {
        id: selectedShared.user_id,
        name: selectedShared.display_name,
        avatarUrl: selectedShared.avatar_url,
        kind: selectedShared.share_kind,
        color: selectedShared.share_kind === 'trusted' ? TRUSTED_COLOR : PAIR_COLOR,
        distanceLabel: selectedShared.distance_m != null ? formatDistance(selectedShared.distance_m) : null,
        updatedAt: selectedShared.updated_at,
      }
    : null;

  const leafletMeetup = useMemo(() => (meetup ? { latitude: meetup.latitude, longitude: meetup.longitude, label: meetup.label } : null), [meetup]);
  const nativeGroups = useMemo(
    () => (useLeaflet ? [] : clusterPins(sharedMarkers, nativeRegion ?? region, containerWidth, selectedId)),
    [useLeaflet, sharedMarkers, nativeRegion, region, containerWidth, selectedId]
  );
  const markersById = useMemo(() => new Map(sharedMarkers.map((marker) => [marker.id, marker])), [sharedMarkers]);

  function openCluster(ids: string[]) {
    const coordinates = ids.map((id) => markersById.get(id)).filter((marker): marker is LeafletMarker => !!marker);
    mapRef.current?.fitToCoordinates(coordinates, { edgePadding: { top: 120, right: 90, bottom: 220, left: 90 }, animated: true });
  }

  function selectMeetup() {
    if (!meetup) {
      return;
    }
    setSelectedId(null);
    setMeetupSelected(true);
    setStylePickerOpen(false);
    flyTo(meetup);
    sheetRef.current?.snapTo('peek');
  }

  function positionOf(userId: string) {
    const person = shared.find((item) => item.user_id === userId);
    return livePositions[userId] ?? (person ? { latitude: person.latitude, longitude: person.longitude } : null);
  }

  // One API over whichever map is showing.
  function flyTo(target: { latitude: number; longitude: number }) {
    if (useLeaflet) {
      leafletRef.current?.flyTo(target, 15);
    } else {
      mapRef.current?.animateToRegion({ ...target, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 600);
    }
  }

  async function zoomBy(delta: number) {
    if (useLeaflet) {
      leafletRef.current?.zoomBy(delta);
      return;
    }
    const camera = await mapRef.current?.getCamera();
    if (!camera) {
      return;
    }
    if (Platform.OS === 'ios' && camera.altitude != null) {
      mapRef.current?.animateCamera({ altitude: camera.altitude * (delta > 0 ? 0.5 : 2) }, { duration: 250 });
    } else if (camera.zoom != null) {
      mapRef.current?.animateCamera({ zoom: camera.zoom + delta }, { duration: 250 });
    }
  }

  function selectPerson(userId: string) {
    setSelectedId(userId);
    setMeetupSelected(false);
    setStylePickerOpen(false);
    const position = positionOf(userId);
    if (position) {
      flyTo(position);
      sheetRef.current?.snapTo('peek');
    }
  }

  async function handleMessage(userId: string) {
    setMessagingId(userId);
    setErrorMessage(null);
    const result = await createOrGetDirectThread(userId);
    setMessagingId(null);
    if (result.error) {
      setErrorMessage(result.error.message);
      return;
    }
    router.push({ pathname: '/(tabs)/chat', params: { threadId: String(result.data) } });
  }

  function handleDirections(userId: string) {
    const position = positionOf(userId);
    if (position) {
      void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${position.latitude},${position.longitude}`);
    }
  }

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

  function showVisibilityToast(message: string) {
    if (visibilityToastTimer.current) clearTimeout(visibilityToastTimer.current);
    setVisibilityToast({ id: Date.now(), message });
    visibilityToastTimer.current = setTimeout(() => setVisibilityToast(null), 2200);
  }

  useEffect(() => () => {
    if (visibilityToastTimer.current) clearTimeout(visibilityToastTimer.current);
  }, []);

  async function handleToggleVisibility() {
    const next = !isVisible;
    setIsVisible(next);
    showVisibilityToast(next ? 'Your location is now visible' : 'Your location is now hidden');
    const { error } = await setLocationVisibility(next);
    if (error) {
      setIsVisible(!next);
      setVisibilityToast(null);
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

  const controlBackground = isDark ? 'bg-[#111B2E] shadow-black/30' : 'bg-white shadow-black/15';
  const controlIcon = isDark ? '#CBD5E1' : '#65728B';
  const showMap = !!permission?.foreground && !!region;

  return (
    <View className={`flex-1 ${screenBackground}`} onLayout={(event) => {
        setContainerHeight(event.nativeEvent.layout.height);
        setContainerWidth(event.nativeEvent.layout.width);
      }}>
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
        <View className={`absolute inset-0 ${mapShellBackground}`}>
          {useLeaflet ? (
            // Leaflet in a WebView needs no Maps SDK or key, so it works in Expo Go too.
            <LeafletMap
              ref={leafletRef}
              // A fresh page per style, so the chosen tiles are baked in rather than swapped by injected JS.
              key={mapStyle}
              mapStyle={mapStyle}
              initialCenter={region}
              myPosition={myPosition}
              radiusM={5000}
              markers={sharedMarkers}
              meetup={leafletMeetup}
              focus={focus}
              isDark={isDark}
              selectedId={selectedId}
              onMarkerPress={selectPerson}
              onMeetupPress={selectMeetup}
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
              showsCompass={false}
              toolbarEnabled={false}
              onRegionChangeComplete={setNativeRegion}
              userInterfaceStyle={isDark ? 'dark' : 'light'}>
              {myPosition && <Circle center={myPosition} radius={5000} strokeColor="rgba(34,70,199,0.35)" fillColor="rgba(34,70,199,0.08)" />}
              {meetup && myPosition && (
                <Polyline coordinates={[myPosition, meetup]} strokeColor="#F97316" strokeWidth={3} lineDashPattern={[2, 8]} lineCap="round" />
              )}
              {meetup && <MeetupPin latitude={meetup.latitude} longitude={meetup.longitude} label={meetup.label} isDark={isDark} onPress={selectMeetup} />}
              {nativeGroups.map((group) => {
                const marker = markersById.get(group.ids[0]);
                if (group.ids.length > 1) {
                  return <ClusterPin key={`cluster:${group.key}`} latitude={group.latitude} longitude={group.longitude} count={group.ids.length} onPress={() => openCluster(group.ids)} />;
                }
                return marker ? (
                  <AvatarPin
                    key={marker.id}
                    id={marker.id}
                    latitude={marker.latitude}
                    longitude={marker.longitude}
                    name={marker.title}
                    color={marker.color}
                    avatarUrl={marker.avatarUrl}
                    selected={marker.id === selectedId}
                    isDark={isDark}
                    onPress={selectPerson}
                  />
                ) : null;
              })}
            </MapView>
          )}
        </View>
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

      {showMap && (
        <>
          <View className="absolute right-3 top-3 items-center gap-2">
            <TouchableOpacity
              onPress={() => setWarningModeVisible(true)}
              className="h-12 w-12 items-center justify-center rounded-full bg-[#E32727] shadow-sm shadow-black/20"
              accessibilityLabel="Activate Warning Mode or SOS">
              <Shield size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View className={`w-12 items-center overflow-hidden rounded-full shadow-sm ${controlBackground}`}>
              <TouchableOpacity
                onPress={() => void handleToggleVisibility()}
                className="h-12 w-12 items-center justify-center"
                accessibilityLabel={isVisible ? 'Hide my location' : 'Show my location'}>
                {isVisible ? <EyeOff size={20} color={controlIcon} /> : <Eye size={20} color={controlIcon} />}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStylePickerOpen((open) => !open)}
                className="h-12 w-12 items-center justify-center"
                accessibilityLabel="Change map style">
                <Layers size={20} color={stylePickerOpen ? '#2246C7' : controlIcon} />
              </TouchableOpacity>
              <View className={`h-px w-7 ${isDark ? 'bg-[#22324B]' : 'bg-[#E5E9F2]'}`} />
              <TouchableOpacity
                onPress={() => myPosition && flyTo(myPosition)}
                className="h-12 w-12 items-center justify-center"
                accessibilityLabel="Center on my location">
                <LocateFixed size={20} color="#2246C7" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void zoomBy(1)} className="h-12 w-12 items-center justify-center" accessibilityLabel="Zoom in">
                <Plus size={20} color={controlIcon} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void zoomBy(-1)} className="h-12 w-12 items-center justify-center" accessibilityLabel="Zoom out">
                <Minus size={20} color={controlIcon} />
              </TouchableOpacity>
            </View>
          </View>

          {visibilityToast && (
            <Animated.View
              key={`visibility-toast-${visibilityToast.id}`}
              entering={riseIn(0, 250)}
              exiting={FadeOut.duration(200)}
              pointerEvents="none"
              className="absolute left-3 right-[72px] top-3 items-center">
              <View className={`flex-row items-center gap-2 rounded-full px-4 py-2.5 shadow-sm ${isDark ? 'bg-[#111B2E] shadow-black/30' : 'bg-white shadow-black/15'}`}>
                {isVisible ? <Eye size={16} color="#2246C7" /> : <EyeOff size={16} color={controlIcon} />}
                <Text className={`text-[13px] font-semibold ${primaryText}`}>{visibilityToast.message}</Text>
              </View>
            </Animated.View>
          )}

          {stylePickerOpen && (
            <View className={`absolute right-[68px] top-[116px] overflow-hidden rounded-2xl shadow-md ${isDark ? 'bg-[#111B2E] shadow-black/30' : 'bg-white shadow-black/15'}`}>
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

          <Animated.View pointerEvents="box-none" className="absolute left-3 right-3 gap-2" style={aboveSheetStyle}>
            {selectedCard && (
              <PersonCard
                person={selectedCard}
                isDark={isDark}
                messaging={messagingId === selectedCard.id}
                stoppingShare={sharingId === selectedCard.id}
                onMessage={() => void handleMessage(selectedCard.id)}
                onDirections={() => handleDirections(selectedCard.id)}
                onStopSharing={() => void handleShareToggle(selectedCard.id, true)}
                onClose={() => setSelectedId(null)}
              />
            )}
            {meetupSelected && meetup && !selectedCard && (
              <MeetupCard
                tripTitle={meetup.tripTitle}
                label={meetup.label}
                distanceLabel={myPosition ? formatDistance(distanceMeters(myPosition, meetup)) : null}
                isDark={isDark}
                onDirections={() => void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${meetup.latitude},${meetup.longitude}`)}
                onOpenTrip={() => router.push({ pathname: '/trip/[id]', params: { id: meetup.tripId } })}
                onClose={() => setMeetupSelected(false)}
              />
            )}
            {useLeaflet && (
              // The tile providers require credit; it's tucked behind an info button instead of always showing.
              <TouchableOpacity
                onPress={() => setAttributionOpen((open) => !open)}
                accessibilityLabel="Map credits"
                className={`self-start flex-row items-center gap-1.5 rounded-full shadow-sm ${attributionOpen ? 'px-2.5 py-1' : 'h-7 w-7 justify-center'} ${isDark ? 'bg-[#0F172A]/85 shadow-black/30' : 'bg-white/90 shadow-black/10'}`}>
                <Info size={14} color={controlIcon} />
                {attributionOpen && <Text numberOfLines={1} className={`text-[10px] ${secondaryText}`}>{MAP_STYLE_ATTRIBUTION[mapStyle]}</Text>}
              </TouchableOpacity>
            )}
          </Animated.View>
        </>
      )}

      {showMap && containerHeight > 0 && (
        <MapBottomSheet
          ref={sheetRef}
          containerHeight={containerHeight}
          visibleHeight={sheetHeight}
          isDark={isDark}
          header={
            <View className="flex-row items-center justify-between">
              <Text className={`text-[18px] font-bold ${primaryText}`}>
                {filter === 'all' ? 'People around you' : `${FILTERS.find((option) => option.value === filter)?.label} travelers`}
              </Text>
              <Text className={`text-[13px] font-semibold ${secondaryText}`}>{visibleCount} within 5 km</Text>
            </View>
          }
          toolbar={
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4">
              {FILTERS.map((option) => {
                const active = option.value === filter;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setFilter(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`rounded-full border px-4 py-1.5 ${active ? 'border-[#2246C7] bg-[#2246C7]' : isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E1E6F0] bg-white'}`}>
                    <Text className={`text-[13px] font-bold ${active ? 'text-white' : primaryText}`}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          }>
          {permission?.foreground && !permission.background && (
            <View className={`mt-1 rounded-[16px] border px-4 py-3 ${infoCardBackground}`}>
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
            <View className="mt-3 flex-row items-start gap-2 rounded-[16px] border border-[#179B67]/30 bg-[#E7F6EF] px-4 py-3">
              <Check size={16} color="#179B67" />
              <Text className="flex-1 text-[13px] leading-5 text-[#0F6B47]">{banner}</Text>
              <TouchableOpacity onPress={() => setBanner(null)} accessibilityLabel="Dismiss">
                <X size={16} color="#0F6B47" />
              </TouchableOpacity>
            </View>
          )}

          {errorMessage && <Text className="mt-3 text-[13px] text-[#D93025]">{errorMessage}</Text>}

          {visibleShared.length > 0 && (
            <>
              <Text className={`mt-4 text-[15px] font-bold ${primaryText}`}>Sharing with you</Text>
              <View className="mt-2 gap-2">
                {visibleShared.map((person) => (
                  <TouchableOpacity
                    key={person.user_id}
                    onPress={() => selectPerson(person.user_id)}
                    className={`flex-row items-center justify-between gap-3 rounded-[16px] border px-4 py-3 ${travelerCardBackground} ${selectedId === person.user_id ? 'border-[#2246C7]' : ''}`}>
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
                    <MapPin size={16} color={controlIcon} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {filter !== 'trusted' && (
            <>
              <Text className={`mt-4 text-[15px] font-bold ${primaryText}`}>{filter === 'matched' ? 'Matched, not sharing' : 'Nearby Travelers'}</Text>
              <View className="mt-2 gap-2">
                {visibleTravelers.length === 0 ? (
                  <Text className={`text-[14px] ${secondaryText}`}>
                    {filter === 'matched' ? 'Everyone you matched with is sharing.' : 'No travelers within 5 km right now.'}
                  </Text>
                ) : (
                  visibleTravelers.map((traveler) => {
                    const isSelected = (selectedId ?? params.focus) === traveler.user_id;
                    const isMatched = traveler.request_status === 'accepted';

                    return (
                      <TouchableOpacity
                        key={traveler.user_id}
                        onPress={() => (sharedIds.has(traveler.user_id) ? selectPerson(traveler.user_id) : setSelectedId(traveler.user_id))}
                        className={`rounded-[16px] border px-4 py-3 ${travelerCardBackground}`}>
                        <View className="flex-row items-center justify-between gap-3">
                          <View className="flex-1 flex-row items-center gap-3">
                            <View className={`h-3.5 w-3.5 rounded-full ${isMatched ? 'bg-[#179B67]' : 'bg-[#C4CDEB]'}`} />
                            <View>
                              <Text className={`text-[15px] font-semibold ${primaryText}`}>{traveler.display_name}</Text>
                              <Text className={`text-[13px] ${secondaryText}`}>{traveler.distance_km} km</Text>
                            </View>
                          </View>

                          {isMatched ? (
                            <View className="rounded-full bg-[#E7F6EF] px-3 py-1.5">
                              <Text className="text-[13px] font-semibold text-[#179B67]">✓ Matched</Text>
                            </View>
                          ) : traveler.request_status === 'outgoing_pending' ? (
                            <View className="rounded-full bg-[#EEF1F8] px-3 py-1.5">
                              <Text className="text-[13px] font-semibold text-[#64708A]">Requested</Text>
                            </View>
                          ) : traveler.request_status === 'incoming_pending' ? (
                            <View className="rounded-full bg-[#E9EEFF] px-3 py-1.5">
                              <Text className="text-[13px] font-semibold text-[#2246C7]">Wants to connect</Text>
                            </View>
                          ) : null}
                        </View>

                        {isSelected && !(isMatched && traveler.share_kind) && (
                          <View className={`mt-3 rounded-2xl px-3 py-2 ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F7FF]'}`}>
                            {isMatched ? (
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
                                      {traveler.request_status === 'outgoing_pending'
                                        ? 'Cancel request'
                                        : traveler.request_status === 'incoming_pending'
                                          ? 'Confirm connection'
                                          : 'Request to Connect'}
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
            </>
          )}

          <View className={`mt-5 gap-2 rounded-[16px] border px-4 py-3 ${infoCardBackground}`}>
            <View className="flex-row items-start gap-2">
              <Shield size={14} color={TRUSTED_COLOR} />
              <Text className="flex-1 text-[13px] leading-5 text-[#2246C7]">Only your trusted circle sees you 24/7.</Text>
            </View>
            <View className="flex-row items-start gap-2">
              <Navigation size={14} color={PAIR_COLOR} />
              <Text className="flex-1 text-[13px] leading-5 text-[#2246C7]">Connected travelers see you until you meet (within 10 m), then sharing turns off automatically.</Text>
            </View>
          </View>
        </MapBottomSheet>
      )}

      <WarningModeModal visible={warningModeVisible} onClose={() => setWarningModeVisible(false)} isDark={isDark} />
    </View>
  );
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`;
}
