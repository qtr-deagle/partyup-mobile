import { useColorScheme } from '@/hooks/use-color-scheme';
import { createTrip, type TripVisibility } from '@/lib/carpool';
import { getTheme, typography } from '@/lib/theme';
import { useRouter } from 'expo-router';
import { ArrowLeft, Globe, Lock, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const visibilityOptions: { key: TripVisibility; label: string; description: string; icon: typeof Globe }[] = [
  { key: 'public', label: 'Public', description: 'Anyone with the invite link can join instantly', icon: Globe },
  { key: 'trusted_circle', label: 'Trusted Circle', description: 'You approve each join request', icon: Users },
  { key: 'private', label: 'Private', description: 'You approve each join request', icon: Lock },
];

export default function CreateTripScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { titleColor } = getTheme(isDark);

  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const inputBg = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const inputText = isDark ? 'text-white' : 'text-[#17233F]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';

  const [title, setTitle] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [dateText, setDateText] = useState('');
  const [visibility, setVisibility] = useState<TripVisibility>('public');
  const [seatsTotal, setSeatsTotal] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function parseStartAt(): string | null {
    if (!dateText.trim()) {
      return null;
    }
    const parsed = new Date(dateText.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

    setSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await createTrip({
      title: title.trim(),
      origin: origin.trim(),
      destination: destination.trim(),
      startAt: parseStartAt(),
      visibility,
      seatsTotal: seats,
      totalCost: cost,
      notes: notes.trim() || null,
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
          <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>DATE &amp; TIME (OPTIONAL)</Text>
          <TextInput
            className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="e.g., 2026-09-05 07:30"
            placeholderTextColor={placeholderColor}
            value={dateText}
            onChangeText={setDateText}
          />
        </View>

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
    </KeyboardAvoidingView>
  );
}
