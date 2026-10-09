import { Crown, UserMinus, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FriendPicker, GroupLookFields, PersonAvatar } from '@/components/chat/FriendGroupParts';
import { riseIn } from '@/components/ui/motion';
import { confirmDiscard } from '@/hooks/use-unsaved-changes';
import { showAlert } from '@/lib/dialog';
import {
  addFriendGroupMembers,
  GROUP_COLORS,
  listFriendConnections,
  removeFriendGroupMember,
  setFriendGroupAdmin,
  updateFriendGroup,
  type FriendConnection,
  type FriendGroup,
} from '@/lib/social';
import { feedback } from '@/lib/sounds';

// Admin sheets for a friend group: edit the look, add people, manage members.

function Sheet({
  visible,
  title,
  isDark,
  onClose,
  onShow,
  tall,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  isDark: boolean;
  onClose: () => void;
  onShow?: () => void;
  tall?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const primary = isDark ? '#FFFFFF' : '#182847';
  return (
    <Modal transparent visible={visible} animationType="fade" onShow={onShow} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
          {visible ? (
            <Animated.View
              key={`sheet-${title}`}
              entering={riseIn(0, 360)}
              style={{ backgroundColor: isDark ? '#111B2E' : '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: insets.bottom + 14, height: tall ? height * 0.82 : undefined, maxHeight: height * 0.9 }}>
              <Pressable onPress={() => undefined} className={tall ? 'flex-1' : ''}>
                <View className={`mb-1 mt-2.5 h-1 w-9 self-center rounded-full ${isDark ? 'bg-[#334155]' : 'bg-[#D5DBE6]'}`} />
                <View className="flex-row items-center px-4 pb-3 pt-2">
                  <Text className="flex-1 text-[20px] font-black" style={{ color: primary }}>{title}</Text>
                  <TouchableOpacity onPress={onClose} className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: isDark ? '#18253C' : '#F3F5FA' }} accessibilityLabel="Close">
                    <X size={18} color={isDark ? '#94A3B8' : '#67748D'} />
                  </TouchableOpacity>
                </View>
                <View className={tall ? 'flex-1 px-4' : 'px-4'}>{children}</View>
                {footer ? <View className="px-4 pt-3">{footer}</View> : null}
              </Pressable>
            </Animated.View>
          ) : null}
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PrimaryButton({ label, color, disabled, busy, onPress }: { label: string; color: string; disabled?: boolean; busy?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || busy} activeOpacity={0.85}>
      <View className="items-center rounded-2xl py-4" style={{ backgroundColor: color, opacity: disabled && !busy ? 0.45 : 1 }}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[16px] font-black text-white">{label}</Text>}
      </View>
    </TouchableOpacity>
  );
}

export function EditGroupSheet({ visible, group, isDark, onClose, onSaved }: { visible: boolean; group: FriendGroup; isDark: boolean; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(group.title);
  const [emoji, setEmoji] = useState<string | null>(group.emoji);
  const [color, setColor] = useState(group.color ?? GROUP_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const dirty = title.trim() !== group.title || emoji !== group.emoji || color !== (group.color ?? GROUP_COLORS[0]);

  function handleShow() {
    setTitle(group.title);
    setEmoji(group.emoji);
    setColor(group.color ?? GROUP_COLORS[0]);
  }

  async function save() {
    setBusy(true);
    const { error } = await updateFriendGroup(group.thread_id, { title, emoji, color });
    setBusy(false);
    if (error) {
      showAlert('Could not save', error.message);
      return;
    }
    feedback.success();
    onSaved();
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      title="Edit group"
      isDark={isDark}
      onShow={handleShow}
      onClose={() => confirmDiscard(dirty, onClose, { message: "Your changes to the group won't be saved." })}
      footer={<PrimaryButton label="Save" color={color} disabled={!dirty || !title.trim()} busy={busy} onPress={() => void save()} />}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
      </ScrollView>
    </Sheet>
  );
}

export function AddPeopleSheet({ visible, group, isDark, onClose, onAdded }: { visible: boolean; group: FriendGroup; isDark: boolean; onClose: () => void; onAdded: () => void }) {
  const [friends, setFriends] = useState<FriendConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const memberIds = new Set(group.members.map((member) => member.user_id));

  function handleShow() {
    setPicked([]);
    setLoading(true);
    void listFriendConnections().then((result) => {
      setFriends(result.data.filter((friend) => friend.relationship_status === 'accepted'));
      setLoading(false);
    });
  }

  async function add() {
    setBusy(true);
    const { error } = await addFriendGroupMembers(group.thread_id, picked);
    setBusy(false);
    if (error) {
      showAlert('Could not add people', error.message);
      return;
    }
    feedback.success();
    onAdded();
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      title="Add people"
      isDark={isDark}
      tall
      onShow={handleShow}
      onClose={() => confirmDiscard(picked.length > 0, onClose, { message: "The people you picked won't be added." })}
      footer={<PrimaryButton label={picked.length ? `Add ${picked.length}` : 'Add'} color={group.color ?? GROUP_COLORS[0]} disabled={!picked.length} busy={busy} onPress={() => void add()} />}>
      <FriendPicker
        friends={friends}
        loading={loading}
        isDark={isDark}
        multiple
        selected={picked}
        excludeIds={memberIds}
        onToggle={(friend) => setPicked((current) => (current.includes(friend.user_id) ? current.filter((id) => id !== friend.user_id) : [...current, friend.user_id]))}
        emptyText="All your friends are already in this group."
      />
    </Sheet>
  );
}

export function ManageMembersSheet({
  visible,
  group,
  myUserId,
  isDark,
  onClose,
  onChanged,
}: {
  visible: boolean;
  group: FriendGroup;
  myUserId: string | undefined;
  isDark: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const primary = isDark ? '#FFFFFF' : '#182847';
  const muted = isDark ? '#94A3B8' : '#67748D';

  async function run(userId: string, action: () => PromiseLike<{ error: { message: string } | null }>, failTitle: string) {
    setBusyId(userId);
    const { error } = await action();
    setBusyId(null);
    if (error) {
      showAlert(failTitle, error.message);
      return;
    }
    feedback.success();
    onChanged();
  }

  return (
    <Sheet visible={visible} title="Members" isDark={isDark} tall onClose={onClose}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {group.members.map((member) => {
          const me = member.user_id === myUserId;
          const admin = member.role === 'admin';
          const firstName = member.display_name.split(' ')[0];
          return (
            <View key={member.user_id} className="flex-row items-center gap-3 py-2.5">
              <PersonAvatar name={member.display_name} url={member.avatar_url} size={44} />
              <View className="flex-1">
                <Text numberOfLines={1} className="text-[15px] font-semibold" style={{ color: primary }}>
                  {member.display_name}
                  {me ? ' (you)' : ''}
                </Text>
                {admin ? <Text className="text-[12px] font-bold text-[#D88700]">Admin</Text> : null}
              </View>
              {busyId === member.user_id ? (
                <ActivityIndicator color={muted} />
              ) : me ? null : (
                <View className="flex-row gap-2">
                  {!admin ? (
                    <TouchableOpacity
                      onPress={() =>
                        showAlert(`Make ${firstName} an admin?`, 'Admins can rename the group and add or remove people.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Make admin', onPress: () => void run(member.user_id, () => setFriendGroupAdmin(group.thread_id, member.user_id, true), 'Could not update admin') },
                        ])
                      }
                      accessibilityLabel={`Make ${member.display_name} an admin`}
                      className="h-9 w-9 items-center justify-center rounded-full"
                      style={{ backgroundColor: isDark ? '#2A2414' : '#FFF8EB' }}>
                      <Crown size={16} color="#D88700" />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() =>
                      showAlert(`Remove ${firstName}?`, `${firstName} won't see new messages in this group. You can add them back later.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => void run(member.user_id, () => removeFriendGroupMember(group.thread_id, member.user_id), 'Could not remove') },
                      ])
                    }
                    accessibilityLabel={`Remove ${member.display_name}`}
                    className="h-9 w-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: isDark ? '#2B1414' : '#FDECEC' }}>
                    <UserMinus size={16} color="#E32727" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}
