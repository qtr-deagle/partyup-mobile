import type { ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

import { FloatingIcon } from '@/components/ui/motion';

// Shared layout pieces for the sign-in / sign-up flow, in the app's
// existing PartyUp blue + gray palette. Auth screens are light-only,
// matching the child inputs (LegalNameFields, OtpCodeInput) which render
// light unless isDark is set.

export const AUTH_BRAND = '#2445B8';

// The PartyUp mark: blue tile with a white P, wordmark and tagline.
export function AuthLogo() {
  return (
    <View className="items-center">
      <FloatingIcon>
        <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-[#2445B8] shadow-lg shadow-[#2445B8]/40">
          <Text className="text-[26px] font-black text-white">P</Text>
        </View>
      </FloatingIcon>
      <Text className="text-headline-28 font-bold text-[#2445B8]">PartyUp</Text>
      <Text className="mt-1 text-[12px] text-[#697386]">Travel Buddy Matching Platform</Text>
    </View>
  );
}

// Labeled input shell. Children are the icon, TextInput and any trailing button.
export function AuthField({ label, focused, error, children, hint }: { label: string; focused?: boolean; error?: boolean; children: ReactNode; hint?: ReactNode }) {
  return (
    <View>
      <Text className="mb-2 ml-1 text-[13px] font-semibold text-[#273142]">{label}</Text>
      <View
        className={`h-[52px] flex-row items-center rounded-2xl border px-4 ${
          focused ? 'border-[#2445B8] bg-white' : error ? 'border-[#E11D48] bg-[#FFF5F6]' : 'border-[#E2E5E9] bg-[#F1F2F4]'
        }`}>
        {children}
      </View>
      {typeof hint === 'string' ? <Text className="ml-1 mt-1.5 text-[11px] leading-4 text-[#697386]">{hint}</Text> : hint}
    </View>
  );
}

export const AUTH_INPUT_CLASS = 'ml-3 flex-1 text-[15px] text-[#273142]';
export const AUTH_PLACEHOLDER = '#9AA3B1';
export const AUTH_ICON = '#7C8798';

export function AuthPrimaryButton({ label, onPress, disabled, loading, trailing, className = '' }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  trailing?: ReactNode;
  className?: string;
}) {
  const inactive = disabled && !loading;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      className={`h-[54px] flex-row items-center justify-center gap-2 rounded-2xl ${inactive ? 'bg-[#A9B6E0]' : 'bg-[#2445B8] shadow-lg shadow-[#2445B8]/30'} ${className}`}>
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <><Text className="text-[16px] font-bold text-white">{label}</Text>{trailing}</>}
    </TouchableOpacity>
  );
}

export function AuthSecondaryButton({ label, onPress, className = '' }: { label: string; onPress: () => void; className?: string }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} className={`h-[54px] items-center justify-center rounded-2xl bg-[#F0F1F3] ${className}`}>
      <Text className="text-[15px] font-semibold text-[#273142]">{label}</Text>
    </TouchableOpacity>
  );
}
