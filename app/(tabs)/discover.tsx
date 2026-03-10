import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const nearbyTravelers = [
  {
    id: 1,
    name: 'Maria',
    destination: 'Makati',
    distance: '2.3 km away',
    rating: 4.9,
    reviews: 124,
    matches: 92,
  },
  {
    id: 2,
    name: 'Alex',
    destination: 'BGC',
    distance: '1.8 km away',
    rating: 4.8,
    reviews: 98,
    matches: 87,
  },
  {
    id: 3,
    name: 'Sophie',
    destination: 'Quezon City',
    distance: '3.1 km away',
    rating: 4.7,
    reviews: 156,
    matches: 79,
  },
];

export default function DiscoverScreen() {
  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-4 border-b border-gray-100">
        <Text className="text-2xl font-bold text-black">Discover</Text>
        <Text className="text-sm text-gray-500 mt-1">Find nearby travel buddies</Text>
      </View>

      {/* Search and Filters */}
      <View className="px-4 py-4 gap-3">
        <View className="flex-row items-center gap-2 bg-gray-100 rounded-lg px-3 py-3">
          <IconSymbol size={20} name="magnifyingglass" color="#999" />
          <Text className="text-gray-500 flex-1">Search destinations...</Text>
          <IconSymbol size={20} name="slider.horizontal.3" color="#999" />
        </View>

        {/* Quick Filters */}
        <View className="flex-row gap-2">
          <TouchableOpacity className="px-3 py-2 bg-blue-800 rounded-full">
            <Text className="text-white text-xs font-semibold">All</Text>
          </TouchableOpacity>
          <TouchableOpacity className="px-3 py-2 bg-gray-200 rounded-full">
            <Text className="text-gray-700 text-xs font-semibold">Today</Text>
          </TouchableOpacity>
          <TouchableOpacity className="px-3 py-2 bg-gray-200 rounded-full">
            <Text className="text-gray-700 text-xs font-semibold">This Week</Text>
          </TouchableOpacity>
          <TouchableOpacity className="px-3 py-2 bg-gray-200 rounded-full">
            <Text className="text-gray-700 text-xs font-semibold">Verified</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Nearby Travelers */}
      <View className="px-4 mb-6">
        <Text className="text-lg font-bold text-black mb-4">Nearby Travelers</Text>
        {nearbyTravelers.map((traveler) => (
          <View key={traveler.id} className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-row gap-3 flex-1">
                <View className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-800 rounded-full items-center justify-center">
                  <Text className="text-white font-bold text-lg">{traveler.name[0]}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-black">{traveler.name}</Text>
                  <Text className="text-sm text-gray-600">{traveler.destination}</Text>
                  <Text className="text-xs text-gray-500 mt-1">{traveler.distance}</Text>
                </View>
              </View>
              <TouchableOpacity className="bg-blue-800 px-3 py-2 rounded-lg">
                <Text className="text-white text-xs font-semibold">Connect</Text>
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-4 pt-3 border-t border-gray-100">
              <View className="flex-row items-center gap-1">
                <IconSymbol size={14} name="star.fill" color="#F59E0B" />
                <Text className="text-xs font-semibold text-black">{traveler.rating}</Text>
                <Text className="text-xs text-gray-500">({traveler.reviews})</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <IconSymbol size={14} name="checkmark.circle.fill" color="#10B981" />
                <Text className="text-xs font-semibold text-black">{traveler.matches}% match</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
