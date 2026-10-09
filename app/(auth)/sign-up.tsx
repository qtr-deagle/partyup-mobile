import { supabase } from '@/lib/supabase';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Link, useRouter } from 'expo-router';
import { AlertCircle, ArrowLeft, ArrowRight, Calendar, Check, ChevronDown, Eye, EyeOff, Lock, Mail, MailCheck, MapPin, Phone, X } from 'lucide-react-native';
import { PHONE_INVALID_MESSAGE, formatPhone, isValidPhone, normalizePhone } from '@/lib/phone';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/hooks/auth-provider';
import OtpCodeInput, { EMAIL_OTP_LENGTH, isOtpComplete, useResendCooldown } from '@/components/OtpCodeInput';
import LegalNameFields from '@/components/LegalNameFields';
import MunicipalityPicker from '@/components/MunicipalityPicker';
import { displayNameFrom, legalNameColumns, validateLegalName, type LegalName } from '@/lib/names';
import LegalModal, { type LegalDoc } from '@/components/LegalModal';
import { riseIn, useShake } from '@/components/ui/motion';
import { rateLimitWaitSeconds } from '@/lib/rateLimit';
import { feedback } from '@/lib/sounds';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import type { BulacanMunicipality } from '@/lib/bulacan';
import { INTEREST_OPTIONS } from '@/lib/interests';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTH_BRAND, AUTH_ICON, AUTH_INPUT_CLASS, AUTH_PLACEHOLDER, AuthField, AuthPrimaryButton, AuthSecondaryButton } from '@/components/auth/AuthUI';

// PartyUp is 18+ only. The database enforces the same rule
// (enforce_adult_date_of_birth); this just fails fast with a clear message.
const MINIMUM_AGE = 18;

// Gmail only for now: it keeps out temp-mail signups. The server enforces
// the same rule (enforce_gmail_signup trigger on auth.users).
const GMAIL_ONLY_MESSAGE = 'Please use a Gmail address (@gmail.com) to sign up.';

function isGmailAddress(email: string) {
  const domain = email.split('@').pop();
  return domain === 'gmail.com' || domain === 'googlemail.com';
}

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
  // 09XXXXXXXXX
  const [phone, setPhone] = useState('');
  const [showMunicipalityPicker, setShowMunicipalityPicker] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendingCode, setResendingCode] = useState(false);
  const resendCooldown = useResendCooldown();
  const { style: shakeStyle, shake } = useShake();
  const [focusedField, setFocusedField] = useState<'email' | 'password' | 'confirm' | 'phone' | null>(null);
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

  // Steps 1-3 hold typed details; leaving asks first. Step 4 (email code)
  // comes after the account exists, so there's nothing left to lose.
  const dirty =
    step < 4 &&
    !!(legalName.firstName.trim() || legalName.lastName.trim() || email.trim() || password || dateOfBirth || municipality || phone || interests.length);
  const { allowLeave } = useUnsavedChangesGuard(dirty, {
    title: 'Leave sign up?',
    message: "What you've entered so far won't be saved.",
  });

  // Android back on steps 2-3 goes to the previous step instead of leaving.
  useEffect(() => {
    if (step <= 1 || step >= 4) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setErrorMessage(null);
      setStep((current) => current - 1);
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  useEffect(() => {
    if (!loading && session) {
      allowLeave();
      router.replace('/(tabs)');
    }
  }, [allowLeave, loading, router, session]);

  async function handleSignUp() {
    const normalizedEmail = email.trim().toLowerCase();

    if (validateLegalName(legalName, noMiddleName) || !normalizedEmail || !password || !confirmPassword || !dateOfBirth.trim() || !municipality || !isValidPhone(phone) || interests.length === 0) {
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

    if (!isGmailAddress(normalizedEmail)) {
      setErrorMessage(GMAIL_ONLY_MESSAGE);
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
          phone,
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
        phone,
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
      if (!isGmailAddress(normalizedEmail)) {
        setErrorMessage(GMAIL_ONLY_MESSAGE);
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
      if (!isValidPhone(phone)) {
        setErrorMessage(phone ? PHONE_INVALID_MESSAGE : 'Enter your mobile number.');
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

  const stepTitle = step === 1 ? 'Create your account' : step === 2 ? 'Tell us about you' : step === 3 ? 'What do you love?' : 'Verify your email';
  const stepSubtitle = step === 1
    ? 'Start with your Gmail and a strong password.'
    : step === 2
      ? 'This should match your government ID.'
      : step === 3
        ? 'Pick a few interests so we can match you better.'
        : 'Almost there. Enter the code we emailed you.';
  const pickerBoxClass = (open: boolean) =>
    `h-[52px] flex-row items-center rounded-2xl border-[1.5px] px-4 ${open ? 'border-[#2445B8] bg-white' : 'border-transparent bg-[#F1F2F4]'}`;

  return (
    <View className="flex-1 bg-[#F7F8FA]">
      {/* Fixed top bar: stays visible while the form scrolls underneath. */}
      <View className="z-10 border-b border-[#E2E5E9] bg-[#F7F8FA] px-5 pb-3" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => {
              setErrorMessage(null);
              if (step > 1 && step < 4) setStep((currentStep) => currentStep - 1);
              else if (router.canGoBack()) router.back();
              else router.replace('/(auth)/sign-in');
            }}
            hitSlop={10}
            accessibilityLabel="Go back"
            className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-md shadow-black/10">
            <ArrowLeft size={20} color="#273142" />
          </TouchableOpacity>
          <View className="rounded-full bg-[#E9EEFF] px-3 py-1.5">
            <Text className="text-[12px] font-semibold text-[#2445B8]">Step {step} of 4</Text>
          </View>
        </View>

        <View className="mt-3 flex-row gap-1.5">
          {[1, 2, 3, 4].map((item) => (
            <Animated.View
              key={item}
              className="h-[5px] flex-1 rounded-full"
              style={{ backgroundColor: item <= step ? '#2445B8' : '#BCC7E5', transitionProperty: 'backgroundColor', transitionDuration: 350 }}
            />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        {/* Centered card, like sign-in; long steps scroll. */}
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: insets.bottom + 20 }}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-[420px] self-center">
          <Animated.View entering={riseIn(0, 450)} className="px-2 pb-5">
            <Text className="text-headline-24 font-bold text-[#2445B8]">{stepTitle}</Text>
            <Text className="mt-1 text-[14px] leading-[21px] text-[#697386]">{stepSubtitle}</Text>
          </Animated.View>

          {/* Separate layers: the entering animation and the shake both drive transform. */}
          <Animated.View entering={riseIn(120, 500)}>
            <View className="rounded-[28px] bg-white px-6 py-7 shadow-lg shadow-black/10">
              <Animated.View style={shakeStyle}>
                {/* key={step} remounts the fields each step so they slide in fresh. */}
                <Animated.View key={step} entering={FadeInRight.duration(280)} className="gap-5">
                  {step === 1 ? <>
                    <AuthField label="Gmail Address" focused={focusedField === 'email'}>
                      <Mail size={18} color={focusedField === 'email' ? AUTH_BRAND : AUTH_ICON} />
                      <TextInput className={AUTH_INPUT_CLASS} placeholder="you@gmail.com" placeholderTextColor={AUTH_PLACEHOLDER} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} value={email} onChangeText={setEmail} {...focusProps('email')} />
                    </AuthField>
                    <AuthField
                      label="Password"
                      focused={focusedField === 'password'}
                      error={passwordFailing}
                      hint={
                        <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1.5 px-1">
                          {PASSWORD_RULES.map(([label, test]) => <RuleRow key={label} label={label} status={ruleStatus(test(password), passwordTouched)} />)}
                        </View>
                      }>
                      <Lock size={18} color={focusedField === 'password' ? AUTH_BRAND : AUTH_ICON} />
                      <TextInput ref={passwordRef} className={AUTH_INPUT_CLASS} placeholder="Create a password" placeholderTextColor={AUTH_PLACEHOLDER} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => confirmRef.current?.focus()} value={password} onChangeText={setPassword} {...focusProps('password')} />
                      <TouchableOpacity onPress={() => setShowPassword((visible) => !visible)} hitSlop={10} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} color={AUTH_ICON} /> : <Eye size={18} color={AUTH_ICON} />}</TouchableOpacity>
                    </AuthField>
                    <AuthField
                      label="Confirm Password"
                      focused={focusedField === 'confirm'}
                      error={confirmFailing}
                      hint={confirmPassword ? <View className="mt-2 px-1"><RuleRow status={ruleStatus(passwordsMatch, confirmFailing)} label={passwordsMatch ? 'Passwords match' : 'Passwords do not match'} /></View> : undefined}>
                      <Lock size={18} color={focusedField === 'confirm' ? AUTH_BRAND : AUTH_ICON} />
                      <TextInput ref={confirmRef} className={AUTH_INPUT_CLASS} placeholder="Re-enter your password" placeholderTextColor={AUTH_PLACEHOLDER} secureTextEntry={!showConfirmPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={goToNextStep} value={confirmPassword} onChangeText={setConfirmPassword} {...focusProps('confirm')} />
                      <TouchableOpacity onPress={() => setShowConfirmPassword((visible) => !visible)} hitSlop={10} accessibilityLabel={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}>{showConfirmPassword ? <EyeOff size={18} color={AUTH_ICON} /> : <Eye size={18} color={AUTH_ICON} />}</TouchableOpacity>
                    </AuthField>
                  </> : null}

                  {step === 2 ? <>
                    <LegalNameFields value={legalName} onChange={setLegalName} noMiddleName={noMiddleName} onNoMiddleNameChange={setNoMiddleName} />
                    <View>
                      <Text className="mb-2 ml-1 text-[13px] font-semibold text-[#273142]">Date of Birth</Text>
                      <TouchableOpacity onPress={() => setShowDatePicker(true)} className={pickerBoxClass(showDatePicker)}><Calendar size={18} color={showDatePicker ? AUTH_BRAND : AUTH_ICON} /><Text className={`ml-3 flex-1 text-[15px] ${dateOfBirth ? 'text-[#273142]' : 'text-[#9AA3B1]'}`}>{dateOfBirth || 'mm/dd/yyyy'}</Text><ChevronDown size={18} color={AUTH_ICON} /></TouchableOpacity>
                      {showDatePicker ? <DateTimePicker value={parseDateOfBirth(dateOfBirth) ?? new Date(2000, 0, 1)} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} maximumDate={latestAllowedBirthDate()} onChange={handleDateChange} /> : null}
                      <Text className="ml-1 mt-1.5 text-[11px] leading-4 text-[#697386]">You must be 18 or older. Required for safety verification when traveling with others.</Text>
                    </View>
                    <View>
                      <Text className="mb-2 ml-1 text-[13px] font-semibold text-[#273142]">City / Municipality in Bulacan</Text>
                      <TouchableOpacity onPress={() => setShowMunicipalityPicker(true)} className={pickerBoxClass(showMunicipalityPicker)}><MapPin size={18} color={showMunicipalityPicker ? AUTH_BRAND : AUTH_ICON} /><Text className={`ml-3 flex-1 text-[15px] ${municipality ? 'text-[#273142]' : 'text-[#9AA3B1]'}`}>{municipality ?? 'Select where you live'}</Text><ChevronDown size={18} color={AUTH_ICON} /></TouchableOpacity>
                      <Text className="ml-1 mt-1.5 text-[11px] leading-4 text-[#697386]">PartyUp is currently for Bulacan residents. You can still travel anywhere.</Text>
                    </View>
                    <AuthField label="Mobile Number" focused={focusedField === 'phone'} hint="Only your trusted circle and the PartyUp safety team can see it.">
                      <Phone size={18} color={focusedField === 'phone' ? AUTH_BRAND : AUTH_ICON} />
                      <TextInput className={AUTH_INPUT_CLASS} placeholder="0917 123 4567" placeholderTextColor={AUTH_PLACEHOLDER} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={13} value={formatPhone(phone)} onChangeText={(text) => setPhone(normalizePhone(text))} {...focusProps('phone')} />
                    </AuthField>
                  </> : null}

                  {step === 3 ? (
                    <View>
                      <Text className="mb-3 ml-1 text-[12px] font-medium text-[#697386]">{interests.length === 0 ? 'Select at least one' : `${interests.length} selected`}</Text>
                      <View className="flex-row flex-wrap gap-2.5">
                        {INTEREST_OPTIONS.map(([interest, icon]) => {
                          const selected = interests.includes(interest);
                          return (
                            <TouchableOpacity
                              key={interest}
                              activeOpacity={0.8}
                              onPress={() => toggleInterest(interest)}
                              className={`flex-row items-center gap-2 rounded-full border-[1.5px] px-4 py-2.5 ${selected ? 'border-[#2445B8] bg-[#E9EEFF]' : 'border-[#E2E5E9] bg-white'}`}>
                              <Text className="text-[16px]">{icon}</Text>
                              <Text className={`text-[13px] font-semibold ${selected ? 'text-[#2445B8]' : 'text-[#273142]'}`}>{interest}</Text>
                              {selected ? <Check size={14} color={AUTH_BRAND} /> : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {step === 4 ? (
                    <View>
                      <View className="mb-5 items-center">
                        <View className="h-16 w-16 items-center justify-center rounded-full bg-[#E9EEFF]">
                          <MailCheck size={28} color={AUTH_BRAND} />
                        </View>
                        <Text className="mt-4 text-center text-[14px] leading-[21px] text-[#697386]">
                          We sent a code to{'\n'}<Text className="font-semibold text-[#273142]">{email.trim().toLowerCase()}</Text>
                        </Text>
                      </View>
                      <OtpCodeInput length={EMAIL_OTP_LENGTH} value={otpCode} onChangeText={setOtpCode} onResend={handleResendCode} resendSecondsLeft={resendCooldown.secondsLeft} resending={resendingCode} />
                    </View>
                  ) : null}

                  {step === 3 ? (
                    <TouchableOpacity onPress={() => setTermsAccepted((accepted) => !accepted)} className="flex-row items-center gap-3 rounded-2xl bg-[#F4F5F6] px-4 py-3.5">
                      <View className={`h-[22px] w-[22px] items-center justify-center rounded-[7px] border-[1.5px] ${termsAccepted ? 'border-[#2445B8] bg-[#2445B8]' : 'border-[#B4BCC8] bg-white'}`}>
                        {termsAccepted ? <Check size={14} color="#FFFFFF" /> : null}
                      </View>
                      <Text className="flex-1 text-[13px] leading-5 text-[#697386]">
                        I agree to the{' '}
                        <Text className="font-semibold text-[#2445B8]" onPress={() => setLegalDoc('terms')}>
                          Terms and Conditions
                        </Text>{' '}
                        and{' '}
                        <Text className="font-semibold text-[#2445B8]" onPress={() => setLegalDoc('privacy')}>
                          Privacy Policy
                        </Text>
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </Animated.View>

                {errorMessage ? (
                  <Animated.View key={errorMessage} entering={FadeIn.duration(200)} className="mt-5 flex-row items-start gap-2 rounded-2xl bg-[#FFF1F3] px-4 py-3">
                    <AlertCircle size={16} color="#E11D48" style={{ marginTop: 2 }} />
                    <Text className="flex-1 text-[13px] leading-5 text-[#BE123C]">{errorMessage}</Text>
                  </Animated.View>
                ) : null}
                {successMessage ? (
                  <View className="mt-5 flex-row items-center gap-2 rounded-2xl bg-[#ECFDF5] px-4 py-3">
                    <Check size={16} color="#0F7B4B" />
                    <Text className="flex-1 text-[13px] text-[#0F7B4B]">{successMessage}</Text>
                  </View>
                ) : null}

                <View className="mt-6 flex-row gap-3">
                  {step > 1 && step < 4 ? <AuthSecondaryButton label="Back" onPress={() => { setErrorMessage(null); setStep((currentStep) => currentStep - 1); }} className="flex-1" /> : null}
                  <AuthPrimaryButton
                    label={step === 4 ? 'Verify & Continue' : step === 3 ? 'Create Account' : 'Continue'}
                    onPress={step === 4 ? handleVerifyEmail : step === 3 ? handleSignUp : goToNextStep}
                    loading={submitting}
                    disabled={(step === 3 && !termsAccepted) || (step === 4 && !isOtpComplete(otpCode, EMAIL_OTP_LENGTH))}
                    trailing={step < 3 ? <ArrowRight size={18} color="#FFFFFF" /> : undefined}
                    className={step > 1 && step < 4 ? 'flex-[2]' : 'flex-1'}
                  />
                </View>
              </Animated.View>

              <MunicipalityPicker visible={showMunicipalityPicker} selected={municipality} onSelect={setMunicipality} onClose={() => setShowMunicipalityPicker(false)} />

              {step === 1 ? (
                <Text className="mt-6 text-center text-[13px] text-[#697386]">
                  Already have an account?{' '}
                  <Link href="/(auth)/sign-in" className="font-semibold text-[#2445B8]">Sign in</Link>
                </Text>
              ) : null}

            </View>
            {step < 3 ? (
              <Text className="mt-4 px-3 text-center text-[11px] leading-4 text-[#9AA3B1]">
                By signing up, you agree to our{' '}
                <Text className="font-semibold text-[#2445B8]" onPress={() => setLegalDoc('terms')}>Terms of Service</Text> and{' '}
                <Text className="font-semibold text-[#2445B8]" onPress={() => setLegalDoc('privacy')}>Privacy Policy</Text>
              </Text>
            ) : null}
          </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <LegalModal visible={legalDoc !== null} doc={legalDoc ?? 'terms'} onClose={() => setLegalDoc(null)} />
    </View>
  );
}
