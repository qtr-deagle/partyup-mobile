import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { listFriendConnections, type FriendConnection } from '@/lib/social';
import { getTheme, typography } from '@/lib/theme';
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
import { AlertTriangle, ArrowLeft, Bell, BellOff, CheckCircle2, Clock, Info, MapPin, Plus, Shield, ShieldAlert, UserPlus, Users, X, XCircle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EMERGENCY_INFO_MAX = 200;

export default function TrustedCircleScreen() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { titleColor } = getTheme(isDark);

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

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const headerBackground = isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-[#E5EAF2] bg-white';
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E9EDF5] bg-white';
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

  useFocusEffect(
    useCallback(() => {
      void loadContacts();
      void loadFriends();
    }, [loadContacts, loadFriends])
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
      return;
    }
    if (!relationship) {
      setFormError('Select a relationship.');
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
      return;
    }
    setAddVisible(false);
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

  function renderContact(contact: TrustedContact) {
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
              <View className="flex-row items-center gap-1.5">
                <Text className={`text-[19px] font-black ${primary}`}>{contact.display_name}</Text>
                {contact.status === 'accepted' ? <CheckCircle2 size={17} color="#00A56A" /> : null}
              </View>
              <View className={`mt-1.5 self-start rounded-full px-3 py-1 ${colors.bg}`}>
                <Text className={`text-[13px] font-bold ${colors.text}`}>{contact.relationship}</Text>
              </View>
            </View>
          </View>
          {contact.status === 'pending' ? (
            <Clock size={20} color="#D88700" />
          ) : contact.status === 'declined' ? (
            <XCircle size={20} color="#E32727" />
          ) : contact.alerts_enabled ? (
            <Bell size={20} color="#00A56A" />
          ) : (
            <BellOff size={20} color={isDark ? '#64748B' : '#94A3B8'} />
          )}
        </View>

        {contact.phone || contact.email ? (
          <View className={`mt-3 gap-1 border-t pt-3 ${border}`}>
            {contact.phone ? <Text className={`text-[15px] ${secondary}`}>{contact.phone}</Text> : null}
            {contact.email ? <Text className={`text-[15px] ${secondary}`}>{contact.email}</Text> : null}
          </View>
        ) : null}

        {contact.emergency_info ? (
          <View className={`mt-3 rounded-xl border px-3 py-3 ${isDark ? 'border-[#3B341A] bg-[#241F0C]' : 'border-[#F5E1A8] bg-[#FDF6E1]'}`}>
            <View className="flex-row items-center gap-1.5">
              <AlertTriangle size={14} color={isDark ? '#F0CE7E' : '#B4650B'} />
              <Text className={`text-[13px] font-bold ${isDark ? 'text-[#F0CE7E]' : 'text-[#B4650B]'}`}>Emergency Info</Text>
            </View>
            <Text className={`mt-1 text-[14px] leading-5 ${isDark ? 'text-[#E9D9A8]' : 'text-[#8A5C0A]'}`}>{contact.emergency_info}</Text>
          </View>
        ) : null}

        <View className="mt-3 flex-row items-center justify-between">
          <Text className={`text-[13px] ${secondary}`}>Added {formatAddedDate(contact.created_at)}</Text>
          {contact.status === 'pending' ? (
            <Text className="text-[13px] font-bold text-[#D88700]">Awaiting confirmation</Text>
          ) : contact.status === 'declined' ? (
            <Text className="text-[13px] font-bold text-[#E32727]">Declined</Text>
          ) : (
            <Text className={`text-[13px] font-bold ${contact.alerts_enabled ? 'text-[#00A56A]' : secondary}`}>
              {contact.alerts_enabled ? 'Alerts On' : 'Alerts Off'}
            </Text>
          )}
        </View>

        <View className="mt-3 flex-row gap-2">
          {contact.status === 'pending' ? (
            <TouchableOpacity
              onPress={() => confirmRemove(contact)}
              disabled={busy}
              className="flex-1 items-center rounded-2xl border border-[#E32727] py-3"
            >
              <Text className="font-bold text-[#E32727]">Cancel Request</Text>
            </TouchableOpacity>
          ) : contact.status === 'declined' ? (
            <>
              <TouchableOpacity
                onPress={() => void resendRequest(contact)}
                disabled={busy}
                className={`flex-1 items-center rounded-2xl border py-3 ${border}`}
              >
                <Text className={`font-bold ${primary}`}>Resend</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => confirmRemove(contact)}
                disabled={busy}
                className="flex-1 items-center rounded-2xl border border-[#E32727] py-3"
              >
                <Text className="font-bold text-[#E32727]">Remove</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => void toggleAlerts(contact)}
                disabled={busy}
                className={`flex-1 items-center rounded-2xl border py-3 ${border}`}
              >
                <Text className={`font-bold ${primary}`}>{contact.alerts_enabled ? 'Disable' : 'Enable'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => confirmRemove(contact)}
                disabled={busy}
                className="flex-1 items-center rounded-2xl border border-[#E32727] py-3"
              >
                <Text className="font-bold text-[#E32727]">Remove</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {busy ? <ActivityIndicator className="absolute right-4 top-4" color="#284BD6" /> : null}
      </View>
    );
  }

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <View className={`border-b px-4 pb-4 ${headerBackground}`} style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center rounded-full" accessibilityLabel="Go back">
            <ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} />
          </TouchableOpacity>
          <View className="flex-1 items-center">
            <Text className={`${typography.pageTitle} ${titleColor}`}>Trusted Circle</Text>
          </View>
          <TouchableOpacity onPress={openAddModal} className="h-10 w-10 items-center justify-center rounded-full bg-[#284BD6]" accessibilityLabel="Add emergency contact">
            <Plus size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <Text className={`mt-1 text-center text-[15px] ${secondary}`}>{totalCount} contact{totalCount === 1 ? '' : 's'} • Manage emergency alerts</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-10 pt-4">
        <View className="flex-row gap-3">
          <View className={`flex-1 items-center rounded-2xl border px-3 py-4 ${card}`}>
            <Text className={`text-[26px] font-black ${primary}`}>{totalCount}</Text>
            <Text className={`mt-1 text-[13px] ${secondary}`}>Total</Text>
          </View>
          <View className={`flex-1 items-center rounded-2xl border px-3 py-4 ${isDark ? 'border-[#1F3B3D] bg-[#0F1F24]' : 'border-[#BEEFCB] bg-[#EFFCF3]'}`}>
            <Text className="text-[26px] font-black text-[#00A56A]">{alertsOnCount}</Text>
            <Text className="mt-1 text-[13px] text-[#00A56A]">Alerts On</Text>
          </View>
          <View className={`flex-1 items-center rounded-2xl border px-3 py-4 ${isDark ? 'border-[#1F3B3D] bg-[#0F1F24]' : 'border-[#BEEFCB] bg-[#EFFCF3]'}`}>
            <Text className="text-[26px] font-black text-[#00A56A]">{confirmedCount}</Text>
            <Text className="mt-1 text-[13px] text-[#00A56A]">Confirmed</Text>
          </View>
        </View>

        {errorMessage ? <Text className="rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{errorMessage}</Text> : null}
        {loading ? <ActivityIndicator className="mt-4" color="#284BD6" /> : null}

        {!loading && !contacts.length ? (
          <View className="items-center px-8 py-10">
            <Users size={40} color="#94A3B8" />
            <Text className={`mt-4 text-center text-base ${secondary}`}>No emergency contacts yet. Add a friend who should be alerted if you need help.</Text>
            <TouchableOpacity onPress={openAddModal} className="mt-5 flex-row items-center gap-2 rounded-2xl bg-[#284BD6] px-5 py-3">
              <Plus size={17} color="#FFFFFF" />
              <Text className="font-bold text-white">Add Emergency Contact</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading ? contacts.map(renderContact) : null}

        <View className={`rounded-[22px] border p-4 ${card}`}>
          <Text className={`text-[18px] font-black ${primary}`}>How It Works</Text>
          <View className="mt-3 gap-3">
            <View className="flex-row items-start gap-3">
              <ShieldAlert size={20} color="#E32727" />
              <View className="flex-1">
                <Text className={`text-[15px] font-bold ${primary}`}>Emergency Alert</Text>
                <Text className={`mt-0.5 text-[14px] leading-5 ${secondary}`}>Tap Emergency SOS on Home to instantly alert all enabled contacts</Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <Clock size={20} color="#D88700" />
              <View className="flex-1">
                <Text className={`text-[15px] font-bold ${primary}`}>Warning Mode</Text>
                <Text className={`mt-0.5 text-[14px] leading-5 ${secondary}`}>Activate a 60-second countdown that auto-alerts your contacts if you don&apos;t cancel it</Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <MapPin size={20} color="#2647B8" />
              <View className="flex-1">
                <Text className={`text-[15px] font-bold ${primary}`}>Real-Time Location</Text>
                <Text className={`mt-0.5 text-[14px] leading-5 ${secondary}`}>Your location is included with alerts sent to trusted contacts</Text>
              </View>
            </View>
            <View className="flex-row items-start gap-3">
              <Shield size={20} color="#00A56A" />
              <View className="flex-1">
                <Text className={`text-[15px] font-bold ${primary}`}>Secure & Private</Text>
                <Text className={`mt-0.5 text-[14px] leading-5 ${secondary}`}>Info only shared in emergencies with contacts who confirmed and enabled alerts</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={closeAddModal}>
        <View className="flex-1 items-center justify-center bg-black/45 px-4">
          <View className={`w-full max-w-[440px] rounded-[28px] px-4 py-5 shadow-lg shadow-black/25 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
            <View className={`flex-row items-start justify-between gap-4 border-b pb-4 ${border}`}>
              <View className="flex-1">
                <Text className={`text-[22px] font-black ${primary}`}>Add Emergency Contact</Text>
                <Text className={`mt-1 text-[14px] ${secondary}`}>Step {step} of 2: {step === 1 ? 'Choose a Friend' : 'Emergency Information'}</Text>
              </View>
              <TouchableOpacity onPress={closeAddModal} className={`h-9 w-9 items-center justify-center rounded-full ${mutedFill}`} accessibilityLabel="Close">
                <X size={18} color={isDark ? '#CBD5E1' : '#6B7590'} />
              </TouchableOpacity>
            </View>

            <View className={`mt-4 h-1.5 overflow-hidden rounded-full ${mutedFill}`}>
              <View className="h-full rounded-full bg-[#284BD6]" style={{ width: step === 1 ? '50%' : '100%' }} />
            </View>

            {formError ? <Text className="mt-4 rounded-xl bg-[#FEE2E2] px-4 py-3 text-sm text-[#B91C1C]">{formError}</Text> : null}

            {step === 1 ? (
              <View className="mt-4 gap-4">
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
                  <TouchableOpacity onPress={goToStepTwo} className="flex-1 items-center rounded-2xl bg-[#284BD6] py-4">
                    <Text className="font-bold text-white">Next</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="mt-4 gap-4">
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
                  <TouchableOpacity onPress={() => void submitContact()} disabled={submitting} className="flex-1 items-center rounded-2xl bg-[#284BD6] py-4">
                    {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">Send Request</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
