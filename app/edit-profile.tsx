import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useShake } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatResidence } from '@/lib/bulacan';
import { INTEREST_OPTIONS } from '@/lib/interests';
import { PHONE_INVALID_MESSAGE, PHONE_REQUIRED_MESSAGE, formatPhone, isValidPhone, normalizePhone } from '@/lib/phone';
import { feedback } from '@/lib/sounds';
import { supabase } from '@/lib/supabase';
import { getTheme } from '@/lib/theme';
import { GENDER_OPTIONS, getMyPlan, saveGenderPrefs, type Gender } from '@/lib/travelPlans';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { BadgeCheck, Cake, Check, Heart, Lock, MapPin, Phone, Sparkles, UserRound, Users } from 'lucide-react-native';
import type { ComponentType, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
const BIO_MAX = 160;
const BRAND = '#2445B8';
// Mirrors the database rules (migrations 202610090006 / 202610090007).
const PHONE_COOLDOWN_DAYS = 7;
const GENDER_COOLDOWN_DAYS = 30;

type IconType = ComponentType<{ size?: number; color?: string }>;

function formatBirthday(iso: string | null) {
  if (!iso) return 'Not set';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function shortDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

/** When a cooldown that started at `changedAt` ends, or null if it's already over. */
function lockedUntil(changedAt: string | null | undefined, days: number) {
  if (!changedAt) return null;
  const until = new Date(new Date(changedAt).getTime() + days * 86_400_000);
  return until > new Date() ? until : null;
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

export default function EditProfileScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const theme = getTheme(isDark);
  const primary = theme.primaryText;
  const secondary = theme.subtitleColor;
  const fieldBox = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#DCE3EF] bg-[#F4F6FA]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';
  const mutedIcon = isDark ? '#94A3B8' : '#6C7A95';

  const savedPhone = normalizePhone(profile?.phone ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  // 09XXXXXXXXX (older +63 numbers are converted when loaded).
  const [phone, setPhone] = useState(savedPhone);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [gender, setGender] = useState<Gender | null>(null);
  const [preferredGender, setPreferredGender] = useState<Gender[]>([]);
  // What's saved, to detect changes and to know whether "I am" was already set.
  const [savedPrefs, setSavedPrefs] = useState<{ gender: Gender | null; preferred: Gender[]; genderChangedAt: string | null }>({
    gender: null,
    preferred: [],
    genderChangedAt: null,
  });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { style: shakeStyle, shake } = useShake();

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    void (async () => {
      const [{ data }, changed] = await Promise.all([
        getMyPlan(profile.id),
        // Separate read: before migration 202610090007 is pushed the column doesn't exist.
        supabase.from('travel_plans').select('gender_changed_at').eq('user_id', profile.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const genderChangedAt = changed.error ? null : ((changed.data?.gender_changed_at as string | null) ?? null);
      setGender(data?.gender ?? null);
      setPreferredGender(data?.preferred_gender ?? []);
      setSavedPrefs({ gender: data?.gender ?? null, preferred: data?.preferred_gender ?? [], genderChangedAt });
    })();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const phoneLockedUntil = lockedUntil(profile?.phone_changed_at, PHONE_COOLDOWN_DAYS);
  const genderLockedUntil = lockedUntil(savedPrefs.genderChangedAt, GENDER_COOLDOWN_DAYS);
  // After the first pick, one more change is free before the 30-day rule starts.
  const genderFreeChangeLeft = !!savedPrefs.gender && !savedPrefs.genderChangedAt;

  const dirty =
    bio.trim() !== (profile?.bio ?? '').trim() ||
    phone !== savedPhone ||
    !sameSet(interests, profile?.interests ?? []) ||
    gender !== savedPrefs.gender ||
    !sameSet(preferredGender, savedPrefs.preferred);
  const { allowLeave } = useUnsavedChangesGuard(dirty, { message: "Your profile changes aren't saved yet. Leave anyway?" });

  function togglePreferredGender(value: Gender) {
    feedback.select();
    setPreferredGender((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  function toggleInterest(interest: string) {
    feedback.select();
    setInterests((current) => (current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest]));
  }

  function pickGender(value: Gender) {
    if (genderLockedUntil) return;
    feedback.select();
    setGender(value);
  }

  // Changing your number or "I am" asks first: a wrong number is the one the
  // safety team would call, and "I am" can't be changed back right away.
  function handleSavePress() {
    const notes: string[] = [];
    if (savedPhone && isValidPhone(phone) && phone !== savedPhone) {
      notes.push(`Mobile number: ${formatPhone(savedPhone)} → ${formatPhone(phone)}. You can change it again in ${PHONE_COOLDOWN_DAYS} days.`);
    }
    if (savedPrefs.gender && gender !== savedPrefs.gender) {
      const from = GENDER_OPTIONS.find((option) => option.value === savedPrefs.gender)?.label;
      const to = GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? 'not set';
      notes.push(`I am: ${from} → ${to}. After this you can change it once every ${GENDER_COOLDOWN_DAYS} days.`);
    }
    if (notes.length) {
      showAlert(notes.length > 1 ? 'Confirm these changes' : 'Confirm this change', notes.join('\n\n'), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => void handleSave() },
      ]);
      return;
    }
    void handleSave();
  }

  async function handleSave() {
    if (!profile) return;
    const trimmedBio = bio.trim();

    // Required: trips are blocked without it (see lib/phone.ts).
    if (!isValidPhone(phone)) {
      setErrorMessage(phone ? PHONE_INVALID_MESSAGE : PHONE_REQUIRED_MESSAGE);
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
      // Only send phone when it really changed: an old +63 number reads back as
      // 09…, and rewriting it would trip the phone-change cooldown trigger.
      .update({ bio: trimmedBio || null, interests, ...(phone !== savedPhone ? { phone } : {}) })
      .eq('id', profile.id);

    const prefsChanged = gender !== savedPrefs.gender || !sameSet(preferredGender, savedPrefs.preferred);
    const prefsResult = error || !prefsChanged ? null : await saveGenderPrefs(profile.id, gender, preferredGender);
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
    allowLeave();
    router.back();
  }

  const firstName = profile?.display_name?.trim().split(/\s+/)[0] ?? '';

  return (
    <KeyboardAvoidingView behavior="padding" className={`flex-1 ${theme.screenBackground}`}>
      <ScreenHeader title="Edit Profile" />

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-5" contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* Who you are: checked against your ID, so read-only. */}
        <Card index={0} className="overflow-hidden">
          {/* Card pads its content; the banner bleeds to the edges with negative margins. */}
          <View className={`-mx-4 -mt-4 h-16 ${isDark ? 'bg-[#1B2B4D]' : 'bg-[#E9EEFF]'}`} />
          <View className="-mt-9 px-1 pb-1">
            <View className="flex-row items-end gap-3">
              <View className={`h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full border-4 ${isDark ? 'border-[#111B2E] bg-[#1B2B4D]' : 'border-white bg-[#E9EEFF]'}`}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Text className="text-[26px] font-bold text-[#2445B8]">{(firstName[0] ?? '?').toUpperCase()}</Text>
                )}
              </View>
              <View className="mb-1 flex-1">
                <View className="flex-row items-center gap-1.5">
                  <Text numberOfLines={1} className={`shrink text-[18px] font-bold ${primary}`}>{profile?.display_name || 'Not set'}</Text>
                  {profile?.verification_status === 'approved' ? <BadgeCheck size={18} color="#00A56A" /> : null}
                </View>
                <Text className={`text-[12px] ${secondary}`}>Verified with your ID</Text>
              </View>
            </View>

            <View className="mt-4 flex-row flex-wrap gap-2">
              <InfoChip icon={Cake} label={formatBirthday(profile?.date_of_birth ?? null)} isDark={isDark} />
              <InfoChip icon={MapPin} label={formatResidence(profile?.city) || 'Not set'} isDark={isDark} />
            </View>
            <View className="mt-3 flex-row items-start gap-1.5">
              <Lock size={12} color={mutedIcon} style={{ marginTop: 2 }} />
              <Text className={`flex-1 text-[11px] leading-4 ${secondary}`}>
                Name, birthday and home were checked against your ID. Contact PartyUp support if they need updating.
              </Text>
            </View>
          </View>
        </Card>

        {/* About you */}
        <Card index={1} className="gap-3">
          <SectionHeader icon={UserRound} title="About you" subtitle="Shown on your profile to other travelers." isDark={isDark} />
          <View className={`rounded-2xl border ${fieldBox}`}>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={BIO_MAX}
              multiline
              placeholder="Tell other travelers a little about yourself..."
              placeholderTextColor={placeholderColor}
              className={`min-h-[96px] px-4 pt-3 text-[15px] ${primary}`}
              style={{ textAlignVertical: 'top' }}
            />
            <Text className={`self-end px-3 pb-2 text-[11px] ${bio.length >= BIO_MAX ? 'text-[#D88700]' : secondary}`}>
              {bio.length}/{BIO_MAX}
            </Text>
          </View>
        </Card>

        {/* Contact */}
        <Card index={2} className="gap-3">
          <SectionHeader icon={Phone} title="Mobile number" subtitle="Required to create or join trips." isDark={isDark} />
          <View className={`flex-row items-center rounded-2xl border px-4 ${fieldBox} ${phoneLockedUntil ? 'opacity-70' : ''}`}>
            <Phone size={17} color={mutedIcon} />
            <TextInput
              value={formatPhone(phone)}
              onChangeText={(text) => setPhone(normalizePhone(text))}
              editable={!phoneLockedUntil}
              keyboardType="phone-pad"
              maxLength={13}
              placeholder="0917 123 4567"
              placeholderTextColor={placeholderColor}
              className={`flex-1 px-3 py-3.5 text-[16px] font-semibold tracking-wide ${primary}`}
            />
            {phoneLockedUntil ? <Lock size={16} color={mutedIcon} /> : isValidPhone(phone) ? <Check size={17} color="#00A56A" /> : null}
          </View>
          {phoneLockedUntil ? (
            <Notice tone="warn" isDark={isDark}>
              You changed your number recently. You can change it again on {shortDate(phoneLockedUntil)}.
            </Notice>
          ) : (
            <Text className={`text-[12px] leading-[17px] ${secondary}`}>
              Only your trusted circle and the PartyUp safety team can see it. You can change it once every {PHONE_COOLDOWN_DAYS} days, not during a trip or an active SOS.
            </Text>
          )}
        </Card>

        {/* Interests */}
        <Card index={3} className="gap-3">
          <SectionHeader
            icon={Sparkles}
            title="Interests"
            subtitle="Used to match you with compatible travel buddies."
            isDark={isDark}
            right={
              <View className={`rounded-full px-2.5 py-1 ${interests.length ? 'bg-[#E9EEFF]' : 'bg-[#FEE2E2]'}`}>
                <Text className={`text-[11px] font-bold ${interests.length ? 'text-[#2445B8]' : 'text-[#B91C1C]'}`}>{interests.length} selected</Text>
              </View>
            }
          />
          <View className="flex-row flex-wrap gap-2">
            {INTEREST_OPTIONS.map(([interest, icon]) => {
              const selected = interests.includes(interest);
              return (
                <TouchableOpacity
                  key={interest}
                  onPress={() => toggleInterest(interest)}
                  activeOpacity={0.8}
                  className={`flex-row items-center gap-1.5 rounded-full border px-3.5 py-2.5 ${
                    selected ? 'border-[#2445B8] bg-[#2445B8]' : isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E2E5E9] bg-[#F4F5F6]'
                  }`}>
                  <Text className="text-[14px]">{icon}</Text>
                  <Text className={`text-[13px] font-semibold ${selected ? 'text-white' : primary}`}>{interest}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Match preferences */}
        <Card index={4} className="gap-3">
          <SectionHeader icon={Heart} title="Match preferences" subtitle="Used by Discover to score how well you match." isDark={isDark} />

          <View className="flex-row items-center justify-between">
            <Text className={`text-[13px] font-bold uppercase tracking-wide ${secondary}`}>I am</Text>
            {genderLockedUntil ? <Lock size={14} color={mutedIcon} /> : null}
          </View>
          <View className={`flex-row rounded-2xl p-1 ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF1F7]'} ${genderLockedUntil ? 'opacity-70' : ''}`}>
            {GENDER_OPTIONS.map((option) => {
              const selected = gender === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => pickGender(option.value)}
                  disabled={!!genderLockedUntil}
                  activeOpacity={0.85}
                  className={`h-[44px] flex-1 items-center justify-center rounded-xl ${selected ? (isDark ? 'bg-[#2445B8]' : 'bg-white') : ''}`}>
                  <Text className={`text-[14px] font-semibold ${selected ? (isDark ? 'text-white' : 'text-[#2445B8]') : secondary}`}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {genderLockedUntil ? (
            <Notice tone="warn" isDark={isDark}>
              You changed this recently. You can change it again on {shortDate(genderLockedUntil)}.
            </Notice>
          ) : savedPrefs.gender ? (
            <Text className={`text-[12px] leading-[17px] ${secondary}`}>
              {genderFreeChangeLeft
                ? `You can fix this once. After that, it can change once every ${GENDER_COOLDOWN_DAYS} days.`
                : `Can change once every ${GENDER_COOLDOWN_DAYS} days.`}
            </Text>
          ) : null}

          <View className="mt-2 flex-row items-center justify-between">
            <Text className={`text-[13px] font-bold uppercase tracking-wide ${secondary}`}>Preferred travel buddy</Text>
            <Users size={14} color={mutedIcon} />
          </View>
          <View className="flex-row gap-2">
            {GENDER_OPTIONS.map((option) => {
              const selected = preferredGender.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => togglePreferredGender(option.value)}
                  activeOpacity={0.8}
                  className={`h-[44px] flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border ${
                    selected ? 'border-[#2445B8] bg-[#E9EEFF]' : isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E2E5E9] bg-[#F4F5F6]'
                  }`}>
                  {selected ? <Check size={14} color={BRAND} /> : null}
                  <Text className={`text-[14px] font-semibold ${selected ? 'text-[#2445B8]' : primary}`}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text className={`text-[12px] leading-[17px] ${secondary}`}>
            {preferredGender.length === 0 ? "Open to anyone. Pick any that apply to narrow it down." : 'Change this anytime.'}
          </Text>
        </Card>

        {errorMessage ? (
          <Animated.View key="edit-profile-error" entering={FadeIn.duration(200)} style={shakeStyle} className="rounded-2xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Save bar stays in reach while scrolling. */}
      <View
        className={`border-t px-4 pt-3 ${isDark ? 'border-white/5 bg-[#0F172A]' : 'border-black/5 bg-white'}`}
        style={{ paddingBottom: insets.bottom + 12 }}>
        <AnimatedPressable
          onPress={handleSavePress}
          disabled={saving || !dirty}
          className={`items-center rounded-2xl py-4 ${saving || !dirty ? (isDark ? 'bg-[#22324B]' : 'bg-[#C7D0E8]') : 'bg-[#2747C7]'}`}>
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className={`text-[15px] font-bold ${dirty ? 'text-white' : isDark ? 'text-[#64748B]' : 'text-white'}`}>{dirty ? 'Save Changes' : 'No changes yet'}</Text>
          )}
        </AnimatedPressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, isDark, right }: { icon: IconType; title: string; subtitle: string; isDark: boolean; right?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className={`h-10 w-10 items-center justify-center rounded-xl ${isDark ? 'bg-[#1B2B4D]' : 'bg-[#E9EEFF]'}`}>
        <Icon size={19} color={BRAND} />
      </View>
      <View className="flex-1">
        <Text className={`text-[16px] font-bold ${isDark ? 'text-white' : 'text-[#1B2340]'}`}>{title}</Text>
        <Text className={`text-[12px] ${isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]'}`}>{subtitle}</Text>
      </View>
      {right}
    </View>
  );
}

function InfoChip({ icon: Icon, label, isDark }: { icon: IconType; label: string; isDark: boolean }) {
  return (
    <View className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${isDark ? 'bg-[#18253C]' : 'bg-[#F4F6FA]'}`}>
      <Icon size={13} color={isDark ? '#94A3B8' : '#6C7A95'} />
      <Text className={`text-[12px] font-medium ${isDark ? 'text-[#CBD5E1]' : 'text-[#3B4A66]'}`}>{label}</Text>
    </View>
  );
}

function Notice({ tone, isDark, children }: { tone: 'warn'; isDark: boolean; children: ReactNode }) {
  return (
    <View className={`flex-row items-start gap-2 rounded-xl px-3 py-2.5 ${tone === 'warn' ? (isDark ? 'bg-[#3A2A10]' : 'bg-[#FFF4E0]') : ''}`}>
      <Lock size={13} color="#D88700" style={{ marginTop: 2 }} />
      <Text className="flex-1 text-[12px] leading-[17px] text-[#B26E00]">{children}</Text>
    </View>
  );
}
