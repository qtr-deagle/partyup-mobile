import { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

// Matches the hosted Supabase project's email OTP length
// (Auth -> Providers -> Email).
export const EMAIL_OTP_LENGTH = 8;
const RESEND_COOLDOWN_SECONDS = 60;

export function isOtpComplete(code: string, length: number) {
  return code.length === length;
}

// Starts counting down immediately, since every screen that shows the code
// input has just sent a code.
export function useResendCooldown() {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return { secondsLeft, restart: () => setSecondsLeft(RESEND_COOLDOWN_SECONDS) };
}

type OtpCodeInputProps = {
  length: number;
  value: string;
  onChangeText: (code: string) => void;
  onResend: () => void;
  resendSecondsLeft: number;
  resending?: boolean;
  isDark?: boolean;
  compact?: boolean;
};

export default function OtpCodeInput({ length, value, onChangeText, onResend, resendSecondsLeft, resending, isDark, compact }: OtpCodeInputProps) {
  const canResend = resendSecondsLeft <= 0 && !resending;

  return (
    <View>
      <TextInput
        className={`rounded-[10px] border text-center font-bold ${compact ? 'h-[44px] text-[20px] tracking-[8px]' : 'h-[58px] text-[26px] tracking-[10px]'} ${isDark ? 'border-[#22324B] bg-[#18253C] text-white' : 'border-[#E2E5E9] bg-[#F1F2F4] text-[#273142]'}`}
        placeholder={'0'.repeat(length)}
        placeholderTextColor={isDark ? '#475569' : '#B6BDC8'}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, ''))}
        autoFocus
      />
      <TouchableOpacity onPress={onResend} disabled={!canResend} className="mt-3 self-center">
        <Text className={`${compact ? 'text-[11px]' : 'text-[14px]'} font-semibold ${canResend ? 'text-[#2445B8]' : isDark ? 'text-[#64748B]' : 'text-[#9AA3B1]'}`}>
          {resending ? 'Sending…' : resendSecondsLeft > 0 ? `Resend code in ${resendSecondsLeft}s` : "Didn't get it? Resend code"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
