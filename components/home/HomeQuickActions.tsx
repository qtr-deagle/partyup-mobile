import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { CarFront, HeartHandshake, Search, ShieldAlert } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { Text, View } from 'react-native';

type Action = {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  danger?: boolean;
  onPress: () => void;
};

type HomeQuickActionsProps = {
  isDark: boolean;
  primaryColor: string;
  destructiveColor: string;
  onFindRide: () => void;
  onOfferRide: () => void;
  onTrustedCircle: () => void;
  onSos: () => void;
};

// Icon-first shortcuts for the things people come to Home to do. Tab-bar
// destinations are left out on purpose; SOS is always here, never scrolled away.
export function HomeQuickActions({ isDark, primaryColor, destructiveColor, onFindRide, onOfferRide, onTrustedCircle, onSos }: HomeQuickActionsProps) {
  const actions: Action[] = [
    { key: 'find', label: 'Find ride', icon: Search, onPress: onFindRide },
    { key: 'offer', label: 'Offer ride', icon: CarFront, onPress: onOfferRide },
    { key: 'circle', label: 'My circle', icon: HeartHandshake, onPress: onTrustedCircle },
    { key: 'sos', label: 'SOS', icon: ShieldAlert, danger: true, onPress: onSos },
  ];

  return (
    <View className="flex-row gap-3">
      {actions.map(({ key, label, icon: Icon, danger, onPress }) => {
        const tint = danger ? destructiveColor : primaryColor;
        const tileBg = danger ? (isDark ? '#251416' : '#FFF1EF') : isDark ? '#111B2E' : '#FFFFFF';
        const iconBg = danger ? (isDark ? '#422022' : '#FFE1DC') : isDark ? '#1E3A8A66' : '#EAF0FF';
        return (
          <AnimatedPressable key={key} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="flex-1">
            <View className="items-center gap-2 rounded-2xl py-3.5" style={{ backgroundColor: tileBg }}>
              <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
                <Icon size={21} color={tint} />
              </View>
              <Text numberOfLines={1} className="text-xs font-semibold" style={{ color: danger ? destructiveColor : isDark ? '#E2E8F0' : '#1B2340' }}>
                {label}
              </Text>
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}
