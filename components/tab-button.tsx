import { BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { PlatformPressable } from 'expo-router/react-navigation';

// Plain tab button: no Android ripple circle, no press fade, no haptics.
// The active pill in TabIcon is the only press feedback.
export function TabButton(props: BottomTabBarButtonProps) {
  return <PlatformPressable {...props} pressColor="transparent" pressOpacity={1} />;
}
