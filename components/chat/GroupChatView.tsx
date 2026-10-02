import { Composer, QUICK_REACTION } from '@/components/chat/Composer';
import { GroupInfoSheet, type GroupMember } from '@/components/chat/GroupInfoSheet';
import { MessageActionsSheet } from '@/components/chat/MessageActionsSheet';
import { MessageBubble, messageSummary } from '@/components/chat/MessageBubble';
import { PhotoViewer } from '@/components/chat/PhotoViewer';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, riseIn } from '@/components/ui/motion';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { useThreadMessages, type ScreenMessage } from '@/hooks/use-thread-messages';
import { setActiveChatThread } from '@/lib/active-chat';
import { pickChatPhoto } from '@/lib/chat-media';
import { getChatPrefs, setChatMuted, setChatPinned, type ChatMessage } from '@/lib/social';
import { feedback } from '@/lib/sounds';
import { getTheme } from '@/lib/theme';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowLeft, BellOff, Info } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  threadId: string | null;
  // Still working out which thread to show.
  loading: boolean;
  // Shown instead of the chat, e.g. "Join a guild to chat".
  blocker?: ReactNode;
  title: string;
  subtitle: string;
  avatar: ReactNode;
  color: string;
  onPressTitle?: () => void;
  members: GroupMember[];
  blockedIds?: Set<string>;
  renderAvatarBadge?: (userId: string) => ReactNode;
  renderNameTag?: (userId: string) => ReactNode;
  // Guild leaders: remove someone else's message for everyone.
  onModerateRemove?: (messageId: string) => PromiseLike<{ error: { message: string } | null }>;
  // Guild chat: report someone else's message.
  onReportMessage?: (message: ScreenMessage) => void;
  placeholder: string;
  empty: { icon: ReactNode; title: string; message: string };
  pinnable?: boolean;
  infoLink?: { label: string; onPress: () => void };
};

// A guild or trip group conversation: sender names and avatars, photos,
// replies, reactions, unsend, mute/pin. Messages live in useThreadMessages.
export function GroupChatView({ threadId, loading, blocker, title, subtitle, avatar, color, onPressTitle, members, blockedIds, renderAvatarBadge, renderNameTag, onModerateRemove, onReportMessage, placeholder, empty, pinnable = false, infoLink }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const myUserId = session?.user.id;
  const { screenBackground, primaryText } = getTheme(isDark);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ScreenMessage | null>(null);
  const [actionTarget, setActionTarget] = useState<ScreenMessage | null>(null);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [infoVisible, setInfoVisible] = useState(false);
  const [prefs, setPrefs] = useState({ muted: false, pinned: false });
  const listRef = useRef<FlatList<ScreenMessage>>(null);
  const inputRef = useRef<TextInput>(null);

  const thread = useThreadMessages({ threadId, myUserId, onError: (message) => Alert.alert('Something went wrong', message) });

  useEffect(() => {
    if (!threadId || !myUserId) return;
    let active = true;
    void getChatPrefs(threadId, myUserId).then((result) => {
      if (active && !result.error) setPrefs(result.data);
    });
    return () => {
      active = false;
    };
  }, [threadId, myUserId]);

  // Keep the in-app notifier quiet for the chat on screen.
  useEffect(() => {
    setActiveChatThread(threadId);
    return () => setActiveChatThread(null);
  }, [threadId]);

  const byId = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);
  // Messages from people you blocked stay hidden.
  const visible = useMemo(() => thread.messages.filter((message) => !blockedIds?.has(message.sender_id)), [thread.messages, blockedIds]);
  const nameOf = (userId: string) => (userId === myUserId ? 'You' : byId.get(userId)?.name ?? 'Former member');
  const firstNameOf = (userId: string) => nameOf(userId).split(' ')[0];

  function togglePref(kind: 'muted' | 'pinned') {
    if (!threadId) return;
    const next = !prefs[kind];
    feedback.select();
    setPrefs((current) => ({ ...current, [kind]: next }));
    void (kind === 'muted' ? setChatMuted(threadId, next) : setChatPinned(threadId, next)).then(({ error }) => {
      if (!error) return;
      Alert.alert('Could not update chat', error.message);
      setPrefs((current) => ({ ...current, [kind]: !next }));
    });
  }

  function send() {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    thread.queueMessage(body, { replyTo });
    setReplyTo(null);
  }

  async function sendPhoto(source: 'camera' | 'library') {
    const photo = await pickChatPhoto(source);
    if (!photo) return;
    thread.queueMessage('', { photo, replyTo });
    setReplyTo(null);
  }

  function confirmRemove(message: ScreenMessage, mine: boolean) {
    setActionTarget(null);
    Alert.alert(mine ? 'Unsend message?' : 'Remove message?', mine ? 'It will be removed for everyone in this chat.' : 'It will be removed for everyone. Admins can still see what was removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: mine ? 'Unsend' : 'Remove',
        style: 'destructive',
        onPress: () => {
          if (replyTo?.id === message.id) setReplyTo(null);
          if (mine) thread.removeMessage(message);
          else if (onModerateRemove) thread.removeMessage(message, onModerateRemove);
        },
      },
    ]);
  }

  function jumpTo(messageId: string) {
    const index = visible.findIndex((message) => message.id === messageId);
    if (index !== -1) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
  }

  function openMember(userId: string) {
    const member = byId.get(userId);
    router.push({ pathname: '/profile/[id]', params: { id: userId, displayName: member?.name ?? '', avatarUrl: member?.avatarUrl ?? '' } });
  }

  const replyLabelFor = (message: ChatMessage, quoted: ChatMessage) => {
    const quotedName = quoted.sender_id === message.sender_id ? (message.sender_id === myUserId ? 'yourself' : 'themselves') : quoted.sender_id === myUserId ? 'you' : firstNameOf(quoted.sender_id);
    return `${firstNameOf(message.sender_id)} replied to ${quotedName}`;
  };

  const actionMine = actionTarget?.sender_id === myUserId;

  return (
    <View className={`flex-1 ${screenBackground}`} style={{ paddingBottom: keyboardHeight }}>
      <View style={{ backgroundColor: color, paddingTop: insets.top + 8 }} className="flex-row items-center gap-3 px-4 pb-3">
        <AnimatedPressable onPress={() => router.back()} scaleTo={0.9} className="h-10 w-10 items-center justify-center rounded-full bg-white/20" accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </AnimatedPressable>
        <AnimatedPressable onPress={onPressTitle} disabled={!onPressTitle} className="flex-1 flex-row items-center gap-2.5" accessibilityLabel={`Open ${title}`}>
          <View className="rounded-full border-2 border-white/60">{avatar}</View>
          <View className="flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="shrink text-base font-black text-white" numberOfLines={1}>{title}</Text>
              {prefs.muted ? <BellOff size={13} color="#FFFFFF" /> : null}
            </View>
            <Text className="text-xs text-white/80" numberOfLines={1}>{subtitle}</Text>
          </View>
        </AnimatedPressable>
        {threadId && !blocker ? (
          <AnimatedPressable onPress={() => setInfoVisible(true)} scaleTo={0.9} className="h-10 w-10 items-center justify-center rounded-full bg-white/20" accessibilityLabel="Chat info">
            <Info size={20} color="#FFFFFF" />
          </AnimatedPressable>
        ) : null}
      </View>

      {loading || (threadId && !blocker && !thread.loaded) ? (
        <View key="loading" className="flex-1 items-center justify-center">
          <ActivityIndicator color={color} />
        </View>
      ) : blocker ? (
        <View key="blocker" className="flex-1">{blocker}</View>
      ) : (
        <FlatList
          key="messages"
          ref={listRef}
          data={visible}
          keyExtractor={(item) => item.localKey ?? item.id}
          contentContainerClassName="px-3 pt-3"
          contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          onScrollToIndexFailed={({ index }) => listRef.current?.scrollToOffset({ offset: index * 60, animated: true })}
          ListEmptyComponent={<EmptyState icon={empty.icon} title={empty.title} message={empty.message} />}
          renderItem={({ item, index }) => {
            const mine = item.sender_id === myUserId;
            const previous = visible[index - 1];
            const grouped = previous && previous.sender_id === item.sender_id && !item.reply_to_id && new Date(item.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60_000;
            const sender = byId.get(item.sender_id);
            const name = sender?.name ?? 'Former member';
            const quoted = item.reply_to_id ? thread.messagesById.get(item.reply_to_id) ?? null : null;
            const isNew = !thread.initialIds.has(item.id);
            return (
              <Animated.View key={item.localKey ?? item.id} entering={isNew ? riseIn(0, 300) : undefined} className={`flex-row items-end gap-2 ${grouped ? 'mt-0.5' : 'mt-3'} ${mine ? 'justify-end' : ''}`}>
                {!mine ? (
                  <View className="w-8">
                    {!grouped ? (
                      <AnimatedPressable onPress={() => openMember(item.sender_id)} scaleTo={0.9} accessibilityLabel={`View ${name}'s profile`} className="h-8 w-8 items-center justify-center rounded-full bg-[#B7C4EC]">
                        {sender?.avatarUrl ? (
                          <Image source={{ uri: sender.avatarUrl }} style={{ width: 32, height: 32, borderRadius: 16 }} transition={200} />
                        ) : (
                          <Text className="text-xs font-bold text-[#24314A]">{name.charAt(0).toUpperCase()}</Text>
                        )}
                        {renderAvatarBadge?.(item.sender_id)}
                      </AnimatedPressable>
                    ) : null}
                  </View>
                ) : null}
                <View className={`flex-1 ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && !grouped ? (
                    <AnimatedPressable onPress={() => openMember(item.sender_id)} scaleTo={0.97} className="mb-0.5 ml-1 flex-row items-center gap-1">
                      <Text className={`text-xs font-bold ${primaryText}`}>{name}</Text>
                      {renderNameTag?.(item.sender_id)}
                    </AnimatedPressable>
                  ) : null}
                  <MessageBubble
                    message={item}
                    mine={mine}
                    isDark={isDark}
                    accent={color}
                    status={mine ? item.pending ?? null : null}
                    photoUri={thread.photoUriFor(item)}
                    replyTo={quoted}
                    replyLabel={quoted ? replyLabelFor(item, quoted) : null}
                    reactions={thread.reactionsByMessage.get(item.id) ?? []}
                    onLongPress={() => {
                      if (item.pending) return;
                      feedback.select();
                      setActionTarget(item);
                    }}
                    onPress={() => {
                      if (item.pending === 'failed') thread.retry(item);
                      else if (item.message_type === 'image' && !item.deleted_at) {
                        const uri = thread.photoUriFor(item);
                        if (uri) setViewerUri(uri);
                      }
                    }}
                    onPressReply={() => quoted && jumpTo(quoted.id)}
                  />
                </View>
              </Animated.View>
            );
          }}
        />
      )}

      {threadId && !loading && !blocker ? (
        <Composer
          isDark={isDark}
          accent={color}
          value={draft}
          onChangeText={setDraft}
          onSend={send}
          onQuickReaction={() => {
            thread.queueMessage(QUICK_REACTION, { replyTo });
            setReplyTo(null);
          }}
          onPhoto={(source) => void sendPhoto(source)}
          placeholder={placeholder}
          reply={replyTo ? { label: `Replying to ${replyTo.sender_id === myUserId ? 'yourself' : firstNameOf(replyTo.sender_id)}`, summary: messageSummary(replyTo) } : null}
          onCancelReply={() => setReplyTo(null)}
          inputRef={inputRef}
          bottomPadding={keyboardHeight > 0 ? 8 : insets.bottom + 8}
        />
      ) : null}

      <MessageActionsSheet
        visible={actionTarget !== null}
        isDark={isDark}
        preview={actionTarget ? messageSummary(actionTarget) : ''}
        mine={actionMine}
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
        onUnsend={() => actionTarget && confirmRemove(actionTarget, true)}
        onRemove={onModerateRemove ? () => actionTarget && confirmRemove(actionTarget, false) : undefined}
        onReport={
          onReportMessage
            ? () => {
                if (!actionTarget) return;
                setActionTarget(null);
                onReportMessage(actionTarget);
              }
            : undefined
        }
      />
      <GroupInfoSheet
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        isDark={isDark}
        avatar={avatar}
        title={title}
        subtitle={subtitle}
        members={members}
        photos={thread.sharedPhotos}
        muted={prefs.muted}
        pinned={prefs.pinned}
        pinnable={pinnable}
        onToggleMute={() => togglePref('muted')}
        onTogglePin={() => togglePref('pinned')}
        onOpenPhoto={(url) => {
          setInfoVisible(false);
          setViewerUri(url);
        }}
        onOpenMember={(member) => {
          setInfoVisible(false);
          openMember(member.userId);
        }}
        link={infoLink ? { label: infoLink.label, onPress: () => { setInfoVisible(false); infoLink.onPress(); } } : undefined}
      />
      <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
    </View>
  );
}
