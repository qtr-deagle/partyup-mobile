import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// The bottom bar floats over the page as a rounded pill. Scroll down on a
// main tab screen and it slides away; scroll up (or switch tabs) and it
// slides back.

export const TAB_BAR_HEIGHT = 64;
const SLIDE = { duration: 240, easing: Easing.out(Easing.cubic) };
// Ignore tiny jitters so the bar doesn't flicker mid-scroll.
const DIRECTION_THRESHOLD = 8;
// Near the top of the page the bar always shows.
const TOP_ZONE = 40;

// Gap between the pill and the bottom edge of the screen.
export function useTabBarBottomGap() {
  return Math.max(useSafeAreaInsets().bottom, 12);
}

// How much of the screen bottom the floating pill covers. Screens pad by this
// so their last content can sit above it.
export function useTabBarSpace() {
  return TAB_BAR_HEIGHT + useTabBarBottomGap();
}

type TabBarVisibility = {
  hidden: SharedValue<number>;
  locked: SharedValue<number>;
  setHidden: (hidden: boolean) => void;
  setLocked: (locked: boolean) => void;
};

const TabBarVisibilityContext = createContext<TabBarVisibility | null>(null);

export function TabBarVisibilityProvider({ children }: { children: ReactNode }) {
  const hidden = useSharedValue(0);
  // Kept hidden by a screen regardless of scrolling (an open conversation).
  const locked = useSharedValue(0);
  const target = useRef(false);
  const setHidden = useCallback(
    (next: boolean) => {
      if (target.current === next) return;
      target.current = next;
      hidden.set(withTiming(next ? 1 : 0, SLIDE));
    },
    [hidden],
  );
  const setLocked = useCallback((next: boolean) => locked.set(withTiming(next ? 1 : 0, SLIDE)), [locked]);
  const value = useMemo(() => ({ hidden, locked, setHidden, setLocked }), [hidden, locked, setHidden, setLocked]);
  return <TabBarVisibilityContext.Provider value={value}>{children}</TabBarVisibilityContext.Provider>;
}

// Bring the bar back, e.g. when a screen swaps to a view that doesn't scroll it.
export function useShowTabBar() {
  const context = useContext(TabBarVisibilityContext);
  return useCallback(() => context?.setHidden(false), [context]);
}

// Keep the bar out of the way while `hidden` is true and this screen is focused.
export function useHideTabBarWhile(hidden: boolean) {
  const context = useContext(TabBarVisibilityContext);
  useFocusEffect(
    useCallback(() => {
      if (!context || !hidden) return;
      context.setLocked(true);
      return () => context.setLocked(false);
    }, [context, hidden]),
  );
}

// Spread onto a tab screen's main ScrollView: hides the bar on scroll and
// pads the bottom so the last content clears the floating pill.
export function useHideTabBarOnScroll() {
  const context = useContext(TabBarVisibilityContext);
  const space = useTabBarSpace();
  const lastY = useRef(0);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!context) return;
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const y = contentOffset.y;
      const maxY = contentSize.height - layoutMeasurement.height;
      const delta = y - lastY.current;
      // Skip the iOS bounce past the bottom edge, or it reads as "scrolling up".
      if (y > maxY) return;
      lastY.current = y;
      if (y <= TOP_ZONE) context.setHidden(false);
      else if (delta > DIRECTION_THRESHOLD) context.setHidden(true);
      else if (delta < -DIRECTION_THRESHOLD) context.setHidden(false);
    },
    [context],
  );

  return { onScroll, scrollEventThrottle: 16, contentContainerStyle: { paddingBottom: space + 24 } };
}

// The stock tab bar, floated over the screen in a transparent wrapper so
// only the pill shows, sliding off the bottom edge when hidden.
export function ScrollAwareTabBar(props: BottomTabBarProps) {
  const context = useContext(TabBarVisibilityContext);
  const height = useSharedValue(0);
  const fallback = useSharedValue(0);
  const hidden = context?.hidden ?? fallback;
  const locked = context?.locked ?? fallback;
  const setHidden = context?.setHidden;

  // Switching tabs always brings the bar back.
  useEffect(() => {
    setHidden?.(false);
  }, [props.state.index, setHidden]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(hidden.get(), locked.get()) * height.get() }],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, style]} onLayout={(event) => height.set(event.nativeEvent.layout.height)}>
      <BottomTabBar {...props} />
    </Animated.View>
  );
}
