import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { LogOut, Pencil, UserPlus, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { GroupAvatar } from '@/components/chat/FriendGroupParts';
import { AddPeopleSheet, EditGroupSheet, ManageMembersSheet } from '@/components/chat/FriendGroupSheets';
import { GroupChatView } from '@/components/chat/GroupChatView';
import type { InfoAction } from '@/components/chat/GroupInfoSheet';
import { EmptyState } from '@/components/ui/motion';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listBlockedUsers } from '@/lib/blocking';
import { showAlert } from '@/lib/dialog';
import { getFriendGroup, GROUP_COLORS, leaveFriendGroup, type FriendGroup } from '@/lib/social';
import { Lock, MessageCircle } from 'lucide-react-native';

// A group chat a traveler started with friends (migration 202610090011).
export default function FriendGroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myUserId = session?.user.id;
  const isDark = useColorScheme() === 'dark';
  const [group, setGroup] = useState<FriendGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [notMember, setNotMember] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<'edit' | 'add' | 'members' | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [result, blocked] = await Promise.all([getFriendGroup(id), listBlockedUsers()]);
    setBlockedIds(new Set(blocked.data.map((row) => row.blocked_id)));
    setGroup(result.data);
    setNotMember(!result.data);
    setLoading(false);
  }, [id]);

  // Reload on focus: names, members and roles change from other phones too.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const color = group?.color ?? GROUP_COLORS[0];
  const isAdmin = group?.my_role === 'admin';

  function confirmLeave() {
    if (!group) return;
    showAlert(
      `Leave ${group.title}?`,
      isAdmin && group.members.filter((member) => member.role === 'admin').length === 1
        ? "You won't get new messages. Another member becomes the admin."
        : "You won't get new messages from this group.",
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Leave group',
          style: 'destructive',
          onPress: async () => {
            const { error } = await leaveFriendGroup(group.thread_id);
            if (error) {
              showAlert('Could not leave', error.message);
              return;
            }
            router.back();
          },
        },
      ]
    );
  }

  const infoActions: InfoAction[] = group
    ? [
        ...(isAdmin
          ? [
              { key: 'edit', icon: <Pencil size={18} color={isDark ? '#E2E8F0' : '#182847'} />, label: 'Edit name, icon & color', onPress: () => setSheet('edit') },
              { key: 'add', icon: <UserPlus size={18} color={isDark ? '#E2E8F0' : '#182847'} />, label: 'Add people', onPress: () => setSheet('add') },
              { key: 'members', icon: <Users size={18} color={isDark ? '#E2E8F0' : '#182847'} />, label: 'Manage members', onPress: () => setSheet('members') },
            ]
          : []),
        { key: 'leave', icon: <LogOut size={18} color="#E32727" />, label: 'Leave group', onPress: confirmLeave, destructive: true },
      ]
    : [];

  return (
    <View className="flex-1">
      <GroupChatView
        threadId={group?.thread_id ?? null}
        loading={loading}
        blocker={notMember ? <EmptyState icon={<Lock size={34} color={color} />} title="You're not in this group" message="Ask a group admin to add you." /> : undefined}
        title={group?.title ?? 'Group chat'}
        subtitle={group ? `${group.members.length} members${isAdmin ? ' · you are an admin' : ''}` : ''}
        avatar={<GroupAvatar emoji={group?.emoji ?? null} color={color} size={38} />}
        color={color}
        members={(group?.members ?? []).map((member) => ({
          userId: member.user_id,
          name: member.display_name,
          avatarUrl: member.avatar_url,
          label: member.role === 'admin' ? 'Admin' : undefined,
        }))}
        blockedIds={blockedIds}
        placeholder="Message the group"
        empty={{
          icon: <MessageCircle size={34} color={color} />,
          title: 'Your group is ready',
          message: 'Say hi and start planning your next trip together.',
        }}
        pinnable
        infoActions={infoActions}
      />

      {group ? (
        <>
          <EditGroupSheet visible={sheet === 'edit'} group={group} isDark={isDark} onClose={() => setSheet(null)} onSaved={() => void load()} />
          <AddPeopleSheet visible={sheet === 'add'} group={group} isDark={isDark} onClose={() => setSheet(null)} onAdded={() => void load()} />
          <ManageMembersSheet visible={sheet === 'members'} group={group} myUserId={myUserId} isDark={isDark} onClose={() => setSheet(null)} onChanged={() => void load()} />
        </>
      ) : null}
    </View>
  );
}
