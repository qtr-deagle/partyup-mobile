import { useColorScheme } from '@/hooks/use-color-scheme';
import { createOrGetDirectThread, listFriendConnections, removeFriend, respondToFriendRequest, type FriendConnection } from '@/lib/social';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowLeft, Check, MessageCircle, UserMinus, UserPlus, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

function sectionTitle(status: FriendConnection['relationship_status']) {
  if (status === 'accepted') return 'Friends';
  if (status === 'incoming_pending') return 'Friend requests';
  return 'Sent requests';
}

export default function FriendsScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [connections, setConnections] = useState<FriendConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await listFriendConnections();
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setConnections(result.data);
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadConnections();
  }, [loadConnections]));

  function openProfile(connection: FriendConnection) {
    router.push({
      pathname: '/profile/[id]',
      params: {
        id: connection.user_id,
        displayName: connection.display_name,
        interests: JSON.stringify(connection.interests),
        avatarUrl: connection.avatar_url ?? '',
        requestStatus: connection.relationship_status,
        requestId: connection.request_id,
      },
    });
  }

  async function updateRequest(connection: FriendConnection, status: 'accepted' | 'rejected' | 'cancelled') {
    setBusyUserId(connection.user_id);
    setErrorMessage(null);
    const result = await respondToFriendRequest(connection.request_id, status);
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      await loadConnections();
      if (status === 'accepted') {
        promptSayHi(connection);
      }
    }
    setBusyUserId(null);
  }

  function promptSayHi(connection: FriendConnection) {
    Alert.alert('You are now friends! 🎉', `Say hi to ${connection.display_name}?`, [
      { text: 'Later', style: 'cancel' },
      { text: 'Say hi', onPress: () => void messageFriend(connection) },
    ]);
  }

  function confirmUnfriend(connection: FriendConnection) {
    Alert.alert('Remove friend?', `Remove ${connection.display_name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void unfriend(connection) },
    ]);
  }

  async function unfriend(connection: FriendConnection) {
    setBusyUserId(connection.user_id);
    setErrorMessage(null);
    const result = await removeFriend(connection.user_id);
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      await loadConnections();
    }
    setBusyUserId(null);
  }

  async function messageFriend(connection: FriendConnection) {
    setBusyUserId(connection.user_id);
    setErrorMessage(null);
    const result = await createOrGetDirectThread(connection.user_id);
    setBusyUserId(null);
    if (result.error) {
      setErrorMessage(result.error.message);
      return;
    }
    router.push({ pathname: '/(tabs)/chat', params: { threadId: String(result.data) } });
  }

  function renderConnection(connection: FriendConnection) {
    const busy = busyUserId === connection.user_id;
    const incoming = connection.relationship_status === 'incoming_pending';
    const outgoing = connection.relationship_status === 'outgoing_pending';
    return (
      <View key={connection.user_id} className={`rounded-[22px] border p-4 ${card}`}>
        <TouchableOpacity onPress={() => openProfile(connection)} className="flex-row items-center gap-3" accessibilityLabel={`View ${connection.display_name}'s profile`}>
          <View className="h-14 w-14 items-center justify-center rounded-full bg-[#B7C4EC]"><Text className="text-xl font-bold text-[#24314A]">{connection.display_name.charAt(0).toUpperCase()}</Text></View>
          <View className="flex-1"><Text className={`text-lg font-black ${primary}`}>{connection.display_name}</Text><Text numberOfLines={1} className={`mt-1 text-sm ${secondary}`}>{connection.interests.length ? connection.interests.join('  •  ') : 'No interests selected'}</Text></View>
        </TouchableOpacity>
        <View className="mt-4 flex-row gap-2">
          {incoming ? <>
            <TouchableOpacity onPress={() => void updateRequest(connection, 'accepted')} disabled={busy} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#284BD6] py-3"><Check size={16} color="#FFFFFF" /><Text className="font-bold text-white">Accept</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => void updateRequest(connection, 'rejected')} disabled={busy} className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${border}`}><X size={16} color="#B91C1C" /><Text className="font-bold text-[#B91C1C]">Decline</Text></TouchableOpacity>
          </> : outgoing ? <TouchableOpacity onPress={() => void updateRequest(connection, 'cancelled')} disabled={busy} className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${border}`}><X size={16} color="#64748B" /><Text className={`font-bold ${secondary}`}>Cancel request</Text></TouchableOpacity> : <>
            <TouchableOpacity onPress={() => void messageFriend(connection)} disabled={busy} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#284BD6] py-3"><MessageCircle size={16} color="#FFFFFF" /><Text className="font-bold text-white">Message</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => confirmUnfriend(connection)} disabled={busy} className={`h-12 w-12 items-center justify-center rounded-2xl border ${border}`} accessibilityLabel={`Unfriend ${connection.display_name}`}><UserMinus size={17} color="#B91C1C" /></TouchableOpacity>
          </>}
        </View>
        {busy ? <ActivityIndicator className="absolute right-4 top-4" color="#284BD6" /> : null}
      </View>
    );
  }

  const statuses: FriendConnection['relationship_status'][] = ['accepted', 'incoming_pending', 'outgoing_pending'];

  return (
    <ScrollView className={`flex-1 ${background}`} contentContainerClassName="pb-10">
      <View className={`flex-row items-center border-b px-4 pb-4 pt-5 ${border}`}>
        <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center" accessibilityLabel="Go back"><ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} /></TouchableOpacity>
        <Text className={`ml-3 text-[30px] font-black ${primary}`}>Friends</Text>
      </View>
      {errorMessage ? <Text className="m-4 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
      {loading ? <ActivityIndicator className="mt-8" color="#284BD6" /> : null}
      {!loading && !connections.length ? <View className="items-center px-8 pt-16"><UserPlus size={40} color="#94A3B8" /><Text className={`mt-4 text-center text-base ${secondary}`}>No friends or pending requests yet. Find people in Discover to get started.</Text></View> : null}
      {!loading ? statuses.map((status) => {
        const group = connections.filter((connection) => connection.relationship_status === status);
        if (!group.length) return null;
        return <View key={status} className="gap-3 px-4 pt-5"><Text className={`text-xl font-black ${primary}`}>{sectionTitle(status)} <Text className={`text-base font-normal ${secondary}`}>({group.length})</Text></Text>{group.map(renderConnection)}</View>;
      }) : null}
    </ScrollView>
  );
}
