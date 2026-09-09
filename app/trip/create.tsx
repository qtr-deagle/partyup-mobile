import { DatePickerModal } from '@/components/carpool/DatePickerModal';
import { TimePickerModal } from '@/components/carpool/TimePickerModal';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createTrip, type TripVisibility } from '@/lib/carpool';
import { getTheme, typography } from '@/lib/theme';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ArrowLeft, Calendar, Clock, Flag, Globe, Lock, Plus, ShieldAlert, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const visibilityOptions: { key: TripVisibility; label: string; description: string; icon: typeof Globe }[] = [
  { key: 'public', label: 'Public', description: 'Anyone with the invite link can join instantly', icon: Globe },
  { key: 'trusted_circle', label: 'Trusted Circle', description: 'You approve each join request', icon: Users },
  { key: 'private', label: 'Private', description: 'You approve each join request', icon: Lock },
];

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

export default function CreateTripScreen() {
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
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);

  const [includeEnd, setIncludeEnd] = useState(false);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [visibility, setVisibility] = useState<TripVisibility>('public');
  const [seatsTotal, setSeatsTotal] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggleIncludeEnd() {
    setIncludeEnd((current) => {
      if (current) {
        setEndDate(null);
      }
      return !current;
    });
  }

  async function handleSubmit() {
    if (!title.trim() || !origin.trim() || !destination.trim()) {
      setErrorMessage('Title, origin, and destination are required.');
      return;
    }

    const seats = seatsTotal.trim() ? Number.parseInt(seatsTotal.trim(), 10) : null;
    if (seatsTotal.trim() && (Number.isNaN(seats) || (seats ?? 0) <= 0)) {
      setErrorMessage('Seats must be a positive number.');
      return;
    }

    const cost = totalCost.trim() ? Number.parseFloat(totalCost.trim()) : null;
    if (totalCost.trim() && (Number.isNaN(cost) || (cost ?? 0) <= 0)) {
      setErrorMessage('Total cost must be a positive number.');
      return;
    }

    if (includeEnd && startDate && endDate && endDate.getTime() < startDate.getTime()) {
      setErrorMessage('End date & time must be after the meetup date & time.');
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
      // Best-effort only -- trip creation still succeeds without geofence support.
    }

    const { data, error } = await createTrip({
      title: title.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      startAt: startDate ? startDate.toISOString() : null,
      endAt: includeEnd && endDate ? endDate.toISOString() : null,
      visibility,
      seatsTotal: seats,
      totalCost: cost,
      notes: notes.trim() || null,
      destinationLat,
      destinationLng,
    });

    setSubmitting(false);

    if (error || !data) {
      setErrorMessage(error?.message ?? 'Unable to create trip.');
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
          <Text className={`ml-3 ${typography.pageTitle} ${titleColor}`}>Create Carpool</Text>
        </View>
      </View>

      {!isVerified ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <ShieldAlert size={40} color="#D88700" />
          <Text className={`text-center text-lg font-bold ${primary}`}>Verify your identity to create a trip</Text>
          <Text className={`text-center text-sm leading-5 ${secondary}`}>
            {profile?.verification_status === 'pending'
              ? 'Your ID verification is still under review. This usually takes 1-2 hours.'
              : profile?.verification_status === 'rejected'
                ? 'Your last ID verification was rejected. Resubmit clearer documents to continue.'
                : 'Upload a government ID and a selfie to unlock trip creation.'}
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
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>TRIP TITLE</Text>
          <TextInput
            className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="e.g., Weekday commute to Makati"
            placeholderTextColor={placeholderColor}
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>ORIGIN</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="Quezon City"
              placeholderTextColor={placeholderColor}
              value={origin}
              onChangeText={setOrigin}
            />
          </View>
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>DESTINATION</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="Makati"
              placeholderTextColor={placeholderColor}
              value={destination}
              onChangeText={setDestination}
            />
          </View>
        </View>

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>MEETUP DATE &amp; TIME (OPTIONAL)</Text>
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
              <Text className="text-sm font-bold text-[#B91C1C]">Clear meetup date &amp; time</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {includeEnd ? (
          <View>
            <View className="mb-2 flex-row items-center justify-between">
              <Text className={`text-[13px] font-bold ${secondary}`}>RETURN / END DATE &amp; TIME</Text>
              <TouchableOpacity onPress={toggleIncludeEnd} className="flex-row items-center gap-1">
                <X size={14} color="#B91C1C" />
                <Text className="text-[13px] font-bold text-[#B91C1C]">Remove</Text>
              </TouchableOpacity>
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowEndDatePicker(true)}
                className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
              >
                <Calendar size={18} color={endDate ? '#2A55D4' : placeholderColor} />
                <Text className={`flex-1 text-base ${endDate ? inputText : ''}`} style={!endDate ? { color: placeholderColor } : undefined}>
                  {formatDateLabel(endDate)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowEndTimePicker(true)}
                className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
              >
                <Clock size={18} color={endDate ? '#2A55D4' : placeholderColor} />
                <Text className={`flex-1 text-base ${endDate ? inputText : ''}`} style={!endDate ? { color: placeholderColor } : undefined}>
                  {formatTimeLabel(endDate)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={toggleIncludeEnd}
            className={`flex-row items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3.5 ${border}`}
          >
            <Plus size={16} color="#2A55D4" />
            <Text className="text-sm font-bold text-[#2A55D4]">Add return / end time</Text>
            <Flag size={14} color="#8A93A6" />
          </TouchableOpacity>
        )}

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>VISIBILITY</Text>
          <View className="gap-2">
            {visibilityOptions.map((option) => {
              const selected = visibility === option.key;
              const OptionIcon = option.icon;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setVisibility(option.key)}
                  className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 ${
                    selected ? 'border-[#2A55D4] bg-[#E9F0FF]' : `${border} ${inputBg}`
                  }`}
                >
                  <OptionIcon size={20} color={selected ? '#2A55D4' : '#8A93A6'} />
                  <View className="flex-1">
                    <Text className={`text-base font-bold ${selected ? 'text-[#2A55D4]' : primary}`}>{option.label}</Text>
                    <Text className={`mt-0.5 text-sm ${selected ? 'text-[#2A55D4]/80' : secondary}`}>{option.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>SEAT CAP (OPTIONAL)</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="e.g., 4"
              placeholderTextColor={placeholderColor}
              keyboardType="number-pad"
              value={seatsTotal}
              onChangeText={setSeatsTotal}
            />
          </View>
          <View className="flex-1">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>TOTAL TRIP COST (₱)</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="e.g., 800"
              placeholderTextColor={placeholderColor}
              keyboardType="decimal-pad"
              value={totalCost}
              onChangeText={setTotalCost}
            />
          </View>
        </View>

        <View className={`rounded-2xl border px-4 py-3.5 ${isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D7DFEE] bg-[#F4F7FF]'}`}>
          <Text className={`text-sm leading-5 ${secondary}`}>
            You set the <Text className="font-bold">total cost</Text> for the whole trip — the app splits it evenly and live as riders join. Inviting more
            friends lowers everyone&apos;s share, including yours.
          </Text>
        </View>

        <View>
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>NOTES (OPTIONAL)</Text>
          <TextInput
            className={`min-h-[88px] rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="Pickup point, luggage space, etc."
            placeholderTextColor={placeholderColor}
            multiline
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        <TouchableOpacity onPress={handleSubmit} disabled={submitting} className="mt-2 rounded-2xl bg-[#2A55D4] py-4">
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Create Trip</Text>}
        </TouchableOpacity>
      </ScrollView>

      <DatePickerModal
        visible={showStartDatePicker}
        title="Meetup Date"
        value={startDate}
        minDate={new Date()}
        isDark={isDark}
        onClose={() => setShowStartDatePicker(false)}
        onSelect={(date) => setStartDate((current) => mergeDate(current, date))}
      />
      <DatePickerModal
        visible={showEndDatePicker}
        title="Return / End Date"
        value={endDate}
        minDate={startDate ?? new Date()}
        isDark={isDark}
        onClose={() => setShowEndDatePicker(false)}
        onSelect={(date) => setEndDate((current) => mergeDate(current, date))}
      />
      <TimePickerModal
        visible={showStartTimePicker}
        title="Meetup Time"
        value={startDate}
        isDark={isDark}
        onClose={() => setShowStartTimePicker(false)}
        onSelect={(date) => setStartDate(date)}
      />
      <TimePickerModal
        visible={showEndTimePicker}
        title="Return / End Time"
        value={endDate}
        isDark={isDark}
        onClose={() => setShowEndTimePicker(false)}
        onSelect={(date) => setEndDate(date)}
      />
      </>
      )}
    </KeyboardAvoidingView>
  );
}
