import ActivityFeed from '@/components/ActivityFeed';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export default function HomeScreen() {
  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center gap-2">
          <View className="w-10 h-10 bg-blue-800 rounded-lg items-center justify-center">
            <Text className="text-white font-bold">P</Text>
          </View>
          <Text className="text-xl font-bold text-black">PartyUp</Text>
        </View>
        <TouchableOpacity className="p-2">
          <IconSymbol size={24} name="bell.fill" color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View className="px-4 py-6">
        {/* Title Section */}
        <Text className="text-3xl font-bold text-black mb-1">What's happening now</Text>
        <Text className="text-base text-gray-500 mb-6">Your live dashboard</Text>

        {/* Active Trip Card */}
        <View className="border-2 border-blue-800 rounded-2xl p-4 mb-4 bg-blue-50">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <View className="w-3 h-3 bg-green-500 rounded-full" />
              <Text className="text-blue-800 font-semibold">Active Trip</Text>
            </View>
            <IconSymbol size={20} name="paperplane.fill" color="#2563EB" />
          </View>

          <Text className="text-2xl font-bold text-black mb-2">Boracay</Text>
          <Text className="text-sm text-gray-600 mb-4">With Sarah</Text>

          <View className="space-y-2 mb-4">
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Pickup in</Text>
              <Text className="font-bold">2:15h</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Live Traffic</Text>
              <Text className="font-bold text-orange-500">Moderate</Text>
            </View>
          </View>

          <View className="flex-row gap-3">
            <TouchableOpacity className="flex-1 bg-blue-800 rounded-lg py-3 flex-row items-center justify-center gap-2">
              <IconSymbol size={18} name="paperplane.fill" color="white" />
              <Text className="text-white font-bold">Start Trip</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 border border-gray-300 rounded-lg py-3 flex-row items-center justify-center gap-2">
              <IconSymbol size={18} name="location.fill" color="#666" />
              <Text className="text-gray-700 font-semibold">Share Location</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Safety Overview Card */}
        <View className="border-2 border-teal-500 rounded-2xl p-4 bg-teal-50 mb-4">
          <View className="flex-row items-center gap-2 mb-4">
            <IconSymbol size={24} name="shield.fill" color="#0D9488" />
            <Text className="text-lg font-bold text-black">Safety Overview</Text>
          </View>

          <View className="space-y-3 mb-4">
            <View>
              <Text className="text-sm text-gray-600 mb-1">Geofence Status</Text>
              <Text className="text-base font-bold text-black">Within 5km safe zone</Text>
              <Text className="text-xs text-gray-500">Makati CBD</Text>
            </View>
            <View>
              <Text className="text-sm text-gray-600 mb-1">Distance from Travel Buddy</Text>
              <Text className="text-base font-bold text-black">2.3 km</Text>
            </View>
          </View>

          <View className="absolute bottom-4 right-4 items-center gap-2">
            <TouchableOpacity className="w-16 h-16 bg-blue-800 rounded-full items-center justify-center shadow-lg">
              <View className="items-center">
                <IconSymbol size={24} name="shield.fill" color="white" />
                <Text className="text-white text-xs font-bold mt-1">Safety</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Activity Feed */}
        <ActivityFeed />

        {/* Quick Actions */}
        <View className="mt-6 mb-4">
          <Text className="text-lg font-bold text-black mb-3">Quick Actions</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity className="flex-1 bg-blue-800 rounded-xl py-3 items-center">
              <IconSymbol size={20} name="plus.circle.fill" color="white" />
              <Text className="text-white text-xs font-semibold mt-1">Create Trip</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 bg-green-600 rounded-xl py-3 items-center">
              <IconSymbol size={20} name="magnifyingglass" color="white" />
              <Text className="text-white text-xs font-semibold mt-1">Find Buddy</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 bg-purple-600 rounded-xl py-3 items-center">
              <IconSymbol size={20} name="car.fill" color="white" />
              <Text className="text-white text-xs font-semibold mt-1">Carpool</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
