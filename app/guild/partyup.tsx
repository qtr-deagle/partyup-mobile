import { DatePickerModal } from '@/components/carpool/DatePickerModal';
import { TimePickerModal } from '@/components/carpool/TimePickerModal';
import MeetupLocationPicker, { EMPTY_MEETUP, type MeetupDraft } from '@/components/MeetupLocationPicker';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { riseIn, useShake } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createGuildPartyup } from '@/lib/guilds';
import { feedback } from '@/lib/sounds';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, Clock, Lock, MapPin, NotebookPen, PartyPopper } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

function formatDateLabel(date: Date | null) {
  if (!date) return 'Select date';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeLabel(date: Date | null) {
  if (!date) return 'Select time';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function mergeDate(current: Date | null, datePart: Date) {
  const next = new Date(datePart);
  if (current) {
    next.setHours(current.getHours(), current.getMinutes());
  }
  return next;
}

// PartyUp brand blue (same as the logo and the rest of the create screens).
const color = '#2A55D4';

function SectionTitle({ icon, title, isDark }: { icon: ReactNode; title: string; isDark: boolean }) {
  return (
    <View className="mb-3 flex-row items-center gap-2">
      <View className={`h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>{icon}</View>
      <Text className={`text-[16px] font-bold ${isDark ? 'text-white' : 'text-[#1B2340]'}`}>{title}</Text>
    </View>
  );
}

// "Let's PartyUp!": the guild leader plans a hangout for guild mates only.
// Not a carpool or tour: just what, where (pinned) and when. Members get
// notified and tap in from the guild page.
export default function GuildPartyupCreateScreen() {
  const router = useRouter();
  const { guildId, guildName } = useLocalSearchParams<{ guildId: string; guildName?: string }>();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { style: shakeStyle, shake } = useShake();

  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const inputBg = isDark ? 'bg-[#18253C]' : 'bg-[#F7F8FC]';
  const inputText = isDark ? 'text-white' : 'text-[#17233F]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';

  const [title, setTitle] = useState('');
  const [place, setPlace] = useState<MeetupDraft>(EMPTY_MEETUP);
  const [meetAt, setMeetAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function fail(message: string) {
    setErrorMessage(message);
    feedback.error();
    shake();
  }

  async function handleSubmit() {
    if (!title.trim()) return fail('What are you doing? e.g. Milk tea run, Sunday bike ride.');
    if (!place.landmark.trim()) return fail('Add where to meet.');
    if (!meetAt) return fail('Pick a date and time to meet.');
    if (meetAt.getTime() < Date.now() - 5 * 60_000) return fail('That time has already passed.');

    setErrorMessage(null);
    setSubmitting(true);
    const { error } = await createGuildPartyup({
      guildId,
      title,
      placeLabel: place.landmark,
      placeMunicipality: place.municipality,
      placeLat: place.pin?.latitude ?? null,
      placeLng: place.pin?.longitude ?? null,
      meetAt,
      notes,
    });
    setSubmitting(false);
    if (error) return fail(error.message);

    feedback.success();
    router.back();
  }

  return (
    <KeyboardAvoidingView behavior="padding" className={`flex-1 ${background}`}>
      <ScreenHeader title="Let's PartyUp!" subtitle={`Hang out with ${guildName ?? 'your guild'}`} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled">
        <Animated.View entering={riseIn(0, 380)} className="overflow-hidden rounded-3xl p-5">
          <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
            <Defs>
              <LinearGradient id="partyupHeroGradient" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={isDark ? '#2563EB' : '#3B6CF6'} />
                <Stop offset="1" stopColor={isDark ? '#172554' : '#1E3A8A'} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100" height="100" fill="url(#partyupHeroGradient)" />
          </Svg>
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <PartyPopper size={24} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-xl font-black text-white">Gala with your guild!</Text>
              <Text className="mt-0.5 text-[13px] leading-5 text-white/80">
                Pin a spot and a time. Everyone in {guildName ?? 'your guild'} gets notified and can tap in.
              </Text>
            </View>
          </View>
          <View className="mt-4 flex-row items-center gap-2 self-start rounded-full bg-white/15 px-3 py-1">
            <Lock size={12} color="#FFFFFF" />
            <Text className="text-xs font-bold text-white">Guild members only</Text>
          </View>
        </Animated.View>

        <Card index={1} className="gap-4">
          <SectionTitle isDark={isDark} icon={<PartyPopper size={16} color={color} />} title="The plan" />
          <View className="-mt-3">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>WHAT ARE WE DOING?</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="e.g., Milk tea run, Sunday bike ride"
              placeholderTextColor={placeholderColor}
              maxLength={80}
              value={title}
              onChangeText={setTitle}
            />
          </View>
        </Card>

        <Card index={2}>
          <SectionTitle isDark={isDark} icon={<MapPin size={16} color={color} />} title="Where to meet" />
          <MeetupLocationPicker
            label="MEETUP SPOT"
            value={place}
            onChange={setPlace}
            isDark={isDark}
            landmarkPlaceholder="e.g. Malolos Cathedral, front steps"
          />
        </Card>

        <Card index={3}>
          <SectionTitle isDark={isDark} icon={<Calendar size={16} color={color} />} title="When" />
          <View className="flex-row gap-3">
            <AnimatedPressable
              onPress={() => setShowDatePicker(true)}
              className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}>
              <Calendar size={18} color={meetAt ? color : placeholderColor} />
              <Text className={`flex-1 text-base ${meetAt ? inputText : ''}`} style={!meetAt ? { color: placeholderColor } : undefined}>
                {formatDateLabel(meetAt)}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setShowTimePicker(true)}
              className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}>
              <Clock size={18} color={meetAt ? color : placeholderColor} />
              <Text className={`flex-1 text-base ${meetAt ? inputText : ''}`} style={!meetAt ? { color: placeholderColor } : undefined}>
                {formatTimeLabel(meetAt)}
              </Text>
            </AnimatedPressable>
          </View>
        </Card>

        <Card index={4}>
          <SectionTitle isDark={isDark} icon={<NotebookPen size={16} color={color} />} title="Details (optional)" />
          <TextInput
            className={`min-h-[88px] rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="What to bring, dress code, budget, etc."
            placeholderTextColor={placeholderColor}
            maxLength={500}
            multiline
            value={notes}
            onChangeText={setNotes}
            style={{ textAlignVertical: 'top' }}
          />
        </Card>

        {errorMessage ? (
          <Animated.View entering={FadeIn.duration(200)} style={shakeStyle} className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </Animated.View>
        ) : null}

        <AnimatedPressable onPress={handleSubmit} disabled={submitting} className="rounded-2xl bg-[#2A55D4] py-4">
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text className="text-center text-base font-bold text-white">Post &amp; notify guild</Text>
          )}
        </AnimatedPressable>
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        title="Meetup Date"
        value={meetAt}
        minDate={new Date()}
        isDark={isDark}
        onClose={() => setShowDatePicker(false)}
        onSelect={(date) => setMeetAt((current) => mergeDate(current, date))}
      />
      <TimePickerModal
        visible={showTimePicker}
        title="Meetup Time"
        value={meetAt}
        isDark={isDark}
        onClose={() => setShowTimePicker(false)}
        onSelect={(date) => setMeetAt(date)}
      />
    </KeyboardAvoidingView>
  );
}
