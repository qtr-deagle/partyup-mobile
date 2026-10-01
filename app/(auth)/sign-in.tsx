import { supabase } from '@/lib/supabase';
import { Link, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import OtpCodeInput, { EMAIL_OTP_LENGTH, isOtpComplete, useResendCooldown } from '@/components/OtpCodeInput';
import { FloatingIcon, useShake } from '@/components/ui/motion';
import { rateLimitWaitSeconds } from '@/lib/rateLimit';
import { feedback } from '@/lib/sounds';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAuth } from '@/hooks/auth-provider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsEmailCode, setNeedsEmailCode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendingCode, setResendingCode] = useState(false);
  const resendCooldown = useResendCooldown();
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const { style: shakeStyle, shake } = useShake();

  // Every error path sets errorMessage, so react to it in one place.
  useEffect(() => {
    if (errorMessage) {
      shake();
      feedback.error();
    }
  }, [errorMessage, shake]);

  // Only while focused: a password-reset code signs the user in while
  // forgot-password is on top, and that screen still needs the new password.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (isFocused && !loading && session) {
      router.replace(redirect ? (redirect as any) : '/(tabs)');
    }
  }, [isFocused, loading, redirect, router, session]);

  async function handleSignIn() {
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setSubmitting(false);

    if (error) {
      if (error.code === 'email_not_confirmed') {
        await sendEmailCode();
        setOtpCode('');
        setNeedsEmailCode(true);
        return;
      }
      setErrorMessage(error.message);
      return;
    }

    feedback.success();
    router.replace(redirect ? (redirect as any) : '/(tabs)');
  }

  async function sendEmailCode() {
    setResendingCode(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
    setResendingCode(false);
    if (error) {
      const waitSeconds = rateLimitWaitSeconds(error);
      if (waitSeconds !== null) {
        // The resend link counts down the wait itself.
        resendCooldown.restart(waitSeconds);
        setErrorMessage('Too many attempts. Wait for the timer below, then resend.');
        return;
      }
      setErrorMessage(error.message);
      return;
    }
    resendCooldown.restart();
  }

  async function handleVerifyEmail() {
    setSubmitting(true);
    setErrorMessage(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: otpCode, type: 'email' });
    setSubmitting(false);
    if (error) {
      setErrorMessage(error.code === 'otp_expired' ? 'That code is wrong or has expired. Check your email or resend a new one.' : error.message);
      return;
    }
    feedback.success();
    router.replace(redirect ? (redirect as any) : '/(tabs)');
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-[#F7F8FA]">
      <ScrollView contentContainerClassName="flex-grow justify-center px-2 pt-8"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        {/* Separate layers: the entering animation and the shake both drive transform. */}
        <Animated.View entering={FadeInDown.duration(500).springify().damping(18)} className="w-full">
        <Animated.View style={shakeStyle} className="w-full rounded-[14px] bg-white px-6 py-7 shadow-lg shadow-black/10">
          <View className="items-center">
            <FloatingIcon>
              <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-[#2445B8] shadow-lg shadow-[#2445B8]/40">
                <Text className="text-[26px] font-black text-white">P</Text>
              </View>
            </FloatingIcon>
            <Text className="text-headline-28 font-bold text-[#2445B8]">PartyUp</Text>
            <Text className="mt-1 text-[12px] text-[#697386]">Travel Buddy Matching Platform</Text>
          </View>

          {needsEmailCode ? (
            <View className="mt-6">
              <Text className="text-center text-[15px] font-bold text-[#273142]">Verify your email</Text>
              <Text className="mb-4 mt-1 text-center text-[12px] leading-5 text-[#697386]">
                Your email isn&apos;t verified yet. We sent a code to <Text className="font-semibold text-[#273142]">{email.trim().toLowerCase()}</Text>.
              </Text>
              <OtpCodeInput length={EMAIL_OTP_LENGTH} value={otpCode} onChangeText={setOtpCode} onResend={sendEmailCode} resendSecondsLeft={resendCooldown.secondsLeft} resending={resendingCode} />
            </View>
          ) : (
          <View className="mt-6 gap-3">
            <View>
              <Text className="mb-2 text-[12px] font-medium text-[#273142]">Email Address</Text>
              <View className={`h-[42px] flex-row items-center rounded-[9px] border px-3 ${focusedField === 'email' ? 'border-[#2445B8] bg-white' : 'border-[#E2E5E9] bg-[#F1F2F4]'}`}>
                <Mail size={17} color="#7C8798" />
                <TextInput
                  className="ml-2 flex-1 text-[13px] text-[#273142]"
                  placeholder="you@example.com"
                  placeholderTextColor="#9AA3B1"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            <View>
              <Text className="mb-2 text-[12px] font-medium text-[#273142]">Password</Text>
              <View className={`h-[42px] flex-row items-center rounded-[9px] border px-3 ${focusedField === 'password' ? 'border-[#2445B8] bg-white' : 'border-[#E2E5E9] bg-[#F1F2F4]'}`}>
                <Lock size={17} color="#7C8798" />
                <TextInput
                  className="ml-2 flex-1 text-[13px] text-[#273142]"
                  placeholder="********"
                  placeholderTextColor="#9AA3B1"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={handleSignIn}
                  returnKeyType="go"
                />
                <TouchableOpacity onPress={() => setShowPassword((visible) => !visible)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff size={17} color="#7C8798" /> : <Eye size={17} color="#7C8798" />}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { email: email.trim() } })}
                className="mt-2 self-end">
                <Text className="text-[12px] font-semibold text-[#2445B8]">Forgot password?</Text>
              </TouchableOpacity>
            </View>
          </View>
          )}

          {errorMessage ? (
            <Animated.Text key={errorMessage} entering={FadeIn.duration(200)} className="mt-4 text-[14px] text-[#FB7185]">
              {errorMessage}
            </Animated.Text>
          ) : null}

          {needsEmailCode ? (
            <>
              <TouchableOpacity onPress={handleVerifyEmail} disabled={submitting || !isOtpComplete(otpCode, EMAIL_OTP_LENGTH)} className={`mt-4 h-[42px] justify-center rounded-[9px] ${isOtpComplete(otpCode, EMAIL_OTP_LENGTH) ? 'bg-[#2445B8]' : 'bg-[#A9B6E0]'}`}>
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-[16px] font-bold text-white">Verify & Sign In</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setNeedsEmailCode(false); setErrorMessage(null); }} className="mt-3">
                <Text className="text-center text-[12px] text-[#697386]">Use a different account</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={handleSignIn} disabled={submitting} className="mt-4 h-[42px] justify-center rounded-[9px] bg-[#2445B8]">
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-[16px] font-bold text-white">Sign In</Text>}
            </TouchableOpacity>
          )}

          <Text className="mt-5 text-center text-[12px] text-[#697386]">
            Don&apos;t have an account?{' '}
            <Link href="/(auth)/sign-up" className="font-semibold text-[#7DA3FF]">
              Sign up
            </Link>
          </Text>
        </Animated.View>
        </Animated.View>
        <Text className="mt-5 px-3 text-center text-[10px] leading-[14px] text-[#697386]">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}