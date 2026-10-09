import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { CalendarDays, Car, Check, ChevronRight, IdCard, Minus, Plus, Trash2, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePickerModal } from '@/components/carpool/DatePickerModal';
import RemoveVehicleModal from '@/components/RemoveVehicleModal';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, SkeletonCard, SuccessOverlay, useShake } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { confirmDiscard } from '@/hooks/use-unsaved-changes';
import { showAlert } from '@/lib/dialog';
import {
  COMMON_MAKES,
  createVehicle,
  deleteVehicle,
  getMyDriverLicense,
  getVehiclePhotoUrl,
  isLicenseValid,
  isRegistrationExpired,
  isRegistrationExpiringSoon,
  listMyVehicles,
  normalizePlate,
  updateVehicle,
  VEHICLE_COLORS,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPES,
  type DriverLicense,
  type Vehicle,
  type VehicleType,
  type VehicleVerificationStatus,
} from '@/lib/vehicles';

const STATUS_LABEL: Record<VehicleVerificationStatus, string> = {
  unverified: 'Unverified',
  pending: 'Under review',
  approved: 'Verified',
  rejected: 'Rejected',
};

const MIN_SEATS = 2;
const MAX_SEATS = 15;
const OTHER = 'Other';

function getStatusColor(isDark: boolean): Record<VehicleVerificationStatus, { bg: string; text: string }> {
  return {
    unverified: { bg: isDark ? 'bg-[#1E293B]' : 'bg-[#F1F3F8]', text: isDark ? 'text-[#94A3B8]' : 'text-[#6B7590]' },
    pending: { bg: isDark ? 'bg-[#3A2A11]' : 'bg-[#FFF3DC]', text: isDark ? 'text-[#F0A93B]' : 'text-[#B4650B]' },
    approved: { bg: isDark ? 'bg-[#0F2B1E]' : 'bg-[#EAF8F0]', text: isDark ? 'text-[#34D399]' : 'text-[#19A06B]' },
    rejected: { bg: isDark ? 'bg-[#2B1414]' : 'bg-[#FDECEC]', text: isDark ? 'text-[#F87171]' : 'text-[#B3261E]' },
  };
}

type FormState = {
  make: string;
  /** Typed make when "Other" is picked. */
  makeOther: string;
  model: string;
  year: string;
  color: string;
  colorOther: string;
  plateNumber: string;
  vehicleType: VehicleType | null;
  seats: number | null;
  registrationExpiry: Date | null;
};

const EMPTY_FORM: FormState = {
  make: '',
  makeOther: '',
  model: '',
  year: '',
  color: '',
  colorOther: '',
  plateNumber: '',
  vehicleType: null,
  seats: null,
  registrationExpiry: null,
};

function toDateString(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(value: string | Date | null) {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formFromVehicle(vehicle: Vehicle): FormState {
  const knownMake = COMMON_MAKES.includes(vehicle.make);
  const knownColor = !vehicle.color || VEHICLE_COLORS.some((color) => color.name === vehicle.color);
  return {
    make: knownMake ? vehicle.make : OTHER,
    makeOther: knownMake ? '' : vehicle.make,
    model: vehicle.model,
    year: vehicle.year ? String(vehicle.year) : '',
    color: knownColor ? (vehicle.color ?? '') : OTHER,
    colorOther: knownColor ? '' : (vehicle.color ?? ''),
    plateNumber: vehicle.plate_number ?? '',
    vehicleType: vehicle.vehicle_type,
    seats: vehicle.seat_capacity,
    registrationExpiry: vehicle.registration_expiry ? new Date(`${vehicle.registration_expiry}T00:00:00`) : null,
  };
}

// The vehicle's own exterior photo (private bucket; the owner can read it).
function VehiclePhoto({ path, isDark }: { path: string | null; isDark: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (path) void getVehiclePhotoUrl(path).then((signed) => !cancelled && setUrl(signed));
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <View className={`h-16 w-16 items-center justify-center overflow-hidden rounded-2xl ${isDark ? 'bg-[#18253C]' : 'bg-[#EEF3FF]'}`}>
      {url ? <Image source={{ uri: url }} className="h-full w-full" resizeMode="cover" /> : <Car size={26} color="#2747C7" />}
    </View>
  );
}

export default function VehiclesScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const statusColorMap = getStatusColor(isDark);

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]';
  const softButtonBg = isDark ? 'bg-[#1E293B]' : 'bg-[#F3F5FA]';
  const primaryTextColor = isDark ? '#FFFFFF' : '#17233F';
  const mutedTextColor = isDark ? '#94A3B8' : '#6B7590';
  const placeholderColor = isDark ? '#64748B' : '#A1A8B8';
  const inputBg = isDark ? '#111B2E' : '#F7F8FC';
  const inputBorder = isDark ? '#22324B' : '#E0E5EF';
  const modalSheetBg = isDark ? '#0F172A' : '#FFFFFF';
  const modalBorder = isDark ? '#22324B' : '#E5EAF2';
  const errorBg = isDark ? '#2B1414' : '#FEE2E2';
  const errorText = isDark ? '#F87171' : '#B91C1C';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [license, setLicense] = useState<DriverLicense | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // What the form looked like when opened, to tell real edits from none.
  const [formStart, setFormStart] = useState<FormState>(EMPTY_FORM);
  const formDirty = JSON.stringify(form) !== JSON.stringify(formStart);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Vehicle | null>(null);
  const { style: shakeStyle, shake } = useShake();

  const clearSavedMessage = useCallback(() => setSavedMessage(null), []);

  const load = useCallback(async () => {
    setVehiclesLoading(true);
    setErrorMessage(null);
    const [{ data, error }, licenseResult] = await Promise.all([listMyVehicles(), getMyDriverLicense()]);
    setLicense(licenseResult.data);
    if (error) {
      setErrorMessage(error.message);
    } else {
      setVehicles(data);
    }
    setVehiclesLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  const { refreshControl } = usePullToRefresh(load);

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormStart(EMPTY_FORM);
    setFormError(null);
    setFormVisible(true);
  }

  function openEditForm(vehicle: Vehicle) {
    setEditingId(vehicle.id);
    setForm(formFromVehicle(vehicle));
    setFormStart(formFromVehicle(vehicle));
    setFormError(null);
    setFormVisible(true);
  }

  // ×, Cancel and Android back: ask first if anything was typed.
  function closeForm() {
    confirmDiscard(formDirty, () => {
      setFormVisible(false);
      setForm(EMPTY_FORM);
      setFormStart(EMPTY_FORM);
    }, { message: editingId ? "Your changes to this vehicle won't be saved." : "The vehicle details you entered won't be saved." });
  }

  function fail(message: string) {
    setFormError(message);
    shake();
  }

  function pickType(type: VehicleType) {
    const defaultSeats = VEHICLE_TYPES.find((option) => option.value === type)?.seats ?? 5;
    setForm((current) => ({ ...current, vehicleType: type, seats: defaultSeats }));
  }

  function changeSeats(delta: number) {
    setForm((current) => ({ ...current, seats: Math.min(MAX_SEATS, Math.max(MIN_SEATS, (current.seats ?? 5) + delta)) }));
  }

  async function handleSaveVehicle() {
    const make = (form.make === OTHER ? form.makeOther : form.make).trim();
    if (!make) return fail('Pick the make of your vehicle.');
    if (!form.model.trim()) return fail('Enter the model, e.g. Vios.');

    const yearText = form.year.trim();
    const year = Number.parseInt(yearText, 10);
    const maxYear = new Date().getFullYear() + 1;
    if (!/^\d{4}$/.test(yearText) || year < 1980 || year > maxYear) return fail(`Enter the year as 4 digits, between 1980 and ${maxYear}.`);

    const plateNumber = form.plateNumber.trim().toUpperCase();
    if (!plateNumber) return fail('Enter the plate number. Riders use it to find your car.');
    if (!/^[A-Z0-9][A-Z0-9 -]{1,7}$/.test(plateNumber) || normalizePlate(plateNumber).length < 3) {
      return fail('Plate number must be up to 8 letters/numbers (e.g., ABC 1234).');
    }
    const duplicate = vehicles.find((vehicle) => vehicle.id !== editingId && vehicle.plate_number && normalizePlate(vehicle.plate_number) === normalizePlate(plateNumber));
    if (duplicate) return fail(`You already added plate ${duplicate.plate_number} (${duplicate.make} ${duplicate.model}).`);

    const color = (form.color === OTHER ? form.colorOther : form.color).trim();
    if (!color) return fail('Pick the color, so riders can spot your car.');
    if (!form.vehicleType || !form.seats) return fail('Pick the vehicle type and number of seats.');
    if (!form.registrationExpiry) return fail('Add the registration expiry date from your OR/CR.');

    setSaving(true);
    setFormError(null);

    const input = {
      make,
      model: form.model,
      year,
      color,
      plateNumber,
      vehicleType: form.vehicleType,
      seatCapacity: form.seats,
      registrationExpiry: toDateString(form.registrationExpiry),
    };

    const result = editingId ? await updateVehicle(editingId, input) : await createVehicle(input);
    setSaving(false);

    if (result.error) {
      fail(result.error.message);
      return;
    }

    setFormVisible(false);
    void load();

    const edited = editingId ? vehicles.find((vehicle) => vehicle.id === editingId) : null;
    // Editing a verified car whose registration lapsed sends it back for review (DB trigger).
    if (edited && !(edited.verification_status === 'approved' && isRegistrationExpired(edited))) {
      setSavedMessage('Vehicle updated');
      return;
    }
    // Straight on to verification: an unverified car can't be used yet.
    const vehicleId = edited?.id ?? ('data' in result ? (result.data as Vehicle | null)?.id : undefined);
    showAlert(
      edited ? 'Registration updated' : 'Vehicle added',
      edited
        ? 'Send a photo of your renewed OR/CR so we can verify the car again.'
        : 'Verify it now to start offering carpools. It only takes a few photos.',
      [
        { text: 'Later', style: 'cancel' },
        ...(vehicleId ? [{ text: 'Verify now', onPress: () => router.push({ pathname: '/verify-vehicle', params: { vehicleId } }) }] : []),
      ]
    );
  }

  async function removeVehicle(vehicle: Vehicle) {
    setRemovingId(vehicle.id);
    const { error } = await deleteVehicle(vehicle.id);
    setRemovingId(null);
    if (error) return error.message;
    setVehicles((current) => current.filter((item) => item.id !== vehicle.id));
    return null;
  }

  function confirmRemove(vehicle: Vehicle) {
    // A verified or under-review car loses its review: type the plate to confirm.
    if ((vehicle.verification_status === 'approved' || vehicle.verification_status === 'pending') && vehicle.plate_number) {
      setRemoveTarget(vehicle);
      return;
    }
    showAlert(
      `Remove ${vehicle.make} ${vehicle.model}?`,
      'It disappears from your vehicles and can no longer be used for carpools. Past trips keep their history.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const message = await removeVehicle(vehicle);
            if (message) showAlert('Could not remove', message);
          },
        },
      ]
    );
  }

  const labelClass = 'text-[14px] font-extrabold tracking-wide';
  const chip = (active: boolean) => ({
    borderColor: active ? '#2747C7' : inputBorder,
    backgroundColor: active ? '#2747C7' : inputBg,
  });

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScreenHeader
        title="My Vehicles"
        subtitle="Track and verify your vehicles for carpooling"
        right={
          <AnimatedPressable
            onPress={openAddForm}
            accessibilityLabel="Add vehicle"
            className="h-10 w-10 items-center justify-center rounded-full bg-[#2747C7] shadow-sm shadow-[#2747C7]/30"
          >
            <Plus size={20} color="#fff" />
          </AnimatedPressable>
        }
      />

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={refreshControl}>
        {errorMessage ? (
          <View className="rounded-xl px-4 py-3" style={{ backgroundColor: errorBg }}>
            <Text className="text-sm" style={{ color: errorText }}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Drivers with an approved car but no valid license can't create carpools yet. */}
        {!vehiclesLoading && vehicles.some((vehicle) => vehicle.verification_status === 'approved') && !isLicenseValid(license) && license?.status !== 'pending' ? (
          <AnimatedPressable
            key="license-banner"
            onPress={() => router.push({ pathname: '/verify-vehicle', params: { licenseOnly: '1' } })}
            className="mb-4 flex-row items-center gap-3 rounded-2xl border border-[#F5C26B] bg-[#FFF7E6] px-4 py-3">
            <IdCard size={20} color="#B4650B" />
            <Text className="flex-1 text-sm font-semibold text-[#7A4A08]">
              {license ? "Your driver's license needs updating" : "Add your driver's license"} to create carpools.
            </Text>
            <ChevronRight size={18} color="#B4650B" />
          </AnimatedPressable>
        ) : null}

        {vehiclesLoading && vehicles.length === 0 ? (
          <View key="loading" className="gap-4">
            <SkeletonCard height={170} />
            <SkeletonCard height={170} />
          </View>
        ) : vehicles.length === 0 ? (
          <EmptyState
            key="empty"
            icon={<Car size={34} color="#2747C7" />}
            title="No vehicles yet"
            message="Add a vehicle to start creating carpool trips."
            action={
              <AnimatedPressable onPress={openAddForm} className="flex-row items-center gap-2 rounded-full bg-[#2747C7] px-5 py-3">
                <Plus size={18} color="#fff" />
                <Text className="text-[15px] font-bold text-white">Add Vehicle</Text>
              </AnimatedPressable>
            }
          />
        ) : (
          vehicles.map((vehicle, index) => {
            const statusColor = statusColorMap[vehicle.verification_status];
            const registrationExpired = isRegistrationExpired(vehicle);
            const registrationSoon = isRegistrationExpiringSoon(vehicle);
            // An approved car whose OR/CR lapsed can be updated and resubmitted (see migration 202610090010).
            const lapsed = vehicle.verification_status === 'approved' && registrationExpired;
            const editable = vehicle.verification_status === 'unverified' || vehicle.verification_status === 'rejected' || lapsed;
            return (
              <Card key={vehicle.id} index={index} className="mb-4">
                <View className="flex-row items-start justify-between gap-3">
                  <VehiclePhoto path={vehicle.exterior_image_path} isDark={isDark} />
                  <View className="flex-1">
                    <Text className="text-headline-20 font-bold" style={{ color: primaryTextColor }}>
                      {vehicle.make} {vehicle.model} {vehicle.year ? vehicle.year : ''}
                    </Text>
                    {vehicle.plate_number ? <Text className="mt-1 text-[15px] font-semibold" style={{ color: mutedTextColor }}>{vehicle.plate_number}</Text> : null}
                    <Text className="mt-0.5 text-[14px]" style={{ color: mutedTextColor }}>
                      {[
                        vehicle.color,
                        vehicle.vehicle_type ? VEHICLE_TYPE_LABEL[vehicle.vehicle_type] : null,
                        vehicle.seat_capacity ? `${vehicle.seat_capacity} seats` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <View className={`rounded-full px-3 py-1.5 ${statusColor.bg}`}>
                    <Text className={`text-[13px] font-bold ${statusColor.text}`}>{STATUS_LABEL[vehicle.verification_status]}</Text>
                  </View>
                </View>

                {vehicle.registration_expiry ? (
                  <View
                    className={`mt-3 flex-row items-center gap-2 rounded-2xl px-3 py-2.5 ${
                      registrationExpired ? statusColorMap.rejected.bg : registrationSoon ? statusColorMap.pending.bg : softButtonBg
                    }`}>
                    <CalendarDays size={15} color={registrationExpired ? '#B3261E' : registrationSoon ? '#B4650B' : mutedTextColor} />
                    <Text
                      className={`flex-1 text-[13px] font-semibold ${registrationExpired ? statusColorMap.rejected.text : registrationSoon ? statusColorMap.pending.text : ''}`}
                      style={registrationExpired || registrationSoon ? undefined : { color: mutedTextColor }}>
                      {registrationExpired
                        ? `Registration expired ${formatDate(vehicle.registration_expiry)}. Renew it to keep carpooling.`
                        : registrationSoon
                          ? `Registration expires ${formatDate(vehicle.registration_expiry)}. Renew it soon.`
                          : `Registration valid until ${formatDate(vehicle.registration_expiry)}`}
                    </Text>
                  </View>
                ) : null}

                {vehicle.verification_status === 'rejected' && vehicle.reviewer_notes ? (
                  <View className={`mt-3 rounded-2xl px-3 py-2.5 ${statusColorMap.rejected.bg}`}>
                    <Text className={`text-[14px] leading-5 ${statusColorMap.rejected.text}`}>{vehicle.reviewer_notes}</Text>
                  </View>
                ) : null}

                <View className="mt-4 flex-row gap-3">
                  {/* Under review / verified vehicles are locked (also enforced by a DB trigger) so staff approve exactly what they reviewed. */}
                  {editable && !lapsed ? (
                    <AnimatedPressable onPress={() => openEditForm(vehicle)} className={`flex-1 rounded-2xl py-3.5 ${softButtonBg}`}>
                      <Text className="text-center text-[16px] font-bold" style={{ color: primaryTextColor }}>Edit</Text>
                    </AnimatedPressable>
                  ) : null}

                  {editable ? (
                    <AnimatedPressable
                      onPress={() => (lapsed ? openEditForm(vehicle) : router.push({ pathname: '/verify-vehicle', params: { vehicleId: vehicle.id } }))}
                      className="flex-1 rounded-2xl bg-[#2747C7] py-3.5"
                    >
                      <Text className="text-center text-[16px] font-bold text-white">
                        {lapsed ? 'Renew Registration' : vehicle.verification_status === 'rejected' ? 'Resubmit Documents' : 'Verify Vehicle'}
                      </Text>
                    </AnimatedPressable>
                  ) : vehicle.verification_status === 'pending' ? (
                    <View className={`flex-1 items-center justify-center rounded-2xl py-3.5 ${softButtonBg}`}>
                      <Text className="text-[15px] font-semibold" style={{ color: mutedTextColor }}>Under review</Text>
                    </View>
                  ) : (
                    <View className={`flex-1 items-center justify-center rounded-2xl py-3.5 ${statusColorMap.approved.bg}`}>
                      <Text className={`text-[15px] font-semibold ${statusColorMap.approved.text}`}>Verified</Text>
                    </View>
                  )}

                  <AnimatedPressable
                    onPress={() => confirmRemove(vehicle)}
                    disabled={removingId === vehicle.id}
                    accessibilityLabel={`Remove ${vehicle.make} ${vehicle.model}`}
                    className={`w-[52px] items-center justify-center rounded-2xl ${statusColorMap.rejected.bg}`}>
                    {removingId === vehicle.id ? <ActivityIndicator color="#E32727" /> : <Trash2 size={18} color="#E32727" />}
                  </AnimatedPressable>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={closeForm}>
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <View className="flex-1 items-center justify-center bg-black/45 px-4">
            <View className="max-h-[90%] w-full max-w-[440px] rounded-[28px] px-4 py-5 shadow-lg shadow-black/25" style={{ backgroundColor: modalSheetBg }}>
              <View className="flex-row items-start justify-between gap-4 border-b pb-4" style={{ borderColor: modalBorder }}>
                <View className="flex-1">
                  <Text className="text-headline-24 font-bold" style={{ color: primaryTextColor }}>{editingId ? 'Edit Vehicle' : 'Add My Vehicle'}</Text>
                  <Text className="mt-2 text-[15px] leading-6" style={{ color: mutedTextColor }}>Riders see the make, color and plate so they get into the right car.</Text>
                </View>
                <TouchableOpacity onPress={closeForm} accessibilityLabel="Close" className={`h-9 w-9 items-center justify-center rounded-full ${softButtonBg}`}>
                  <Text className="text-[20px]" style={{ color: mutedTextColor }}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView className="pt-4" contentContainerClassName="gap-5 pb-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Make */}
                <View>
                  <Text className={labelClass} style={{ color: mutedTextColor }}>MAKE *</Text>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {[...COMMON_MAKES, OTHER].map((make) => {
                      const active = form.make === make;
                      return (
                        <TouchableOpacity key={make} onPress={() => setForm((current) => ({ ...current, make }))} activeOpacity={0.8}>
                          <View className="rounded-full border px-3.5 py-2" style={chip(active)}>
                            <Text className="text-[14px] font-bold" style={{ color: active ? '#FFFFFF' : primaryTextColor }}>{make}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {form.make === OTHER ? (
                    <TextInput
                      className="mt-2 rounded-2xl border px-4 py-3.5 text-[16px]"
                      style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                      placeholder="Type the make"
                      placeholderTextColor={placeholderColor}
                      autoCapitalize="words"
                      autoFocus
                      value={form.makeOther}
                      onChangeText={(text) => setForm((current) => ({ ...current, makeOther: text }))}
                    />
                  ) : null}
                </View>

                {/* Model + year */}
                <View className="flex-row gap-3">
                  <View className="flex-[1.6]">
                    <Text className={labelClass} style={{ color: mutedTextColor }}>MODEL *</Text>
                    <TextInput
                      className="mt-2 rounded-2xl border px-4 py-3.5 text-[16px]"
                      style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                      placeholder="e.g., Vios"
                      placeholderTextColor={placeholderColor}
                      autoCapitalize="words"
                      value={form.model}
                      onChangeText={(text) => setForm((current) => ({ ...current, model: text }))}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className={labelClass} style={{ color: mutedTextColor }}>YEAR *</Text>
                    <TextInput
                      className="mt-2 rounded-2xl border px-4 py-3.5 text-[16px]"
                      style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                      placeholder="2021"
                      placeholderTextColor={placeholderColor}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={form.year}
                      onChangeText={(text) => setForm((current) => ({ ...current, year: text.replace(/\D/g, '').slice(0, 4) }))}
                    />
                  </View>
                </View>

                {/* Plate */}
                <View>
                  <Text className={labelClass} style={{ color: mutedTextColor }}>PLATE NUMBER *</Text>
                  <TextInput
                    className="mt-2 rounded-2xl border px-4 py-3.5 text-[18px] font-bold tracking-[2px]"
                    style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                    placeholder="ABC 1234"
                    placeholderTextColor={placeholderColor}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={8}
                    value={form.plateNumber}
                    onChangeText={(text) =>
                      setForm((current) => ({ ...current, plateNumber: text.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 8) }))
                    }
                  />
                </View>

                {/* Color */}
                <View>
                  <Text className={labelClass} style={{ color: mutedTextColor }}>COLOR *</Text>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {VEHICLE_COLORS.map((color) => {
                      const active = form.color === color.name;
                      return (
                        <TouchableOpacity key={color.name} onPress={() => setForm((current) => ({ ...current, color: color.name }))} activeOpacity={0.8}>
                          <View className="flex-row items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3" style={chip(active)}>
                            <View
                              className="h-5 w-5 items-center justify-center rounded-full"
                              style={{ backgroundColor: color.hex, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' }}>
                              {active ? <Check size={12} color={['White', 'Pearl White', 'Silver', 'Beige', 'Yellow'].includes(color.name) ? '#111827' : '#FFFFFF'} /> : null}
                            </View>
                            <Text className="text-[13px] font-bold" style={{ color: active ? '#FFFFFF' : primaryTextColor }}>{color.name}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity onPress={() => setForm((current) => ({ ...current, color: OTHER }))} activeOpacity={0.8}>
                      <View className="rounded-full border px-3.5 py-2" style={chip(form.color === OTHER)}>
                        <Text className="text-[13px] font-bold" style={{ color: form.color === OTHER ? '#FFFFFF' : primaryTextColor }}>Other</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                  {form.color === OTHER ? (
                    <TextInput
                      className="mt-2 rounded-2xl border px-4 py-3.5 text-[16px]"
                      style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                      placeholder="e.g., Maroon"
                      placeholderTextColor={placeholderColor}
                      autoCapitalize="words"
                      autoFocus
                      value={form.colorOther}
                      onChangeText={(text) => setForm((current) => ({ ...current, colorOther: text }))}
                    />
                  ) : null}
                </View>

                {/* Type + seats */}
                <View>
                  <Text className={labelClass} style={{ color: mutedTextColor }}>VEHICLE TYPE *</Text>
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {VEHICLE_TYPES.map((type) => {
                      const active = form.vehicleType === type.value;
                      return (
                        <TouchableOpacity key={type.value} onPress={() => pickType(type.value)} activeOpacity={0.8}>
                          <View className="rounded-full border px-3.5 py-2" style={chip(active)}>
                            <Text className="text-[14px] font-bold" style={{ color: active ? '#FFFFFF' : primaryTextColor }}>{type.label}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {form.vehicleType ? (
                    <View className="mt-3 flex-row items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
                      <Users size={18} color={mutedTextColor} />
                      <View className="flex-1">
                        <Text className="text-[15px] font-bold" style={{ color: primaryTextColor }}>Seats, including you</Text>
                        <Text className="text-[12px]" style={{ color: mutedTextColor }}>
                          You can offer up to {(form.seats ?? 5) - 1} rider seat{(form.seats ?? 5) - 1 === 1 ? '' : 's'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => changeSeats(-1)}
                        disabled={(form.seats ?? 5) <= MIN_SEATS}
                        accessibilityLabel="Fewer seats"
                        className={`h-9 w-9 items-center justify-center rounded-full ${softButtonBg}`}>
                        <Minus size={16} color={primaryTextColor} />
                      </TouchableOpacity>
                      <Text className="w-7 text-center text-[18px] font-black" style={{ color: primaryTextColor }}>{form.seats ?? 5}</Text>
                      <TouchableOpacity
                        onPress={() => changeSeats(1)}
                        disabled={(form.seats ?? 5) >= MAX_SEATS}
                        accessibilityLabel="More seats"
                        className={`h-9 w-9 items-center justify-center rounded-full ${softButtonBg}`}>
                        <Plus size={16} color={primaryTextColor} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                {/* Registration */}
                <View>
                  <Text className={labelClass} style={{ color: mutedTextColor }}>REGISTRATION VALID UNTIL *</Text>
                  <TouchableOpacity onPress={() => setDatePickerVisible(true)} activeOpacity={0.8}>
                    <View className="mt-2 flex-row items-center gap-3 rounded-2xl border px-4 py-3.5" style={{ borderColor: inputBorder, backgroundColor: inputBg }}>
                      <CalendarDays size={18} color={mutedTextColor} />
                      <Text className="flex-1 text-[16px]" style={{ color: form.registrationExpiry ? primaryTextColor : placeholderColor }}>
                        {form.registrationExpiry ? formatDate(form.registrationExpiry) : 'Pick the date on your OR/CR'}
                      </Text>
                      <ChevronRight size={18} color={mutedTextColor} />
                    </View>
                  </TouchableOpacity>
                  <Text className="mt-1.5 text-[12px]" style={{ color: mutedTextColor }}>
                    We remind you before it expires. An expired registration pauses new carpools.
                  </Text>
                </View>

                {formError ? (
                  <Animated.View className="rounded-2xl px-4 py-3" style={[{ backgroundColor: errorBg }, shakeStyle]}>
                    <Text className="text-[15px]" style={{ color: errorText }}>{formError}</Text>
                  </Animated.View>
                ) : null}
              </ScrollView>

              <View className="flex-row gap-3 border-t pt-4" style={{ borderColor: modalBorder }}>
                <TouchableOpacity onPress={closeForm} className={`flex-1 rounded-2xl py-4 ${softButtonBg}`}>
                  <Text className="text-center text-[16px] font-bold" style={{ color: primaryTextColor }}>Cancel</Text>
                </TouchableOpacity>
                <AnimatedPressable onPress={() => void handleSaveVehicle()} disabled={saving} className="flex-1 rounded-2xl bg-[#2747C7] py-4">
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-center text-[16px] font-bold text-white">{editingId ? 'Save Changes' : 'Add Vehicle'}</Text>
                  )}
                </AnimatedPressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>

        <DatePickerModal
          visible={datePickerVisible}
          title="Registration valid until"
          value={form.registrationExpiry}
          minDate={new Date()}
          isDark={isDark}
          onClose={() => setDatePickerVisible(false)}
          onSelect={(date) => {
            setForm((current) => ({ ...current, registrationExpiry: date }));
            setDatePickerVisible(false);
          }}
        />
      </Modal>

      <RemoveVehicleModal
        vehicle={removeTarget}
        isDark={isDark}
        onClose={() => setRemoveTarget(null)}
        onConfirm={async (vehicle) => {
          const message = await removeVehicle(vehicle);
          if (!message) setRemoveTarget(null);
          return message;
        }}
      />

      <SuccessOverlay visible={!!savedMessage} title={savedMessage ?? ''} durationMs={1200} onDone={clearSavedMessage} />
    </View>
  );
}
