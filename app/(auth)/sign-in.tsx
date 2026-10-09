import { supabase } from '@/lib/supabase';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import LegalModal, { type LegalDoc } from '@/components/LegalModal';
import OtpCodeInput, { EMAIL_OTP_LENGTH, isOtpComplete, useResendCooldown } from '@/components/OtpCodeInput';
import { riseIn, useShake } from '@/components/ui/motion';
import { rateLimitWaitSeconds } from '@/lib/rateLimit';
import { feedback } from '@/lib/sounds';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useAuth } from '@/hooks/auth-provider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTH_BRAND, AUTH_ICON, AUTH_INPUT_CLASS, AUTH_PLACEHOLDER, AuthField, AuthLogo, AuthPrimaryButton } from '@/components/auth/AuthUI';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsEmailCode, setNeedsEmailCode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendingCode, setResendingCode] = useState(false);
  const resendCooldown = useResendCooldown();
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const { style: shakeStyle, shake } = useShake();
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  // On short phones the form can't fit above the nav bar, so allow
  // scrolling there even with the keyboard closed.
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const contentOverflows = viewportHeight > 0 && contentHeight > viewportHeight + 1;

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
    <View className="flex-1 bg-[#F7F8FA]">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        {/* Fixed while the keyboard is closed; scrollable while it's open so
            the fields and buttons it covers can still be reached. */}
        <ScrollView ref={scrollRef} scrollEnabled={keyboardVisible || contentOverflows} onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)} onContentSizeChange={(_width, height) => setContentHeight(height)} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="w-full max-w-[420px] self-center">
          <Animated.View entering={riseIn(0, 450)} className="items-center pb-5">
            <AuthLogo />
            {needsEmailCode ? (
              <>
                <Text className="mt-4 text-headline-24 font-bold text-[#273142]">Check your inbox</Text>
                <Text className="mt-1 text-center text-[14px] leading-[21px] text-[#697386]">One quick step before you hop in.</Text>
              </>
            ) : null}
          </Animated.View>

          {/* Separate layers: the entering animation and the shake both drive transform. */}
          <Animated.View entering={riseIn(120, 500)}>
            <View className="rounded-[28px] bg-white px-6 py-6 shadow-lg shadow-black/10">
              <Animated.View style={shakeStyle}>
                {needsEmailCode ? (
                  <View>
                    <Text className="text-[18px] font-bold text-[#273142]">Verify your email</Text>
                    <Text className="mb-5 mt-1.5 text-[13px] leading-5 text-[#697386]">
                      Your email isn&apos;t verified yet. We sent a code to <Text className="font-semibold text-[#273142]">{email.trim().toLowerCase()}</Text>.
                    </Text>
                    <OtpCodeInput length={EMAIL_OTP_LENGTH} value={otpCode} onChangeText={setOtpCode} onResend={sendEmailCode} resendSecondsLeft={resendCooldown.secondsLeft} resending={resendingCode} />
                  </View>
                ) : (
                  <View className="gap-4">
                    <AuthField label="Email" focused={focusedField === 'email'}>
                      <Mail size={18} color={focusedField === 'email' ? AUTH_BRAND : AUTH_ICON} />
                      <TextInput
                        className={AUTH_INPUT_CLASS}
                        placeholder="you@gmail.com"
                        placeholderTextColor={AUTH_PLACEHOLDER}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={email}
                        onChangeText={setEmail}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                      />
                    </AuthField>

                    <View>
                      <AuthField label="Password" focused={focusedField === 'password'}>
                        <Lock size={18} color={focusedField === 'password' ? AUTH_BRAND : AUTH_ICON} />
                        <TextInput
                          className={AUTH_INPUT_CLASS}
                          placeholder="Enter your password"
                          placeholderTextColor={AUTH_PLACEHOLDER}
                          secureTextEntry={!showPassword}
                          value={password}
                          onChangeText={setPassword}
                          onFocus={() => setFocusedField('password')}
                          onBlur={() => setFocusedField(null)}
                          onSubmitEditing={handleSignIn}
                          returnKeyType="go"
                        />
                        <TouchableOpacity onPress={() => setShowPassword((visible) => !visible)} hitSlop={10} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                          {showPassword ? <EyeOff size={18} color={AUTH_ICON} /> : <Eye size={18} color={AUTH_ICON} />}
                        </TouchableOpacity>
                      </AuthField>
                      <TouchableOpacity
                        onPress={() => router.push({ pathname: '/(auth)/forgot-password', params: { email: email.trim() } })}
                        className="mt-3 self-end">
                        <Text className="text-[13px] font-semibold text-[#2445B8]">Forgot password?</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {errorMessage ? (
                  <Animated.View key={errorMessage} entering={FadeIn.duration(200)} className="mt-5 flex-row items-start gap-2 rounded-2xl bg-[#FFF1F3] px-4 py-3">
                    <AlertCircle size={16} color="#E11D48" style={{ marginTop: 2 }} />
                    <Text className="flex-1 text-[13px] leading-5 text-[#BE123C]">{errorMessage}</Text>
                  </Animated.View>
                ) : null}

                {needsEmailCode ? (
                  <>
                    <AuthPrimaryButton label="Verify & Sign In" onPress={handleVerifyEmail} loading={submitting} disabled={!isOtpComplete(otpCode, EMAIL_OTP_LENGTH)} className="mt-5" />
                    <TouchableOpacity onPress={() => { setNeedsEmailCode(false); setErrorMessage(null); }} className="mt-4">
                      <Text className="text-center text-[13px] font-medium text-[#697386]">Use a different account</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <AuthPrimaryButton label="Sign In" onPress={handleSignIn} loading={submitting} trailing={<ArrowRight size={18} color="#FFFFFF" />} className="mt-5" />
                )}
              </Animated.View>

              <View className="mt-5 flex-row items-center gap-3">
                <View className="h-px flex-1 bg-[#E2E5E9]" />
                <Text className="text-[12px] text-[#9AA3B1]">New to PartyUp?</Text>
                <View className="h-px flex-1 bg-[#E2E5E9]" />
              </View>
              <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/(auth)/sign-up')} className="mt-3 h-[50px] items-center justify-center rounded-2xl border-[1.5px] border-[#BCC7E5]">
                <Text className="text-[15px] font-semibold text-[#2445B8]">Create an account</Text>
              </TouchableOpacity>

            </View>
            <Text className="mt-4 px-3 text-center text-[11px] leading-4 text-[#9AA3B1]">
              By signing in, you agree to our{' '}
              <Text className="font-semibold text-[#2445B8]" onPress={() => setLegalDoc('terms')}>Terms of Service</Text> and{' '}
              <Text className="font-semibold text-[#2445B8]" onPress={() => setLegalDoc('privacy')}>Privacy Policy</Text>
            </Text>
          </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <LegalModal visible={legalDoc !== null} doc={legalDoc ?? 'terms'} onClose={() => setLegalDoc(null)} />
    </View>
  );
}
