import { useColorScheme } from '@/hooks/use-color-scheme';
import { feedback } from '@/lib/sounds';
import { Check } from 'lucide-react-native';
import { useCallback, useEffect, type ReactNode } from 'react';
import { Modal, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// Shared motion vocabulary so every screen animates the same way.

const STAGGER_MS = 55;
const MAX_STAGGER_ITEMS = 8;

// Entrance for list rows / cards: fade + rise, staggered by index. Items past
// the first few share one delay so long lists don't trickle in slowly.
export function enterFromBelow(index = 0) {
  return FadeInDown.delay(Math.min(index, MAX_STAGGER_ITEMS) * STAGGER_MS)
    .duration(380)
    .springify()
    .damping(18);
}

type RevealProps = {
  index?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function Reveal({ index = 0, className, style, children }: RevealProps) {
  return (
    <Animated.View entering={enterFromBelow(index)} className={className} style={style}>
      {children}
    </Animated.View>
  );
}

// Pulsing placeholder block shown while content loads.
export function Skeleton({ className = '', style }: { className?: string; style?: StyleProp<ViewStyle> }) {
  const isDark = useColorScheme() === 'dark';
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View className={`${isDark ? 'bg-[#1E2A40]' : 'bg-[#E6EBF3]'} ${className}`} style={[animatedStyle, style]} />;
}

// A ready-made skeleton row: avatar circle + two text lines.
export function SkeletonRow() {
  return (
    <View className="flex-row items-center gap-3 py-3">
      <Skeleton className="h-12 w-12 rounded-full" />
      <View className="flex-1 gap-2">
        <Skeleton className="h-4 w-2/5 rounded-md" />
        <Skeleton className="h-3.5 w-4/5 rounded-md" />
      </View>
    </View>
  );
}

export function SkeletonCard({ height = 140 }: { height?: number }) {
  return <Skeleton className="w-full rounded-3xl" style={{ height }} />;
}

// Gently bobbing icon for empty states.
export function FloatingIcon({ children }: { children: ReactNode }) {
  const translateY = useSharedValue(0);
  useEffect(() => {
    translateY.set(
      withRepeat(
        withSequence(withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) })),
        -1,
      ),
    );
  }, [translateY]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  return <Animated.View style={animatedStyle}>{children}</Animated.View>;
}

type EmptyStateProps = { icon: ReactNode; title: string; message?: string; action?: ReactNode };

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Animated.View entering={FadeIn.duration(400)} className="items-center px-8 pt-14">
      <FloatingIcon>
        <View className={`h-20 w-20 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FB]'}`}>{icon}</View>
      </FloatingIcon>
      <Text className={`mt-5 text-center text-lg font-bold ${isDark ? 'text-white' : 'text-[#182A4D]'}`}>{title}</Text>
      {message ? <Text className={`mt-1.5 text-center text-sm leading-5 ${isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]'}`}>{message}</Text> : null}
      {action ? <View className="mt-5">{action}</View> : null}
    </Animated.View>
  );
}

type SuccessOverlayProps = {
  visible: boolean;
  title: string;
  message?: string;
  onDone: () => void;
  // How long the celebration stays up before onDone fires.
  durationMs?: number;
};

// Full-screen "done!" moment for joins, bookings and submissions: a check
// pops in over an expanding ring, with the success chime + haptic.
export function SuccessOverlay({ visible, title, message, onDone, durationMs = 1600 }: SuccessOverlayProps) {
  const isDark = useColorScheme() === 'dark';
  const ring = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      return;
    }
    feedback.success();
    ring.set(0);
    ring.set(withDelay(120, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })));
    const timer = setTimeout(onDone, durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs, onDone, ring]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - ring.get(),
    transform: [{ scale: 1 + ring.get() * 1.2 }],
  }));

  return (
    <Modal transparent visible={visible} animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/45 px-10">
        <Animated.View
          entering={ZoomIn.springify().damping(14)}
          exiting={FadeOut}
          className={`w-full items-center rounded-3xl px-6 py-8 ${isDark ? 'bg-[#0F172A]' : 'bg-white'}`}>
          <View className="h-24 w-24 items-center justify-center">
            <Animated.View className="absolute h-20 w-20 rounded-full bg-[#10B981]/40" style={ringStyle} />
            <Animated.View entering={ZoomIn.delay(80).springify().damping(10).stiffness(220)} className="h-20 w-20 items-center justify-center rounded-full bg-[#10B981]">
              <Check size={42} color="#FFFFFF" strokeWidth={3} />
            </Animated.View>
          </View>
          <Text className={`mt-4 text-center text-xl font-black ${isDark ? 'text-white' : 'text-[#182A4D]'}`}>{title}</Text>
          {message ? <Text className={`mt-1.5 text-center text-sm leading-5 ${isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]'}`}>{message}</Text> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

// Horizontal "nope" shake for forms. Call shake() on a validation/auth error
// and spread `style` onto an Animated.View around the form.
export function useShake() {
  const offset = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const shake = useCallback(() => {
    offset.set(
      withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 70 }),
        withTiming(-7, { duration: 70 }),
        withTiming(7, { duration: 70 }),
        withTiming(0, { duration: 50 }),
      ),
    );
  }, [offset]);
  return { style, shake };
}

// Springy scale-in for badges/counters that appear or change.
export function PopIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(12)} className={className}>
      {children}
    </Animated.View>
  );
}
