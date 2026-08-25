import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

const ReanimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends PressableProps {
  scaleTo?: number;
  haptic?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function AnimatedPressable({
  scaleTo = 0.96,
  haptic = true,
  onPressIn,
  onPressOut,
  style,
  ...props
}: AnimatedPressableProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <ReanimatedPressable
      {...props}
      style={[
        {
          transform: [{ scale: pressed ? scaleTo : 1 }],
          transitionProperty: 'transform',
          transitionDuration: 150,
          transitionTimingFunction: 'ease-out',
        },
        style,
      ]}
      onPressIn={(event) => {
        setPressed(true);
        if (haptic) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
    />
  );
}
