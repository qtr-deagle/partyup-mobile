import { TourCard } from '@/components/carpool/TourCard';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatCurrency, joinTripViaInvite, listMyTrips, type MyTrip } from '@/lib/carpool';
import { parseTimestamp } from '@/lib/datetime';
import { getTheme, typography } from '@/lib/theme';
import { joinPublicTrip, listBrowseTours, listFavoriteTours, toggleTripFavorite, type TourCard as TourCardType } from '@/lib/tours';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, CalendarDays, CarFront, CheckCircle2, Compass, Edit2, Heart, MapPin, Plane, Plus, Search, Sparkles, Users, XCircle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type TripView = 'Carpool' | 'Tours';
type TourView = 'Browse' | 'My Tours' | 'Interested';
type CarpoolView = 'My Trips' | 'Browse';

const carpoolEmptyState = {
  title: 'No carpool trips yet',
  description: 'Create a ride or join one via an invite link to get moving with nearby travelers.',
  button: 'Create Carpool',
  icon: CarFront,
};

const tourEmptyState: Record<TourView, { title: string; description: string }> = {
  Browse: { title: 'No tours to explore yet', description: 'Be the first to create a tour for others to join.' },
  'My Tours': { title: "You haven't joined any tours", description: 'Create a tour or browse ones to join.' },
  Interested: { title: 'Nothing favorited yet', description: 'Tap the heart on a tour to save it here.' },
};

const carpoolBrowseEmptyState = {
  title: 'No public rides yet',
  description: 'Public carpools show up here for anyone to join. Be the first to share one.',
};

function formatTripDate(value: string | null) {
  if (!value) {
    return 'Date TBD';
  }
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date TBD';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function priceLabel(trip: MyTrip) {
  if (trip.price_per_person !== null) {
    return `${formatCurrency(trip.price_per_person)} per person`;
  }
  if (trip.total_cost !== null) {
    return `${formatCurrency(trip.total_cost)} total`;
  }
  return 'Price not set';
}

function membersLabel(trip: MyTrip, isTour: boolean) {
  const suffix = trip.seats_total ? ` of ${trip.seats_total}` : '';
  const noun = isTour ? 'participants' : 'riders';
  const roleSuffix = trip.my_role === 'driver' ? ' (you drive)' : trip.my_role === 'coordinator' ? ' (you organize)' : '';
  return `${trip.rider_count}${suffix} ${noun}${roleSuffix}`;
}

function roleLabel(role: MyTrip['my_role'], isTour: boolean) {
  if (role === 'driver') return 'Driver';
  if (role === 'coordinator') return 'Organizer';
  return isTour ? 'Participant' : 'Rider';
}

const statusColors: Record<string, string> = {
  open: '#19A06B',
  full: '#B4650B',
  ongoing: '#2A55D4',
  completed: '#19A06B',
  cancelled: '#E32727',
  draft: '#6A758F',
};

const HISTORY_STATUSES = new Set(['completed', 'cancelled']);

function splitByHistory(trips: MyTrip[]) {
  const active: MyTrip[] = [];
  const history: MyTrip[] = [];
  for (const trip of trips) {
    (HISTORY_STATUSES.has(trip.status) ? history : active).push(trip);
  }
  return { active, history };
}

function TripCard({ trip, isDark, isTour, onPress }: { trip: MyTrip; isDark: boolean; isTour: boolean; onPress: () => void }) {
  const primaryText = isDark ? 'text-white' : 'text-[#1D2746]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#6A758F]';
  const statusColor = statusColors[trip.status] ?? '#6A758F';
  const isCompleted = trip.status === 'completed';
  const isCancelled = trip.status === 'cancelled';

  const cardStyle = isCompleted
    ? isDark
      ? 'border-[#1F4C36] bg-[#0F241A]'
      : 'border-[#A7E5C0] bg-[#F0FBF4]'
    : isCancelled
      ? isDark
        ? 'border-[#4C2323] bg-[#241010]'
        : 'border-[#F3B9B9] bg-[#FDF2F2]'
      : isDark
        ? 'border-[#22324B] bg-[#111B2E]'
        : 'border-[#E9EDF5] bg-white';

  return (
    <View className={`rounded-[22px] border p-5 shadow-sm ${cardStyle} ${isDark ? 'shadow-black/20' : 'shadow-black/5'}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 pr-3">
          <Text className={`text-headline-24 font-bold ${primaryText}`}>{trip.title}</Text>
          <Text className={`mt-1 text-sm ${mutedText}`}>{formatTripDate(trip.start_at)}</Text>
        </View>
        <View className="items-end gap-2">
          <View className="flex-row items-center gap-1.5 rounded-full px-4 py-1.5" style={{ backgroundColor: isDark ? `${statusColor}22` : `${statusColor}1A` }}>
            {isCompleted ? <CheckCircle2 size={14} color={statusColor} /> : isCancelled ? <XCircle size={14} color={statusColor} /> : null}
            <Text className="text-sm font-bold" style={{ color: statusColor }}>
              {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
            </Text>
          </View>
          <View className={`rounded-full px-4 py-1.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#E9F0FF]'}`}>
            <Text className="text-sm font-bold text-[#2A55D4]">{roleLabel(trip.my_role, isTour)}</Text>
          </View>
        </View>
      </View>

      <View className="mt-5 gap-3">
        <View className="flex-row items-center gap-3">
          <MapPin size={18} color="#2A55D4" />
          <Text className={`text-base ${primaryText}`}>
            {trip.origin} → {trip.destination}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <CalendarDays size={18} color="#2A55D4" />
          <Text className={`text-base ${primaryText}`}>{formatTripDate(trip.start_at)}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Users size={18} color="#2A55D4" />
          <Text className={`text-base ${primaryText}`}>{membersLabel(trip, isTour)}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Sparkles size={18} color="#2A55D4" />
          <Text className={`text-base font-semibold ${primaryText}`}>{priceLabel(trip)}</Text>
        </View>
      </View>

      {trip.my_role === 'driver' && trip.pending_join_requests_count > 0 ? (
        <View className={`mt-4 flex-row items-center gap-2 rounded-2xl px-3 py-2.5 ${isDark ? 'bg-[#3A2A12]' : 'bg-[#FFEBCF]'}`}>
          <AlertTriangle size={16} color="#B4650B" />
          <Text className="text-sm font-semibold text-[#B4650B]">
            {trip.pending_join_requests_count} pending join request{trip.pending_join_requests_count > 1 ? 's' : ''}
          </Text>
        </View>
      ) : null}

      {trip.my_status === 'pending' ? (
        <View className={`mt-4 flex-row items-center gap-2 rounded-2xl px-3 py-2.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#E9F0FF]'}`}>
          <Text className="text-sm font-semibold text-[#2A55D4]">Your request to join is pending</Text>
        </View>
      ) : null}

      <View className="mt-5 flex-row gap-3">
        {trip.my_role === 'driver' && !isCompleted && !isCancelled ? (
          <TouchableOpacity
            onPress={onPress}
            className={`flex-1 flex-row items-center justify-center rounded-2xl border py-3.5 ${isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D7DFEE] bg-white'}`}
          >
            <Edit2 size={18} color={isDark ? '#E2E8F0' : '#24314A'} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onPress} className="flex-1 rounded-2xl bg-[#2A55D4] py-3.5">
          <Text className="text-center text-base font-bold text-white">View Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TripsWithHistory({
  trips,
  isDark,
  isTour,
  onPress,
}: {
  trips: MyTrip[];
  isDark: boolean;
  isTour: boolean;
  onPress: (tripId: string) => void;
}) {
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#6A758F]';
  const { active, history } = splitByHistory(trips);

  return (
    <View className="gap-4">
      {active.map((trip) => (
        <TripCard key={trip.id} trip={trip} isDark={isDark} isTour={isTour} onPress={() => onPress(trip.id)} />
      ))}

      {history.length > 0 ? (
        <>
          <Text className={`mt-2 text-sm font-bold uppercase tracking-wide ${mutedText}`}>History</Text>
          {history.map((trip) => (
            <TripCard key={trip.id} trip={trip} isDark={isDark} isTour={isTour} onPress={() => onPress(trip.id)} />
          ))}
        </>
      ) : null}
    </View>
  );
}

export default function CarpoolingScreen() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<TripView>('Carpool');
  const [activeTourView, setActiveTourView] = useState<TourView>('Browse');
  const [activeCarpoolView, setActiveCarpoolView] = useState<CarpoolView>('My Trips');
  const isDark = useColorScheme() === 'dark';

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]';
  const headerBackground = isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-black/5 bg-white';
  const { titleColor } = getTheme(isDark);
  const primaryText = isDark ? 'text-white' : 'text-[#1D2746]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#6A758F]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const inputBg = isDark ? 'bg-[#111B2E]' : 'bg-white';

  // Carpool: My Trips
  const [trips, setTrips] = useState<MyTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Carpool: Browse (public rides only -- invite-only/private carpools never
  // show up here, same visibility rule tours already use)
  const [carpoolSearch, setCarpoolSearch] = useState('');
  const [browseCarpools, setBrowseCarpools] = useState<TourCardType[]>([]);
  const [browseCarpoolsLoading, setBrowseCarpoolsLoading] = useState(true);
  const [browseCarpoolsError, setBrowseCarpoolsError] = useState<string | null>(null);

  // Tours: Browse
  const [search, setSearch] = useState('');
  const [browseTours, setBrowseTours] = useState<TourCardType[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // Tours: My Tours
  const [myTours, setMyTours] = useState<MyTrip[]>([]);
  const [myToursLoading, setMyToursLoading] = useState(true);
  const [myToursError, setMyToursError] = useState<string | null>(null);

  // Tours: Interested
  const [favoriteTours, setFavoriteTours] = useState<TourCardType[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(true);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);

  const [busyTripId, setBusyTripId] = useState<string | null>(null);

  // Manual invite-code entry: a reliable fallback for joining a carpool
  // trip that doesn't depend on the OS handling the partyupmobile:// deep
  // link (which only works from a real installed build, not Expo Go).
  const [joinCode, setJoinCode] = useState('');
  const [joiningByCode, setJoiningByCode] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await listMyTrips('carpool');
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setTrips(result.data);
    }
    setLoading(false);
  }, []);

  const loadBrowseCarpools = useCallback(async () => {
    setBrowseCarpoolsLoading(true);
    setBrowseCarpoolsError(null);
    const result = await listBrowseTours(carpoolSearch, 'carpool');
    if (result.error) {
      setBrowseCarpoolsError(result.error.message);
    } else {
      setBrowseCarpools(result.data);
    }
    setBrowseCarpoolsLoading(false);
  }, [carpoolSearch]);

  const loadBrowseTours = useCallback(async () => {
    setBrowseLoading(true);
    setBrowseError(null);
    const result = await listBrowseTours(search);
    if (result.error) {
      setBrowseError(result.error.message);
    } else {
      setBrowseTours(result.data);
    }
    setBrowseLoading(false);
  }, [search]);

  const loadMyTours = useCallback(async () => {
    setMyToursLoading(true);
    setMyToursError(null);
    const result = await listMyTrips('tour');
    if (result.error) {
      setMyToursError(result.error.message);
    } else {
      setMyTours(result.data);
    }
    setMyToursLoading(false);
  }, []);

  const loadFavoriteTours = useCallback(async () => {
    setFavoritesLoading(true);
    setFavoritesError(null);
    const result = await listFavoriteTours();
    if (result.error) {
      setFavoritesError(result.error.message);
    } else {
      setFavoriteTours(result.data);
    }
    setFavoritesLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (activeView === 'Carpool') {
        if (activeCarpoolView === 'My Trips') {
          void loadTrips();
        } else {
          void loadBrowseCarpools();
        }
        return;
      }
      if (activeTourView === 'Browse') {
        void loadBrowseTours();
      } else if (activeTourView === 'My Tours') {
        void loadMyTours();
      } else {
        void loadFavoriteTours();
      }
    }, [activeView, activeCarpoolView, activeTourView, loadTrips, loadBrowseCarpools, loadBrowseTours, loadMyTours, loadFavoriteTours])
  );

  async function handleToggleFavorite(tripId: string) {
    setBrowseTours((current) => current.map((t) => (t.id === tripId ? { ...t, is_favorited: !t.is_favorited } : t)));
    const { error } = await toggleTripFavorite(tripId);
    if (error) {
      void loadBrowseTours();
      return;
    }
    if (activeTourView === 'Interested') {
      void loadFavoriteTours();
    }
  }

  async function handleJoinCarpool(tripId: string) {
    setBusyTripId(tripId);
    const { error } = await joinPublicTrip(tripId);
    setBusyTripId(null);
    if (error) {
      setBrowseCarpoolsError(error.message);
      return;
    }
    router.push(`/trip/${tripId}`);
  }

  async function handleJoinTour(tripId: string) {
    setBusyTripId(tripId);
    const { error } = await joinPublicTrip(tripId);
    setBusyTripId(null);
    if (error) {
      setBrowseError(error.message);
      return;
    }
    router.push(`/trip/${tripId}`);
  }

  async function handleJoinByCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      return;
    }
    setJoiningByCode(true);
    setJoinCodeError(null);
    const { data, error } = await joinTripViaInvite(code);
    setJoiningByCode(false);
    if (error || !data) {
      setJoinCodeError(error?.message ?? 'Invite code not found.');
      return;
    }
    setJoinCode('');
    router.push(`/trip/${data.trip_id}`);
  }

  function handleCreatePress() {
    router.push(activeView === 'Tours' ? '/trip/create-tour' : '/trip/create');
  }

  const isTours = activeView === 'Tours';

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className={`px-4 pt-4 pb-5 border-b ${headerBackground}`}>
        <View className="flex-row items-center justify-between">
          <Text className={`${typography.pageTitle} ${titleColor}`}>My Trips</Text>
          <TouchableOpacity
            onPress={handleCreatePress}
            className="h-12 w-12 items-center justify-center rounded-2xl bg-[#2A55D4] shadow-sm shadow-[#2A55D4]/20"
          >
            <Plus size={24} color="white" />
          </TouchableOpacity>
        </View>

        <View className="mt-6 flex-row items-center gap-3">
          {(['Carpool', 'Tours'] as TripView[]).map((tab) => {
            const selected = activeView === tab;
            const TabIcon = tab === 'Carpool' ? CarFront : Plane;

            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveView(tab)}
                className={`flex-row flex-1 items-center justify-center gap-2 rounded-2xl border px-4 py-3 ${
                  selected ? 'border-[#A9C1FF] bg-[#DCE8FF]' : isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-transparent bg-transparent'
                }`}>
                <TabIcon size={18} color={selected ? '#2656E8' : '#617093'} />
                <Text className={`text-base font-semibold ${selected ? 'text-[#2656E8]' : isDark ? 'text-[#94A3B8]' : 'text-[#617093]'}`}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isTours ? (
          <View className="mt-4 flex-row items-center gap-2">
            {(['Browse', 'My Tours', 'Interested'] as TourView[]).map((tab) => {
              const selected = activeTourView === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTourView(tab)}
                  className={`flex-1 items-center rounded-xl px-3 py-2 ${selected ? 'bg-[#2A55D4]' : isDark ? 'bg-[#111B2E]' : 'bg-[#EEF1F8]'}`}
                >
                  <Text className={`text-sm font-bold ${selected ? 'text-white' : mutedText}`}>{tab}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View className="mt-4 flex-row items-center gap-2">
            {(['My Trips', 'Browse'] as CarpoolView[]).map((tab) => {
              const selected = activeCarpoolView === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveCarpoolView(tab)}
                  className={`flex-1 items-center rounded-xl px-3 py-2 ${selected ? 'bg-[#2A55D4]' : isDark ? 'bg-[#111B2E]' : 'bg-[#EEF1F8]'}`}
                >
                  <Text className={`text-sm font-bold ${selected ? 'text-white' : mutedText}`}>{tab}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!isTours && activeCarpoolView === 'My Trips' ? (
          <View className="mt-4 gap-2">
            <View className={`flex-row items-center gap-2 rounded-2xl border px-4 py-3 ${border} ${inputBg}`}>
              <TextInput
                className={`flex-1 text-base ${isDark ? 'text-white' : 'text-[#17233F]'}`}
                placeholder="Have an invite code? Enter it here"
                placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                autoCapitalize="characters"
                value={joinCode}
                onChangeText={setJoinCode}
                onSubmitEditing={() => void handleJoinByCode()}
                returnKeyType="join"
              />
              <TouchableOpacity onPress={() => void handleJoinByCode()} disabled={joiningByCode || !joinCode.trim()} className="rounded-xl bg-[#2A55D4] px-4 py-2.5">
                {joiningByCode ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text className="text-sm font-bold text-white">Join</Text>}
              </TouchableOpacity>
            </View>
            {joinCodeError ? <Text className="text-sm text-[#B91C1C]">{joinCodeError}</Text> : null}
          </View>
        ) : null}

        {!isTours && activeCarpoolView === 'Browse' ? (
          <View className={`mt-4 flex-row items-center gap-2 rounded-2xl border px-4 py-3 ${border} ${inputBg}`}>
            <Search size={18} color={isDark ? '#64748B' : '#9AA3B1'} />
            <TextInput
              className={`flex-1 text-base ${isDark ? 'text-white' : 'text-[#17233F]'}`}
              placeholder="Search rides by title or destination"
              placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
              value={carpoolSearch}
              onChangeText={setCarpoolSearch}
              onSubmitEditing={() => void loadBrowseCarpools()}
              returnKeyType="search"
            />
          </View>
        ) : null}

        {isTours && activeTourView === 'Browse' ? (
          <View className={`mt-4 flex-row items-center gap-2 rounded-2xl border px-4 py-3 ${border} ${inputBg}`}>
            <Search size={18} color={isDark ? '#64748B' : '#9AA3B1'} />
            <TextInput
              className={`flex-1 text-base ${isDark ? 'text-white' : 'text-[#17233F]'}`}
              placeholder="Search tours by title or destination"
              placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => void loadBrowseTours()}
              returnKeyType="search"
            />
          </View>
        ) : null}
      </View>

      <View className="px-4 pt-4">
        {!isTours && activeCarpoolView === 'My Trips' ? (
          <>
            {errorMessage ? (
              <View className="mb-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
              </View>
            ) : null}

            {loading ? (
              <ActivityIndicator className="mt-8" color="#2A55D4" />
            ) : trips.length === 0 ? (
              <View className={`items-center justify-center rounded-[28px] border border-dashed px-6 py-16 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#DCE3EF] bg-white'}`}>
                <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                  <CarFront size={42} color="#2A55D4" />
                </View>
                <Text className={`mt-6 text-headline-24 font-bold text-center ${primaryText}`}>{carpoolEmptyState.title}</Text>
                <Text className={`mt-3 text-center text-base leading-6 ${mutedText}`}>{carpoolEmptyState.description}</Text>
                <TouchableOpacity onPress={() => router.push('/trip/create')} className="mt-8 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] px-5 py-3.5">
                  <Plus size={18} color="white" />
                  <Text className="text-base font-bold text-white">{carpoolEmptyState.button}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TripsWithHistory trips={trips} isDark={isDark} isTour={false} onPress={(tripId) => router.push(`/trip/${tripId}`)} />
            )}
          </>
        ) : !isTours ? (
          <>
            {browseCarpoolsError ? (
              <View className="mb-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                <Text className="text-sm text-[#B91C1C]">{browseCarpoolsError}</Text>
              </View>
            ) : null}
            {browseCarpoolsLoading ? (
              <ActivityIndicator className="mt-8" color="#2A55D4" />
            ) : browseCarpools.length === 0 ? (
              <View className={`items-center justify-center rounded-[28px] border border-dashed px-6 py-16 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#DCE3EF] bg-white'}`}>
                <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                  <CarFront size={42} color="#2A55D4" />
                </View>
                <Text className={`mt-6 text-headline-24 font-bold text-center ${primaryText}`}>{carpoolBrowseEmptyState.title}</Text>
                <Text className={`mt-3 text-center text-base leading-6 ${mutedText}`}>{carpoolBrowseEmptyState.description}</Text>
                <TouchableOpacity onPress={() => router.push('/trip/create')} className="mt-8 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] px-5 py-3.5">
                  <Plus size={18} color="white" />
                  <Text className="text-base font-bold text-white">Create Carpool</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="gap-4">
                {browseCarpools.map((trip) => (
                  <TourCard
                    key={trip.id}
                    tour={trip}
                    isDark={isDark}
                    primaryActionLabel="Join Ride"
                    primaryActionBusy={busyTripId === trip.id}
                    onPrimaryAction={() => handleJoinCarpool(trip.id)}
                  />
                ))}
              </View>
            )}
          </>
        ) : activeTourView === 'Browse' ? (
          <>
            {browseError ? (
              <View className="mb-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                <Text className="text-sm text-[#B91C1C]">{browseError}</Text>
              </View>
            ) : null}
            {browseLoading ? (
              <ActivityIndicator className="mt-8" color="#2A55D4" />
            ) : browseTours.length === 0 ? (
              <View className={`items-center justify-center rounded-[28px] border border-dashed px-6 py-16 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#DCE3EF] bg-white'}`}>
                <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                  <Compass size={42} color="#2A55D4" />
                </View>
                <Text className={`mt-6 text-headline-24 font-bold text-center ${primaryText}`}>{tourEmptyState.Browse.title}</Text>
                <Text className={`mt-3 text-center text-base leading-6 ${mutedText}`}>{tourEmptyState.Browse.description}</Text>
                <TouchableOpacity onPress={() => router.push('/trip/create-tour')} className="mt-8 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] px-5 py-3.5">
                  <Plus size={18} color="white" />
                  <Text className="text-base font-bold text-white">Create Tour</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="gap-4">
                {browseTours.map((tour) => (
                  <TourCard
                    key={tour.id}
                    tour={tour}
                    isDark={isDark}
                    primaryActionLabel="Join Tour"
                    primaryActionBusy={busyTripId === tour.id}
                    onPrimaryAction={() => handleJoinTour(tour.id)}
                    onToggleFavorite={() => handleToggleFavorite(tour.id)}
                  />
                ))}
              </View>
            )}
          </>
        ) : activeTourView === 'My Tours' ? (
          <>
            {myToursError ? (
              <View className="mb-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                <Text className="text-sm text-[#B91C1C]">{myToursError}</Text>
              </View>
            ) : null}
            {myToursLoading ? (
              <ActivityIndicator className="mt-8" color="#2A55D4" />
            ) : myTours.length === 0 ? (
              <View className={`items-center justify-center rounded-[28px] border border-dashed px-6 py-16 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#DCE3EF] bg-white'}`}>
                <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                  <Plane size={42} color="#2A55D4" />
                </View>
                <Text className={`mt-6 text-headline-24 font-bold text-center ${primaryText}`}>{tourEmptyState['My Tours'].title}</Text>
                <Text className={`mt-3 text-center text-base leading-6 ${mutedText}`}>{tourEmptyState['My Tours'].description}</Text>
                <TouchableOpacity onPress={() => router.push('/trip/create-tour')} className="mt-8 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] px-5 py-3.5">
                  <Plus size={18} color="white" />
                  <Text className="text-base font-bold text-white">Create Tour</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TripsWithHistory trips={myTours} isDark={isDark} isTour={true} onPress={(tripId) => router.push(`/trip/${tripId}`)} />
            )}
          </>
        ) : (
          <>
            {favoritesError ? (
              <View className="mb-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                <Text className="text-sm text-[#B91C1C]">{favoritesError}</Text>
              </View>
            ) : null}
            {favoritesLoading ? (
              <ActivityIndicator className="mt-8" color="#2A55D4" />
            ) : favoriteTours.length === 0 ? (
              <View className={`items-center justify-center rounded-[28px] border border-dashed px-6 py-16 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#DCE3EF] bg-white'}`}>
                <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                  <Heart size={42} color="#2A55D4" />
                </View>
                <Text className={`mt-6 text-headline-24 font-bold text-center ${primaryText}`}>{tourEmptyState.Interested.title}</Text>
                <Text className={`mt-3 text-center text-base leading-6 ${mutedText}`}>{tourEmptyState.Interested.description}</Text>
              </View>
            ) : (
              <View className="gap-4">
                {favoriteTours.map((tour) => (
                  <TourCard
                    key={tour.id}
                    tour={tour}
                    isDark={isDark}
                    primaryActionLabel="View Details"
                    onPrimaryAction={() => router.push(`/trip/${tour.id}`)}
                    onToggleFavorite={() => handleToggleFavorite(tour.id)}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}
