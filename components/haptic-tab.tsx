import { BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { PlatformPressable } from 'expo-router/react-navigation';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        // Soft selection tick when pressing down on a tab.
        if (process.env.EXPO_OS !== 'web') {
          void Haptics.selectionAsync();
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
