import { DatePickerModal } from '@/components/carpool/DatePickerModal';
import { InterestTagPicker } from '@/components/carpool/InterestTagPicker';
import { ItineraryDayBuilder, type ItineraryDayInput } from '@/components/carpool/ItineraryDayBuilder';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createTrip } from '@/lib/carpool';
import { getTheme, typography } from '@/lib/theme';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ArrowLeft, Calendar, ShieldAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatDateLabel(date: Date | null) {
  if (!date) {
    return 'Select date';
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
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
  const [meetingPoint, setMeetingPoint] = useState('');

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);

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
    if (!title.trim() || !destination.trim() || !meetingPoint.trim()) {
      setErrorMessage('Tour title, destination, and meeting point are required.');
      return;
    }

    const duration = durationDays.trim() ? Number.parseInt(durationDays.trim(), 10) : null;
    if (!duration || duration <= 0) {
      setErrorMessage('Duration must be a positive number of days.');
      return;
    }

    const maxP = maxParticipants.trim() ? Number.parseInt(maxParticipants.trim(), 10) : null;
    if (maxParticipants.trim() && (Number.isNaN(maxP) || (maxP ?? 0) <= 0)) {
      setErrorMessage('Max participants must be a positive number.');
      return;
    }

    const price = pricePerPerson.trim() ? Number.parseFloat(pricePerPerson.trim()) : null;
    if (pricePerPerson.trim() && (Number.isNaN(price) || (price ?? 0) <= 0)) {
      setErrorMessage('Price per person must be a positive number.');
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
      origin: meetingPoint.trim(),
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
    });

    setSubmitting(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? 'Unable to create tour.');
      return;
    }

    router.replace(`/trip/${(data as { id: string }).id}`);
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
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-10 pt-5" keyboardShouldPersistTaps="handled">
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
            value={destination}
            onChangeText={setDestination}
          />
        </View>

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>MEETING POINT</Text>
          <TextInput
            className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="Where participants meet to start the tour"
            placeholderTextColor={placeholderColor}
            value={meetingPoint}
            onChangeText={setMeetingPoint}
          />
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>START DATE (OPTIONAL)</Text>
            <TouchableOpacity
              onPress={() => setShowStartDatePicker(true)}
              className={`flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
            >
              <Calendar size={18} color={startDate ? '#2A55D4' : placeholderColor} />
              <Text className={`flex-1 text-base ${startDate ? inputText : ''}`} style={!startDate ? { color: placeholderColor } : undefined}>
                {formatDateLabel(startDate)}
              </Text>
            </TouchableOpacity>
          </View>
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>DURATION (DAYS)</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="e.g., 3"
              placeholderTextColor={placeholderColor}
              keyboardType="number-pad"
              value={durationDays}
              onChangeText={setDurationDays}
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>MAX PARTICIPANTS</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="e.g., 20"
              placeholderTextColor={placeholderColor}
              keyboardType="number-pad"
              value={maxParticipants}
              onChangeText={setMaxParticipants}
            />
          </View>
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>PRICE PER PERSON (₱)</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="e.g., 3500"
              placeholderTextColor={placeholderColor}
              keyboardType="decimal-pad"
              value={pricePerPerson}
              onChangeText={setPricePerPerson}
            />
          </View>
        </View>

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>DESCRIPTION</Text>
          <TextInput
            className={`min-h-[88px] rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="Describe your tour experience..."
            placeholderTextColor={placeholderColor}
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
        onSelect={(date) => setStartDate(date)}
      />
      </>
      )}
    </KeyboardAvoidingView>
  );
}
