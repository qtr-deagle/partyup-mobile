import { GroupChatView } from '@/components/chat/GroupChatView';
import { GuildEmblem } from '@/components/GuildEmblem';
import { UserRankTag } from '@/components/guild/UserRankTag';
import { EmptyState } from '@/components/ui/motion';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listBlockedUsers } from '@/lib/blocking';
import { deleteGuildChatMessage, getGuild, getGuildChatThread, getGuildMemberBoard, getPointsSummary, type Guild, type GuildMemberStanding } from '@/lib/guilds';
import { useAuth } from '@/hooks/auth-provider';
import { useRouter } from 'expo-router';
import { Crown, MessageCircle, Shield } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

// The guild's group chat. One thread per guild; membership follows the guild
// (joining adds you, leaving removes you), all handled in the database.
export default function GuildChatScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { session } = useAuth();
  const myUserId = session?.user.id;
  const [guild, setGuild] = useState<Guild | null>(null);
  const [members, setMembers] = useState<GuildMemberStanding[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notInGuild, setNotInGuild] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ data: summary }, threadResult, blocked] = await Promise.all([getPointsSummary(), getGuildChatThread(), listBlockedUsers()]);
      if (cancelled) return;
      setBlockedIds(new Set(blocked.data.map((row) => row.blocked_id)));
      const guildId = summary?.guild_id ?? null;
      if (!guildId || !threadResult.data) {
        setNotInGuild(true);
        setLoading(false);
        return;
      }
      const [guildResult, membersResult] = await Promise.all([getGuild(guildId), getGuildMemberBoard(guildId, 'all')]);
      if (cancelled) return;
      setGuild(guildResult.data);
      setMembers(membersResult.data);
      setThreadId(threadResult.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const me = myUserId ? byId.get(myUserId) : undefined;
  const canModerate = !!me && (me.is_leader || me.member_role === 'officer');
  const color = guild?.color ?? '#284BD6';

  return (
    <GroupChatView
      threadId={threadId}
      loading={loading}
      blocker={notInGuild ? <EmptyState icon={<Shield size={34} color="#2A55D4" />} title="Join a guild to chat" message="Guild chat is for members. Find a guild on the Leaderboard." /> : undefined}
      title={guild?.name ?? 'Guild chat'}
      subtitle={`Guild chat · ${members.length} ${members.length === 1 ? 'member' : 'members'}`}
      avatar={guild ? <GuildEmblem emblem={guild.emblem} color={color} size={38} /> : <View style={{ width: 38, height: 38 }} />}
      color={color}
      onPressTitle={guild ? () => router.push({ pathname: '/guild/[id]', params: { id: guild.id } }) : undefined}
      members={members.map((member) => ({
        userId: member.user_id,
        name: member.display_name,
        avatarUrl: member.avatar_url,
        label: member.is_leader ? 'Leader' : member.member_role === 'officer' ? 'Officer' : undefined,
      }))}
      blockedIds={blockedIds}
      renderAvatarBadge={(userId) => {
        const sender = byId.get(userId);
        return sender ? <UserRankTag userId={sender.user_id} isDark={isDark} variant="overlay" points={sender.lifetime_points} size={15} /> : null;
      }}
      renderNameTag={(userId) => {
        const sender = byId.get(userId);
        if (sender?.is_leader) return <Crown size={11} color={color} />;
        if (sender?.member_role === 'officer') {
          return (
            <View className="rounded px-1" style={{ backgroundColor: `${color}22` }}>
              <Text className="text-[9px] font-black" style={{ color }}>OFFICER</Text>
            </View>
          );
        }
        return null;
      }}
      onModerateRemove={canModerate ? deleteGuildChatMessage : undefined}
      placeholder={`Message ${guild?.name ?? 'your guild'}`}
      empty={{ icon: <MessageCircle size={34} color={color} />, title: 'Start the conversation', message: 'Plan the next trip, share tips, or just say hi to your guild.' }}
      infoLink={guild ? { label: 'View guild', onPress: () => router.push({ pathname: '/guild/[id]', params: { id: guild.id } }) } : undefined}
    />
  );
}
