import { useEffect, useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export type SheetSnap = 'peek' | 'half' | 'full';

export type MapBottomSheetHandle = {
  snapTo: (snap: SheetSnap) => void;
};

type MapBottomSheetProps = {
  // Height of the screen area the sheet lives in.
  containerHeight: number;
  // Written with how much of the sheet is showing, so overlays can sit above it.
  visibleHeight: SharedValue<number>;
  isDark: boolean;
  header: ReactNode;
  // Sits under the header, outside the drag area so its buttons tap normally.
  toolbar?: ReactNode;
  children: ReactNode;
  onSnapChange?: (snap: SheetSnap) => void;
  ref?: Ref<MapBottomSheetHandle>;
};

// Handle + header + filter row.
export const SHEET_PEEK_HEIGHT = 156;
const PEEK_HEIGHT = SHEET_PEEK_HEIGHT;
const TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };

// A quick flick moves one step in that direction; otherwise rest on the nearest height.
// Defined at module scope: worklet function declarations aren't hoisted, so a gesture
// callback calling one declared later in the component crashes on the UI thread.
function pickSnapTarget(current: number, velocityY: number, peek: number, half: number, full: number) {
  'worklet';
  const order = [peek, half, full];
  let target = order.reduce((best, value) => (Math.abs(value - current) < Math.abs(best - current) ? value : best), peek);
  if (Math.abs(velocityY) > 800) {
    target = velocityY < 0 ? (order.find((value) => value > current + 4) ?? full) : ([...order].reverse().find((value) => value < current - 4) ?? peek);
  }
  return target;
}

// Draggable sheet over the map with three resting heights. The whole sheet drags
// it; once fully open the list scrolls instead, and pulling down from the top of
// the list drags the sheet back down.
export default function MapBottomSheet({ containerHeight, visibleHeight, isDark, header, toolbar, children, onSnapChange, ref }: MapBottomSheetProps) {
  const snaps = {
    peek: PEEK_HEIGHT,
    half: Math.round(containerHeight * 0.5),
    full: Math.round(containerHeight * 0.88),
  };
  const fullHeight = snaps.full;
  const startHeight = useSharedValue(PEEK_HEIGHT);
  const scrollY = useSharedValue(0);
  // Whether the body drag is moving the sheet (vs. leaving it to the list), and
  // the finger offset at which it started doing so.
  const bodyDragging = useSharedValue(false);
  const bodyDragBase = useSharedValue(0);
  // The list only scrolls when the sheet is fully open; below that, dragging it moves the sheet.
  const [expanded, setExpanded] = useState(false);

  function reportSnap(snap: SheetSnap) {
    setExpanded(snap === 'full');
    onSnapChange?.(snap);
  }

  function snapTo(snap: SheetSnap) {
    visibleHeight.set(withTiming(snaps[snap], TIMING));
    reportSnap(snap);
  }

  useImperativeHandle(ref, () => ({ snapTo }));

  // Re-clamp if the screen size changes (rotation, keyboard, first layout).
  useEffect(() => {
    visibleHeight.set(Math.min(Math.max(visibleHeight.get(), PEEK_HEIGHT), fullHeight));
  }, [fullHeight, visibleHeight]);

  const { peek, half, full } = snaps;

  const pan = Gesture.Pan()
    .onStart(() => {
      startHeight.set(visibleHeight.get());
    })
    .onUpdate((event) => {
      visibleHeight.set(Math.min(Math.max(startHeight.get() - event.translationY, peek), full));
    })
    .onEnd((event) => {
      const target = pickSnapTarget(visibleHeight.get(), event.velocityY, peek, half, full);
      visibleHeight.set(withTiming(target, TIMING));
      runOnJS(reportSnap)(target === peek ? 'peek' : target === half ? 'half' : 'full');
    });

  // Body drag: runs alongside the list's own scrolling. It moves the sheet unless
  // the sheet is fully open and the list is scrolled down (or being pushed up).
  const listScroll = Gesture.Native();
  const bodyPan = Gesture.Pan()
    .simultaneousWithExternalGesture(listScroll)
    .activeOffsetY([-8, 8])
    .failOffsetX([-14, 14])
    .onStart(() => {
      bodyDragging.set(false);
    })
    .onUpdate((event) => {
      if (!bodyDragging.get()) {
        const atFull = visibleHeight.get() >= full - 1;
        if (atFull && (scrollY.get() > 0 || event.translationY < 0)) return;
        bodyDragging.set(true);
        bodyDragBase.set(event.translationY);
        startHeight.set(visibleHeight.get());
      }
      const next = startHeight.get() - (event.translationY - bodyDragBase.get());
      visibleHeight.set(Math.min(Math.max(next, peek), full));
    })
    .onEnd((event) => {
      if (!bodyDragging.get()) return;
      bodyDragging.set(false);
      const target = pickSnapTarget(visibleHeight.get(), event.velocityY, peek, half, full);
      visibleHeight.set(withTiming(target, TIMING));
      runOnJS(reportSnap)(target === peek ? 'peek' : target === half ? 'half' : 'full');
    });

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  const tap = Gesture.Tap().onEnd(() => {
    const current = visibleHeight.get();
    const target = current < half - 4 ? half : peek;
    visibleHeight.set(withTiming(target, TIMING));
    runOnJS(reportSnap)(target === peek ? 'peek' : 'half');
  });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: fullHeight - visibleHeight.get() }],
  }));

  return (
    <Animated.View
      className={`absolute bottom-0 left-0 right-0 rounded-t-[26px] border-t shadow-lg ${isDark ? 'border-[#22324B] bg-[#0B1220] shadow-black/40' : 'border-black/5 bg-[#F7F8FB] shadow-black/15'}`}
      style={[{ height: fullHeight }, sheetStyle]}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View className="px-4 pb-2 pt-2.5">
          <View className={`h-1.5 w-11 self-center rounded-full ${isDark ? 'bg-[#334155]' : 'bg-[#CBD5E1]'}`} />
          <View className="mt-2.5">{header}</View>
        </View>
      </GestureDetector>
      <GestureDetector gesture={bodyPan}>
        <View className="flex-1">
          {toolbar ? <View className="pb-2">{toolbar}</View> : null}
          <GestureDetector gesture={listScroll}>
            <Animated.ScrollView
              className="flex-1"
              contentContainerClassName="px-4 pb-10"
              showsVerticalScrollIndicator={false}
              scrollEnabled={expanded}
              bounces={false}
              overScrollMode="never"
              onScroll={onScroll}
              scrollEventThrottle={16}>
              {children}
            </Animated.ScrollView>
          </GestureDetector>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
