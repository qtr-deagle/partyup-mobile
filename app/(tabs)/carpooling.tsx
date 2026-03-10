import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const activeRides = [
  {
    id: 1,
    driver: 'John Doe',
    from: 'Makati',
    to: 'BGC',
    seats: 2,
    price: '₱150',
    departure: '2:30 PM',
    rating: 4.9,
  },
  {
    id: 2,
    driver: 'Maria Santos',
    from: 'Quezon City',
    to: 'Makati',
    seats: 1,
    price: '₱200',
    departure: '3:00 PM',
    rating: 4.8,
  },
  {
    id: 3,
    driver: 'Carlos Garcia',
    from: 'BGC',
    to: 'Pasig',
    seats: 3,
    price: '₱180',
    departure: '2:45 PM',
    rating: 4.7,
  },
];

export default function CarpoolingScreen() {
  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-4 border-b border-gray-100">
        <Text className="text-2xl font-bold text-black">Carpooling</Text>
        <Text className="text-sm text-gray-500 mt-1">Available rides near you</Text>
      </View>

      {/* Actions */}
      <View className="px-4 py-4 gap-2">
        <TouchableOpacity className="bg-blue-800 rounded-lg py-3 flex-row items-center justify-center gap-2">
          <IconSymbol size={20} name="plus.circle.fill" color="white" />
          <Text className="text-white font-semibold">Offer a Ride</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View className="px-4 pb-4 flex-row gap-2">
        <TouchableOpacity className="px-4 py-2 bg-blue-800 rounded-full">
          <Text className="text-white text-sm font-semibold">All</Text>
        </TouchableOpacity>
        <TouchableOpacity className="px-4 py-2 bg-gray-200 rounded-full">
          <Text className="text-gray-700 text-sm font-semibold">Verified Drivers</Text>
        </TouchableOpacity>
      </View>

      {/* Available Rides */}
      <View className="px-4 mb-6">
        <Text className="text-lg font-bold text-black mb-4">Available Now</Text>
        {activeRides.map((ride) => (
          <View key={ride.id} className="border border-gray-200 rounded-xl p-4 mb-3 bg-white">
            {/* Driver Info */}
            <View className="flex-row items-center gap-3 mb-4">
              <View className="w-12 h-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full items-center justify-center">
                <Text className="text-white font-bold">{ride.driver[0]}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-black">{ride.driver}</Text>
                <View className="flex-row items-center gap-1 mt-1">
                  <IconSymbol size={14} name="star.fill" color="#F59E0B" />
                  <Text className="text-sm font-semibold text-black">{ride.rating}</Text>
                </View>
              </View>
              <View className="items-center">
                <Text className="text-xl font-bold text-blue-800">{ride.price}</Text>
                <Text className="text-xs text-gray-500">per seat</Text>
              </View>
            </View>

            {/* Route Info */}
            <View className="gap-3 mb-4">
              <View className="flex-row items-center gap-3">
                <View className="w-2 h-2 rounded-full bg-green-500" />
                <Text className="text-sm font-semibold text-black">{ride.from}</Text>
              </View>
              <View className="flex-row pl-1 gap-2">
                <View className="w-0.5 h-6 bg-gray-300" />
              </View>
              <View className="flex-row items-center gap-3">
                <View className="w-2 h-2 rounded-full bg-red-500" />
                <Text className="text-sm font-semibold text-black">{ride.to}</Text>
              </View>
            </View>

            {/* Additional Info */}
            <View className="flex-row gap-3 pt-3 border-t border-gray-100">
              <View className="flex-row items-center gap-1">
                <IconSymbol size={16} name="clock.fill" color="#666" />
                <Text className="text-xs text-gray-600">{ride.departure}</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <IconSymbol size={16} name="person.2.fill" color="#666" />
                <Text className="text-xs text-gray-600">{ride.seats} seats left</Text>
              </View>
            </View>

            {/* Book Button */}
            <TouchableOpacity className="bg-blue-800 rounded-lg py-2 mt-3">
              <Text className="text-white font-semibold text-center">Book Ride</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
