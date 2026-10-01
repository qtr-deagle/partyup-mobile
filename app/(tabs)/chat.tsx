import { ReportUserModal } from '@/components/ReportUserModal';
import { EmptyState, enterFromBelow, PopIn, SkeletonRow } from '@/components/ui/motion';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { setActiveChatThread } from '@/lib/active-chat';
import { parseTimestamp } from '@/lib/datetime';
import { ensureAcceptedDirectThreads, getChatMessages, getThreadReceipts, listDirectConversations, markThreadRead, messageStatus, sendChatMessage, type ChatMessage, type Conversation, type MessageStatus, type ThreadReceipts } from '@/lib/social';
import { feedback } from '@/lib/sounds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock3, MessageCircle, MoreVertical, Search, Send, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

// A message on screen: `pending` marks one still in flight from this device,
// and `localKey` keeps its React key stable once the server copy replaces it.
type ScreenMessage = ChatMessage & { pending?: 'sending' | 'failed'; localKey?: string };

// How long a "typing…" signal lasts without a refresh from the other side.
const TYPING_TIMEOUT_MS = 4000;
const TYPING_RESEND_MS = 2500;
const SEEN_COLOR = '#7DD3FC';

function formatTime(value: string | null) {
  return value ? parseTimestamp(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '';
}

function StatusTick({ status, color, size = 14 }: { status: MessageStatus; color: string; size?: number }) {
  if (status === 'sending') return <Clock3 size={size - 2} color={color} />;
  if (status === 'failed') return <AlertCircle size={size} color="#FCA5A5" />;
  if (status === 'sent') return <Check size={size} color={color} strokeWidth={2.5} />;
  return <CheckCheck size={size} color={status === 'seen' ? SEEN_COLOR : color} strokeWidth={2.5} />;
}

const STATUS_LABELS: Record<MessageStatus, string> = {
  sending: 'Sending…',
  failed: 'Not sent · Tap to retry',
  sent: 'Sent',
  delivered: 'Delivered',
  seen: 'Seen',
};

function TypingDot({ index, color }: { index: number; color: string }) {
  const lift = useSharedValue(0);
  useEffect(() => {
    lift.set(withDelay(index * 150, withRepeat(withSequence(withTiming(-4, { duration: 280 }), withTiming(0, { duration: 280 }), withTiming(0, { duration: 260 })), -1)));
  }, [index, lift]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, style]} />;
}

function Avatar({ name, url, size = 48 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} transition={200} />;
  }
  return (
    <View className="items-center justify-center rounded-full bg-[#B7C4EC]" style={{ width: size, height: size }}>
      <Text className="text-lg font-bold text-[#24314A]">{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export default function ChatScreen() {
  const params = useLocalSearchParams<{ threadId?: string }>();
  const { session } = useAuth();
  const myUserId = session?.user.id;
  const isDark = useColorScheme() === 'dark';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ScreenMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<ThreadReceipts>({ readAt: null, deliveredAt: null });
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherHere, setOtherHere] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  // Last ?threadId applied, so a later push for a different chat still opens it.
  const appliedThreadParam = useRef<string | null>(null);
  // Messages present when a chat opens render instantly; only new ones animate in.
  const [initialMessageIds, setInitialMessageIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<ScrollView>(null);
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
        if (params.threadId && appliedThreadParam.current !== params.threadId) {
          appliedThreadParam.current = params.threadId;
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
  const { refreshControl } = usePullToRefresh(loadConversations);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  // Tell the in-app notifier which chat is on screen so it stays quiet for it.
  useEffect(() => {
    setActiveChatThread(selected?.thread_id ?? null);
    return () => setActiveChatThread(null);
  }, [selected?.thread_id]);

  // Keep the list's previews, ticks and unread counts live while it's showing.
  useEffect(() => {
    if (selected || !myUserId) return;
    const refresh = () => {
      void listDirectConversations().then((result) => {
        if (!result.error) setConversations(result.data);
      });
    };
    const channel = supabase
      .channel(uniqueChannelName(`chat-list:${myUserId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_participants' }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selected, myUserId]);

  useEffect(() => {
    if (!selected || !myUserId) return;
    let active = true;
    const threadId = selected.thread_id;
    void getChatMessages(threadId).then((result) => {
      if (active && !result.error) {
        setInitialMessageIds(new Set(result.data.map((message) => message.id)));
        setMessages(result.data);
      }
      void markThreadRead(threadId);
    });
    void getThreadReceipts(threadId, selected.other_user_id).then((result) => {
      if (active && !result.error) setReceipts(result.data);
    });

    const channel = supabase
      .channel(`chat:${threadId}`, { config: { presence: { key: myUserId } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const incoming = payload.new as ChatMessage;
        setMessages((current) => {
          if (current.some((message) => message.id === incoming.id)) return current;
          // Realtime can beat the insert's own response; swap it in for the optimistic copy.
          const pendingIndex = incoming.sender_id === myUserId ? current.findIndex((message) => message.pending === 'sending' && message.body === incoming.body) : -1;
          if (pendingIndex === -1) return [...current, incoming];
          const next = [...current];
          next[pendingIndex] = { ...incoming, localKey: current[pendingIndex].localKey };
          return next;
        });
        if (incoming.sender_id !== myUserId) {
          feedback.received();
          setOtherTyping(false);
        }
        void markThreadRead(threadId);
      })
      // The other person's delivered/seen marks.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_participants', filter: `thread_id=eq.${threadId}` }, (payload) => {
        const row = payload.new as { user_id: string; last_read_at: string | null; last_delivered_at: string | null };
        if (row.user_id !== myUserId) setReceipts({ readAt: row.last_read_at, deliveredAt: row.last_delivered_at });
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.user_id === myUserId) return;
        if (typingTimer.current) clearTimeout(typingTimer.current);
        setOtherTyping(Boolean(payload?.typing));
        if (payload?.typing) typingTimer.current = setTimeout(() => setOtherTyping(false), TYPING_TIMEOUT_MS);
      })
      .on('presence', { event: 'sync' }, () => {
        setOtherHere(Object.keys(channel.presenceState()).some((key) => key !== myUserId));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ online_at: new Date().toISOString() });
      });
    channelRef.current = channel;

    return () => {
      active = false;
      channelRef.current = null;
      lastTypingSent.current = 0;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [selected, myUserId]);

  function broadcastTyping(typing: boolean) {
    void channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: myUserId, typing } });
  }

  function handleChangeText(text: string) {
    setMessageText(text);
    const now = Date.now();
    if (text.trim() && now - lastTypingSent.current > TYPING_RESEND_MS) {
      lastTypingSent.current = now;
      broadcastTyping(true);
    } else if (!text.trim() && lastTypingSent.current) {
      lastTypingSent.current = 0;
      broadcastTyping(false);
    }
  }

  function openConversation(conversation: Conversation) {
    feedback.select();
    setMessages([]);
    setErrorMessage(null);
    setReceipts({ readAt: conversation.other_last_read_at, deliveredAt: conversation.other_last_delivered_at });
    setOtherTyping(false);
    setOtherHere(false);
    setSelected(conversation);
  }

  function closeConversation() {
    setSelected(null);
    setMessages([]);
    setReceipts({ readAt: null, deliveredAt: null });
    setOtherTyping(false);
    setOtherHere(false);
    void loadConversations();
  }

  // Shows the message immediately as "Sending…", then swaps in the saved row.
  async function deliver(body: string, localKey: string) {
    if (!selected || !myUserId) return;
    const { data, error } = await sendChatMessage(selected.thread_id, myUserId, body);
    if (error || !data) {
      feedback.error();
      setMessages((current) => current.map((message) => (message.localKey === localKey && message.pending ? { ...message, pending: 'failed' } : message)));
      return;
    }
    feedback.sent();
    setMessages((current) => {
      const index = current.findIndex((message) => message.localKey === localKey);
      if (index === -1 || !current[index].pending) return current;
      // Realtime already delivered the saved copy under its own key.
      if (current.some((message) => message.id === data.id)) return current.filter((_, i) => i !== index);
      const next = [...current];
      next[index] = { ...data, localKey };
      return next;
    });
  }

  function sendMessage() {
    const body = messageText.trim();
    if (!body || !selected || !myUserId) return;
    const localKey = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setMessages((current) => [
      ...current,
      { id: localKey, localKey, thread_id: selected.thread_id, sender_id: myUserId, body, message_type: 'text', created_at: new Date().toISOString(), pending: 'sending' },
    ]);
    setMessageText('');
    setErrorMessage(null);
    lastTypingSent.current = 0;
    broadcastTyping(false);
    void deliver(body, localKey);
  }

  function retryMessage(message: ScreenMessage) {
    if (message.pending !== 'failed' || !message.localKey) return;
    const localKey = message.localKey;
    setMessages((current) => current.map((item) => (item.localKey === localKey ? { ...item, pending: 'sending' } : item)));
    void deliver(message.body, localKey);
  }

  function statusOf(message: ScreenMessage): MessageStatus {
    return message.pending ?? messageStatus(message.created_at, receipts);
  }

  const lastMineIndex = messages.reduce((found, message, index) => (message.sender_id === myUserId ? index : found), -1);
  const canSend = messageText.trim().length > 0;
  const sendButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(canSend ? 1 : 0.86, { damping: 14, stiffness: 220 }) }],
    opacity: withSpring(canSend ? 1 : 0.5),
  }));

  if (selected) {
    return (
      <KeyboardAvoidingView className={`flex-1 ${screenBackground}`} behavior="padding">
        <View className={`flex-row items-center gap-3 border-b px-4 py-3 ${borderColor}`}>
          <TouchableOpacity onPress={closeConversation} hitSlop={10}>
            <ArrowLeft size={24} color="#284BD6" />
          </TouchableOpacity>
          <Avatar name={selected.display_name} url={selected.avatar_url} size={40} />
          <View className="flex-1">
            <Text numberOfLines={1} className={`text-lg font-bold ${titleColor}`}>{selected.display_name}</Text>
            {otherTyping ? (
              <Text className="text-xs font-semibold text-[#284BD6]">typing…</Text>
            ) : otherHere ? (
              <View className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full bg-[#10B981]" />
                <Text className={`text-xs ${textSecondary}`}>In this chat now</Text>
              </View>
            ) : (
              <Text className={`text-xs ${textSecondary}`}>Direct chat</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => setMenuVisible(true)} accessibilityLabel="Chat options" hitSlop={10}>
            <MoreVertical size={23} color={isDark ? '#E2E8F0' : '#182847'} />
          </TouchableOpacity>
        </View>
        <View className={`flex-row items-center gap-2 border-b px-4 py-2.5 ${borderColor} ${panelBackground}`}>
          <ShieldCheck size={16} color="#10B981" />
          <Text className={`flex-1 text-xs leading-5 ${textSecondary}`}>Keep plans and payments inside PartyUp. Never share OTP codes or passwords in chat.</Text>
        </View>
        {errorMessage ? <Text className="m-4 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingVertical: 16 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 ? (
            <Animated.View key="empty-chat" entering={FadeIn.delay(250)} className="items-center pt-16">
              <Text className="text-4xl">👋</Text>
              <Text className={`mt-3 text-center text-sm ${textSecondary}`}>Say hi to {selected.display_name.split(' ')[0]}!</Text>
            </Animated.View>
          ) : null}
          {messages.map((message, index) => {
            const mine = message.sender_id === myUserId;
            const isNew = !initialMessageIds.has(message.id);
            const status = mine ? statusOf(message) : null;
            const failed = status === 'failed';
            // Messenger-style: spell out the status under my latest message only.
            const showStatusLabel = mine && index === lastMineIndex;
            return (
              <Animated.View
                key={message.localKey ?? message.id}
                entering={isNew ? FadeInUp.springify().damping(16) : undefined}
                layout={LinearTransition.springify().damping(18)}
                className={`mb-2.5 ${mine ? 'items-end' : 'items-start'}`}>
                <Pressable
                  disabled={!failed}
                  onPress={() => retryMessage(message)}
                  className={`max-w-[80%] px-4 py-2.5 ${mine ? `rounded-2xl rounded-br-md ${failed ? 'bg-[#284BD6]/60' : 'bg-[#284BD6]'}` : `rounded-2xl rounded-bl-md border ${borderColor} ${panelBackground}`}`}>
                  <Text className={`text-base ${mine ? 'text-white' : textPrimary}`}>{message.body}</Text>
                  <View className={`mt-1 flex-row items-center gap-1 ${mine ? 'justify-end' : ''}`}>
                    <Text className={`text-[11px] ${mine ? 'text-white/70' : textSecondary}`}>{formatTime(message.created_at)}</Text>
                    {status ? <StatusTick status={status} color="rgba(255,255,255,0.7)" /> : null}
                  </View>
                </Pressable>
                {showStatusLabel && status ? (
                  <Animated.View key={`status-${status}`} entering={FadeIn.duration(200)} className="mt-1 flex-row items-center gap-1 pr-1">
                    {status === 'seen' ? <Avatar name={selected.display_name} url={selected.avatar_url} size={14} /> : null}
                    <Text className={`text-[11px] ${failed ? 'font-semibold text-[#DC2626]' : textSecondary}`}>
                      {STATUS_LABELS[status]}{status === 'seen' && receipts.readAt ? ` ${formatTime(receipts.readAt)}` : ''}
                    </Text>
                  </Animated.View>
                ) : null}
              </Animated.View>
            );
          })}
          {otherTyping ? (
            <Animated.View key="typing-indicator" entering={FadeInUp.duration(180)} exiting={FadeOut.duration(150)} className="mb-2.5 flex-row items-end gap-2">
              <Avatar name={selected.display_name} url={selected.avatar_url} size={24} />
              <View className={`flex-row items-center gap-1.5 rounded-2xl rounded-bl-md border px-4 py-3.5 ${borderColor} ${panelBackground}`}>
                {[0, 1, 2].map((dot) => <TypingDot key={dot} index={dot} color={isDark ? '#94A3B8' : '#7A859D'} />)}
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>
        <View className={`flex-row items-center gap-2 border-t px-4 py-3 ${borderColor}`}>
          <TextInput
            value={messageText}
            onChangeText={handleChangeText}
            onSubmitEditing={sendMessage}
            placeholder="Type a message"
            placeholderTextColor="#94A3B8"
            returnKeyType="send"
            className={`flex-1 rounded-full border px-4 py-3 ${borderColor} ${panelBackground} ${textPrimary}`}
          />
          <Animated.View style={sendButtonStyle}>
            <TouchableOpacity onPress={sendMessage} disabled={!canSend} className="h-12 w-12 items-center justify-center rounded-full bg-[#284BD6]">
              <Send size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        </View>
        <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
          <Pressable className="flex-1 bg-black/30" onPress={() => setMenuVisible(false)}>
            <View className={`absolute right-4 top-16 w-64 rounded-2xl p-2 shadow-lg ${isDark ? 'bg-[#252525]' : 'bg-white'}`}>
              <Text className={`px-3 py-2 text-sm font-bold ${textPrimary}`}>{selected.display_name}</Text>
              <TouchableOpacity onPress={() => { setMenuVisible(false); setReportModalVisible(true); }} className="px-3 py-3">
                <Text className="text-base text-[#DC2626]">Report</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
        <ReportUserModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          isDark={isDark}
          reportedUserId={selected.other_user_id}
          targetDisplayName={selected.display_name}
        />
      </KeyboardAvoidingView>
    );
  }

  const query = search.trim().toLowerCase();
  const visibleConversations = query ? conversations.filter((conversation) => conversation.display_name.toLowerCase().includes(query)) : conversations;
  const newFriends = visibleConversations.filter((conversation) => !conversation.last_message);
  const showSkeleton = loading && conversations.length === 0;

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28" refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
      <View className={`border-b px-4 pb-4 pt-5 ${borderColor}`}>
        <Text className={`${typography.pageTitle} ${titleColor}`}>Messages</Text>
        <View className={`mt-4 flex-row items-center gap-3 rounded-full border px-4 py-3 ${borderColor} ${panelBackground}`}>
          <Search size={19} color="#7A859D" />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search chats" placeholderTextColor="#94A3B8" className={`flex-1 ${textPrimary}`} />
        </View>
      </View>
      {errorMessage ? <Text className="m-4 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
      {showSkeleton ? (
        <View className="px-4 pt-3">
          {[0, 1, 2, 3, 4].map((index) => <SkeletonRow key={index} />)}
        </View>
      ) : null}
      {!loading && !conversations.length ? (
        <EmptyState icon={<MessageCircle size={34} color="#3B82F6" />} title="No conversations yet" message="Add a friend to start chatting." />
      ) : null}

      {newFriends.length > 0 ? (
        <View className="pt-5">
          <Text className={`px-4 text-sm font-bold ${textPrimary}`}>New friends • say hi! 👋</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingTop: 12 }}>
            {newFriends.map((conversation, index) => (
              <Animated.View key={conversation.thread_id} entering={enterFromBelow(index)}>
                <TouchableOpacity onPress={() => openConversation(conversation)} className="w-16 items-center">
                  <Avatar name={conversation.display_name} url={conversation.avatar_url} size={56} />
                  <Text numberOfLines={1} className={`mt-1 text-center text-xs ${textSecondary}`}>{conversation.display_name.split(' ')[0]}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View className="px-4 pt-4">
        {visibleConversations.map((conversation, index) => {
          const unread = conversation.unread_count > 0;
          const lastIsMine = Boolean(conversation.last_message) && conversation.last_message_sender_id === myUserId;
          const lastStatus = lastIsMine && conversation.last_message_at
            ? messageStatus(conversation.last_message_at, { readAt: conversation.other_last_read_at, deliveredAt: conversation.other_last_delivered_at })
            : null;
          return (
            <Animated.View key={conversation.thread_id} entering={enterFromBelow(index)}>
              <TouchableOpacity onPress={() => openConversation(conversation)} className={`flex-row items-center gap-3 border-b px-1 py-3.5 ${borderColor}`}>
                <Avatar name={conversation.display_name} url={conversation.avatar_url} />
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text numberOfLines={1} className={`flex-1 text-base ${unread ? 'font-bold' : 'font-semibold'} ${textPrimary}`}>{conversation.display_name}</Text>
                    {conversation.last_message_at ? <Text className={`ml-2 text-xs ${unread ? 'font-bold text-[#284BD6]' : textSecondary}`}>{formatTime(conversation.last_message_at)}</Text> : null}
                  </View>
                  <View className="mt-0.5 flex-row items-center gap-1">
                    {lastIsMine && lastStatus ? <StatusTick status={lastStatus} color={isDark ? '#94A3B8' : '#67748D'} size={15} /> : null}
                    <Text numberOfLines={1} className={`flex-1 ${!conversation.last_message ? 'font-medium text-[#284BD6]' : unread ? `font-bold ${textPrimary}` : `font-normal ${textSecondary}`}`}>
                      {conversation.last_message ? `${lastIsMine ? 'You: ' : ''}${conversation.last_message}` : 'Say hi to your new friend 👋'}
                    </Text>
                  </View>
                </View>
                {unread ? (
                  <PopIn className="h-6 min-w-6 items-center justify-center rounded-full bg-[#284BD6] px-1.5">
                    <Text className="text-xs font-bold text-white">{conversation.unread_count}</Text>
                  </PopIn>
                ) : null}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
        {query && visibleConversations.length === 0 && conversations.length > 0 ? (
          <Text className={`pt-8 text-center text-sm ${textSecondary}`}>No chats match “{search.trim()}”.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
