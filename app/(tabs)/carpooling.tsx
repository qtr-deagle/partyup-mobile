import { DateTile } from '@/components/carpool/DateTile';
import { RequestSeatModal } from '@/components/carpool/RequestSeatModal';
import { TourCard } from '@/components/carpool/TourCard';
import { enterFromBelow, SkeletonCard } from '@/components/ui/motion';
import { useHideTabBarOnScroll } from '@/components/ui/tab-bar-visibility';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { formatCurrency, joinTripViaInvite, listMyTrips, type MyTrip } from '@/lib/carpool';
import { feedback } from '@/lib/sounds';
import { getTheme, typography } from '@/lib/theme';
import { joinPublicTrip, listBrowseTours, type TourCard as TourCardType } from '@/lib/tours';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, CarFront, CheckCircle2, ChevronRight, Clock, Compass, Edit2, MapPin, Plane, Plus, Search, Ticket, Users, XCircle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

type TripView = 'Carpool' | 'Tours';
type TourView = 'My Tours' | 'Browse';
type CarpoolView = 'My Carpools' | 'Browse';

const carpoolEmptyState = {
  title: 'No carpool trips yet',
  description: 'Create a ride or join one via an invite link to get moving with nearby travelers.',
  button: 'Create Carpool',
  icon: CarFront,
};

const tourEmptyState: Record<TourView, { title: string; description: string }> = {
  Browse: { title: 'No tours to explore yet', description: 'Be the first to create a tour for others to join.' },
  'My Tours': { title: "You haven't joined any tours", description: 'Create a tour or browse ones to join.' },
};

const carpoolBrowseEmptyState = {
  title: 'No public rides yet',
  description: 'Public carpools show up here for anyone to join. Be the first to share one.',
};

function priceLabel(trip: MyTrip, isTour: boolean) {
  if (trip.price_per_person !== null) {
    return `${formatCurrency(trip.price_per_person)} per person`;
  }
  if (trip.total_cost !== null) {
    return `${formatCurrency(trip.total_cost)} total`;
  }
  return isTour ? 'Price not set' : 'Fuel sharing';
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
  const primary = isDark ? '#FFFFFF' : '#1D2746';
  const muted = isDark ? '#94A3B8' : '#6A758F';
  const softFill = isDark ? '#18253C' : '#F1F4FA';
  const statusColor = statusColors[trip.status] ?? '#6A758F';
  const isCompleted = trip.status === 'completed';
  const isCancelled = trip.status === 'cancelled';
  const isHistory = isCompleted || isCancelled;
  const noun = isTour ? 'participants' : 'riders';
  const fill = trip.seats_total ? Math.min(trip.rider_count / trip.seats_total, 1) : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className="rounded-[26px] border p-4"
      style={{
        backgroundColor: isDark ? '#111B2E' : '#FFFFFF',
        borderColor: isDark ? '#1E2A40' : '#EDF0F6',
        opacity: isCancelled ? 0.75 : 1,
        shadowColor: '#0F1B3D',
        shadowOpacity: isDark || isHistory ? 0 : 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: isDark || isHistory ? 0 : 2,
      }}>
      <View className="flex-row items-start gap-3.5">
        <DateTile value={trip.start_at} isDark={isDark} muted={isHistory} />
        <View className="flex-1">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: `${statusColor}${isDark ? '2E' : '1A'}` }}>
              {isCompleted ? <CheckCircle2 size={12} color={statusColor} /> : isCancelled ? <XCircle size={12} color={statusColor} /> : <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />}
              <Text className="text-[11.5px] font-bold" style={{ color: statusColor }}>
                {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
              </Text>
            </View>
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: softFill }}>
              <Text className="text-[11.5px] font-bold" style={{ color: isDark ? '#A5B8FF' : '#2A55D4' }}>{roleLabel(trip.my_role, isTour)}</Text>
            </View>
          </View>
          <Text numberOfLines={2} className="mt-1.5 text-[18px] font-extrabold leading-6 tracking-tight" style={{ color: primary }}>{trip.title}</Text>
        </View>
        {trip.my_role === 'driver' && !isHistory ? (
          <TouchableOpacity onPress={onPress} accessibilityLabel={`Edit ${trip.title}`} hitSlop={6} className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: softFill }}>
            <Edit2 size={15} color={muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Route: origin → destination as a little timeline */}
      <View className="mt-4 flex-row gap-3 rounded-2xl px-3.5 py-3" style={{ backgroundColor: softFill }}>
        <View className="items-center py-1">
          <View className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: '#2A55D4' }} />
          <View className="my-1 w-0.5 flex-1 rounded-full" style={{ backgroundColor: isDark ? '#2C3E5F' : '#CBD6EE' }} />
          <MapPin size={13} color="#2A55D4" fill={isDark ? '#1A2850' : '#EAF0FF'} />
        </View>
        <View className="flex-1 gap-2.5">
          <Text numberOfLines={1} className="text-[14px] font-semibold" style={{ color: muted }}>{trip.origin}</Text>
          <Text numberOfLines={1} className="text-[14px] font-bold" style={{ color: primary }}>{trip.destination}</Text>
        </View>
      </View>

      <View className="mt-3.5 flex-row items-center gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            <Users size={13} color={muted} />
            <Text className="text-[12.5px] font-semibold" style={{ color: muted }}>
              {trip.rider_count}{trip.seats_total ? ` of ${trip.seats_total}` : ''} {noun}
            </Text>
          </View>
          {trip.seats_total ? (
            <View className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: softFill }}>
              <View className="h-full rounded-full" style={{ width: `${fill * 100}%`, backgroundColor: isHistory ? muted : fill >= 1 ? '#B4650B' : '#19A06B' }} />
            </View>
          ) : null}
        </View>
        <Text className="text-[15px] font-black" style={{ color: primary }}>{priceLabel(trip, isTour)}</Text>
      </View>

      {trip.my_role === 'driver' && trip.pending_join_requests_count > 0 ? (
        <View className="mt-3.5 flex-row items-center gap-2 rounded-2xl px-3 py-2.5" style={{ backgroundColor: isDark ? '#3A2A12' : '#FFF3E0' }}>
          <AlertTriangle size={15} color="#B4650B" />
          <Text className="flex-1 text-[13px] font-bold" style={{ color: isDark ? '#F0B872' : '#B4650B' }}>
            {trip.pending_join_requests_count} pending join request{trip.pending_join_requests_count > 1 ? 's' : ''}
          </Text>
          <ChevronRight size={16} color={isDark ? '#F0B872' : '#B4650B'} />
        </View>
      ) : null}

      {trip.my_status === 'pending' ? (
        <View className="mt-3.5 flex-row items-center gap-2 rounded-2xl px-3 py-2.5" style={{ backgroundColor: isDark ? '#1A2850' : '#EAF0FF' }}>
          <Clock size={15} color={isDark ? '#A5B8FF' : '#2A55D4'} />
          <Text className="text-[13px] font-bold" style={{ color: isDark ? '#A5B8FF' : '#2A55D4' }}>Your request to join is pending</Text>
        </View>
      ) : null}

      <View className="mt-3.5 flex-row items-center justify-between border-t pt-3" style={{ borderColor: isDark ? '#1E2A40' : '#F0F2F7' }}>
        <Text className="text-[13px] font-bold" style={{ color: isDark ? '#A5B8FF' : '#2A55D4' }}>View details</Text>
        <ChevronRight size={18} color={isDark ? '#A5B8FF' : '#2A55D4'} />
      </View>
    </TouchableOpacity>
  );
}

function LoadingCards() {
  return (
    <View className="gap-4">
      <SkeletonCard height={190} />
      <SkeletonCard height={190} />
      <SkeletonCard height={190} />
    </View>
  );
}

function SectionLabel({ label, count, isDark }: { label: string; count: number; isDark: boolean }) {
  return (
    <View className="flex-row items-center gap-2 px-1">
      <Text className="text-[12px] font-extrabold uppercase tracking-[1.2px]" style={{ color: isDark ? '#94A3B8' : '#6A758F' }}>{label}</Text>
      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: isDark ? '#22324B' : '#E3E8F2' }}>
        <Text className="text-[11px] font-black" style={{ color: isDark ? '#CBD5E1' : '#4A5875' }}>{count}</Text>
      </View>
    </View>
  );
}

function EmptyBlock({
  icon: Icon,
  title,
  description,
  button,
  onPress,
  isDark,
}: {
  icon: typeof CarFront;
  title: string;
  description: string;
  button: string;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <View className="items-center rounded-[28px] px-6 py-12" style={{ backgroundColor: isDark ? '#111B2E' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#1E2A40' : '#EDF0F6' }}>
      <View className="h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: isDark ? '#14213D' : '#F2F5FF' }}>
        <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: isDark ? '#1A2850' : '#E0E8FF' }}>
          <Icon size={30} color="#2A55D4" />
        </View>
      </View>
      <Text className="mt-5 text-center text-[20px] font-extrabold tracking-tight" style={{ color: isDark ? '#FFFFFF' : '#1D2746' }}>{title}</Text>
      <Text className="mt-2 text-center text-[14px] leading-5" style={{ color: isDark ? '#94A3B8' : '#6A758F' }}>{description}</Text>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} className="mt-6 flex-row items-center justify-center gap-2 rounded-full bg-[#2A55D4] px-6 py-3.5">
        <Plus size={18} color="white" />
        <Text className="text-[15px] font-bold text-white">{button}</Text>
      </TouchableOpacity>
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
  const { active, history } = splitByHistory(trips);

  return (
    <View className="gap-4">
      {active.length > 0 ? <SectionLabel label="Upcoming & active" count={active.length} isDark={isDark} /> : null}
      {active.map((trip, index) => (
        <Animated.View key={trip.id} entering={enterFromBelow(index)}>
          <TripCard trip={trip} isDark={isDark} isTour={isTour} onPress={() => onPress(trip.id)} />
        </Animated.View>
      ))}

      {history.length > 0 ? (
        <>
          <View className="mt-2">
            <SectionLabel label="History" count={history.length} isDark={isDark} />
          </View>
          {history.map((trip, index) => (
            <Animated.View key={trip.id} entering={enterFromBelow(active.length + index)}>
              <TripCard trip={trip} isDark={isDark} isTour={isTour} onPress={() => onPress(trip.id)} />
            </Animated.View>
          ))}
        </>
      ) : null}
    </View>
  );
}

export default function CarpoolingScreen() {
  const hideTabBarOnScroll = useHideTabBarOnScroll();
  const router = useRouter();
  const [activeView, setActiveView] = useState<TripView>('Carpool');
  const [activeTourView, setActiveTourView] = useState<TourView>('Browse');
  const [activeCarpoolView, setActiveCarpoolView] = useState<CarpoolView>('My Carpools');
  const isDark = useColorScheme() === 'dark';

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]';
  const { titleColor } = getTheme(isDark);

  // Carpool: My Carpools
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

  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [seatRequestTrip, setSeatRequestTrip] = useState<{ id: string; title: string } | null>(null);

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

  const loadActiveView = useCallback(() => {
    if (activeView === 'Carpool') {
      return activeCarpoolView === 'My Carpools' ? loadTrips() : loadBrowseCarpools();
    }
    return activeTourView === 'Browse' ? loadBrowseTours() : loadMyTours();
  }, [activeView, activeCarpoolView, activeTourView, loadTrips, loadBrowseCarpools, loadBrowseTours, loadMyTours]);
  const { refreshControl } = usePullToRefresh(loadActiveView);

  useFocusEffect(
    useCallback(() => {
      void loadActiveView();
    }, [loadActiveView])
  );

  // Carpools are ride-hailing style: request a seat with a fuel
  // contribution, then the driver accepts or declines.
  function handleRequestSeat(trip: TourCardType) {
    setSeatRequestTrip({ id: trip.id, title: trip.title });
  }

  function handleSeatRequested(tripId: string) {
    setSeatRequestTrip(null);
    router.push({ pathname: '/trip/[id]', params: { id: tripId, celebrate: 'requested' } });
  }

  async function handleJoinTour(tripId: string) {
    setBusyTripId(tripId);
    const { error } = await joinPublicTrip(tripId);
    setBusyTripId(null);
    if (error) {
      feedback.error();
      setBrowseError(error.message);
      return;
    }
    router.push({ pathname: '/trip/[id]', params: { id: tripId, celebrate: 'joined' } });
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
      feedback.error();
      setJoinCodeError(error?.message ?? 'Invite code not found.');
      return;
    }
    setJoinCode('');
    router.push({ pathname: '/trip/[id]', params: { id: data.trip_id, celebrate: data.member_status === 'accepted' ? 'joined' : 'requested' } });
  }

  function handleCreatePress() {
    router.push(activeView === 'Tours' ? '/trip/create-tour' : '/trip/create');
  }

  const isTours = activeView === 'Tours';
  const softFill = isDark ? '#18253C' : '#EEF1F7';
  const inputText = isDark ? '#FFFFFF' : '#17233F';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';
  const subTabs = isTours ? (['Browse', 'My Tours'] as const) : (['My Carpools', 'Browse'] as const);
  const activeSubTab = isTours ? activeTourView : activeCarpoolView;

  function renderError(message: string | null) {
    return message ? (
      <View className="mb-4 rounded-2xl bg-[#FEE2E2] px-4 py-3">
        <Text className="text-sm text-[#B91C1C]">{message}</Text>
      </View>
    ) : null;
  }

  function renderSearch(value: string, onChange: (text: string) => void, onSubmit: () => void, placeholder: string) {
    return (
      <View className="mt-4 flex-row items-center gap-2.5 rounded-2xl px-4 py-3" style={{ backgroundColor: softFill }}>
        <Search size={18} color={placeholderColor} />
        <TextInput
          className="flex-1 py-0 text-[15px]"
          style={{ color: inputText }}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
        />
      </View>
    );
  }

  return (
    <>
    <ScrollView className={`flex-1 ${screenBackground}`} refreshControl={refreshControl} keyboardShouldPersistTaps="handled" {...hideTabBarOnScroll}>
      <View className="px-4 pb-2 pt-5">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className={`${typography.pageTitle} ${titleColor}`}>My Trips</Text>
            <Text className="mt-0.5 text-[13px]" style={{ color: isDark ? '#94A3B8' : '#6A758F' }}>
              {isTours ? 'Explore and join group tours' : 'Share rides and split the fuel'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCreatePress}
            activeOpacity={0.85}
            accessibilityLabel={isTours ? 'Create a tour' : 'Create a carpool'}
            className="h-12 w-12 items-center justify-center rounded-full bg-[#2A55D4]"
            style={{ shadowColor: '#2A55D4', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
            <Plus size={24} color="white" />
          </TouchableOpacity>
        </View>

        {/* Carpool / Tours segmented control */}
        <View className="mt-5 flex-row rounded-full p-1" style={{ backgroundColor: softFill }}>
          {(['Carpool', 'Tours'] as TripView[]).map((tab) => {
            const selected = activeView === tab;
            const TabIcon = tab === 'Carpool' ? CarFront : Plane;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveView(tab)}
                activeOpacity={0.85}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-full py-2.5"
                style={
                  selected
                    ? { backgroundColor: isDark ? '#2A55D4' : '#FFFFFF', shadowColor: '#0F1B3D', shadowOpacity: isDark ? 0 : 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 2 }
                    : undefined
                }>
                <TabIcon size={17} color={selected ? (isDark ? '#FFFFFF' : '#2A55D4') : isDark ? '#94A3B8' : '#617093'} />
                <Text className="text-[15px] font-bold" style={{ color: selected ? (isDark ? '#FFFFFF' : '#1D2746') : isDark ? '#94A3B8' : '#617093' }}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sub-view chips */}
        <View className="mt-3 flex-row gap-2">
          {subTabs.map((tab) => {
            const selected = activeSubTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => (isTours ? setActiveTourView(tab as TourView) : setActiveCarpoolView(tab as CarpoolView))}
                activeOpacity={0.85}
                className="rounded-full px-4 py-2"
                style={{ backgroundColor: selected ? (isDark ? '#E2E8F0' : '#1D2746') : 'transparent', borderWidth: 1, borderColor: selected ? 'transparent' : isDark ? '#22324B' : '#E1E6EF' }}>
                <Text className="text-[13px] font-bold" style={{ color: selected ? (isDark ? '#0B1220' : '#FFFFFF') : isDark ? '#CBD5E1' : '#4A5875' }}>{tab}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!isTours && activeCarpoolView === 'My Carpools' ? (
          <View className="mt-4 gap-2">
            <View className="flex-row items-center gap-2.5 rounded-2xl py-1.5 pl-4 pr-1.5" style={{ backgroundColor: softFill }}>
              <Ticket size={18} color={placeholderColor} />
              <TextInput
                className="flex-1 py-2 text-[15px]"
                style={{ color: inputText }}
                placeholder="Have an invite code?"
                placeholderTextColor={placeholderColor}
                autoCapitalize="characters"
                value={joinCode}
                onChangeText={setJoinCode}
                onSubmitEditing={() => void handleJoinByCode()}
                returnKeyType="join"
              />
              <TouchableOpacity
                onPress={() => void handleJoinByCode()}
                disabled={joiningByCode || !joinCode.trim()}
                activeOpacity={0.85}
                className="min-w-[68px] items-center rounded-xl px-4 py-2.5"
                style={{ backgroundColor: joinCode.trim() ? '#2A55D4' : isDark ? '#22324B' : '#D9DFEA' }}>
                {joiningByCode ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text className="text-sm font-bold text-white">Join</Text>}
              </TouchableOpacity>
            </View>
            {joinCodeError ? <Text className="px-1 text-sm text-[#B91C1C]">{joinCodeError}</Text> : null}
          </View>
        ) : null}

        {!isTours && activeCarpoolView === 'Browse'
          ? renderSearch(carpoolSearch, setCarpoolSearch, () => void loadBrowseCarpools(), 'Search rides by title or destination')
          : null}
        {isTours && activeTourView === 'Browse' ? renderSearch(search, setSearch, () => void loadBrowseTours(), 'Search tours by title or destination') : null}
      </View>

      <View className="px-4 pt-4">
        {!isTours && activeCarpoolView === 'My Carpools' ? (
          <>
            {renderError(errorMessage)}
            {loading && trips.length === 0 ? (
              <LoadingCards key="loading" />
            ) : trips.length === 0 ? (
              <EmptyBlock
                key="empty"
                icon={carpoolEmptyState.icon}
                title={carpoolEmptyState.title}
                description={carpoolEmptyState.description}
                button={carpoolEmptyState.button}
                onPress={() => router.push('/trip/create')}
                isDark={isDark}
              />
            ) : (
              <TripsWithHistory key="list" trips={trips} isDark={isDark} isTour={false} onPress={(tripId) => router.push(`/trip/${tripId}`)} />
            )}
          </>
        ) : !isTours ? (
          <>
            {renderError(browseCarpoolsError)}
            {browseCarpoolsLoading && browseCarpools.length === 0 ? (
              <LoadingCards key="loading" />
            ) : browseCarpools.length === 0 ? (
              <EmptyBlock
                key="empty"
                icon={CarFront}
                title={carpoolBrowseEmptyState.title}
                description={carpoolBrowseEmptyState.description}
                button="Create Carpool"
                onPress={() => router.push('/trip/create')}
                isDark={isDark}
              />
            ) : (
              <View key="list" className="gap-4">
                {browseCarpools.map((trip, index) => (
                  <Animated.View key={trip.id} entering={enterFromBelow(index)}>
                    <TourCard
                      tour={trip}
                      isDark={isDark}
                      primaryActionLabel="Request Seat"
                      priceLabel="Offer a fuel share"
                      onPrimaryAction={() => handleRequestSeat(trip)}
                    />
                  </Animated.View>
                ))}
              </View>
            )}
          </>
        ) : activeTourView === 'Browse' ? (
          <>
            {renderError(browseError)}
            {browseLoading && browseTours.length === 0 ? (
              <LoadingCards key="loading" />
            ) : browseTours.length === 0 ? (
              <EmptyBlock
                key="empty"
                icon={Compass}
                title={tourEmptyState.Browse.title}
                description={tourEmptyState.Browse.description}
                button="Create Tour"
                onPress={() => router.push('/trip/create-tour')}
                isDark={isDark}
              />
            ) : (
              <View key="list" className="gap-4">
                {browseTours.map((tour, index) => (
                  <Animated.View key={tour.id} entering={enterFromBelow(index)}>
                    <TourCard
                      tour={tour}
                      isDark={isDark}
                      primaryActionLabel="Join Tour"
                      primaryActionBusy={busyTripId === tour.id}
                      onPrimaryAction={() => handleJoinTour(tour.id)}
                    />
                  </Animated.View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            {renderError(myToursError)}
            {myToursLoading && myTours.length === 0 ? (
              <LoadingCards key="loading" />
            ) : myTours.length === 0 ? (
              <EmptyBlock
                key="empty"
                icon={Plane}
                title={tourEmptyState['My Tours'].title}
                description={tourEmptyState['My Tours'].description}
                button="Create Tour"
                onPress={() => router.push('/trip/create-tour')}
                isDark={isDark}
              />
            ) : (
              <TripsWithHistory key="list" trips={myTours} isDark={isDark} isTour={true} onPress={(tripId) => router.push(`/trip/${tripId}`)} />
            )}
          </>
        )}
      </View>
    </ScrollView>

    <RequestSeatModal
      visible={!!seatRequestTrip}
      onClose={() => setSeatRequestTrip(null)}
      isDark={isDark}
      tripId={seatRequestTrip?.id ?? null}
      tripTitle={seatRequestTrip?.title ?? ''}
      onRequested={handleSeatRequested}
    />
    </>
  );
}
