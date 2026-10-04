import { DatePickerModal } from '@/components/carpool/DatePickerModal';
import MeetupLocationPicker, { EMPTY_MEETUP, type MeetupDraft } from '@/components/MeetupLocationPicker';
import { TimePickerModal } from '@/components/carpool/TimePickerModal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, SkeletonCard, useShake } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CARPOOL_PLATFORM_FEE_RATE, createTrip, formatMeetupLabel, type MeetupLocation, type RouteStop, type TripVisibility } from '@/lib/carpool';
import {
  getMyDriverLicense,
  hasVerifiedIdLicense,
  isLicenseValid,
  listMyApprovedVehicles,
  type DriverLicense,
  type Vehicle,
} from '@/lib/vehicles';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar, Car, Clock, Flag, Globe, IdCard, Lock, MapPin, NotebookPen, Plus, Route, ShieldAlert, Trash2, Users, Wallet, X } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const visibilityOptions: { key: TripVisibility; label: string; description: string; icon: typeof Globe }[] = [
  { key: 'public', label: 'Public', description: 'Shows up in Browse. Riders request a seat and you accept who rides', icon: Globe },
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

// Driver + at least one rider.
const MIN_TOTAL_SEATS = 2;

// Must match the 8-stop cap in create_trip().
const MAX_ROUTE_STOPS = 8;

// A complete MeetupDraft (city + pin + landmark) as a location, else null.
function toLocation(draft: MeetupDraft): MeetupLocation | null {
  if (!draft.municipality || !draft.pin || !draft.landmark.trim()) {
    return null;
  }
  return { municipality: draft.municipality, landmark: draft.landmark.trim(), latitude: draft.pin.latitude, longitude: draft.pin.longitude };
}

function seatSummary(seatsText: string) {
  const total = Number.parseInt(seatsText, 10);
  if (!seatsText || Number.isNaN(total)) {
    return 'Including you as the driver. Leave blank for no limit.';
  }
  if (total < MIN_TOTAL_SEATS) {
    return 'Needs at least 2: you + 1 rider.';
  }
  const riders = total - 1;
  return `You + ${riders} rider${riders === 1 ? '' : 's'}`;
}

function mergeDate(current: Date | null, datePart: Date) {
  const next = new Date(datePart);
  if (current) {
    next.setHours(current.getHours(), current.getMinutes());
  }
  return next;
}

function SectionTitle({ icon, title, isDark }: { icon: ReactNode; title: string; isDark: boolean }) {
  return (
    <View className="mb-3 flex-row items-center gap-2">
      <View className={`h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>{icon}</View>
      <Text className={`text-[16px] font-bold ${isDark ? 'text-white' : 'text-[#1B2340]'}`}>{title}</Text>
    </View>
  );
}

export default function CreateTripScreen() {
  const router = useRouter();
  // Set when a guild leader posts this carpool as a guild "Let's PartyUp".
  const { guildId, guildName } = useLocalSearchParams<{ guildId?: string; guildName?: string }>();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();

  const background = isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]';
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const inputBg = isDark ? 'bg-[#18253C]' : 'bg-[#F7F8FC]';
  const inputText = isDark ? 'text-white' : 'text-[#17233F]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';
  const isVerified = profile?.verification_status === 'approved';

  const [approvedVehicles, setApprovedVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  // Carpool drivers need a valid driver's license on file.
  const [license, setLicense] = useState<DriverLicense | null>(null);
  const [idIsLicense, setIdIsLicense] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!isVerified) {
        return;
      }
      let cancelled = false;
      setVehiclesLoading(true);
      void Promise.all([listMyApprovedVehicles(), getMyDriverLicense(), hasVerifiedIdLicense()]).then(([{ data }, licenseResult, verifiedIdIsLicense]) => {
        if (cancelled) return;
        setApprovedVehicles(data);
        setSelectedVehicleId((current) => (current && data.some((v) => v.id === current) ? current : (data[0]?.id ?? null)));
        setLicense(licenseResult.data);
        setIdIsLicense(verifiedIdIsLicense);
        setVehiclesLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [isVerified])
  );

  const [title, setTitle] = useState('');
  const [origin, setOrigin] = useState<MeetupDraft>(EMPTY_MEETUP);
  const [destination, setDestination] = useState<MeetupDraft>(EMPTY_MEETUP);
  const [meetup, setMeetup] = useState<MeetupDraft>(EMPTY_MEETUP);
  const [routeStops, setRouteStops] = useState<MeetupDraft[]>([]);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);

  const [includeEnd, setIncludeEnd] = useState(false);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [visibility, setVisibility] = useState<TripVisibility>('public');
  const [seatsTotal, setSeatsTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { style: shakeStyle, shake } = useShake();

  function fail(message: string) {
    setErrorMessage(message);
    shake();
  }

  function toggleIncludeEnd() {
    setIncludeEnd((current) => {
      if (current) {
        setEndDate(null);
      }
      return !current;
    });
  }

  async function handleSubmit() {
    if (!title.trim()) {
      fail('Give your carpool a title.');
      return;
    }

    const originLocation = toLocation(origin);
    if (!originLocation) {
      fail('Set where you are coming from: city, map pin, and a landmark.');
      return;
    }
    const destinationLocation = toLocation(destination);
    if (!destinationLocation) {
      fail('Set how far you are going: city, map pin, and a landmark.');
      return;
    }

    if (!startDate) {
      fail('Set when you leave (departure date and time).');
      return;
    }
    if (startDate.getTime() < Date.now()) {
      fail('Departure time must be in the future.');
      return;
    }

    const meetupLocation = toLocation(meetup);
    if (!meetupLocation) {
      fail('Set the pickup point: city, map pin, and a landmark.');
      return;
    }

    const stops: RouteStop[] = [];
    for (const [index, stop] of routeStops.entries()) {
      const location = toLocation(stop);
      if (!location) {
        fail(`Finish stop ${index + 1} (city, map pin, and a landmark) or remove it.`);
        return;
      }
      stops.push({ label: formatMeetupLabel(location), municipality: location.municipality, lat: location.latitude, lng: location.longitude });
    }

    if (!selectedVehicleId) {
      fail('Select a vehicle for this trip.');
      return;
    }

    // The form asks for total seats including the driver (what people naturally
    // count), but trips.seats_total is rider seats -- the DB computes
    // seats_available as seats_total minus accepted riders, driver excluded.
    const totalSeatsText = seatsTotal.trim();
    const totalSeats = totalSeatsText ? Number.parseInt(totalSeatsText, 10) : null;
    if (totalSeatsText && (!/^\d{1,2}$/.test(totalSeatsText) || totalSeats === null || totalSeats < MIN_TOTAL_SEATS)) {
      fail(`Total seats must be ${MIN_TOTAL_SEATS} to 99, including you as the driver.`);
      return;
    }
    const riderSeats = totalSeats !== null ? totalSeats - 1 : null;

    if (includeEnd && endDate && endDate.getTime() < startDate.getTime()) {
      fail('Return / end time must be after your departure time.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const { data, error } = await createTrip({
      title: title.trim(),
      origin: formatMeetupLabel(originLocation),
      destination: formatMeetupLabel(destinationLocation),
      startAt: startDate.toISOString(),
      endAt: includeEnd && endDate ? endDate.toISOString() : null,
      visibility,
      seatsTotal: riderSeats,
      notes: notes.trim() || null,
      destinationLat: destinationLocation.latitude,
      destinationLng: destinationLocation.longitude,
      vehicleId: selectedVehicleId,
      meetup: meetupLocation,
      originLat: originLocation.latitude,
      originLng: originLocation.longitude,
      routeStops: stops,
      guildId: guildId ?? null,
    });

    setSubmitting(false);

    if (error || !data) {
      fail(error?.message ?? 'Unable to create trip.');
      return;
    }

    router.replace({ pathname: '/trip/[id]', params: { id: (data as { id: string }).id, celebrate: 'created' } });
  }

  return (
    <KeyboardAvoidingView behavior="padding" className={`flex-1 ${background}`}>
      <ScreenHeader
        title={guildId ? "Let's PartyUp" : 'Create Carpool'}
        subtitle={guildId ? `Carpool for ${guildName ?? 'your guild'}` : 'Share your ride, riders chip in for fuel'}
      />

      {!isVerified ? (
        <EmptyState
          key="unverified"
          icon={<ShieldAlert size={34} color="#D88700" />}
          title="Verify your identity to create a trip"
          message={
            profile?.verification_status === 'pending'
              ? 'Your ID verification is still under review. This usually takes 1-2 hours.'
              : profile?.verification_status === 'rejected'
                ? 'Your last ID verification was rejected. Resubmit clearer documents to continue.'
                : 'Upload a government ID and a selfie to unlock trip creation.'
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
      ) : vehiclesLoading ? (
        <View key="loading" className="gap-4 px-4 pt-5">
          <SkeletonCard height={220} />
          <SkeletonCard height={120} />
          <SkeletonCard height={160} />
        </View>
      ) : approvedVehicles.length === 0 ? (
        <EmptyState
          key="no-vehicle"
          icon={<Car size={34} color="#2A55D4" />}
          title="Add and verify a vehicle first"
          message="Riders need to know they're getting into a verified vehicle. Add your vehicle and submit it for review."
          action={
            <AnimatedPressable onPress={() => router.push('/vehicles')} className="rounded-2xl bg-[#2A55D4] px-6 py-3.5">
              <Text className="text-base font-bold text-white">Add Vehicle</Text>
            </AnimatedPressable>
          }
        />
      ) : !isLicenseValid(license) ? (
        <EmptyState
          key="no-license"
          icon={<IdCard size={34} color="#2A55D4" />}
          title={license?.status === 'pending' ? "Your driver's license is under review" : "Add your driver's license"}
          message={
            license?.status === 'pending'
              ? "You can create carpools once a PartyUp admin verifies it. We'll notify you."
              : license?.status === 'approved'
                ? 'Your license on file has expired. Add your renewed license to keep driving with PartyUp.'
                : license?.status === 'rejected'
                  ? `Your license photos were rejected${license.reviewer_notes ? `: ${license.reviewer_notes}` : ''}. Please retake them.`
                  : idIsLicense
                    ? "You verified your ID with a driver's license. Just scan the QR code on its back."
                    : "Drivers need a valid license to create carpools. Take a photo of the front and back."
          }
          action={
            license?.status === 'pending' ? undefined : (
              <AnimatedPressable
                onPress={() => router.push({ pathname: '/verify-vehicle', params: { licenseOnly: '1' } })}
                className="rounded-2xl bg-[#2A55D4] px-6 py-3.5">
                <Text className="text-base font-bold text-white">
                  {idIsLicense && !license ? 'Use my verified license' : "Add Driver's License"}
                </Text>
              </AnimatedPressable>
            )
          }
        />
      ) : (
      <>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Card index={0} className="gap-4">
          <SectionTitle isDark={isDark} icon={<MapPin size={16} color="#2A55D4" />} title="Route" />
          <View className="-mt-3">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>TRIP TITLE</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="e.g., Weekday commute to Makati"
              placeholderTextColor={placeholderColor}
              maxLength={60}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <MeetupLocationPicker
            label="COMING FROM"
            value={origin}
            onChange={setOrigin}
            isDark={isDark}
            landmarkPlaceholder="Where your trip starts, e.g. your barangay"
          />

          <MeetupLocationPicker
            label="GOING UP TO"
            value={destination}
            onChange={setDestination}
            isDark={isDark}
            landmarkPlaceholder="How far you're going, e.g. SM North EDSA"
          />
        </Card>

        <Card index={1} className="gap-4">
          <SectionTitle isDark={isDark} icon={<Route size={16} color="#2A55D4" />} title="Pickup & stops" />
          <View className="-mt-3">
            <MeetupLocationPicker
              label="PICKUP POINT"
              value={meetup}
              onChange={setMeetup}
              isDark={isDark}
              landmarkPlaceholder="Where riders meet you, e.g. Jollibee MacArthur"
            />
          </View>

          <Text className={`text-[13px] leading-5 ${secondary}`}>
            Add places you pass along the way where you can pick up an angkas. Riders choose one when they request a seat.
          </Text>
          {routeStops.map((stop, index) => (
            <View key={index} className={`gap-2 rounded-2xl border p-3 ${border}`}>
              <View className="flex-row items-center justify-between">
                <Text className={`text-[13px] font-bold ${secondary}`}>STOP {index + 1}</Text>
                <AnimatedPressable
                  onPress={() => setRouteStops((current) => current.filter((_, i) => i !== index))}
                  accessibilityLabel={`Remove stop ${index + 1}`}>
                  <Trash2 size={16} color="#B91C1C" />
                </AnimatedPressable>
              </View>
              <MeetupLocationPicker
                label="PASSING THROUGH"
                value={stop}
                onChange={(next) => setRouteStops((current) => current.map((item, i) => (i === index ? next : item)))}
                isDark={isDark}
                landmarkPlaceholder="e.g. Petron, Guiguinto exit"
              />
            </View>
          ))}
          {routeStops.length < MAX_ROUTE_STOPS ? (
            <AnimatedPressable
              onPress={() => setRouteStops((current) => [...current, EMPTY_MEETUP])}
              className={`flex-row items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3.5 ${border}`}>
              <Plus size={16} color="#2A55D4" />
              <Text className="text-sm font-bold text-[#2A55D4]">Add a stop along the route</Text>
            </AnimatedPressable>
          ) : null}
        </Card>

        <Card index={2}>
          <SectionTitle isDark={isDark} icon={<Car size={16} color="#2A55D4" />} title="Vehicle" />
          <View className="flex-row flex-wrap gap-2">
            {approvedVehicles.map((vehicle) => {
              const selected = selectedVehicleId === vehicle.id;
              return (
                <AnimatedPressable
                  key={vehicle.id}
                  onPress={() => setSelectedVehicleId(vehicle.id)}
                  className={`flex-row items-center gap-2 rounded-full px-4 py-2.5 ${selected ? 'bg-[#2A55D4]' : `border ${border} ${inputBg}`}`}
                >
                  <Car size={16} color={selected ? '#FFFFFF' : '#8A93A6'} />
                  <Text className={`text-[15px] font-semibold ${selected ? 'text-white' : primary}`}>
                    {vehicle.make} {vehicle.model}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </View>
        </Card>

        <Card index={3} className="gap-4">
          <SectionTitle isDark={isDark} icon={<Calendar size={16} color="#2A55D4" />} title="Schedule" />
          <View className="-mt-3">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>WHEN YOU LEAVE (DEPARTURE DATE &amp; TIME)</Text>
            <View className="flex-row gap-3">
              <AnimatedPressable
                onPress={() => setShowStartDatePicker(true)}
                className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
              >
                <Calendar size={18} color={startDate ? '#2A55D4' : placeholderColor} />
                <Text className={`flex-1 text-base ${startDate ? inputText : ''}`} style={!startDate ? { color: placeholderColor } : undefined}>
                  {formatDateLabel(startDate)}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={() => setShowStartTimePicker(true)}
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
                <Text className="text-sm font-bold text-[#B91C1C]">Clear departure date &amp; time</Text>
              </AnimatedPressable>
            ) : null}
          </View>

          {includeEnd ? (
            <Animated.View key="end-on" entering={FadeInDown.duration(250)}>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className={`text-[13px] font-bold ${secondary}`}>RETURN / END DATE &amp; TIME</Text>
                <AnimatedPressable onPress={toggleIncludeEnd} className="flex-row items-center gap-1">
                  <X size={14} color="#B91C1C" />
                  <Text className="text-[13px] font-bold text-[#B91C1C]">Remove</Text>
                </AnimatedPressable>
              </View>
              <View className="flex-row gap-3">
                <AnimatedPressable
                  onPress={() => setShowEndDatePicker(true)}
                  className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
                >
                  <Calendar size={18} color={endDate ? '#2A55D4' : placeholderColor} />
                  <Text className={`flex-1 text-base ${endDate ? inputText : ''}`} style={!endDate ? { color: placeholderColor } : undefined}>
                    {formatDateLabel(endDate)}
                  </Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => setShowEndTimePicker(true)}
                  className={`flex-1 flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
                >
                  <Clock size={18} color={endDate ? '#2A55D4' : placeholderColor} />
                  <Text className={`flex-1 text-base ${endDate ? inputText : ''}`} style={!endDate ? { color: placeholderColor } : undefined}>
                    {formatTimeLabel(endDate)}
                  </Text>
                </AnimatedPressable>
              </View>
            </Animated.View>
          ) : (
            <AnimatedPressable
              key="end-off"
              onPress={toggleIncludeEnd}
              className={`flex-row items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3.5 ${border}`}
            >
              <Plus size={16} color="#2A55D4" />
              <Text className="text-sm font-bold text-[#2A55D4]">Add return / end time</Text>
              <Flag size={14} color="#8A93A6" />
            </AnimatedPressable>
          )}
        </Card>

        {guildId ? null : (
        <Card index={4}>
          <SectionTitle isDark={isDark} icon={<Globe size={16} color="#2A55D4" />} title="Visibility" />
          <View className="gap-2">
            {visibilityOptions.map((option) => {
              const selected = visibility === option.key;
              const OptionIcon = option.icon;
              return (
                <AnimatedPressable
                  key={option.key}
                  onPress={() => setVisibility(option.key)}
                  className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3.5 ${
                    selected ? (isDark ? 'border-[#3B82F6] bg-[#172554]' : 'border-[#2A55D4] bg-[#E9F0FF]') : `${border} ${inputBg}`
                  }`}
                >
                  <OptionIcon size={20} color={selected ? '#2A55D4' : '#8A93A6'} />
                  <View className="flex-1">
                    <Text className={`text-base font-bold ${selected ? 'text-[#2A55D4]' : primary}`}>{option.label}</Text>
                    <Text className={`mt-0.5 text-sm ${selected ? 'text-[#2A55D4]/80' : secondary}`}>{option.description}</Text>
                  </View>
                </AnimatedPressable>
              );
            })}
          </View>
        </Card>
        )}

        <Card index={5} className="gap-4">
          <SectionTitle isDark={isDark} icon={<Wallet size={16} color="#2A55D4" />} title="Seats & fuel sharing" />
          <View className="-mt-3">
            <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>TOTAL SEATS (OPTIONAL)</Text>
            <TextInput
              className={`rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
              placeholder="e.g., 4"
              placeholderTextColor={placeholderColor}
              keyboardType="number-pad"
              maxLength={2}
              value={seatsTotal}
              onChangeText={(text) => setSeatsTotal(text.replace(/\D/g, '').slice(0, 2))}
            />
            <Text className={`mt-1.5 text-[12px] leading-4 ${secondary}`}>{seatSummary(seatsTotal)}</Text>
          </View>

          <View className={`rounded-2xl border px-4 py-3.5 ${isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D7DFEE] bg-[#F4F7FF]'}`}>
            <Text className={`text-sm leading-5 ${secondary}`}>
              No fixed fare. Each rider offers a <Text className="font-bold">small fuel contribution</Text> (PartyUp suggests a fair range by
              distance) and you accept who rides, like a ride-hailing app. Riders also pay a {Math.round(CARPOOL_PLATFORM_FEE_RATE * 100)}%
              PartyUp fee on top.
            </Text>
          </View>
        </Card>

        <Card index={6}>
          <SectionTitle isDark={isDark} icon={<NotebookPen size={16} color="#2A55D4" />} title="Notes (optional)" />
          <TextInput
            className={`min-h-[88px] rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
            placeholder="Luggage space, stopovers, etc."
            placeholderTextColor={placeholderColor}
            maxLength={300}
            multiline
            value={notes}
            onChangeText={setNotes}
          />
        </Card>

        {errorMessage ? (
          <Animated.View entering={FadeIn.duration(200)} style={shakeStyle} className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </Animated.View>
        ) : null}

        <AnimatedPressable onPress={handleSubmit} disabled={submitting} className="rounded-2xl bg-[#2A55D4] py-4 shadow-sm shadow-[#2A55D4]/30">
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Create Trip</Text>}
        </AnimatedPressable>
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
