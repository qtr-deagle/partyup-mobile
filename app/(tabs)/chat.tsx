import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const conversations = [
  {
    id: 1,
    name: 'Sarah Chen',
    lastMessage: 'See you at 2:15 PM!',
    timestamp: '2 min ago',
    unread: 0,
    avatar: 'S',
    isActive: true,
  },
  {
    id: 2,
    name: 'Mike Johnson',
    lastMessage: 'Cool, I\'ll pick you up from Makati',
    timestamp: '15 min ago',
    unread: 2,
    avatar: 'M',
    isActive: true,
  },
  {
    id: 3,
    name: 'Alex Rodriguez',
    lastMessage: 'Thanks for the great ride! 5 stars ⭐',
    timestamp: '1 hour ago',
    unread: 0,
    avatar: 'A',
    isActive: false,
  },
  {
    id: 4,
    name: 'Emma Wilson',
    lastMessage: 'Are you available tomorrow?',
    timestamp: '3 hours ago',
    unread: 1,
    avatar: 'E',
    isActive: false,
  },
  {
    id: 5,
    name: 'David Park',
    lastMessage: 'Perfect, thanks!',
    timestamp: 'Yesterday',
    unread: 0,
    avatar: 'D',
    isActive: false,
  },
];

export default function ChatScreen() {
  return (
    <ScrollView className="flex-1 bg-white">
      {/* Header */}
      <View className="px-4 py-4 border-b border-gray-100">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-black">Messages</Text>
          <TouchableOpacity className="bg-blue-800 rounded-full p-2">
            <IconSymbol size={20} name="plus" color="white" />
          </TouchableOpacity>
        </View>
        <Text className="text-sm text-gray-500 mt-2">{conversations.length} conversations</Text>
      </View>

      {/* Search */}
      <View className="px-4 py-3">
        <View className="flex-row items-center gap-2 bg-gray-100 rounded-lg px-3 py-3">
          <IconSymbol size={20} name="magnifyingglass" color="#999" />
          <Text className="text-gray-500 flex-1">Search conversations...</Text>
        </View>
      </View>

      {/* Conversations */}
      <View className="pt-2">
        {conversations.map((conversation, index) => (
          <TouchableOpacity
            key={conversation.id}
            className={`px-4 py-3 flex-row items-center gap-3 border-b border-gray-100 ${
              conversation.unread > 0 ? 'bg-blue-50' : 'bg-white'
            }`}
          >
            {/* Avatar */}
            <View className={`w-12 h-12 rounded-full items-center justify-center relative ${
              conversation.isActive ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-gray-400 to-gray-600'
            }`}>
              <Text className="text-white font-bold text-lg">{conversation.avatar}</Text>
              {conversation.isActive && (
                <View className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
              )}
            </View>

            {/* Message Content */}
            <View className="flex-1">
              <View className="flex-row items-center justify-between mb-1">
                <Text className={`font-semibold ${conversation.unread > 0 ? 'text-black' : 'text-gray-900'}`}>
                  {conversation.name}
                </Text>
                <Text className="text-xs text-gray-500">{conversation.timestamp}</Text>
              </View>
              <Text className={`text-sm ${conversation.unread > 0 ? 'text-black font-medium' : 'text-gray-500'}`} numberOfLines={1}>
                {conversation.lastMessage}
              </Text>
            </View>

            {/* Unread Badge */}
            {conversation.unread > 0 && (
              <View className="bg-blue-800 rounded-full w-6 h-6 items-center justify-center">
                <Text className="text-white text-xs font-bold">{conversation.unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
