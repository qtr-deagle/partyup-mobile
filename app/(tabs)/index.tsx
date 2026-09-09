import { AnimatedPressable } from '@/components/ui/animated-pressable';
import NotificationModal from '@/components/NotificationModal';
import WarningModeModal from '@/components/WarningModeModal';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { startTrip } from '@/lib/carpool';
import { formatCountdown, parseTimestamp } from '@/lib/datetime';
import { getActiveTripSummary, getSafetyOverview, type ActiveTripSummary, type SafetyOverview } from '@/lib/homeDashboard';
import { requestLocationPermissions, startBackgroundLocationTracking, upsertCurrentLocation } from '@/lib/location';
import { listNotifications, markNotificationRead, type AppNotification } from '@/lib/notifications';
import { triggerSosAlert } from '@/lib/safety';
import { listIncomingFriendRequests, type IncomingFriendRequest } from '@/lib/social';
import { getTheme, typography } from '@/lib/theme';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, MapPin, Navigation, Send, Shield, Sparkles, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const quickStats = [
  { label: 'Trusted circle', value: '8 people' },
  { label: 'Trips completed', value: '24' },
  { label: 'Safety score', value: '92%' },
];

const activityItems = [
  { id: 1, title: 'Sarah accepted your request', meta: '2 min ago' },
  { id: 2, title: 'Pickup time updated to 2:00 PM', meta: '15 min ago' },
  { id: 3, title: 'Route adjusted for traffic', meta: '1 hour ago' },
];

const TRIP_STATUS_LABELS: Record<ActiveTripSummary['status'], string> = {
  draft: 'Draft',
  open: 'Open for riders',
  full: 'Full',
  ongoing: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const DASHBOARD_POLL_INTERVAL_MS = 45000;

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [warningModeVisible, setWarningModeVisible] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequest[]>([]);
  const [dbNotifications, setDbNotifications] = useState<AppNotification[]>([]);
  const [activeTrip, setActiveTrip] = useState<ActiveTripSummary | null>(null);
  const [safety, setSafety] = useState<SafetyOverview | null>(null);
  const [startingTrip, setStartingTrip] = useState(false);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);
  const isDark = useColorScheme() === 'dark';

  const loadDashboard = useCallback(async () => {
    const [tripResult, safetyResult] = await Promise.all([getActiveTripSummary(), getSafetyOverview()]);
    if (!tripResult.error) {
      setActiveTrip(tripResult.data);
    }
    if (!safetyResult.error) {
      setSafety(safetyResult.data);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
      void listIncomingFriendRequests().then((result) => {
        if (!result.error) {
          setIncomingRequests(result.data);
        }
      });
      void listNotifications().then((result) => {
        if (!result.error) {
          setDbNotifications(result.data);
        }
      });
      const intervalId = setInterval(() => void loadDashboard(), DASHBOARD_POLL_INTERVAL_MS);
      return () => clearInterval(intervalId);
    }, [loadDashboard])
  );

  const {
    primaryColor,
    accentColor,
    destructiveColor,
    warningColor,
    screenBackground,
    headerBackground,
    titleColor,
    subtitleColor,
    panelBackground,
    panelBorder,
    mutedPanel,
    mutedText,
    primaryText,
    softBorder,
  } = getTheme(isDark);

  const notifications = [
    ...incomingRequests.map((request) => ({
      id: request.id,
      type: 'match' as const,
      title: 'New friend request',
      message: `${request.display_name} added you. Open Discover to confirm.`,
      timestamp: parseTimestamp(request.created_at).toLocaleString(),
      sortTime: parseTimestamp(request.created_at).getTime(),
      read: false,
    })),
    ...dbNotifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      timestamp: parseTimestamp(notification.created_at).toLocaleString(),
      sortTime: parseTimestamp(notification.created_at).getTime(),
      read: notification.read,
    })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  const handleNotificationPress = (notification: { id: string; title: string; message: string; read: boolean }) => {
    const isDbNotification = dbNotifications.some((n) => n.id === notification.id);
    if (isDbNotification && !notification.read) {
      setDbNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      void markNotificationRead(notification.id);
    }
    Alert.alert(notification.title, notification.message);
  };

  async function handleStartTrip() {
    if (!activeTrip) return;
    setStartingTrip(true);
    const { error } = await startTrip(activeTrip.trip_id);
    setStartingTrip(false);
    if (error) {
      Alert.alert('Unable to start trip', error.message);
      return;
    }
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
    Alert.alert('Location shared', 'Your live location is now being shared.');
  }

  function handleSosPress() {
    if (profile?.emergency_sos_enabled === false) {
      Alert.alert('Emergency SOS is disabled', 'Enable Emergency SOS in Settings to use this feature.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => router.push('/modal') },
      ]);
      return;
    }
    Alert.alert('Send emergency SOS?', 'This will immediately alert your trusted circle with your current location.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send SOS', style: 'destructive', onPress: () => void sendSos() },
    ]);
  }

  async function sendSos() {
    setSendingSos(true);
    const { data, error } = await triggerSosAlert(activeTrip?.trip_id ?? null);
    setSendingSos(false);
    if (error) {
      Alert.alert('Unable to send SOS', error.message);
      return;
    }
    Alert.alert(
      'SOS sent',
      data && data.recipient_count > 0
        ? `${data.recipient_count} trusted contact${data.recipient_count === 1 ? '' : 's'} notified with your location.`
        : "You don't have any trusted contacts with alerts enabled yet."
    );
  }

  const countdownLabel = activeTrip ? formatCountdown(activeTrip.start_at) : null;
  const isVerified = safety?.verification_status === 'approved';

  return (
    <ScrollView className={`flex-1 ${screenBackground}`} contentContainerClassName="pb-28">
      {!isDark && <View className="absolute -top-24 -right-20 h-56 w-56 rounded-full bg-[#DCE6FF] opacity-70" />}
      {!isDark && <View className="absolute top-40 -left-24 h-52 w-52 rounded-full bg-[#DDEFE8] opacity-70" />}

      <Animated.View entering={FadeIn.duration(350)} className={`px-4 pt-4 pb-5 border-b ${headerBackground}`}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: primaryColor }}>
              <Text className="text-white text-lg font-bold">P</Text>
            </View>
            <Text className={`text-lg font-bold ${titleColor}`}>PartyUp</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <AnimatedPressable
              onPress={() => router.push('/friends')}
              accessibilityLabel="View friends and friend requests"
              className={`relative rounded-full p-2 ${isDark ? 'border border-[#22324B] bg-[#111B2E]' : 'border border-black/10 bg-white'}`}>
              <Users size={20} color={isDark ? '#E2E8F0' : '#24314A'} />
              {incomingRequests.length > 0 && (
                <View
                  className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full px-1"
                  style={{ backgroundColor: destructiveColor }}>
                  <Text className="text-[11px] font-bold text-white">{incomingRequests.length}</Text>
                </View>
              )}
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setNotificationVisible(true)}
              accessibilityLabel="View notifications"
              className={`relative rounded-full p-2 ${isDark ? 'border border-[#22324B] bg-[#111B2E]' : 'border border-black/10 bg-white'}`}>
              <Bell size={20} color={isDark ? '#E2E8F0' : '#24314A'} />
              <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: destructiveColor }} />
            </AnimatedPressable>
          </View>
        </View>

        <View className="mt-8">
          <Text className={`${typography.pageTitle} ${titleColor}`}>What&apos;s happening now</Text>
          <Text className={`mt-2 text-base ${subtitleColor}`}>Your live dashboard</Text>
        </View>
      </Animated.View>

      <View className="px-4 pt-6 flex flex-col gap-4">
        {activeTrip ? (
          <Animated.View
            entering={FadeInDown.delay(80).duration(400).springify().damping(16)}
            className={`rounded-[24px] border-2 p-4 shadow-sm ${isDark ? 'border-[#3B82F6] bg-[#111B2E] shadow-black/20' : 'border-[#1E40AF] bg-[#EAF0FF] shadow-[#1E40AF]/10'}`}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="h-4 w-4 rounded-full" style={{ backgroundColor: accentColor }} />
                <Text className="text-base font-extrabold" style={{ color: primaryColor }}>{TRIP_STATUS_LABELS[activeTrip.status]}</Text>
              </View>
              <Send size={20} color={primaryColor} />
            </View>

            <Text className={`mt-4 text-3xl font-black ${primaryText}`}>{activeTrip.destination}</Text>
            <Text className={`mt-1 text-base ${mutedText}`}>{activeTrip.buddy_display_name ? `With ${activeTrip.buddy_display_name}` : 'No trip buddy yet'}</Text>

            <View className={`mt-4 rounded-2xl p-4 ${mutedPanel}`}>
              <View className="flex-row items-center justify-between">
                <Text className={`text-base ${mutedText}`}>{countdownLabel ? 'Pickup in' : 'Status'}</Text>
                <Text className={`text-2xl font-black ${primaryText}`}>{countdownLabel ?? TRIP_STATUS_LABELS[activeTrip.status]}</Text>
              </View>
              <View className="mt-3 flex-row items-center justify-between">
                <Text className={`text-base ${mutedText}`}>Destination</Text>
                <View className="flex-row items-center gap-2">
                  <MapPin size={16} color={primaryColor} />
                  <Text className="text-base font-semibold" style={{ color: primaryColor }}>{activeTrip.destination}</Text>
                </View>
              </View>
            </View>

            <View className="mt-4 flex-row gap-3">
              {activeTrip.is_driver && activeTrip.status !== 'ongoing' ? (
                <AnimatedPressable
                  onPress={() => void handleStartTrip()}
                  disabled={startingTrip}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3.5"
                  style={{ backgroundColor: primaryColor }}>
                  {startingTrip ? <ActivityIndicator color="white" /> : <><Navigation size={16} color="white" /><Text className="text-base font-bold text-white">Start Trip</Text></>}
                </AnimatedPressable>
              ) : !activeTrip.is_driver ? (
                <View className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3.5 ${isDark ? 'bg-[#18253C]' : 'bg-white'}`}>
                  <Text className={`text-base font-bold ${primaryText}`}>
                    {activeTrip.status === 'ongoing' ? 'Trip in progress' : 'Waiting for driver to start'}
                  </Text>
                </View>
              ) : null}
              <AnimatedPressable
                onPress={() => void handleShareLocation()}
                disabled={sharingLocation}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3.5 ${isDark ? 'bg-[#18253C]' : 'bg-white'}`}>
                {sharingLocation ? (
                  <ActivityIndicator color={isDark ? '#E2E8F0' : '#1B2340'} />
                ) : (
                  <><Users size={16} color={isDark ? '#E2E8F0' : '#1B2340'} /><Text className={`text-base font-bold ${primaryText}`}>Share Location</Text></>
                )}
              </AnimatedPressable>
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeInDown.delay(80).duration(400).springify().damping(16)}
            className={`rounded-[24px] border p-4 ${panelBackground} ${panelBorder}`}>
            <Text className={`${typography.sectionTitle} ${primaryText}`}>No active trip</Text>
            <Text className={`mt-2 text-base ${mutedText}`}>Create a carpool trip or accept a ride request to see it here.</Text>
            <AnimatedPressable onPress={() => router.push('/trip/create')} className="mt-4 self-start rounded-2xl px-4 py-3" style={{ backgroundColor: primaryColor }}>
              <Text className="text-base font-bold text-white">Create a trip</Text>
            </AnimatedPressable>
          </Animated.View>
        )}

        <Animated.View
          entering={FadeInDown.delay(140).duration(400).springify().damping(16)}
          className={`rounded-[24px] border-2 p-4 ${isDark ? 'border-[#10B981] bg-[#0D1E1A]' : 'border-[#059669] bg-[#E5F6EF]'}`}>
          <View className="flex-row items-center gap-2">
            <Shield size={20} color={accentColor} />
            <Text className={`${typography.sectionTitle} ${primaryText}`}>Safety Overview</Text>
          </View>

          <View className="mt-4 flex flex-col gap-3">
            <View className={`rounded-2xl p-4 ${mutedPanel}`}>
              <Text className={`${typography.label} ${mutedText}`}>Geofence Status</Text>
              <Text className={`mt-2 ${typography.value} ${primaryText}`}>{safety?.geofence_label ?? 'Geofence unavailable'}</Text>
              {safety?.geofence_distance_km != null && (
                <Text className={`mt-1 text-sm ${mutedText}`}>{safety.geofence_distance_km} km from {activeTrip?.destination}</Text>
              )}
            </View>

            <View className={`rounded-2xl p-4 ${mutedPanel}`}>
              <Text className={`${typography.label} ${mutedText}`}>Distance from Travel Buddy</Text>
              <Text className={`mt-2 ${typography.value} ${primaryText}`}>
                {safety?.buddy_distance_km != null ? `${safety.buddy_distance_km} km` : 'Not sharing right now'}
              </Text>
            </View>

            <View className={`rounded-2xl p-4 ${mutedPanel}`}>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className={`text-sm ${mutedText}`}>Trust Score</Text>
                  <Text className={`mt-1 text-lg font-bold ${primaryText}`}>{isVerified ? 'Protected and verified' : 'Complete ID verification to boost your score'}</Text>
                </View>
                <View className="rounded-full px-3 py-1" style={{ backgroundColor: isVerified ? (isDark ? '#0F3D2E' : '#DDF4EA') : (isDark ? '#3A2A12' : '#FFEBCF') }}>
                  <Text className="text-xs font-bold" style={{ color: isVerified ? accentColor : warningColor }}>{isVerified ? '✓ Verified' : 'Not Verified'}</Text>
                </View>
              </View>

              <View className="mt-3 flex-row items-center gap-3">
                <View className="h-2 flex-1 overflow-hidden rounded-full bg-[#D9E4DE]">
                  <Animated.View
                    entering={FadeIn.delay(400).duration(500)}
                    className="h-full rounded-full"
                    style={{ width: `${safety?.trust_score ?? 0}%`, backgroundColor: accentColor }}
                  />
                </View>
                <Text className="text-2xl font-black" style={{ color: accentColor }}>{safety?.trust_score ?? 0}%</Text>
              </View>
            </View>

            <AnimatedPressable
              onPress={() => setWarningModeVisible(true)}
              className="flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3.5"
              style={{ backgroundColor: destructiveColor }}>
              <Shield size={16} color="white" />
              <Text className="text-base font-bold text-white">Activate Warning Mode</Text>
            </AnimatedPressable>
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(200).duration(400).springify().damping(16)}
          className={`rounded-[24px] border p-4 ${panelBackground} ${panelBorder}`}>
          <View className="flex-row items-center gap-2">
            <Sparkles size={18} color={primaryColor} />
            <Text className={`${typography.sectionTitle} ${primaryText}`}>Quick Stats</Text>
          </View>

          <View className="mt-4 flex-row gap-4">
            {quickStats.map((item) => (
              <View key={item.label} className={`flex-1 rounded-2xl p-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F5F7FB]'}`}>
                <Text className={`text-xs ${mutedText}`}>{item.label}</Text>
                <Text className={`mt-2 text-base font-bold ${primaryText}`}>{item.value}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(260).duration(400).springify().damping(16)}
          className={`rounded-[24px] border p-4 ${panelBackground} ${panelBorder}`}>
          <View className="flex-row items-center justify-between">
            <Text className={`${typography.sectionTitle} ${primaryText}`}>Live Activity</Text>
            <AnimatedPressable hitSlop={8}>
              <Text className="text-sm font-semibold" style={{ color: primaryColor }}>View all</Text>
            </AnimatedPressable>
          </View>

          <View className="mt-4 flex flex-col gap-3">
            {activityItems.map((item) => (
              <View key={item.id} className={`flex-row items-start gap-3 rounded-2xl p-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F5F7FB]'}`}>
                <View className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                <View className="flex-1">
                  <Text className={`text-sm font-semibold ${primaryText}`}>{item.title}</Text>
                  <Text className={`mt-1 text-xs ${mutedText}`}>{item.meta}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(320).duration(400).springify().damping(16)} className="flex-row gap-4 pb-6">
          <AnimatedPressable
            onPress={() => router.push('/(tabs)/map')}
            className={`flex-1 rounded-[22px] border px-4 py-4 ${softBorder} ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
            <View className={`h-11 w-11 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
              <Users size={20} color={primaryColor} />
            </View>
            <Text className={`mt-3 text-base font-bold ${primaryText}`}>Find Buddies</Text>
            <Text className={`mt-1 text-xs ${mutedText}`}>See who is traveling nearby</Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleSosPress}
            disabled={sendingSos}
            className={`flex-1 rounded-[22px] border-2 px-4 py-4 ${isDark ? 'border-[#7A2D2D] bg-[#251416]' : 'border-[#FFB1A9] bg-[#FFF3F1]'}`}>
            <View className={`h-11 w-11 items-center justify-center rounded-full ${isDark ? 'bg-[#422022]' : 'bg-[#FFE1DC]'}`}>
              {sendingSos ? <ActivityIndicator color={destructiveColor} /> : <Shield size={20} color={destructiveColor} />}
            </View>
            <Text className="mt-3 text-base font-black" style={{ color: destructiveColor }}>Emergency SOS</Text>
            <Text className={`mt-1 text-xs ${isDark ? 'text-[#E2A39C]' : 'text-[#A75A51]'}`}>Alert trusted circle</Text>
          </AnimatedPressable>
        </Animated.View>
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
