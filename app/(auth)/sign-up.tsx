import { supabase } from '@/lib/supabase';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Link, useRouter } from 'expo-router';
import { ArrowRight, Calendar, Check, Eye, EyeOff, Github, Lock, Mail, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/hooks/auth-provider';

export default function SignUpScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [interests, setInterests] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) {
      router.replace('/(tabs)');
    }
  }, [loading, router, session]);

  async function handleSignUp() {
    const normalizedEmail = email.trim().toLowerCase();

    if (!fullName.trim() || !normalizedEmail || !password || !confirmPassword || !dateOfBirth.trim() || interests.length === 0) {
      setErrorMessage('Please complete all profile details and select at least one interest.');
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
          display_name: fullName.trim(),
          date_of_birth: dateOfBirth.trim(),
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
      if (error.code === 'over_email_send_rate_limit') {
        setErrorMessage('Supabase email limit reached. Disable email confirmation in Supabase Auth settings, then try again.');
      } else {
        setErrorMessage(error.message);
      }
      return;
    }

    if (data.session) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: fullName.trim(),
          date_of_birth: dateOfBirth.trim(),
          interests,
        })
        .eq('id', data.session.user.id);

      if (profileError) {
        console.warn('Profile details were not saved:', profileError);
        setErrorMessage('Account created, but profile details could not be saved. Run the onboarding migration in Supabase.');
        await supabase.auth.signOut();
        return;
      }

      router.replace('/(tabs)');
      return;
    }

    // Email confirmation required or other verification
    setSuccessMessage('Account created successfully! Sign in to continue.');
  }

  function goToNextStep() {
    setErrorMessage(null);

    if (step === 1) {
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
      if (!fullName.trim() || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth.trim())) {
        setErrorMessage('Enter your full name and date of birth as MM/DD/YYYY.');
        return;
      }
    }

    setStep((currentStep) => currentStep + 1);
  }

  function toggleInterest(interest: string) {
    setInterests((currentInterests) => currentInterests.includes(interest) ? currentInterests.filter((item) => item !== interest) : [...currentInterests, interest]);
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

  const interestOptions = [
    ['Backpacking', '🎒'],
    ['Luxury Travel', '✨'],
    ['Adventure', '🏕'],
    ['Cultural', '🏛'],
    ['Beach', '🏖'],
    ['Hiking', '🌄'],
    ['City', '🏙'],
    ['Food', '🍜'],
    ['Nightlife', '🎉'],
    ['Photography', '📷'],
    ['Wellness', '🧘'],
    ['Budget', '💰'],
  ] as const;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-[#F7F8FA]">
      <ScrollView contentContainerClassName="flex-grow justify-center px-2 py-7" keyboardShouldPersistTaps="handled">
        <View className="w-full rounded-[14px] bg-white px-5 py-5 shadow-lg shadow-black/10">
          <View className="items-center">
            <Text className="text-[22px] font-black text-[#2445B8]">Join PartyUp</Text>
            <Text className="mt-1 text-[10px] text-[#697386]">{step === 1 ? 'Create your account' : step === 2 ? 'Complete your profile' : 'Select your interests'}</Text>
          </View>

          <View className="mt-7 flex-row gap-1.5">
            {[1, 2, 3].map((item) => <View key={item} className={`h-[3px] flex-1 rounded-full ${item <= step ? 'bg-[#2445B8]' : 'bg-[#BCC7E5]'}`} />)}
          </View>

          <View className="mt-4 gap-3">
            {step === 1 ? <>
              <View>
                <Text className="mb-1.5 text-[10px] font-medium text-[#273142]">Email Address</Text>
                <View className="h-[34px] flex-row items-center rounded-[8px] border border-[#E2E5E9] bg-[#F1F2F4] px-2.5"><Mail size={14} color="#7C8798" /><TextInput className="ml-2 flex-1 text-[11px] text-[#273142]" placeholder="you@example.com" placeholderTextColor="#9AA3B1" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} /></View>
              </View>
              <View>
                <Text className="mb-1.5 text-[10px] font-medium text-[#273142]">Password</Text>
                <View className="h-[34px] flex-row items-center rounded-[8px] border border-[#E2E5E9] bg-[#F1F2F4] px-2.5"><Lock size={14} color="#7C8798" /><TextInput className="ml-2 flex-1 text-[11px] text-[#273142]" placeholder="********" placeholderTextColor="#9AA3B1" secureTextEntry={!showPassword} value={password} onChangeText={setPassword} /><TouchableOpacity onPress={() => setShowPassword((visible) => !visible)} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={14} color="#7C8798" /> : <Eye size={14} color="#7C8798" />}</TouchableOpacity></View>
                <Text className="mt-1 text-[9px] text-[#697386]">At least 8 characters</Text>
              </View>
              <View>
                <Text className="mb-1.5 text-[10px] font-medium text-[#273142]">Confirm Password</Text>
                <View className="h-[34px] flex-row items-center rounded-[8px] border border-[#E2E5E9] bg-[#F1F2F4] px-2.5"><Lock size={14} color="#7C8798" /><TextInput className="ml-2 flex-1 text-[11px] text-[#273142]" placeholder="********" placeholderTextColor="#9AA3B1" secureTextEntry={!showConfirmPassword} value={confirmPassword} onChangeText={setConfirmPassword} /><TouchableOpacity onPress={() => setShowConfirmPassword((visible) => !visible)} accessibilityLabel={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}>{showConfirmPassword ? <EyeOff size={14} color="#7C8798" /> : <Eye size={14} color="#7C8798" />}</TouchableOpacity></View>
              </View>
            </> : null}

            {step === 2 ? <>
              <View>
                <Text className="mb-1.5 text-[10px] font-medium text-[#273142]">Full Name</Text>
                <View className="h-[34px] flex-row items-center rounded-[8px] border border-[#E2E5E9] bg-[#F1F2F4] px-2.5"><User size={14} color="#7C8798" /><TextInput className="ml-2 flex-1 text-[11px] text-[#273142]" placeholder="John Doe" placeholderTextColor="#9AA3B1" autoCapitalize="words" value={fullName} onChangeText={setFullName} /></View>
              </View>
              <View>
                <Text className="mb-1.5 text-[10px] font-medium text-[#273142]">Date of Birth</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(true)} className="h-[34px] flex-row items-center rounded-[8px] border border-[#E2E5E9] bg-[#F1F2F4] px-2.5"><Calendar size={14} color="#7C8798" /><Text className={`ml-2 flex-1 text-[11px] ${dateOfBirth ? 'text-[#273142]' : 'text-[#697386]'}`}>{dateOfBirth || 'mm/dd/yyyy'}</Text></TouchableOpacity>
                {showDatePicker ? <DateTimePicker value={new Date(2000, 0, 1)} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} maximumDate={new Date()} onChange={handleDateChange} /> : null}
                <Text className="mt-1 text-[9px] leading-3 text-[#697386]">Required for safety verification when traveling{`\n`}with others</Text>
              </View>
            </> : null}

            {step === 3 ? <View className="flex-row flex-wrap justify-between gap-y-2">{interestOptions.map(([interest, icon]) => <TouchableOpacity key={interest} onPress={() => toggleInterest(interest)} className={`h-[48px] w-[48%] items-center justify-center rounded-[8px] border ${interests.includes(interest) ? 'border-[#2445B8] bg-[#E9EEFF]' : 'border-[#E2E5E9] bg-[#F4F5F6]'}`}><Text className="text-[14px]">{icon}</Text><Text className="mt-0.5 text-[9px] font-medium text-[#273142]">{interest}</Text>{interests.includes(interest) ? <Check size={11} color="#2445B8" /> : null}</TouchableOpacity>)}</View> : null}
          </View>

          {errorMessage ? <Text className="mt-4 text-[14px] text-[#FB7185]">{errorMessage}</Text> : null}
          {successMessage ? <Text className="mt-4 text-[14px] text-[#A7F3D0]">{successMessage}</Text> : null}

          <View className="mt-4 flex-row gap-2">
            {step > 1 ? <TouchableOpacity onPress={() => { setErrorMessage(null); setStep((currentStep) => currentStep - 1); }} className="h-[34px] flex-1 items-center justify-center rounded-[8px] bg-[#F0F1F3]"><Text className="text-[10px] font-medium text-[#273142]">&#8592; Back</Text></TouchableOpacity> : null}
            <TouchableOpacity onPress={step === 3 ? handleSignUp : goToNextStep} disabled={submitting} className="h-[34px] flex-1 flex-row items-center justify-center rounded-[8px] bg-[#2445B8]">
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <><Text className="text-center text-[10px] font-bold text-white">{step === 3 ? 'Create Account' : 'Next'}{step < 3 ? ' ' : ''}</Text>{step < 3 ? <ArrowRight size={12} color="#FFFFFF" /> : null}</>}
            </TouchableOpacity>
          </View>

          {step === 1 ? <>
            <View className="mt-4 flex-row items-center"><View className="h-px flex-1 bg-[#E8EAED]" /><Text className="px-2 text-[10px] text-[#8A919D]">Or continue with</Text><View className="h-px flex-1 bg-[#E8EAED]" /></View>
            <View className="mt-3 flex-row gap-2"><TouchableOpacity className="h-[30px] flex-1 flex-row items-center justify-center rounded-[8px] border border-[#E4E6E9] bg-[#F4F5F6]" accessibilityLabel="Continue with Google"><Text className="mr-1.5 text-[12px] font-bold text-[#4285F4]">G</Text><Text className="text-[10px] font-medium text-[#273142]">Google</Text></TouchableOpacity><TouchableOpacity className="h-[30px] flex-1 flex-row items-center justify-center rounded-[8px] border border-[#E4E6E9] bg-[#F4F5F6]" accessibilityLabel="Continue with GitHub"><Github size={12} color="#383443" /><Text className="ml-1.5 text-[10px] font-medium text-[#273142]">GitHub</Text></TouchableOpacity></View>
            <Text className="mt-4 text-center text-[10px] text-[#697386]">Already have an account? <Link href="/(auth)/sign-in" className="font-semibold text-[#2445B8]">Sign in</Link></Text>
          </> : null}
        </View>
        <Text className="mt-5 px-3 text-center text-[9px] leading-3 text-[#697386]">By signing up, you agree to our Terms of Service and{`\n`}Privacy Policy</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}