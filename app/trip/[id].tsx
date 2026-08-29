import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  buildInviteUrl,
  cancelTrip,
  confirmPaymentReceived,
  formatCurrency,
  getTripDetail,
  getTripInviteLink,
  leaveTrip,
  listTripMembers,
  paymentStatusColors,
  reportPayment,
  respondToJoinRequest,
  type TripDetail,
  type TripMember,
} from '@/lib/carpool';
import { parseTimestamp } from '@/lib/datetime';
import { supabase } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Check, MapPin, Share2, Sparkles, Wallet, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Date TBD';
  }
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date TBD';
  }
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function TripDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile, refreshProfile } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { titleColor } = getTheme(isDark);

  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const inputBg = isDark ? 'bg-[#18253C]' : 'bg-[#F4F6FB]';

  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [referenceInput, setReferenceInput] = useState('');
  const [editingHandles, setEditingHandles] = useState(false);
  const [gcashInput, setGcashInput] = useState('');
  const [paymayaInput, setPaymayaInput] = useState('');
  const [savingHandles, setSavingHandles] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    const [detailResult, membersResult] = await Promise.all([getTripDetail(id), listTripMembers(id)]);
    if (detailResult.error) {
      setErrorMessage(detailResult.error.message);
    } else {
      setDetail(detailResult.data);
    }
    if (!membersResult.error) {
      setMembers(membersResult.data);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleShareInvite() {
    if (!id || !session?.user.id) {
      return;
    }
    setBusyId('share');
    const { data, error } = await getTripInviteLink(id);
    setBusyId(null);
    if (error || !data) {
      Alert.alert('Unable to get invite link', error?.message ?? 'Please try again.');
      return;
    }
    const url = buildInviteUrl(data.invite_code, session.user.id);
    await Share.share({ message: `Join my carpool "${data.trip_title}" on PartyUp: ${url}`, url });
  }

  async function handleRespond(memberId: string, status: 'accepted' | 'rejected') {
    setBusyId(memberId);
    const { error } = await respondToJoinRequest(memberId, status);
    if (error) {
      Alert.alert('Unable to update request', error.message);
    } else {
      await load();
    }
    setBusyId(null);
  }

  async function handleConfirmPayment(memberId: string) {
    setBusyId(memberId);
    const { error } = await confirmPaymentReceived(memberId);
    if (error) {
      Alert.alert('Unable to confirm payment', error.message);
    } else {
      await load();
    }
    setBusyId(null);
  }

  async function handleReportPayment() {
    if (!id) {
      return;
    }
    setBusyId('report');
    const { error } = await reportPayment(id, referenceInput.trim() || undefined);
    setBusyId(null);
    if (error) {
      Alert.alert('Unable to report payment', error.message);
    } else {
      setReferenceInput('');
      await load();
    }
  }

  function confirmLeave() {
    Alert.alert('Leave trip?', 'You will lose your seat on this trip.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => void handleLeave() },
    ]);
  }

  async function handleLeave() {
    if (!id) {
      return;
    }
    setBusyId('leave');
    const { error } = await leaveTrip(id);
    setBusyId(null);
    if (error) {
      Alert.alert('Unable to leave trip', error.message);
    } else {
      router.back();
    }
  }

  function confirmCancel() {
    Alert.alert('Cancel this trip?', 'All riders will be notified.', [
      { text: 'Keep trip', style: 'cancel' },
      { text: 'Cancel trip', style: 'destructive', onPress: () => void handleCancel() },
    ]);
  }

  async function handleCancel() {
    if (!id) {
      return;
    }
    setBusyId('cancel');
    const { error } = await cancelTrip(id);
    setBusyId(null);
    if (error) {
      Alert.alert('Unable to cancel trip', error.message);
    } else {
      router.back();
    }
  }

  function startEditingHandles() {
    setGcashInput(profile?.gcash_handle ?? '');
    setPaymayaInput(profile?.paymaya_handle ?? '');
    setEditingHandles(true);
  }

  async function handleSaveHandles() {
    if (!session?.user.id) {
      return;
    }
    setSavingHandles(true);
    const { error } = await supabase
      .from('profiles')
      .update({ gcash_handle: gcashInput.trim() || null, paymaya_handle: paymayaInput.trim() || null })
      .eq('id', session.user.id);
    setSavingHandles(false);
    if (error) {
      Alert.alert('Unable to save payment info', error.message);
      return;
    }
    await refreshProfile();
    setEditingHandles(false);
  }

  if (loading && !detail) {
    return (
      <View className={`flex-1 items-center justify-center ${background}`}>
        <ActivityIndicator color="#2A55D4" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View className={`flex-1 items-center justify-center gap-4 px-6 ${background}`}>
        <Text className={`text-center text-base ${secondary}`}>{errorMessage ?? 'Trip not found.'}</Text>
        <TouchableOpacity onPress={() => router.back()} className="rounded-2xl bg-[#2A55D4] px-5 py-3">
          <Text className="font-bold text-white">Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pendingRequests = members.filter((m) => m.status === 'pending');
  const awaitingConfirmation = members.filter((m) => m.member_role === 'member' && m.status === 'accepted' && m.payment_status === 'pending');
  const settledRiders = members.filter((m) => m.member_role === 'member' && m.status === 'accepted' && m.payment_status !== 'pending');

  return (
    <View className={`flex-1 ${background}`}>
      <View className={`border-b px-4 pb-4 ${border}`} style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center" accessibilityLabel="Go back">
            <ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} />
          </TouchableOpacity>
          <Text className={`flex-1 text-center ${typography.sectionTitle} ${titleColor}`} numberOfLines={1}>
            {detail.title}
          </Text>
          <View className="h-10 w-10" />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-12 pt-4">
        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        <View className={`rounded-[22px] border p-4 ${card}`}>
          <View className="flex-row items-center gap-3">
            <MapPin size={18} color="#2A55D4" />
            <Text className={`flex-1 text-base ${primary}`}>
              {detail.origin} → {detail.destination}
            </Text>
          </View>
          <View className="mt-3 flex-row items-center gap-3">
            <Calendar size={18} color="#2A55D4" />
            <Text className={`text-base ${primary}`}>{formatDateTime(detail.start_at)}</Text>
          </View>
        </View>

        <View className="rounded-[22px] bg-[#2A55D4] p-5">
          <View className="flex-row items-center gap-2">
            <Sparkles size={18} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white/80">Live price per person</Text>
          </View>
          <Text className="mt-2 text-[36px] font-black text-white">{formatCurrency(detail.price_per_person ?? detail.total_cost)}</Text>
          <Text className="mt-1 text-sm text-white/80">
            Total {formatCurrency(detail.total_cost)} split {Math.max(detail.rider_count, 1)} way{detail.rider_count === 1 ? '' : 's'} — invite more friends to
            lower everyone&apos;s share.
          </Text>
        </View>

        {detail.my_invited_by_display_name ? (
          <View className={`rounded-2xl border px-4 py-3 ${card}`}>
            <Text className={`text-sm ${secondary}`}>
              Invited by <Text className={`font-bold ${primary}`}>{detail.my_invited_by_display_name}</Text>
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleShareInvite}
          disabled={busyId === 'share'}
          className={`flex-row items-center justify-center gap-2 rounded-2xl border py-3.5 ${border} ${isDark ? 'bg-[#18253C]' : 'bg-white'}`}
        >
          {busyId === 'share' ? <ActivityIndicator color="#2A55D4" /> : <Share2 size={18} color="#2A55D4" />}
          <Text className="text-base font-bold text-[#2A55D4]">Share Invite Link</Text>
        </TouchableOpacity>

        {detail.is_driver ? (
          <>
            <View className={`rounded-[22px] border p-4 ${card}`}>
              <View className="flex-row items-center justify-between">
                <Text className={`text-lg font-black ${primary}`}>Your Payment Info</Text>
                <TouchableOpacity onPress={startEditingHandles}>
                  <Text className="text-sm font-bold text-[#2A55D4]">{detail.driver_gcash_handle || detail.driver_paymaya_handle ? 'Edit' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
              {editingHandles ? (
                <View className="mt-3 gap-3">
                  <TextInput
                    className={`rounded-2xl px-4 py-3.5 text-base ${inputBg} ${primary}`}
                    placeholder="GCash number"
                    placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                    value={gcashInput}
                    onChangeText={setGcashInput}
                    keyboardType="phone-pad"
                  />
                  <TextInput
                    className={`rounded-2xl px-4 py-3.5 text-base ${inputBg} ${primary}`}
                    placeholder="PayMaya number"
                    placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                    value={paymayaInput}
                    onChangeText={setPaymayaInput}
                    keyboardType="phone-pad"
                  />
                  <View className="flex-row gap-2">
                    <TouchableOpacity onPress={() => setEditingHandles(false)} className={`flex-1 items-center rounded-2xl border py-3 ${border}`}>
                      <Text className={`font-bold ${primary}`}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSaveHandles} disabled={savingHandles} className="flex-1 items-center rounded-2xl bg-[#2A55D4] py-3">
                      {savingHandles ? <ActivityIndicator color="#FFFFFF" /> : <Text className="font-bold text-white">Save</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View className="mt-3 gap-2">
                  <Text className={`text-base ${secondary}`}>GCash: {detail.driver_gcash_handle || 'Not set'}</Text>
                  <Text className={`text-base ${secondary}`}>PayMaya: {detail.driver_paymaya_handle || 'Not set'}</Text>
                  {!detail.driver_gcash_handle && !detail.driver_paymaya_handle ? (
                    <Text className="text-sm text-[#B4650B]">Add a payment handle so riders know where to send their fare.</Text>
                  ) : null}
                </View>
              )}
            </View>

            {pendingRequests.length ? (
              <View className="gap-3">
                <Text className={`text-lg font-black ${primary}`}>Pending requests ({pendingRequests.length})</Text>
                {pendingRequests.map((member) => (
                  <View key={member.id} className={`rounded-2xl border p-4 ${card}`}>
                    <Text className={`text-base font-bold ${primary}`}>{member.display_name}</Text>
                    {member.invited_by_display_name ? <Text className={`mt-0.5 text-sm ${secondary}`}>Invited by {member.invited_by_display_name}</Text> : null}
                    <View className="mt-3 flex-row gap-2">
                      <TouchableOpacity
                        onPress={() => void handleRespond(member.id, 'accepted')}
                        disabled={busyId === member.id}
                        className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] py-2.5"
                      >
                        <Check size={16} color="#FFFFFF" />
                        <Text className="font-bold text-white">Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void handleRespond(member.id, 'rejected')}
                        disabled={busyId === member.id}
                        className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl border py-2.5 ${border}`}
                      >
                        <X size={16} color="#B91C1C" />
                        <Text className="font-bold text-[#B91C1C]">Decline</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {awaitingConfirmation.length ? (
              <View className="gap-3">
                <Text className={`text-lg font-black ${primary}`}>Awaiting confirmation ({awaitingConfirmation.length})</Text>
                {awaitingConfirmation.map((member) => (
                  <View key={member.id} className={`rounded-2xl border p-4 ${card}`}>
                    <View className="flex-row items-center justify-between">
                      <Text className={`text-base font-bold ${primary}`}>{member.display_name}</Text>
                      <Text className={`text-base font-bold ${primary}`}>{formatCurrency(member.payment_amount)}</Text>
                    </View>
                    {member.payment_reference ? <Text className={`mt-1 text-sm ${secondary}`}>Ref: {member.payment_reference}</Text> : null}
                    <TouchableOpacity
                      onPress={() => void handleConfirmPayment(member.id)}
                      disabled={busyId === member.id}
                      className="mt-3 flex-row items-center justify-center gap-2 rounded-2xl bg-[#19A06B] py-2.5"
                    >
                      {busyId === member.id ? <ActivityIndicator color="#FFFFFF" /> : <Check size={16} color="#FFFFFF" />}
                      <Text className="font-bold text-white">Confirm Received</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}

            {settledRiders.length ? (
              <View className="gap-3">
                <Text className={`text-lg font-black ${primary}`}>Riders ({settledRiders.length})</Text>
                {settledRiders.map((member) => {
                  const colors = paymentStatusColors(member.payment_status, isDark);
                  return (
                    <View key={member.id} className={`flex-row items-center justify-between rounded-2xl border p-4 ${card}`}>
                      <View className="flex-1">
                        <Text className={`text-base font-bold ${primary}`}>{member.display_name}</Text>
                        {member.invited_by_display_name ? <Text className={`mt-0.5 text-sm ${secondary}`}>Invited by {member.invited_by_display_name}</Text> : null}
                      </View>
                      <View className={`rounded-full px-3 py-1.5 ${colors.bg}`}>
                        <Text className={`text-sm font-bold ${colors.text}`}>{member.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <TouchableOpacity onPress={confirmCancel} disabled={busyId === 'cancel'} className="items-center rounded-2xl border border-[#E32727] py-3.5">
              <Text className="font-bold text-[#E32727]">Cancel Trip</Text>
            </TouchableOpacity>
          </>
        ) : detail.my_status === 'pending' ? (
          <View className={`items-center rounded-[22px] border p-6 ${card}`}>
            <Text className={`text-center text-base ${secondary}`}>Your request to join is pending the driver&apos;s approval.</Text>
          </View>
        ) : (
          <>
            <View className={`rounded-[22px] border p-4 ${card}`}>
              <View className="flex-row items-center gap-2">
                <Wallet size={18} color="#2A55D4" />
                <Text className={`text-lg font-black ${primary}`}>Pay the Driver</Text>
              </View>
              <Text className={`mt-2 text-sm ${secondary}`}>
                Send payment directly to the driver via GCash or PayMaya, then report it below. PartyUp does not process the payment — it only records it.
              </Text>
              <View className="mt-3 gap-2">
                <Text className={`text-base ${secondary}`}>GCash: {detail.driver_gcash_handle || 'Not set yet'}</Text>
                <Text className={`text-base ${secondary}`}>PayMaya: {detail.driver_paymaya_handle || 'Not set yet'}</Text>
              </View>
            </View>

            {detail.my_payment_status === 'paid' ? (
              <View className={`items-center gap-2 rounded-[22px] border p-6 ${card}`}>
                <Check size={28} color="#19A06B" />
                <Text className={`text-center text-base font-bold ${primary}`}>Payment confirmed — you&apos;re all set!</Text>
              </View>
            ) : detail.my_payment_status === 'pending' ? (
              <View className={`items-center rounded-[22px] border p-6 ${card}`}>
                <Text className={`text-center text-base ${secondary}`}>Waiting for the driver to confirm your payment.</Text>
              </View>
            ) : (
              <View className={`rounded-[22px] border p-4 ${card}`}>
                <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>REFERENCE NUMBER (OPTIONAL)</Text>
                <TextInput
                  className={`rounded-2xl px-4 py-3.5 text-base ${inputBg} ${primary}`}
                  placeholder="e.g., GC-1234567890"
                  placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
                  value={referenceInput}
                  onChangeText={setReferenceInput}
                />
                <TouchableOpacity onPress={handleReportPayment} disabled={busyId === 'report'} className="mt-3 rounded-2xl bg-[#2A55D4] py-3.5">
                  {busyId === 'report' ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center font-bold text-white">I&apos;ve Paid</Text>}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity onPress={confirmLeave} disabled={busyId === 'leave'} className="items-center rounded-2xl border border-[#E32727] py-3.5">
              <Text className="font-bold text-[#E32727]">Leave Trip</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}
