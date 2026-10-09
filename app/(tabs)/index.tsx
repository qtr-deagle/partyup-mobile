import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { routeForNotification } from '@/components/InAppNotifier';
import { GuildSummaryCard } from '@/components/GuildSummaryCard';
import NotificationModal from '@/components/NotificationModal';
import PhoneRequiredModal from '@/components/PhoneRequiredModal';
import { HomeQuickActions } from '@/components/home/HomeQuickActions';
import { StatusChips, toneColors, type StatusTone } from '@/components/home/StatusChips';
import StaffDashboard from '@/components/StaffDashboard';
import TrustAwardCelebration from '@/components/TrustAwardCelebration';
import TrustScoreModal from '@/components/TrustScoreModal';
import { PopIn, riseIn } from '@/components/ui/motion';
import WarningModeModal from '@/components/WarningModeModal';
import { useHideTabBarOnScroll } from '@/components/ui/tab-bar-visibility';
import { useAuth } from '@/hooks/auth-provider';
import { useTrustAward } from '@/hooks/use-trust-award';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { startTrip } from '@/lib/carpool';
import { describeCountdown, formatTimeAgo, parseTimestamp } from '@/lib/datetime';
import {
  getActiveTripSummary,
  getLeaderGuildSnapshot,
  getSafetyOverview,
  getStaffOverview,
  type ActiveTripSummary,
  type LeaderGuildSnapshot,
  type SafetyOverview,
  type StaffOverview,
} from '@/lib/homeDashboard';
import { isLocationTrackingActive, requestLocationPermissions, startBackgroundLocationTracking, upsertCurrentLocation } from '@/lib/location';
import { listNotifications, markNotificationRead, type AppNotification } from '@/lib/notifications';
import { listIncomingFriendRequests, type IncomingFriendRequest } from '@/lib/social';
import { hasPhone } from '@/lib/phone';
import { feedback } from '@/lib/sounds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Bell, CarFront, ChevronRight, Clock, Info, MapPin, MessageCircle, Navigation, ShieldAlert, UserPlus, Users } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { showAlert } from '@/lib/dialog';
const TRIP_STATUS_LABELS: Record<ActiveTripSummary['status'], string> = {
  draft: 'Draft',
  open: 'Open for riders',
  full: 'Full',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const DASHBOARD_POLL_INTERVAL_MS = 45000;

function greeting() {
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Manila' }));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Dot color on the trip card, so status reads without the label.
const TRIP_STATUS_DOT: Record<ActiveTripSummary['status'], string> = {
  draft: '#94A3B8',
  open: '#34D399',
  full: '#FBBF24',
  ongoing: '#60A5FA',
  completed: '#94A3B8',
  cancelled: '#F87171',
};

// Each notification type gets its own icon and tint so Recent Activity can
// be scanned without reading the titles.
const ACTIVITY_STYLE: Record<AppNotification['type'], { icon: ComponentType<{ size?: number; color?: string }>; color: string }> = {
  trip: { icon: CarFront, color: '#3B82F6' },
  message: { icon: MessageCircle, color: '#8B5CF6' },
  match: { icon: UserPlus, color: '#10B981' },
  safety: { icon: ShieldAlert, color: '#EF4444' },
  system: { icon: Info, color: '#64748B' },
};

// Asked at most once per app launch per account; "Later" shouldn't nag on every Home visit.
const phonePromptShownFor = new Set<string>();

export default function HomeScreen() {
  const hideTabBarOnScroll = useHideTabBarOnScroll();
  const router = useRouter();
  const { profile, session } = useAuth();
  const userId = session?.user.id;
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [warningModeVisible, setWarningModeVisible] = useState(false);
  const [trustModalVisible, setTrustModalVisible] = useState(false);
  const [phonePromptVisible, setPhonePromptVisible] = useState(false);
  // Re-renders the pickup countdown every 30s so "45 mins" keeps counting down.
  const [clockTick, setClockTick] = useState(() => Date.now());
  // Mobile numbers became required for trips; existing travelers add theirs here.
  const missingPhone = !!profile && profile.role !== 'admin' && !hasPhone(profile.phone);
  useEffect(() => {
    if (missingPhone && profile && !phonePromptShownFor.has(profile.id)) {
      phonePromptShownFor.add(profile.id);
      setPhonePromptVisible(true);
    }
  }, [missingPhone, profile]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequest[]>([]);
  const [dbNotifications, setDbNotifications] = useState<AppNotification[]>([]);
  const [activeTrip, setActiveTrip] = useState<ActiveTripSummary | null>(null);
  const activeTripStartAt = activeTrip?.start_at ?? null;
  useEffect(() => {
    if (!activeTripStartAt) return;
    setClockTick(Date.now()); // the clock was idle while there was no trip
    const timer = setInterval(() => setClockTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [activeTripStartAt]);
  const [safety, setSafety] = useState<SafetyOverview | null>(null);
  const [staffOverview, setStaffOverview] = useState<StaffOverview | null>(null);
  const [guildSnapshot, setGuildSnapshot] = useState<LeaderGuildSnapshot | null>(null);
  const [startingTrip, setStartingTrip] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [locationShared, setLocationShared] = useState<boolean | null>(null);
  const isDark = useColorScheme() === 'dark';
  // Leaders are travelers with extra duties: they get Leader HQ on top of the
  // traveler home. Admins (referees) only get the operations view.
  const isLeader = profile?.role === 'guild_leader';
  const isAdmin = profile?.role === 'admin';
  const isStaff = isLeader || isAdmin;

  const loadDashboard = useCallback(async () => {
    // Platform-wide numbers are admin-only; leaders get their own guild's.
    if (isAdmin) {
      const staffResult = await getStaffOverview();
      if (!staffResult.error) {
        setStaffOverview(staffResult.data);
      }
      return;
    }
    if (isLeader) {
      const guildResult = await getLeaderGuildSnapshot();
      if (!guildResult.error) {
        setGuildSnapshot(guildResult.data);
      }
    }
    const [tripResult, safetyResult] = await Promise.all([getActiveTripSummary(), getSafetyOverview()]);
    if (!tripResult.error) {
      setActiveTrip(tripResult.data);
    }
    if (!safetyResult.error) {
      setSafety(safetyResult.data);
    }
  }, [isLeader, isAdmin]);

  const loadHome = useCallback(
    () =>
      Promise.all([
        loadDashboard(),
        listIncomingFriendRequests().then((result) => {
          if (!result.error) {
            setIncomingRequests(result.data);
          }
        }),
        listNotifications().then((result) => {
          if (!result.error) {
            setDbNotifications(result.data);
          }
        }),
        isLocationTrackingActive().then(setLocationShared),
      ]),
    [loadDashboard]
  );
  const { refreshControl } = usePullToRefresh(loadHome);

  useFocusEffect(
    useCallback(() => {
      void loadHome();
      const intervalId = setInterval(() => void loadDashboard(), DASHBOARD_POLL_INTERVAL_MS);
      // Keep the bell dot and list current while Home is open.
      const channel = userId
        ? supabase
            .channel(uniqueChannelName(`home-notifications:${userId}`))
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
              const row = payload.new as AppNotification;
              setDbNotifications((current) => (current.some((n) => n.id === row.id) ? current : [row, ...current]));
            })
            .subscribe()
        : null;
      return () => {
        clearInterval(intervalId);
        if (channel) {
          void supabase.removeChannel(channel);
        }
      };
    }, [loadDashboard, loadHome, userId])
  );

  const {
    primaryColor,
    destructiveColor,
    screenBackground,
    titleColor,
    subtitleColor,
    panelBackground,
    panelBorder,
    mutedText,
    primaryText,
  } = getTheme(isDark);

  const notifications = [
    ...incomingRequests.map((request) => ({
      id: request.id,
      type: 'match' as const,
      title: 'New friend request',
      message: `${request.display_name} added you. Open Discover to confirm.`,
      timestamp: formatTimeAgo(request.created_at),
      sortTime: parseTimestamp(request.created_at).getTime(),
      read: false,
    })),
    ...dbNotifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      timestamp: formatTimeAgo(notification.created_at),
      sortTime: parseTimestamp(notification.created_at).getTime(),
      read: notification.read,
    })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  const handleMarkAllRead = () => {
    const unreadIds = dbNotifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) {
      return;
    }
    setDbNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    unreadIds.forEach((id) => void markNotificationRead(id));
  };

  const handleNotificationPress = (notification: { id: string; title: string; message: string; read: boolean }) => {
    const dbNotification = dbNotifications.find((n) => n.id === notification.id);
    if (dbNotification && !notification.read) {
      setDbNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      void markNotificationRead(notification.id);
    }
    // Friend requests come from a separate list and always open Friends.
    const href = dbNotification ? routeForNotification({ ...(dbNotification.data ?? {}), type: dbNotification.type }) : '/friends';
    if (href) {
      setNotificationVisible(false);
      router.push(href);
    } else {
      showAlert(notification.title, notification.message);
    }
  };

  function confirmStartTrip() {
    showAlert('Start this trip now?', 'Everyone on this trip will be notified that it has started. Make sure your companions are with you before you go.', [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Start trip', onPress: () => void handleStartTrip() },
    ]);
  }

  async function handleStartTrip() {
    if (!activeTrip) return;
    setStartingTrip(true);
    const { error } = await startTrip(activeTrip.trip_id);
    setStartingTrip(false);
    if (error) {
      feedback.error();
      showAlert('Unable to start trip', error.message);
      return;
    }
    feedback.success();
    void loadDashboard();
  }

  async function handleShareLocation() {
    if (locationShared) {
      router.push('/map');
      return;
    }
    setSharingLocation(true);
    const permissions = await requestLocationPermissions();
    if (!permissions.foreground) {
      setSharingLocation(false);
      showAlert('Location permission needed', 'Enable location access in Settings to share your position.');
      return;
    }
    try {
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await upsertCurrentLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    } catch {
      // Background task will populate the location shortly.
    }
    await startBackgroundLocationTracking();
    setLocationShared(await isLocationTrackingActive());
    setSharingLocation(false);
    feedback.success();
  }

  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? '';
  const countdown = activeTrip ? describeCountdown(activeTrip.start_at, new Date(clockTick)) : null;
  const countdownLabel = countdown?.value ?? null;
  const isVerified = safety?.verification_status === 'approved';
  const trustScore = safety?.trust_score ?? 0;
  const trustAward = useTrustAward(userId, safety ? safety.trust_score : null);

  const unreadCount = incomingRequests.length + dbNotifications.filter((notification) => !notification.read).length;
  // shadow-sm stays on in both themes (transparent in dark): NativeWind
  // remounts a component whose styles start using CSS variables after the
  // first render, and remounting these AnimatedPressables on a dark→light
  // switch killed touch input app-wide.
  const iconButtonClass = `relative h-11 w-11 items-center justify-center rounded-full shadow-sm ${isDark ? 'bg-[#18253C] shadow-transparent' : 'bg-white shadow-black/5'}`;
  const iconColor = isDark ? '#E2E8F0' : '#24314A';
  const initial = (firstName[0] ?? 'P').toUpperCase();

  const zoneTone: StatusTone = safety?.geofence_status === 'in_zone' ? 'good' : safety?.geofence_status === 'out_of_zone' ? 'warn' : 'off';
  const safetyTiles = [
    { key: 'zone', icon: MapPin, label: 'Zone', value: safety?.geofence_label ?? 'Unavailable', tone: zoneTone },
    {
      key: 'buddy',
      icon: Users,
      label: 'Buddy',
      value: safety?.buddy_distance_km != null ? `${safety.buddy_distance_km} km away` : 'Not sharing',
      tone: (safety?.buddy_distance_km != null ? 'good' : 'off') as StatusTone,
    },
  ];

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} refreshControl={refreshControl} {...hideTabBarOnScroll}>
      <Animated.View entering={FadeIn.duration(350)} className="px-5 pt-4 pb-2">
        <View className="flex-row items-center justify-between">
          <AnimatedPressable onPress={() => router.push('/profile')} accessibilityLabel="Open your profile" className="flex-1 flex-row items-center gap-3">
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" transition={200} />
            ) : (
              <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: primaryColor }}>
                <Text className="text-lg font-bold text-white">{initial}</Text>
              </View>
            )}
            <View className="flex-1">
              <Text className={`text-[13px] ${subtitleColor}`}>{greeting()}</Text>
              <Text numberOfLines={1} className={`text-headline-20 font-semibold ${titleColor}`}>{firstName || 'Traveler'}</Text>
            </View>
          </AnimatedPressable>
          <View className="flex-row items-center gap-2">
            <AnimatedPressable onPress={() => router.push('/friends')} accessibilityLabel="View friends and friend requests" className={iconButtonClass}>
              <Users size={20} color={iconColor} />
              {incomingRequests.length > 0 && (
                <PopIn className="absolute -right-0.5 -top-0.5">
                  <View className="h-5 min-w-[20px] items-center justify-center rounded-full px-1" style={{ backgroundColor: destructiveColor }}>
                    <Text className="text-[11px] font-bold text-white">{incomingRequests.length}</Text>
                  </View>
                </PopIn>
              )}
            </AnimatedPressable>
            <AnimatedPressable onPress={() => setNotificationVisible(true)} accessibilityLabel="View notifications" className={iconButtonClass}>
              {/* Dot is anchored to the bell glyph (not the button) so it sits on its top-right corner. */}
              <View>
                <Bell size={20} color={iconColor} />
                {unreadCount > 0 && (
                  <PopIn className="absolute -right-1 -top-1">
                    <View className={`h-3 w-3 rounded-full border-2 ${isDark ? 'border-[#18253C]' : 'border-white'}`} style={{ backgroundColor: destructiveColor }} />
                  </PopIn>
                )}
              </View>
            </AnimatedPressable>
          </View>
        </View>
        {isAdmin ? (
          <Text key="admin-subtitle" className={`mt-4 text-sm ${subtitleColor}`}>Operations overview</Text>
        ) : (
          <StatusChips
            key="status-chips"
            isDark={isDark}
            trustScore={safety ? trustScore : null}
            isVerified={isVerified}
            sharing={locationShared}
            sharingBusy={sharingLocation}
            onTrustPress={() => setTrustModalVisible(true)}
            onVerifyPress={() => (isVerified ? setTrustModalVisible(true) : router.push('/verify-id'))}
            onSharePress={() => void handleShareLocation()}
          />
        )}
      </Animated.View>

      <View className="flex flex-col gap-4 px-4 pt-3">
        {isStaff ? <StaffDashboard key="staff-dashboard" isDark={isDark} overview={staffOverview} guildSnapshot={guildSnapshot} isAdmin={isAdmin} /> : null}

        {isAdmin ? null : activeTrip ? (
          <Animated.View key="active-trip-card" entering={riseIn(80)} className="overflow-hidden rounded-3xl p-5 shadow-lg shadow-[#1E40AF]/25">
            <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
              <Defs>
                <LinearGradient id="homeTripGradient" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={isDark ? '#2563EB' : '#3B6CF6'} />
                  <Stop offset="1" stopColor={isDark ? '#172554' : '#1E3A8A'} />
                </LinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100" height="100" fill="url(#homeTripGradient)" />
            </Svg>
            {/* Tapping the trip summary opens the trip. */}
            <AnimatedPressable
              onPress={() => router.push({ pathname: '/trip/[id]', params: { id: activeTrip.trip_id } })}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={`Open trip to ${activeTrip.destination}`}>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2 rounded-full bg-white/15 px-3 py-1">
                  <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: TRIP_STATUS_DOT[activeTrip.status] }} />
                  <Text className="text-xs font-semibold text-white">{TRIP_STATUS_LABELS[activeTrip.status]}</Text>
                </View>
                <ChevronRight size={22} color="#FFFFFF" />
              </View>

              {/* The countdown is the one thing to see first; destination sits under it. */}
              {countdown ? (
                <View key="trip-countdown" className="mt-4">
                  <Text className="text-xs font-semibold uppercase tracking-wider text-white/70">{countdown.lead}</Text>
                  <View className="flex-row items-baseline gap-2">
                    <Text className="text-[44px] font-bold leading-[52px] text-white">{countdown.value}</Text>
                    {countdown.unit ? <Text className="text-[22px] font-semibold text-white/85">{countdown.unit}</Text> : null}
                  </View>
                  <View className={`mt-1 flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1 ${countdown.soon ? 'bg-[#FBBF24]' : 'bg-white/15'}`}>
                    <Clock size={13} color={countdown.soon ? '#1E293B' : '#FFFFFF'} />
                    <Text className={`text-[13px] font-semibold ${countdown.soon ? 'text-[#1E293B]' : 'text-white'}`}>{countdown.when}</Text>
                  </View>
                </View>
              ) : null}
              <View className={`flex-row items-center gap-2 ${countdownLabel ? 'mt-1' : 'mt-4'}`}>
                <MapPin size={countdownLabel ? 16 : 20} color="#FFFFFF" />
                <Text numberOfLines={2} className={`flex-1 font-bold text-white ${countdownLabel ? 'text-headline-18' : 'text-headline-28'}`}>
                  {activeTrip.destination}
                </Text>
              </View>
              <View className="mt-1.5 flex-row items-center gap-2">
                <Users size={14} color="rgba(255,255,255,0.75)" />
                <Text numberOfLines={1} className="flex-1 text-sm text-white/75">{activeTrip.buddy_display_name ?? 'No buddy yet'}</Text>
              </View>
            </AnimatedPressable>

            {activeTrip.is_driver && activeTrip.status !== 'ongoing' && !activeTrip.buddy_user_id && activeTrip.trip_type !== 'tour' ? (
              <View key="waiting-for-riders" className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-3.5">
                <Users size={16} color="#FFFFFF" />
                <Text className="text-[15px] font-semibold text-white">Waiting for riders to start</Text>
              </View>
            ) : activeTrip.is_driver && activeTrip.status !== 'ongoing' ? (
              <AnimatedPressable
                key="start-trip"
                onPress={confirmStartTrip}
                disabled={startingTrip}
                className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5">
                {startingTrip ? <ActivityIndicator color="#1E40AF" /> : <><Navigation size={16} color="#1E40AF" /><Text className="text-[15px] font-semibold text-[#1E40AF]">Start Trip</Text></>}
              </AnimatedPressable>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View key="no-active-trip-card" entering={riseIn(80)}>
            <AnimatedPressable
              onPress={() => router.push('/carpooling')}
              accessibilityRole="button"
              accessibilityLabel="No trip yet. Browse rides"
              className={`flex-row items-center gap-3 rounded-3xl border p-4 ${panelBackground} ${panelBorder}`}>
              <View className={`h-11 w-11 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF1F6]'}`}>
                <CarFront size={20} color={isDark ? '#94A3B8' : '#64748B'} />
              </View>
              <Text className={`flex-1 text-[15px] font-semibold ${primaryText}`}>No trip yet</Text>
              <ChevronRight size={20} color={isDark ? '#64748B' : '#A0AABD'} />
            </AnimatedPressable>
          </Animated.View>
        )}

        {!isAdmin && (
          <Animated.View key="home-quick-actions" entering={riseIn(120)}>
            <HomeQuickActions
              isDark={isDark}
              primaryColor={primaryColor}
              destructiveColor={destructiveColor}
              onFindRide={() => router.push('/carpooling')}
              onOfferRide={() => router.push('/trip/create')}
              onTrustedCircle={() => router.push('/trusted-circle')}
              onSos={() => setWarningModeVisible(true)}
            />
          </Animated.View>
        )}

        {/* Zone and buddy only mean something during a trip. */}
        {!isAdmin && activeTrip ? (
          <Animated.View key="trip-safety-tiles" entering={riseIn(160)} className="flex-row gap-3">
            {safetyTiles.map(({ key, icon: Icon, label, value, tone }) => {
              const { bg, fg } = toneColors(tone, isDark);
              return (
                <View key={key} className={`flex-1 flex-row items-center gap-3 rounded-2xl border p-3.5 ${panelBackground} ${panelBorder}`}>
                  <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: bg }}>
                    <Icon size={17} color={fg} />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-xs ${mutedText}`}>{label}</Text>
                    <Text numberOfLines={1} className={`text-[15px] font-semibold ${primaryText}`}>{value}</Text>
                  </View>
                </View>
              );
            })}
          </Animated.View>
        ) : null}

        {/* Leaders get the full guild card inside Leader HQ. */}
        {!isStaff && <GuildSummaryCard key="guild-summary-card" isDark={isDark} delay={200} compact />}

        <Animated.View entering={riseIn(240)} className={`rounded-3xl border p-5 shadow-sm shadow-black/5 ${panelBackground} ${panelBorder}`}>
          <View className="flex-row items-center justify-between">
            <Text className={`${typography.sectionTitle} ${primaryText}`}>Recent Activity</Text>
            <AnimatedPressable hitSlop={8} onPress={() => setNotificationVisible(true)}>
              <Text className="text-sm font-semibold" style={{ color: primaryColor }}>View all</Text>
            </AnimatedPressable>
          </View>

          <View className="mt-3">
            {notifications.length === 0 ? (
              <Text className={`py-2 text-sm ${mutedText}`}>No recent activity yet.</Text>
            ) : (
              notifications.slice(0, 3).map((item, index) => {
                const { icon: Icon, color } = ACTIVITY_STYLE[item.type] ?? ACTIVITY_STYLE.system;
                return (
                  <AnimatedPressable
                    key={item.id}
                    onPress={() => handleNotificationPress(item)}
                    scaleTo={0.98}
                    className={`flex-row items-center gap-3 py-3 ${index > 0 ? `border-t ${isDark ? 'border-white/5' : 'border-[#EEF1F6]'}` : ''}`}>
                    <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${color}${isDark ? '33' : '1A'}` }}>
                      <Icon size={16} color={color} />
                    </View>
                    <View className="flex-1">
                      <Text numberOfLines={1} className={`text-sm font-semibold ${primaryText}`}>{item.title}</Text>
                      <Text className={`mt-0.5 text-xs ${mutedText}`}>{item.timestamp}</Text>
                    </View>
                    {!item.read && <View className="h-2 w-2 rounded-full" style={{ backgroundColor: primaryColor }} />}
                  </AnimatedPressable>
                );
              })
            )}
          </View>
        </Animated.View>

      </View>
      <NotificationModal
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
        isDark={isDark}
        notifications={notifications}
        onNotificationPress={handleNotificationPress}
        onMarkAllRead={handleMarkAllRead}
      />
      <TrustScoreModal visible={trustModalVisible} onClose={() => setTrustModalVisible(false)} isDark={isDark} />
      <PhoneRequiredModal visible={phonePromptVisible} onClose={() => setPhonePromptVisible(false)} isDark={isDark} />
      <TrustAwardCelebration visible={trustAward.celebrating} onClose={trustAward.dismiss} />
      <WarningModeModal
        visible={warningModeVisible}
        onClose={() => setWarningModeVisible(false)}
        isDark={isDark}
        tripId={activeTrip?.trip_id ?? null}
      />
    </ScrollView>
  );
}
