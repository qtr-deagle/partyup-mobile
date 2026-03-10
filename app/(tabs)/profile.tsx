import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const menuItems = [
  { id: 1, title: 'My Trips', icon: 'map.fill', color: '#3B82F6' },
  { id: 2, title: 'Saved Places', icon: 'bookmark.fill', color: '#F59E0B' },
  { id: 3, title: 'Trusted Circle', icon: 'person.2.fill', color: '#10B981' },
  { id: 4, title: 'Payment Methods', icon: 'creditcard.fill', color: '#8B5CF6' },
  { id: 5, title: 'Settings', icon: 'gearshape.fill', color: '#6B7280' },
  { id: 6, title: 'Help & Support', icon: 'questionmark.circle.fill', color: '#EF4444' },
];

export default function ProfileScreen() {
  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Profile Header */}
      <View className="bg-white px-4 py-6 items-center border-b border-gray-100">
        <View className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-800 rounded-full items-center justify-center mb-4">
          <Text className="text-white font-bold text-4xl">J</Text>
        </View>
        <Text className="text-2xl font-bold text-black">John Smith</Text>
        <Text className="text-gray-600 mt-1">john.smith@email.com</Text>

        {/* Stats */}
        <View className="flex-row gap-6 mt-6 pt-6 border-t border-gray-100 w-full">
          <View className="flex-1 items-center">
            <View className="flex-row items-center gap-1 mb-2">
              <IconSymbol size={16} name="star.fill" color="#F59E0B" />
              <Text className="text-lg font-bold text-black">4.9</Text>
            </View>
            <Text className="text-xs text-gray-500">Rating</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold text-black mb-2">127</Text>
            <Text className="text-xs text-gray-500">Trips</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-lg font-bold text-black mb-2">98%</Text>
            <Text className="text-xs text-gray-500">Match</Text>
          </View>
        </View>

        {/* Edit Profile Button */}
        <TouchableOpacity className="mt-6 bg-blue-800 rounded-lg py-3 px-6 w-full">
          <Text className="text-white font-semibold text-center">Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Verification Status */}
      <View className="bg-white mx-4 mt-4 rounded-lg p-4 border border-green-200 bg-green-50">
        <View className="flex-row items-center gap-3">
          <IconSymbol size={24} name="checkmark.shield.fill" color="#10B981" />
          <View className="flex-1">
            <Text className="font-semibold text-black">Verified Account</Text>
            <Text className="text-sm text-gray-600">Identity, email & phone verified</Text>
          </View>
        </View>
      </View>

      {/* Menu Items */}
      <View className="gap-2 mt-4 px-4 mb-6">
        {menuItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            className="bg-white rounded-lg p-4 flex-row items-center justify-between border border-gray-100"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <View className="w-10 h-10 rounded-lg items-center justify-center" style={{ backgroundColor: item.color + '20' }}>
                <IconSymbol size={20} name={item.icon as any} color={item.color} />
              </View>
              <Text className="text-base font-semibold text-black">{item.title}</Text>
            </View>
            <IconSymbol size={20} name="chevron.right" color="#999" />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout Button */}
      <View className="px-4 mb-6">
        <TouchableOpacity className="bg-red-50 border border-red-200 rounded-lg py-3">
          <Text className="text-red-600 font-semibold text-center">Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
