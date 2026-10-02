import { GuildEmblem } from '@/components/GuildEmblem';
import { GuildFormModal, type GuildFormValues } from '@/components/GuildFormModal';
import { BadgeDetailModal } from '@/components/guild/BadgeDetailModal';
import { BecomeLeaderCard } from '@/components/guild/BecomeLeaderCard';
import { GuildAnnouncement } from '@/components/guild/GuildAnnouncement';
import { GuildAuditLogModal } from '@/components/guild/GuildAuditLogModal';
import { GuildReportModal } from '@/components/guild/GuildReportModal';
import { GuildReportsInbox } from '@/components/guild/GuildReportsInbox';
import { Segmented } from '@/components/guild/LeaderboardPanel';
import { MedalShareCard, shareMedalCard } from '@/components/guild/MedalShareCard';
import { RankMedal } from '@/components/guild/RankMedal';
import { RankMedalsModal } from '@/components/guild/RankMedalsModal';
import { RankUpCelebration } from '@/components/guild/RankUpCelebration';
import { BadgeMedal, SeasonMedal } from '@/components/guild/TrophyMedals';
import { UserRankTag } from '@/components/guild/UserRankTag';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { SkeletonRow } from '@/components/ui/motion';
import { Card } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useRankUp } from '@/hooks/use-rank-up';
import { parseTimestamp } from '@/lib/datetime';
import { listGuildReports } from '@/lib/guildReports';
import {
  badgesFor,
  createGuild,
  EARNING_GUIDE,
  cancelJoinRequest,
  ensureSeasonAwards,
  getGuild,
  getJoinRequests,
  getMyGuildInvites,
  getMyJoinRequest,
  respondGuildInvite,
  respondJoinRequest,
  type GuildJoinRequest,
  type MyGuildInvite,
  type MyJoinRequest,
  getGuildLeaderboard,
  getGuildMemberBoard,
  getPointsSummary,
  getRecentPointEvents,
  getSeasonAwards,
  formatGuildAreas,
  guildLevel,
  guildMemberCap,
  leaveGuild,
  rankFor,
  REASON_LABELS,
  removeGuildMember,
  seasonLabel,
  stepDownAsLeader,
  titleFor,
  transferGuildLeadership,
  updateGuild,
  type Badge,
  type Guild,
  type GuildMemberStanding,
  type GuildStanding,
  type LeaderboardPeriod,
  type PointEvent,
  type PointsSummary,
  type SeasonAward,
} from '@/lib/guilds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { Award, Check, ChevronRight, Coins, Crown, DoorOpen, Flag, LifeBuoy, Lock, Mail, MessageCircle, MoreVertical, Pencil, ScrollText, Search, Share2, Shield, Trophy, UserMinus, UserPlus, Users, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
];

type Props = {
  isDark: boolean;
  // Switches the Guild screen to its Leaderboard tab (where Join lives).
  onFindGuild: () => void;
  // Lets the Guild screen re-read which guild the user is in.
  onGuildChanged: () => void;
};

// The "My Guild" tab: rank, coins, my guild and its members, badges, how to
// earn, and recent points.
export function MyGuildPanel({ isDark, onFindGuild, onGuildChanged }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();

  function openPlayer(userId: string, displayName: string) {
    router.push({ pathname: '/profile/[id]', params: { id: userId, displayName } });
  }
  const { primaryColor, accentColor, warningColor, primaryText, mutedText, mutedPanel, softBorder } = getTheme(isDark);

  const isLeader = profile?.role === 'guild_leader';
  const isTraveler = profile?.role === 'traveler';

  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [openBadge, setOpenBadge] = useState<Badge | null>(null);
  const [guild, setGuild] = useState<Guild | null>(null);
  const [members, setMembers] = useState<GuildMemberStanding[]>([]);
  const [standings, setStandings] = useState<GuildStanding[]>([]);
  const [events, setEvents] = useState<PointEvent[]>([]);
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [medalsVisible, setMedalsVisible] = useState(false);
  const [seasonAwards, setSeasonAwards] = useState<SeasonAward[]>([]);
  const [joinRequests, setJoinRequests] = useState<GuildJoinRequest[]>([]);
  const [myRequest, setMyRequest] = useState<MyJoinRequest | null>(null);
  const [myInvites, setMyInvites] = useState<MyGuildInvite[]>([]);
  // Guild reports: the form (any member), the inbox and audit log (leader).
  const [reportVisible, setReportVisible] = useState(false);
  const [reportMemberId, setReportMemberId] = useState<string | null>(null);
  const [inboxVisible, setInboxVisible] = useState(false);
  const [auditVisible, setAuditVisible] = useState(false);
  const [openReports, setOpenReports] = useState(0);
  const shareCardRef = useRef<View>(null);
  const seasonsChecked = useRef(false);

  const load = useCallback(async (nextPeriod: LeaderboardPeriod) => {
    setErrorMessage(null);
    // Award last month's season medals if the monthly job hasn't yet (once per mount).
    if (!seasonsChecked.current) {
      seasonsChecked.current = true;
      await ensureSeasonAwards();
    }
    const [summaryResult, standingsResult, eventsResult, seasonResult] = await Promise.all([
      getPointsSummary(),
      getGuildLeaderboard(nextPeriod),
      getRecentPointEvents(15),
      getSeasonAwards(),
    ]);
    const firstError = summaryResult.error ?? standingsResult.error ?? eventsResult.error;
    if (firstError) setErrorMessage(firstError.message);

    setSummary(summaryResult.data);
    setStandings(standingsResult.data);
    setEvents(eventsResult.data);
    setSeasonAwards(seasonResult.data);

    const guildId = summaryResult.data?.guild_id ?? null;
    if (guildId) {
      const [guildResult, membersResult, requestsResult] = await Promise.all([
        getGuild(guildId),
        getGuildMemberBoard(guildId, nextPeriod),
        // Returns nothing unless the caller leads this guild (or is an admin).
        getJoinRequests(guildId),
      ]);
      setGuild(guildResult.data);
      setMembers(membersResult.data);
      setJoinRequests(requestsResult.data);
      setMyRequest(null);
      setMyInvites([]);
    } else {
      const [requestResult, invitesResult] = await Promise.all([getMyJoinRequest(), getMyGuildInvites()]);
      setGuild(null);
      setMembers([]);
      setJoinRequests([]);
      setMyRequest(requestResult.data);
      setMyInvites(invitesResult.data);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(period);
    }, [load, period])
  );

  function openReport(memberId: string | null) {
    setReportMemberId(memberId);
    setReportVisible(true);
  }

  // Members can report someone from their row.
  // Reporting the leader goes to PartyUp support instead, since the leader
  // is the one who handles guild reports.
  function memberMenu(member: GuildMemberStanding) {
    Alert.alert(member.display_name, member.is_leader ? 'Guild Leader' : undefined, [
      member.is_leader
        ? {
            text: 'Report to PartyUp',
            style: 'destructive',
            onPress: () =>
              router.push({
                pathname: '/support/new',
                params: { category: 'guild_leader', userId: member.user_id, userName: member.display_name, guildId: guild?.id ?? '', guildName: guild?.name ?? '' },
              }),
          }
        : { text: `Report ${member.display_name}`, style: 'destructive', onPress: () => openReport(member.user_id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmLeave() {
    if (!guild) return;
    Alert.alert(`Leave ${guild.name}?`, 'Points you already earned stay with you and with the guild.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusyId('leave');
          const { error } = await leaveGuild();
          setBusyId(null);
          if (error) {
            Alert.alert('Could not leave', error.message);
            return;
          }
          await load(period);
          onGuildChanged();
        },
      },
    ]);
  }

  function confirmRemove(member: GuildMemberStanding) {
    Alert.alert(`Remove ${member.display_name}?`, 'They will be notified and can join another guild.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyId(member.user_id);
          const { error } = await removeGuildMember(member.user_id);
          setBusyId(null);
          if (error) {
            Alert.alert('Could not remove', error.message);
            return;
          }
          setMembers((current) => current.filter((row) => row.user_id !== member.user_id));
        },
      },
    ]);
  }

  // Leader actions on a member: hand over leadership, or remove.
  function manageMember(member: GuildMemberStanding) {
    Alert.alert(member.display_name, 'Member', [
      { text: 'Make leader', onPress: () => confirmHandOver(member) },
      { text: 'Remove from guild', style: 'destructive', onPress: () => confirmRemove(member) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  // After a handover the caller is a traveler again, so the whole hub changes.
  async function afterHandOver(successorName: string) {
    await refreshProfile();
    await load(period);
    onGuildChanged();
    Alert.alert(`${successorName} leads ${guild?.name ?? 'the guild'} now`, "You're still a member, and your points and rank stay with you.");
  }

  function confirmHandOver(member: GuildMemberStanding) {
    if (!guild) return;
    Alert.alert(
      `Make ${member.display_name} the leader?`,
      `They take over ${guild.name}, and you become a regular member (traveler). Only an admin can make you a Guild Leader again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hand over',
          style: 'destructive',
          onPress: async () => {
            setBusyId(member.user_id);
            const { error } = await transferGuildLeadership(member.user_id);
            setBusyId(null);
            if (error) {
              Alert.alert('Could not hand over', error.message);
              return;
            }
            await afterHandOver(member.display_name);
          },
        },
      ]
    );
  }

  function confirmStepDown() {
    if (!guild) return;
    Alert.alert(
      'Step down as leader?',
      `Your top member by points takes over ${guild.name}, and you stay on as a member (traveler). To pick someone else, tap their name and choose "Make leader".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Step down',
          style: 'destructive',
          onPress: async () => {
            setBusyId('step-down');
            const { data, error } = await stepDownAsLeader();
            setBusyId(null);
            if (error) {
              Alert.alert('Could not step down', error.message);
              return;
            }
            await afterHandOver(data ?? 'Your top member');
          },
        },
      ]
    );
  }

  async function answerRequest(request: GuildJoinRequest, accept: boolean) {
    setBusyId(request.id);
    const { error } = await respondJoinRequest(request.id, accept);
    setBusyId(null);
    if (error) {
      Alert.alert(accept ? 'Could not accept' : 'Could not decline', error.message);
      await load(period);
      return;
    }
    setJoinRequests((current) => current.filter((row) => row.id !== request.id));
    if (accept) await load(period);
  }

  function confirmDecline(request: GuildJoinRequest) {
    Alert.alert(`Decline ${request.display_name}?`, "They'll be told this time didn't work out and can ask another guild.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => void answerRequest(request, false) },
    ]);
  }

  async function answerInvite(invite: MyGuildInvite, accept: boolean) {
    setBusyId(invite.id);
    const { error } = await respondGuildInvite(invite.id, accept);
    setBusyId(null);
    if (error) {
      Alert.alert(accept ? 'Could not join' : 'Could not decline', error.message);
      await load(period);
      return;
    }
    if (!accept) {
      setMyInvites((current) => current.filter((row) => row.id !== invite.id));
      return;
    }
    await load(period);
    onGuildChanged();
    Alert.alert(`Welcome to ${invite.guild_name}!`, 'You earned +10 points for joining.');
  }

  function confirmAcceptInvite(invite: MyGuildInvite) {
    const extra = myRequest ? ` Your pending request to ${myRequest.guild_name} will be cancelled.` : '';
    Alert.alert(`Join ${invite.guild_name}?`, `Your other open invites will be cancelled.${extra}`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Join', onPress: () => void answerInvite(invite, true) },
    ]);
  }

  function confirmDeclineInvite(invite: MyGuildInvite) {
    Alert.alert(`Decline ${invite.guild_name}'s invite?`, 'They can invite you again tomorrow.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => void answerInvite(invite, false) },
    ]);
  }

  function confirmCancelRequest() {
    if (!myRequest) return;
    Alert.alert(`Cancel your request to ${myRequest.guild_name}?`, 'You can ask again or pick another guild any time.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setBusyId('cancel-request');
          const { error } = await cancelJoinRequest();
          setBusyId(null);
          if (error) {
            Alert.alert('Could not cancel', error.message);
            return;
          }
          setMyRequest(null);
        },
      },
    ]);
  }

  async function submitGuildForm(values: GuildFormValues) {
    setFormBusy(true);
    setFormError(null);
    const { error } = guild ? await updateGuild(guild.id, values) : await createGuild(values);
    setFormBusy(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setFormVisible(false);
    await load(period);
    onGuildChanged();
  }

  function openForm() {
    setFormError(null);
    setFormVisible(true);
  }

  const lifetime = summary?.lifetime_points ?? 0;
  const { rank, next, progress, tier, nextTierAt } = rankFor(lifetime);
  const myStanding = guild ? standings.findIndex((row) => row.guild_id === guild.id) : -1;
  const myGuildRow = myStanding >= 0 ? standings[myStanding] : null;
  const badges = badgesFor(summary, profile?.role);
  // Pad the 3-column grid so the last row stays left-aligned.
  const badgeFillers = (3 - (badges.length % 3)) % 3;
  const { celebration, dismiss } = useRankUp(profile?.id, summary ? lifetime : null);

  // Leaders travel too, so they see the traveler lines as well as their own.
  const guide = EARNING_GUIDE.filter(
    (item) => profile?.role === 'admin' || item.role === profile?.role || (isLeader && item.role === 'traveler' && !item.once)
  );
  const canManage = !!guild && guild.leader_id === profile?.id;

  // Join requests show up live.
  const managedGuildId = canManage ? guild?.id : undefined;
  useEffect(() => {
    if (!managedGuildId) return;
    const channel = supabase
      .channel(uniqueChannelName(`guild-requests:${managedGuildId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guild_join_requests', filter: `guild_id=eq.${managedGuildId}` }, () => {
        void getJoinRequests(managedGuildId).then(({ data }) => setJoinRequests(data));
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [managedGuildId]);

  const loadOpenReports = useCallback(async () => {
    if (!managedGuildId) {
      setOpenReports(0);
      return;
    }
    const { data, error } = await listGuildReports(managedGuildId);
    if (!error) setOpenReports(data.filter((report) => report.status === 'open').length);
  }, [managedGuildId]);

  useFocusEffect(
    useCallback(() => {
      void loadOpenReports();
    }, [loadOpenReports])
  );

  async function refresh() {
    setRefreshing(true);
    await Promise.all([load(period), loadOpenReports()]);
    setRefreshing(false);
  }
  const periodLabel = PERIODS.find((p) => p.id === period)?.label.toLowerCase() ?? '';

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={primaryColor} />}>
        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        {loading ? (
          <Card key="loading">
            {[0, 1, 2].map((index) => (
              <SkeletonRow key={index} />
            ))}
          </Card>
        ) : (
          <View key="content" className="gap-4">
            {/* My guild (or how to get one) */}
            {guild ? (
              <Card key="my-guild" index={0}>
                <AnimatedPressable
                  onPress={() => router.push({ pathname: '/guild/[id]', params: { id: guild.id } })}
                  scaleTo={0.98}
                  className="flex-row items-center gap-3"
                  accessibilityLabel={`Open ${guild.name}'s Guild Hall`}>
                  <GuildEmblem emblem={guild.emblem} color={guild.color} size={56} />
                  <View className="flex-1">
                    <Text className={`text-xl font-black ${primaryText}`}>{guild.name}</Text>
                    {guild.tagline ? <Text className={`text-sm ${mutedText}`}>{guild.tagline}</Text> : null}
                    <Text className={`mt-1 text-xs font-semibold ${mutedText}`}>
                      Level {guildLevel(myGuildRow?.lifetime_points ?? 0)} · {members.length}/{guildMemberCap(myGuildRow?.lifetime_points ?? 0)} members
                      {myStanding >= 0 ? ` · #${myStanding + 1} ${periodLabel}` : ''}
                    </Text>
                    <View className="mt-1 flex-row items-center gap-1">
                      {guild.join_policy === 'approval' ? <Lock size={11} color={isDark ? '#94A3B8' : '#64748B'} /> : <DoorOpen size={11} color={isDark ? '#94A3B8' : '#64748B'} />}
                      <Text className={`text-xs ${mutedText}`}>
                        {guild.join_policy === 'approval' ? 'Approval required to join' : 'Open to all travelers'}
                        {guild.min_rank ? ` · ${guild.min_rank}+ only` : ''}
                        {guild.areas.length > 0 ? ` · ${formatGuildAreas(guild.areas)}` : ''}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={isDark ? '#64748B' : '#94A3B8'} />
                </AnimatedPressable>
                <View className="mt-4 flex-row gap-3">
                  <AnimatedPressable
                    onPress={() => router.push('/guild/chat')}
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl py-3"
                    style={{ backgroundColor: guild.color }}>
                    <MessageCircle size={16} color="#FFFFFF" />
                    <Text className="font-bold text-white">Guild chat</Text>
                  </AnimatedPressable>
                  {guild.leader_id === profile?.id ? (
                    <AnimatedPressable onPress={openForm} className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${softBorder}`}>
                      <Pencil size={16} color={primaryColor} />
                      <Text className="font-bold" style={{ color: primaryColor }}>
                        Edit guild
                      </Text>
                    </AnimatedPressable>
                  ) : (
                    <AnimatedPressable
                      onPress={confirmLeave}
                      disabled={busyId === 'leave'}
                      className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${softBorder}`}>
                      {busyId === 'leave' ? <ActivityIndicator color={primaryColor} /> : <UserMinus size={16} color={primaryColor} />}
                      <Text className="font-bold" style={{ color: primaryColor }}>
                        Leave guild
                      </Text>
                    </AnimatedPressable>
                  )}
                </View>
                {guild.leader_id === profile?.id ? (
                  <AnimatedPressable
                    key="step-down"
                    onPress={confirmStepDown}
                    disabled={busyId === 'step-down'}
                    scaleTo={0.97}
                    className="mt-3 flex-row items-center justify-center gap-1.5 py-1"
                    accessibilityLabel="Step down as Guild Leader">
                    {busyId === 'step-down' ? <ActivityIndicator color={isDark ? '#94A3B8' : '#67748D'} /> : <Crown size={14} color={isDark ? '#94A3B8' : '#67748D'} />}
                    <Text className={`text-sm font-semibold ${mutedText}`}>Step down as leader</Text>
                  </AnimatedPressable>
                ) : (
                  <View key="report-links" className="mt-3 flex-row items-center justify-center gap-6">
                    <AnimatedPressable
                      onPress={() => openReport(null)}
                      scaleTo={0.97}
                      className="flex-row items-center gap-1.5 py-1"
                      accessibilityLabel="Report a problem in this guild">
                      <Flag size={14} color={isDark ? '#94A3B8' : '#67748D'} />
                      <Text className={`text-sm font-semibold ${mutedText}`}>Report a problem</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      onPress={() => router.push('/support')}
                      scaleTo={0.97}
                      className="flex-row items-center gap-1.5 py-1"
                      accessibilityLabel="Help and Reports">
                      <LifeBuoy size={14} color={isDark ? '#94A3B8' : '#67748D'} />
                      <Text className={`text-sm font-semibold ${mutedText}`}>Help & Reports</Text>
                    </AnimatedPressable>
                  </View>
                )}
              </Card>
            ) : isLeader ? (
              <Card key="found-guild" index={0}>
                <View className="flex-row items-center gap-3">
                  <View className={`h-12 w-12 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                    <Crown size={24} color={primaryColor} />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-lg font-black ${primaryText}`}>Found your guild</Text>
                    <Text className={`text-sm ${mutedText}`}>Name it, recruit travelers, and climb the rankings together.</Text>
                  </View>
                </View>
                <AnimatedPressable onPress={openForm} className="mt-4 items-center rounded-2xl bg-[#284BD6] py-3.5">
                  <Text className="text-base font-bold text-white">Found a guild · +50 pts</Text>
                </AnimatedPressable>
              </Card>
            ) : isTraveler && myRequest ? (
              <Card key="pending-request" index={0}>
                <View className="flex-row items-center gap-3">
                  <GuildEmblem emblem={myRequest.guild_emblem} color={myRequest.guild_color} size={48} />
                  <View className="flex-1">
                    <Text className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Request pending</Text>
                    <Text className={`text-lg font-black ${primaryText}`}>{myRequest.guild_name}</Text>
                    <Text className={`text-sm ${mutedText}`}>{"The Guild Leader will accept or decline it. We'll notify you."}</Text>
                  </View>
                </View>
                <View className="mt-4 flex-row gap-3">
                  <AnimatedPressable
                    onPress={confirmCancelRequest}
                    disabled={busyId === 'cancel-request'}
                    className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${softBorder}`}>
                    {busyId === 'cancel-request' ? <ActivityIndicator color={primaryColor} /> : <X size={16} color={primaryColor} />}
                    <Text className="font-bold" style={{ color: primaryColor }}>
                      Cancel request
                    </Text>
                  </AnimatedPressable>
                  <AnimatedPressable onPress={onFindGuild} className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${softBorder}`}>
                    <Search size={16} color={primaryColor} />
                    <Text className="font-bold" style={{ color: primaryColor }}>
                      Other guilds
                    </Text>
                  </AnimatedPressable>
                </View>
              </Card>
            ) : isTraveler ? (
              <Card key="no-guild" index={0}>
                <View className="flex-row items-center gap-3">
                  <View className={`h-12 w-12 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                    <Shield size={24} color={primaryColor} />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-lg font-black ${primaryText}`}>You're not in a guild yet</Text>
                    <Text className={`text-sm ${mutedText}`}>Join one to earn points with a crew. You get +10 for joining.</Text>
                  </View>
                </View>
                <AnimatedPressable onPress={onFindGuild} className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-[#284BD6] py-3.5">
                  <Search size={16} color="#FFFFFF" />
                  <Text className="text-base font-bold text-white">Find a guild</Text>
                </AnimatedPressable>
              </Card>
            ) : null}

            {/* Invites from Guild Leaders, for travelers without a guild */}
            {!guild && isTraveler && myInvites.length > 0 ? (
              <Card key="guild-invites" index={0}>
                <View className="flex-row items-center gap-2">
                  <Mail size={18} color={primaryColor} />
                  <Text className={`${typography.sectionTitle} ${primaryText}`}>Guild Invites ({myInvites.length})</Text>
                </View>
                <View className="mt-3 gap-2">
                  {myInvites.map((invite) => (
                    <AnimatedPressable
                      key={invite.id}
                      onPress={() => router.push({ pathname: '/guild/[id]', params: { id: invite.guild_id } })}
                      scaleTo={0.98}
                      accessibilityLabel={`View ${invite.guild_name}`}
                      className={`flex-row items-center gap-3 rounded-2xl p-3 ${mutedPanel}`}>
                      <GuildEmblem emblem={invite.guild_emblem} color={invite.guild_color} size={40} />
                      <View className="flex-1">
                        <Text className={`text-base font-bold ${primaryText}`} numberOfLines={1}>
                          {invite.guild_name}
                        </Text>
                        <Text className={`text-xs ${mutedText}`} numberOfLines={1}>
                          Invited by {invite.invited_by_name ?? 'the Guild Leader'}
                        </Text>
                      </View>
                      {busyId === invite.id ? (
                        <ActivityIndicator color={primaryColor} />
                      ) : (
                        <View className="flex-row gap-2">
                          <AnimatedPressable
                            onPress={() => confirmDeclineInvite(invite)}
                            className={`h-9 w-9 items-center justify-center rounded-full border ${softBorder}`}
                            accessibilityLabel={`Decline ${invite.guild_name}'s invite`}>
                            <X size={16} color="#B91C1C" />
                          </AnimatedPressable>
                          <AnimatedPressable
                            onPress={() => confirmAcceptInvite(invite)}
                            className="flex-row items-center gap-1 rounded-full bg-[#284BD6] px-3"
                            accessibilityLabel={`Join ${invite.guild_name}`}>
                            <Check size={15} color="#FFFFFF" />
                            <Text className="text-xs font-bold text-white">Join</Text>
                          </AnimatedPressable>
                        </View>
                      )}
                    </AnimatedPressable>
                  ))}
                </View>
              </Card>
            ) : null}

            {/* Pinned announcement */}
            {guild ? <GuildAnnouncement key="announcement" guild={guild} isDark={isDark} canEdit={canManage} onSaved={() => void load(period)} /> : null}

            {/* Join requests waiting for the leader */}
            {joinRequests.length > 0 ? (
              <Card key="join-requests" index={0}>
                <View className="flex-row items-center gap-2">
                  <UserPlus size={18} color={primaryColor} />
                  <Text className={`${typography.sectionTitle} ${primaryText}`}>Join Requests ({joinRequests.length})</Text>
                </View>
                <View className="mt-3 gap-2">
                  {joinRequests.map((request) => (
                    <AnimatedPressable
                      key={request.id}
                      onPress={() => openPlayer(request.user_id, request.display_name)}
                      scaleTo={0.98}
                      accessibilityLabel={`View ${request.display_name}'s player card`}
                      className={`flex-row items-center gap-3 rounded-2xl p-3 ${mutedPanel}`}>
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-[#B7C4EC]">
                        <Text className="text-base font-bold text-[#24314A]">{request.display_name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View className="flex-1">
                        <Text className={`text-base font-bold ${primaryText}`} numberOfLines={1}>
                          {request.display_name}
                        </Text>
                        {request.lifetime_points > 0 ? (
                          <UserRankTag userId={request.user_id} isDark={isDark} points={request.lifetime_points} />
                        ) : (
                          <Text className={`text-xs ${mutedText}`}>New traveler</Text>
                        )}
                      </View>
                      {busyId === request.id ? (
                        <ActivityIndicator color={primaryColor} />
                      ) : (
                        <View className="flex-row gap-2">
                          <AnimatedPressable
                            onPress={() => confirmDecline(request)}
                            className={`h-9 w-9 items-center justify-center rounded-full border ${softBorder}`}
                            accessibilityLabel={`Decline ${request.display_name}`}>
                            <X size={16} color="#B91C1C" />
                          </AnimatedPressable>
                          <AnimatedPressable
                            onPress={() => void answerRequest(request, true)}
                            className="flex-row items-center gap-1 rounded-full bg-[#284BD6] px-3"
                            accessibilityLabel={`Accept ${request.display_name}`}>
                            <Check size={15} color="#FFFFFF" />
                            <Text className="text-xs font-bold text-white">Accept</Text>
                          </AnimatedPressable>
                        </View>
                      )}
                    </AnimatedPressable>
                  ))}
                </View>
              </Card>
            ) : null}

            {/* Leader tools: reports inbox and audit log */}
            {canManage ? (
              <Card key="guild-tools" index={0}>
                <View className="flex-row gap-3">
                  <AnimatedPressable
                    onPress={() => setInboxVisible(true)}
                    className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${softBorder}`}
                    accessibilityLabel={openReports > 0 ? `Reports, ${openReports} open` : 'Reports'}>
                    <Flag size={16} color={openReports > 0 ? '#DC2626' : primaryColor} />
                    <Text className="font-bold" style={{ color: primaryColor }}>
                      Reports
                    </Text>
                    {openReports > 0 ? (
                      <View className="min-w-[20px] items-center rounded-full bg-[#DC2626] px-1.5 py-0.5">
                        <Text className="text-[11px] font-black text-white">{openReports}</Text>
                      </View>
                    ) : null}
                  </AnimatedPressable>
                  <AnimatedPressable
                    onPress={() => setAuditVisible(true)}
                    className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${softBorder}`}>
                    <ScrollText size={16} color={primaryColor} />
                    <Text className="font-bold" style={{ color: primaryColor }}>
                      Audit log
                    </Text>
                  </AnimatedPressable>
                </View>
              </Card>
            ) : null}

            {/* My rank and coins */}
            <Card index={1}>
              <View className="flex-row items-center gap-3">
                <AnimatedPressable onPress={() => setMedalsVisible(true)} accessibilityLabel="Preview rank medals">
                  <RankMedal rank={rank.name} tier={tier} size={64} animated />
                </AnimatedPressable>
                <View className="flex-1">
                  <Text className={`text-xs font-semibold uppercase tracking-wide ${mutedText}`}>Your rank</Text>
                  <Text className={`text-xl font-black ${primaryText}`}>{titleFor(lifetime, profile?.role)}</Text>
                </View>
                <View className="items-end">
                  <View className="flex-row items-center gap-1">
                    <Coins size={16} color={warningColor} />
                    <Text className={`text-xl font-black ${primaryText}`}>{summary?.coins ?? 0}</Text>
                  </View>
                  <Text className={`text-xs ${mutedText}`}>coins</Text>
                </View>
              </View>

              <View className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#D9E4DE]">
                <View className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: rank.color }} />
              </View>
              <Text className={`mt-2 text-xs ${mutedText}`}>
                {next ? `${lifetime} / ${next.min} pts · ${next.min - lifetime} to ${next.name}` : `${lifetime} pts · Top rank reached`}
                {nextTierAt !== null && tier < 3 ? ` · ${nextTierAt - lifetime} to ${rank.name} ${['I', 'II', 'III'][tier]}` : ''}
              </Text>
              <View className="mt-3 flex-row gap-2">
                <AnimatedPressable
                  onPress={() => setMedalsVisible(true)}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2 ${softBorder}`}>
                  <Award size={14} color={primaryColor} />
                  <Text className="text-xs font-bold" style={{ color: primaryColor }}>
                    Preview medals
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => void shareMedalCard(shareCardRef, lifetime, profile?.role)}
                  disabled={lifetime <= 0}
                  className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2 ${softBorder}`}
                  style={{ opacity: lifetime <= 0 ? 0.5 : 1 }}>
                  <Share2 size={14} color={primaryColor} />
                  <Text className="text-xs font-bold" style={{ color: primaryColor }}>
                    Share my medal
                  </Text>
                </AnimatedPressable>
              </View>

              <View className="mt-4 flex-row gap-3">
                <MiniStat label="This week" value={summary?.week_points ?? 0} mutedPanel={mutedPanel} primaryText={primaryText} mutedText={mutedText} />
                <MiniStat label="This month" value={summary?.month_points ?? 0} mutedPanel={mutedPanel} primaryText={primaryText} mutedText={mutedText} />
                <MiniStat label="Lifetime" value={lifetime} mutedPanel={mutedPanel} primaryText={primaryText} mutedText={mutedText} />
              </View>
            </Card>

            {/* Members of my guild */}
            {guild ? (
              <Card key="members" index={2}>
                <View className="flex-row items-center gap-2">
                  <Users size={18} color={primaryColor} />
                  <Text className={`${typography.sectionTitle} ${primaryText}`}>Guild Members</Text>
                </View>
                <View className="mt-3">
                  <Segmented isDark={isDark} options={PERIODS} value={period} onChange={(value) => setPeriod(value as LeaderboardPeriod)} small />
                </View>
                {members.length === 0 ? (
                  <Text className={`mt-3 text-sm ${mutedText}`}>No members yet. Share your guild name with travelers you meet.</Text>
                ) : (
                  <View className="mt-3 gap-2">
                    {members.map((member, index) => (
                      <AnimatedPressable
                        key={member.user_id}
                        onPress={() => openPlayer(member.user_id, member.display_name)}
                        scaleTo={0.98}
                        accessibilityLabel={`View ${member.display_name}'s player card`}
                        className={`flex-row items-center gap-3 rounded-2xl p-3 ${mutedPanel}`}>
                        <Text className={`w-6 text-center text-sm font-black ${index < 3 ? '' : mutedText}`} style={index < 3 ? { color: warningColor } : undefined}>
                          {index + 1}
                        </Text>
                        <View className="h-9 w-9 items-center justify-center rounded-full bg-[#B7C4EC]">
                          <Text className="text-sm font-bold text-[#24314A]">{member.display_name.charAt(0).toUpperCase()}</Text>
                          <UserRankTag userId={member.user_id} isDark={isDark} variant="overlay" points={member.lifetime_points} size={18} />
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center gap-1.5">
                            <Text className={`shrink text-base font-bold ${primaryText}`} numberOfLines={1}>
                              {member.display_name}
                            </Text>
                            {member.is_leader ? <Crown size={13} color={guild.color} /> : null}
                          </View>
                          <Text className={`text-xs ${mutedText}`}>{titleFor(member.lifetime_points, member.is_leader ? 'guild_leader' : 'traveler')}</Text>
                        </View>
                        <Text className={`text-base font-black ${primaryText}`}>{member.points}</Text>
                        {guild.leader_id === profile?.id && !member.is_leader ? (
                          <AnimatedPressable
                            onPress={() => manageMember(member)}
                            disabled={busyId === member.user_id}
                            className="h-8 w-8 items-center justify-center"
                            accessibilityLabel={`Manage ${member.display_name}`}>
                            {busyId === member.user_id ? <ActivityIndicator color={primaryColor} /> : <MoreVertical size={18} color={isDark ? '#94A3B8' : '#64748B'} />}
                          </AnimatedPressable>
                        ) : guild.leader_id !== profile?.id && member.user_id !== profile?.id ? (
                          <AnimatedPressable
                            onPress={() => memberMenu(member)}
                            className="h-8 w-8 items-center justify-center"
                            accessibilityLabel={`More options for ${member.display_name}`}>
                            <MoreVertical size={18} color={isDark ? '#94A3B8' : '#64748B'} />
                          </AnimatedPressable>
                        ) : null}
                      </AnimatedPressable>
                    ))}
                  </View>
                )}
              </Card>
            ) : null}

            {/* The leadership path for travelers */}
            {isTraveler ? <BecomeLeaderCard key="become-leader" isDark={isDark} index={3} /> : null}

            {/* Season medals */}
            <Card index={3}>
              <View className="flex-row items-center gap-2">
                <Trophy size={18} color={warningColor} />
                <Text className={`${typography.sectionTitle} ${primaryText}`}>Season Medals</Text>
              </View>
              {seasonAwards.length === 0 ? (
                <Text className={`mt-2 text-sm ${mutedText}`}>
                  Finish a month in the top 3 players, or with your guild in the top 3 guilds, to win a permanent season medal.
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="gap-3">
                  {seasonAwards.map((award) => (
                    <View key={award.id} className={`w-[104px] items-center rounded-2xl p-2.5 ${mutedPanel}`}>
                      <SeasonMedal place={award.place} board={award.board} size={52} />
                      <Text className={`mt-1 text-xs font-black ${primaryText}`}>{seasonLabel(award.season)}</Text>
                      <Text className={`text-center text-[10px] ${mutedText}`} numberOfLines={2}>
                        {['1st', '2nd', '3rd'][award.place - 1]} {award.board === 'player' ? 'player' : award.name}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </Card>

            {/* Badges */}
            <Card index={4}>
              <Text className={`${typography.sectionTitle} ${primaryText}`}>Badges</Text>
              <Text className={`mt-1 text-xs ${mutedText}`}>
                {badges.filter((badge) => badge.earned).length} of {badges.length} earned · tap one for details
              </Text>
              <View className="mt-3 flex-row flex-wrap justify-between gap-y-3">
                {badges.map((badge) => (
                  <AnimatedPressable
                    key={badge.id}
                    onPress={() => setOpenBadge(badge)}
                    className={`w-[31%] items-center rounded-2xl p-3 ${mutedPanel}`}
                    style={{ opacity: badge.earned ? 1 : 0.6 }}>
                    <BadgeMedal icon={badge.icon} tier={badge.tier} maxTier={badge.thresholds.length} size={46} />
                    <Text className={`mt-1.5 text-center text-xs font-bold ${primaryText}`}>{badge.name}</Text>
                    <Text className={`mt-0.5 text-center text-[10px] leading-3 ${mutedText}`}>{badge.description}</Text>
                  </AnimatedPressable>
                ))}
                {Array.from({ length: badgeFillers }).map((_, index) => (
                  <View key={`filler-${index}`} className="w-[31%]" />
                ))}
              </View>
            </Card>

            {/* How to earn */}
            <Card index={5}>
              <Text className={`${typography.sectionTitle} ${primaryText}`}>How to Earn</Text>
              <View className="mt-3 gap-2">
                {guide.map((item) => (
                  <View key={`${item.role}-${item.label}`} className="flex-row items-center justify-between">
                    <Text className={`flex-1 text-sm ${mutedText}`}>{item.label}</Text>
                    <Text className="text-sm font-black" style={{ color: accentColor }}>
                      +{item.points}
                    </Text>
                  </View>
                ))}
              </View>
              <Text className={`mt-3 text-xs ${mutedText}`}>Points set your rank. Coins are the same points, spendable on rewards.</Text>
            </Card>

            {/* Recent activity */}
            <Card index={6}>
              <Text className={`${typography.sectionTitle} ${primaryText}`}>Recent Points</Text>
              {events.length === 0 ? (
                <Text className={`mt-3 text-sm ${mutedText}`}>Nothing yet. Your first points will show up here.</Text>
              ) : (
                <View className="mt-3 gap-2.5">
                  {events.map((event) => (
                    <View key={event.id} className="flex-row items-center gap-3">
                      <View className="flex-1">
                        <Text className={`text-sm font-semibold ${primaryText}`}>{REASON_LABELS[event.reason] ?? event.reason}</Text>
                        <Text className={`text-xs ${mutedText}`} numberOfLines={1}>
                          {event.note ? `${event.note} · ` : ''}
                          {parseTimestamp(event.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text className="text-sm font-black" style={{ color: event.amount > 0 ? accentColor : warningColor }}>
                        {event.amount > 0 ? `+${event.amount}` : event.amount}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </View>
        )}
      </ScrollView>

      <GuildFormModal
        visible={formVisible}
        isDark={isDark}
        guild={guild}
        busy={formBusy}
        errorMessage={formError}
        onClose={() => setFormVisible(false)}
        onSubmit={(values) => void submitGuildForm(values)}
      />

      {guild ? (
        <>
          <GuildReportModal
            visible={reportVisible}
            onClose={() => setReportVisible(false)}
            isDark={isDark}
            guildId={guild.id}
            guildName={guild.name}
            myUserId={profile?.id}
            members={members}
            initialMemberId={reportMemberId}
          />
          {canManage ? (
            <>
              <GuildReportsInbox
                visible={inboxVisible}
                onClose={() => setInboxVisible(false)}
                isDark={isDark}
                guildId={guild.id}
                onChanged={setOpenReports}
              />
              <GuildAuditLogModal visible={auditVisible} onClose={() => setAuditVisible(false)} isDark={isDark} guildId={guild.id} />
            </>
          ) : null}
        </>
      ) : null}

      <BadgeDetailModal badge={openBadge} isDark={isDark} onClose={() => setOpenBadge(null)} />
      <RankMedalsModal visible={medalsVisible} isDark={isDark} lifetimePoints={lifetime} role={profile?.role} onClose={() => setMedalsVisible(false)} />

      <RankUpCelebration celebration={celebration} role={profile?.role} displayName={profile?.display_name ?? ''} guildName={guild?.name} onClose={dismiss} />

      {/* Off-screen share card for "Share my medal". */}
      <View pointerEvents="none" style={{ position: 'absolute', left: -2000, top: 0 }}>
        <MedalShareCard ref={shareCardRef} points={lifetime} role={profile?.role} displayName={profile?.display_name ?? ''} guildName={guild?.name} />
      </View>
    </>
  );
}

function MiniStat({ label, value, mutedPanel, primaryText, mutedText }: { label: string; value: number; mutedPanel: string; primaryText: string; mutedText: string }) {
  return (
    <View className={`flex-1 rounded-2xl p-3 ${mutedPanel}`}>
      <Text className={`text-[11px] ${mutedText}`}>{label}</Text>
      <Text className={`mt-1 text-lg font-black ${primaryText}`}>{value}</Text>
    </View>
  );
}
