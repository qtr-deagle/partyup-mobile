import { ArrowLeft, ChevronRight, MessageCircle, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FriendPicker, GroupLookFields } from '@/components/chat/FriendGroupParts';
import { riseIn } from '@/components/ui/motion';
import { confirmDiscard } from '@/hooks/use-unsaved-changes';
import { createFriendGroup, GROUP_COLORS, listFriendConnections, type FriendConnection } from '@/lib/social';
import { feedback } from '@/lib/sounds';

type Step = 'menu' | 'chat' | 'members' | 'details';

const MIN_GROUP_FRIENDS = 2;

// The compose button's sheet: start a chat with a friend, or a group with
// two or more friends (pick people -> name, icon, color -> create).
export function NewChatSheet({
  visible,
  isDark,
  onClose,
  onOpenDirect,
  onGroupCreated,
}: {
  visible: boolean;
  isDark: boolean;
  onClose: () => void;
  onOpenDirect: (friend: FriendConnection) => void;
  onGroupCreated: (threadId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [step, setStep] = useState<Step>('menu');
  const [friends, setFriends] = useState<FriendConnection[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState<string | null>(null);
  const [color, setColor] = useState(GROUP_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheet = isDark ? '#111B2E' : '#FFFFFF';
  const primary = isDark ? '#FFFFFF' : '#182847';
  const muted = isDark ? '#94A3B8' : '#67748D';
  const soft = isDark ? '#18253C' : '#F3F5FA';

  function reset() {
    setStep('menu');
    setPicked([]);
    setTitle('');
    setEmoji(null);
    setColor(GROUP_COLORS[0]);
    setError(null);
    setCreating(false);
  }

  function handleShow() {
    reset();
    setFriendsLoading(true);
    void listFriendConnections().then((result) => {
      setFriends(result.data.filter((friend) => friend.relationship_status === 'accepted'));
      setFriendsLoading(false);
    });
  }

  const groupDirty = picked.length > 0 || !!title.trim() || !!emoji;
  function close() {
    if (creating) return;
    confirmDiscard(groupDirty, () => {
      reset();
      onClose();
    }, { message: "Your group isn't created yet. Discard it?" });
  }

  function back() {
    setError(null);
    if (step === 'details') setStep('members');
    else if (step === 'chat' || step === 'members') setStep('menu');
    else close();
  }

  async function create() {
    setCreating(true);
    setError(null);
    const { data, error: createError } = await createFriendGroup({ title, memberIds: picked, emoji, color });
    setCreating(false);
    if (createError || !data) {
      setError(createError?.message ?? 'Could not create the group.');
      feedback.error();
      return;
    }
    feedback.success();
    reset();
    onClose();
    onGroupCreated(data);
  }

  const titleText = step === 'menu' ? 'New message' : step === 'chat' ? 'New chat' : step === 'members' ? 'Add people' : 'Name your group';
  const canContinue = picked.length >= MIN_GROUP_FRIENDS;
  const canCreate = !!title.trim() && !creating;

  return (
    <Modal transparent visible={visible} animationType="fade" onShow={handleShow} onRequestClose={back} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className="flex-1 justify-end bg-black/50" onPress={close}>
          {visible ? (
            <Animated.View
              key="new-chat-sheet"
              entering={riseIn(0, 360)}
              style={{ backgroundColor: sheet, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 14, height: step === 'menu' ? undefined : height * 0.86 }}>
              <Pressable onPress={() => undefined} className={step === 'menu' ? '' : 'flex-1'}>
                <View className={`mb-1 mt-2.5 h-1 w-9 self-center rounded-full ${isDark ? 'bg-[#334155]' : 'bg-[#D5DBE6]'}`} />
                <View className="flex-row items-center gap-2 px-4 pb-3 pt-2">
                  {step !== 'menu' ? (
                    <TouchableOpacity onPress={back} className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: soft }} accessibilityLabel="Back">
                      <ArrowLeft size={18} color={primary} />
                    </TouchableOpacity>
                  ) : null}
                  <Text className="flex-1 text-[20px] font-black" style={{ color: primary }}>{titleText}</Text>
                  {step === 'members' ? (
                    <TouchableOpacity onPress={() => setStep('details')} disabled={!canContinue} activeOpacity={0.85}>
                      <View className="rounded-full px-4 py-2" style={{ backgroundColor: canContinue ? '#284BD6' : isDark ? '#22324B' : '#C9D3EA' }}>
                        <Text className="text-[14px] font-extrabold text-white">Next{picked.length ? ` · ${picked.length}` : ''}</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={close} className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: soft }} accessibilityLabel="Close">
                      <X size={18} color={muted} />
                    </TouchableOpacity>
                  )}
                </View>

                {step === 'menu' ? (
                  <View className="gap-2 px-4 pb-2">
                    <MenuRow icon={<MessageCircle size={22} color="#284BD6" />} tint="#284BD6" title="New chat" subtitle="Message one of your friends" isDark={isDark} onPress={() => setStep('chat')} />
                    <MenuRow icon={<Users size={22} color="#7C3AED" />} tint="#7C3AED" title="New group" subtitle="Plan a trip with 2 or more friends" isDark={isDark} onPress={() => setStep('members')} />
                  </View>
                ) : step === 'chat' ? (
                  <View className="flex-1 px-4">
                    <FriendPicker
                      friends={friends}
                      loading={friendsLoading}
                      isDark={isDark}
                      multiple={false}
                      selected={[]}
                      onToggle={(friend) => {
                        reset();
                        onClose();
                        onOpenDirect(friend);
                      }}
                    />
                  </View>
                ) : step === 'members' ? (
                  <View className="flex-1 px-4">
                    <Text className="mb-3 text-[13px]" style={{ color: muted }}>
                      Pick at least {MIN_GROUP_FRIENDS} friends. You can add more later.
                    </Text>
                    <FriendPicker
                      friends={friends}
                      loading={friendsLoading}
                      isDark={isDark}
                      multiple
                      selected={picked}
                      onToggle={(friend) =>
                        setPicked((current) => (current.includes(friend.user_id) ? current.filter((id) => id !== friend.user_id) : [...current, friend.user_id]))
                      }
                      emptyText="You need at least 2 friends to start a group."
                    />
                  </View>
                ) : (
                  <View className="flex-1">
                    <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                      <GroupLookFields
                        isDark={isDark}
                        title={title}
                        emoji={emoji}
                        color={color}
                        onChange={(next) => {
                          if (next.title !== undefined) setTitle(next.title);
                          if (next.emoji !== undefined) setEmoji(next.emoji);
                          if (next.color !== undefined) setColor(next.color);
                        }}
                      />
                      <Text className="mt-4 text-[13px]" style={{ color: muted }}>
                        {picked.length + 1} people · you&apos;ll be the group admin
                      </Text>
                      {error ? <Text className="mt-3 text-[13.5px] text-[#E11D48]">{error}</Text> : null}
                    </ScrollView>
                    <View className="px-4 pt-3">
                      <TouchableOpacity onPress={() => void create()} disabled={!canCreate} activeOpacity={0.85}>
                        <View className="items-center rounded-2xl py-4" style={{ backgroundColor: canCreate || creating ? color : isDark ? '#22324B' : '#C9D3EA' }}>
                          {creating ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[16px] font-black text-white">Create group</Text>}
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </Pressable>
            </Animated.View>
          ) : null}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MenuRow({ icon, tint, title, subtitle, isDark, onPress }: { icon: React.ReactNode; tint: string; title: string; subtitle: string; isDark: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <View className="flex-row items-center gap-3.5 rounded-2xl px-3.5 py-3.5" style={{ backgroundColor: isDark ? '#18253C' : '#F6F7FB' }}>
        <View className="h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${tint}1F` }}>
          {icon}
        </View>
        <View className="flex-1">
          <Text className="text-[16px] font-extrabold" style={{ color: isDark ? '#FFFFFF' : '#182847' }}>{title}</Text>
          <Text className="mt-0.5 text-[13px]" style={{ color: isDark ? '#94A3B8' : '#67748D' }}>{subtitle}</Text>
        </View>
        <ChevronRight size={18} color="#94A3B8" />
      </View>
    </TouchableOpacity>
  );
}
