import WarningModeModal from '@/components/WarningModeModal';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getActiveTripSummary } from '@/lib/homeDashboard';
import { setSosEdgePosition, useSosEdge, type SosEdgeSide } from '@/lib/sos-edge';
import { feedback } from '@/lib/sounds';
import { useSegments } from 'expo-router';
import { Siren } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_WIDTH = 38;
const TAB_HEIGHT = 92;
// Keeps the tab clear of the status bar/SOS banner on top and the tab bar below.
const TOP_CLEARANCE = 80;
const BOTTOM_CLEARANCE = 110;
const SPRING = { damping: 18, stiffness: 200 };

const HIDDEN_SEGMENTS = new Set(['(auth)', 'verification-required', 'verify-id']);

// Optional, app-wide SOS handle pinned to the screen edge (Settings > Safety
// Features > SOS Edge Button). Tap to open Warning Mode -- a countdown that
// auto-sends the SOS unless cancelled, with "Send SOS Now" for real urgency --
// so a stray tap never alerts anyone. Drag to move it up/down or across.
export default function SosEdgeTab() {
  const { session, profile } = useAuth();
  const segments = useSegments();
  const edge = useSosEdge();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isDark = useColorScheme() === 'dark';
  const [modalVisible, setModalVisible] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);

  const minY = insets.top + TOP_CLEARANCE;
  const maxY = Math.max(minY, height - insets.bottom - BOTTOM_CLEARANCE - TAB_HEIGHT);
  const restX = (side: SosEdgeSide) => (side === 'left' ? 0 : width - TAB_WIDTH);
  const restY = minY + edge.offset * (maxY - minY);

  const x = useSharedValue(restX(edge.side));
  const y = useSharedValue(restY);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pulse = useSharedValue(0);

  // Re-seat the tab when the saved position or the screen size changes.
  useEffect(() => {
    x.set(withSpring(edge.side === 'left' ? 0 : width - TAB_WIDTH, SPRING));
    y.set(withSpring(restY, SPRING));
  }, [edge.side, restY, width, x, y]);

  // A soft glow so the tab is easy to spot without being distracting.
  useEffect(() => {
    pulse.set(withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1));
  }, [pulse]);

  function openWarningMode() {
    feedback.select();
    setModalVisible(true);
    // Attach the active trip if there is one; the modal only reads it once the
    // user activates, so this never delays opening.
    void getActiveTripSummary().then(({ data }) => setTripId(data?.trip_id ?? null));
  }

  function savePosition(side: SosEdgeSide, top: number) {
    setSosEdgePosition(side, maxY > minY ? (top - minY) / (maxY - minY) : 0);
  }

  const pan = Gesture.Pan()
    .minDistance(8)
    .onStart(() => {
      startX.set(x.get());
      startY.set(y.get());
    })
    .onUpdate((event) => {
      x.set(Math.min(width - TAB_WIDTH, Math.max(0, startX.get() + event.translationX)));
      y.set(Math.min(maxY, Math.max(minY, startY.get() + event.translationY)));
    })
    .onEnd((event) => {
      const side: SosEdgeSide = event.absoluteX < width / 2 ? 'left' : 'right';
      x.set(withSpring(side === 'left' ? 0 : width - TAB_WIDTH, SPRING));
      runOnJS(savePosition)(side, y.get());
    });

  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(openWarningMode)();
  });

  const gesture = Gesture.Race(pan, tap);

  const positionStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + pulse.get() * 0.35,
  }));

  // Leaders travel too, so only admins go without the SOS tab.
  const isStaff = profile?.role === 'admin';
  const hidden =
    !edge.enabled || !session || !profile || isStaff || profile.emergency_sos_enabled === false || HIDDEN_SEGMENTS.has(segments[0] ?? '');

  if (hidden) {
    return null;
  }

  const onLeft = edge.side === 'left';
  const corners = onLeft ? { borderTopRightRadius: 18, borderBottomRightRadius: 18 } : { borderTopLeftRadius: 18, borderBottomLeftRadius: 18 };

  return (
    <>
      <GestureDetector gesture={gesture}>
        <Animated.View
          key="sos-edge-tab"
          accessible
          accessibilityRole="button"
          accessibilityLabel="Emergency SOS"
          accessibilityHint="Opens Warning Mode with an SOS countdown. Drag to move."
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              width: TAB_WIDTH,
              height: TAB_HEIGHT,
              zIndex: 850,
            },
            positionStyle,
          ]}>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: -6,
                bottom: -6,
                left: onLeft ? 0 : -6,
                right: onLeft ? -6 : 0,
                backgroundColor: '#E32727',
              },
              corners,
              glowStyle,
            ]}
          />
          <View
            className="flex-1 items-center justify-center gap-1.5 bg-[#E32727]"
            style={[
              corners,
              {
                shadowColor: '#7F1D1D',
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 10,
              },
            ]}>
            <Siren size={18} color="#FFFFFF" />
            <Text className="text-[11px] font-black tracking-[1px] text-white">SOS</Text>
          </View>
        </Animated.View>
      </GestureDetector>
      <WarningModeModal visible={modalVisible} onClose={() => setModalVisible(false)} isDark={isDark} tripId={tripId} />
    </>
  );
}
