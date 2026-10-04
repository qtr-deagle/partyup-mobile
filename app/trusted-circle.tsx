import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, enterFromBelow, riseIn, SkeletonCard, SuccessOverlay, useShake } from '@/components/ui/motion';
import { ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { listFriendConnections, type FriendConnection } from '@/lib/social';
import {
  addTrustedContact,
  formatAddedDate,
  listTrustedContacts,
  relationshipColors,
  removeTrustedContact,
  RELATIONSHIP_OPTIONS,
  setTrustedContactAlerts,
  type ContactRelationship,
  type TrustedContact,
} from '@/lib/trustedCircle';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { AlertTriangle, Bell, BellOff, CheckCircle2, Clock, Info, Mail, MapPin, Phone, Plus, RotateCcw, Shield, ShieldAlert, ShieldCheck, Trash2, UserPlus, Users, X, XCircle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Switch, Text, TextInput, TouchableOpacity, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EMERGENCY_INFO_MAX = 200;

export default function TrustedCircleScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyContactId, setBusyContactId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [friends, setFriends] = useState<FriendConnection[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  const [addVisible, setAddVisible] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [friendSearch, setFriendSearch] = useState('');
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<ContactRelationship | null>(null);
  const [emergencyInfo, setEmergencyInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const { style: shakeStyle, shake } = useShake();
  const clearRequestSent = useCallback(() => setRequestSent(false), []);

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const cardStyle: ViewStyle = {
    backgroundColor: isDark ? '#111B2E' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? '#1E2B42' : '#E8EDF5',
    shadowColor: '#0B1220',
    shadowOpacity: isDark ? 0 : 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: isDark ? 0 : 2,
  };
  const divider = isDark ? 'border-[#1E2B42]' : 'border-[#EEF1F6]';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#D7DDE8]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const result = await listTrustedContacts();
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      setContacts(result.data);
    }
    setLoading(false);
  }, []);

  const loadFriends = useCallback(async () => {
    setFriendsLoading(true);
    const result = await listFriendConnections();
    if (!result.error) {
      setFriends(result.data.filter((connection) => connection.relationship_status === 'accepted'));
    }
    setFriendsLoading(false);
  }, []);

  const loadAll = useCallback(() => Promise.all([loadContacts(), loadFriends()]), [loadContacts, loadFriends]);
  const { refreshing, refreshControl } = usePullToRefresh(loadAll);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll])
  );

  if (authLoading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const totalCount = contacts.length;
  const alertsOnCount = contacts.filter((contact) => contact.status === 'accepted' && contact.alerts_enabled).length;
  const confirmedCount = contacts.filter((contact) => contact.status === 'accepted').length;

  const addedFriendIds = new Set(contacts.map((contact) => contact.contact_user_id));
  const availableFriends = friends
    .filter((friend) => !addedFriendIds.has(friend.user_id))
    .filter((friend) => friend.display_name.toLowerCase().includes(friendSearch.trim().toLowerCase()));
  const selectedFriend = friends.find((friend) => friend.user_id === selectedFriendId) ?? null;

  function openAddModal() {
    setFriendSearch('');
    setSelectedFriendId(null);
    setRelationship(null);
    setEmergencyInfo('');
    setFormError(null);
    setStep(1);
    setAddVisible(true);
  }

  function closeAddModal() {
    setAddVisible(false);
  }

  function goToStepTwo() {
    if (!selectedFriendId) {
      setFormError('Select a friend to add.');
      shake();
      return;
    }
    if (!relationship) {
      setFormError('Select a relationship.');
      shake();
      return;
    }
    setFormError(null);
    setStep(2);
  }

  async function submitContact() {
    if (!selectedFriendId || !relationship) return;
    setSubmitting(true);
    setFormError(null);
    const result = await addTrustedContact({
      contactUserId: selectedFriendId,
      relationship,
      emergencyInfo: emergencyInfo.trim(),
    });
    setSubmitting(false);
    if (result.error) {
      setFormError(result.error.message);
      shake();
      return;
    }
    setAddVisible(false);
    setRequestSent(true);
    await loadContacts();
  }

  async function toggleAlerts(contact: TrustedContact) {
    setBusyContactId(contact.id);
    setErrorMessage(null);
    const result = await setTrustedContactAlerts(contact.id, !contact.alerts_enabled);
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      await loadContacts();
    }
    setBusyContactId(null);
  }

  function confirmRemove(contact: TrustedContact) {
    Alert.alert('Remove contact?', `Remove ${contact.display_name} from your trusted circle?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeContact(contact) },
    ]);
  }

  async function removeContact(contact: TrustedContact) {
    setBusyContactId(contact.id);
    setErrorMessage(null);
    const result = await removeTrustedContact(contact.id);
    if (result.error) {
      setErrorMessage(result.error.message);
    } else {
      await loadContacts();
    }
    setBusyContactId(null);
  }

  async function resendRequest(contact: TrustedContact) {
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
      await loadContacts();
    }
    setBusyContactId(null);
  }

  function renderContact(contact: TrustedContact, index: number) {
    const busy = busyContactId === contact.id;
    const colors = relationshipColors(contact.relationship, isDark);
    const status =
      contact.status === 'pending'
        ? { label: 'Awaiting confirmation', color: '#D88700', icon: Clock }
        : contact.status === 'declined'
          ? { label: 'Declined', color: '#E32727', icon: XCircle }
          : contact.alerts_enabled
            ? { label: 'Receiving alerts', color: '#00A56A', icon: Bell }
            : { label: 'Alerts paused', color: isDark ? '#64748B' : '#94A3B8', icon: BellOff };
    const StatusIcon = status.icon;
    return (
      <Animated.View key={contact.id} entering={enterFromBelow(index + 1)}>
        <View style={[cardStyle, { borderRadius: 24, padding: 16 }]}>
          <View className="flex-row items-center gap-3">
            <View style={{ padding: 2.5, borderRadius: 30, borderWidth: 2, borderColor: status.color }}>
              {contact.avatar_url ? (
                <Image key="avatar" source={{ uri: contact.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
              ) : (
                <View key="initial" className="h-12 w-12 items-center justify-center rounded-full bg-[#DCE4FB]">
                  <Text className="text-lg font-black text-[#284BD6]">{contact.display_name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <View className="flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text numberOfLines={1} className={`shrink text-[17px] font-bold ${primary}`}>
                  {contact.display_name}
                </Text>
                {contact.status === 'accepted' ? <CheckCircle2 key="verified" size={16} color="#00A56A" /> : null}
              </View>
              <View className="mt-1 flex-row items-center gap-2">
                <View className={`rounded-full px-2.5 py-0.5 ${colors.bg}`}>
                  <Text className={`text-[12px] font-bold ${colors.text}`}>{contact.relationship}</Text>
                </View>
                <Text className={`text-[12px] ${secondary}`}>Added {formatAddedDate(contact.created_at)}</Text>
              </View>
            </View>
            {busy ? (
              <ActivityIndicator key="busy" color="#284BD6" />
            ) : (
              <TouchableOpacity
                key="remove"
                onPress={() => confirmRemove(contact)}
                accessibilityLabel={`Remove ${contact.display_name}`}
                className={`h-9 w-9 items-center justify-center rounded-full ${mutedFill}`}>
                <Trash2 size={16} color={isDark ? '#94A3B8' : '#8A94A8'} />
              </TouchableOpacity>
            )}
          </View>

          {contact.phone || contact.email ? (
            <View key="contact-info" className={`mt-3.5 gap-2 rounded-2xl px-3.5 py-3 ${mutedFill}`}>
              {contact.phone ? (
                <View key="phone" className="flex-row items-center gap-2.5">
                  <Phone size={14} color={isDark ? '#94A3B8' : '#67748D'} />
                  <Text className={`text-[14px] ${primary}`}>{contact.phone}</Text>
                </View>
              ) : null}
              {contact.email ? (
                <View key="email" className="flex-row items-center gap-2.5">
                  <Mail size={14} color={isDark ? '#94A3B8' : '#67748D'} />
                  <Text numberOfLines={1} className={`flex-1 text-[14px] ${primary}`}>
                    {contact.email}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {contact.emergency_info ? (
            <View key="emergency" className={`mt-3 flex-row gap-2.5 rounded-2xl px-3.5 py-3 ${isDark ? 'bg-[#241F0C]' : 'bg-[#FDF6E1]'}`}>
              <AlertTriangle size={15} color={isDark ? '#F0CE7E' : '#B4650B'} style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className={`text-[12px] font-bold uppercase tracking-wider ${isDark ? 'text-[#F0CE7E]' : 'text-[#B4650B]'}`}>Emergency info</Text>
                <Text className={`mt-0.5 text-[14px] leading-5 ${isDark ? 'text-[#E9D9A8]' : 'text-[#8A5C0A]'}`}>{contact.emergency_info}</Text>
              </View>
            </View>
          ) : null}

          <View className={`mt-3.5 flex-row items-center justify-between border-t pt-3 ${divider}`}>
            <View className="flex-row items-center gap-2">
              <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: `${status.color}1F` }}>
                <StatusIcon size={14} color={status.color} strokeWidth={2.4} />
              </View>
              <Text className="text-[13px] font-semibold" style={{ color: status.color }}>
                {status.label}
              </Text>
            </View>
            {contact.status === 'accepted' ? (
              <Switch
                key="alerts-switch"
                value={contact.alerts_enabled}
                onValueChange={() => void toggleAlerts(contact)}
                disabled={busy}
                trackColor={{ true: '#00A56A', false: isDark ? '#334155' : '#D7DDE8' }}
                thumbColor="#FFFFFF"
              />
            ) : contact.status === 'declined' ? (
              <TouchableOpacity key="resend" onPress={() => void resendRequest(contact)} disabled={busy} className="flex-row items-center gap-1.5 rounded-full bg-[#284BD6]/10 px-3.5 py-2">
                <RotateCcw size={14} color="#284BD6" />
                <Text className="text-[13px] font-bold text-[#284BD6]">Resend</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity key="cancel" onPress={() => confirmRemove(contact)} disabled={busy} className="rounded-full bg-[#E32727]/10 px-3.5 py-2">
                <Text className="text-[13px] font-bold text-[#E32727]">Cancel request</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    );
  }

  const protectedNow = alertsOnCount > 0;
  const howItWorks = [
    { icon: ShieldAlert, color: '#E32727', title: 'SOS alert', body: 'Tap SOS or Warning Mode on Home to alert every enabled contact.' },
    { icon: Clock, color: '#D88700', title: 'Warning Mode', body: "A 60-second countdown alerts them if you don't cancel." },
    { icon: MapPin, color: '#2647B8', title: 'Live location', body: 'Your location is sent along with every alert.' },
    { icon: Shield, color: '#00A56A', title: 'Private', body: 'Shared only in emergencies, only with confirmed contacts.' },
  ];

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScreenHeader
        title="Trusted Circle"
        subtitle="People who get your emergency alerts"
        right={
          <AnimatedPressable
            onPress={openAddModal}
            className="h-10 w-10 items-center justify-center rounded-full bg-[#284BD6]"
            style={{ shadowColor: '#284BD6', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
            accessibilityLabel="Add emergency contact">
            <Plus size={20} color="#FFFFFF" />
          </AnimatedPressable>
        }
      />

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={refreshControl}>
        <Animated.View entering={FadeIn.duration(350)}>
          <View
            style={{
              borderRadius: 28,
              overflow: 'hidden',
              padding: 20,
              backgroundColor: protectedNow ? '#1F44C9' : isDark ? '#1E293B' : '#334155',
              shadowColor: protectedNow ? '#1F44C9' : '#0B1220',
              shadowOpacity: isDark ? 0 : 0.25,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: 6,
            }}>
            <View style={{ position: 'absolute', right: -40, top: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <View style={{ position: 'absolute', right: 30, bottom: -60, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                {protectedNow ? <ShieldCheck key="on" size={26} color="#FFFFFF" /> : <ShieldAlert key="off" size={26} color="#FFFFFF" />}
              </View>
              <View className="flex-1">
                <Text className="text-[19px] font-black text-white">{protectedNow ? "You're covered" : 'Not protected yet'}</Text>
                <Text className="mt-0.5 text-[13px] leading-[18px] text-white/75">
                  {protectedNow
                    ? `${alertsOnCount} ${alertsOnCount === 1 ? 'person' : 'people'} will be alerted if you need help.`
                    : 'Add a friend and turn on alerts so someone knows when you need help.'}
                </Text>
              </View>
            </View>
            <View className="mt-5 flex-row rounded-2xl bg-white/10 py-3">
              {[
                { value: totalCount, label: 'Contacts' },
                { value: confirmedCount, label: 'Confirmed' },
                { value: alertsOnCount, label: 'Alerts on' },
              ].map((stat, i) => (
                <View key={stat.label} className={`flex-1 items-center ${i > 0 ? 'border-l border-white/15' : ''}`}>
                  <Text className="text-[22px] font-black text-white">{stat.value}</Text>
                  <Text className="mt-0.5 text-[12px] font-medium text-white/70">{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>

        {errorMessage ? <Text key="error" className="rounded-2xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
        {loading && !refreshing ? (
          <View key="skeleton" className="gap-4">
            <SkeletonCard height={150} />
            <SkeletonCard height={150} />
          </View>
        ) : null}

        {!loading && !contacts.length ? (
          <EmptyState
            key="empty"
            icon={<Users size={34} color="#284BD6" />}
            title="No emergency contacts yet"
            message="Add a friend who should be alerted if you need help."
            action={
              <AnimatedPressable onPress={openAddModal} className="flex-row items-center gap-2 rounded-2xl bg-[#284BD6] px-5 py-3">
                <Plus size={17} color="#FFFFFF" />
                <Text className="font-bold text-white">Add Emergency Contact</Text>
              </AnimatedPressable>
            }
          />
        ) : null}

        {contacts.length > 0 && (!loading || refreshing) ? (
          <View key="contacts-heading" className="mt-1 flex-row items-center justify-between px-1">
            <Text className={`text-[13px] font-bold uppercase tracking-widest ${secondary}`}>Your circle</Text>
            <TouchableOpacity onPress={openAddModal} className="flex-row items-center gap-1">
              <Plus size={15} color="#284BD6" />
              <Text className="text-[13px] font-bold text-[#284BD6]">Add</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading || refreshing ? contacts.map((contact, index) => renderContact(contact, index)) : null}

        <Animated.View entering={enterFromBelow(contacts.length + 1)} className="mt-2">
          <Text className={`mb-3 px-1 text-[13px] font-bold uppercase tracking-widest ${secondary}`}>How it works</Text>
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {howItWorks.map((item) => {
              const Icon = item.icon;
              return (
                <View key={item.title} style={[cardStyle, { width: '48.5%', borderRadius: 22, padding: 14 }]}>
                  <View className="h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${item.color}1A` }}>
                    <Icon size={19} color={item.color} />
                  </View>
                  <Text className={`mt-3 text-[15px] font-bold ${primary}`}>{item.title}</Text>
                  <Text className={`mt-1 text-[12.5px] leading-[17px] ${secondary}`}>{item.body}</Text>
                </View>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>

      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={closeAddModal}>
        <View className="flex-1 items-center justify-center bg-black/45 px-4">
          <Animated.View entering={riseIn(0, 380)} className={`w-full max-w-[440px] rounded-[28px] px-4 py-5 shadow-lg shadow-black/25 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
            <View className={`flex-row items-start justify-between gap-4 border-b pb-4 ${border}`}>
              <View className="flex-1">
                <Text className={`text-headline-24 font-bold ${primary}`}>Add Emergency Contact</Text>
                <Text className={`mt-1 text-[14px] ${secondary}`}>Step {step} of 2: {step === 1 ? 'Choose a Friend' : 'Emergency Information'}</Text>
              </View>
              <TouchableOpacity onPress={closeAddModal} className={`h-9 w-9 items-center justify-center rounded-full ${mutedFill}`} accessibilityLabel="Close">
                <X size={18} color={isDark ? '#CBD5E1' : '#6B7590'} />
              </TouchableOpacity>
            </View>

            <View className={`mt-4 h-1.5 overflow-hidden rounded-full ${mutedFill}`}>
              <Animated.View
                className="h-full rounded-full bg-[#284BD6]"
                style={{ width: step === 1 ? '50%' : '100%', transitionProperty: 'width', transitionDuration: 300 }}
              />
            </View>

            {formError ? (
              <Animated.View style={shakeStyle} className="mt-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                <Text className="text-sm text-[#B91C1C]">{formError}</Text>
              </Animated.View>
            ) : null}

            {step === 1 ? (
              <Animated.View key="step-1" entering={FadeIn.duration(200)} className="mt-4 gap-4">
                <View className={`flex-row items-start gap-2 rounded-xl border px-3 py-3 ${isDark ? 'border-[#1E3A5C] bg-[#0F2438]' : 'border-[#BFD6F5] bg-[#EAF2FE]'}`}>
                  <Info size={16} color={isDark ? '#8FC3F5' : '#2647B8'} />
                  <Text className={`flex-1 text-[13px] leading-5 ${isDark ? 'text-[#8FC3F5]' : 'text-[#2647B8]'}`}>
                    Only your app friends can be added, and they&apos;ll need to confirm before receiving SOS alerts and emergency notifications during your trips.
                  </Text>
                </View>

                {!friendsLoading && !friends.length ? (
                  <View className="items-center py-6">
                    <UserPlus size={32} color="#94A3B8" />
                    <Text className={`mt-3 text-center text-[15px] ${secondary}`}>You don&apos;t have any friends yet. Add friends first to build your trusted circle.</Text>
                    <TouchableOpacity
                      onPress={() => {
                        closeAddModal();
                        router.push('/friends');
                      }}
                      className="mt-4 rounded-2xl bg-[#284BD6] px-5 py-3"
                    >
                      <Text className="font-bold text-white">Find Friends</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View>
                      <Text className={`text-[13px] font-extrabold tracking-wide ${secondary}`}>FRIEND *</Text>
                      <TextInput
                        value={friendSearch}
                        onChangeText={setFriendSearch}
                        placeholder="Search your friends"
                        placeholderTextColor={isDark ? '#64748B' : '#A1A8B8'}
                        className={`mt-2 rounded-2xl border px-4 py-3.5 text-[16px] ${border} ${mutedFill} ${primary}`}
                      />
                      <View className="mt-2 max-h-[220px]">
                        <ScrollView nestedScrollEnabled>
                          <View className="gap-2">
                            {availableFriends.map((friend) => {
                              const selected = selectedFriendId === friend.user_id;
                              return (
                                <TouchableOpacity
                                  key={friend.user_id}
                                  onPress={() => setSelectedFriendId(friend.user_id)}
                                  className={`flex-row items-center gap-3 rounded-2xl border px-3 py-3 ${selected ? 'border-[#284BD6] bg-[#284BD6]/10' : `${border} ${mutedFill}`}`}
                                >
                                  <View className="h-10 w-10 items-center justify-center rounded-full bg-[#B7C4EC]">
                                    <Text className="font-bold text-[#24314A]">{friend.display_name.charAt(0).toUpperCase()}</Text>
                                  </View>
                                  <Text className={`flex-1 text-[16px] font-medium ${primary}`}>{friend.display_name}</Text>
                                  {selected ? <CheckCircle2 size={20} color="#284BD6" /> : null}
                                </TouchableOpacity>
                              );
                            })}
                            {!availableFriends.length ? (
                              <Text className={`px-1 py-3 text-center text-[14px] ${secondary}`}>
                                {friendSearch ? 'No friends match your search.' : 'All your friends are already in your trusted circle.'}
                              </Text>
                            ) : null}
                          </View>
                        </ScrollView>
                      </View>
                    </View>

                    <View>
                      <Text className={`text-[13px] font-extrabold tracking-wide ${secondary}`}>RELATIONSHIP *</Text>
                      <View className="mt-2 flex-row flex-wrap gap-2">
                        {RELATIONSHIP_OPTIONS.map((option) => {
                          const selected = relationship === option;
                          const colors = relationshipColors(option, isDark);
                          return (
                            <TouchableOpacity
                              key={option}
                              onPress={() => setRelationship(option)}
                              className={`rounded-full border px-4 py-2 ${selected ? `border-transparent ${colors.bg}` : border}`}
                            >
                              <Text className={`text-[14px] font-bold ${selected ? colors.text : secondary}`}>{option}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </>
                )}

                <View className={`flex-row gap-3 border-t pt-4 ${border}`}>
                  <TouchableOpacity onPress={closeAddModal} className={`flex-1 items-center rounded-2xl py-4 ${mutedFill}`}>
                    <Text className={`font-bold ${primary}`}>Cancel</Text>
                  </TouchableOpacity>
                  <AnimatedPressable onPress={goToStepTwo} className="flex-1 items-center rounded-2xl bg-[#284BD6] py-4">
                    <Text className="font-bold text-white">Next</Text>
                  </AnimatedPressable>
                </View>
              </Animated.View>
            ) : (
              <Animated.View key="step-2" entering={FadeInRight.duration(250)} className="mt-4 gap-4">
                <View>
                  <Text className={`text-[13px] font-extrabold tracking-wide ${secondary}`}>EMERGENCY INFORMATION (Optional)</Text>
                  <TextInput
                    value={emergencyInfo}
                    onChangeText={(text) => setEmergencyInfo(text.slice(0, EMERGENCY_INFO_MAX))}
                    placeholder="e.g., Medical conditions, medication allergies, special instructions..."
                    placeholderTextColor={isDark ? '#64748B' : '#A1A8B8'}
                    multiline
                    maxLength={EMERGENCY_INFO_MAX}
                    className={`mt-2 min-h-[96px] rounded-2xl border px-4 py-4 text-[16px] ${border} ${mutedFill} ${primary}`}
                  />
                  <Text className={`mt-1 text-right text-[12px] ${secondary}`}>{emergencyInfo.length}/{EMERGENCY_INFO_MAX} characters</Text>
                </View>

                <View className={`flex-row items-start gap-2 rounded-xl border px-3 py-3 ${isDark ? 'border-[#3B341A] bg-[#241F0C]' : 'border-[#F5E1A8] bg-[#FDF6E1]'}`}>
                  <AlertTriangle size={16} color={isDark ? '#F0CE7E' : '#B4650B'} />
                  <Text className={`flex-1 text-[13px] leading-5 ${isDark ? 'text-[#E9D9A8]' : 'text-[#8A5C0A]'}`}>
                    Emergency information will only be shared in urgent situations with authorized personnel.
                  </Text>
                </View>

                <View className={`rounded-xl border px-3 py-3 ${isDark ? 'border-[#1F3B3D] bg-[#0F1F24]' : 'border-[#BEEFCB] bg-[#EFFCF3]'}`}>
                  <View className="flex-row items-center gap-1.5">
                    <CheckCircle2 size={15} color="#00A56A" />
                    <Text className="text-[13px] font-bold text-[#00A56A]">Contact Summary:</Text>
                  </View>
                  <Text className={`mt-1 text-[15px] ${primary}`}>{selectedFriend?.display_name ?? 'Unnamed contact'} ({relationship})</Text>
                </View>

                <View className={`flex-row gap-3 border-t pt-4 ${border}`}>
                  <TouchableOpacity onPress={() => setStep(1)} className={`flex-1 items-center rounded-2xl py-4 ${mutedFill}`}>
                    <Text className={`font-bold ${primary}`}>Back</Text>
                  </TouchableOpacity>
                  <AnimatedPressable onPress={() => void submitContact()} disabled={submitting} className="flex-1 items-center rounded-2xl bg-[#284BD6] py-4">
                    {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">Send Request</Text>}
                  </AnimatedPressable>
                </View>
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </Modal>

      <SuccessOverlay
        visible={requestSent}
        title="Request sent"
        message="They'll start receiving your alerts once they confirm."
        onDone={clearRequestSent}
      />
    </View>
  );
}
