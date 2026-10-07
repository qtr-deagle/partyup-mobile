import { ChatInfoSheet } from '@/components/ChatInfoSheet';
import { Composer, QUICK_REACTION } from '@/components/chat/Composer';
import { MessageActionsSheet } from '@/components/chat/MessageActionsSheet';
import { formatTime, MessageBubble, messageSummary, StatusTick } from '@/components/chat/MessageBubble';
import { PhotoViewer } from '@/components/chat/PhotoViewer';
import { GuildEmblem } from '@/components/GuildEmblem';
import { ReportUserModal } from '@/components/ReportUserModal';
import { EmptyState, enterFromBelow, PopIn, riseIn, SkeletonRow } from '@/components/ui/motion';
import { useHideTabBarOnScroll, useHideTabBarWhile } from '@/components/ui/tab-bar-visibility';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useThreadMessages, type ScreenMessage } from '@/hooks/use-thread-messages';
import { setActiveChatThread } from '@/lib/active-chat';
import { blockUser } from '@/lib/blocking';
import { pickChatPhoto, type PickedPhoto } from '@/lib/chat-media';
import { getGuildChatPreview, type GuildChatPreview } from '@/lib/guilds';
import {
  clearChatForMe,
  ensureAcceptedDirectThreads,
  getThreadReceipts,
  listDirectConversations,
  listGroupConversations,
  messageStatus,
  removeFriend,
  setChatMuted,
  setChatPinned,
  type ChatMessage,
  type Conversation,
  type GroupConversation,
  type MessageStatus,
  type ThreadReceipts,
} from '@/lib/social';
import { feedback } from '@/lib/sounds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, BellOff, Car, Info, Map as MapIcon, MessageCircle, Pin, Search, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// How long a "typing…" signal lasts without a refresh from the other side.
const TYPING_TIMEOUT_MS = 4000;
const TYPING_RESEND_MS = 2500;

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
  const isDark = useColorScheme() === 'dark';
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} transition={200} />;
  }
  return (
    <View className="items-center justify-center rounded-full" style={{ width: size, height: size, backgroundColor: isDark ? '#22324B' : '#DCE5FF' }}>
      <Text className="font-black" style={{ color: isDark ? '#CBD5E1' : '#284BD6', fontSize: Math.max(size * 0.4, 8) }}>{name.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

type ListFilter = 'all' | 'unread' | 'groups';

function previewText(type: ChatMessage['message_type'] | null, body: string | null, deleted: boolean, mine: boolean) {
  if (deleted) return mine ? 'You unsent a message' : 'Unsent a message';
  return type === 'image' ? '📷 Photo' : body ?? '';
}

function conversationPreview(conversation: Conversation, mine: boolean) {
  if (!conversation.last_message_at) return 'Say hi to your new friend 👋';
  const text = previewText(conversation.last_message_type, conversation.last_message, conversation.last_message_deleted, mine);
  return conversation.last_message_deleted ? text : `${mine ? 'You: ' : ''}${text}`;
}

function groupPreview(group: GroupConversation, myUserId: string | undefined) {
  if (!group.last_message_at) return 'Say hi to the group 👋';
  const mine = group.last_message_sender_id === myUserId;
  const text = previewText(group.last_message_type, group.last_message, group.last_message_deleted, mine);
  if (group.last_message_deleted) return text;
  return `${mine ? 'You' : (group.last_sender_name ?? 'Someone').split(' ')[0]}: ${text}`;
}

type ListItem = { kind: 'direct'; conversation: Conversation; pinned: boolean; at: string | null } | { kind: 'group'; group: GroupConversation; pinned: boolean; at: string | null };

export default function ChatScreen() {
  const hideTabBarOnScroll = useHideTabBarOnScroll();
  const params = useLocalSearchParams<{ threadId?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;
  const isDark = useColorScheme() === 'dark';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupConversation[]>([]);
  const [guildChat, setGuildChat] = useState<GuildChatPreview | null>(null);
  const [selected, setSelected] = useState<Conversation | null>(null);
  // The floating bar would cover the composer in an open conversation.
  useHideTabBarWhile(Boolean(selected));
  const [messageText, setMessageText] = useState('');
  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<ThreadReceipts>({ readAt: null, deliveredAt: null });
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherHere, setOtherHere] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [replyTo, setReplyTo] = useState<ScreenMessage | null>(null);
  const [actionTarget, setActionTarget] = useState<ScreenMessage | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  // Mute/pin changes made here win over the (slower) list refresh.
  const [prefOverrides, setPrefOverrides] = useState<Record<string, { muted?: boolean; pinned?: boolean }>>({});
  // Last ?threadId applied, so a later push for a different chat still opens it.
  const appliedThreadParam = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Where each message sits in the list, so tapping a quoted reply can jump to it.
  const messageOffsets = useRef<Record<string, number>>({});
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  // The keyboard also covers the tab bar (same height as in (tabs)/_layout), so
  // only the part above it needs padding to lift the message box into view.
  const keyboardPadding = Math.max(keyboardHeight - (58 + Math.max(insets.bottom, 8)), 0);
  useEffect(() => {
    if (keyboardHeight > 0) scrollRef.current?.scrollToEnd({ animated: true });
  }, [keyboardHeight]);
  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-white';
  const borderColor = isDark ? 'border-[#22324B]' : 'border-[#E7EAF2]';
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const iconMuted = isDark ? '#94A3B8' : '#67748D';
  const softFill = isDark ? '#18253C' : '#F0F2F7';
  const { titleColor } = getTheme(isDark);

  const thread = useThreadMessages({
    threadId: selected?.thread_id ?? null,
    myUserId,
    since: selected?.cleared_at,
    onIncoming: () => setOtherTyping(false),
    onError: setErrorMessage,
  });

  const prefsOf = useCallback(
    (conversation: Conversation) => ({
      muted: prefOverrides[conversation.thread_id]?.muted ?? conversation.muted,
      pinned: prefOverrides[conversation.thread_id]?.pinned ?? conversation.pinned,
    }),
    [prefOverrides],
  );

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const ensureResult = await ensureAcceptedDirectThreads();
      if (ensureResult.error) {
        setErrorMessage(ensureResult.error.message);
        return;
      }
      const [result, groupResult, guildResult] = await Promise.all([
        listDirectConversations(),
        listGroupConversations(),
        myUserId ? getGuildChatPreview(myUserId) : Promise.resolve({ data: null, error: null }),
      ]);
      setGuildChat(guildResult.data);
      if (!groupResult.error) setGroups(groupResult.data);
      if (result.error) setErrorMessage(result.error.message);
      else {
        setConversations(result.data);
        setPrefOverrides({});
        if (params.threadId && appliedThreadParam.current !== params.threadId) {
          appliedThreadParam.current = params.threadId;
          const matchingConversation = result.data.find((conversation) => conversation.thread_id === params.threadId);
          const matchingGroup = groupResult.data.find((group) => group.thread_id === params.threadId);
          if (matchingConversation) setSelected(matchingConversation);
          // Not a direct chat: pushes for group chats land here too.
          else if (matchingGroup) router.push({ pathname: '/trip/chat/[id]', params: { id: matchingGroup.trip_id } });
          else if (guildResult.data?.thread_id === params.threadId) router.push('/guild/chat');
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load conversations.');
    } finally {
      setLoading(false);
    }
  }, [params.threadId, router, myUserId]);
  const { refreshControl } = usePullToRefresh(loadConversations);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const refreshLists = useCallback(() => {
    void listDirectConversations().then((result) => {
      if (!result.error) setConversations(result.data);
    });
    void listGroupConversations().then((result) => {
      if (!result.error) setGroups(result.data);
    });
    if (!myUserId) return;
    void getGuildChatPreview(myUserId).then((result) => {
      if (!result.error) setGuildChat(result.data);
    });
  }, [myUserId]);

  // Coming back from a group chat screen clears its unread badge.
  useFocusEffect(refreshLists);

  // Tell the in-app notifier which chat is on screen so it stays quiet for it.
  useEffect(() => {
    setActiveChatThread(selected?.thread_id ?? null);
    return () => setActiveChatThread(null);
  }, [selected?.thread_id]);

  // Keep the list's previews, ticks and unread counts live while it's showing.
  useEffect(() => {
    if (selected || !myUserId) return;
    const channel = supabase
      .channel(uniqueChannelName(`chat-list:${myUserId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, refreshLists)
      // Unsends change the preview too.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, refreshLists)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_participants' }, refreshLists)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selected, myUserId, refreshLists]);

  // Typing, presence and the other person's delivered/seen marks. Messages
  // themselves come through useThreadMessages.
  useEffect(() => {
    if (!selected || !myUserId) return;
    let active = true;
    const threadId = selected.thread_id;
    void getThreadReceipts(threadId, selected.other_user_id).then((result) => {
      if (active && !result.error) setReceipts(result.data);
    });

    const channel = supabase
      .channel(`chat:${threadId}`, { config: { presence: { key: myUserId } } })
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

  function resetConversationState() {
    setReplyTo(null);
    setActionTarget(null);
    setReceipts({ readAt: null, deliveredAt: null });
    setOtherTyping(false);
    setOtherHere(false);
    messageOffsets.current = {};
  }

  function openConversation(conversation: Conversation) {
    feedback.select();
    resetConversationState();
    setErrorMessage(null);
    setReceipts({ readAt: conversation.other_last_read_at, deliveredAt: conversation.other_last_delivered_at });
    setSelected(conversation);
  }

  function closeConversation() {
    setSelected(null);
    setChatSearchOpen(false);
    setChatSearch('');
    resetConversationState();
    void loadConversations();
  }

  function openProfile() {
    if (!selected) return;
    setMenuVisible(false);
    router.push({ pathname: '/profile/[id]', params: { id: selected.other_user_id, displayName: selected.display_name, avatarUrl: selected.avatar_url ?? '' } });
  }

  function confirmBlock() {
    if (!selected) return;
    const target = selected;
    setMenuVisible(false);
    Alert.alert(`Block ${target.display_name}?`, "You won't see them in Discover, nearby travelers, or search, and any friend connection will be removed.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () =>
          void blockUser(target.other_user_id).then(({ error }) => {
            if (error) {
              setErrorMessage(error.message);
              return;
            }
            closeConversation();
          }),
      },
    ]);
  }

  function confirmUnfriend() {
    if (!selected) return;
    const target = selected;
    setMenuVisible(false);
    Alert.alert(`Unfriend ${target.display_name}?`, 'You can send them a friend request again later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfriend',
        style: 'destructive',
        onPress: () =>
          void removeFriend(target.other_user_id).then(({ error }) => {
            if (error) {
              setErrorMessage(error.message);
              return;
            }
            closeConversation();
          }),
      },
    ]);
  }

  function confirmDeleteChat() {
    if (!selected) return;
    const target = selected;
    setMenuVisible(false);
    Alert.alert('Delete this chat?', `This removes the conversation with ${target.display_name} for you only. They'll still see it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void clearChatForMe(target.thread_id).then(({ error }) => {
            if (error) {
              setErrorMessage(error.message);
              return;
            }
            closeConversation();
          }),
      },
    ]);
  }

  function togglePref(kind: 'muted' | 'pinned') {
    if (!selected) return;
    const threadId = selected.thread_id;
    const next = !prefsOf(selected)[kind];
    feedback.select();
    setPrefOverrides((current) => ({ ...current, [threadId]: { ...current[threadId], [kind]: next } }));
    void (kind === 'muted' ? setChatMuted(threadId, next) : setChatPinned(threadId, next)).then(({ error }) => {
      if (!error) return;
      setErrorMessage(error.message);
      setPrefOverrides((current) => ({ ...current, [threadId]: { ...current[threadId], [kind]: !next } }));
    });
  }

  function queue(body: string, photo?: PickedPhoto) {
    setErrorMessage(null);
    thread.queueMessage(body, { photo, replyTo });
    setReplyTo(null);
  }

  function sendMessage() {
    const body = messageText.trim();
    if (!body) return;
    setMessageText('');
    lastTypingSent.current = 0;
    broadcastTyping(false);
    queue(body);
  }

  async function sendPhoto(source: 'camera' | 'library') {
    const photo = await pickChatPhoto(source);
    if (photo) queue('', photo);
  }

  function handlePressMessage(message: ScreenMessage) {
    if (message.pending === 'failed') {
      thread.retry(message);
      return;
    }
    if (message.message_type === 'image' && !message.deleted_at) {
      const uri = thread.photoUriFor(message);
      if (uri) setViewerUri(uri);
    }
  }

  function confirmUnsend(message: ScreenMessage) {
    setActionTarget(null);
    Alert.alert('Unsend message?', 'It will be removed for everyone in this chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unsend',
        style: 'destructive',
        onPress: () => {
          if (replyTo?.id === message.id) setReplyTo(null);
          thread.removeMessage(message);
        },
      },
    ]);
  }

  function jumpTo(messageId: string) {
    const y = messageOffsets.current[messageId];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - 80, 0), animated: true });
  }

  function statusOf(message: ScreenMessage): MessageStatus {
    return message.pending ?? messageStatus(message.created_at, receipts);
  }

  if (selected) {
    const { messages } = thread;
    const prefs = prefsOf(selected);
    const firstName = selected.display_name.split(' ')[0];
    const searchTerm = chatSearchOpen ? chatSearch.trim().toLowerCase() : '';
    const shownMessages = searchTerm ? messages.filter((message) => !message.deleted_at && message.body.toLowerCase().includes(searchTerm)) : messages;
    const lastMineIndex = messages.reduce((found, message, index) => (message.sender_id === myUserId ? index : found), -1);

    const replyLabelFor = (message: ScreenMessage, quoted: ChatMessage) => {
      const quotedMine = quoted.sender_id === myUserId;
      if (message.sender_id === myUserId) return quotedMine ? 'You replied to yourself' : `You replied to ${firstName}`;
      return quotedMine ? `${firstName} replied to you` : `${firstName} replied`;
    };

    return (
      <View className={`flex-1 ${screenBackground}`} style={{ paddingBottom: keyboardPadding }}>
        <View className="flex-row items-center gap-3 px-3 py-2.5" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#16213A' : '#F0F2F7' }}>
          <TouchableOpacity onPress={closeConversation} hitSlop={10} accessibilityLabel="Back to chats" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: softFill }}>
            <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#182847'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openProfile} activeOpacity={0.7} accessibilityLabel={`View ${selected.display_name}'s profile`} className="flex-1 flex-row items-center gap-3">
          <View>
            <Avatar name={selected.display_name} url={selected.avatar_url} size={42} />
            {otherHere ? (
              <Animated.View key="header-online" entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 bg-[#10B981] ${isDark ? 'border-[#0B1220]' : 'border-white'}`} />
            ) : null}
          </View>
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text numberOfLines={1} className={`shrink text-lg font-bold ${titleColor}`}>{selected.display_name}</Text>
              {prefs.muted ? <BellOff size={14} color={iconMuted} /> : null}
            </View>
            {otherTyping ? (
              <Text className="text-xs font-semibold text-[#284BD6]">typing…</Text>
            ) : otherHere ? (
              <View className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full bg-[#10B981]" />
                <Text className={`text-xs ${textSecondary}`}>Active now</Text>
              </View>
            ) : (
              <Text className={`text-xs ${textSecondary}`}>Tap to view profile</Text>
            )}
          </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMenuVisible(true)} accessibilityLabel="Chat info" hitSlop={10} className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: softFill }}>
            <Info size={20} color={isDark ? '#FFFFFF' : '#284BD6'} />
          </TouchableOpacity>
        </View>
        {chatSearchOpen ? (
          <Animated.View key="chat-search" entering={riseIn(0, 220)} className={`flex-row items-center gap-2 border-b px-4 py-2 ${borderColor}`}>
            <View className="flex-1 flex-row items-center gap-2 rounded-full px-3.5 py-2" style={{ backgroundColor: softFill }}>
              <Search size={17} color="#7A859D" />
              <TextInput autoFocus value={chatSearch} onChangeText={setChatSearch} placeholder="Search in conversation" placeholderTextColor="#94A3B8" className="flex-1 py-0" style={{ color: isDark ? '#FFFFFF' : '#182847' }} />
            </View>
            <TouchableOpacity onPress={() => { setChatSearchOpen(false); setChatSearch(''); }} hitSlop={8}>
              <Text className="font-semibold text-[#284BD6]">Done</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : null}
        {errorMessage ? <Text className="m-4 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-4"
          contentContainerStyle={{ paddingVertical: 16 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          <View className="mb-4 flex-row items-start gap-2 self-center rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: isDark ? '#0F2A22' : '#ECFDF5', maxWidth: 340 }}>
            <ShieldCheck size={15} color="#10B981" style={{ marginTop: 1 }} />
            <Text className="flex-1 text-[12px] leading-[17px]" style={{ color: isDark ? '#A7F3D0' : '#047857' }}>Keep plans and payments inside PartyUp. Never share OTP codes or passwords in chat.</Text>
          </View>
          {thread.loaded && messages.length === 0 ? (
            <Animated.View key="empty-chat" entering={FadeIn.delay(250)} className="items-center pt-12">
              <Avatar name={selected.display_name} url={selected.avatar_url} size={84} />
              <Text className="mt-3 text-[18px] font-extrabold" style={{ color: isDark ? '#FFFFFF' : '#182847' }}>{selected.display_name}</Text>
              <Text className={`mt-1 text-center text-sm ${textSecondary}`}>{`You're friends on PartyUp. Say hi to ${firstName}! 👋`}</Text>
            </Animated.View>
          ) : null}
          {searchTerm && shownMessages.length === 0 ? (
            <Text key="no-matches" className={`pt-10 text-center text-sm ${textSecondary}`}>No messages match “{chatSearch.trim()}”.</Text>
          ) : null}
          {shownMessages.map((message, index) => {
            const mine = message.sender_id === myUserId;
            const isNew = !thread.initialIds.has(message.id);
            const status = mine && !message.deleted_at ? statusOf(message) : null;
            const failed = status === 'failed';
            const quoted = message.reply_to_id ? thread.messagesById.get(message.reply_to_id) ?? null : null;
            // Messenger-style: spell out the status under my latest message only.
            const showStatusLabel = !searchTerm && mine && index === lastMineIndex && status;
            return (
              <Animated.View
                key={message.localKey ?? message.id}
                entering={isNew ? riseIn(0, 300) : undefined}
                layout={LinearTransition.duration(250)}
                onLayout={(event) => {
                  messageOffsets.current[message.id] = event.nativeEvent.layout.y;
                }}
                className={`mb-2.5 ${mine ? 'items-end' : 'items-start'}`}>
                <MessageBubble
                  message={message}
                  mine={mine}
                  isDark={isDark}
                  status={status}
                  photoUri={thread.photoUriFor(message)}
                  replyTo={quoted}
                  replyLabel={quoted ? replyLabelFor(message, quoted) : null}
                  reactions={thread.reactionsByMessage.get(message.id) ?? []}
                  onLongPress={() => {
                    if (message.pending) return;
                    feedback.select();
                    setActionTarget(message);
                  }}
                  onPress={() => handlePressMessage(message)}
                  onPressReply={() => quoted && jumpTo(quoted.id)}
                />
                {showStatusLabel ? (
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
            <Animated.View key="typing-indicator" entering={riseIn(0, 180)} exiting={FadeOut.duration(150)} className="mb-2.5 flex-row items-end gap-2">
              <Avatar name={selected.display_name} url={selected.avatar_url} size={24} />
              <View className="flex-row items-center gap-1.5 px-4 py-3.5" style={{ backgroundColor: isDark ? '#1A2539' : '#F0F2F7', borderRadius: 22, borderBottomLeftRadius: 6 }}>
                {[0, 1, 2].map((dot) => <TypingDot key={dot} index={dot} color={isDark ? '#94A3B8' : '#7A859D'} />)}
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>
        <Composer
          isDark={isDark}
          accent="#284BD6"
          value={messageText}
          onChangeText={handleChangeText}
          onSend={sendMessage}
          onQuickReaction={() => queue(QUICK_REACTION)}
          onPhoto={(source) => void sendPhoto(source)}
          reply={replyTo ? { label: `Replying to ${replyTo.sender_id === myUserId ? 'yourself' : firstName}`, summary: messageSummary(replyTo) } : null}
          onCancelReply={() => setReplyTo(null)}
          inputRef={inputRef}
        />
        <ChatInfoSheet
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          isDark={isDark}
          name={selected.display_name}
          avatarUrl={selected.avatar_url}
          status={otherTyping ? 'typing' : otherHere ? 'here' : 'idle'}
          messageCount={messages.filter((message) => !message.pending && !message.deleted_at).length}
          firstMessageAt={messages[0]?.created_at ?? null}
          muted={prefs.muted}
          pinned={prefs.pinned}
          photos={thread.sharedPhotos}
          onViewProfile={openProfile}
          onToggleMute={() => togglePref('muted')}
          onTogglePin={() => togglePref('pinned')}
          onOpenPhoto={(url) => {
            setMenuVisible(false);
            setViewerUri(url);
          }}
          onDelete={confirmDeleteChat}
          onSearch={() => {
            setMenuVisible(false);
            setChatSearch('');
            setChatSearchOpen(true);
          }}
          onReport={() => {
            setMenuVisible(false);
            setReportModalVisible(true);
          }}
          onUnfriend={confirmUnfriend}
          onBlock={confirmBlock}
        />
        <MessageActionsSheet
          visible={actionTarget !== null}
          isDark={isDark}
          preview={actionTarget ? messageSummary(actionTarget) : ''}
          mine={actionTarget?.sender_id === myUserId}
          myReaction={actionTarget ? thread.myReactionFor(actionTarget.id) : null}
          onClose={() => setActionTarget(null)}
          onReact={(emoji) => {
            if (!actionTarget) return;
            setActionTarget(null);
            thread.react(actionTarget, emoji);
          }}
          onReply={() => {
            if (!actionTarget) return;
            setActionTarget(null);
            setReplyTo(actionTarget);
            inputRef.current?.focus();
          }}
          onUnsend={() => actionTarget && confirmUnsend(actionTarget)}
        />
        <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
        <ReportUserModal
          visible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          isDark={isDark}
          reportedUserId={selected.other_user_id}
          targetDisplayName={selected.display_name}
        />
      </View>
    );
  }

  const query = search.trim().toLowerCase();
  const visibleConversations = query ? conversations.filter((conversation) => conversation.display_name.toLowerCase().includes(query)) : conversations;
  const visibleGroups = query ? groups.filter((group) => group.title.toLowerCase().includes(query)) : groups;
  const newFriends = visibleConversations.filter((conversation) => !conversation.last_message_at);
  const showSkeleton = loading && conversations.length === 0 && groups.length === 0 && !guildChat;
  const showGuildChat = guildChat !== null && (!query || guildChat.guild.name.toLowerCase().includes(query));
  // One list like Messenger: pinned first, then most recent activity.
  const listItems: ListItem[] = [
    ...(listFilter === 'groups' ? [] : visibleConversations)
      .filter((conversation) => listFilter !== 'unread' || conversation.unread_count > 0)
      .map((conversation) => ({ kind: 'direct' as const, conversation, pinned: prefsOf(conversation).pinned, at: conversation.last_message_at })),
    ...visibleGroups
      .filter((group) => listFilter !== 'unread' || group.unread_count > 0)
      .map((group) => ({ kind: 'group' as const, group, pinned: group.pinned, at: group.last_message_at })),
  ].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.at ?? '').localeCompare(a.at ?? ''));
  const totalUnread =
    conversations.reduce((sum, conversation) => sum + (prefsOf(conversation).muted ? 0 : conversation.unread_count), 0) +
    groups.reduce((sum, group) => sum + (group.muted ? 0 : group.unread_count), 0) +
    (guildChat?.unread_count ?? 0);
  const showGuildInList = showGuildChat && (listFilter !== 'unread' || Boolean(guildChat?.unread_count));
  const filters: { key: ListFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: totalUnread ? `Unread · ${totalUnread}` : 'Unread' },
    { key: 'groups', label: 'Groups' },
  ];
  const rowStyle = (highlight: boolean) => ({ backgroundColor: highlight ? (isDark ? '#14213D' : '#F2F5FF') : 'transparent' });

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} refreshControl={refreshControl} keyboardShouldPersistTaps="handled" {...hideTabBarOnScroll}>
      <View className="px-4 pb-2 pt-5">
        <View className="flex-row items-end justify-between">
          <Text className={`${typography.pageTitle} ${titleColor}`}>Messages</Text>
          {totalUnread ? (
            <View className="mb-1 rounded-full bg-[#284BD6] px-2.5 py-1">
              <Text className="text-[12px] font-black text-white">{totalUnread} new</Text>
            </View>
          ) : null}
        </View>
        <View className="mt-4 flex-row items-center gap-2.5 rounded-2xl px-4 py-3" style={{ backgroundColor: softFill }}>
          <Search size={18} color="#7A859D" />
          <TextInput value={search} onChangeText={setSearch} placeholder="Search chats" placeholderTextColor="#94A3B8" className="flex-1 py-0 text-[15px]" style={{ color: isDark ? '#FFFFFF' : '#182847' }} />
        </View>
        <View className="mt-3 flex-row gap-2">
          {filters.map((item) => {
            const active = listFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => {
                  feedback.select();
                  setListFilter(item.key);
                }}
                activeOpacity={0.8}
                className="rounded-full px-4 py-2"
                style={{ backgroundColor: active ? '#284BD6' : softFill }}>
                <Text className="text-[13px] font-bold" style={{ color: active ? '#FFFFFF' : isDark ? '#CBD5E1' : '#4A5875' }}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      {errorMessage ? <Text className="m-4 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
      {showSkeleton ? (
        <View className="px-4 pt-3">
          {[0, 1, 2, 3, 4].map((index) => <SkeletonRow key={index} />)}
        </View>
      ) : null}
      {!loading && !conversations.length && !groups.length && !guildChat ? (
        <EmptyState icon={<MessageCircle size={34} color="#3B82F6" />} title="No conversations yet" message="Add a friend or join a trip to start chatting." />
      ) : null}

      {showGuildInList && guildChat ? (
        <Animated.View key="guild-chat" entering={enterFromBelow(0)} className="px-4 pt-3">
          <TouchableOpacity
            onPress={() => {
              feedback.select();
              router.push('/guild/chat');
            }}
            accessibilityLabel={`Open ${guildChat.guild.name} guild chat`}
            className="flex-row items-center gap-3 rounded-3xl px-3.5 py-3.5"
            style={{ backgroundColor: `${guildChat.guild.color}${isDark ? '26' : '14'}`, borderWidth: 1, borderColor: `${guildChat.guild.color}40` }}>
            <GuildEmblem emblem={guildChat.guild.emblem} color={guildChat.guild.color} size={48} />
            <View className="flex-1">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 flex-row items-center gap-1.5">
                  <Text numberOfLines={1} className={`shrink text-base ${guildChat.unread_count ? 'font-bold' : 'font-semibold'} ${textPrimary}`}>{guildChat.guild.name}</Text>
                  <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${guildChat.guild.color}22` }}>
                    <Text className="text-[9px] font-black" style={{ color: guildChat.guild.color }}>GUILD</Text>
                  </View>
                </View>
                {guildChat.last_message_at ? <Text className={`ml-2 text-xs ${guildChat.unread_count ? 'font-bold text-[#284BD6]' : textSecondary}`}>{formatTime(guildChat.last_message_at)}</Text> : null}
              </View>
              <Text numberOfLines={1} className={`mt-0.5 ${guildChat.unread_count ? `font-bold ${textPrimary}` : `font-normal ${textSecondary}`}`}>
                {guildChat.last_message ? `${guildChat.last_message_sender_id === myUserId ? 'You: ' : ''}${guildChat.last_message}` : 'Say hi to your guild 👋'}
              </Text>
            </View>
            {guildChat.unread_count ? (
              <PopIn className="h-6 min-w-6 items-center justify-center rounded-full bg-[#284BD6] px-1.5">
                <Text className="text-xs font-bold text-white">{guildChat.unread_count}</Text>
              </PopIn>
            ) : null}
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {newFriends.length > 0 && listFilter === 'all' ? (
        <View className="pt-5">
          <Text className="px-4 text-[12px] font-extrabold uppercase tracking-[1.2px]" style={{ color: isDark ? '#94A3B8' : '#67748D' }}>New friends · say hi 👋</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingTop: 12 }}>
            {newFriends.map((conversation, index) => (
              <Animated.View key={conversation.thread_id} entering={enterFromBelow(index)}>
                <TouchableOpacity onPress={() => openConversation(conversation)} className="w-16 items-center">
                  <View className="rounded-full p-[3px]" style={{ borderWidth: 2, borderColor: '#284BD6' }}>
                    <Avatar name={conversation.display_name} url={conversation.avatar_url} size={50} />
                  </View>
                  <Text numberOfLines={1} className={`mt-1 text-center text-xs ${textSecondary}`}>{conversation.display_name.split(' ')[0]}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View className="gap-1 px-2 pt-3">
        {listItems.map((item, index) => {
          if (item.kind === 'group') {
            const { group } = item;
            const unread = group.unread_count > 0;
            const isTour = group.trip_type === 'tour';
            const color = isTour ? '#0E9F6E' : '#2A55D4';
            const Icon = isTour ? MapIcon : Car;
            return (
              <Animated.View key={group.thread_id} entering={enterFromBelow(index)}>
                <TouchableOpacity
                  onPress={() => {
                    feedback.select();
                    router.push({ pathname: '/trip/chat/[id]', params: { id: group.trip_id } });
                  }}
                  accessibilityLabel={`Open ${group.title} group chat`}
                  activeOpacity={0.7}
                  className="flex-row items-center gap-3 rounded-2xl px-2.5 py-3"
                  style={rowStyle(unread && !group.muted)}>
                  <View className="h-[54px] w-[54px] items-center justify-center rounded-[18px]" style={{ backgroundColor: `${color}1F` }}>
                    <Icon size={24} color={color} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 flex-row items-center gap-1.5">
                        <Text numberOfLines={1} className={`shrink text-base ${unread ? 'font-bold' : 'font-semibold'} ${textPrimary}`}>{group.title}</Text>
                        <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: `${color}22` }}>
                          <Text className="text-[9px] font-black" style={{ color }}>{isTour ? 'TOUR' : 'CARPOOL'}</Text>
                        </View>
                        {group.muted ? <BellOff size={13} color={iconMuted} /> : null}
                        {group.pinned ? <Pin size={13} color={iconMuted} /> : null}
                      </View>
                      {group.last_message_at ? <Text className={`ml-2 text-xs ${unread && !group.muted ? 'font-bold text-[#284BD6]' : textSecondary}`}>{formatTime(group.last_message_at)}</Text> : null}
                    </View>
                    <Text numberOfLines={1} className={`mt-0.5 ${!group.last_message_at ? 'font-medium text-[#284BD6]' : group.last_message_deleted ? `italic ${textSecondary}` : unread ? `font-bold ${textPrimary}` : `font-normal ${textSecondary}`}`}>
                      {groupPreview(group, myUserId)}
                    </Text>
                  </View>
                  {unread ? (
                    <PopIn className={`h-6 min-w-6 items-center justify-center rounded-full px-1.5 ${group.muted ? 'bg-[#94A3B8]' : 'bg-[#284BD6]'}`}>
                      <Text className="text-xs font-bold text-white">{group.unread_count}</Text>
                    </PopIn>
                  ) : null}
                </TouchableOpacity>
              </Animated.View>
            );
          }

          const { conversation } = item;
          const { muted, pinned } = prefsOf(conversation);
          const unread = conversation.unread_count > 0;
          const lastIsMine = Boolean(conversation.last_message_at) && conversation.last_message_sender_id === myUserId;
          const lastStatus = lastIsMine && conversation.last_message_at && !conversation.last_message_deleted
            ? messageStatus(conversation.last_message_at, { readAt: conversation.other_last_read_at, deliveredAt: conversation.other_last_delivered_at })
            : null;
          return (
            <Animated.View key={conversation.thread_id} entering={enterFromBelow(index)}>
              <TouchableOpacity onPress={() => openConversation(conversation)} activeOpacity={0.7} className="flex-row items-center gap-3 rounded-2xl px-2.5 py-3" style={rowStyle(unread && !muted)}>
                <Avatar name={conversation.display_name} url={conversation.avatar_url} size={54} />
                <View className="flex-1">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 flex-row items-center gap-1.5">
                      <Text numberOfLines={1} className={`shrink text-base ${unread ? 'font-bold' : 'font-semibold'} ${textPrimary}`}>{conversation.display_name}</Text>
                      {muted ? <BellOff size={13} color={iconMuted} /> : null}
                      {pinned ? <Pin size={13} color={iconMuted} /> : null}
                    </View>
                    {conversation.last_message_at ? <Text className={`ml-2 text-xs ${unread && !muted ? 'font-bold text-[#284BD6]' : textSecondary}`}>{formatTime(conversation.last_message_at)}</Text> : null}
                  </View>
                  <View className="mt-0.5 flex-row items-center gap-1">
                    {lastStatus ? <StatusTick status={lastStatus} color={iconMuted} size={15} /> : null}
                    <Text numberOfLines={1} className={`flex-1 ${!conversation.last_message_at ? 'font-medium text-[#284BD6]' : conversation.last_message_deleted ? `italic ${textSecondary}` : unread ? `font-bold ${textPrimary}` : `font-normal ${textSecondary}`}`}>
                      {conversationPreview(conversation, lastIsMine)}
                    </Text>
                  </View>
                </View>
                {unread ? (
                  <PopIn className={`h-6 min-w-6 items-center justify-center rounded-full px-1.5 ${muted ? 'bg-[#94A3B8]' : 'bg-[#284BD6]'}`}>
                    <Text className="text-xs font-bold text-white">{conversation.unread_count}</Text>
                  </PopIn>
                ) : null}
              </TouchableOpacity>
            </Animated.View>
          );
        })}
        {query && listItems.length === 0 && !showGuildInList && (conversations.length > 0 || groups.length > 0) ? (
          <Text className={`pt-8 text-center text-sm ${textSecondary}`}>No chats match “{search.trim()}”.</Text>
        ) : null}
        {!query && listFilter !== 'all' && listItems.length === 0 && !showGuildInList && (conversations.length > 0 || groups.length > 0) ? (
          <Text className={`pt-8 text-center text-sm ${textSecondary}`}>{listFilter === 'unread' ? "You're all caught up 🎉" : 'No group chats yet. Join a trip to get one.'}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
