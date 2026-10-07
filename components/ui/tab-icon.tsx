import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import type { ColorValue } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type TabIconProps = {
  Icon: LucideIcon;
  color: ColorValue;
  focused: boolean;
  pillColor: string;
};

// Tab bar icon that springs up and grows a soft circle behind it when selected.
export function TabIcon({ Icon, color, focused, pillColor }: TabIconProps) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.set(withSpring(focused ? 1 : 0, { damping: 14, stiffness: 200 }));
  }, [focused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.5, 1]) }],
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.get(), [0, 1], [1, 1.08]) }, { translateY: interpolate(progress.get(), [0, 1], [0, -1]) }],
  }));

  return (
    <Animated.View className="items-center justify-center" style={{ width: 34, height: 34 }}>
      <Animated.View className="absolute h-[34px] w-[34px] rounded-full" style={[{ backgroundColor: pillColor }, pillStyle]} />
      <Animated.View style={iconStyle}>
        <Icon size={23} color={color as string} strokeWidth={focused ? 2.2 : 1.9} />
      </Animated.View>
    </Animated.View>
  );
}
