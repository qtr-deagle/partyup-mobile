import { AvatarFrame } from '@/components/cosmetics/AvatarFrame';
import { ProfileBanner } from '@/components/cosmetics/ProfileBanner';
import { PlayerRankCard } from '@/components/guild/PlayerRankCard';
import { useAuth } from '@/hooks/auth-provider';
import { ProfileTrophies } from '@/components/guild/ProfileTrophies';
import { ReportUserModal } from '@/components/ReportUserModal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ConfirmDialog, useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { riseIn, Skeleton } from '@/components/ui/motion';
import { Card } from '@/components/ui/screen-header';
import { formatResidence } from '@/lib/bulacan';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { blockUser, unblockUser } from '@/lib/blocking';
import { getLoadout, type Loadout } from '@/lib/cosmetics';
import { cancelGuildInvite, getGuildInviteStatus, inviteToGuild, type GuildInviteStatus } from '@/lib/guilds';
import { createOrGetDirectThread, getFriendRequestStatuses, getProfileById, removeFriend, respondToFriendRequest, sendFriendRequest, type SearchProfile } from '@/lib/social';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, Check, Clock3, Flag, Lock, MailCheck, MapPin, MessageCircle, PartyPopper, Pencil, Shield, ShieldOff, Star, UserCheck, UserMinus, UserPlus, Users, X } from 'lucide-react-native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function getAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear = today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function ActionButton({
  label,
  sublabel,
  icon,
  variant,
  isDark,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  sublabel?: string;
  icon: ReactNode;
  variant: 'primary' | 'soft' | 'pending';
  isDark: boolean;
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const box =
    variant === 'primary'
      ? 'bg-[#284BD6]'
      : variant === 'pending'
        ? isDark
          ? 'border border-[#5B4A1E] bg-[#2A2414]'
          : 'border border-[#F5D9A6] bg-[#FFF8EB]'
        : isDark
          ? 'border border-[#22324B] bg-[#18253C]'
          : 'border border-[#E1E7F2] bg-white';
  const text = variant === 'primary' ? 'text-white' : variant === 'pending' ? (isDark ? 'text-[#FCD34D]' : 'text-[#B45309]') : isDark ? 'text-[#E2E8F0]' : 'text-[#1B2340]';
  return (
    <AnimatedPressable onPress={onPress} disabled={busy || disabled} scaleTo={0.97} className="flex-1">
      <View className={`h-[52px] flex-row items-center justify-center gap-2 rounded-2xl px-3 ${box}`}>
        {busy ? (
          <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : isDark ? '#E2E8F0' : '#284BD6'} />
        ) : (
          <>
            {icon}
            <View className="items-center">
              <Text className={`text-[15px] font-bold ${text}`}>{label}</Text>
              {sublabel ? <Text className={`text-[11px] font-medium opacity-70 ${text}`}>{sublabel}</Text> : null}
            </View>
          </>
        )}
      </View>
    </AnimatedPressable>
  );
}

// The person's photo with a small action badge, for the top of dialogs.
function DialogAvatar({ url, name, badge, badgeColor, isDark }: { url: string | null; name: string; badge: ReactNode; badgeColor: string; isDark: boolean }) {
  return (
    <View className="h-[76px] w-[76px]">
      <View className={`h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full border-4 bg-[#B7C4EC] ${isDark ? 'border-[#18253C]' : 'border-[#EEF2FF]'}`}>
        {url ? <Image source={{ uri: url }} className="h-full w-full" /> : <Text className="text-[28px] font-bold text-[#24314A]">{name.charAt(0).toUpperCase()}</Text>}
      </View>
      <View
        className={`absolute -bottom-0.5 -right-0.5 h-7 w-7 items-center justify-center rounded-full border-[3px] ${isDark ? 'border-[#111B2E]' : 'border-white'}`}
        style={{ backgroundColor: badgeColor }}>
        {badge}
      </View>
    </View>
  );
}

export default function PublicProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; displayName?: string; interests?: string; avatarUrl?: string; requestStatus?: string; requestId?: string; place?: string; period?: string }>();
  const [requesting, setRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState(params.requestStatus || '');
  const [requestId, setRequestId] = useState(params.requestId || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullProfile, setFullProfile] = useState<SearchProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  // Set only when the viewer leads a guild.
  const [inviteStatus, setInviteStatus] = useState<GuildInviteStatus | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [loadout, setLoadout] = useState<Loadout>({ banner: null, frame: null });
  const [messaging, setMessaging] = useState(false);
  const dialog = useConfirmDialog();
  const displayName = fullProfile?.display_name ?? params.displayName ?? 'PartyUp traveler';
  const interests = useMemo(() => {
    if (fullProfile) return fullProfile.interests;
    try {
      return params.interests ? JSON.parse(params.interests) as string[] : [];
    } catch {
      return [];
    }
  }, [fullProfile, params.interests]);
  const age = getAge(fullProfile?.date_of_birth ?? null);
  const verified = fullProfile?.verification_status === 'approved';
  const location = formatResidence(fullProfile?.city);
  const avatarUrl = fullProfile?.avatar_url || params.avatarUrl || null;
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';

  const loadProfile = useCallback(() => {
    setProfileLoading(true);
    return Promise.all([
      getFriendRequestStatuses([params.id]).then((statuses) => {
        const relationship = statuses.get(params.id);
        setRequestStatus(relationship?.status ?? '');
        setRequestId(relationship?.requestId ?? '');
      }),
      getProfileById(params.id).then((result) => {
        setFullProfile(result.data);
        setProfileLoading(false);
      }),
      getGuildInviteStatus(params.id).then((result) => setInviteStatus(result.data)),
      getLoadout(params.id).then(setLoadout),
    ]);
  }, [params.id]);
  const { refreshing, refreshControl } = usePullToRefresh(loadProfile);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const avatarHero = (badge: ReactNode, badgeColor: string) => (
    <DialogAvatar url={avatarUrl} name={displayName} badge={badge} badgeColor={badgeColor} isDark={isDark} />
  );

  function confirmCancelRequest() {
    dialog.open({
      hero: avatarHero(<Clock3 size={13} color="#FFFFFF" />, '#E5A00D'),
      title: 'Cancel friend request?',
      message: `${displayName} won't see your request anymore. You can send a new one later.`,
      tone: 'danger',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep request',
      onConfirm: handleCancelRequest,
    });
  }

  function confirmDeclineRequest() {
    dialog.open({
      hero: avatarHero(<X size={13} color="#FFFFFF" />, '#E32727'),
      title: 'Decline request?',
      message: `${displayName} won't be notified that you declined.`,
      tone: 'danger',
      confirmLabel: 'Decline',
      cancelLabel: 'Not now',
      onConfirm: async () => {
        setRequesting(true);
        setErrorMessage(null);
        const { error } = await respondToFriendRequest(requestId, 'rejected');
        setRequesting(false);
        if (error) {
          setErrorMessage(error.message);
          return;
        }
        setRequestStatus('');
        setRequestId('');
      },
    });
  }

  async function openChat() {
    setMessaging(true);
    setErrorMessage(null);
    const result = await createOrGetDirectThread(params.id);
    setMessaging(false);
    if (result.error) {
      setErrorMessage(result.error.message);
      return;
    }
    router.push({ pathname: '/(tabs)/chat', params: { threadId: String(result.data) } });
  }

  async function handleRequest() {
    setRequesting(true);
    setErrorMessage(null);
    const { data, error } = requestStatus === 'incoming_pending' && requestId
      ? await respondToFriendRequest(requestId, 'accepted')
      : await sendFriendRequest(params.id);
    setRequesting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (data?.id) {
      setRequestId(data.id);
    }
    if (requestStatus === 'incoming_pending') {
      const threadResult = await createOrGetDirectThread(params.id);
      if (threadResult.error) {
        setErrorMessage(threadResult.error.message);
        return;
      }
      setRequestStatus('accepted');
      dialog.open({
        hero: avatarHero(<PartyPopper size={13} color="#FFFFFF" />, '#00A56A'),
        title: "You're now friends!",
        message: `Start planning your next trip together. Say hi to ${displayName}?`,
        tone: 'success',
        confirmLabel: 'Say hi',
        cancelLabel: 'Later',
        onConfirm: () => router.push({ pathname: '/(tabs)/chat', params: { threadId: String(threadResult.data) } }),
      });
      return;
    }
    setRequestStatus('outgoing_pending');
  }

  async function handleCancelRequest() {
    setRequesting(true);
    setErrorMessage(null);
    const { error } = await respondToFriendRequest(requestId, 'cancelled');
    setRequesting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setRequestStatus('');
    setRequestId('');
  }

  function confirmRemoveFriend() {
    dialog.open({
      hero: avatarHero(<UserMinus size={13} color="#FFFFFF" />, '#E32727'),
      title: `Unfriend ${displayName}?`,
      message: "You'll be removed from each other's friends list. Your chat history stays.",
      tone: 'danger',
      confirmLabel: 'Unfriend',
      cancelLabel: 'Keep as friend',
      onConfirm: handleRemoveFriend,
    });
  }

  async function handleRemoveFriend() {
    setRequesting(true);
    setErrorMessage(null);
    const { error } = await removeFriend(params.id);
    setRequesting(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setRequestStatus('');
    setRequestId('');
  }

  function confirmBlock() {
    dialog.open({
      hero: avatarHero(<Shield size={13} color="#FFFFFF" />, '#E32727'),
      title: `Block ${displayName}?`,
      message: "You won't see them in Discover, nearby travelers or search, and any friend connection will be removed. You can unblock them later in Settings.",
      tone: 'danger',
      confirmLabel: 'Block',
      cancelLabel: 'Cancel',
      onConfirm: handleBlock,
    });
  }

  function confirmUnblock() {
    dialog.open({
      hero: avatarHero(<ShieldOff size={13} color="#FFFFFF" />, '#284BD6'),
      title: `Unblock ${displayName}?`,
      message: "They'll show up in Discover and search again. Your old friend connection won't come back.",
      confirmLabel: 'Unblock',
      cancelLabel: 'Cancel',
      onConfirm: handleUnblock,
    });
  }

  async function handleBlock() {
    setBlockBusy(true);
    setErrorMessage(null);
    const { error } = await blockUser(params.id);
    setBlockBusy(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setFullProfile((current) => (current ? { ...current, is_blocked_by_me: true } : current));
    setRequestStatus('');
    setRequestId('');
  }

  async function handleUnblock() {
    setBlockBusy(true);
    setErrorMessage(null);
    const { error } = await unblockUser(params.id);
    setBlockBusy(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setFullProfile((current) => (current ? { ...current, is_blocked_by_me: false } : current));
  }

  async function handleInvite() {
    if (!inviteStatus) return;
    setInviteBusy(true);
    setErrorMessage(null);
    const { error } = await inviteToGuild(params.id);
    // Re-read either way: on failure the rules may have changed since load.
    const refreshed = await getGuildInviteStatus(params.id);
    setInviteBusy(false);
    setInviteStatus(refreshed.data);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    dialog.open({
      hero: avatarHero(<MailCheck size={13} color="#FFFFFF" />, '#00A56A'),
      title: 'Invite sent',
      message: `${displayName} will get a notification to join ${inviteStatus.guild_name}.`,
      tone: 'success',
      confirmLabel: 'Done',
    });
  }

  function confirmCancelInvite() {
    if (!inviteStatus?.invite_id) return;
    const inviteId = inviteStatus.invite_id;
    dialog.open({
      hero: avatarHero(<Users size={13} color="#FFFFFF" />, '#E5A00D'),
      title: 'Cancel guild invite?',
      message: `${displayName}'s invite to ${inviteStatus.guild_name} will be withdrawn.`,
      tone: 'danger',
      confirmLabel: 'Cancel invite',
      cancelLabel: 'Keep invite',
      onConfirm: async () => {
        setInviteBusy(true);
        const { error } = await cancelGuildInvite(inviteId);
        const refreshed = await getGuildInviteStatus(params.id);
        setInviteBusy(false);
        setInviteStatus(refreshed.data);
        if (error) setErrorMessage(error.message);
      },
    });
  }

  // Opened on yourself (e.g. from a leaderboard or roster): no friend/report/block.
  const isSelf = !!session?.user.id && session.user.id === params.id;
  const divider = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';

  return (
    <ScrollView
      className={`flex-1 ${background}`}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      refreshControl={refreshControl}>
      <ProfileBanner bannerKey={loadout.banner} height={insets.top + 130}>
        <AnimatedPressable
          onPress={() => router.back()}
          scaleTo={0.9}
          className="ml-4 h-10 w-10 items-center justify-center rounded-full bg-white/20"
          style={{ marginTop: insets.top + 10 }}
          accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </AnimatedPressable>
      </ProfileBanner>

      <View className="-mt-16 gap-4 px-4">
        <Card index={0} className="items-center px-5 pb-5 pt-0">
          <Animated.View entering={riseIn(80)} className="-mt-12 h-24 w-24">
            <AvatarFrame frameKey={loadout.frame} size={96}>
              <View className={`h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 bg-[#B7C4EC] ${isDark ? 'border-[#111B2E]' : 'border-white'}`}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} className="h-full w-full" />
                ) : (
                  <Text className="text-[34px] font-bold text-[#24314A]">{displayName.charAt(0).toUpperCase()}</Text>
                )}
              </View>
            </AvatarFrame>
          </Animated.View>

          <View className="mt-3 max-w-full flex-row items-center gap-1.5 px-2">
            <Text numberOfLines={2} className={`shrink text-center text-headline-24 font-bold ${primary}`}>{displayName}</Text>
            {verified ? <BadgeCheck size={20} color="#179B67" /> : null}
          </View>

          {age !== null ? (
            <View className="mt-2 flex-row items-center gap-2">
              <View className={`h-px w-4 ${isDark ? 'bg-[#B08D57]/40' : 'bg-[#A9793F]/30'}`} />
              <Text className={`text-[11px] font-semibold uppercase tracking-[3px] ${isDark ? 'text-[#D9B77E]' : 'text-[#A9793F]'}`}>{age} Years Old</Text>
              <View className={`h-px w-4 ${isDark ? 'bg-[#B08D57]/40' : 'bg-[#A9793F]/30'}`} />
            </View>
          ) : null}

          {location ? (
            <View className="mt-2 flex-row items-center gap-1">
              <MapPin size={14} color={isDark ? '#94A3B8' : '#6C7A95'} />
              <Text className={`text-sm ${secondary}`}>{location}</Text>
            </View>
          ) : age === null ? (
            <Text className={`mt-2 text-sm ${secondary}`}>PartyUp traveler</Text>
          ) : null}

          {profileLoading && !refreshing ? (
            <Skeleton key="trust-loading" className="mt-3 h-8 w-44 rounded-full" />
          ) : (
            <Animated.View
              key="trust-loaded"
              entering={FadeIn.duration(250)}
              className={`mt-3 flex-row items-center gap-1 rounded-full px-3 py-1.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#F5F7FB]'}`}>
              {fullProfile && fullProfile.trust_count > 0 && fullProfile.trust_score !== null ? (
                <>
                  <Star size={14} color="#F5A623" fill="#F5A623" />
                  <Text className={`text-sm font-bold ${primary}`}>{fullProfile.trust_score?.toFixed(1)} · {fullProfile.trust_count} trust {fullProfile.trust_count === 1 ? 'review' : 'reviews'}</Text>
                </>
              ) : (
                <Text className={`text-sm font-bold ${secondary}`}>New to PartyUp</Text>
              )}
            </Animated.View>
          )}

          {fullProfile?.bio ? <Text className={`mt-4 text-center text-[15px] leading-6 ${secondary}`}>{fullProfile.bio}</Text> : null}

          {errorMessage ? <Text className="mt-5 self-stretch rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}

          {isSelf ? (
            <AnimatedPressable
              key="edit-self"
              onPress={() => router.push('/edit-profile')}
              className={`mt-5 flex-row items-center justify-center gap-2 self-stretch rounded-2xl border py-3.5 ${isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#284BD6] bg-white'}`}>
              <Pencil size={16} color={isDark ? '#E2E8F0' : '#284BD6'} />
              <Text className={`font-bold ${isDark ? 'text-[#E2E8F0]' : 'text-[#284BD6]'}`}>Edit profile</Text>
            </AnimatedPressable>
          ) : !fullProfile?.is_blocked_by_me ? (
            <>
            {requestStatus === 'incoming_pending' ? (
              <View key="incoming" className={`mt-5 self-stretch rounded-2xl p-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F0F4FF]'}`}>
                <View className="flex-row items-center gap-2 px-1 pb-3">
                  <UserPlus size={15} color={isDark ? '#A5B8F5' : '#284BD6'} />
                  <Text className={`flex-1 text-[13px] font-semibold ${isDark ? 'text-[#C7D2FE]' : 'text-[#284BD6]'}`}>
                    {displayName.split(/\s+/)[0]} sent you a friend request
                  </Text>
                </View>
                <View className="flex-row gap-2">
                  <ActionButton label="Decline" icon={<X size={16} color={isDark ? '#E2E8F0' : '#1B2340'} />} variant="soft" isDark={isDark} disabled={requesting} onPress={confirmDeclineRequest} />
                  <ActionButton label="Accept" icon={<Check size={16} color="#FFFFFF" />} variant="primary" isDark={isDark} busy={requesting} onPress={() => void handleRequest()} />
                </View>
              </View>
            ) : (
              <View key="friend-actions" className="mt-5 flex-row gap-2 self-stretch">
                {requestStatus === 'accepted' ? (
                  <>
                    <ActionButton label="Friends" icon={<UserCheck size={16} color={isDark ? '#E2E8F0' : '#1B2340'} />} variant="soft" isDark={isDark} busy={requesting} onPress={confirmRemoveFriend} />
                    <ActionButton label="Message" icon={<MessageCircle size={16} color="#FFFFFF" />} variant="primary" isDark={isDark} busy={messaging} onPress={() => void openChat()} />
                  </>
                ) : requestStatus === 'outgoing_pending' ? (
                  <ActionButton label="Request sent" sublabel="Tap to cancel" icon={<Clock3 size={16} color={isDark ? '#FCD34D' : '#B45309'} />} variant="pending" isDark={isDark} busy={requesting} onPress={confirmCancelRequest} />
                ) : (
                  <ActionButton label="Add Friend" icon={<UserPlus size={16} color="#FFFFFF" />} variant="primary" isDark={isDark} busy={requesting} onPress={() => void handleRequest()} />
                )}
              </View>
            )}

            {inviteStatus?.invite_id ? (
              <AnimatedPressable
                key="invite-sent"
                onPress={confirmCancelInvite}
                disabled={inviteBusy}
                className={`mt-3 flex-row items-center justify-center gap-2 self-stretch rounded-2xl border py-3.5 ${isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#CBD5F5] bg-[#F5F7FF]'}`}>
                {inviteBusy ? <ActivityIndicator color={isDark ? '#A5B8F5' : '#284BD6'} /> : <MailCheck size={17} color={isDark ? '#A5B8F5' : '#284BD6'} />}
                <Text className={`font-bold ${isDark ? 'text-[#A5B8F5]' : 'text-[#284BD6]'}`}>Invited to {inviteStatus.guild_name} · Cancel</Text>
              </AnimatedPressable>
            ) : inviteStatus?.can_invite ? (
              <AnimatedPressable
                key="invite"
                onPress={() => void handleInvite()}
                disabled={inviteBusy}
                className={`mt-3 flex-row items-center justify-center gap-2 self-stretch rounded-2xl border py-3.5 ${isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#284BD6] bg-white'}`}>
                {inviteBusy ? <ActivityIndicator color={isDark ? '#E2E8F0' : '#284BD6'} /> : <Users size={17} color={isDark ? '#E2E8F0' : '#284BD6'} />}
                <Text className={`font-bold ${isDark ? 'text-[#E2E8F0]' : 'text-[#284BD6]'}`}>Invite to {inviteStatus.guild_name}</Text>
              </AnimatedPressable>
            ) : inviteStatus?.reason ? (
              <View
                key="invite-blocked"
                className={`mt-3 flex-row items-center gap-2 self-stretch rounded-2xl px-4 py-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F5F7FB]'}`}>
                <Lock size={15} color={isDark ? '#94A3B8' : '#6C7A95'} />
                <Text className={`flex-1 text-sm ${secondary}`}>Can't invite to {inviteStatus.guild_name}: {inviteStatus.reason}</Text>
              </View>
            ) : null}
            </>
          ) : null}
        </Card>

        <PlayerRankCard userId={params.id} isDark={isDark} place={params.place ? Number(params.place) : null} period={params.period} />

        <ProfileTrophies userId={params.id} isDark={isDark} index={1} />

        <Card index={2}>
          <Text className={`text-[16px] font-bold ${primary}`}>Travel interests</Text>
          {interests.length ? (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {interests.map((interest) => (
                <View key={interest} className={`rounded-full px-3.5 py-2 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF2FF]'}`}>
                  <Text className={`text-sm font-medium ${isDark ? 'text-[#A5B8F5]' : 'text-[#284BD6]'}`}>{interest}</Text>
                </View>
              ))}
            </View>
          ) : <Text className={`mt-3 text-sm ${secondary}`}>No interests selected yet.</Text>}
        </Card>

        {isSelf ? null : (
        <Card index={3} className="flex-row py-1">
          <AnimatedPressable onPress={() => setReportModalVisible(true)} scaleTo={0.97} className={`flex-1 flex-row items-center justify-center gap-2 border-r py-3 ${divider}`}>
            <Flag size={16} color={isDark ? '#94A3B8' : '#6C7A95'} />
            <Text className={`font-bold ${secondary}`}>Report</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={fullProfile?.is_blocked_by_me ? confirmUnblock : confirmBlock}
            disabled={blockBusy}
            scaleTo={0.97}
            className="flex-1 flex-row items-center justify-center gap-2 py-3"
          >
            {blockBusy ? (
              <ActivityIndicator color="#B91C1C" />
            ) : fullProfile?.is_blocked_by_me ? (
              <>
                <ShieldOff size={16} color="#B91C1C" />
                <Text className="font-bold text-[#B91C1C]">Unblock</Text>
              </>
            ) : (
              <>
                <Shield size={16} color="#B91C1C" />
                <Text className="font-bold text-[#B91C1C]">Block</Text>
              </>
            )}
          </AnimatedPressable>
        </Card>
        )}
      </View>

      <ConfirmDialog {...dialog.props} isDark={isDark} />

      <ReportUserModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        isDark={isDark}
        reportedUserId={params.id}
        targetDisplayName={displayName}
      />
    </ScrollView>
  );
}
