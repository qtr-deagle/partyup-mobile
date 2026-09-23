import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Car, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/auth-provider';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getTheme, typography } from '@/lib/theme';
import { createVehicle, listMyVehicles, updateVehicle, type Vehicle, type VehicleVerificationStatus } from '@/lib/vehicles';

const STATUS_LABEL: Record<VehicleVerificationStatus, string> = {
  unverified: 'Unverified',
  pending: 'Under review',
  approved: 'Verified',
  rejected: 'Rejected',
};

function getStatusColor(isDark: boolean): Record<VehicleVerificationStatus, { bg: string; text: string }> {
  return {
    unverified: { bg: isDark ? 'bg-[#1E293B]' : 'bg-[#F1F3F8]', text: isDark ? 'text-[#94A3B8]' : 'text-[#6B7590]' },
    pending: { bg: isDark ? 'bg-[#3A2A11]' : 'bg-[#FFF3DC]', text: isDark ? 'text-[#F0A93B]' : 'text-[#B4650B]' },
    approved: { bg: isDark ? 'bg-[#0F2B1E]' : 'bg-[#EAF8F0]', text: isDark ? 'text-[#34D399]' : 'text-[#19A06B]' },
    rejected: { bg: isDark ? 'bg-[#2B1414]' : 'bg-[#FDECEC]', text: isDark ? 'text-[#F87171]' : 'text-[#B3261E]' },
  };
}

type FormState = { make: string; model: string; year: string; color: string; plateNumber: string };

const EMPTY_FORM: FormState = { make: '', model: '', year: '', color: '', plateNumber: '' };

function formFromVehicle(vehicle: Vehicle): FormState {
  return {
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year ? String(vehicle.year) : '',
    color: vehicle.color ?? '',
    plateNumber: vehicle.plate_number ?? '',
  };
}

export default function VehiclesScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const { titleColor } = getTheme(isDark);
  const statusColorMap = getStatusColor(isDark);

  const screenBackground = isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]';
  const headerBackground = isDark ? 'border-[#1E293B] bg-[#0F172A]' : 'border-black/5 bg-white';
  const cardBackground = isDark ? 'border-[#22324B] bg-[#111B2E]' : 'border-[#E2E7F0] bg-white';
  const softButtonBg = isDark ? 'bg-[#1E293B]' : 'bg-[#F3F5FA]';
  const primaryTextColor = isDark ? '#FFFFFF' : '#17233F';
  const mutedTextColor = isDark ? '#94A3B8' : '#6B7590';
  const placeholderColor = isDark ? '#64748B' : '#A1A8B8';
  const inputBg = isDark ? '#111B2E' : '#F7F8FC';
  const inputBorder = isDark ? '#22324B' : '#E0E5EF';
  const iconCloseBg = isDark ? '#1E293B' : '#FFFFFF';
  const modalSheetBg = isDark ? '#0F172A' : '#FFFFFF';
  const modalBorder = isDark ? '#22324B' : '#E5EAF2';
  const emptyIconBg = isDark ? '#18253C' : '#F7F8FC';
  const emptyBorder = isDark ? '#22324B' : '#DCE3EF';
  const errorBg = isDark ? '#2B1414' : '#FEE2E2';
  const errorText = isDark ? '#F87171' : '#B91C1C';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setVehiclesLoading(true);
    setErrorMessage(null);
    const { data, error } = await listMyVehicles();
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

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormVisible(true);
  }

  function openEditForm(vehicle: Vehicle) {
    setEditingId(vehicle.id);
    setForm(formFromVehicle(vehicle));
    setFormError(null);
    setFormVisible(true);
  }

  async function handleSaveVehicle() {
    if (!form.make.trim() || !form.model.trim()) {
      setFormError('Make and model are required.');
      return;
    }

    const yearText = form.year.trim();
    const year = yearText ? Number.parseInt(yearText, 10) : null;
    const maxYear = new Date().getFullYear() + 1;
    if (yearText && (!/^\d{4}$/.test(yearText) || year === null || year < 1900 || year > maxYear)) {
      setFormError('Year must be a 4-digit year (e.g., 2023).');
      return;
    }

    const plateNumber = form.plateNumber.trim().toUpperCase();
    if (plateNumber && !/^[A-Z0-9][A-Z0-9 -]{1,7}$/.test(plateNumber)) {
      setFormError('Plate number must be up to 8 letters/numbers (e.g., ABC 1234).');
      return;
    }

    setSaving(true);
    setFormError(null);

    const input = {
      make: form.make,
      model: form.model,
      year,
      color: form.color || null,
      plateNumber: plateNumber || null,
    };

    const { error } = editingId ? await updateVehicle(editingId, input) : await createVehicle(input);

    setSaving(false);

    if (error) {
      setFormError(error.message);
      return;
    }

    setFormVisible(false);
    void load();
  }

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <View className={`border-b px-4 pb-5 ${headerBackground}`} style={{ paddingTop: insets.top + 16 }}>
        <View className="flex-row items-center justify-between gap-3">
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full shadow-sm shadow-black/10"
            style={{ backgroundColor: iconCloseBg }}
          >
            <Text style={{ color: mutedTextColor }} className="text-[22px]">×</Text>
          </TouchableOpacity>

          <Text className={`flex-1 text-center ${typography.pageTitle} ${titleColor}`} numberOfLines={1}>
            My Vehicles
          </Text>

          <TouchableOpacity
            onPress={openAddForm}
            accessibilityLabel="Add vehicle"
            className="h-10 w-10 items-center justify-center rounded-full bg-[#2747C7]"
          >
            <Plus size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text style={{ color: mutedTextColor }} className="mt-3 text-center text-[15px] leading-6">
          Track and verify your vehicles for carpooling
        </Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerClassName="pb-10">
        {errorMessage ? (
          <View className="rounded-xl px-4 py-3" style={{ backgroundColor: errorBg }}>
            <Text className="text-sm" style={{ color: errorText }}>{errorMessage}</Text>
          </View>
        ) : null}

        {vehiclesLoading ? (
          <ActivityIndicator className="mt-8" color="#2747C7" />
        ) : vehicles.length === 0 ? (
          <View className="items-center justify-center rounded-[24px] border border-dashed px-6 py-16" style={{ borderColor: emptyBorder, backgroundColor: modalSheetBg }}>
            <View className="h-20 w-20 items-center justify-center rounded-full" style={{ backgroundColor: emptyIconBg }}>
              <Car size={36} color="#E34B4B" />
            </View>
            <Text className="mt-6 text-center text-headline-20 font-bold" style={{ color: primaryTextColor }}>No vehicles yet</Text>
            <Text className="mt-2 text-center text-base leading-6" style={{ color: mutedTextColor }}>Add a vehicle to start creating carpool trips.</Text>
            <TouchableOpacity onPress={openAddForm} className="mt-6 flex-row items-center gap-2 rounded-full bg-[#2747C7] px-5 py-3">
              <Plus size={18} color="#fff" />
              <Text className="text-[15px] font-bold text-white">Add Vehicle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          vehicles.map((vehicle) => {
            const statusColor = statusColorMap[vehicle.verification_status];
            return (
              <View key={vehicle.id} className={`mb-4 rounded-[24px] border p-4 shadow-sm shadow-black/5 ${cardBackground}`}>
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="text-headline-24 font-bold" style={{ color: primaryTextColor }}>
                      {vehicle.make} {vehicle.model} {vehicle.year ? vehicle.year : ''}
                    </Text>
                    {vehicle.plate_number ? <Text className="mt-1 text-[15px]" style={{ color: mutedTextColor }}>Plate: {vehicle.plate_number}</Text> : null}
                    {vehicle.color ? <Text className="mt-0.5 text-[15px]" style={{ color: mutedTextColor }}>{vehicle.color}</Text> : null}
                  </View>
                  <View className={`rounded-full px-3 py-1.5 ${statusColor.bg}`}>
                    <Text className={`text-[13px] font-bold ${statusColor.text}`}>{STATUS_LABEL[vehicle.verification_status]}</Text>
                  </View>
                </View>

                {vehicle.verification_status === 'rejected' && vehicle.reviewer_notes ? (
                  <View className={`mt-3 rounded-2xl px-3 py-2.5 ${statusColorMap.rejected.bg}`}>
                    <Text className={`text-[14px] leading-5 ${statusColorMap.rejected.text}`}>{vehicle.reviewer_notes}</Text>
                  </View>
                ) : null}

                <View className="mt-4 flex-row gap-3">
                  {/* Under review / verified vehicles are locked (also enforced by a DB trigger) so staff approve exactly what they reviewed. */}
                  {vehicle.verification_status === 'unverified' || vehicle.verification_status === 'rejected' ? (
                    <TouchableOpacity onPress={() => openEditForm(vehicle)} className={`flex-1 rounded-2xl py-3.5 ${softButtonBg}`}>
                      <Text className="text-center text-[16px] font-bold" style={{ color: primaryTextColor }}>Edit</Text>
                    </TouchableOpacity>
                  ) : null}

                  {vehicle.verification_status === 'unverified' || vehicle.verification_status === 'rejected' ? (
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/verify-vehicle', params: { vehicleId: vehicle.id } })}
                      className="flex-1 rounded-2xl bg-[#2747C7] py-3.5"
                    >
                      <Text className="text-center text-[16px] font-bold text-white">
                        {vehicle.verification_status === 'rejected' ? 'Resubmit Documents' : 'Verify Vehicle'}
                      </Text>
                    </TouchableOpacity>
                  ) : vehicle.verification_status === 'pending' ? (
                    <View className={`flex-1 items-center justify-center rounded-2xl py-3.5 ${softButtonBg}`}>
                      <Text className="text-[15px] font-semibold" style={{ color: mutedTextColor }}>Under review</Text>
                    </View>
                  ) : (
                    <View className={`flex-1 items-center justify-center rounded-2xl py-3.5 ${statusColorMap.approved.bg}`}>
                      <Text className={`text-[15px] font-semibold ${statusColorMap.approved.text}`}>Verified</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={formVisible} transparent animationType="fade" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
          <View className="flex-1 items-center justify-center bg-black/45 px-4">
            <View className="max-h-[88%] w-full max-w-[420px] rounded-[28px] px-4 py-5 shadow-lg shadow-black/25" style={{ backgroundColor: modalSheetBg }}>
              <View className="flex-row items-start justify-between gap-4 border-b pb-4" style={{ borderColor: modalBorder }}>
                <View className="flex-1">
                  <Text className="text-headline-24 font-bold" style={{ color: primaryTextColor }}>{editingId ? 'Edit Vehicle' : 'Add My Vehicle'}</Text>
                  <Text className="mt-2 text-[16px] leading-6" style={{ color: mutedTextColor }}>Track your personal vehicle for carpooling</Text>
                </View>
                <TouchableOpacity onPress={() => setFormVisible(false)} className={`h-9 w-9 items-center justify-center rounded-full ${softButtonBg}`}>
                  <Text className="text-[20px]" style={{ color: mutedTextColor }}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView className="pt-4" contentContainerClassName="gap-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View>
                  <Text className="text-[14px] font-extrabold tracking-wide" style={{ color: mutedTextColor }}>MAKE *</Text>
                  <TextInput
                    className="mt-2 rounded-2xl border px-4 py-4 text-[16px]"
                    style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                    placeholder="e.g., Toyota"
                    placeholderTextColor={placeholderColor}
                    value={form.make}
                    onChangeText={(text) => setForm((current) => ({ ...current, make: text }))}
                  />
                </View>

                <View>
                  <Text className="text-[14px] font-extrabold tracking-wide" style={{ color: mutedTextColor }}>MODEL *</Text>
                  <TextInput
                    className="mt-2 rounded-2xl border px-4 py-4 text-[16px]"
                    style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                    placeholder="e.g., Camry"
                    placeholderTextColor={placeholderColor}
                    value={form.model}
                    onChangeText={(text) => setForm((current) => ({ ...current, model: text }))}
                  />
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-[14px] font-extrabold tracking-wide" style={{ color: mutedTextColor }}>YEAR</Text>
                    <TextInput
                      className="mt-2 rounded-2xl border px-4 py-4 text-[16px]"
                      style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                      placeholder="2023"
                      placeholderTextColor={placeholderColor}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={form.year}
                      onChangeText={(text) => setForm((current) => ({ ...current, year: text.replace(/\D/g, '').slice(0, 4) }))}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-extrabold tracking-wide" style={{ color: mutedTextColor }}>COLOR</Text>
                    <TextInput
                      className="mt-2 rounded-2xl border px-4 py-4 text-[16px]"
                      style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                      placeholder="Pearl White"
                      placeholderTextColor={placeholderColor}
                      value={form.color}
                      onChangeText={(text) => setForm((current) => ({ ...current, color: text }))}
                    />
                  </View>
                </View>

                <View>
                  <Text className="text-[14px] font-extrabold tracking-wide" style={{ color: mutedTextColor }}>PLATE NUMBER</Text>
                  <TextInput
                    className="mt-2 rounded-2xl border px-4 py-4 text-[16px]"
                    style={{ borderColor: inputBorder, backgroundColor: inputBg, color: primaryTextColor }}
                    placeholder="e.g., ABC 1234"
                    placeholderTextColor={placeholderColor}
                    autoCapitalize="characters"
                    maxLength={8}
                    value={form.plateNumber}
                    onChangeText={(text) =>
                      setForm((current) => ({ ...current, plateNumber: text.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 8) }))
                    }
                  />
                </View>

                {formError ? (
                  <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: errorBg }}>
                    <Text className="text-[15px]" style={{ color: errorText }}>{formError}</Text>
                  </View>
                ) : null}
              </ScrollView>

              <View className="flex-row gap-3 border-t pt-4" style={{ borderColor: modalBorder }}>
                <TouchableOpacity onPress={() => setFormVisible(false)} className={`flex-1 rounded-2xl py-4 ${softButtonBg}`}>
                  <Text className="text-center text-[16px] font-bold" style={{ color: primaryTextColor }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void handleSaveVehicle()} disabled={saving} className="flex-1 rounded-2xl bg-[#2747C7] py-4">
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-center text-[16px] font-bold text-white">{editingId ? 'Save Changes' : 'Add Vehicle'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
