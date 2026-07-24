import NotificationModal from '@/components/NotificationModal';
import { Bell, MapPin, Navigation, Send, Shield, Sparkles, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const activeTrip = {
  destination: 'Boracay',
  pickupTime: '2:15h',
  buddy: 'Sarah',
  traffic: 'Moderate',
  status: 'Active trip',
};

const safetyData = {
  geofenceStatus: 'Within 5km safe zone',
  location: 'Makati CBD',
  distanceToBuddy: 2.3,
  trustScore: 92,
  verified: true,
};

const quickStats = [
  { label: 'Trusted circle', value: '8 people' },
  { label: 'Trips completed', value: '24' },
  { label: 'Safety score', value: '92%' },
];

const activityItems = [
  { id: 1, title: 'Sarah accepted your request', meta: '2 min ago' },
  { id: 2, title: 'Pickup time updated to 2:00 PM', meta: '15 min ago' },
  { id: 3, title: 'Route adjusted for traffic', meta: '1 hour ago' },
];

export default function HomeScreen() {
  const [notificationVisible, setNotificationVisible] = useState(false);

  const notifications = [
    {
      id: 1,
      type: 'match' as const,
      title: 'New Match!',
      message: 'Sarah wants to travel with you to Bali',
      timestamp: '5 minutes ago',
      read: false,
    },
    {
      id: 2,
      type: 'message' as const,
      title: 'New Message',
      message: 'Mike: Hey! Are you still going to Tokyo?',
      timestamp: '1 hour ago',
      read: false,
    },
    {
      id: 3,
      type: 'trip' as const,
      title: 'Trip Reminder',
      message: 'Your trip to Paris starts in 3 days',
      timestamp: '2 hours ago',
      read: true,
    },
    {
      id: 4,
      type: 'safety' as const,
      title: 'Safety Check',
      message: 'Your trusted circle is requesting your location',
      timestamp: '1 day ago',
      read: true,
    },
  ];

  return (
    <ScrollView className="flex-1 bg-[#F6F8FC]" contentContainerClassName="pb-28">
      <View className="absolute -top-24 -right-20 h-56 w-56 rounded-full bg-[#DCE6FF] opacity-70" />
      <View className="absolute top-40 -left-24 h-52 w-52 rounded-full bg-[#DDEFE8] opacity-70" />

      <View className="px-4 pt-4 pb-5 border-b border-black/5 bg-white/80">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-[#2747C7]">
              <Text className="text-white text-lg font-bold">P</Text>
            </View>
            <Text className="text-lg font-bold text-[#24314A]">PartyUp</Text>
          </View>
          <TouchableOpacity onPress={() => setNotificationVisible(true)} className="relative rounded-full border border-black/10 bg-white p-2">
            <Bell size={20} color="#24314A" />
            <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#E34B4B]" />
          </TouchableOpacity>
        </View>

        <View className="mt-8">
          <Text className="text-[34px] leading-10 font-black text-[#182A4D]">What's happening now</Text>
          <Text className="mt-2 text-base text-[#6C7A95]">Your live dashboard</Text>
        </View>
      </View>

      <View className="px-4 pt-6 flex flex-col gap-4">
        <View className="rounded-[24px] border-2 border-[#284BD6] bg-[#EAF0FF] p-4 shadow-sm shadow-[#284BD6]/10">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View className="h-4 w-4 rounded-full bg-[#18A06A]" />
              <Text className="text-base font-extrabold text-[#284BD6]">{activeTrip.status}</Text>
            </View>
            <Send size={20} color="#284BD6" />
          </View>

          <Text className="mt-4 text-3xl font-black text-[#1B2340]">{activeTrip.destination}</Text>
          <Text className="mt-1 text-base text-[#6D7A96]">With {activeTrip.buddy}</Text>

          <View className="mt-4 rounded-2xl bg-white/75 p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-base text-[#6D7A96]">Pickup in</Text>
              <Text className="text-2xl font-black text-[#1B2340]">{activeTrip.pickupTime}</Text>
            </View>
            <View className="mt-3 flex-row items-center justify-between">
              <Text className="text-base text-[#6D7A96]">Live Traffic</Text>
              <Text className="text-base font-bold text-[#D88700]">{activeTrip.traffic}</Text>
            </View>
            <View className="mt-3 flex-row items-center justify-between">
              <Text className="text-base text-[#6D7A96]">Route</Text>
              <View className="flex-row items-center gap-2">
                <MapPin size={16} color="#284BD6" />
                <Text className="text-base font-semibold text-[#284BD6]">On track</Text>
              </View>
            </View>
          </View>

          <View className="mt-4 flex-row gap-3">
            <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#284BD6] px-4 py-3.5">
              <Navigation size={16} color="white" />
              <Text className="text-base font-bold text-white">Start Trip</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5">
              <Users size={16} color="#1B2340" />
              <Text className="text-base font-bold text-[#1B2340]">Share Location</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="rounded-[24px] border-2 border-[#159A67] bg-[#E5F6EF] p-4">
          <View className="flex-row items-center gap-2">
            <Shield size={20} color="#159A67" />
            <Text className="text-2xl font-black text-[#1B2340]">Safety Overview</Text>
          </View>

          <View className="mt-4 flex flex-col gap-3">
            <View className="rounded-2xl bg-white/75 p-4">
              <Text className="text-sm text-[#6D7A95]">Geofence Status</Text>
              <Text className="mt-2 text-lg font-bold text-[#1B2340]">{safetyData.geofenceStatus}</Text>
              <Text className="mt-1 text-sm text-[#6D7A95]">{safetyData.location}</Text>
            </View>

            <View className="rounded-2xl bg-white/75 p-4">
              <Text className="text-sm text-[#6D7A95]">Distance from Travel Buddy</Text>
              <Text className="mt-2 text-xl font-bold text-[#1B2340]">{safetyData.distanceToBuddy} km</Text>
            </View>

            <View className="rounded-2xl bg-white/75 p-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-sm text-[#6D7A95]">Trust Score</Text>
                  <Text className="mt-1 text-lg font-bold text-[#1B2340]">Protected and verified</Text>
                </View>
                <View className="rounded-full bg-[#DDF4EA] px-3 py-1">
                  <Text className="text-xs font-bold text-[#159A67]">✓ Verified</Text>
                </View>
              </View>

              <View className="mt-3 flex-row items-center gap-3">
                <View className="h-2 flex-1 overflow-hidden rounded-full bg-[#D9E4DE]">
                  <View className="h-full rounded-full bg-[#159A67]" style={{ width: `${safetyData.trustScore}%` }} />
                </View>
                <Text className="text-2xl font-black text-[#159A67]">{safetyData.trustScore}%</Text>
              </View>
            </View>
          </View>
        </View>

        <View className="rounded-[24px] border border-[#E4EAF2] bg-white/85 p-4">
          <View className="flex-row items-center gap-2">
            <Sparkles size={18} color="#284BD6" />
            <Text className="text-xl font-black text-[#1B2340]">Quick Stats</Text>
          </View>

          <View className="mt-4 flex-row gap-4">
            {quickStats.map((item) => (
              <View key={item.label} className="flex-1 rounded-2xl bg-[#F5F7FB] p-3">
                <Text className="text-xs text-[#6D7A96]">{item.label}</Text>
                <Text className="mt-2 text-base font-bold text-[#1B2340]">{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="rounded-[24px] border border-[#E4EAF2] bg-white/85 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xl font-black text-[#1B2340]">Live Activity</Text>
            <Text className="text-sm font-semibold text-[#284BD6]">View all</Text>
          </View>

          <View className="mt-4 flex flex-col gap-3">
            {activityItems.map((item) => (
              <View key={item.id} className="flex-row items-start gap-3 rounded-2xl bg-[#F5F7FB] p-3">
                <View className="mt-1 h-2.5 w-2.5 rounded-full bg-[#284BD6]" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-[#1B2340]">{item.title}</Text>
                  <Text className="mt-1 text-xs text-[#6D7A96]">{item.meta}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="flex-row gap-4 pb-6">
          <TouchableOpacity className="flex-1 rounded-[22px] border border-[#D8E0EE] bg-white px-4 py-4">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-[#EEF3FF]">
              <Users size={20} color="#284BD6" />
            </View>
            <Text className="mt-3 text-base font-bold text-[#1B2340]">Find Buddies</Text>
            <Text className="mt-1 text-xs text-[#6D7A96]">See who is traveling nearby</Text>
          </TouchableOpacity>

          <TouchableOpacity className="flex-1 rounded-[22px] border-2 border-[#FFB1A9] bg-[#FFF3F1] px-4 py-4">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-[#FFE1DC]">
              <Shield size={20} color="#D94B3D" />
            </View>
            <Text className="mt-3 text-base font-black text-[#D94B3D]">Emergency SOS</Text>
            <Text className="mt-1 text-xs text-[#A75A51]">Alert trusted circle</Text>
          </TouchableOpacity>
        </View>
      </View>
      <NotificationModal
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
        notifications={notifications}
      />
    </ScrollView>
  );
}
