import { UserRankTag } from '@/components/guild/UserRankTag';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, SkeletonCard } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { createOrGetDirectThread, listFriendConnections, removeFriend, respondToFriendRequest, type FriendConnection } from '@/lib/social';
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
import { AlertTriangle, Bell, BellOff, Check, Clock, MessageCircle, Plus, Search, Shield, Trash2, UserMinus, UserPlus, X, XCircle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'friends' | 'trusted';

export default function FriendsScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const c = isDark
    ? { screen: '#0B1220', card: '#111B2E', border: '#22324B', primary: '#FFFFFF', secondary: '#94A3B8', muted: '#64748B', fill: '#18253C', divider: '#1E2A40', segmentActive: '#22324B', countBg: '#22324B', countText: '#CBD5E1', accent: '#8FA8FF', accentSoft: '#1A2850', dangerSoft: '#2A1215', avatarBg: '#22324B', avatarText: '#CBD5E1', warnBg: '#241F0C', warnTitle: '#F0CE7E', warnText: '#E9D9A8' }
    : { screen: '#F4F6FB', card: '#FFFFFF', border: '#E9EDF5', primary: '#1B2340', secondary: '#6C7A95', muted: '#94A3B8', fill: '#EEF1F7', divider: '#EEF1F7', segmentActive: '#FFFFFF', countBg: '#E3E8F2', countText: '#4A5875', accent: '#284BD6', accentSoft: '#EAF0FF', dangerSoft: '#FFEDED', avatarBg: '#DCE5FF', avatarText: '#284BD6', warnBg: '#FDF6E1', warnTitle: '#B4650B', warnText: '#8A5C0A' };

  const [tab, setTab] = useState<Tab>('friends');
  const [query, setQuery] = useState('');

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

  const loadAll = useCallback(() => {
    setErrorMessage(null);
    return Promise.all([loadConnections(), loadTrustedContacts(), loadIncomingTrustedRequests()]);
  }, [loadConnections, loadTrustedContacts, loadIncomingTrustedRequests]);
  const { refreshing, refreshControl } = usePullToRefresh(loadAll);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
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

  function renderAvatar(name: string, avatarUrl: string | null, size: number, rankUserId?: string) {
    return (
      <View style={{ width: size, height: size }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <View className="items-center justify-center" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.avatarBg }}>
            <Text className="font-black" style={{ color: c.avatarText, fontSize: size * 0.4 }}>{name.trim().charAt(0).toUpperCase()}</Text>
          </View>
        )}
        {rankUserId ? <UserRankTag userId={rankUserId} isDark={isDark} variant="overlay" size={Math.round(size * 0.42)} /> : null}
      </View>
    );
  }

  function renderSectionLabel(label: string, count: number, right?: React.ReactNode) {
    return (
      <View className="flex-row items-center justify-between px-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-[13px] font-extrabold uppercase tracking-[1.2px]" style={{ color: c.secondary }}>{label}</Text>
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: c.countBg }}>
            <Text className="text-[11px] font-black" style={{ color: c.countText }}>{count}</Text>
          </View>
        </View>
        {right}
      </View>
    );
  }

  function renderStatusPill(label: string, tint: string, Icon: typeof Bell) {
    return (
      <View className="flex-row items-center gap-1 rounded-full px-2.5 py-1" style={{ backgroundColor: `${tint}1F` }}>
        <Icon size={12} color={tint} />
        <Text className="text-[11.5px] font-bold" style={{ color: tint }}>{label}</Text>
      </View>
    );
  }

  function renderFriendRow(connection: FriendConnection, index: number, last: boolean) {
    const busy = busyUserId === connection.user_id;
    return (
      <View key={connection.user_id}>
        <View className="flex-row items-center gap-3 py-3">
          <TouchableOpacity onPress={() => openProfile(connection)} activeOpacity={0.7} className="flex-1 flex-row items-center gap-3" accessibilityLabel={`View ${connection.display_name}'s profile`}>
            {renderAvatar(connection.display_name, connection.avatar_url, 50, connection.user_id)}
            <View className="flex-1">
              <Text numberOfLines={1} className="text-[16px] font-bold" style={{ color: c.primary }}>{connection.display_name}</Text>
              <Text numberOfLines={1} className="mt-0.5 text-[13px]" style={{ color: c.secondary }}>
                {connection.interests.length ? connection.interests.join(' · ') : 'No interests selected'}
              </Text>
            </View>
          </TouchableOpacity>
          {busy ? (
            <ActivityIndicator color="#284BD6" />
          ) : (
            <View className="flex-row gap-2">
              <AnimatedPressable onPress={() => void messageFriend(connection)} scaleTo={0.9} className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: c.accentSoft }} accessibilityLabel={`Message ${connection.display_name}`}>
                <MessageCircle size={18} color={c.accent} />
              </AnimatedPressable>
              <AnimatedPressable onPress={() => confirmUnfriend(connection)} scaleTo={0.9} className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: c.fill }} accessibilityLabel={`Unfriend ${connection.display_name}`}>
                <UserMinus size={17} color={c.muted} />
              </AnimatedPressable>
            </View>
          )}
        </View>
        {last ? null : <View className="ml-[62px] h-px" style={{ backgroundColor: c.divider }} />}
      </View>
    );
  }

  function renderIncomingRequest(connection: FriendConnection, index = 0) {
    const busy = busyUserId === connection.user_id;
    return (
      <Card key={connection.user_id} index={index}>
        <TouchableOpacity onPress={() => openProfile(connection)} activeOpacity={0.7} className="flex-row items-center gap-3" accessibilityLabel={`View ${connection.display_name}'s profile`}>
          {renderAvatar(connection.display_name, connection.avatar_url, 52, connection.user_id)}
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[16px] font-bold" style={{ color: c.primary }}>{connection.display_name}</Text>
            <Text numberOfLines={1} className="mt-0.5 text-[13px]" style={{ color: c.secondary }}>Wants to be your friend</Text>
          </View>
          {busy ? <ActivityIndicator color="#284BD6" /> : null}
        </TouchableOpacity>
        <View className="mt-3.5 flex-row gap-2">
          <AnimatedPressable onPress={() => void updateRequest(connection, 'accepted')} disabled={busy} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-[#284BD6] py-2.5">
            <Check size={16} color="#FFFFFF" /><Text className="text-[14px] font-bold text-white">Accept</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => void updateRequest(connection, 'rejected')} disabled={busy} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2.5" style={{ backgroundColor: c.fill }}>
            <X size={16} color={c.primary} /><Text className="text-[14px] font-bold" style={{ color: c.primary }}>Decline</Text>
          </AnimatedPressable>
        </View>
      </Card>
    );
  }

  function renderSentRow(connection: FriendConnection, last: boolean) {
    const busy = busyUserId === connection.user_id;
    return (
      <View key={connection.user_id}>
        <View className="flex-row items-center gap-3 py-3">
          {renderAvatar(connection.display_name, connection.avatar_url, 44)}
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[15px] font-bold" style={{ color: c.primary }}>{connection.display_name}</Text>
            <View className="mt-1 flex-row">{renderStatusPill('Awaiting response', '#D88700', Clock)}</View>
          </View>
          {busy ? (
            <ActivityIndicator color="#284BD6" />
          ) : (
            <AnimatedPressable onPress={() => void updateRequest(connection, 'cancelled')} className="rounded-full px-3.5 py-2" style={{ backgroundColor: c.fill }}>
              <Text className="text-[13px] font-bold" style={{ color: c.primary }}>Cancel</Text>
            </AnimatedPressable>
          )}
        </View>
        {last ? null : <View className="ml-[56px] h-px" style={{ backgroundColor: c.divider }} />}
      </View>
    );
  }

  function renderTrustedContact(contact: TrustedContact, index = 0) {
    const busy = busyContactId === contact.id;
    const colors = relationshipColors(contact.relationship, isDark);
    const status =
      contact.status === 'pending'
        ? renderStatusPill('Awaiting confirmation', '#D88700', Clock)
        : contact.status === 'declined'
          ? renderStatusPill('Declined', '#E32727', XCircle)
          : contact.alerts_enabled
            ? renderStatusPill('Alerts on', '#00A56A', Bell)
            : renderStatusPill('Alerts off', '#64748B', BellOff);
    return (
      <Card key={contact.id} index={index}>
        <View className="flex-row items-center gap-3">
          {renderAvatar(contact.display_name, contact.avatar_url, 50)}
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[16px] font-bold" style={{ color: c.primary }}>{contact.display_name}</Text>
            <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
              <View className={`rounded-full px-2.5 py-1 ${colors.bg}`}>
                <Text className={`text-[11.5px] font-bold ${colors.text}`}>{contact.relationship}</Text>
              </View>
              {status}
            </View>
          </View>
          {busy ? <ActivityIndicator color="#284BD6" /> : null}
        </View>

        <View className="mt-3.5 flex-row items-center gap-2">
          <Text className="flex-1 text-[12px]" style={{ color: c.secondary }}>Added {formatAddedDate(contact.created_at)}</Text>
          {contact.status === 'pending' ? (
            <AnimatedPressable onPress={() => confirmRemoveTrustedContact(contact)} disabled={busy} className="rounded-full px-3.5 py-2" style={{ backgroundColor: c.dangerSoft }}>
              <Text className="text-[13px] font-bold text-[#E32727]">Cancel request</Text>
            </AnimatedPressable>
          ) : (
            <>
              {contact.status === 'declined' ? (
                <AnimatedPressable onPress={() => void resendTrustedRequest(contact)} disabled={busy} className="rounded-full px-3.5 py-2" style={{ backgroundColor: c.accentSoft }}>
                  <Text className="text-[13px] font-bold" style={{ color: c.accent }}>Resend</Text>
                </AnimatedPressable>
              ) : (
                <AnimatedPressable onPress={() => void toggleAlerts(contact)} disabled={busy} className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2" style={{ backgroundColor: c.fill }}>
                  {contact.alerts_enabled ? <BellOff size={14} color={c.primary} /> : <Bell size={14} color={c.primary} />}
                  <Text className="text-[13px] font-bold" style={{ color: c.primary }}>{contact.alerts_enabled ? 'Mute alerts' : 'Enable alerts'}</Text>
                </AnimatedPressable>
              )}
              <AnimatedPressable onPress={() => confirmRemoveTrustedContact(contact)} disabled={busy} scaleTo={0.9} className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: c.dangerSoft }} accessibilityLabel={`Remove ${contact.display_name}`}>
                <Trash2 size={15} color="#E32727" />
              </AnimatedPressable>
            </>
          )}
        </View>
      </Card>
    );
  }

  function renderIncomingTrustedRequest(request: IncomingTrustedCircleRequest, index = 0) {
    const busy = busyRequestId === request.id;
    const colors = relationshipColors(request.relationship, isDark);
    return (
      <Card key={request.id} index={index}>
        <View className="flex-row items-center gap-3">
          {renderAvatar(request.display_name, request.avatar_url, 52)}
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[16px] font-bold" style={{ color: c.primary }}>{request.display_name}</Text>
            <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
              <Text className="text-[13px]" style={{ color: c.secondary }}>Added you as their</Text>
              <View className={`rounded-full px-2.5 py-0.5 ${colors.bg}`}>
                <Text className={`text-[11.5px] font-bold ${colors.text}`}>{request.relationship}</Text>
              </View>
            </View>
          </View>
          {busy ? <ActivityIndicator color="#284BD6" /> : null}
        </View>
        {request.emergency_info ? (
          <View className="mt-3 rounded-2xl px-3.5 py-3" style={{ backgroundColor: c.warnBg }}>
            <View className="flex-row items-center gap-1.5">
              <AlertTriangle size={13} color={c.warnTitle} />
              <Text className="text-[12px] font-bold" style={{ color: c.warnTitle }}>Emergency info</Text>
            </View>
            <Text className="mt-1 text-[13px] leading-5" style={{ color: c.warnText }}>{request.emergency_info}</Text>
          </View>
        ) : null}
        <View className="mt-3.5 flex-row gap-2">
          <AnimatedPressable onPress={() => void respondTrustedRequest(request, 'accepted')} disabled={busy} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-[#284BD6] py-2.5">
            <Check size={16} color="#FFFFFF" /><Text className="text-[14px] font-bold text-white">Confirm</Text>
          </AnimatedPressable>
          <AnimatedPressable onPress={() => void respondTrustedRequest(request, 'declined')} disabled={busy} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full py-2.5" style={{ backgroundColor: c.fill }}>
            <X size={16} color={c.primary} /><Text className="text-[14px] font-bold" style={{ color: c.primary }}>Decline</Text>
          </AnimatedPressable>
        </View>
      </Card>
    );
  }

  const incomingFriendRequests = connections.filter((connection) => connection.relationship_status === 'incoming_pending');
  const acceptedFriends = connections.filter((connection) => connection.relationship_status === 'accepted');
  const sentRequests = connections.filter((connection) => connection.relationship_status === 'outgoing_pending');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFriends = normalizedQuery
    ? acceptedFriends.filter((friend) => friend.display_name.toLowerCase().includes(normalizedQuery) || friend.interests.some((interest) => interest.toLowerCase().includes(normalizedQuery)))
    : acceptedFriends;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'friends', label: 'Friends', count: acceptedFriends.length + incomingFriendRequests.length + sentRequests.length },
    { key: 'trusted', label: 'Trusted Circle', count: trustedContacts.length + incomingTrustedRequests.length },
  ];

  const loading = !refreshing && (tab === 'friends' ? connectionsLoading : trustedLoading || incomingTrustedLoading);

  return (
    <View className="flex-1" style={{ backgroundColor: c.screen }}>
      <ScreenHeader title="Friends" subtitle={`${acceptedFriends.length} ${acceptedFriends.length === 1 ? 'friend' : 'friends'} · ${trustedContacts.length} trusted`}>
        <View className="mt-4 flex-row rounded-full p-1" style={{ backgroundColor: c.fill }}>
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <AnimatedPressable
                key={item.key}
                scaleTo={0.97}
                onPress={() => setTab(item.key)}
                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-2 py-2.5"
                style={active ? { backgroundColor: c.segmentActive, shadowColor: '#0F1B3D', shadowOpacity: isDark ? 0 : 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: isDark ? 0 : 2 } : undefined}>
                <Text numberOfLines={1} className="text-[14px] font-bold" style={{ color: active ? c.primary : c.secondary }}>{item.label}</Text>
                {item.count ? (
                  <View className="rounded-full px-1.5" style={{ backgroundColor: active ? '#284BD6' : c.countBg }}>
                    <Text className="text-[11px] font-black" style={{ color: active ? '#FFFFFF' : c.countText }}>{item.count}</Text>
                  </View>
                ) : null}
              </AnimatedPressable>
            );
          })}
        </View>
      </ScreenHeader>

      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-4 pt-4" keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={refreshControl}>
        {errorMessage ? <Text className="rounded-2xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
        {loading ? (
          <View className="gap-3">
            {[0, 1, 2].map((index) => <SkeletonCard key={index} height={96} />)}
          </View>
        ) : null}

        {!loading && tab === 'friends' ? (
          <>
            {acceptedFriends.length > 4 ? (
              <View className="flex-row items-center gap-2.5 rounded-full px-4" style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border }}>
                <Search size={17} color={c.muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search friends or interests"
                  placeholderTextColor={c.muted}
                  className="flex-1 py-3 text-[15px]"
                  style={{ color: c.primary }}
                  returnKeyType="search"
                />
                {query ? (
                  <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                    <XCircle size={17} color={c.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {incomingFriendRequests.length ? (
              <View className="gap-3">
                {renderSectionLabel('Requests', incomingFriendRequests.length)}
                {incomingFriendRequests.map((connection, index) => renderIncomingRequest(connection, index))}
              </View>
            ) : null}

            <View className="gap-3">
              {renderSectionLabel(
                'Your friends',
                acceptedFriends.length,
                <AnimatedPressable onPress={() => router.push('/(tabs)/discover')} className="flex-row items-center gap-1 rounded-full px-3 py-1.5" style={{ backgroundColor: c.accentSoft }}>
                  <UserPlus size={14} color={c.accent} />
                  <Text className="text-[12.5px] font-bold" style={{ color: c.accent }}>Find people</Text>
                </AnimatedPressable>
              )}
              {visibleFriends.length ? (
                <Card key="friends-list" index={incomingFriendRequests.length} className="py-1">
                  {visibleFriends.map((connection, index) => renderFriendRow(connection, index, index === visibleFriends.length - 1))}
                </Card>
              ) : acceptedFriends.length ? (
                <Text key="friends-no-match" className="px-1 text-[14px]" style={{ color: c.secondary }}>No friends match “{query.trim()}”.</Text>
              ) : (
                <EmptyState
                  key="friends-empty"
                  icon={<UserPlus size={34} color="#284BD6" />}
                  title="No friends yet"
                  message="Find people in Discover to get started."
                  action={
                    <AnimatedPressable onPress={() => router.push('/(tabs)/discover')} className="rounded-full bg-[#284BD6] px-5 py-3">
                      <Text className="font-bold text-white">Go to Discover</Text>
                    </AnimatedPressable>
                  }
                />
              )}
            </View>

            {sentRequests.length ? (
              <View className="gap-3">
                {renderSectionLabel('Sent requests', sentRequests.length)}
                <Card index={incomingFriendRequests.length + 1} className="py-1">
                  {sentRequests.map((connection, index) => renderSentRow(connection, index === sentRequests.length - 1))}
                </Card>
              </View>
            ) : null}
          </>
        ) : null}

        {!loading && tab === 'trusted' ? (
          <>
            <View className="flex-row items-center gap-3 rounded-3xl p-4" style={{ backgroundColor: c.accentSoft }}>
              <View className="h-11 w-11 items-center justify-center rounded-2xl bg-[#284BD6]">
                <Shield size={20} color="#FFFFFF" />
              </View>
              <Text className="flex-1 text-[13px] leading-5" style={{ color: c.primary }}>
                Your trusted circle gets your live location when you trigger SOS.
              </Text>
            </View>

            {incomingTrustedRequests.length ? (
              <View className="gap-3">
                {renderSectionLabel('Pending confirmation', incomingTrustedRequests.length)}
                {incomingTrustedRequests.map((request, index) => renderIncomingTrustedRequest(request, index))}
              </View>
            ) : null}

            <View className="gap-3">
              {renderSectionLabel(
                'My trusted circle',
                trustedContacts.length,
                <AnimatedPressable onPress={() => router.push('/trusted-circle')} className="flex-row items-center gap-1 rounded-full bg-[#284BD6] px-3 py-1.5">
                  <Plus size={14} color="#FFFFFF" /><Text className="text-[12.5px] font-bold text-white">Add</Text>
                </AnimatedPressable>
              )}
              {trustedContacts.length ? trustedContacts.map((contact, index) => renderTrustedContact(contact, incomingTrustedRequests.length + index)) : (
                <EmptyState
                  key="trusted-empty"
                  icon={<Shield size={34} color="#284BD6" />}
                  title="No trusted contacts yet"
                  message="Add a friend who should be alerted if you need help."
                />
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
