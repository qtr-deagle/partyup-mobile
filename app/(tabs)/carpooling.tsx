import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatCurrency, listMyTrips, type MyTrip } from '@/lib/carpool';
import { parseTimestamp } from '@/lib/datetime';
import { getTheme, typography } from '@/lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, CalendarDays, CarFront, Edit2, MapPin, Plane, Plus, Sparkles, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';

type TripView = 'Carpool' | 'Tours';

const emptyState = {
  Carpool: {
    title: 'No carpool trips yet',
    description: 'Create a ride or join one via an invite link to get moving with nearby travelers.',
    button: 'Create Carpool',
    icon: CarFront,
  },
  Tours: {
    title: 'No tours trips yet',
    description: 'Tours are coming soon.',
    button: 'Create Tour',
    icon: Plane,
  },
} as const;

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

function membersLabel(trip: MyTrip) {
  const suffix = trip.seats_total ? ` of ${trip.seats_total} seats` : '';
  return `${trip.rider_count}${suffix} riders${trip.my_role === 'driver' ? ' (you drive)' : ''}`;
}

const statusColors: Record<string, string> = {
  open: '#19A06B',
  full: '#B4650B',
  ongoing: '#2A55D4',
  completed: '#6A758F',
  cancelled: '#E32727',
  draft: '#6A758F',
};

function TripCard({ trip, isDark, onPress }: { trip: MyTrip; isDark: boolean; onPress: () => void }) {
  const primaryText = isDark ? 'text-white' : 'text-[#1D2746]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#6A758F]';
  const statusColor = statusColors[trip.status] ?? '#6A758F';

  return (
    <View className={`rounded-[22px] border p-5 shadow-sm ${isDark ? 'border-[#22324B] bg-[#111B2E] shadow-black/20' : 'border-[#E9EDF5] bg-white shadow-black/5'}`}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 pr-3">
          <Text className={`text-[22px] font-black ${primaryText}`}>{trip.title}</Text>
          <Text className={`mt-1 text-sm ${mutedText}`}>{formatTripDate(trip.start_at)}</Text>
        </View>
        <View className="items-end gap-2">
          <View className="rounded-full px-4 py-1.5" style={{ backgroundColor: isDark ? `${statusColor}22` : `${statusColor}1A` }}>
            <Text className="text-sm font-bold" style={{ color: statusColor }}>
              {trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
            </Text>
          </View>
          <View className={`rounded-full px-4 py-1.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#E9F0FF]'}`}>
            <Text className="text-sm font-bold text-[#2A55D4]">{trip.my_role === 'driver' ? 'Driver' : 'Rider'}</Text>
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
          <Text className={`text-base ${primaryText}`}>{membersLabel(trip)}</Text>
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
        {trip.my_role === 'driver' ? (
          <TouchableOpacity
            onPress={onPress}
            className={`flex-1 flex-row items-center justify-center rounded-2xl border py-3.5 ${isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D7DFEE] bg-white'}`}
          >
            <Edit2 size={18} color={isDark ? '#E2E8F0' : '#24314A'} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onPress} className="flex-[1.2] rounded-2xl bg-[#2A55D4] py-3.5">
          <Text className="text-center text-base font-bold text-white">View Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CarpoolingScreen() {
  const router = useRouter();
  const [activeView, setActiveView] = useState<TripView>('Carpool');
  const [trips, setTrips] = useState<MyTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isDark = useColorScheme() === 'dark';

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]';
  const headerBackground = isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-black/5 bg-white';
  const { titleColor } = getTheme(isDark);
  const primaryText = isDark ? 'text-white' : 'text-[#1D2746]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#6A758F]';

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

  useFocusEffect(
    useCallback(() => {
      if (activeView === 'Carpool') {
        void loadTrips();
      }
    }, [activeView, loadTrips])
  );

  const trips_ = activeView === 'Carpool' ? trips : [];
  const isEmpty = !loading && trips_.length === 0;
  const state = emptyState[activeView];
  const Icon = state.icon;

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className={`px-4 pt-4 pb-5 border-b ${headerBackground}`}>
        <View className="flex-row items-center justify-between">
          <Text className={`${typography.pageTitle} ${titleColor}`}>My Trips</Text>
          <TouchableOpacity
            onPress={() => router.push('/trip/create')}
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
      </View>

      <View className="px-4 pt-4">
        {errorMessage ? (
          <View className="mb-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        {loading && activeView === 'Carpool' ? (
          <ActivityIndicator className="mt-8" color="#2A55D4" />
        ) : isEmpty ? (
          <View className={`items-center justify-center rounded-[28px] border border-dashed px-6 py-16 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#DCE3EF] bg-white'}`}>
            <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
              <Icon size={42} color="#2A55D4" />
            </View>
            <Text className={`mt-6 text-2xl font-black text-center ${primaryText}`}>{state.title}</Text>
            <Text className={`mt-3 text-center text-base leading-6 ${mutedText}`}>{state.description}</Text>
            {activeView === 'Carpool' ? (
              <TouchableOpacity onPress={() => router.push('/trip/create')} className="mt-8 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] px-5 py-3.5">
                <Plus size={18} color="white" />
                <Text className="text-base font-bold text-white">{state.button}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View className="gap-4">
            {trips_.map((trip) => (
              <TripCard key={trip.id} trip={trip} isDark={isDark} onPress={() => router.push(`/trip/${trip.id}`)} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
