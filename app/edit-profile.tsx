import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { useShake } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatResidence } from '@/lib/bulacan';
import { INTEREST_OPTIONS } from '@/lib/interests';
import { feedback } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import { GENDER_OPTIONS, getMyPlan, saveGenderPrefs, type Gender } from '@/lib/travelPlans';
import { useRouter } from 'expo-router';
import { Check, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BIO_MAX = 160;

// The field shows a fixed +63 prefix; the user types only the 10 digits
// after it (9XX XXX XXXX). Pasted 09... or +63... numbers are trimmed to fit.
// Saved as +639XXXXXXXXX, the format the SOS Center taps to call.
function toLocalDigits(input: string) {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('63')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

// "9171234567" -> "917 123 4567"
function formatLocal(digits: string) {
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean).join(' ');
}

function formatBirthday(iso: string | null) {
  if (!iso) return 'Not set';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function EditProfileScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const input = isDark ? 'border-[#22324B] bg-[#18253C] text-white' : 'border-[#DCE3EF] bg-[#F4F6FA] text-[#1B2340]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';

  const [bio, setBio] = useState(profile?.bio ?? '');
  // Just the digits after +63.
  const [phone, setPhone] = useState(toLocalDigits(profile?.phone ?? ''));
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [gender, setGender] = useState<Gender | null>(null);
  const [preferredGender, setPreferredGender] = useState<Gender[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { style: shakeStyle, shake } = useShake();

  useEffect(() => {
    if (!profile) return;
    void getMyPlan(profile.id).then(({ data }) => {
      if (!data) return;
      setGender(data.gender);
      setPreferredGender(data.preferred_gender);
    });
  }, [profile]);

  function togglePreferredGender(value: Gender) {
    setPreferredGender((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  function toggleInterest(interest: string) {
    setInterests((current) => (current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]));
  }

  async function handleSave() {
    if (!profile) return;
    const trimmedBio = bio.trim();

    const normalizedPhone = phone ? `+63${phone}` : null;
    if (phone && !/^9\d{9}$/.test(phone)) {
      setErrorMessage('Enter a valid PH mobile number after +63, e.g. 917 123 4567.');
      feedback.error();
      shake();
      return;
    }
    if (interests.length === 0) {
      setErrorMessage('Pick at least one interest so we can match you with travel buddies.');
      feedback.error();
      shake();
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    const { error } = await supabase
      .from('profiles')
      .update({ bio: trimmedBio || null, phone: normalizedPhone, interests })
      .eq('id', profile.id);

    const prefsResult = error ? null : await saveGenderPrefs(profile.id, gender, preferredGender);
    const saveError = error ?? prefsResult?.error;
    if (saveError) {
      setSaving(false);
      setErrorMessage(saveError.message);
      feedback.error();
      shake();
      return;
    }

    await refreshProfile();
    setSaving(false);
    feedback.success();
    router.back();
  }

  return (
    <KeyboardAvoidingView behavior="padding" className={`flex-1 ${background}`}>
      <ScreenHeader title="Edit Profile" />

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Card index={0} className="gap-4">
          <View>
            <View className="mb-2 flex-row items-center justify-between">
              <Text className={`text-[13px] font-bold uppercase tracking-wide ${secondary}`}>Bio</Text>
              <Text className={`text-[12px] ${secondary}`}>{bio.length}/{BIO_MAX}</Text>
            </View>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={BIO_MAX}
              multiline
              placeholder="Tell other travelers a little about yourself..."
              placeholderTextColor={placeholderColor}
              className={`min-h-[96px] rounded-xl border px-4 py-3 text-[15px] ${input}`}
              style={{ textAlignVertical: 'top' }}
            />
          </View>

          <View>
            <Text className={`mb-2 text-[13px] font-bold uppercase tracking-wide ${secondary}`}>Mobile Number (Optional)</Text>
            <View className={`flex-row items-center overflow-hidden rounded-xl border ${input}`}>
              <View className={`flex-row items-center gap-1.5 border-r px-3 py-3 ${isDark ? 'border-[#22324B]' : 'border-[#DCE3EF]'}`}>
                <Text className="text-[15px]">🇵🇭</Text>
                <Text className={`text-[15px] font-semibold ${primary}`}>+63</Text>
              </View>
              <TextInput
                value={formatLocal(phone)}
                onChangeText={(text) => setPhone(toLocalDigits(text))}
                keyboardType="phone-pad"
                maxLength={12}
                placeholder="917 123 4567"
                placeholderTextColor={placeholderColor}
                className={`flex-1 px-3 py-3 text-[15px] ${primary}`}
              />
            </View>
            <Text className={`mt-1.5 text-[12px] leading-4 ${secondary}`}>Lets the PartyUp safety team call you if you send an SOS.</Text>
          </View>
        </Card>

        <Card index={1}>
          <Text className={`text-[16px] font-bold ${primary}`}>Interests</Text>
          <Text className={`mt-1 text-[13px] ${secondary}`}>Used to match you with compatible travel buddies.</Text>
          <View className="mt-3 flex-row flex-wrap justify-between gap-y-2">
            {INTEREST_OPTIONS.map(([interest, icon]) => {
              const selected = interests.includes(interest);
              return (
                <TouchableOpacity
                  key={interest}
                  onPress={() => toggleInterest(interest)}
                  className={`h-[52px] w-[48.5%] flex-row items-center justify-center gap-1.5 rounded-xl border ${
                    selected ? 'border-[#2445B8] bg-[#E9EEFF]' : isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E2E5E9] bg-[#F4F5F6]'
                  }`}>
                  <Text className="text-[15px]">{icon}</Text>
                  <Text className={`text-[13px] font-medium ${selected ? 'text-[#2445B8]' : primary}`}>{interest}</Text>
                  {selected ? <Check size={13} color="#2445B8" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card index={2}>
          <Text className={`text-[16px] font-bold ${primary}`}>Match Preferences</Text>
          <Text className={`mt-1 text-[13px] ${secondary}`}>Used by Discover to score how well you match other travelers.</Text>
          <Text className={`mb-2 mt-4 text-[13px] font-bold uppercase tracking-wide ${secondary}`}>I am</Text>
          <View className="flex-row gap-2">
            {GENDER_OPTIONS.map((option) => (
              <TouchableOpacity
                  key={option.value}
                  onPress={() => setGender(gender === option.value ? null : option.value)}
                  className={`h-[48px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border ${
                    gender === option.value ? 'border-[#2445B8] bg-[#E9EEFF]' : isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E2E5E9] bg-[#F4F5F6]'
                  }`}>
                  <Text className={`text-[14px] font-medium ${gender === option.value ? 'text-[#2445B8]' : primary}`}>{option.label}</Text>
                  {gender === option.value ? <Check size={13} color="#2445B8" /> : null}
                </TouchableOpacity>
            ))}
          </View>
          <Text className={`mb-2 mt-4 text-[13px] font-bold uppercase tracking-wide ${secondary}`}>Preferred travel buddy</Text>
          <View className="flex-row gap-2">
            {GENDER_OPTIONS.map((option) => (
              <TouchableOpacity
                  key={option.value}
                  onPress={() => togglePreferredGender(option.value)}
                  className={`h-[48px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border ${
                    preferredGender.includes(option.value) ? 'border-[#2445B8] bg-[#E9EEFF]' : isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E2E5E9] bg-[#F4F5F6]'
                  }`}>
                  <Text className={`text-[14px] font-medium ${preferredGender.includes(option.value) ? 'text-[#2445B8]' : primary}`}>{option.label}</Text>
                  {preferredGender.includes(option.value) ? <Check size={13} color="#2445B8" /> : null}
                </TouchableOpacity>
            ))}
          </View>
          <Text className={`mt-1.5 text-[12px] leading-4 ${secondary}`}>Pick one or both. Leave both off if you&apos;re open to anyone.</Text>
        </Card>

        <Card index={3}>
          <View className="flex-row items-center gap-2">
            <Lock size={16} color={isDark ? '#94A3B8' : '#6C7A95'} />
            <Text className={`text-[16px] font-bold ${primary}`}>Verified Details</Text>
          </View>
          <View className="mt-3 gap-2">
            <View className="flex-row justify-between gap-4">
              <Text className={`text-[15px] ${secondary}`}>Full Name</Text>
              <Text className={`flex-1 text-right text-[15px] font-medium ${primary}`} numberOfLines={2}>{profile?.display_name || 'Not set'}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className={`text-[15px] ${secondary}`}>Birthday</Text>
              <Text className={`text-[15px] font-medium ${primary}`}>{formatBirthday(profile?.date_of_birth ?? null)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className={`text-[15px] ${secondary}`}>Home</Text>
              <Text className={`text-[15px] font-medium ${primary}`}>{formatResidence(profile?.city) || 'Not set'}</Text>
            </View>
          </View>
          <Text className={`mt-3 text-[12px] leading-4 ${secondary}`}>
            These were checked against your ID, so they can't be changed here. Contact PartyUp support if they need updating.
          </Text>
        </Card>

        {errorMessage ? (
          <Animated.View entering={FadeIn.duration(200)} style={shakeStyle} className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </Animated.View>
        ) : null}

        <AnimatedPressable onPress={handleSave} disabled={saving} className={`items-center rounded-2xl py-4 shadow-sm shadow-[#2747C7]/25 ${saving ? 'bg-[#A9B6E0]' : 'bg-[#2747C7]'}`}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[15px] font-bold text-white">Save Changes</Text>}
        </AnimatedPressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
