import { useColorScheme } from '@/hooks/use-color-scheme';
import { CalendarDays, CarFront, Edit2, MapPin, Plane, Plus, Sparkles, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

type TripView = 'Carpool' | 'Tours';

const carpoolTrips = [
  {
    id: 1,
    route: 'Makati → Laguna',
    dateRange: 'Feb 10, 2026 - Feb 10, 2026',
    status: 'Active',
    type: 'Carpool',
    stops: 'Makati → Laguna',
    date: 'Feb 10, 2026',
    members: '7 of 7 buddies',
    price: '₱ 360 per person',
    tags: ['Commute', 'Budget Travel', 'Scenic Route'],
  },
  {
    id: 2,
    route: 'Quezon City → Cavite',
    dateRange: 'Apr 5, 2026 - Apr 5, 2026',
    status: 'Active',
    type: 'Carpool',
    stops: 'Quezon City → Cavite',
    date: 'Apr 5, 2026',
    members: '5 of 6 buddies',
    price: '₱ 280 per person',
    tags: ['Workday', 'Weekly Ride'],
  },
];

const tourTrips: never[] = [];

const emptyState = {
  Carpool: {
    title: 'No carpool trips yet',
    description: 'Create a ride or join one to get moving with nearby travelers.',
    button: 'Create Carpool',
    icon: CarFront,
  },
  Tours: {
    title: 'No tours trips yet',
    description: 'Join a tour or create one to get started.',
    button: 'Create Tour',
    icon: Plane,
  },
} as const;

function TripCard({ trip }: { trip: (typeof carpoolTrips)[number] | (typeof tourTrips)[number] }) {
  return (
    <View className="rounded-[22px] border border-[#E9EDF5] bg-white p-5 shadow-sm shadow-black/5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 pr-3">
          <Text className="text-[22px] font-black text-[#1D2746]">{trip.route}</Text>
          <Text className="mt-1 text-sm text-[#6A758F]">{trip.dateRange}</Text>
        </View>
        <View className="items-end gap-2">
          <View className="rounded-full bg-[#DDF3EA] px-4 py-1.5">
            <Text className="text-sm font-bold text-[#19A06B]">{trip.status}</Text>
          </View>
          <View className="rounded-full bg-[#E9F0FF] px-4 py-1.5">
            <Text className="text-sm font-bold text-[#2A55D4]">{trip.type}</Text>
          </View>
        </View>
      </View>

      <View className="mt-5 gap-3">
        <View className="flex-row items-center gap-3">
          <MapPin size={18} color="#2A55D4" />
          <Text className="text-base text-[#17233F]">{trip.stops}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <CalendarDays size={18} color="#2A55D4" />
          <Text className="text-base text-[#17233F]">{trip.date}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Users size={18} color="#2A55D4" />
          <Text className="text-base text-[#17233F]">{trip.members}</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <Sparkles size={18} color="#2A55D4" />
          <Text className="text-base font-semibold text-[#17233F]">{trip.price}</Text>
        </View>
      </View>

      <View className="mt-5 border-t border-[#EBEFF6] pt-4">
        <View className="flex-row flex-wrap gap-2">
          {trip.tags.map((tag) => (
            <View key={tag} className="rounded-full bg-[#F4F6FB] px-3 py-1.5">
              <Text className="text-sm text-[#57637D]">{tag}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="mt-5 flex-row gap-3">
        <TouchableOpacity className="flex-1 flex-row items-center justify-center rounded-2xl border border-[#D7DFEE] bg-white py-3.5">
          <Edit2 size={18} color="#24314A" />
        </TouchableOpacity>
        <TouchableOpacity className="flex-[1.2] rounded-2xl bg-[#2A55D4] py-3.5">
          <Text className="text-center text-base font-bold text-white">View Details</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CarpoolingScreen() {
  const [activeView, setActiveView] = useState<TripView>('Carpool');
  const isDark = useColorScheme() === 'dark';

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]';
  const headerBackground = isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-black/5 bg-white';
  const titleColor = isDark ? 'text-white' : 'text-[#1F3CA4]';
  const primaryText = isDark ? 'text-white' : 'text-[#1D2746]';
  const mutedText = isDark ? 'text-[#94A3B8]' : 'text-[#6A758F]';

  const trips = activeView === 'Carpool' ? carpoolTrips : tourTrips;
  const isEmpty = trips.length === 0;
  const state = emptyState[activeView];
  const Icon = state.icon;

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className={`px-4 pt-4 pb-5 border-b ${headerBackground}`}>
        <View className="flex-row items-center justify-between">
          <Text className={`text-[30px] leading-9 font-black ${titleColor}`}>My Trips</Text>
          <TouchableOpacity className="h-12 w-12 items-center justify-center rounded-2xl bg-[#2A55D4] shadow-sm shadow-[#2A55D4]/20">
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
        {isEmpty ? (
          <View className={`items-center justify-center rounded-[28px] border border-dashed px-6 py-16 ${isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#DCE3EF] bg-white'}`}>
            <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
              <Icon size={42} color="#2A55D4" />
            </View>
            <Text className={`mt-6 text-2xl font-black text-center ${primaryText}`}>{state.title}</Text>
            <Text className={`mt-3 text-center text-base leading-6 ${mutedText}`}>{state.description}</Text>
            <TouchableOpacity className="mt-8 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] px-5 py-3.5">
              <Plus size={18} color="white" />
              <Text className="text-base font-bold text-white">{state.button}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="gap-4">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
