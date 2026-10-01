import { supabase } from '@/lib/supabase';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle2, Circle, Eye, EyeOff, KeyRound, Lock, Mail } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import OtpCodeInput, { EMAIL_OTP_LENGTH, isOtpComplete, useResendCooldown } from '@/components/OtpCodeInput';
import { FloatingIcon, riseIn, useShake } from '@/components/ui/motion';
import { formatWait, rateLimitWaitSeconds } from '@/lib/rateLimit';
import { feedback } from '@/lib/sounds';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Same rules as sign-up, so a reset can't produce a weaker password.
const PASSWORD_RULES: [string, (value: string) => boolean][] = [
  ['At least 8 characters', (value) => value.length >= 8],
  ['Upper and lowercase letters', (value) => /[a-z]/.test(value) && /[A-Z]/.test(value)],
  ['A number', (value) => /\d/.test(value)],
  ['A symbol (e.g. ! @ #)', (value) => /[^A-Za-z0-9]/.test(value)],
];

function friendlyError(error: { code?: string; message: string }) {
  if (rateLimitWaitSeconds(error) !== null) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (error.code === 'otp_expired') {
    return 'That code is wrong or has expired. Check your email or resend a new one.';
  }
  return error.message;
}

type Step = 'email' | 'code' | 'password';

const TITLES: Record<Step, string> = {
  email: 'Forgot password?',
  code: 'Enter your code',
  password: 'Create new password',
};

// Password reset by emailed code, in three steps: email -> code -> new
// password. The code comes from the Supabase "Reset Password" email template,
// which must include {{ .Token }}. A correct code signs the user in (a
// recovery session), so leaving the password step signs them back out.
export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [otpCode, setOtpCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | 'confirm' | null>(null);
  const resendCooldown = useResendCooldown();
  // Time left before a rate-limited "Send Reset Code" can be tried again.
  const sendCooldown = useResendCooldown(0);
  const { style: shakeStyle, shake } = useShake();

  const normalizedEmail = email.trim().toLowerCase();
  const passwordValid = PASSWORD_RULES.every(([, test]) => test(password));
  const codeComplete = isOtpComplete(otpCode, EMAIL_OTP_LENGTH);
  const canSubmitPassword = passwordValid && confirmPassword.length > 0;

  useEffect(() => {
    if (errorMessage) {
      shake();
      feedback.error();
    }
  }, [errorMessage, shake]);

  async function sendResetCode() {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
    if (error) {
      const waitSeconds = rateLimitWaitSeconds(error);
      if (waitSeconds !== null) {
        // Shown as a live countdown instead of a static error.
        setErrorMessage(null);
        (step === 'email' ? sendCooldown : resendCooldown).restart(waitSeconds);
        shake();
        feedback.error();
        return false;
      }
      setErrorMessage(friendlyError(error));
      return false;
    }
    resendCooldown.restart();
    return true;
  }

  async function handleSendCode() {
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const sent = await sendResetCode();
    setSubmitting(false);
    if (sent) {
      setOtpCode('');
      setStep('code');
    }
  }

  async function handleResend() {
    setResendingCode(true);
    setErrorMessage(null);
    await sendResetCode();
    setResendingCode(false);
  }

  async function handleVerifyCode() {
    setSubmitting(true);
    setErrorMessage(null);
    // A valid recovery code signs the user in; the new password is set on that session.
    const { error } = await supabase.auth.verifyOtp({ email: normalizedEmail, token: otpCode, type: 'recovery' });
    setSubmitting(false);
    if (error) {
      setErrorMessage(friendlyError(error));
      return;
    }
    feedback.success();
    setStep('password');
  }

  // Abandoning the password step must not leave the recovery session signed in.
  const leave = useCallback(async () => {
    if (step === 'password') {
      await supabase.auth.signOut();
    }
    router.back();
  }, [router, step]);

  function handleBack() {
    setErrorMessage(null);
    if (step === 'code') {
      setStep('email');
    } else {
      void leave();
    }
  }

  useEffect(() => {
    if (step !== 'password') {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      void leave();
      return true;
    });
    return () => subscription.remove();
  }, [leave, step]);

  async function handleResetPassword() {
    if (!passwordValid) {
      setErrorMessage('Password must be 8+ characters with uppercase, lowercase, number, and symbol.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    // Reusing the old password is harmless: they're signed in and know it.
    if (updateError && updateError.code !== 'same_password') {
      setErrorMessage(friendlyError(updateError));
      return;
    }

    feedback.success();
    router.replace('/(tabs)');
  }

  const inputBox = (field: 'email' | 'password' | 'confirm') =>
    `h-[42px] flex-row items-center rounded-[9px] border px-3 ${focusedField === field ? 'border-[#2445B8] bg-white' : 'border-[#E2E5E9] bg-[#F1F2F4]'}`;

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-[#F7F8FA]">
      <ScrollView
        contentContainerClassName="flex-grow justify-center px-2 pt-8"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled">
        {/* No swipe-back on the password step: leaving it has to sign out first. */}
        <Stack.Screen options={{ gestureEnabled: step !== 'password' }} />
        {/* Separate layers: the entering animation and the shake both drive transform. */}
        <Animated.View entering={riseIn(0, 500)} className="w-full">
        <Animated.View style={shakeStyle} className="w-full rounded-[14px] bg-white px-6 py-7 shadow-lg shadow-black/10">
          <TouchableOpacity
            onPress={handleBack}
            accessibilityLabel="Back"
            className="absolute left-4 top-4 h-9 w-9 items-center justify-center rounded-full bg-[#F1F2F4]">
            <ArrowLeft size={18} color="#273142" />
          </TouchableOpacity>

          <View className="items-center">
            <FloatingIcon>
              <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-[#2445B8] shadow-lg shadow-[#2445B8]/40">
                <KeyRound size={26} color="#FFFFFF" />
              </View>
            </FloatingIcon>
            <Text className="text-headline-24 font-bold text-[#273142]">{TITLES[step]}</Text>
            <Text className="mt-1 text-center text-[12px] leading-5 text-[#697386]">
              {step === 'email' ? (
                "Enter your account's email and we'll send you a code to reset your password."
              ) : step === 'code' ? (
                <>
                  If an account exists for <Text className="font-semibold text-[#273142]">{normalizedEmail}</Text>, we sent it a {EMAIL_OTP_LENGTH}-digit code.
                </>
              ) : (
                'Code verified. Choose a new password for your account.'
              )}
            </Text>
          </View>

          {step === 'email' ? (
            <View className="mt-6">
              <Text className="mb-2 text-[12px] font-medium text-[#273142]">Email Address</Text>
              <View className={inputBox('email')}>
                <Mail size={17} color="#7C8798" />
                <TextInput
                  className="ml-2 flex-1 text-[13px] text-[#273142]"
                  placeholder="you@example.com"
                  placeholderTextColor="#9AA3B1"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  onSubmitEditing={handleSendCode}
                  returnKeyType="send"
                />
              </View>
            </View>
          ) : step === 'code' ? (
            <View className="mt-6">
              <OtpCodeInput
                length={EMAIL_OTP_LENGTH}
                value={otpCode}
                onChangeText={setOtpCode}
                onResend={handleResend}
                resendSecondsLeft={resendCooldown.secondsLeft}
                resending={resendingCode}
              />
            </View>
          ) : (
            <View className="mt-6 gap-4">
              <View>
                <Text className="mb-2 text-[12px] font-medium text-[#273142]">New Password</Text>
                <View className={inputBox('password')}>
                  <Lock size={17} color="#7C8798" />
                  <TextInput
                    className="ml-2 flex-1 text-[13px] text-[#273142]"
                    placeholder="********"
                    placeholderTextColor="#9AA3B1"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    value={password}
                    onChangeText={setPassword}
                    autoFocus
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword((visible) => !visible)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={17} color="#7C8798" /> : <Eye size={17} color="#7C8798" />}
                  </TouchableOpacity>
                </View>
                <View className="mt-2 gap-1">
                  {PASSWORD_RULES.map(([label, test]) => {
                    const passed = test(password);
                    return (
                      <View key={label} className="flex-row items-center gap-1.5">
                        {passed ? <CheckCircle2 size={13} color="#00A56A" /> : <Circle size={13} color="#9AA3B1" />}
                        <Text className={`text-[11px] ${passed ? 'text-[#00A56A]' : 'text-[#697386]'}`}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text className="mb-2 text-[12px] font-medium text-[#273142]">Repeat New Password</Text>
                <View className={inputBox('confirm')}>
                  <Lock size={17} color="#7C8798" />
                  <TextInput
                    className="ml-2 flex-1 text-[13px] text-[#273142]"
                    placeholder="********"
                    placeholderTextColor="#9AA3B1"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField('confirm')}
                    onBlur={() => setFocusedField(null)}
                    onSubmitEditing={handleResetPassword}
                    returnKeyType="go"
                  />
                </View>
                {confirmPassword.length >= password.length && confirmPassword.length > 0 && confirmPassword !== password ? (
                  <Text className="mt-1.5 text-[11px] text-[#E11D48]">Passwords do not match.</Text>
                ) : null}
              </View>
            </View>
          )}

          {step === 'email' && sendCooldown.secondsLeft > 0 ? (
            <Animated.Text entering={FadeIn.duration(200)} className="mt-4 text-[14px] text-[#FB7185]">
              Too many attempts. You can request a new code in {formatWait(sendCooldown.secondsLeft)}.
            </Animated.Text>
          ) : null}

          {errorMessage ? (
            <Animated.Text key={errorMessage} entering={FadeIn.duration(200)} className="mt-4 text-[14px] text-[#FB7185]">
              {errorMessage}
            </Animated.Text>
          ) : null}

          {step === 'email' ? (
            <TouchableOpacity
              onPress={handleSendCode}
              disabled={submitting || sendCooldown.secondsLeft > 0}
              className={`mt-4 h-[42px] justify-center rounded-[9px] ${sendCooldown.secondsLeft > 0 ? 'bg-[#A9B6E0]' : 'bg-[#2445B8]'}`}>
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-center text-[16px] font-bold text-white">
                  {sendCooldown.secondsLeft > 0 ? `Try again in ${formatWait(sendCooldown.secondsLeft)}` : 'Send Reset Code'}
                </Text>
              )}
            </TouchableOpacity>
          ) : step === 'code' ? (
            <TouchableOpacity
              onPress={handleVerifyCode}
              disabled={submitting || !codeComplete}
              className={`mt-4 h-[42px] justify-center rounded-[9px] ${codeComplete ? 'bg-[#2445B8]' : 'bg-[#A9B6E0]'}`}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-[16px] font-bold text-white">Verify Code</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleResetPassword}
              disabled={submitting || !canSubmitPassword}
              className={`mt-4 h-[42px] justify-center rounded-[9px] ${canSubmitPassword ? 'bg-[#2445B8]' : 'bg-[#A9B6E0]'}`}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-[16px] font-bold text-white">Reset Password & Log In</Text>}
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => void leave()} className="mt-4">
            <Text className="text-center text-[12px] text-[#697386]">
              Remembered it? <Text className="font-semibold text-[#7DA3FF]">Back to sign in</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
