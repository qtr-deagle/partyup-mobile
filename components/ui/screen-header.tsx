import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { enterFromBelow } from '@/components/ui/motion';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTheme, typography } from '@/lib/theme';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  children?: ReactNode;
};

// Standard header for stacked (non-tab) screens: filled bar with a round back
// button, title, optional subtitle/right action, and room for tabs below.
export function ScreenHeader({ title, subtitle, onBack, right, children }: ScreenHeaderProps) {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { headerBackground, titleColor, subtitleColor } = getTheme(isDark);

  return (
    <View className={`border-b px-4 pb-4 ${headerBackground}`} style={{ paddingTop: insets.top + 12 }}>
      <View className="flex-row items-center gap-3">
        <AnimatedPressable
          onPress={onBack ?? (() => router.back())}
          scaleTo={0.9}
          className={`h-10 w-10 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#F1F4FA]'}`}
          accessibilityLabel="Go back">
          <ArrowLeft size={21} color={isDark ? '#FFFFFF' : '#1B2340'} />
        </AnimatedPressable>
        <View className="flex-1">
          <Text numberOfLines={1} className={`${typography.pageTitle} ${titleColor}`}>{title}</Text>
          {subtitle ? <Text numberOfLines={1} className={`text-[13px] ${subtitleColor}`}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

type CardProps = {
  index?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

// Rounded, softly shadowed content card that rises in with the shared stagger.
export function Card({ index = 0, className = '', style, children }: CardProps) {
  const isDark = useColorScheme() === 'dark';
  return (
    <Animated.View
      entering={enterFromBelow(index)}
      style={style}
      className={`rounded-[22px] border p-4 shadow-sm ${isDark ? 'border-[#22324B] bg-[#111B2E] shadow-black/20' : 'border-[#E9EDF5] bg-white shadow-black/5'} ${className}`}>
      {children}
    </Animated.View>
  );
}
