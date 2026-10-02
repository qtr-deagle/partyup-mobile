import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { routeForNotification } from '@/components/InAppNotifier';
import { GuildSummaryCard } from '@/components/GuildSummaryCard';
import NotificationModal from '@/components/NotificationModal';
import StaffDashboard from '@/components/StaffDashboard';
import { PopIn, riseIn } from '@/components/ui/motion';
import WarningModeModal from '@/components/WarningModeModal';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { startTrip } from '@/lib/carpool';
import { formatCountdown, formatTimeAgo, parseTimestamp } from '@/lib/datetime';
import {
  getActiveTripSummary,
  getSafetyOverview,
  getStaffOverview,
  type ActiveTripSummary,
  type SafetyOverview,
  type StaffOverview,
} from '@/lib/homeDashboard';
import { requestLocationPermissions, startBackgroundLocationTracking, upsertCurrentLocation } from '@/lib/location';
import { listNotifications, markNotificationRead, type AppNotification } from '@/lib/notifications';
import { listIncomingFriendRequests, type IncomingFriendRequest } from '@/lib/social';
import { feedback } from '@/lib/sounds';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Bell, ChevronRight, MapPin, Navigation, Send, Shield, ShieldAlert, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

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

// Circular trust score gauge: a track ring with the score arc drawn from 12 o'clock.
function TrustRing({ score, color, trackColor, textClassName }: { score: number; color: string; trackColor: string; textClassName: string }) {
  const size = 68;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text className={`text-base font-bold ${textClassName}`}>{clamped}%</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const userId = session?.user.id;
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [warningModeVisible, setWarningModeVisible] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequest[]>([]);
  const [dbNotifications, setDbNotifications] = useState<AppNotification[]>([]);
  const [activeTrip, setActiveTrip] = useState<ActiveTripSummary | null>(null);
  const [safety, setSafety] = useState<SafetyOverview | null>(null);
  const [staffOverview, setStaffOverview] = useState<StaffOverview | null>(null);
  const [startingTrip, setStartingTrip] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const isDark = useColorScheme() === 'dark';
  // Leaders are travelers with extra duties: they get Leader HQ on top of the
  // traveler home. Admins (referees) only get the operations view.
  const isLeader = profile?.role === 'guild_leader';
  const isAdmin = profile?.role === 'admin';
  const isStaff = isLeader || isAdmin;

  const loadDashboard = useCallback(async () => {
    if (isStaff) {
      const staffResult = await getStaffOverview();
      if (!staffResult.error) {
        setStaffOverview(staffResult.data);
      }
      if (isAdmin) return;
    }
    const [tripResult, safetyResult] = await Promise.all([getActiveTripSummary(), getSafetyOverview()]);
    if (!tripResult.error) {
      setActiveTrip(tripResult.data);
    }
    if (!safetyResult.error) {
      setSafety(safetyResult.data);
    }
  }, [isStaff, isAdmin]);

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
    accentColor,
    destructiveColor,
    warningColor,
    screenBackground,
    titleColor,
    subtitleColor,
    panelBackground,
    panelBorder,
    mutedPanel,
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
      Alert.alert(notification.title, notification.message);
    }
  };

  async function handleStartTrip() {
    if (!activeTrip) return;
    setStartingTrip(true);
    const { error } = await startTrip(activeTrip.trip_id);
    setStartingTrip(false);
    if (error) {
      feedback.error();
      Alert.alert('Unable to start trip', error.message);
      return;
    }
    feedback.success();
    void loadDashboard();
  }

  async function handleShareLocation() {
    setSharingLocation(true);
    const permissions = await requestLocationPermissions();
    if (!permissions.foreground) {
      setSharingLocation(false);
      Alert.alert('Location permission needed', 'Enable location access in Settings to share your position.');
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
    setSharingLocation(false);
    feedback.success();
    Alert.alert('Location shared', 'Your live location is now being shared.');
  }

  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? '';
  const countdownLabel = activeTrip ? formatCountdown(activeTrip.start_at) : null;
  const isVerified = safety?.verification_status === 'approved';

  const unreadCount = incomingRequests.length + dbNotifications.filter((notification) => !notification.read).length;
  const iconButtonClass = `relative h-11 w-11 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-white shadow-sm shadow-black/5'}`;
  const iconColor = isDark ? '#E2E8F0' : '#24314A';
  const initial = (firstName[0] ?? 'P').toUpperCase();

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-10" refreshControl={refreshControl}>
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
        <Text className={`mt-4 text-sm ${subtitleColor}`}>{isAdmin ? 'Operations overview' : isLeader ? 'Leader HQ, your trips and safety' : 'Your trip and safety status'}</Text>
      </Animated.View>

      <View className="flex flex-col gap-4 px-4 pt-3">
        {isStaff ? <StaffDashboard key="staff-dashboard" isDark={isDark} overview={staffOverview} isAdmin={isAdmin} /> : null}

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
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2 rounded-full bg-white/15 px-3 py-1">
                <View className="h-2 w-2 rounded-full bg-[#34D399]" />
                <Text className="text-xs font-semibold text-white">{TRIP_STATUS_LABELS[activeTrip.status]}</Text>
              </View>
              <Send size={18} color="rgba(255,255,255,0.8)" />
            </View>

            <Text numberOfLines={2} className="mt-4 text-headline-28 font-bold text-white">{activeTrip.destination}</Text>
            <Text className="mt-1 text-sm text-white/75">{activeTrip.buddy_display_name ? `With ${activeTrip.buddy_display_name}` : 'No trip buddy yet'}</Text>

            <View className="mt-5 flex-row items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
              <View className="flex-row items-center gap-2">
                <MapPin size={15} color="rgba(255,255,255,0.8)" />
                <Text className="text-sm text-white/80">{countdownLabel ? 'Pickup in' : 'Status'}</Text>
              </View>
              <Text className="text-headline-20 font-semibold text-white">{countdownLabel ?? TRIP_STATUS_LABELS[activeTrip.status]}</Text>
            </View>

            <View className="mt-4 flex-row gap-3">
              {activeTrip.is_driver && activeTrip.status !== 'ongoing' ? (
                <AnimatedPressable
                  onPress={() => void handleStartTrip()}
                  disabled={startingTrip}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3.5">
                  {startingTrip ? <ActivityIndicator color="#1E40AF" /> : <><Navigation size={16} color="#1E40AF" /><Text className="text-[15px] font-semibold text-[#1E40AF]">Start Trip</Text></>}
                </AnimatedPressable>
              ) : !activeTrip.is_driver ? (
                <View className="flex-1 flex-row items-center justify-center rounded-2xl bg-white/10 px-3 py-3.5">
                  <Text numberOfLines={1} className="text-[15px] font-semibold text-white">
                    {activeTrip.status === 'ongoing' ? 'Trip in progress' : 'Waiting for driver'}
                  </Text>
                </View>
              ) : null}
              <AnimatedPressable
                onPress={() => void handleShareLocation()}
                disabled={sharingLocation}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-3.5">
                {sharingLocation ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <><Users size={16} color="white" /><Text className="text-[15px] font-semibold text-white">Share Location</Text></>
                )}
              </AnimatedPressable>
            </View>
          </Animated.View>
        ) : (
          <Animated.View key="no-active-trip-card" entering={riseIn(80)} className={`rounded-3xl border p-5 shadow-sm shadow-black/5 ${panelBackground} ${panelBorder}`}>
            <View className={`h-11 w-11 items-center justify-center rounded-2xl ${isDark ? 'bg-[#1E3A8A]/40' : 'bg-[#EAF0FF]'}`}>
              <Send size={20} color={primaryColor} />
            </View>
            <Text className={`mt-4 ${typography.sectionTitle} ${primaryText}`}>No active trip</Text>
            <Text className={`mt-1 text-sm leading-5 ${mutedText}`}>Create a carpool trip or accept a ride request to see it here.</Text>
            <AnimatedPressable onPress={() => router.push('/trip/create')} className="mt-4 self-start rounded-full px-5 py-3" style={{ backgroundColor: primaryColor }}>
              <Text className="text-[15px] font-semibold text-white">Create a trip</Text>
            </AnimatedPressable>
          </Animated.View>
        )}

        {/* Leaders get the guild card inside Leader HQ. */}
        {!isStaff && <GuildSummaryCard key="guild-summary-card" isDark={isDark} />}

        {!isAdmin && (
          <Animated.View key="safety-overview-card" entering={riseIn(140)} className={`rounded-3xl border p-5 shadow-sm shadow-black/5 ${panelBackground} ${panelBorder}`}>
            <View className="flex-row items-center gap-2">
              <View className={`h-8 w-8 items-center justify-center rounded-xl ${isDark ? 'bg-[#0F3D2E]' : 'bg-[#DDF4EA]'}`}>
                <Shield size={17} color={accentColor} />
              </View>
              <Text className={`${typography.sectionTitle} ${primaryText}`}>Safety Overview</Text>
            </View>

            <View className="mt-4 flex-row items-center gap-4">
              <TrustRing score={safety?.trust_score ?? 0} color={accentColor} trackColor={isDark ? '#1E2A40' : '#E6EDF5'} textClassName={primaryText} />
              <View className="flex-1">
                <Text className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}>Trust score</Text>
                <Text className={`mt-1 text-[15px] font-semibold leading-5 ${primaryText}`}>{isVerified ? 'Protected and verified' : 'Verify your ID to boost your score'}</Text>
                <View className="mt-2 self-start rounded-full px-2.5 py-0.5" style={{ backgroundColor: isVerified ? (isDark ? '#0F3D2E' : '#DDF4EA') : (isDark ? '#3A2A12' : '#FFEBCF') }}>
                  <Text className="text-xs font-semibold" style={{ color: isVerified ? accentColor : warningColor }}>{isVerified ? 'Verified' : 'Not verified'}</Text>
                </View>
              </View>
            </View>

            <View className="mt-4 flex-row gap-3">
              <View className={`flex-1 rounded-2xl p-3.5 ${mutedPanel}`}>
                <Text className={`text-xs ${mutedText}`}>Geofence</Text>
                <Text numberOfLines={2} className={`mt-1 text-[15px] font-semibold ${primaryText}`}>{safety?.geofence_label ?? 'Unavailable'}</Text>
                {safety?.geofence_distance_km != null && (
                  <Text numberOfLines={1} className={`mt-0.5 text-xs ${mutedText}`}>{safety.geofence_distance_km} km from {activeTrip?.destination}</Text>
                )}
              </View>
              <View className={`flex-1 rounded-2xl p-3.5 ${mutedPanel}`}>
                <Text className={`text-xs ${mutedText}`}>Travel buddy</Text>
                <Text numberOfLines={2} className={`mt-1 text-[15px] font-semibold ${primaryText}`}>
                  {safety?.buddy_distance_km != null ? `${safety.buddy_distance_km} km away` : 'Not sharing'}
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        <Animated.View entering={riseIn(200)} className={`rounded-3xl border p-5 shadow-sm shadow-black/5 ${panelBackground} ${panelBorder}`}>
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
              notifications.slice(0, 3).map((item, index) => (
                <View key={item.id} className={`flex-row items-center gap-3 py-3 ${index > 0 ? `border-t ${isDark ? 'border-white/5' : 'border-[#EEF1F6]'}` : ''}`}>
                  <View className={`h-9 w-9 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FB]'}`}>
                    <Bell size={16} color={primaryColor} />
                  </View>
                  <View className="flex-1">
                    <Text numberOfLines={1} className={`text-sm font-semibold ${primaryText}`}>{item.title}</Text>
                    <Text className={`mt-0.5 text-xs ${mutedText}`}>{item.timestamp}</Text>
                  </View>
                  {!item.read && <View className="h-2 w-2 rounded-full" style={{ backgroundColor: primaryColor }} />}
                </View>
              ))
            )}
          </View>
        </Animated.View>

        {!isAdmin && (
          <Animated.View key="traveler-quick-actions" entering={riseIn(320)}>
            <AnimatedPressable
              onPress={() => setWarningModeVisible(true)}
              className={`flex-row items-center gap-3 rounded-3xl p-4 ${isDark ? 'bg-[#251416]' : 'bg-[#FFF1EF]'}`}>
              <View className={`h-12 w-12 items-center justify-center rounded-2xl ${isDark ? 'bg-[#422022]' : 'bg-[#FFE1DC]'}`}>
                <ShieldAlert size={22} color={destructiveColor} />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold" style={{ color: destructiveColor }}>Warning Mode or SOS</Text>
                <Text className={`mt-0.5 text-xs leading-4 ${isDark ? 'text-[#E2A39C]' : 'text-[#A75A51]'}`}>Start a safety countdown or alert your trusted circle</Text>
              </View>
              <ChevronRight size={20} color={destructiveColor} />
            </AnimatedPressable>
          </Animated.View>
        )}
      </View>
      <NotificationModal
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
        isDark={isDark}
        notifications={notifications}
        onNotificationPress={handleNotificationPress}
      />
      <WarningModeModal
        visible={warningModeVisible}
        onClose={() => setWarningModeVisible(false)}
        isDark={isDark}
        tripId={activeTrip?.trip_id ?? null}
      />
    </ScrollView>
  );
}
