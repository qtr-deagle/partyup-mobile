import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { parseTimestamp } from '@/lib/datetime';
import { ensureAcceptedDirectThreads, getChatMessages, listDirectConversations, markThreadRead, sendChatMessage, type ChatMessage, type Conversation } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import { useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Info, MessageCircle, MoreVertical, Search, Send } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

function formatTime(value: string | null) {
  return value ? parseTimestamp(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '';
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ threadId?: string }>();
  const { session } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const appliedThreadParam = useRef(false);
  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-white';
  const borderColor = isDark ? 'border-[#22324B]' : 'border-[#E7EAF2]';
  const panelBackground = isDark ? 'bg-[#111B2E]' : 'bg-[#F6F7FB]';
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const { titleColor } = getTheme(isDark);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const ensureResult = await ensureAcceptedDirectThreads();
      if (ensureResult.error) {
        setErrorMessage(ensureResult.error.message);
        return;
      }
      const result = await listDirectConversations();
      if (result.error) setErrorMessage(result.error.message);
      else {
        setConversations(result.data);
        if (params.threadId && !appliedThreadParam.current) {
          appliedThreadParam.current = true;
          const matchingConversation = result.data.find((conversation) => conversation.thread_id === params.threadId);
          if (matchingConversation) setSelected(matchingConversation);
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load conversations.');
    } finally {
      setLoading(false);
    }
  }, [params.threadId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void getChatMessages(selected.thread_id).then((result) => {
      if (active && !result.error) setMessages(result.data);
      void markThreadRead(selected.thread_id);
    });
    const channel = supabase.channel(`chat:${selected.thread_id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${selected.thread_id}` }, (payload) => {
      const incoming = payload.new as ChatMessage;
      setMessages((current) => current.some((message) => message.id === incoming.id) ? current : [...current, incoming]);
      void markThreadRead(selected.thread_id);
    }).subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [selected]);

  async function openConversation(conversation: Conversation) {
    setSelected(conversation);
    setErrorMessage(null);
    const result = await getChatMessages(conversation.thread_id);
    if (result.error) setErrorMessage(result.error.message);
    else setMessages(result.data);
    await markThreadRead(conversation.thread_id);
  }

  async function sendMessage() {
    const body = messageText.trim();
    if (!body || !selected || !session?.user.id) return;
    setSending(true);
    const { error } = await sendChatMessage(selected.thread_id, session.user.id, body);
    setSending(false);
    if (error) setErrorMessage(error.message);
    else setMessageText('');
  }

  if (selected) {
    return (
      <View className={`flex-1 ${screenBackground}`}>
        <View className={`flex-row items-center gap-3 border-b px-4 py-4 ${borderColor}`}><TouchableOpacity onPress={() => { setSelected(null); void loadConversations(); }}><ArrowLeft size={24} color="#284BD6" /></TouchableOpacity><View className="flex-1"><Text className={`${typography.sectionTitle} ${titleColor}`}>{selected.display_name}</Text><Text className={`text-sm ${textSecondary}`}>Direct chat</Text></View><TouchableOpacity onPress={() => setMenuVisible(true)} accessibilityLabel="Chat options"><MoreVertical size={23} color={isDark ? '#E2E8F0' : '#182847'} /></TouchableOpacity></View>
        <View className={`flex-row items-start gap-2 border-b px-4 py-3 ${borderColor} ${panelBackground}`}><Info size={17} color="#7A8DAE" /><Text className={`flex-1 text-xs leading-5 ${textSecondary}`}>Messages and calls are secured with end-to-end encryption. Only people in this chat can read, listen to, or share them. Learn more</Text></View>
        {errorMessage ? <Text className="m-4 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 16 }}>{messages.map((message) => { const mine = message.sender_id === session?.user.id; return <View key={message.id} className={`mb-3 flex-row ${mine ? 'justify-end' : 'justify-start'}`}><View className={`max-w-[80%] rounded-2xl px-4 py-3 ${mine ? 'bg-[#284BD6]' : `border ${borderColor} ${panelBackground}`}`}><Text className={`text-base ${mine ? 'text-white' : textPrimary}`}>{message.body}</Text><Text className={`mt-1 text-xs ${mine ? 'text-white/75' : textSecondary}`}>{formatTime(message.created_at)}</Text></View></View>; })}</ScrollView>
        <View className={`flex-row items-center gap-2 border-t px-4 py-3 ${borderColor}`}><TextInput value={messageText} onChangeText={setMessageText} onSubmitEditing={() => void sendMessage()} placeholder="Type a message" placeholderTextColor="#94A3B8" className={`flex-1 rounded-full border px-4 py-3 ${borderColor} ${panelBackground} ${textPrimary}`} /><TouchableOpacity onPress={() => void sendMessage()} disabled={sending} className="h-12 w-12 items-center justify-center rounded-full bg-[#284BD6]">{sending ? <ActivityIndicator color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}</TouchableOpacity></View>
        <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}><Pressable className="flex-1 bg-black/30" onPress={() => setMenuVisible(false)}><View className={`absolute right-4 top-16 w-64 rounded-2xl p-2 shadow-lg ${isDark ? 'bg-[#252525]' : 'bg-white'}`}><Text className={`px-3 py-2 text-sm font-bold ${textPrimary}`}>{selected.display_name}</Text>{['Mark as unread', 'Mute notifications', 'Report', 'Delete chat'].map((option) => <TouchableOpacity key={option} onPress={() => setMenuVisible(false)} className="px-3 py-3"><Text className={`text-base ${textPrimary}`}>{option}</Text></TouchableOpacity>)}</View></Pressable></Modal>
      </View>
    );
  }

  const newFriends = conversations.filter((conversation) => !conversation.last_message);

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      <View className={`border-b px-4 pb-4 pt-5 ${borderColor}`}><Text className={`${typography.pageTitle} ${titleColor}`}>Messages</Text><View className={`mt-4 flex-row items-center gap-3 rounded-full border px-4 py-3 ${borderColor} ${panelBackground}`}><Search size={19} color="#7A859D" /><TextInput placeholder="Search chats" placeholderTextColor="#94A3B8" className={`flex-1 ${textPrimary}`} /></View></View>
      {errorMessage ? <Text className="m-4 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
      {loading ? <ActivityIndicator className="mt-8" color="#284BD6" /> : null}
      {!loading && !conversations.length ? <View className="items-center px-8 pt-16"><MessageCircle size={40} color="#94A3B8" /><Text className={`mt-4 text-center text-base ${textSecondary}`}>No conversations yet. Add a friend to start chatting.</Text></View> : null}

      {!loading && newFriends.length > 0 ? (
        <View className="pt-5">
          <Text className={`px-4 text-sm font-bold ${textPrimary}`}>New friends • say hi! 👋</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingTop: 12 }}>
            {newFriends.map((conversation) => (
              <TouchableOpacity key={conversation.thread_id} onPress={() => void openConversation(conversation)} className="w-16 items-center">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-[#B7C4EC]"><Text className="text-lg font-bold text-[#24314A]">{conversation.display_name.charAt(0).toUpperCase()}</Text></View>
                <Text numberOfLines={1} className={`mt-1 text-center text-xs ${textSecondary}`}>{conversation.display_name.split(' ')[0]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View className="gap-2 px-4 pt-4">{conversations.map((conversation) => { const unread = conversation.unread_count > 0; return <TouchableOpacity key={conversation.thread_id} onPress={() => void openConversation(conversation)} className={`flex-row items-center gap-3 border-b px-1 py-4 ${borderColor}`}><View className="h-12 w-12 items-center justify-center rounded-full bg-[#B7C4EC]"><Text className="text-lg font-bold text-[#24314A]">{conversation.display_name.charAt(0).toUpperCase()}</Text></View><View className="flex-1"><Text className={`text-lg ${unread ? 'font-bold' : 'font-semibold'} ${textPrimary}`}>{conversation.display_name}</Text><Text numberOfLines={1} className={`mt-1 ${!conversation.last_message ? 'font-medium text-[#284BD6]' : unread ? `font-bold ${textPrimary}` : `font-normal ${textSecondary}`}`}>{conversation.last_message ?? 'Say hi to your new friend 👋'}</Text></View>{unread ? <View className="h-7 w-7 items-center justify-center rounded-full bg-[#284BD6]"><Text className="text-xs font-bold text-white">{conversation.unread_count}</Text></View> : null}</TouchableOpacity>; })}</View>
    </ScrollView>
  );
}
