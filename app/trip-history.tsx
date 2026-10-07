import { EmptyState, SkeletonRow } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listMyTrips, type MyTrip, type TripType } from '@/lib/carpool';
import { formatDateTime } from '@/lib/datetime';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Car, ChevronRight, Compass, Flag, MapPinned, X } from 'lucide-react-native';
import { useCallback, useMemo, useState, type ComponentType } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Filter = 'all' | 'carpool' | 'tour' | 'places';
type CompletedTrip = MyTrip & { trip_type: TripType };
type IconType = ComponentType<{ size?: number; color?: string }>;

const FILTERS: { key: Filter; label: string; icon: IconType; tint: string }[] = [
  { key: 'all', label: 'All trips', icon: Flag, tint: '#2747C7' },
  { key: 'places', label: 'Places', icon: MapPinned, tint: '#00A56A' },
  { key: 'carpool', label: 'Carpools', icon: Car, tint: '#D88700' },
  { key: 'tour', label: 'Tours', icon: Compass, tint: '#8B5CF6' },
];

function isFilter(value: unknown): value is Filter {
  return value === 'all' || value === 'carpool' || value === 'tour' || value === 'places';
}

// Same rule as get_profile_stats: a completed trip the user was an accepted
// member of (creators are members too, as driver/coordinator).
function isCompleted(trip: MyTrip) {
  return trip.status === 'completed' && trip.my_status === 'accepted';
}

function placeKey(destination: string) {
  return destination.trim().toLowerCase();
}

export default function TripHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';

  const [filter, setFilter] = useState<Filter>(isFilter(params.filter) ? params.filter : 'all');
  const [place, setPlace] = useState<string | null>(null);
  const [trips, setTrips] = useState<CompletedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    const [carpools, tours] = await Promise.all([listMyTrips('carpool'), listMyTrips('tour')]);
    const error = carpools.error ?? tours.error;
    if (error) {
      setErrorMessage(error.message);
    } else {
      const completed = [
        ...carpools.data.filter(isCompleted).map((trip) => ({ ...trip, trip_type: 'carpool' as const })),
        ...tours.data.filter(isCompleted).map((trip) => ({ ...trip, trip_type: 'tour' as const })),
      ];
      completed.sort((a, b) => (b.end_at ?? b.start_at ?? b.created_at).localeCompare(a.end_at ?? a.start_at ?? a.created_at));
      setTrips(completed);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const places = useMemo(() => {
    const groups = new Map<string, { name: string; trips: CompletedTrip[] }>();
    for (const trip of trips) {
      const key = placeKey(trip.destination);
      const group = groups.get(key);
      if (group) group.trips.push(trip);
      else groups.set(key, { name: trip.destination.trim(), trips: [trip] });
    }
    return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
  }, [trips]);

  const visibleTrips = trips.filter((trip) => {
    if (place) return placeKey(trip.destination) === place;
    return filter === 'all' || trip.trip_type === filter;
  });

  function countFor(key: Filter) {
    if (key === 'places') return places.length;
    if (key === 'all') return trips.length;
    return trips.filter((trip) => trip.trip_type === key).length;
  }

  function selectFilter(key: Filter) {
    setPlace(null);
    setFilter(key);
  }

  function openPlace(key: string, placeTrips: CompletedTrip[]) {
    if (placeTrips.length === 1) {
      router.push(`/trip/${placeTrips[0].id}`);
      return;
    }
    setPlace(key);
    setFilter('all');
  }

  const activeFilter = FILTERS.find((entry) => entry.key === filter) ?? FILTERS[0];
  const placeName = place ? places.find((entry) => entry.key === place)?.name : null;

  return (
    <View className={`flex-1 ${background}`}>
      <ScreenHeader title="Travel Experience" subtitle={!loading ? `${trips.length} completed ${trips.length === 1 ? 'trip' : 'trips'}` : undefined} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-[56px] grow-0" contentContainerClassName="gap-2 px-4 pt-4">
        {FILTERS.map(({ key, label, icon: Icon, tint }) => {
          const active = filter === key && !place;
          return (
            <TouchableOpacity key={key} onPress={() => selectFilter(key)} activeOpacity={0.8} accessibilityState={{ selected: active }}>
              <View
                className="flex-row items-center gap-1.5 rounded-full border px-3.5 py-2"
                style={{
                  backgroundColor: active ? tint : isDark ? '#111B2E' : '#FFFFFF',
                  borderColor: active ? tint : isDark ? '#22324B' : '#E4EAF2',
                }}>
                <Icon size={14} color={active ? '#FFFFFF' : tint} />
                <Text className={`text-[13px] font-bold ${active ? 'text-white' : primary}`}>
                  {label} · {loading ? '–' : countFor(key)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        {placeName ? (
          <TouchableOpacity onPress={() => setPlace(null)} activeOpacity={0.8} className="self-start" accessibilityLabel={`Clear ${placeName} filter`}>
            <View className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: '#00A56A1F' }}>
              <MapPinned size={13} color="#00A56A" />
              <Text className="text-[13px] font-bold text-[#00A56A]">{placeName}</Text>
              <X size={13} color="#00A56A" />
            </View>
          </TouchableOpacity>
        ) : null}

        {loading ? (
          <Card key="loading">
            {[0, 1, 2].map((index) => <SkeletonRow key={index} />)}
          </Card>
        ) : filter === 'places' && !place ? (
          places.length === 0 ? (
            <EmptyState
              key="places-empty"
              icon={<MapPinned size={34} color="#00A56A" />}
              title="No places yet"
              message="Destinations from your completed trips will show up here."
            />
          ) : (
            places.map((entry, index) => (
              <TouchableOpacity key={entry.key} onPress={() => openPlace(entry.key, entry.trips)} activeOpacity={0.8}>
                <Card index={index} className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: '#00A56A1F' }}>
                    <MapPinned size={20} color="#00A56A" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-[15px] font-bold ${primary}`} numberOfLines={1}>{entry.name}</Text>
                    <Text className={`mt-0.5 text-[12.5px] ${secondary}`}>
                      {entry.trips.length} {entry.trips.length === 1 ? 'trip' : 'trips'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={isDark ? '#475569' : '#A3AEC2'} />
                </Card>
              </TouchableOpacity>
            ))
          )
        ) : visibleTrips.length === 0 ? (
          <EmptyState
            key={`empty-${filter}`}
            icon={<activeFilter.icon size={34} color={activeFilter.tint} />}
            title={filter === 'carpool' ? 'No completed carpools' : filter === 'tour' ? 'No completed tours' : 'No completed trips'}
            message="Trips you finish with other travelers will show up here."
          />
        ) : (
          visibleTrips.map((trip, index) => {
            const isCarpool = trip.trip_type === 'carpool';
            const tint = isCarpool ? '#D88700' : '#8B5CF6';
            const Icon = isCarpool ? Car : Compass;
            const when = formatDateTime(trip.end_at ?? trip.start_at);
            return (
              <TouchableOpacity key={trip.id} onPress={() => router.push(`/trip/${trip.id}`)} activeOpacity={0.8}>
                <Card index={index} className="flex-row items-center gap-3">
                  <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: `${tint}1F` }}>
                    <Icon size={20} color={tint} />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-[15px] font-bold ${primary}`} numberOfLines={1}>{trip.title}</Text>
                    <Text className={`mt-0.5 text-[12.5px] ${secondary}`} numberOfLines={1}>
                      {trip.origin} → {trip.destination}
                    </Text>
                    {when ? <Text className={`mt-0.5 text-[12px] ${secondary}`}>{when}</Text> : null}
                  </View>
                  <ChevronRight size={18} color={isDark ? '#475569' : '#A3AEC2'} />
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
