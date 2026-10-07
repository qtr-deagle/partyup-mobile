import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AlertTriangle, BadgeCheck, MapPin, ShieldCheck } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export type StatusTone = 'good' | 'warn' | 'off';

// One color language for status across Home: green = fine, amber = needs
// action, grey = off.
export function toneColors(tone: StatusTone, isDark: boolean) {
  switch (tone) {
    case 'good':
      return { bg: isDark ? '#0F3D2E' : '#DDF4EA', fg: isDark ? '#34D399' : '#047857' };
    case 'warn':
      return { bg: isDark ? '#3A2A12' : '#FFEBCF', fg: isDark ? '#F0A93B' : '#B45309' };
    default:
      return { bg: isDark ? '#18253C' : '#EEF1F6', fg: isDark ? '#94A3B8' : '#64748B' };
  }
}

type ChipProps = {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  tone: StatusTone;
  isDark: boolean;
  busy?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

function Chip({ icon: Icon, label, tone, isDark, busy, onPress, accessibilityLabel }: ChipProps) {
  const { bg, fg } = toneColors(tone, isDark);
  return (
    <AnimatedPressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={accessibilityLabel} className="flex-1">
      <View className="h-10 flex-row items-center justify-center gap-1.5 rounded-full px-2.5" style={{ backgroundColor: bg }}>
        {busy ? <ActivityIndicator size="small" color={fg} /> : <Icon size={15} color={fg} />}
        <Text numberOfLines={1} className="text-[13px] font-semibold" style={{ color: fg }}>
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

type StatusChipsProps = {
  isDark: boolean;
  trustScore: number | null;
  isVerified: boolean;
  sharing: boolean | null;
  sharingBusy: boolean;
  onTrustPress: () => void;
  onVerifyPress: () => void;
  onSharePress: () => void;
};

// Glanceable safety status under the Home header: trust, ID, location.
export function StatusChips({ isDark, trustScore, isVerified, sharing, sharingBusy, onTrustPress, onVerifyPress, onSharePress }: StatusChipsProps) {
  return (
    <View className="mt-4 flex-row gap-2">
      <Chip
        icon={ShieldCheck}
        label={trustScore == null ? 'Trust' : `${trustScore}% trust`}
        tone={trustScore == null ? 'off' : trustScore >= 50 ? 'good' : 'warn'}
        isDark={isDark}
        onPress={onTrustPress}
        accessibilityLabel={trustScore == null ? 'Trust score' : `Trust score ${trustScore} percent. See how it is calculated`}
      />
      <Chip
        icon={isVerified ? BadgeCheck : AlertTriangle}
        label={isVerified ? 'Verified' : 'Verify ID'}
        tone={isVerified ? 'good' : 'warn'}
        isDark={isDark}
        onPress={onVerifyPress}
        accessibilityLabel={isVerified ? 'Your ID is verified' : 'Verify your ID'}
      />
      <Chip
        icon={MapPin}
        label={sharing ? 'Sharing' : 'Not sharing'}
        tone={sharing ? 'good' : 'off'}
        isDark={isDark}
        busy={sharingBusy}
        onPress={onSharePress}
        accessibilityLabel={sharing ? 'Location sharing is on' : 'Location sharing is off. Tap to share your location'}
      />
    </View>
  );
}
