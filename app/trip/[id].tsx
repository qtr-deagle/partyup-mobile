import { RateUserModal } from '@/components/RateUserModal';
import { ReportUserModal } from '@/components/ReportUserModal';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  buildInviteUrl,
  cancelTrip,
  completeTrip,
  confirmPaymentReceived,
  formatCurrency,
  getTripDetail,
  getTripInviteLink,
  leaveTrip,
  listTripMembers,
  paymentStatusColors,
  reportPayment,
  respondToJoinRequest,
  startGatewayPayment,
  startTrip,
  type TripDetail,
  type TripMember,
} from '@/lib/carpool';
import { parseTimestamp } from '@/lib/datetime';
import { listMyGivenRatings, type GivenRating } from '@/lib/ratings';
import { supabase } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import { getTourDetail, joinPublicTrip, listTripItinerary, type ItineraryDay, type TourDetail } from '@/lib/tours';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, BadgeCheck, Calendar, Check, Flag, MapPin, Share2, Sparkles, Star, Users, Wallet, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6A758F',
  open: '#19A06B',
  full: '#B4650B',
  ongoing: '#2A55D4',
  completed: '#19A06B',
  cancelled: '#E32727',
};

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
  const [previewTour, setPreviewTour] = useState<TourDetail | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [givenRatings, setGivenRatings] = useState<Map<string, GivenRating>>(new Map());
  const [reportTarget, setReportTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const [rateTarget, setRateTarget] = useState<{ userId: string; displayName: string } | null>(null);
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

    const detailResult = await getTripDetail(id);
    if (!detailResult.error && detailResult.data) {
      setDetail(detailResult.data);
      setPreviewTour(null);
      const membersResult = await listTripMembers(id);
      if (!membersResult.error) {
        setMembers(membersResult.data);
      }
      if (detailResult.data.trip_type === 'tour') {
        const itineraryResult = await listTripItinerary(id);
        setItinerary(itineraryResult.error ? [] : itineraryResult.data);
      } else {
        setItinerary([]);
      }
      if (detailResult.data.status === 'completed') {
        const ratingsResult = await listMyGivenRatings(id);
        setGivenRatings(new Map((ratingsResult.data ?? []).map((rating) => [rating.target_user_id, rating])));
      } else {
        setGivenRatings(new Map());
      }
      setLoading(false);
      return;
    }

    // Not a member/creator of this trip -- fall back to a read-only tour
    // preview (Browse Tours card the user hasn't joined yet).
    const previewResult = await getTourDetail(id);
    if (previewResult.error || !previewResult.data) {
      setDetail(null);
      setPreviewTour(null);
      setErrorMessage(detailResult.error?.message ?? previewResult.error?.message ?? 'Trip not found.');
      setLoading(false);
      return;
    }

    setDetail(null);
    setPreviewTour(previewResult.data);
    const itineraryResult = await listTripItinerary(id);
    setItinerary(itineraryResult.error ? [] : itineraryResult.data);
    setLoading(false);
  }, [id]);

  async function handleJoinTour() {
    if (!id) {
      return;
    }
    setJoining(true);
    const { error } = await joinPublicTrip(id);
    setJoining(false);
    if (error) {
      Alert.alert('Unable to join tour', error.message);
      return;
    }
    await load();
  }

  // Live refresh once a gateway payment's webhook lands, so a rider/driver
  // sees payment_status flip to 'paid' without backgrounding the app.
  useEffect(() => {
    if (!id) {
      return;
    }
    const channel = supabase
      .channel(`trip-members:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${id}` }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

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

  async function handleGatewayPayment(method: 'gcash' | 'paymaya') {
    if (!id) {
      return;
    }
    setBusyId(`gateway-${method}`);
    const { data, error } = await startGatewayPayment(id, method);
    if (error || !data) {
      Alert.alert('Unable to start payment', error?.message ?? 'Please try again.');
      setBusyId(null);
      return;
    }
    // Must exactly match the return_url the create-gateway-payment function
    // gives PayMongo -- openAuthSessionAsync intercepts navigation to this
    // URL prefix and closes the browser itself, before the page even loads,
    // so the page's actual content (or lack thereof) doesn't matter.
    const returnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/payment-return`;
    await WebBrowser.openAuthSessionAsync(data.checkoutUrl, returnUrl);
    setBusyId(null);
    await load();
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

  async function handleStart() {
    if (!id) {
      return;
    }
    setBusyId('start');
    const { error } = await startTrip(id);
    setBusyId(null);
    if (error) {
      Alert.alert('Unable to start trip', error.message);
    } else {
      void load();
    }
  }

  function confirmComplete() {
    Alert.alert('Mark this trip complete?', 'Riders will be able to rate each other once the trip is marked complete.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Complete trip', onPress: () => void handleComplete() },
    ]);
  }

  async function handleComplete() {
    if (!id) {
      return;
    }
    setBusyId('complete');
    const { error } = await completeTrip(id);
    setBusyId(null);
    if (error) {
      Alert.alert('Unable to complete trip', error.message);
    } else {
      void load();
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

  if (loading && !detail && !previewTour) {
    return (
      <View className={`flex-1 items-center justify-center ${background}`}>
        <ActivityIndicator color="#2A55D4" />
      </View>
    );
  }

  if (!detail && previewTour) {
    return (
      <View className={`flex-1 ${background}`}>
        <View className={`border-b px-4 pb-4 ${border}`} style={{ paddingTop: insets.top + 16 }}>
          <View className="flex-row items-center justify-between">
            <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center" accessibilityLabel="Go back">
              <ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} />
            </TouchableOpacity>
            <Text className={`flex-1 text-center ${typography.sectionTitle} ${titleColor}`} numberOfLines={1}>
              {previewTour.title}
            </Text>
            <View className="h-10 w-10" />
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-12 pt-4">
          <View className={`rounded-[22px] border p-4 ${card}`}>
            <View className="flex-row items-center gap-3">
              <MapPin size={18} color="#2A55D4" />
              <Text className={`flex-1 text-base ${primary}`}>{previewTour.destination}</Text>
            </View>
            <View className="mt-3 flex-row items-center gap-3">
              <Calendar size={18} color="#2A55D4" />
              <Text className={`text-base ${primary}`}>
                {formatDateTime(previewTour.start_at)}
                {previewTour.duration_days ? ` · ${previewTour.duration_days} day${previewTour.duration_days > 1 ? 's' : ''}` : ''}
              </Text>
            </View>
            <View className="mt-3 flex-row items-center gap-3">
              <Users size={18} color="#2A55D4" />
              <Text className={`text-base ${primary}`}>
                {previewTour.rider_count}
                {previewTour.seats_total ? `/${previewTour.seats_total}` : ''} joined
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <Text className={`text-base font-semibold ${primary}`}>{previewTour.organizer_display_name}</Text>
            {previewTour.organizer_verified ? <BadgeCheck size={16} color="#179B67" /> : null}
          </View>

          {previewTour.interest_tags.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {previewTour.interest_tags.map((tag) => (
                <View key={tag} className={`rounded-full px-3 py-1.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                  <Text className="text-xs font-semibold text-[#2A55D4]">{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {previewTour.notes ? (
            <View className={`rounded-[22px] border p-4 ${card}`}>
              <Text className={`text-base ${secondary}`}>{previewTour.notes}</Text>
            </View>
          ) : null}

          {itinerary.length > 0 ? (
            <View className="gap-3">
              <Text className={`text-headline-18 font-bold ${primary}`}>Daily Itinerary</Text>
              {itinerary.map((day) => (
                <View key={day.id} className={`rounded-2xl border p-4 ${card}`}>
                  <Text className={`text-[13px] font-bold ${secondary}`}>DAY {day.day_number}</Text>
                  <Text className={`mt-1 text-base ${primary}`}>{day.description}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View className="rounded-[22px] bg-[#2A55D4] p-5">
            <View className="flex-row items-center gap-2">
              <Sparkles size={18} color="#FFFFFF" />
              <Text className="text-sm font-semibold text-white/80">Price per person</Text>
            </View>
            <Text className="mt-2 text-[36px] font-black text-white">{formatCurrency(previewTour.price_per_person)}</Text>
          </View>

          <TouchableOpacity onPress={handleJoinTour} disabled={joining} className="items-center rounded-2xl bg-[#2A55D4] py-4">
            {joining ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-base font-bold text-white">Join Tour</Text>}
          </TouchableOpacity>
        </ScrollView>
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

  const isTour = detail.trip_type === 'tour';
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
        <View
          className="self-start rounded-full px-4 py-1.5"
          style={{ backgroundColor: isDark ? `${STATUS_COLORS[detail.status]}22` : `${STATUS_COLORS[detail.status]}1A` }}
        >
          <Text className="text-sm font-bold" style={{ color: STATUS_COLORS[detail.status] }}>
            {detail.status.charAt(0).toUpperCase() + detail.status.slice(1)}
          </Text>
        </View>

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
            <Text className="text-sm font-semibold text-white/80">{isTour ? 'Price per person' : 'Live price per person'}</Text>
          </View>
          <Text className="mt-2 text-[36px] font-black text-white">{formatCurrency(detail.price_per_person ?? detail.total_cost)}</Text>
          {isTour ? (
            <Text className="mt-1 text-sm text-white/80">
              {detail.rider_count}
              {detail.seats_total ? `/${detail.seats_total}` : ''} participants joined
            </Text>
          ) : (
            <Text className="mt-1 text-sm text-white/80">
              Total {formatCurrency(detail.total_cost)} split {Math.max(detail.rider_count, 1)} way{detail.rider_count === 1 ? '' : 's'} — invite more friends to
              lower everyone&apos;s share.
            </Text>
          )}
        </View>

        {isTour && (detail.interest_tags.length > 0 || itinerary.length > 0) ? (
          <View className="gap-3">
            {detail.interest_tags.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {detail.interest_tags.map((tag) => (
                  <View key={tag} className={`rounded-full px-3 py-1.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
                    <Text className="text-xs font-semibold text-[#2A55D4]">{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {itinerary.length > 0 ? (
              <View className="gap-3">
                <Text className={`text-headline-18 font-bold ${primary}`}>Daily Itinerary</Text>
                {itinerary.map((day) => (
                  <View key={day.id} className={`rounded-2xl border p-4 ${card}`}>
                    <Text className={`text-[13px] font-bold ${secondary}`}>DAY {day.day_number}</Text>
                    <Text className={`mt-1 text-base ${primary}`}>{day.description}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

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

        {detail.status === 'completed' ? (
          <View className="gap-3">
            <Text className={`text-headline-18 font-bold ${primary}`}>Rate your travel companions</Text>
            {members
              .filter((member) => member.status === 'accepted' && member.user_id !== session?.user.id)
              .map((member) => {
                const given = givenRatings.get(member.user_id);
                return (
                  <View key={member.id} className={`flex-row items-center gap-3 rounded-2xl border p-4 ${card}`}>
                    <Text className={`flex-1 text-base font-bold ${primary}`}>{member.display_name}</Text>
                    {given ? (
                      <View className="flex-row items-center gap-1">
                        <Star size={16} color="#F5A623" fill="#F5A623" />
                        <Text className={`text-sm font-bold ${primary}`}>{given.rating}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => setRateTarget({ userId: member.user_id, displayName: member.display_name })}
                      className={`rounded-2xl border px-4 py-2.5 ${border}`}
                    >
                      <Text className="font-bold text-[#2A55D4]">{given ? 'Edit' : 'Rate'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
          </View>
        ) : null}

        {detail.is_driver ? (
          <>
            <View className={`rounded-[22px] border p-4 ${card}`}>
              <View className="flex-row items-center justify-between">
                <Text className={`text-headline-18 font-bold ${primary}`}>Your Payment Info</Text>
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
                <Text className={`text-headline-18 font-bold ${primary}`}>Pending requests ({pendingRequests.length})</Text>
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
                <Text className={`text-headline-18 font-bold ${primary}`}>Awaiting confirmation ({awaitingConfirmation.length})</Text>
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
                <Text className={`text-headline-18 font-bold ${primary}`}>{isTour ? 'Participants' : 'Riders'} ({settledRiders.length})</Text>
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
                      <TouchableOpacity
                        onPress={() => setReportTarget({ userId: member.user_id, displayName: member.display_name })}
                        className="ml-2 h-9 w-9 items-center justify-center"
                        accessibilityLabel={`Report ${member.display_name}`}
                      >
                        <Flag size={16} color={isDark ? '#94A3B8' : '#6C7A95'} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {detail.status === 'open' || detail.status === 'full' ? (
              <TouchableOpacity onPress={() => void handleStart()} disabled={busyId === 'start'} className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#2A55D4] py-3.5">
                {busyId === 'start' ? <ActivityIndicator color="#FFFFFF" /> : <Check size={18} color="#FFFFFF" />}
                <Text className="font-bold text-white">Start Trip</Text>
              </TouchableOpacity>
            ) : null}

            {detail.status === 'ongoing' ? (
              <TouchableOpacity onPress={confirmComplete} disabled={busyId === 'complete'} className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#19A06B] py-3.5">
                {busyId === 'complete' ? <ActivityIndicator color="#FFFFFF" /> : <Check size={18} color="#FFFFFF" />}
                <Text className="font-bold text-white">Complete Trip</Text>
              </TouchableOpacity>
            ) : null}

            {detail.status !== 'completed' && detail.status !== 'cancelled' ? (
              <TouchableOpacity onPress={confirmCancel} disabled={busyId === 'cancel'} className="items-center rounded-2xl border border-[#E32727] py-3.5">
                <Text className="font-bold text-[#E32727]">Cancel Trip</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : detail.my_status === 'pending' ? (
          <View className={`items-center rounded-[22px] border p-6 ${card}`}>
            <Text className={`text-center text-base ${secondary}`}>Your request to join is pending the driver&apos;s approval.</Text>
          </View>
        ) : (
          <>
            {detail.my_payment_status !== 'paid' ? (
              <View className={`rounded-[22px] border p-4 ${card}`}>
                <View className="flex-row items-center gap-2">
                  <Wallet size={18} color="#2A55D4" />
                  <Text className={`text-headline-18 font-bold ${primary}`}>Pay Instantly (Sandbox)</Text>
                </View>
                <Text className={`mt-2 text-sm ${secondary}`}>
                  Pay your share ({formatCurrency(detail.my_payment_amount ?? detail.price_per_person)}) through PayMongo. Sandbox/test mode — no real money
                  moves.
                </Text>
                <View className="mt-3 flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => handleGatewayPayment('gcash')}
                    disabled={busyId === 'gateway-gcash' || busyId === 'gateway-paymaya'}
                    className="flex-1 items-center rounded-2xl bg-[#2A55D4] py-3.5"
                  >
                    {busyId === 'gateway-gcash' ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center font-bold text-white">Pay with GCash</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleGatewayPayment('paymaya')}
                    disabled={busyId === 'gateway-gcash' || busyId === 'gateway-paymaya'}
                    className="flex-1 items-center rounded-2xl bg-[#2A55D4] py-3.5"
                  >
                    {busyId === 'gateway-paymaya' ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center font-bold text-white">Pay with PayMaya</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <View className={`rounded-[22px] border p-4 ${card}`}>
              <View className="flex-row items-center gap-2">
                <Wallet size={18} color="#2A55D4" />
                <Text className={`text-headline-18 font-bold ${primary}`}>{isTour ? 'Pay the Organizer' : 'Pay the Driver'}</Text>
              </View>
              <Text className={`mt-2 text-sm ${secondary}`}>
                Send payment directly to the {isTour ? 'organizer' : 'driver'} via GCash or PayMaya, then report it below. PartyUp does not process the payment
                — it only records it.
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
                <Text className={`text-center text-base ${secondary}`}>
                  {detail.my_payment_channel === 'gateway' ? 'Verifying with PayMongo…' : 'Waiting for the driver to confirm your payment.'}
                </Text>
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

      <ReportUserModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        isDark={isDark}
        reportedUserId={reportTarget?.userId}
        tripId={id}
        targetDisplayName={reportTarget?.displayName ?? ''}
      />

      {rateTarget ? (
        <RateUserModal
          visible={!!rateTarget}
          onClose={() => setRateTarget(null)}
          isDark={isDark}
          targetUserId={rateTarget.userId}
          tripId={id}
          targetDisplayName={rateTarget.displayName}
          initialRating={givenRatings.get(rateTarget.userId)?.rating}
          initialComment={givenRatings.get(rateTarget.userId)?.comment}
          onSubmitted={(rating, comment) => {
            setGivenRatings((current) => new Map(current).set(rateTarget.userId, { target_user_id: rateTarget.userId, rating, comment }));
          }}
        />
      ) : null}
    </View>
  );
}
