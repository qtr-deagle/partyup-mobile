import { ReportUserModal } from '@/components/ReportUserModal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { Skeleton } from '@/components/ui/motion';
import { Card } from '@/components/ui/screen-header';
import { formatResidence } from '@/lib/bulacan';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { blockUser, unblockUser } from '@/lib/blocking';
import { createOrGetDirectThread, getFriendRequestStatuses, getProfileById, removeFriend, respondToFriendRequest, sendFriendRequest, type SearchProfile } from '@/lib/social';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, Check, Flag, MapPin, Shield, ShieldOff, Star, UserPlus, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
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

export default function PublicProfileScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; displayName?: string; interests?: string; avatarUrl?: string; requestStatus?: string; requestId?: string }>();
  const [requesting, setRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState(params.requestStatus || '');
  const [requestId, setRequestId] = useState(params.requestId || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fullProfile, setFullProfile] = useState<SearchProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
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
    ]);
  }, [params.id]);
  const { refreshing, refreshControl } = usePullToRefresh(loadProfile);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  async function handleRequest() {
    if (requestStatus === 'outgoing_pending' && requestId) {
      Alert.alert('Cancel friend request?', `Cancel your request to ${displayName}?`, [
        { text: 'Keep request', style: 'cancel' },
        { text: 'Cancel request', style: 'destructive', onPress: () => void handleCancelRequest() },
      ]);
      return;
    }
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
      Alert.alert('You are now friends! 🎉', `Say hi to ${displayName}?`, [
        { text: 'Later', style: 'cancel' },
        { text: 'Say hi', onPress: () => router.push({ pathname: '/(tabs)/chat', params: { threadId: String(threadResult.data) } }) },
      ]);
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
    Alert.alert('Remove friend?', `Remove ${displayName} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void handleRemoveFriend() },
    ]);
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
    Alert.alert('Block this traveler?', `You won't see ${displayName} in Discover, nearby travelers, or search, and any friend connection will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => void handleBlock() },
    ]);
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

  const isFriendish = requestStatus === 'accepted' || requestStatus === 'outgoing_pending';
  const divider = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';

  return (
    <ScrollView
      className={`flex-1 ${background}`}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      refreshControl={refreshControl}>
      <View className="overflow-hidden bg-[#2747C7]" style={{ height: insets.top + 130 }}>
        <View className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-white/10" />
        <View className="absolute -left-14 top-16 h-40 w-40 rounded-full bg-white/5" />
        <AnimatedPressable
          onPress={() => router.back()}
          scaleTo={0.9}
          className="ml-4 h-10 w-10 items-center justify-center rounded-full bg-white/20"
          style={{ marginTop: insets.top + 10 }}
          accessibilityLabel="Go back">
          <ArrowLeft size={21} color="#FFFFFF" />
        </AnimatedPressable>
      </View>

      <View className="-mt-16 gap-4 px-4">
        <Card index={0} className="items-center px-5 pb-5 pt-0">
          <Animated.View
            entering={ZoomIn.delay(80).springify().damping(14)}
            className={`-mt-12 h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 bg-[#B7C4EC] ${isDark ? 'border-[#111B2E]' : 'border-white'}`}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} className="h-full w-full" />
            ) : (
              <Text className="text-[34px] font-bold text-[#24314A]">{displayName.charAt(0).toUpperCase()}</Text>
            )}
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

          {!fullProfile?.is_blocked_by_me ? (
            <AnimatedPressable
              onPress={requestStatus === 'accepted' ? confirmRemoveFriend : () => void handleRequest()}
              disabled={requesting}
              className={`mt-5 flex-row items-center justify-center gap-2 self-stretch rounded-2xl py-3.5 ${isFriendish ? 'bg-[#9EAFE9]' : 'bg-[#284BD6] shadow-sm shadow-[#284BD6]/30'}`}>
              {requesting ? <ActivityIndicator color="#FFFFFF" /> : <>{requestStatus === 'accepted' || requestStatus === 'incoming_pending' ? <Check size={17} color="#FFFFFF" /> : requestStatus === 'outgoing_pending' ? <X size={17} color="#FFFFFF" /> : <UserPlus size={17} color="#FFFFFF" />}<Text className="font-bold text-white">{requestStatus === 'accepted' ? 'Friends' : requestStatus === 'outgoing_pending' ? 'Cancel request' : requestStatus === 'incoming_pending' ? 'Confirm' : 'Add Friend'}</Text></>}
            </AnimatedPressable>
          ) : null}
        </Card>

        <Card index={1}>
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

        <Card index={2} className="flex-row py-1">
          <AnimatedPressable onPress={() => setReportModalVisible(true)} scaleTo={0.97} className={`flex-1 flex-row items-center justify-center gap-2 border-r py-3 ${divider}`}>
            <Flag size={16} color={isDark ? '#94A3B8' : '#6C7A95'} />
            <Text className={`font-bold ${secondary}`}>Report</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={fullProfile?.is_blocked_by_me ? () => void handleUnblock() : confirmBlock}
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
      </View>

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
