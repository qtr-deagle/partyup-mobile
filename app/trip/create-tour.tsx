import { DatePickerModal } from '@/components/carpool/DatePickerModal';
import { TimePickerModal } from '@/components/carpool/TimePickerModal';
import MeetupLocationPicker, { EMPTY_MEETUP, type MeetupDraft } from '@/components/MeetupLocationPicker';
import { InterestTagPicker } from '@/components/carpool/InterestTagPicker';
import { ItineraryDayBuilder, type ItineraryDayInput } from '@/components/carpool/ItineraryDayBuilder';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createTrip, formatMeetupLabel } from '@/lib/carpool';
import { getTheme, typography } from '@/lib/theme';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ArrowLeft, Calendar, Clock, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

export default function CreateTourScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { titleColor } = getTheme(isDark);
  const { profile } = useAuth();

  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const inputBg = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const inputText = isDark ? 'text-white' : 'text-[#17233F]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';
  const isVerified = profile?.verification_status === 'approved';

  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
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

  function toggleInterest(tag: string) {
    setInterests((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));
  }

  async function handleSubmit() {
    if (!title.trim() || !destination.trim()) {
      setErrorMessage('Tour title and destination are required.');
      return;
    }

    if (!meetup.municipality || !meetup.pin || !meetup.landmark.trim()) {
      setErrorMessage('Set the meeting point city, pin the exact spot on the map, and name a landmark.');
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
      setErrorMessage('Duration must be 1 to 99 days.');
      return;
    }

    const maxText = maxParticipants.trim();
    const maxP = maxText ? Number.parseInt(maxText, 10) : null;
    if (maxText && (!TWO_DIGIT_PATTERN.test(maxText) || maxP === null || maxP <= 0)) {
      setErrorMessage('Max participants must be 1 to 99.');
      return;
    }

    const priceText = pricePerPerson.trim();
    const price = priceText ? Number.parseFloat(priceText) : null;
    if (priceText && (!PRICE_PATTERN.test(priceText) || price === null || price <= 0)) {
      setErrorMessage('Price per person must be more than ₱0 and up to ₱999,999.99.');
      return;
    }

    if (startDate && startDate.getTime() < Date.now()) {
      setErrorMessage('Start date & time must be in the future.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    let destinationLat: number | null = null;
    let destinationLng: number | null = null;
    try {
      const geocoded = await Location.geocodeAsync(destination.trim());
      if (geocoded[0]) {
        destinationLat = geocoded[0].latitude;
        destinationLng = geocoded[0].longitude;
      }
    } catch {
      // Best-effort only -- tour creation still succeeds without geofence support.
    }

    const { data, error } = await createTrip({
      title: title.trim(),
      origin: formatMeetupLabel(meetupLocation),
      destination: destination.trim(),
      startAt: startDate ? startDate.toISOString() : null,
      visibility: 'public',
      seatsTotal: maxP,
      notes: description.trim() || null,
      destinationLat,
      destinationLng,
      tripType: 'tour',
      pricePerPerson: price,
      durationDays: duration,
      interests,
      itinerary: itinerary.filter((day) => day.description.trim().length > 0),
      meetup: meetupLocation,
    });

    setSubmitting(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? 'Unable to create tour.');
      return;
    }

    router.replace({ pathname: '/trip/[id]', params: { id: (data as { id: string }).id, celebrate: 'created' } });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className={`flex-1 ${background}`}>
      <View className={`border-b px-4 pb-4 ${border}`} style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="h-10 w-10 items-center justify-center" accessibilityLabel="Go back">
            <ArrowLeft size={23} color={isDark ? '#FFFFFF' : '#1B2340'} />
          </TouchableOpacity>
          <Text className={`ml-3 ${typography.pageTitle} ${titleColor}`}>Create Tour</Text>
        </View>
      </View>

      {!isVerified ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <ShieldAlert size={40} color="#D88700" />
          <Text className={`text-center text-lg font-bold ${primary}`}>Verify your identity to create a tour</Text>
          <Text className={`text-center text-sm leading-5 ${secondary}`}>
            {profile?.verification_status === 'pending'
              ? 'Your ID verification is still under review. This usually takes 1-2 hours.'
              : profile?.verification_status === 'rejected'
                ? 'Your last ID verification was rejected. Resubmit clearer documents to continue.'
                : 'Upload a government ID and a selfie to unlock tour creation.'}
          </Text>
          {profile?.verification_status !== 'pending' && (
            <TouchableOpacity onPress={() => router.push('/verify-id')} className="mt-2 rounded-2xl bg-[#2A55D4] px-6 py-3.5">
              <Text className="text-base font-bold text-white">
                {profile?.verification_status === 'rejected' ? 'Resubmit Documents' : 'Verify Now'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
      <>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>TOUR TITLE</Text>
          <TextInput
            className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="e.g., Boracay Beach Paradise"
            placeholderTextColor={placeholderColor}
            maxLength={60}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>DESTINATION</Text>
          <TextInput
            className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="Boracay, Aklan"
            placeholderTextColor={placeholderColor}
            maxLength={80}
            value={destination}
            onChangeText={setDestination}
          />
        </View>

        <MeetupLocationPicker
          label="MEETING POINT"
          value={meetup}
          onChange={setMeetup}
          isDark={isDark}
          landmarkPlaceholder="Specific spot, e.g. Malolos Cathedral, main entrance"
        />

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>START DATE &amp; MEETUP TIME (OPTIONAL)</Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setShowStartDatePicker(true)}
              className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
            >
              <Calendar size={18} color={startDate ? '#2A55D4' : placeholderColor} />
              <Text className={`flex-1 text-base ${startDate ? inputText : ''}`} style={!startDate ? { color: placeholderColor } : undefined}>
                {formatDateLabel(startDate)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowStartTimePicker(true)}
              className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
            >
              <Clock size={18} color={startDate ? '#2A55D4' : placeholderColor} />
              <Text className={`flex-1 text-base ${startDate ? inputText : ''}`} style={!startDate ? { color: placeholderColor } : undefined}>
                {formatTimeLabel(startDate)}
              </Text>
            </TouchableOpacity>
          </View>
          {startDate ? (
            <TouchableOpacity onPress={() => setStartDate(null)} className="mt-2 self-start">
              <Text className="text-sm font-bold text-[#B91C1C]">Clear start date &amp; time</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>DURATION (DAYS)</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
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
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>MAX PARTICIPANTS (OPTIONAL)</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
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

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>PRICE PER PERSON (₱, OPTIONAL)</Text>
          <TextInput
            className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
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
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>DESCRIPTION</Text>
          <TextInput
            className={`min-h-[88px] rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="What's included, what to bring, activities, etc."
            placeholderTextColor={placeholderColor}
            maxLength={500}
            multiline
            value={description}
            onChangeText={setDescription}
          />
        </View>

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>TOUR THEMES / INTERESTS</Text>
          <InterestTagPicker selected={interests} onToggle={toggleInterest} isDark={isDark} />
        </View>

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>DAILY ITINERARY</Text>
          <ItineraryDayBuilder days={itinerary} onChange={setItinerary} isDark={isDark} />
        </View>

        <TouchableOpacity onPress={handleSubmit} disabled={submitting} className="mt-2 rounded-2xl bg-[#2A55D4] py-4">
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Create Tour</Text>}
        </TouchableOpacity>
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
