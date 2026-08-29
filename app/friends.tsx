import { useColorScheme } from '@/hooks/use-color-scheme';
import { createOrGetDirectThread, listFriendConnections, removeFriend, respondToFriendRequest, type FriendConnection } from '@/lib/social';
import { getTheme, typography } from '@/lib/theme';
import {
  addTrustedContact,
  formatAddedDate,
  listIncomingTrustedCircleRequests,
  listTrustedContacts,
  relationshipColors,
  removeTrustedContact,
  respondToTrustedContactRequest,
  setTrustedContactAlerts,
  type IncomingTrustedCircleRequest,
  type TrustedContact,
} from '@/lib/trustedCircle';
import { useFocusEffect, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft, Bell, BellOff, Check, Clock, MessageCircle, Plus, Shield, UserMinus, UserPlus, X, XCircle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'friends' | 'trusted';

export default function FriendsScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { titleColor } = getTheme(isDark);
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  const [tab, setTab] = useState<Tab>('friends');

  const [connections, setConnections] = useState<FriendConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>([]);
  const [trustedLoading, setTrustedLoading] = useState(true);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);

  const [incomingTrustedRequests, setIncomingTrustedRequests] = useState<IncomingTrustedCircleRequest[]>([]);
  const [incomingTrustedLoading, setIncomingTrustedLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setConnectionsLoading(true);
    const result = await listFriendConnections();
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setConnections(result.data);
    }
    setConnectionsLoading(false);
  }, []);

  const loadTrustedContacts = useCallback(async () => {
    setTrustedLoading(true);
    const result = await listTrustedContacts();
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setTrustedContacts(result.data);
    }
    setTrustedLoading(false);
  }, []);

  const loadIncomingTrustedRequests = useCallback(async () => {
    setIncomingTrustedLoading(true);
    const result = await listIncomingTrustedCircleRequests();
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setIncomingTrustedRequests(result.data);
    }
    setIncomingTrustedLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setErrorMessage(null);
      void loadConnections();
      void loadTrustedContacts();
      void loadIncomingTrustedRequests();
    }, [loadConnections, loadTrustedContacts, loadIncomingTrustedRequests])
  );

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

  async function toggleAlerts(contact: TrustedContact) {
    setBusyContactId(contact.id);
    setErrorMessage(null);
    const result = await setTrustedContactAlerts(contact.id, !contact.alerts_enabled);
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      await loadTrustedContacts();
    }
    setBusyContactId(null);
  }

  function confirmRemoveTrustedContact(contact: TrustedContact) {
    Alert.alert('Remove contact?', `Remove ${contact.display_name} from your trusted circle?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeTrustedContactRow(contact) },
    ]);
  }

  async function removeTrustedContactRow(contact: TrustedContact) {
    setBusyContactId(contact.id);
    setErrorMessage(null);
    const result = await removeTrustedContact(contact.id);
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      await loadTrustedContacts();
    }
    setBusyContactId(null);
  }

  async function resendTrustedRequest(contact: TrustedContact) {
    setBusyContactId(contact.id);
    setErrorMessage(null);
    const result = await addTrustedContact({
      contactUserId: contact.contact_user_id,
      relationship: contact.relationship,
      emergencyInfo: contact.emergency_info ?? undefined,
    });
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      await loadTrustedContacts();
    }
    setBusyContactId(null);
  }

  async function respondTrustedRequest(request: IncomingTrustedCircleRequest, status: 'accepted' | 'declined') {
    setBusyRequestId(request.id);
    setErrorMessage(null);
    const result = await respondToTrustedContactRequest(request.id, status);
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      await loadIncomingTrustedRequests();
    }
    setBusyRequestId(null);
  }

  function renderConnection(connection: FriendConnection) {
    const busy = busyUserId === connection.user_id;
    const incoming = connection.relationship_status === 'incoming_pending';
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
          </> : <>
            <TouchableOpacity onPress={() => void messageFriend(connection)} disabled={busy} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#284BD6] py-3"><MessageCircle size={16} color="#FFFFFF" /><Text className="font-bold text-white">Message</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => confirmUnfriend(connection)} disabled={busy} className={`h-12 w-12 items-center justify-center rounded-2xl border ${border}`} accessibilityLabel={`Unfriend ${connection.display_name}`}><UserMinus size={17} color="#B91C1C" /></TouchableOpacity>
          </>}
        </View>
        {busy ? <ActivityIndicator className="absolute right-4 top-4" color="#284BD6" /> : null}
      </View>
    );
  }

  function renderSentRequest(connection: FriendConnection) {
    const busy = busyUserId === connection.user_id;
    return (
      <View key={connection.user_id} className={`rounded-[22px] border p-4 ${card}`}>
        <View className="flex-row items-center gap-3">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-[#B7C4EC]"><Text className="text-xl font-bold text-[#24314A]">{connection.display_name.charAt(0).toUpperCase()}</Text></View>
          <View className="flex-1"><Text className={`text-lg font-black ${primary}`}>{connection.display_name}</Text><Text className={`mt-1 text-sm ${secondary}`}>Awaiting response</Text></View>
        </View>
        <TouchableOpacity onPress={() => void updateRequest(connection, 'cancelled')} disabled={busy} className={`mt-4 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${border}`}>
          <X size={16} color="#64748B" /><Text className={`font-bold ${secondary}`}>Cancel request</Text>
        </TouchableOpacity>
        {busy ? <ActivityIndicator className="absolute right-4 top-4" color="#284BD6" /> : null}
      </View>
    );
  }

  function renderTrustedContact(contact: TrustedContact) {
    const busy = busyContactId === contact.id;
    const colors = relationshipColors(contact.relationship, isDark);
    return (
      <View key={contact.id} className={`rounded-[22px] border p-4 ${card}`}>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-[#B7C4EC]">
              <Text className="text-lg font-bold text-[#24314A]">{contact.display_name.charAt(0).toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className={`text-[17px] font-black ${primary}`}>{contact.display_name}</Text>
              <View className={`mt-1.5 self-start rounded-full px-3 py-1 ${colors.bg}`}>
                <Text className={`text-[12px] font-bold ${colors.text}`}>{contact.relationship}</Text>
              </View>
            </View>
          </View>
          {contact.status === 'pending' ? (
            <Clock size={19} color="#D88700" />
          ) : contact.status === 'declined' ? (
            <XCircle size={19} color="#E32727" />
          ) : contact.alerts_enabled ? (
            <Bell size={19} color="#00A56A" />
          ) : (
            <BellOff size={19} color={isDark ? '#64748B' : '#94A3B8'} />
          )}
        </View>

        <Text className={`mt-3 text-[13px] ${secondary}`}>
          Added {formatAddedDate(contact.created_at)}
          {contact.status === 'pending' ? ' • Awaiting confirmation' : contact.status === 'declined' ? ' • Declined' : contact.alerts_enabled ? ' • Alerts on' : ' • Alerts off'}
        </Text>

        <View className="mt-3 flex-row gap-2">
          {contact.status === 'pending' ? (
            <TouchableOpacity onPress={() => confirmRemoveTrustedContact(contact)} disabled={busy} className="flex-1 items-center rounded-2xl border border-[#E32727] py-3">
              <Text className="font-bold text-[#E32727]">Cancel Request</Text>
            </TouchableOpacity>
          ) : contact.status === 'declined' ? (
            <>
              <TouchableOpacity onPress={() => void resendTrustedRequest(contact)} disabled={busy} className={`flex-1 items-center rounded-2xl border py-3 ${border}`}>
                <Text className={`font-bold ${primary}`}>Resend</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmRemoveTrustedContact(contact)} disabled={busy} className="flex-1 items-center rounded-2xl border border-[#E32727] py-3">
                <Text className="font-bold text-[#E32727]">Remove</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => void toggleAlerts(contact)} disabled={busy} className={`flex-1 items-center rounded-2xl border py-3 ${border}`}>
                <Text className={`font-bold ${primary}`}>{contact.alerts_enabled ? 'Disable' : 'Enable'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmRemoveTrustedContact(contact)} disabled={busy} className="flex-1 items-center rounded-2xl border border-[#E32727] py-3">
                <Text className="font-bold text-[#E32727]">Remove</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {busy ? <ActivityIndicator className="absolute right-4 top-4" color="#284BD6" /> : null}
      </View>
    );
  }

  function renderIncomingTrustedRequest(request: IncomingTrustedCircleRequest) {
    const busy = busyRequestId === request.id;
    const colors = relationshipColors(request.relationship, isDark);
    return (
      <View key={request.id} className={`rounded-[22px] border p-4 ${card}`}>
        <View className="flex-row items-center gap-3">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-[#B7C4EC]"><Text className="text-xl font-bold text-[#24314A]">{request.display_name.charAt(0).toUpperCase()}</Text></View>
          <View className="flex-1">
            <Text className={`text-lg font-black ${primary}`}>{request.display_name}</Text>
            <Text className={`mt-1 text-sm ${secondary}`}>Wants to add you as their</Text>
            <View className={`mt-1.5 self-start rounded-full px-3 py-1 ${colors.bg}`}>
              <Text className={`text-[12px] font-bold ${colors.text}`}>{request.relationship}</Text>
            </View>
          </View>
        </View>
        {request.emergency_info ? (
          <View className={`mt-3 rounded-xl border px-3 py-3 ${isDark ? 'border-[#3B341A] bg-[#241F0C]' : 'border-[#F5E1A8] bg-[#FDF6E1]'}`}>
            <View className="flex-row items-center gap-1.5">
              <AlertTriangle size={13} color={isDark ? '#F0CE7E' : '#B4650B'} />
              <Text className={`text-[12px] font-bold ${isDark ? 'text-[#F0CE7E]' : 'text-[#B4650B]'}`}>Emergency Info</Text>
            </View>
            <Text className={`mt-1 text-[13px] leading-5 ${isDark ? 'text-[#E9D9A8]' : 'text-[#8A5C0A]'}`}>{request.emergency_info}</Text>
          </View>
        ) : null}
        <View className="mt-4 flex-row gap-2">
          <TouchableOpacity onPress={() => void respondTrustedRequest(request, 'accepted')} disabled={busy} className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#284BD6] py-3">
            <Check size={16} color="#FFFFFF" /><Text className="font-bold text-white">Confirm</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void respondTrustedRequest(request, 'declined')} disabled={busy} className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-3 ${border}`}>
            <X size={16} color="#B91C1C" /><Text className="font-bold text-[#B91C1C]">Decline</Text>
          </TouchableOpacity>
        </View>
        {busy ? <ActivityIndicator className="absolute right-4 top-4" color="#284BD6" /> : null}
      </View>
    );
  }

  const incomingFriendRequests = connections.filter((connection) => connection.relationship_status === 'incoming_pending');
  const acceptedFriends = connections.filter((connection) => connection.relationship_status === 'accepted');
  const sentRequests = connections.filter((connection) => connection.relationship_status === 'outgoing_pending');

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'friends', label: 'Friends', count: acceptedFriends.length + incomingFriendRequests.length + sentRequests.length },
    { key: 'trusted', label: 'Trusted Circle', count: trustedContacts.length + incomingTrustedRequests.length },
  ];

  const loading = tab === 'friends' ? connectionsLoading : trustedLoading || incomingTrustedLoading;

  return (
    <View className={`flex-1 ${background}`}>
      <View className={`border-b px-4 pb-4 ${border}`} style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center" accessibilityLabel="Go back"><ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} /></TouchableOpacity>
          <Text className={`ml-3 ${typography.pageTitle} ${titleColor}`}>Friends</Text>
        </View>

        <View className="mt-4 flex-row gap-2">
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setTab(item.key)}
                className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl px-2 py-3 ${active ? 'bg-[#284BD6]' : mutedFill}`}
              >
                <Text numberOfLines={1} className={`text-[15px] font-bold ${active ? 'text-white' : primary}`}>{item.label}</Text>
                {item.count ? (
                  <View className={`rounded-full px-1.5 ${active ? 'bg-white/25' : isDark ? 'bg-[#22324B]' : 'bg-white'}`}>
                    <Text className={`text-[12px] font-bold ${active ? 'text-white' : secondary}`}>{item.count}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 pb-10 pt-4">
        {errorMessage ? <Text className="rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
        {loading ? <ActivityIndicator className="mt-8" color="#284BD6" /> : null}

        {!loading && tab === 'friends' ? (
          <>
            {incomingFriendRequests.length ? (
              <View className="gap-3">
                <Text className={`text-xl font-black ${primary}`}>Friend requests <Text className={`text-base font-normal ${secondary}`}>({incomingFriendRequests.length})</Text></Text>
                {incomingFriendRequests.map(renderConnection)}
              </View>
            ) : null}

            <View className="gap-3">
              <Text className={`text-xl font-black ${primary}`}>Friends <Text className={`text-base font-normal ${secondary}`}>({acceptedFriends.length})</Text></Text>
              {acceptedFriends.length ? acceptedFriends.map(renderConnection) : (
                <View className="items-center px-8 py-10"><UserPlus size={40} color="#94A3B8" /><Text className={`mt-4 text-center text-base ${secondary}`}>No friends yet. Find people in Discover to get started.</Text></View>
              )}
            </View>

            {sentRequests.length ? (
              <View className="gap-3">
                <Text className={`text-xl font-black ${primary}`}>Sent requests <Text className={`text-base font-normal ${secondary}`}>({sentRequests.length})</Text></Text>
                {sentRequests.map(renderSentRequest)}
              </View>
            ) : null}
          </>
        ) : null}

        {!loading && tab === 'trusted' ? (
          <>
            {incomingTrustedRequests.length ? (
              <View className="gap-3">
                <Text className={`text-xl font-black ${primary}`}>Pending confirmation <Text className={`text-base font-normal ${secondary}`}>({incomingTrustedRequests.length})</Text></Text>
                {incomingTrustedRequests.map(renderIncomingTrustedRequest)}
              </View>
            ) : null}

            <View className="gap-3">
              <View className="flex-row items-center justify-between">
                <Text className={`text-xl font-black ${primary}`}>My trusted circle <Text className={`text-base font-normal ${secondary}`}>({trustedContacts.length})</Text></Text>
                <TouchableOpacity onPress={() => router.push('/trusted-circle')} className="flex-row items-center gap-1.5 rounded-full bg-[#284BD6] px-3.5 py-2">
                  <Plus size={15} color="#FFFFFF" /><Text className="text-[13px] font-bold text-white">Add</Text>
                </TouchableOpacity>
              </View>
              {trustedContacts.length ? trustedContacts.map(renderTrustedContact) : (
                <View className="items-center px-8 py-10"><Shield size={40} color="#94A3B8" /><Text className={`mt-4 text-center text-base ${secondary}`}>No trusted contacts yet. Add a friend who should be alerted if you need help.</Text></View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
