import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatResidence } from '@/lib/bulacan';
import { INTEREST_OPTIONS } from '@/lib/interests';
import { feedback } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import { getTheme, typography } from '@/lib/theme';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NAME_MAX = 60;
const BIO_MAX = 160;

// Accepts 09XXXXXXXXX or +639XXXXXXXXX (spaces/dashes allowed) and stores +639XXXXXXXXX,
// the format staff tap-to-call from the SOS Center.
function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^\+639\d{9}$/.test(digits)) return digits;
  return null;
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
  const { titleColor } = getTheme(isDark);
  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const card = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E4EAF2] bg-white';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const input = isDark ? 'border-[#22324B] bg-[#18253C] text-white' : 'border-[#DCE3EF] bg-[#F4F6FA] text-[#1B2340]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggleInterest(interest: string) {
    setInterests((current) => (current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]));
  }

  async function handleSave() {
    if (!profile) return;
    const trimmedName = displayName.trim();
    const trimmedBio = bio.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setErrorMessage('Enter your full name.');
      feedback.error();
      return;
    }
    const normalizedPhone = trimmedPhone ? normalizePhone(trimmedPhone) : null;
    if (trimmedPhone && !normalizedPhone) {
      setErrorMessage('Enter a valid PH mobile number, e.g. 0917 123 4567.');
      feedback.error();
      return;
    }
    if (interests.length === 0) {
      setErrorMessage('Pick at least one interest so we can match you with travel buddies.');
      feedback.error();
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: trimmedName, bio: trimmedBio || null, phone: normalizedPhone, interests })
      .eq('id', profile.id);

    if (error) {
      setSaving(false);
      setErrorMessage(error.message);
      feedback.error();
      return;
    }

    await refreshProfile();
    setSaving(false);
    feedback.success();
    router.back();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className={`flex-1 ${background}`}>
      <View className={`border-b px-4 pb-4 ${border}`} style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center" accessibilityLabel="Go back">
            <ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} />
          </TouchableOpacity>
          <Text className={`ml-3 ${typography.pageTitle} ${titleColor}`}>Edit Profile</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-5" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View className={`gap-4 rounded-[22px] border p-4 ${card}`}>
          <View>
            <Text className={`mb-2 text-[13px] font-bold uppercase tracking-wide ${secondary}`}>Full Name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={NAME_MAX}
              placeholder="e.g. Juan Dela Cruz"
              placeholderTextColor={placeholderColor}
              className={`rounded-xl border px-4 py-3 text-[15px] ${input}`}
            />
          </View>

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
            <TextInput
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="e.g. 0917 123 4567"
              placeholderTextColor={placeholderColor}
              className={`rounded-xl border px-4 py-3 text-[15px] ${input}`}
            />
            <Text className={`mt-1.5 text-[12px] leading-4 ${secondary}`}>Lets the PartyUp safety team call you if you send an SOS.</Text>
          </View>
        </View>

        <View className={`rounded-[22px] border p-4 ${card}`}>
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
        </View>

        <View className={`rounded-[22px] border p-4 ${card}`}>
          <View className="flex-row items-center gap-2">
            <Lock size={16} color={isDark ? '#94A3B8' : '#6C7A95'} />
            <Text className={`text-[16px] font-bold ${primary}`}>Verified Details</Text>
          </View>
          <View className="mt-3 gap-2">
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
        </View>

        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        <TouchableOpacity onPress={handleSave} disabled={saving} className={`items-center rounded-2xl py-4 ${saving ? 'bg-[#A9B6E0]' : 'bg-[#2747C7]'}`}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[15px] font-bold text-white">Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
