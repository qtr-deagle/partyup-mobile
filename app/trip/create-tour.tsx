import { DatePickerModal } from '@/components/carpool/DatePickerModal';
import { TimePickerModal } from '@/components/carpool/TimePickerModal';
import MeetupLocationPicker, { EMPTY_MEETUP, type MeetupDraft } from '@/components/MeetupLocationPicker';
import { InterestTagPicker } from '@/components/carpool/InterestTagPicker';
import { describeItineraryDay, ItineraryDayBuilder, type ItineraryDayInput } from '@/components/carpool/ItineraryDayBuilder';
import { TourDestinationPicker } from '@/components/carpool/TourDestinationPicker';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, useShake } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { DraftBanner } from '@/components/ui/DraftBanner';
import { useDraft, useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { useAuth } from '@/hooks/auth-provider';
import { hasPhone } from '@/lib/phone';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createTrip, formatMeetupLabel } from '@/lib/carpool';
import { formatTourDestination, TOUR_CATEGORIES, type TourCategory, type TourDestination } from '@/lib/tours';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, CalendarDays, Clock, MapPin, Phone, ShieldAlert, Sparkles, Wallet } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatDateLabel(date: Date | null) {
  if (!date) {
    return 'Select date';
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeLabel(date: Date | null) {
  if (!date) {
    return 'Select time';
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function mergeDate(current: Date | null, datePart: Date) {
  const next = new Date(datePart);
  if (current) {
    next.setHours(current.getHours(), current.getMinutes());
  }
  return next;
}

// Duration and max participants are both capped at 2 digits (1-99).
const TWO_DIGIT_PATTERN = /^\d{1,2}$/;

function sanitizeTwoDigits(text: string) {
  return text.replace(/\D/g, '').slice(0, 2);
}

// Up to ₱999,999.99, the same cap as carpool trip costs.
const PRICE_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;

function sanitizePrice(text: string) {
  const [whole = '', ...rest] = text.replace(/[^\d.]/g, '').split('.');
  const wholePart = whole.slice(0, 6);
  return rest.length > 0 ? `${wholePart}.${rest.join('').slice(0, 2)}` : wholePart;
}

function durationSummary(startDate: Date | null, durationText: string) {
  const days = Number.parseInt(durationText, 10);
  if (!durationText || Number.isNaN(days) || days <= 0) {
    return '1 to 99 days.';
  }
  if (!startDate) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const end = new Date(startDate);
  end.setDate(end.getDate() + days - 1);
  return `Ends ${end.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

function participantSummary(text: string) {
  const total = Number.parseInt(text, 10);
  if (!text || Number.isNaN(total)) {
    return 'Not counting you as the organizer. Leave blank for no limit.';
  }
  return `You + up to ${total} participant${total === 1 ? '' : 's'}`;
}

function SectionTitle({ icon, title, isDark }: { icon: ReactNode; title: string; isDark: boolean }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>{icon}</View>
      <Text className={`text-[16px] font-bold ${isDark ? 'text-white' : 'text-[#1B2340]'}`}>{title}</Text>
    </View>
  );
}

export default function CreateTourScreen() {
  const router = useRouter();
  // Set when a guild leader posts this tour as a guild "Let's PartyUp".
  const { guildId, guildName } = useLocalSearchParams<{ guildId?: string; guildName?: string }>();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const inputBg = isDark ? 'bg-[#18253C]' : 'bg-[#F7F8FC]';
  const inputText = isDark ? 'text-white' : 'text-[#17233F]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';
  const isVerified = profile?.verification_status === 'approved';

  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState<TourDestination | null>(null);
  const [category, setCategory] = useState<TourCategory | null>(null);
  const [meetup, setMeetup] = useState<MeetupDraft>(EMPTY_MEETUP);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);

  const [durationDays, setDurationDays] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [pricePerPerson, setPricePerPerson] = useState('');
  const [description, setDescription] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryDayInput[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { style: shakeStyle, shake } = useShake();

  // Unsaved work: warn on leave, and keep a draft on the device.
  const dirty =
    !!title.trim() ||
    !!destination ||
    !!category ||
    !!(meetup.municipality || meetup.pin || meetup.landmark.trim()) ||
    !!startDate ||
    !!durationDays ||
    !!maxParticipants ||
    !!pricePerPerson ||
    !!description.trim() ||
    interests.length > 0 ||
    itinerary.length > 0;
  const { allowLeave } = useUnsavedChangesGuard(dirty, { message: "Your tour isn't posted yet. We'll keep a draft, but leaving now closes the form." });
  const draft = useDraft(
    guildId ? `tour:guild:${guildId}` : 'tour',
    { title, destination, category, meetup, startAt: startDate?.toISOString() ?? null, durationDays, maxParticipants, pricePerPerson, description, interests, itinerary },
    { enabled: isVerified, isEmpty: () => !dirty }
  );

  function restoreDraft() {
    const saved = draft.restore();
    if (!saved) return;
    setTitle(saved.title);
    setDestination(saved.destination);
    setCategory(saved.category);
    setMeetup(saved.meetup);
    setStartDate(saved.startAt ? new Date(saved.startAt) : null);
    setDurationDays(saved.durationDays);
    setMaxParticipants(saved.maxParticipants);
    setPricePerPerson(saved.pricePerPerson);
    setDescription(saved.description);
    setInterests(saved.interests ?? []);
    setItinerary(saved.itinerary ?? []);
  }

  function fail(message: string) {
    setErrorMessage(message);
    shake();
  }

  function toggleInterest(tag: string) {
    setInterests((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));
  }

  async function handleSubmit() {
    if (!title.trim() || !destination) {
      fail('Tour title and destination are required.');
      return;
    }

    if (!category) {
      fail('Pick a tour category.');
      return;
    }

    if (!meetup.municipality || !meetup.pin || !meetup.landmark.trim()) {
      fail('Set the meeting point city, pin the exact spot on the map, and name a landmark.');
      return;
    }
    const meetupLocation = {
      municipality: meetup.municipality,
      landmark: meetup.landmark.trim(),
      latitude: meetup.pin.latitude,
      longitude: meetup.pin.longitude,
    };

    const durationText = durationDays.trim();
    const duration = durationText ? Number.parseInt(durationText, 10) : null;
    if (!TWO_DIGIT_PATTERN.test(durationText) || !duration || duration <= 0) {
      fail('Duration must be 1 to 99 days.');
      return;
    }

    const maxText = maxParticipants.trim();
    const maxP = maxText ? Number.parseInt(maxText, 10) : null;
    if (maxText && (!TWO_DIGIT_PATTERN.test(maxText) || maxP === null || maxP <= 0)) {
      fail('Max participants must be 1 to 99.');
      return;
    }

    const priceText = pricePerPerson.trim();
    const price = priceText ? Number.parseFloat(priceText) : null;
    if (priceText && (!PRICE_PATTERN.test(priceText) || price === null || price <= 0)) {
      fail('Price per person must be more than ₱0 and up to ₱999,999.99.');
      return;
    }

    if (startDate && startDate.getTime() < Date.now()) {
      fail('Start date & time must be in the future.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await createTrip({
      title: title.trim(),
      origin: formatMeetupLabel(meetupLocation),
      destination: formatTourDestination(destination),
      startAt: startDate ? startDate.toISOString() : null,
      visibility: 'public',
      seatsTotal: maxP,
      notes: description.trim() || null,
      destinationLat: destination.latitude,
      destinationLng: destination.longitude,
      tripType: 'tour',
      pricePerPerson: price,
      durationDays: duration,
      // The category goes first; extra themes follow.
      interests: [category, ...interests],
      itinerary: itinerary
        .filter((day) => day.activities.length > 0)
        .map((day, index) => ({ dayNumber: index + 1, description: describeItineraryDay(day) })),
      meetup: meetupLocation,
      guildId: guildId ?? null,
    });

    setSubmitting(false);

    if (error || !data) {
      fail(error?.message ?? 'Unable to create tour.');
      return;
    }

    draft.clear();
    allowLeave();
    router.replace({ pathname: '/trip/[id]', params: { id: (data as { id: string }).id, celebrate: 'created' } });
  }

  const label = `mb-2 text-[13px] font-bold ${secondary}`;
  const input = `rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`;

  return (
    <KeyboardAvoidingView behavior="padding" className={`flex-1 ${background}`}>
      <ScreenHeader
        title={guildId ? "Let's PartyUp" : 'Create Tour'}
        subtitle={guildId ? `Tour for ${guildName ?? 'your guild'}` : 'Plan a group trip others can join'}
      />

      {!isVerified ? (
        <EmptyState
          key="unverified"
          icon={<ShieldAlert size={34} color="#D88700" />}
          title="Verify your identity to create a tour"
          message={
            profile?.verification_status === 'pending'
              ? 'Your ID verification is still under review. This usually takes 1-2 hours.'
              : profile?.verification_status === 'rejected'
                ? 'Your last ID verification was rejected. Resubmit clearer documents to continue.'
                : 'Upload a government ID and a selfie to unlock tour creation.'
          }
          action={
            profile?.verification_status !== 'pending' ? (
              <AnimatedPressable onPress={() => router.push('/verify-id')} className="rounded-2xl bg-[#2A55D4] px-6 py-3.5">
                <Text className="text-base font-bold text-white">
                  {profile?.verification_status === 'rejected' ? 'Resubmit Documents' : 'Verify Now'}
                </Text>
              </AnimatedPressable>
            ) : undefined
          }
        />
      ) : !hasPhone(profile?.phone) ? (
        <EmptyState
          key="no-phone"
          icon={<Phone size={34} color="#2A55D4" />}
          title="Add your mobile number"
          message="Organizers need a mobile number on file so the safety team can reach you during the tour."
          action={
            <AnimatedPressable onPress={() => router.push('/edit-profile')} className="rounded-2xl bg-[#2A55D4] px-6 py-3.5">
              <Text className="text-base font-bold text-white">Add Mobile Number</Text>
            </AnimatedPressable>
          }
        />
      ) : (
      <>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {draft.offer ? (
          <DraftBanner
            savedAt={draft.offer.savedAt}
            preview={draft.offer.value.title || null}
            isDark={isDark}
            onContinue={restoreDraft}
            onStartFresh={draft.dismiss}
          />
        ) : null}
        <Card index={0} className="gap-4">
          <SectionTitle isDark={isDark} icon={<MapPin size={16} color="#2A55D4" />} title="Where to" />
          <View>
            <Text className={label}>TOUR TITLE</Text>
            <TextInput
              className={input}
              placeholder="e.g., Boracay Beach Paradise"
              placeholderTextColor={placeholderColor}
              maxLength={60}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View>
            <Text className={label}>DESTINATION</Text>
            <TourDestinationPicker value={destination} onChange={setDestination} isDark={isDark} />
          </View>

          <View>
            <Text className={label}>CATEGORY</Text>
            <View className="flex-row flex-wrap gap-2">
              {TOUR_CATEGORIES.map((option) => {
                const selected = category === option;
                return (
                  <AnimatedPressable
                    key={option}
                    onPress={() => setCategory(option)}
                    className={`rounded-full border px-4 py-2 ${selected ? 'border-[#2A55D4] bg-[#2A55D4]' : `${border} ${inputBg}`}`}>
                    <Text className={`text-sm font-bold ${selected ? 'text-white' : inputText}`}>{option}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>

          <MeetupLocationPicker
            label="MEETING POINT"
            value={meetup}
            onChange={setMeetup}
            isDark={isDark}
            landmarkPlaceholder="Specific spot, e.g. Malolos Cathedral, main entrance"
          />
        </Card>

        <Card index={1} className="gap-4">
          <SectionTitle isDark={isDark} icon={<Calendar size={16} color="#2A55D4" />} title="When" />
          <View>
            <Text className={label}>START DATE &amp; MEETUP TIME (OPTIONAL)</Text>
            <View className="flex-row gap-3">
              <AnimatedPressable
                onPress={() => setShowStartDatePicker(true)}
                scaleTo={0.97}
                className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
              >
                <Calendar size={18} color={startDate ? '#2A55D4' : placeholderColor} />
                <Text className={`flex-1 text-base ${startDate ? inputText : ''}`} style={!startDate ? { color: placeholderColor } : undefined}>
                  {formatDateLabel(startDate)}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setShowStartTimePicker(true)}
                scaleTo={0.97}
                className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
              >
                <Clock size={18} color={startDate ? '#2A55D4' : placeholderColor} />
                <Text className={`flex-1 text-base ${startDate ? inputText : ''}`} style={!startDate ? { color: placeholderColor } : undefined}>
                  {formatTimeLabel(startDate)}
                </Text>
              </AnimatedPressable>
            </View>
            {startDate ? (
              <AnimatedPressable onPress={() => setStartDate(null)} className="mt-2 self-start">
                <Text className="text-sm font-bold text-[#B91C1C]">Clear start date &amp; time</Text>
              </AnimatedPressable>
            ) : null}
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className={label}>DURATION (DAYS)</Text>
              <TextInput
                className={input}
                placeholder="e.g., 3"
                placeholderTextColor={placeholderColor}
                keyboardType="number-pad"
                maxLength={2}
                value={durationDays}
                onChangeText={(text) => setDurationDays(sanitizeTwoDigits(text))}
              />
              <Text className={`mt-1.5 text-[12px] leading-4 ${secondary}`}>{durationSummary(startDate, durationDays)}</Text>
            </View>
            <View className="flex-1">
              <Text className={label}>MAX PARTICIPANTS (OPTIONAL)</Text>
              <TextInput
                className={input}
                placeholder="e.g., 20"
                placeholderTextColor={placeholderColor}
                keyboardType="number-pad"
                maxLength={2}
                value={maxParticipants}
                onChangeText={(text) => setMaxParticipants(sanitizeTwoDigits(text))}
              />
              <Text className={`mt-1.5 text-[12px] leading-4 ${secondary}`}>{participantSummary(maxParticipants)}</Text>
            </View>
          </View>
        </Card>

        <Card index={2} className="gap-4">
          <SectionTitle isDark={isDark} icon={<Wallet size={16} color="#2A55D4" />} title="Price & details" />
          <View>
            <Text className={label}>PRICE PER PERSON (₱, OPTIONAL)</Text>
            <TextInput
              className={input}
              placeholder="e.g., 3500"
              placeholderTextColor={placeholderColor}
              keyboardType="decimal-pad"
              maxLength={9}
              value={pricePerPerson}
              onChangeText={(text) => setPricePerPerson(sanitizePrice(text))}
            />
            <Text className={`mt-1.5 text-[12px] leading-4 ${secondary}`}>What each participant pays, up to ₱999,999.99. Leave blank if free.</Text>
          </View>

          <View>
            <Text className={label}>SHORT NOTE (OPTIONAL)</Text>
            <TextInput
              className={`min-h-[88px] ${input}`}
              placeholder="What's included or what to bring"
              placeholderTextColor={placeholderColor}
              maxLength={200}
              multiline
              value={description}
              onChangeText={setDescription}
            />
          </View>
        </Card>

        <Card index={3} className="gap-3">
          <SectionTitle isDark={isDark} icon={<Sparkles size={16} color="#2A55D4" />} title="Extra themes (optional)" />
          <InterestTagPicker selected={interests} onToggle={toggleInterest} isDark={isDark} />
        </Card>

        <Card index={4} className="gap-3">
          <SectionTitle isDark={isDark} icon={<CalendarDays size={16} color="#2A55D4" />} title="Daily itinerary" />
          <ItineraryDayBuilder days={itinerary} onChange={setItinerary} isDark={isDark} />
        </Card>

        {errorMessage ? (
          <Animated.View entering={FadeIn.duration(200)} style={shakeStyle} className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </Animated.View>
        ) : null}

        <AnimatedPressable onPress={handleSubmit} disabled={submitting} className="rounded-2xl bg-[#2A55D4] py-4 shadow-sm shadow-[#2A55D4]/30">
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Create Tour</Text>}
        </AnimatedPressable>
      </ScrollView>

      <DatePickerModal
        visible={showStartDatePicker}
        title="Start Date"
        value={startDate}
        minDate={new Date()}
        isDark={isDark}
        onClose={() => setShowStartDatePicker(false)}
        onSelect={(date) => setStartDate((current) => mergeDate(current, date))}
      />
      <TimePickerModal
        visible={showStartTimePicker}
        title="Meetup Time"
        value={startDate}
        isDark={isDark}
        onClose={() => setShowStartTimePicker(false)}
        onSelect={(date) => setStartDate(date)}
      />
      </>
      )}
    </KeyboardAvoidingView>
  );
}
