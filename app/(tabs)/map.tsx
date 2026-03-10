import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export default function MapScreen() {
  return (
    <View className="flex-1 bg-gray-100">
      {/* Map Area (placeholder) */}
      <View className="flex-1 bg-gradient-to-br from-blue-100 to-blue-50 items-center justify-center">
        <View className="w-full h-full items-center justify-center">
          <IconSymbol size={60} name="map.fill" color="#3B82F6" />
          <Text className="text-gray-600 mt-4 font-semibold">Map View</Text>
          <Text className="text-sm text-gray-500 mt-2">Nearby travelers & rides</Text>
        </View>
      </View>

      {/* Map Controls */}
      <View className="absolute top-4 left-4 right-4 gap-2">
        {/* Search Bar */}
        <View className="bg-white rounded-lg shadow-lg flex-row items-center px-3 py-3 gap-2">
          <IconSymbol size={20} name="magnifyingglass" color="#999" />
          <Text className="text-gray-500 flex-1">Search locations...</Text>
        </View>
      </View>

      {/* Filter Buttons */}
      <View className="absolute top-20 right-4 gap-2">
        <TouchableOpacity className="bg-white rounded-lg shadow-lg p-3">
          <IconSymbol size={20} name="slider.horizontal.3" color="#3B82F6" />
        </TouchableOpacity>
        <TouchableOpacity className="bg-white rounded-lg shadow-lg p-3">
          <IconSymbol size={20} name="location.fill" color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet - Nearby Travelers */}
      <View className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 max-h-1/3">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold text-black">Nearby</Text>
          <View className="flex-row gap-2">
            <TouchableOpacity className="px-3 py-1 bg-gray-200 rounded-full">
              <Text className="text-xs font-semibold text-gray-700">Rides</Text>
            </TouchableOpacity>
            <TouchableOpacity className="px-3 py-1 bg-blue-800 rounded-full">
              <Text className="text-xs font-semibold text-white">Travelers</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sample Nearby Items */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-3">
          {[1, 2, 3].map((item) => (
            <View key={item} className="bg-gray-50 rounded-xl p-3 min-w-40 border border-gray-200">
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-8 h-8 bg-blue-800 rounded-full items-center justify-center">
                  <Text className="text-white text-xs font-bold">M</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-black">Traveler {item}</Text>
                  <Text className="text-xs text-gray-500">{1.2 + item * 0.3} km away</Text>
                </View>
              </View>
              <TouchableOpacity className="bg-blue-800 rounded py-2">
                <Text className="text-white text-xs font-semibold text-center">View Profile</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
