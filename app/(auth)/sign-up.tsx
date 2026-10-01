import { supabase } from '@/lib/supabase';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Link, useRouter } from 'expo-router';
import { ArrowRight, Calendar, Check, ChevronDown, Eye, EyeOff, Lock, Mail, MapPin, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/hooks/auth-provider';
import OtpCodeInput, { EMAIL_OTP_LENGTH, isOtpComplete, useResendCooldown } from '@/components/OtpCodeInput';
import LegalNameFields from '@/components/LegalNameFields';
import MunicipalityPicker from '@/components/MunicipalityPicker';
import { displayNameFrom, legalNameColumns, validateLegalName, type LegalName } from '@/lib/names';
import TermsModal from '@/components/TermsModal';
import { riseIn, useShake } from '@/components/ui/motion';
import { rateLimitWaitSeconds } from '@/lib/rateLimit';
import { feedback } from '@/lib/sounds';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import type { BulacanMunicipality } from '@/lib/bulacan';
import { INTEREST_OPTIONS } from '@/lib/interests';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// PartyUp is 18+ only. The database enforces the same rule
// (enforce_adult_date_of_birth); this just fails fast with a clear message.
const MINIMUM_AGE = 18;

function latestAllowedBirthDate() {
  const today = new Date();
  return new Date(today.getFullYear() - MINIMUM_AGE, today.getMonth(), today.getDate());
}

function parseDateOfBirth(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // Reject rollovers like 02/31 silently becoming March 3.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function isAdult(value: string) {
  const date = parseDateOfBirth(value);
  return date !== null && date <= latestAllowedBirthDate();
}

const PASSWORD_RULES: [string, (value: string) => boolean][] = [
  ['At least 8 characters', (value) => value.length >= 8],
  ['Upper and lowercase letters', (value) => /[a-z]/.test(value) && /[A-Z]/.test(value)],
  ['A number', (value) => /\d/.test(value)],
  ['A symbol (e.g. ! @ #)', (value) => /[^A-Za-z0-9]/.test(value)],
];

function Field({ label, focused, error, children, hint }: { label: string; focused?: boolean; error?: boolean; children: ReactNode; hint?: ReactNode }) {
  return (
    <View>
      <Text className="mb-2 text-[12px] font-medium text-[#273142]">{label}</Text>
      <View className={`h-[44px] flex-row items-center rounded-[10px] border px-3 ${focused ? 'border-[#2445B8] bg-white' : error ? 'border-[#E11D48] bg-[#FFF5F6]' : 'border-[#E2E5E9] bg-[#F1F2F4]'}`}>{children}</View>
      {typeof hint === 'string' ? <Text className="mt-1.5 text-[11px] leading-4 text-[#697386]">{hint}</Text> : hint}
    </View>
  );
}

type RuleStatus = 'met' | 'pending' | 'failed';

// Unmet rules stay gray while the user is still typing, and turn red once
// they leave the field, so nobody has to hit Next to find out what's wrong.
function ruleStatus(met: boolean, touched: boolean): RuleStatus {
  return met ? 'met' : touched ? 'failed' : 'pending';
}

function RuleRow({ status, label }: { status: RuleStatus; label: string }) {
  const color = status === 'met' ? '#0F7B4B' : status === 'failed' ? '#E11D48' : '#9AA3B1';
  return (
    <View className="flex-row items-center gap-1.5">
      {status === 'failed' ? <X size={13} color={color} /> : <Check size={13} color={color} />}
      <Text className="text-[11px]" style={{ color: status === 'pending' ? '#697386' : color }}>{label}</Text>
    </View>
  );
}

export default function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, loading } = useAuth();
  const [legalName, setLegalName] = useState<LegalName>({ firstName: '', middleName: '', lastName: '', suffix: '' });
  const [noMiddleName, setNoMiddleName] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [municipality, setMunicipality] = useState<BulacanMunicipality | null>(null);
  const [showMunicipalityPicker, setShowMunicipalityPicker] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendingCode, setResendingCode] = useState(false);
  const resendCooldown = useResendCooldown();
  const { style: shakeStyle, shake } = useShake();
  const [focusedField, setFocusedField] = useState<'email' | 'password' | 'confirm' | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const focusProps = (field: NonNullable<typeof focusedField>) => ({
    onFocus: () => setFocusedField(field),
    onBlur: () => {
      setFocusedField((current) => (current === field ? null : current));
      if (field === 'password') setPasswordTouched(true);
      if (field === 'confirm') setConfirmTouched(true);
    },
  });
  const passwordFailing = passwordTouched && !PASSWORD_RULES.every(([, test]) => test(password));
  const passwordsMatch = confirmPassword === password;
  // Flag a mismatch early once the confirmation is as long as the password.
  const confirmFailing = !passwordsMatch && confirmPassword.length > 0 && (confirmTouched || confirmPassword.length >= password.length);

  // Every error path sets errorMessage, so react to it in one place.
  useEffect(() => {
    if (errorMessage) {
      shake();
      feedback.error();
    }
  }, [errorMessage, shake]);

  useEffect(() => {
    if (!loading && session) {
      router.replace('/(tabs)');
    }
  }, [loading, router, session]);

  async function handleSignUp() {
    const normalizedEmail = email.trim().toLowerCase();

    if (validateLegalName(legalName, noMiddleName) || !normalizedEmail || !password || !confirmPassword || !dateOfBirth.trim() || !municipality || interests.length === 0) {
      setErrorMessage('Please complete all profile details and select at least one interest.');
      return;
    }

    if (!isAdult(dateOfBirth)) {
      setErrorMessage(`You must be at least ${MINIMUM_AGE} years old to use PartyUp.`);
      return;
    }

    if (!termsAccepted) {
      setErrorMessage('Please accept the Terms and Conditions to continue.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!isStrongPassword(password)) {
      setErrorMessage('Password must be 8+ characters with uppercase, lowercase, number, and symbol.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          display_name: displayNameFrom(legalName),
          ...legalNameColumns(legalName, noMiddleName),
          date_of_birth: dateOfBirth.trim(),
          municipality,
          interests,
        },
      },
    });

    setSubmitting(false);

    if (error) {
      console.warn('Supabase signup failed:', {
        code: error.code,
        message: error.message,
        status: error.status,
      });
      setErrorMessage(describeAuthError(error.code, error.message));
      return;
    }

    if (data.session) {
      await finishSignUp(data.session.user.id);
      return;
    }

    // With email confirmation on, Supabase hides whether the address is taken:
    // it returns a user with no identities and sends no email.
    if (data.user && data.user.identities?.length === 0) {
      setErrorMessage('An account with this email already exists. Sign in instead.');
      return;
    }

    setOtpCode('');
    resendCooldown.restart();
    setStep(4);
  }

  async function handleVerifyEmail() {
    if (!isOtpComplete(otpCode, EMAIL_OTP_LENGTH)) {
      setErrorMessage('Enter the code from your email.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otpCode,
      type: 'email',
    });

    if (error || !data.session) {
      setSubmitting(false);
      setErrorMessage(error ? describeAuthError(error.code, error.message) : 'Verification failed. Try again.');
      return;
    }

    await finishSignUp(data.session.user.id);
    setSubmitting(false);
  }

  async function handleResendCode() {
    setResendingCode(true);
    setErrorMessage(null);
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
      setErrorMessage(describeAuthError(error.code, error.message));
      return;
    }
    resendCooldown.restart();
    setSuccessMessage('A new code is on its way.');
  }

  async function finishSignUp(userId: string) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        display_name: displayNameFrom(legalName),
        ...legalNameColumns(legalName, noMiddleName),
        date_of_birth: dateOfBirth.trim(),
        interests,
        city: municipality,
        country: 'Philippines',
        terms_accepted_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (profileError) {
      console.warn('Profile details were not saved:', profileError);
      setErrorMessage('Account created, but profile details could not be saved. Run the onboarding migration in Supabase.');
      await supabase.auth.signOut();
      return;
    }

    feedback.success();
    router.replace('/(tabs)');
  }

  function goToNextStep() {
    setErrorMessage(null);

    if (step === 1) {
      // Pressing Next counts as leaving the fields, so unmet rules show red.
      setPasswordTouched(true);
      setConfirmTouched(true);
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !password || !confirmPassword) {
        setErrorMessage('Enter your email, password, and confirm password.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        setErrorMessage('Please enter a valid email address.');
        return;
      }
      if (!isStrongPassword(password)) {
        setErrorMessage('Password must be 8+ characters with uppercase, lowercase, number, and symbol.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
    }

    if (step === 2) {
      const nameError = validateLegalName(legalName, noMiddleName);
      if (nameError) {
        setErrorMessage(nameError);
        return;
      }
      if (!parseDateOfBirth(dateOfBirth)) {
        setErrorMessage('Select your date of birth.');
        return;
      }
      if (!isAdult(dateOfBirth)) {
        setErrorMessage(`You must be at least ${MINIMUM_AGE} years old to use PartyUp.`);
        return;
      }
      if (!municipality) {
        setErrorMessage('Select your city or municipality in Bulacan.');
        return;
      }
    }

    setStep((currentStep) => currentStep + 1);
  }

  function toggleInterest(interest: string) {
    feedback.select();
    setInterests((currentInterests) => currentInterests.includes(interest) ? currentInterests.filter((item) => item !== interest) : [...currentInterests, interest]);
  }

  function describeAuthError(code: string | undefined, message: string) {
    if (code === 'otp_expired') {
      return 'That code is wrong or has expired. Check your email or resend a new one.';
    }
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
      return 'Too many attempts. Please wait a minute and try again.';
    }
    return message;
  }

  function isStrongPassword(value: string) {
    return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
  }

  function formatDate(date: Date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}/${day}/${date.getFullYear()}`;
  }

  function handleDateChange(_event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (selectedDate) {
      setDateOfBirth(formatDate(selectedDate));
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-[#F7F8FA]">
      <ScrollView contentContainerClassName="flex-grow justify-center px-4 pt-8"
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} keyboardShouldPersistTaps="handled">
        {/* Separate layers: the entering animation and the shake both drive transform. */}
        <Animated.View entering={riseIn(0, 500)} className="w-full">
        <Animated.View style={shakeStyle} className="w-full rounded-[14px] bg-white px-5 py-6 shadow-lg shadow-black/10">
          <View className="items-center">
            <Text className="text-headline-24 font-bold text-[#2445B8]">Join PartyUp</Text>
            <Text className="mt-1 text-[13px] text-[#697386]">{step === 1 ? 'Create your account' : step === 2 ? 'Complete your profile' : step === 3 ? 'Select your interests' : 'Verify your email'}</Text>
          </View>

          <View className="mt-6 flex-row gap-1.5">
            {[1, 2, 3, 4].map((item) => (
              <Animated.View
                key={item}
                className="h-[4px] flex-1 rounded-full"
                style={{ backgroundColor: item <= step ? '#2445B8' : '#BCC7E5', transitionProperty: 'backgroundColor', transitionDuration: 350 }}
              />
            ))}
          </View>

          {/* key={step} remounts the fields each step so they slide in fresh. */}
          <Animated.View key={step} entering={FadeInRight.duration(280)} className="mt-5 gap-4">
            {step === 1 ? <>
              <Field label="Email Address" focused={focusedField === 'email'}>
                <Mail size={17} color="#7C8798" />
                <TextInput className="ml-2 flex-1 text-[14px] text-[#273142]" placeholder="you@example.com" placeholderTextColor="#9AA3B1" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} value={email} onChangeText={setEmail} {...focusProps('email')} />
              </Field>
              <Field
                label="Password"
                focused={focusedField === 'password'}
                error={passwordFailing}
                hint={
                  <View className="mt-2 gap-1">
                    {PASSWORD_RULES.map(([label, test]) => <RuleRow key={label} label={label} status={ruleStatus(test(password), passwordTouched)} />)}
                  </View>
                }>
                <Lock size={17} color="#7C8798" />
                <TextInput ref={passwordRef} className="ml-2 flex-1 text-[14px] text-[#273142]" placeholder="Create a password" placeholderTextColor="#9AA3B1" secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmRef.current?.focus()} value={password} onChangeText={setPassword} {...focusProps('password')} />
                <TouchableOpacity onPress={() => setShowPassword((visible) => !visible)} hitSlop={10} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} color="#7C8798" /> : <Eye size={17} color="#7C8798" />}</TouchableOpacity>
              </Field>
              <Field
                label="Confirm Password"
                focused={focusedField === 'confirm'}
                error={confirmFailing}
                hint={confirmPassword ? <View className="mt-2"><RuleRow status={ruleStatus(passwordsMatch, confirmFailing)} label={passwordsMatch ? 'Passwords match' : 'Passwords do not match'} /></View> : undefined}>
                <Lock size={17} color="#7C8798" />
                <TextInput ref={confirmRef} className="ml-2 flex-1 text-[14px] text-[#273142]" placeholder="Re-enter your password" placeholderTextColor="#9AA3B1" secureTextEntry={!showConfirmPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={goToNextStep} value={confirmPassword} onChangeText={setConfirmPassword} {...focusProps('confirm')} />
                <TouchableOpacity onPress={() => setShowConfirmPassword((visible) => !visible)} hitSlop={10} accessibilityLabel={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}>{showConfirmPassword ? <EyeOff size={17} color="#7C8798" /> : <Eye size={17} color="#7C8798" />}</TouchableOpacity>
              </Field>
            </> : null}

            {step === 2 ? <>
              <LegalNameFields value={legalName} onChange={setLegalName} noMiddleName={noMiddleName} onNoMiddleNameChange={setNoMiddleName} />
              <View>
                <Text className="mb-2 text-[12px] font-medium text-[#273142]">Date of Birth</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(true)} className={`h-[44px] flex-row items-center rounded-[10px] border px-3 ${showDatePicker ? 'border-[#2445B8] bg-white' : 'border-[#E2E5E9] bg-[#F1F2F4]'}`}><Calendar size={17} color="#7C8798" /><Text className={`ml-2 flex-1 text-[14px] ${dateOfBirth ? 'text-[#273142]' : 'text-[#9AA3B1]'}`}>{dateOfBirth || 'mm/dd/yyyy'}</Text><ChevronDown size={17} color="#7C8798" /></TouchableOpacity>
                {showDatePicker ? <DateTimePicker value={parseDateOfBirth(dateOfBirth) ?? new Date(2000, 0, 1)} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} maximumDate={latestAllowedBirthDate()} onChange={handleDateChange} /> : null}
                <Text className="mt-1.5 text-[11px] leading-4 text-[#697386]">You must be 18 or older. Required for safety verification when traveling with others.</Text>
              </View>
              <View>
                <Text className="mb-2 text-[12px] font-medium text-[#273142]">City / Municipality in Bulacan</Text>
                <TouchableOpacity onPress={() => setShowMunicipalityPicker(true)} className={`h-[44px] flex-row items-center rounded-[10px] border px-3 ${showMunicipalityPicker ? 'border-[#2445B8] bg-white' : 'border-[#E2E5E9] bg-[#F1F2F4]'}`}><MapPin size={17} color="#7C8798" /><Text className={`ml-2 flex-1 text-[14px] ${municipality ? 'text-[#273142]' : 'text-[#9AA3B1]'}`}>{municipality ?? 'Select where you live'}</Text><ChevronDown size={17} color="#7C8798" /></TouchableOpacity>
                <Text className="mt-1.5 text-[11px] leading-4 text-[#697386]">PartyUp is currently for Bulacan residents. You can still travel anywhere.</Text>
              </View>
            </> : null}

            {step === 3 ? <View className="flex-row flex-wrap justify-between gap-y-2.5">{INTEREST_OPTIONS.map(([interest, icon]) => <TouchableOpacity key={interest} onPress={() => toggleInterest(interest)} className={`h-[60px] w-[48%] items-center justify-center rounded-[10px] border ${interests.includes(interest) ? 'border-[#2445B8] bg-[#E9EEFF]' : 'border-[#E2E5E9] bg-[#F4F5F6]'}`}><Text className="text-[18px]">{icon}</Text><View className="mt-1 flex-row items-center gap-1"><Text className="text-[12px] font-medium text-[#273142]">{interest}</Text>{interests.includes(interest) ? <Check size={13} color="#2445B8" /> : null}</View></TouchableOpacity>)}</View> : null}

            {step === 4 ? (
              <View>
                <Text className="mb-3 text-center text-[13px] leading-5 text-[#697386]">
                  We sent a code to <Text className="font-semibold text-[#273142]">{email.trim().toLowerCase()}</Text>. Enter it below to activate your account.
                </Text>
                <OtpCodeInput length={EMAIL_OTP_LENGTH} value={otpCode} onChangeText={setOtpCode} onResend={handleResendCode} resendSecondsLeft={resendCooldown.secondsLeft} resending={resendingCode} compact />
              </View>
            ) : null}

            {step === 3 ? (
              <TouchableOpacity onPress={() => setTermsAccepted((accepted) => !accepted)} className="mt-1 flex-row items-start gap-2">
                <View className={`h-[20px] w-[20px] items-center justify-center rounded-[5px] border ${termsAccepted ? 'border-[#2445B8] bg-[#2445B8]' : 'border-[#B4BCC8] bg-white'}`}>
                  {termsAccepted ? <Check size={13} color="#FFFFFF" /> : null}
                </View>
                <Text className="flex-1 text-[13px] leading-5 text-[#697386]">
                  I agree to the{' '}
                  <Text className="font-semibold text-[#2445B8]" onPress={() => setShowTermsModal(true)}>
                    Terms and Conditions
                  </Text>
                </Text>
              </TouchableOpacity>
            ) : null}
          </Animated.View>

          <MunicipalityPicker visible={showMunicipalityPicker} selected={municipality} onSelect={setMunicipality} onClose={() => setShowMunicipalityPicker(false)} />

          {errorMessage ? (
            <Animated.Text key={errorMessage} entering={FadeIn.duration(200)} className="mt-4 text-[13px] leading-5 text-[#E11D48]">
              {errorMessage}
            </Animated.Text>
          ) : null}
          {successMessage ? <Text className="mt-4 text-[13px] text-[#0F7B4B]">{successMessage}</Text> : null}

          <View className="mt-5 flex-row gap-2.5">
            {step > 1 && step < 4 ? <TouchableOpacity onPress={() => { setErrorMessage(null); setStep((currentStep) => currentStep - 1); }} className="h-[44px] flex-1 items-center justify-center rounded-[10px] bg-[#F0F1F3]"><Text className="text-[14px] font-semibold text-[#273142]">&#8592; Back</Text></TouchableOpacity> : null}
            <TouchableOpacity
              onPress={step === 4 ? handleVerifyEmail : step === 3 ? handleSignUp : goToNextStep}
              disabled={submitting || (step === 3 && !termsAccepted) || (step === 4 && !isOtpComplete(otpCode, EMAIL_OTP_LENGTH))}
              className={`h-[44px] flex-1 flex-row items-center justify-center rounded-[10px] ${(step === 3 && !termsAccepted) || (step === 4 && !isOtpComplete(otpCode, EMAIL_OTP_LENGTH)) ? 'bg-[#A9B6E0]' : 'bg-[#2445B8]'}`}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <><Text className="text-center text-[15px] font-bold text-white">{step === 4 ? 'Verify & Continue' : step === 3 ? 'Create Account' : 'Next'}{step < 3 ? ' ' : ''}</Text>{step < 3 ? <ArrowRight size={16} color="#FFFFFF" /> : null}</>}
            </TouchableOpacity>
          </View>

          {step === 1 ? <>
            <Text className="mt-5 text-center text-[13px] text-[#697386]">Already have an account? <Link href="/(auth)/sign-in" className="font-semibold text-[#2445B8]">Sign in</Link></Text>
          </> : null}
        </Animated.View>
        </Animated.View>
        {step < 3 ? <Text className="mt-5 px-3 text-center text-[11px] leading-4 text-[#697386]">By signing up, you agree to our Terms of Service and Privacy Policy</Text> : null}
      </ScrollView>
      <TermsModal visible={showTermsModal} onClose={() => setShowTermsModal(false)} />
    </KeyboardAvoidingView>
  );
}