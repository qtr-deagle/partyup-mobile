import { AlertTriangle, ShieldCheck, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { riseIn } from '@/components/ui/motion';
import { normalizePlate, type Vehicle } from '@/lib/vehicles';

// Removing a verified (or under-review) car throws away a staff review, so
// the driver types the plate to confirm. Unverified cars use a plain confirm.
export default function RemoveVehicleModal({
  vehicle,
  isDark,
  onClose,
  onConfirm,
}: {
  vehicle: Vehicle | null;
  isDark: boolean;
  onClose: () => void;
  /** Resolves with an error message, or null once removed. */
  onConfirm: (vehicle: Vehicle) => Promise<string | null>;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  const plate = vehicle?.plate_number ?? '';
  const matches = !!plate && normalizePlate(typed) === normalizePlate(plate);
  const verified = vehicle?.verification_status === 'approved';

  async function handleRemove() {
    if (!vehicle || !matches) return;
    setBusy(true);
    setError(null);
    const message = await onConfirm(vehicle);
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <Modal
      visible={vehicle !== null}
      transparent
      animationType="fade"
      onShow={() => {
        setTyped('');
        setError(null);
        setBusy(false);
      }}
      onRequestClose={busy ? undefined : onClose}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <View className="flex-1 items-center justify-center bg-black/45 px-5">
          {vehicle ? (
            <Animated.View key={`remove-${vehicle.id}`} entering={riseIn(0, 340)} className={`w-full max-w-[400px] rounded-[28px] px-5 pb-5 pt-6 shadow-lg shadow-black/25 ${card}`}>
              <View className="items-center">
                <View className={`h-16 w-16 items-center justify-center rounded-full ${isDark ? 'bg-[#3A1B29]' : 'bg-[#FFE1DC]'}`}>
                  <Trash2 size={28} color="#E32727" />
                </View>
                <Text className={`mt-4 text-center text-[21px] font-bold leading-7 ${primary}`}>
                  Remove {vehicle.make} {vehicle.model}?
                </Text>
                <Text className={`mt-2 text-center text-[15px] leading-6 ${secondary}`}>
                  It can no longer be used for carpools. Past trips keep their history.
                </Text>
              </View>

              <View className={`mt-4 flex-row items-start gap-2.5 rounded-2xl px-4 py-3 ${isDark ? 'bg-[#2A2414]' : 'bg-[#FFF8EB]'}`}>
                {verified ? <ShieldCheck size={18} color="#B45309" style={{ marginTop: 1 }} /> : <AlertTriangle size={18} color="#B45309" style={{ marginTop: 1 }} />}
                <Text className={`flex-1 text-[13.5px] leading-5 ${isDark ? 'text-[#FCD34D]' : 'text-[#92400E]'}`}>
                  {verified
                    ? 'Its verification is lost. Adding it back means new photos and another review before you can carpool.'
                    : 'Its review is cancelled. Adding it back means sending the photos again.'}
                </Text>
              </View>

              <Text className={`mt-4 text-[13px] font-semibold ${secondary}`}>
                Type <Text className={`font-black tracking-[1px] ${primary}`}>{plate}</Text> to confirm
              </Text>
              <TextInput
                className={`mt-2 rounded-2xl border px-4 py-3.5 text-[17px] font-bold tracking-[2px] ${primary} ${isDark ? 'border-[#22324B] bg-[#0B1220]' : 'border-[#E0E5EF] bg-[#F7F8FC]'}`}
                placeholder={plate}
                placeholderTextColor={isDark ? '#334155' : '#C6CEDC'}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
                value={typed}
                onChangeText={(text) => {
                  setTyped(text.toUpperCase());
                  setError(null);
                }}
                editable={!busy}
              />

              {error ? <Text className="mt-3 text-[13.5px] leading-5 text-[#E11D48]">{error}</Text> : null}

              <TouchableOpacity
                onPress={() => void handleRemove()}
                disabled={!matches || busy}
                activeOpacity={0.85}
                className={`mt-5 items-center rounded-2xl py-4 ${matches || busy ? 'bg-[#E32727]' : isDark ? 'bg-[#4A2530]' : 'bg-[#F4B4B4]'}`}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[15px] font-black text-white">Remove vehicle</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} disabled={busy} activeOpacity={0.85} className={`mt-3 items-center rounded-2xl py-4 ${mutedFill}`}>
                <Text className={`text-[15px] font-bold ${primary}`}>Keep it</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
