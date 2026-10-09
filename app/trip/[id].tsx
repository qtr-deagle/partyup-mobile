import { UserRankTag } from '@/components/guild/UserRankTag';
import { RateUserModal } from '@/components/RateUserModal';
import { TripReviewsModal, type ReviewTarget } from '@/components/TripReviewsModal';
import { SuccessOverlay } from '@/components/ui/motion';
import { ReportUserModal } from '@/components/ReportUserModal';
import TripMeetupCard from '@/components/TripMeetupCard';
import {
  Avatar,
  HeroIconButton,
  KeyValue,
  RouteTimeline,
  Section,
  StatRow,
  TRIP_BLUE,
  TripHero,
  tripPalette,
  TripVehicleCard,
} from '@/components/trip/TripDetailParts';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import {
  buildInviteUrl,
  cancelTrip,
  completeTrip,
  formatCurrency,
  getTripDetail,
  getTripInviteLink,
  leaveTrip,
  listTripMembers,
  paymentStatusColors,
  CARPOOL_PLATFORM_FEE_RATE,
  PLATFORM_FEE_RATE,
  splitPlatformFee,
  respondToJoinRequest,
  startGatewayPayment,
  startTrip,
  type TripDetail,
  type TripMember,
} from '@/lib/carpool';
import { formatClockTime, parseTimestamp } from '@/lib/datetime';
import { getTripVehicle, type TripVehicle } from '@/lib/vehicles';
import { listMyGivenRatings, type GivenRating } from '@/lib/ratings';
import { feedback } from '@/lib/sounds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { getTourDetail, joinPublicTrip, listTripItinerary, type ItineraryDay, type TourDetail } from '@/lib/tours';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  BadgeCheck,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Flag,
  Info,
  MessageCircle,
  Navigation,
  Route,
  Share2,
  Star,
  Users,
  Wallet,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Share, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
function parseDate(value: string | null) {
  if (!value) return null;
  const date = parseTimestamp(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDay(value: string | null) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : 'TBD';
}

function formatTime(value: string | null) {
  const date = parseDate(value);
  return date ? formatClockTime(date) : 'Time TBD';
}

function TagList({ tags, isDark }: { tags: string[]; isDark: boolean }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {tags.map((tag) => (
        <View key={tag} className="rounded-full px-3 py-1.5" style={{ backgroundColor: isDark ? '#18253C' : '#EEF3FF' }}>
          <Text className="text-xs font-bold" style={{ color: isDark ? '#A5B8FF' : TRIP_BLUE }}>{tag}</Text>
        </View>
      ))}
    </View>
  );
}

/** Pinned bottom action area. */
function BottomBar({ children, bottomInset, isDark }: { children: ReactNode; bottomInset: number; isDark: boolean }) {
  return (
    <View
      className="absolute bottom-0 left-0 right-0 border-t px-4 pt-3"
      style={{
        paddingBottom: bottomInset + 12,
        backgroundColor: isDark ? '#0B1220' : '#FFFFFF',
        borderColor: isDark ? '#1E2A40' : '#E8ECF4',
      }}>
      {children}
    </View>
  );
}

function PrimaryButton({
  label,
  icon,
  onPress,
  busy,
  disabled,
  color = TRIP_BLUE,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  const off = disabled || busy;
  return (
    <TouchableOpacity onPress={onPress} disabled={off} activeOpacity={0.85}>
      <View
        className="flex-row items-center justify-center gap-2 rounded-2xl py-4"
        style={{ backgroundColor: disabled ? '#9AA6C2' : color }}>
        {busy ? <ActivityIndicator color="#FFFFFF" /> : icon}
        <Text className="text-[16px] font-extrabold text-white">{label}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TripDetailScreen() {
  const router = useRouter();
  // `celebrate` is set by the create/join screens that redirect here.
  const { id, celebrate } = useLocalSearchParams<{ id: string; celebrate?: 'created' | 'joined' | 'requested' }>();
  const { session } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const palette = tripPalette(isDark);

  const [detail, setDetail] = useState<TripDetail | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [previewTour, setPreviewTour] = useState<TourDetail | null>(null);
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [celebration, setCelebration] = useState<{ title: string; message: string } | null>(() =>
    celebrate === 'created'
      ? { title: 'Trip created!', message: 'Share your invite link so riders can join.' }
      : celebrate === 'joined'
        ? { title: "You're in!", message: 'Your seat is confirmed. See you on the road.' }
        : celebrate === 'requested'
          ? { title: 'Request sent', message: "The driver will review it. We'll notify you when they respond." }
          : null,
  );
  const endCelebration = useCallback(() => {
    setCelebration(null);
    // Drop the param so returning to this screen doesn't replay it.
    router.setParams({ celebrate: undefined });
  }, [router]);
  const [givenRatings, setGivenRatings] = useState<Map<string, GivenRating>>(new Map());
  const [reportTarget, setReportTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const [paymentReportOpen, setPaymentReportOpen] = useState(false);
  const [rateTarget, setRateTarget] = useState<{ userId: string; displayName: string } | null>(null);
  // Companions to walk through in the post-trip review prompt. Snapshotted
  // when it opens so rating someone doesn't reshuffle the steps.
  const [reviewTargets, setReviewTargets] = useState<ReviewTarget[] | null>(null);
  const reviewPromptChecked = useRef(false);
  const [tripVehicle, setTripVehicle] = useState<TripVehicle | null>(null);

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
        setTripVehicle(null);
      } else {
        setItinerary([]);
        const vehicleResult = await getTripVehicle(id);
        setTripVehicle(vehicleResult.data);
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
  const { refreshControl } = usePullToRefresh(load);

  async function handleJoinTour() {
    if (!id) {
      return;
    }
    setJoining(true);
    const { error } = await joinPublicTrip(id);
    setJoining(false);
    if (error) {
      feedback.error();
      showAlert('Unable to join tour', error.message);
      return;
    }
    await load();
    setCelebration({ title: "You're in!", message: 'Welcome to the tour. Your spot is saved.' });
  }

  // Live refresh once a gateway payment's webhook lands, so a rider/driver
  // sees payment_status flip to 'paid' without backgrounding the app.
  useEffect(() => {
    if (!id) {
      return;
    }
    const channel = supabase
      .channel(uniqueChannelName(`trip-members:${id}`))
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

  // Once a trip is completed, pop the review prompt a single time per trip
  // (per phone). Waits for ratings to load and for any celebration to finish
  // so the driver sees "Trip complete!" first.
  useEffect(() => {
    if (!id || loading || celebration || reviewPromptChecked.current || detail?.status !== 'completed') {
      return;
    }
    const unrated = members
      .filter((member) => member.status === 'accepted' && member.user_id !== session?.user.id && !givenRatings.has(member.user_id))
      .map((member) => ({ userId: member.user_id, displayName: member.display_name, avatarUrl: member.avatar_url }));
    reviewPromptChecked.current = true;
    if (!unrated.length) {
      return;
    }
    const key = `partyup.trip-review-prompted.${id}`;
    void (async () => {
      try {
        if (await AsyncStorage.getItem(key)) {
          return;
        }
        await AsyncStorage.setItem(key, '1');
      } catch {
        return;
      }
      setReviewTargets(unrated);
    })();
  }, [id, loading, celebration, detail?.status, members, givenRatings, session?.user.id]);

  async function handleShareInvite() {
    if (!id || !session?.user.id) {
      return;
    }
    setBusyId('share');
    const { data, error } = await getTripInviteLink(id);
    setBusyId(null);
    if (error || !data) {
      feedback.error();
      showAlert('Unable to get invite link', error?.message ?? 'Please try again.');
      return;
    }
    const url = buildInviteUrl(data.invite_code, session.user.id);
    await Share.share({ message: `Join my carpool "${data.trip_title}" on PartyUp: ${url}`, url });
  }

  // Decline sits right next to Accept, so a mis-tap shouldn't turn someone away.
  function confirmDecline(memberId: string, name: string) {
    showAlert(`Decline ${name}?`, "They'll be told their request wasn't accepted.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => void handleRespond(memberId, 'rejected') },
    ]);
  }

  async function handleRespond(memberId: string, status: 'accepted' | 'rejected') {
    setBusyId(memberId);
    const { error } = await respondToJoinRequest(memberId, status);
    if (error) {
      feedback.error();
      showAlert('Unable to update request', error.message);
    } else {
      if (status === 'accepted') {
        feedback.success();
      }
      await load();
    }
    setBusyId(null);
  }

  async function handleGatewayPayment(method: 'gcash' | 'paymaya') {
    if (!id) {
      return;
    }
    setBusyId(`gateway-${method}`);
    const { data, error } = await startGatewayPayment(id, method);
    if (error || !data) {
      feedback.error();
      showAlert('Unable to start payment', error?.message ?? 'Please try again.');
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
    showAlert('Leave trip?', 'You will lose your seat on this trip.', [
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
      feedback.error();
      showAlert('Unable to leave trip', error.message);
    } else {
      router.back();
    }
  }

  function confirmCancel() {
    showAlert('Cancel this trip?', 'All riders will be notified.', [
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
      feedback.error();
      showAlert('Unable to cancel trip', error.message);
    } else {
      router.back();
    }
  }

  function confirmStart() {
    showAlert('Start this trip now?', 'Everyone on this trip will be notified that it has started. Make sure your companions are with you before you go.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Start trip', onPress: () => void handleStart() },
    ]);
  }

  async function handleStart() {
    if (!id) {
      return;
    }
    setBusyId('start');
    const { error } = await startTrip(id);
    setBusyId(null);
    if (error) {
      feedback.error();
      showAlert('Unable to start trip', error.message);
    } else {
      feedback.success();
      void load();
    }
  }

  function confirmComplete() {
    showAlert('Mark this trip complete?', 'Riders will be able to rate each other once the trip is marked complete.', [
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
      feedback.error();
      showAlert('Unable to complete trip', error.message);
    } else {
      setCelebration({ title: 'Trip complete!', message: 'Nice ride. You can now rate your travel buddies.' });
      void load();
    }
  }


  if (loading && !detail && !previewTour) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: palette.background }}>
        <ActivityIndicator color={TRIP_BLUE} />
      </View>
    );
  }

  if (!detail && previewTour) {
    return (
      <View className="flex-1" style={{ backgroundColor: palette.background }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}>
          <TripHero
            topInset={insets.top}
            onBack={() => router.back()}
            typeLabel="Tour"
            status={previewTour.status}
            title={previewTour.title}
            origin={previewTour.origin}
            destination={previewTour.destination}
            stopCount={0}
          />
          <StatRow
            palette={palette}
            items={[
              { icon: <Calendar size={18} color={palette.accent} />, label: formatTime(previewTour.start_at), value: formatDay(previewTour.start_at) },
              {
                icon: <Users size={18} color={palette.accent} />,
                label: 'Joined',
                value: `${previewTour.rider_count}${previewTour.seats_total ? `/${previewTour.seats_total}` : ''}`,
              },
              { icon: <Wallet size={18} color={palette.accent} />, label: 'Per person', value: formatCurrency(previewTour.price_per_person) },
            ]}
          />

          <View className="mt-4 gap-4 px-4">
            <Section palette={palette} title="Organizer">
              <View className="flex-row items-center gap-3">
                <Avatar name={previewTour.organizer_display_name} url={previewTour.organizer_avatar_url} size={46} />
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="text-[16px] font-bold" style={{ color: palette.primary }}>{previewTour.organizer_display_name}</Text>
                    {previewTour.organizer_verified ? <BadgeCheck size={16} color="#179B67" /> : null}
                  </View>
                  <UserRankTag userId={previewTour.organizer_id} isDark={isDark} />
                </View>
              </View>
            </Section>

            {previewTour.notes || previewTour.interest_tags.length > 0 ? (
              <Section palette={palette} icon={<Info size={18} color={palette.accent} />} title="About this tour">
                {previewTour.notes ? <Text className="mb-3 text-[14px] leading-5" style={{ color: palette.secondary }}>{previewTour.notes}</Text> : null}
                {previewTour.interest_tags.length > 0 ? <TagList tags={previewTour.interest_tags} isDark={isDark} /> : null}
              </Section>
            ) : null}

            {itinerary.length > 0 ? (
              <Section palette={palette} icon={<Route size={18} color={palette.accent} />} title="Daily itinerary">
                <View className="gap-2.5">
                  {itinerary.map((day) => (
                    <View key={day.id} className="flex-row gap-3 rounded-2xl p-3" style={{ backgroundColor: palette.soft }}>
                      <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: TRIP_BLUE }}>
                        <Text className="text-[13px] font-black text-white">{day.day_number}</Text>
                      </View>
                      <Text className="flex-1 text-[14px] leading-5" style={{ color: palette.primary }}>{day.description}</Text>
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}
          </View>
        </ScrollView>

        <BottomBar bottomInset={insets.bottom} isDark={isDark}>
          <PrimaryButton label="Join Tour" onPress={() => void handleJoinTour()} busy={joining} icon={<Check size={18} color="#FFFFFF" />} />
        </BottomBar>
      </View>
    );
  }

  if (!detail) {
    return (
      <View className="flex-1 items-center justify-center gap-4 px-6" style={{ backgroundColor: palette.background }}>
        <Text className="text-center text-base" style={{ color: palette.secondary }}>{errorMessage ?? 'Trip not found.'}</Text>
        <TouchableOpacity onPress={() => router.back()} className="rounded-2xl px-5 py-3" style={{ backgroundColor: TRIP_BLUE }}>
          <Text className="font-bold text-white">Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isTour = detail.trip_type === 'tour';
  const pendingRequests = members.filter((m) => m.status === 'pending');
  const acceptedRiders = members.filter((m) => m.member_role === 'member' && m.status === 'accepted');
  // Carpool riders pay their accepted fuel contribution to the driver plus a
  // PartyUp fee on top; tour participants pay the organizer's price, from
  // which PartyUp keeps its fee.
  const isFuelShare = !isTour;
  const riderFare = (member: TripMember) =>
    isFuelShare ? (member.offered_amount ?? 0) : (member.payment_amount ?? detail.price_per_person ?? 0);
  const expectedTotal = acceptedRiders.reduce((sum, member) => sum + riderFare(member), 0);
  const collectedTotal = acceptedRiders.filter((m) => m.payment_status === 'paid').reduce((sum, member) => sum + riderFare(member), 0);
  const earnings = isFuelShare ? { fee: 0, net: collectedTotal } : splitPlatformFee(collectedTotal);
  const feePercent = `${Math.round((isFuelShare ? CARPOOL_PLATFORM_FEE_RATE : PLATFORM_FEE_RATE) * 100)}%`;
  const myTotalDue = detail.my_payment_amount ?? (detail.my_offered_amount != null ? detail.my_offered_amount + (detail.my_platform_fee ?? 0) : detail.price_per_person);

  const isActive = detail.status !== 'completed' && detail.status !== 'cancelled';
  const canChat = detail.is_driver || detail.my_status === 'accepted';
  const notStarted = detail.status === 'open' || detail.status === 'full';
  // A carpool needs at least one accepted rider to start (start_trip enforces it too).
  const needsRider = !isTour && acceptedRiders.length === 0;
  const peopleNoun = isTour ? 'Participants' : 'Riders';

  const routePoints = [
    { label: detail.origin, kind: 'start' as const },
    ...(!isTour ? (detail.route_stops ?? []).map((stop) => ({ label: stop.label, kind: 'stop' as const })) : []),
    { label: detail.destination, kind: 'end' as const },
  ];

  const moneyStat = isFuelShare
    ? detail.is_driver
      ? { label: 'Fuel pool', value: formatCurrency(expectedTotal) }
      : { label: 'Your share', value: formatCurrency(myTotalDue) }
    : { label: 'Per person', value: formatCurrency(detail.price_per_person ?? detail.total_cost) };

  const bottomAction = detail.is_driver
    ? notStarted
      ? 'start'
      : detail.status === 'ongoing'
        ? 'complete'
        : null
    : canChat && isActive
      ? 'chat'
      : null;

  return (
    <View className="flex-1" style={{ backgroundColor: palette.background }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + (bottomAction ? 150 : 48) }}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}>
        <TripHero
          topInset={insets.top}
          onBack={() => router.back()}
          typeLabel={isTour ? 'Tour' : 'Carpool'}
          status={detail.status}
          title={detail.title}
          origin={detail.origin}
          destination={detail.destination}
          stopCount={isTour ? 0 : (detail.route_stops?.length ?? 0)}
          actions={
            <>
              {canChat ? (
                <HeroIconButton label="Open group chat" onPress={() => router.push({ pathname: '/trip/chat/[id]', params: { id: detail.id } })}>
                  <MessageCircle size={19} color="#FFFFFF" />
                </HeroIconButton>
              ) : null}
              {isActive ? (
                <HeroIconButton label="Share invite link" onPress={() => void handleShareInvite()}>
                  {busyId === 'share' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Share2 size={19} color="#FFFFFF" />}
                </HeroIconButton>
              ) : null}
            </>
          }
        />

        <StatRow
          palette={palette}
          items={[
            { icon: <Calendar size={18} color={palette.accent} />, label: formatTime(detail.start_at), value: formatDay(detail.start_at) },
            {
              icon: <Users size={18} color={palette.accent} />,
              label: peopleNoun,
              value: `${acceptedRiders.length || detail.rider_count}${detail.seats_total ? `/${detail.seats_total}` : ''}`,
            },
            { icon: <Wallet size={18} color={palette.accent} />, ...moneyStat },
          ]}
        />

        <View className="mt-4 gap-4 px-4">
          {errorMessage ? (
            <View className="rounded-2xl bg-[#FEE2E2] px-4 py-3">
              <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
            </View>
          ) : null}

          {detail.my_invited_by_display_name ? (
            <View className="flex-row items-center gap-2 rounded-2xl px-4 py-3" style={{ backgroundColor: palette.soft }}>
              <Users size={15} color={palette.accent} />
              <Text className="text-[13px]" style={{ color: palette.secondary }}>
                Invited by <Text className="font-bold" style={{ color: palette.primary }}>{detail.my_invited_by_display_name}</Text>
              </Text>
            </View>
          ) : null}

          {/* Driver: pending join requests come first, they need action. */}
          {detail.is_driver && pendingRequests.length ? (
            <Section
              palette={palette}
              icon={<Clock size={18} color="#B4650B" />}
              title="Join requests"
              right={
                <View className="rounded-full bg-[#FFF3E0] px-2.5 py-0.5">
                  <Text className="text-[12px] font-black text-[#B4650B]">{pendingRequests.length}</Text>
                </View>
              }>
              <View className="gap-3">
                {pendingRequests.map((member) => (
                  <View key={member.id} className="rounded-2xl p-3" style={{ backgroundColor: palette.soft }}>
                    <View className="flex-row items-center gap-3">
                      <Avatar name={member.display_name} url={member.avatar_url} />
                      <View className="flex-1">
                        <Text className="text-[15px] font-bold" style={{ color: palette.primary }} numberOfLines={1}>{member.display_name}</Text>
                        <UserRankTag userId={member.user_id} isDark={isDark} />
                      </View>
                      {member.offered_amount != null ? (
                        <View className="items-end">
                          <Text className="text-[15px] font-black" style={{ color: palette.accent }}>{formatCurrency(member.offered_amount)}</Text>
                          <Text className="text-[11px]" style={{ color: palette.secondary }}>for fuel</Text>
                        </View>
                      ) : null}
                    </View>
                    {member.pickup_label || member.invited_by_display_name ? (
                      <Text className="mt-2 text-[12.5px]" style={{ color: palette.secondary }}>
                        {[member.pickup_label ? `Pickup: ${member.pickup_label}` : null, member.invited_by_display_name ? `Invited by ${member.invited_by_display_name}` : null]
                          .filter(Boolean)
                          .join('  ·  ')}
                      </Text>
                    ) : null}
                    <View className="mt-3 flex-row gap-2">
                      <TouchableOpacity className="flex-1" onPress={() => confirmDecline(member.id, member.display_name)} disabled={busyId === member.id}>
                        <View className="flex-row items-center justify-center gap-1.5 rounded-xl border py-2.5" style={{ borderColor: palette.border, backgroundColor: palette.card }}>
                          <X size={15} color="#B91C1C" />
                          <Text className="font-bold text-[#B91C1C]">Decline</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity className="flex-1" onPress={() => void handleRespond(member.id, 'accepted')} disabled={busyId === member.id}>
                        <View className="flex-row items-center justify-center gap-1.5 rounded-xl py-2.5" style={{ backgroundColor: TRIP_BLUE }}>
                          {busyId === member.id ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Check size={15} color="#FFFFFF" />}
                          <Text className="font-bold text-white">Accept</Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {/* Rider: request still waiting on the driver. */}
          {!detail.is_driver && detail.my_status === 'pending' ? (
            <View className="flex-row items-start gap-3 rounded-3xl p-4" style={{ backgroundColor: isDark ? '#1A2850' : '#EAF0FF' }}>
              <Clock size={20} color={palette.accent} />
              <View className="flex-1">
                <Text className="text-[15px] font-extrabold" style={{ color: palette.primary }}>Request sent</Text>
                <Text className="mt-1 text-[13px] leading-5" style={{ color: palette.secondary }}>
                  The driver will review it. We&apos;ll notify you when they respond.
                </Text>
                <TouchableOpacity onPress={confirmLeave} disabled={busyId === 'leave'} className="mt-3 self-start">
                  <Text className="text-[13px] font-bold text-[#E32727]">Cancel request</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <TripMeetupCard detail={detail} isDark={isDark} />

          {tripVehicle && !isTour ? <TripVehicleCard vehicle={tripVehicle} palette={palette} isDriver={detail.is_driver} /> : null}

          {routePoints.length > 2 ? (
            <Section palette={palette} icon={<Route size={18} color={palette.accent} />} title="Route">
              <RouteTimeline points={routePoints} palette={palette} />
            </Section>
          ) : null}

          {/* Money */}
          {isFuelShare ? (
            <Section palette={palette} icon={<Wallet size={18} color={palette.accent} />} title={detail.is_driver ? 'Fuel sharing' : 'Your contribution'}>
              {detail.is_driver ? (
                <>
                  <Text className="text-[30px] font-black" style={{ color: palette.primary }}>{formatCurrency(expectedTotal)}</Text>
                  <Text className="mt-1 text-[13px] leading-5" style={{ color: palette.secondary }}>
                    From {acceptedRiders.length} accepted rider{acceptedRiders.length === 1 ? '' : 's'}. Riders offer a contribution and you choose who rides.
                  </Text>
                  {acceptedRiders.length ? (
                    <View className="mt-3 border-t pt-2" style={{ borderColor: palette.border }}>
                      <KeyValue palette={palette} label="Collected" value={`${formatCurrency(collectedTotal)} of ${formatCurrency(expectedTotal)}`} />
                      <KeyValue palette={palette} label="You receive" value={formatCurrency(earnings.net)} valueColor="#19A06B" bold />
                      <Text className="mt-1 text-[12px]" style={{ color: palette.secondary }}>
                        Riders pay the {feePercent} PartyUp fee on top, so you keep the full contribution. Test mode: no payouts yet.
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <KeyValue palette={palette} label="Fuel contribution" value={formatCurrency(detail.my_offered_amount)} />
                  <KeyValue palette={palette} label={`PartyUp fee (${feePercent})`} value={formatCurrency(detail.my_platform_fee)} />
                  <View className="mt-1 border-t pt-1" style={{ borderColor: palette.border }}>
                    <KeyValue palette={palette} label="Total" value={formatCurrency(myTotalDue)} bold />
                  </View>
                  {detail.my_pickup_label ? (
                    <Text className="mt-2 text-[13px]" style={{ color: palette.secondary }}>Pickup: {detail.my_pickup_label}</Text>
                  ) : null}
                </>
              )}
            </Section>
          ) : (
            <Section palette={palette} icon={<Wallet size={18} color={palette.accent} />} title="Price">
              <Text className="text-[30px] font-black" style={{ color: palette.primary }}>{formatCurrency(detail.price_per_person ?? detail.total_cost)}</Text>
              <Text className="mt-1 text-[13px]" style={{ color: palette.secondary }}>
                per person · {detail.rider_count}
                {detail.seats_total ? `/${detail.seats_total}` : ''} joined
              </Text>
              {detail.is_driver && acceptedRiders.length ? (
                <View className="mt-3 border-t pt-2" style={{ borderColor: palette.border }}>
                  <KeyValue palette={palette} label="Collected" value={`${formatCurrency(collectedTotal)} of ${formatCurrency(expectedTotal)}`} />
                  <KeyValue palette={palette} label={`PartyUp fee (${feePercent})`} value={`−${formatCurrency(earnings.fee)}`} valueColor="#E32727" />
                  <KeyValue palette={palette} label="You receive" value={formatCurrency(earnings.net)} valueColor="#19A06B" bold />
                  <Text className="mt-1 text-[12px]" style={{ color: palette.secondary }}>Test mode: shown for illustration. No payouts are made yet.</Text>
                </View>
              ) : null}
            </Section>
          )}

          {/* Rider: pay */}
          {!detail.is_driver && detail.my_status === 'accepted' ? (
            detail.my_payment_status === 'paid' ? (
              <View className="flex-row items-center gap-3 rounded-3xl p-4" style={{ backgroundColor: isDark ? '#0F2A20' : '#E8F7EF' }}>
                <CheckCircle2 size={24} color="#19A06B" />
                <Text className="flex-1 text-[15px] font-bold" style={{ color: isDark ? '#86EFAC' : '#0F7B4B' }}>
                  Payment confirmed. You&apos;re all set!
                </Text>
              </View>
            ) : detail.my_payment_status === 'pending' ? (
              <View className="flex-row items-center gap-3 rounded-3xl p-4" style={{ backgroundColor: palette.soft }}>
                <ActivityIndicator color={palette.accent} />
                <Text className="flex-1 text-[14px]" style={{ color: palette.secondary }}>Verifying your payment with PayMongo…</Text>
              </View>
            ) : (
              <Section palette={palette} icon={<Wallet size={18} color={palette.accent} />} title={`Pay ${formatCurrency(myTotalDue)}`}>
                <Text className="text-[13px] leading-5" style={{ color: palette.secondary }}>
                  {isFuelShare
                    ? `Your fuel contribution goes to the driver, plus the ${feePercent} PartyUp fee. Paid securely through PayMongo.`
                    : `PartyUp keeps a ${feePercent} service fee and the rest goes to the organizer. Paid securely through PayMongo.`}{' '}
                  Test mode: no real money moves.
                </Text>
                <View className="mt-3 flex-row gap-2">
                  {(['gcash', 'paymaya'] as const).map((method) => (
                    <TouchableOpacity
                      key={method}
                      className="flex-1"
                      onPress={() => void handleGatewayPayment(method)}
                      disabled={busyId === 'gateway-gcash' || busyId === 'gateway-paymaya'}>
                      <View className="items-center rounded-2xl py-3.5" style={{ backgroundColor: method === 'gcash' ? '#0A6CFF' : '#0BB04F' }}>
                        {busyId === `gateway-${method}` ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text className="font-extrabold text-white">{method === 'gcash' ? 'GCash' : 'PayMaya'}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </Section>
            )
          ) : null}

          {/* Who's going */}
          <Section
            palette={palette}
            icon={<Users size={18} color={palette.accent} />}
            title="Who's going"
            right={
              <Text className="text-[13px] font-bold" style={{ color: palette.secondary }}>
                {acceptedRiders.length + 1}
                {detail.seats_total ? ` of ${detail.seats_total + 1}` : ''}
              </Text>
            }>
            <View className="gap-3">
              <View className="flex-row items-center gap-3">
                <Avatar name={detail.driver_display_name} url={detail.driver_avatar_url} size={44} />
                <View className="flex-1">
                  <Text className="text-[15px] font-bold" style={{ color: palette.primary }} numberOfLines={1}>
                    {detail.driver_display_name}
                    {detail.is_driver ? ' (you)' : ''}
                  </Text>
                  <UserRankTag userId={detail.driver_id} isDark={isDark} />
                </View>
                <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: isDark ? '#1A2850' : '#EAF0FF' }}>
                  <Text className="text-[11px] font-extrabold" style={{ color: palette.accent }}>{isTour ? 'Organizer' : 'Driver'}</Text>
                </View>
              </View>

              {acceptedRiders.map((member) => {
                const colors = paymentStatusColors(member.payment_status, isDark);
                const isMe = member.user_id === session?.user.id;
                return (
                  <View key={member.id} className="flex-row items-center gap-3">
                    <Avatar name={member.display_name} url={member.avatar_url} size={44} />
                    <View className="flex-1">
                      <Text className="text-[15px] font-bold" style={{ color: palette.primary }} numberOfLines={1}>
                        {member.display_name}
                        {isMe ? ' (you)' : ''}
                      </Text>
                      {detail.is_driver && member.offered_amount != null ? (
                        <Text className="text-[12px]" style={{ color: palette.secondary }} numberOfLines={1}>
                          {formatCurrency(member.offered_amount)} fuel{member.pickup_label ? ` · ${member.pickup_label}` : ''}
                        </Text>
                      ) : (
                        <UserRankTag userId={member.user_id} isDark={isDark} />
                      )}
                    </View>
                    {detail.is_driver ? (
                      <>
                        <View className={`rounded-full px-2.5 py-1 ${colors.bg}`}>
                          <Text className={`text-[11px] font-extrabold ${colors.text}`}>
                            {member.payment_status === 'paid' ? 'Paid' : member.payment_status === 'pending' ? 'Processing' : 'Unpaid'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setReportTarget({ userId: member.user_id, displayName: member.display_name })}
                          className="h-8 w-8 items-center justify-center"
                          accessibilityLabel={`Report ${member.display_name}`}>
                          <Flag size={15} color={palette.secondary} />
                        </TouchableOpacity>
                      </>
                    ) : null}
                  </View>
                );
              })}

              {acceptedRiders.length === 0 ? (
                <View className="flex-row items-center gap-3 rounded-2xl border border-dashed p-3" style={{ borderColor: palette.border }}>
                  <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: palette.soft }}>
                    <Users size={18} color={palette.secondary} />
                  </View>
                  <Text className="flex-1 text-[13px] leading-5" style={{ color: palette.secondary }}>
                    {isTour ? 'No participants yet.' : 'No riders yet.'}
                    {detail.is_driver && isActive ? ' Share your invite link to fill seats.' : ''}
                  </Text>
                </View>
              ) : null}
            </View>
          </Section>

          {isTour && (detail.interest_tags.length > 0 || itinerary.length > 0) ? (
            <Section palette={palette} icon={<Route size={18} color={palette.accent} />} title="Itinerary">
              {detail.interest_tags.length > 0 ? (
                <View className="mb-3">
                  <TagList tags={detail.interest_tags} isDark={isDark} />
                </View>
              ) : null}
              <View className="gap-2.5">
                {itinerary.map((day) => (
                  <View key={day.id} className="flex-row gap-3 rounded-2xl p-3" style={{ backgroundColor: palette.soft }}>
                    <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: TRIP_BLUE }}>
                      <Text className="text-[13px] font-black text-white">{day.day_number}</Text>
                    </View>
                    <Text className="flex-1 text-[14px] leading-5" style={{ color: palette.primary }}>{day.description}</Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {detail.status === 'completed' ? (
            <Section palette={palette} icon={<Star size={18} color="#F5A623" />} title="Rate your travel companions">
              <View className="gap-3">
                {members
                  .filter((member) => member.status === 'accepted' && member.user_id !== session?.user.id)
                  .map((member) => {
                    const given = givenRatings.get(member.user_id);
                    return (
                      <View key={member.id} className="flex-row items-center gap-3">
                        <Avatar name={member.display_name} url={member.avatar_url} />
                        <View className="flex-1">
                          <Text className="text-[15px] font-bold" style={{ color: palette.primary }} numberOfLines={1}>{member.display_name}</Text>
                          {given ? (
                            <View className="flex-row items-center gap-1">
                              <Star size={12} color="#F5A623" fill="#F5A623" />
                              <Text className="text-[12px] font-bold" style={{ color: palette.secondary }}>You rated {given.rating}</Text>
                            </View>
                          ) : (
                            <UserRankTag userId={member.user_id} isDark={isDark} />
                          )}
                        </View>
                        {/* Ratings are final (migration 202610090009), so a rated companion gets a badge, not a button. */}
                        {given ? (
                          <View className="flex-row items-center gap-1 rounded-full px-3.5 py-2" style={{ backgroundColor: palette.soft }}>
                            <Check size={13} color={palette.accent} />
                            <Text className="text-[13px] font-extrabold" style={{ color: palette.accent }}>Rated</Text>
                          </View>
                        ) : (
                          <TouchableOpacity onPress={() => setRateTarget({ userId: member.user_id, displayName: member.display_name })}>
                            <View className="rounded-full px-4 py-2" style={{ backgroundColor: TRIP_BLUE }}>
                              <Text className="text-[13px] font-extrabold" style={{ color: '#FFFFFF' }}>Rate</Text>
                            </View>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
              </View>
            </Section>
          ) : null}

          {/* Secondary actions */}
          <View className="items-center gap-4 pt-1">
            {detail.is_driver ? (
              acceptedRiders.length ? (
                <TouchableOpacity onPress={() => setPaymentReportOpen(true)} className="flex-row items-center gap-1.5">
                  <Flag size={14} color={palette.secondary} />
                  <Text className="text-[13px] font-bold" style={{ color: palette.secondary }}>Having a payment problem? Report it</Text>
                </TouchableOpacity>
              ) : null
            ) : detail.my_status === 'accepted' ? (
              <TouchableOpacity onPress={() => setPaymentReportOpen(true)} className="flex-row items-center gap-1.5">
                <Flag size={14} color={palette.secondary} />
                <Text className="text-[13px] font-bold" style={{ color: palette.secondary }}>Having a payment problem? Report it</Text>
              </TouchableOpacity>
            ) : null}

            {detail.is_driver && isActive ? (
              <TouchableOpacity onPress={confirmCancel} disabled={busyId === 'cancel'}>
                <Text className="text-[14px] font-bold text-[#E32727]">{busyId === 'cancel' ? 'Cancelling…' : 'Cancel trip'}</Text>
              </TouchableOpacity>
            ) : null}
            {!detail.is_driver && detail.my_status === 'accepted' && isActive ? (
              <TouchableOpacity onPress={confirmLeave} disabled={busyId === 'leave'}>
                <Text className="text-[14px] font-bold text-[#E32727]">{busyId === 'leave' ? 'Leaving…' : 'Leave trip'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {bottomAction ? (
        <BottomBar bottomInset={insets.bottom} isDark={isDark}>
          {bottomAction === 'start' ? (
            <>
              {needsRider ? (
                <View className="mb-2.5 flex-row items-center justify-center gap-1.5">
                  <Info size={14} color={palette.secondary} />
                  <Text className="text-[12.5px] font-semibold" style={{ color: palette.secondary }}>
                    Accept at least one rider to start the carpool
                  </Text>
                </View>
              ) : null}
              <PrimaryButton
                label="Start Trip"
                icon={<Navigation size={18} color="#FFFFFF" />}
                onPress={confirmStart}
                busy={busyId === 'start'}
                disabled={needsRider}
              />
            </>
          ) : bottomAction === 'complete' ? (
            <PrimaryButton
              label="Complete Trip"
              icon={<Check size={18} color="#FFFFFF" />}
              onPress={confirmComplete}
              busy={busyId === 'complete'}
              color="#19A06B"
            />
          ) : (
            <PrimaryButton
              label="Group Chat"
              icon={<MessageCircle size={18} color="#FFFFFF" />}
              onPress={() => router.push({ pathname: '/trip/chat/[id]', params: { id: detail.id } })}
            />
          )}
        </BottomBar>
      ) : null}

      <ReportUserModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        isDark={isDark}
        reportedUserId={reportTarget?.userId}
        tripId={id}
        targetDisplayName={reportTarget?.displayName ?? ''}
      />

      <ReportUserModal
        visible={paymentReportOpen}
        onClose={() => setPaymentReportOpen(false)}
        isDark={isDark}
        tripId={id}
        targetDisplayName={detail.title}
        variant="payment"
      />

      {rateTarget ? (
        <RateUserModal
          visible={!!rateTarget}
          onClose={() => setRateTarget(null)}
          isDark={isDark}
          targetUserId={rateTarget.userId}
          tripId={id}
          targetDisplayName={rateTarget.displayName}
          onSubmitted={(rating, comment) => {
            setGivenRatings((current) => new Map(current).set(rateTarget.userId, { target_user_id: rateTarget.userId, rating, comment }));
          }}
        />
      ) : null}

      <TripReviewsModal
        visible={!!reviewTargets}
        onClose={() => setReviewTargets(null)}
        isDark={isDark}
        tripId={id}
        tripTitle={detail.title}
        members={reviewTargets ?? []}
        onRated={(userId, rating, comment) => {
          setGivenRatings((current) => new Map(current).set(userId, { target_user_id: userId, rating, comment }));
        }}
      />

      <SuccessOverlay visible={!!celebration} title={celebration?.title ?? ''} message={celebration?.message} onDone={endCelebration} />
    </View>
  );
}
