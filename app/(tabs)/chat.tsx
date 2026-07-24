import { AlertTriangle, ArrowLeft, Flag, MapPin, Phone, Search, Send, Video } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

const conversations = [
  { id: 1, name: 'Sarah', age: 24, destination: 'Boracay', lastMessage: 'See you there! 🎉', timestamp: '19:23', unread: 1, isActive: true, verified: true },
  { id: 2, name: 'Mike', age: 26, destination: 'Tagaytay', lastMessage: 'Leaving in 30 mins', timestamp: '10:17', unread: 0, isActive: false, verified: true },
  { id: 3, name: 'Emma', age: 23, destination: 'Batangas', lastMessage: 'What time are we meeting?', timestamp: 'Yesterday', unread: 2, isActive: true, verified: true },
];

const messages: Record<number, Array<{ id: number; text: string; sender: 'user' | 'other'; timestamp: string }>> = {
  1: [
    { id: 1, text: 'Hi! Are you ready for the trip?', sender: 'other', timestamp: '18:47' },
    { id: 2, text: 'Yes! See you soon 🎉', sender: 'user', timestamp: '18:49' },
    { id: 3, text: 'Great! I will share my location', sender: 'other', timestamp: '18:50' },
  ],
  2: [
    { id: 1, text: 'When will you arrive?', sender: 'other', timestamp: '10:30' },
    { id: 2, text: 'In about 10 minutes', sender: 'user', timestamp: '10:35' },
  ],
  3: [
    { id: 1, text: 'Thank you for the great ride!', sender: 'other', timestamp: '3:45 PM' },
    { id: 2, text: 'Thanks for riding with me!', sender: 'user', timestamp: '3:50 PM' },
  ],
  4: [{ id: 1, text: 'Are you available tomorrow?', sender: 'other', timestamp: '2:15 PM' }],
  5: [{ id: 1, text: 'Perfect, thanks!', sender: 'other', timestamp: 'Yesterday' }],
};

function ConversationListView({ onSelectConversation }: { onSelectConversation: (id: number) => void }) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((conversation) => !query || conversation.name.toLowerCase().includes(query));
  }, [searchQuery]);

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="px-4 pt-4 pb-3 border-b border-[#E7EAF2] bg-white">
        <View className="flex-row items-center gap-3 rounded-full border border-[#E5E7EF] bg-[#F6F7FB] px-4 py-3 shadow-sm shadow-black/5">
          <Search size={20} color="#7A859D" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search chats..."
            placeholderTextColor="#72809B"
            className="flex-1 text-[16px] text-[#25314D]"
          />
        </View>
      </View>

      <View className="bg-white">
        {filteredConversations.map((conversation) => (
          <TouchableOpacity
            key={conversation.id}
            onPress={() => onSelectConversation(conversation.id)}
            className="flex-row items-center gap-3 border-b border-[#E7EAF2] px-4 py-4"
          >
            <View className="relative h-14 w-14 items-center justify-center rounded-full border-2 border-[#6C86D8] bg-[#B7C4EC]">
              <Text className="text-[20px] font-bold text-[#24314A]">{conversation.name[0]}</Text>
              {conversation.isActive && <View className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-[#0B9D67]" />}
            </View>

            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-1">
                  <Text className="text-[17px] font-extrabold text-[#182847]">
                    {conversation.name}, {conversation.age}
                  </Text>
                  {conversation.verified && <Text className="text-[#15A56A] text-[15px]">✓</Text>}
                </View>
                <Text className="text-[14px] text-[#67748D]">{conversation.timestamp}</Text>
              </View>

              <Text className="mt-1 text-[15px] text-[#5B667E]" numberOfLines={1}>
                {conversation.lastMessage}
              </Text>

              <View className="mt-1.5 flex-row items-center gap-1">
                <MapPin size={12} color="#EC407A" />
                <Text className="text-[14px] text-[#2656E8]">{conversation.destination}</Text>
              </View>
            </View>

            {conversation.unread > 0 && (
              <View className="h-7 w-7 items-center justify-center rounded-full bg-[#2647B8]">
                <Text className="text-[12px] font-bold text-white">{conversation.unread}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function ConversationDetailView({ conversation, chatMessages, onBack }: { conversation: typeof conversations[0]; chatMessages: typeof messages[1]; onBack: () => void }) {
  const [messageText, setMessageText] = useState('');
  const [shareLocation, setShareLocation] = useState(false);

  return (
    <View className="flex-1 bg-white">
      <View className="bg-white px-4 pt-4 pb-3 border-b border-[#E7EAF2]">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={onBack} className="h-11 w-11 items-center justify-center rounded-full">
            <ArrowLeft size={24} color="#2647B8" />
          </TouchableOpacity>

          <View className="flex-1 items-center">
            <View className="flex-row items-center gap-3">
              <View className="h-14 w-14 items-center justify-center rounded-full border-2 border-[#6C86D8] bg-[#B7C4EC]">
                <Text className="text-[20px] font-bold text-[#24314A]">{conversation.name[0]}</Text>
              </View>
              <View>
                <View className="flex-row items-center gap-1">
                  <Text className="text-[18px] font-extrabold text-[#182847]">{conversation.name}, {conversation.age}</Text>
                  {conversation.verified && <Text className="text-[#15A56A] text-[15px]">✓</Text>}
                </View>
                <Text className="text-[14px] text-[#2656E8]">Active now</Text>
              </View>
            </View>
          </View>

          <View className="flex-row items-center gap-4">
            <TouchableOpacity>
              <Phone size={20} color="#2647B8" />
            </TouchableOpacity>
            <TouchableOpacity>
              <Video size={21} color="#2647B8" />
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-4 flex-row gap-3">
          <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-[#EFF2FB] px-3 py-2.5">
            <MapPin size={14} color="#79839B" />
            <Text className="text-[14px] text-[#67748D]">Location</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-[#FFF4D7] px-3 py-2.5">
            <AlertTriangle size={14} color="#D97706" />
            <Text className="text-[14px] text-[#D99212]">Warning</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1 flex-row items-center justify-center gap-2 rounded-full bg-[#FADADF] px-3 py-2.5">
            <Flag size={14} color="#DC2626" />
            <Text className="text-[14px] text-[#D94A57]">Report</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 16 }}>
        {chatMessages.map((message) => (
          <View key={message.id} className={`mb-4 flex-row ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <View
              className={`max-w-[78%] rounded-[22px] px-4 py-3 ${
                message.sender === 'user' ? 'rounded-br-md bg-[#2647B8]' : 'rounded-bl-md border border-[#E5E8EF] bg-[#F6F7FB]'
              }`}>
              <Text className={`text-[17px] leading-6 ${message.sender === 'user' ? 'text-white' : 'text-[#182847]'}`}>{message.text}</Text>
              <Text className={`mt-1 text-[14px] ${message.sender === 'user' ? 'text-white/80' : 'text-[#7B849A]'}`}>{message.timestamp}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {shareLocation && (
        <View className="flex-row items-center gap-2 border-y border-[#DDE4FA] bg-[#EFF3FF] px-4 py-2">
          <View className="h-2.5 w-2.5 rounded-full bg-[#2647B8]" />
          <Text className="flex-1 text-[13px] text-[#2647B8]">📍 Sharing your location with {conversation.name}</Text>
        </View>
      )}

      <View className="border-t border-[#E7EAF2] bg-white px-4 py-3">
        <View className="mb-3 flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => setShareLocation(!shareLocation)}
            className={`rounded-full px-4 py-2 ${shareLocation ? 'bg-[#DDE4FA]' : 'bg-[#EEF1F7]'}`}
          >
            <Text className={`text-[13px] font-semibold ${shareLocation ? 'text-[#2647B8]' : 'text-[#67748D]'}`}>Location</Text>
          </TouchableOpacity>
        </View>
        <View className="flex-row items-center gap-2">
          <TextInput
            className="flex-1 rounded-full border border-[#E1E5EE] bg-[#F5F7FB] px-4 py-3 text-[16px] text-[#25314D]"
            placeholder="Type message..."
            placeholderTextColor="#9CA3AF"
            value={messageText}
            onChangeText={setMessageText}
          />
          <TouchableOpacity className="h-12 w-12 items-center justify-center rounded-full bg-[#2647B8]">
            <Send size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId);

  if (selectedConversation && selectedConversationId) {
    return (
      <ConversationDetailView
        conversation={selectedConversation}
        chatMessages={messages[selectedConversationId] || []}
        onBack={() => setSelectedConversationId(null)}
      />
    );
  }

  return <ConversationListView onSelectConversation={setSelectedConversationId} />;
}
