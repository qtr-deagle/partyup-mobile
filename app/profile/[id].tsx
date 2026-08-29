import { useColorScheme } from '@/hooks/use-color-scheme';
import { createOrGetDirectThread, getFriendRequestStatuses, getProfileById, removeFriend, respondToFriendRequest, sendFriendRequest, type SearchProfile } from '@/lib/social';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, BadgeCheck, Check, MapPin, Star, UserPlus, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
  const location = fullProfile?.city && fullProfile?.country ? `${fullProfile.city}, ${fullProfile.country}` : null;
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';

  useFocusEffect(
    useCallback(() => {
      void getFriendRequestStatuses([params.id]).then((statuses) => {
        const relationship = statuses.get(params.id);
        setRequestStatus(relationship?.status ?? '');
        setRequestId(relationship?.requestId ?? '');
      });
      setProfileLoading(true);
      void getProfileById(params.id).then((result) => {
        setFullProfile(result.data);
        setProfileLoading(false);
      });
    }, [params.id])
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

  return (
    <ScrollView
      className={`flex-1 ${background}`}
      contentContainerClassName="px-4 pb-10"
      contentContainerStyle={{ paddingTop: insets.top + 20 }}>
      <TouchableOpacity onPress={() => router.back()} className="mb-5 h-10 w-10 items-center justify-center" accessibilityLabel="Go back">
        <ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} />
      </TouchableOpacity>

      <View className={`rounded-[24px] border p-5 ${card}`}>
        <View className="items-center">
          <View className="h-24 w-24 items-center justify-center rounded-full bg-[#B7C4EC]">
            <Text className="text-[34px] font-bold text-[#24314A]">{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View className="mt-4 flex-row items-center gap-1.5">
            <Text className={`text-[26px] font-black ${primary}`}>{displayName}</Text>
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

          {profileLoading ? (
            <ActivityIndicator className="mt-3" color="#284BD6" />
          ) : (
            <View className={`mt-3 flex-row items-center gap-1 rounded-full px-3 py-1.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#F5F7FB]'}`}>
              {fullProfile && fullProfile.trust_count > 0 && fullProfile.trust_score !== null ? (
                <>
                  <Star size={14} color="#F5A623" fill="#F5A623" />
                  <Text className={`text-sm font-bold ${primary}`}>{fullProfile.trust_score?.toFixed(1)} · {fullProfile.trust_count} trust {fullProfile.trust_count === 1 ? 'review' : 'reviews'}</Text>
                </>
              ) : (
                <Text className={`text-sm font-bold ${secondary}`}>New to PartyUp</Text>
              )}
            </View>
          )}

          {fullProfile?.bio ? <Text className={`mt-4 text-center text-sm leading-5 ${secondary}`}>{fullProfile.bio}</Text> : null}
        </View>

        <View className="mt-7 border-t border-[#E4EAF2] pt-5">
          <Text className={`text-lg font-black ${primary}`}>Travel interests</Text>
          {interests.length ? (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {interests.map((interest) => <View key={interest} className="rounded-full bg-[#EEF2FF] px-3 py-2"><Text className="text-sm text-[#284BD6]">{interest}</Text></View>)}
            </View>
          ) : <Text className={`mt-3 text-sm ${secondary}`}>No interests selected yet.</Text>}
        </View>

        {errorMessage ? <Text className="mt-5 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
        <TouchableOpacity onPress={requestStatus === 'accepted' ? confirmRemoveFriend : () => void handleRequest()} disabled={requesting} className={`mt-7 flex-row items-center justify-center gap-2 rounded-2xl py-3 ${requestStatus === 'accepted' || requestStatus === 'outgoing_pending' ? 'bg-[#9EAFE9]' : 'bg-[#284BD6]'}`}>
          {requesting ? <ActivityIndicator color="#FFFFFF" /> : <>{requestStatus === 'accepted' || requestStatus === 'incoming_pending' ? <Check size={17} color="#FFFFFF" /> : requestStatus === 'outgoing_pending' ? <X size={17} color="#FFFFFF" /> : <UserPlus size={17} color="#FFFFFF" />}<Text className="font-bold text-white">{requestStatus === 'accepted' ? 'Friends' : requestStatus === 'outgoing_pending' ? 'Cancel request' : requestStatus === 'incoming_pending' ? 'Confirm' : 'Add Friend'}</Text></>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
