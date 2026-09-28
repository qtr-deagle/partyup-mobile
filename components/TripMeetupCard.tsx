import MeetupMap, { type LatLng, type MeetupMapPerson } from '@/components/MeetupMap';
import { getTripMemberLocations, type TripDetail, type TripMemberLocation } from '@/lib/carpool';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { MapPin, Navigation } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';

const REFRESH_MS = 30000;
const LEADER_COLOR = '#19A06B';
const MEMBER_COLOR = '#D97706';

function distanceMeters(a: LatLng, b: LatLng) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

function formatDistance(meters: number) {
  if (meters < 100) {
    return 'At the meetup point';
  }
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

function roleLabel(role: TripMemberLocation['member_role']) {
  return role === 'driver' ? 'Driver' : role === 'coordinator' ? 'Organizer' : 'Rider';
}

type Props = {
  detail: TripDetail;
  isDark: boolean;
};

// Meetup pin plus the live positions of everyone else in the trip (shared from
// 12 h before meetup, see get_trip_member_locations), so riders can tell who
// has arrived and where exactly to go.
export default function TripMeetupCard({ detail, isDark }: Props) {
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';

  const meetup = useMemo<LatLng | null>(
    () => (detail.meetup_lat != null && detail.meetup_lng != null ? { latitude: Number(detail.meetup_lat), longitude: Number(detail.meetup_lng) } : null),
    [detail.meetup_lat, detail.meetup_lng]
  );
  const [others, setOthers] = useState<TripMemberLocation[]>([]);
  const [me, setMe] = useState<LatLng | null>(null);

  const tripId = detail.id;
  const live = detail.status === 'open' || detail.status === 'full' || detail.status === 'ongoing';

  useFocusEffect(
    useCallback(() => {
      if (!meetup || !live) {
        return;
      }
      let cancelled = false;
      async function refresh() {
        const { data } = await getTripMemberLocations(tripId);
        if (!cancelled) {
          setOthers(data);
        }
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const position = await Location.getLastKnownPositionAsync({ maxAge: REFRESH_MS });
            if (!cancelled && position) {
              setMe({ latitude: position.coords.latitude, longitude: position.coords.longitude });
            }
          }
        } catch {
          // Own dot is optional.
        }
      }
      void refresh();
      const interval = setInterval(() => void refresh(), REFRESH_MS);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [tripId, meetup, live])
  );

  const people = useMemo<MeetupMapPerson[]>(
    () =>
      others.map((person) => ({
        id: person.user_id,
        name: person.display_name,
        latitude: person.latitude,
        longitude: person.longitude,
        color: person.member_role === 'member' ? MEMBER_COLOR : LEADER_COLOR,
        subtitle: meetup ? `${roleLabel(person.member_role)} · ${formatDistance(distanceMeters(person, meetup))}` : roleLabel(person.member_role),
      })),
    [others, meetup]
  );

  if (!meetup) {
    return null;
  }

  function openDirections() {
    if (!meetup) return;
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${meetup.latitude},${meetup.longitude}`);
  }

  const place = [detail.meetup_landmark, detail.meetup_municipality && detail.meetup_municipality !== 'Outside Bulacan' ? detail.meetup_municipality : null]
    .filter(Boolean)
    .join(', ');

  return (
    <View className={`overflow-hidden rounded-[22px] border ${card}`}>
      <View className="flex-row items-center gap-3 p-4">
        <MapPin size={18} color="#E32727" />
        <View className="flex-1">
          <Text className={`text-[13px] font-bold ${secondary}`}>{detail.trip_type === 'tour' ? 'MEETING POINT' : 'MEETUP POINT'}</Text>
          <Text className={`mt-0.5 text-base font-semibold ${primary}`}>{place || detail.origin}</Text>
        </View>
      </View>

      <View style={{ height: 230 }}>
        <MeetupMap initialCenter={meetup} initialZoom={16} meetup={meetup} meetupLabel={place} people={people} me={me} fitToContent isDark={isDark} />
      </View>

      <View className="gap-2 p-4">
        {live ? (
          people.length > 0 ? (
            people.map((person) => (
              <View key={person.id} className="flex-row items-center gap-2">
                <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: person.color }} />
                <Text className={`flex-1 text-sm ${primary}`} numberOfLines={1}>
                  {person.name}
                </Text>
                <Text className={`text-sm ${secondary}`}>{person.subtitle}</Text>
              </View>
            ))
          ) : (
            <Text className={`text-sm ${secondary}`}>
              Members show up here from 12 hours before meetup while their app is open and location sharing is on.
            </Text>
          )
        ) : null}

        <TouchableOpacity onPress={openDirections} className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] py-3">
          <Navigation size={16} color="#FFFFFF" />
          <Text className="text-base font-bold text-white">Directions to meetup</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
