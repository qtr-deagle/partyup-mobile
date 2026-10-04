import { carpoolFee, formatCurrency, getCarpoolRequestOptions, requestCarpoolSeat, type CarpoolPickupOption } from '@/lib/carpool';
import { feedback } from '@/lib/sounds';
import { MapPin, Minus, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  tripId: string | null;
  tripTitle: string;
  onRequested: (tripId: string) => void;
};

const STEP = 5;

// Ride-hailing style seat request: the rider picks where on the driver's
// route to be picked up and offers a small fuel contribution within the
// suggested range. The driver then accepts or declines.
export function RequestSeatModal({ visible, onClose, isDark, tripId, tripTitle, onRequested }: Props) {
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<CarpoolPickupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopIndex, setStopIndex] = useState(0);
  const [offerText, setOfferText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sheetBackground = isDark ? '#0F172A' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const closeButtonBg = isDark ? '#1E293B' : '#F3F4F8';
  const border = isDark ? '#22324B' : '#E4EAF2';
  const inputBg = isDark ? '#111B2E' : '#FBFCFE';

  // Fetched each time the sheet opens (onShow), so ranges reflect the
  // driver's latest stops and seat count.
  async function loadOptions() {
    if (!tripId) return;
    setLoading(true);
    setErrorMessage(null);
    const { data, error } = await getCarpoolRequestOptions(tripId);
    setLoading(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setOptions(data);
    setStopIndex(0);
    setOfferText(data[0] ? String(data[0].suggested_amount) : '');
  }

  const selected = options.find((option) => option.stop_index === stopIndex) ?? null;
  const offer = Number.parseFloat(offerText);
  const offerValid = !!selected && Number.isFinite(offer) && offer >= selected.min_amount && offer <= selected.max_amount;
  const fee = offerValid ? carpoolFee(offer) : 0;

  function pickStop(option: CarpoolPickupOption) {
    setStopIndex(option.stop_index);
    setOfferText(String(option.suggested_amount));
    setErrorMessage(null);
  }

  function nudge(delta: number) {
    if (!selected) return;
    const current = Number.isFinite(offer) ? offer : selected.suggested_amount;
    const next = Math.min(selected.max_amount, Math.max(selected.min_amount, Math.round((current + delta) / STEP) * STEP));
    setOfferText(String(next));
  }

  async function handleSubmit() {
    if (!tripId || !selected) return;
    if (!offerValid) {
      setErrorMessage(`Offer between ${formatCurrency(selected.min_amount)} and ${formatCurrency(selected.max_amount)}.`);
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    const { error } = await requestCarpoolSeat(tripId, selected.stop_index, offer);
    setSubmitting(false);
    if (error) {
      feedback.error();
      setErrorMessage(error.message);
      return;
    }
    feedback.success();
    onRequested(tripId);
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => void loadOptions()}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} className="bg-black/55" onPress={onClose} />
        <View style={{ backgroundColor: sheetBackground, paddingBottom: insets.bottom + 28, maxHeight: '88%' }} className="rounded-t-[32px] px-5 pt-5 shadow-2xl">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-headline-24 font-bold" style={{ color: primaryText }}>
                Request a seat
              </Text>
              <Text className="mt-0.5 text-sm" style={{ color: mutedText }} numberOfLines={1}>
                {tripTitle}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: closeButtonBg }}>
              <X size={18} color={mutedText} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="py-10">
              <ActivityIndicator color="#2A55D4" />
            </View>
          ) : (
            <ScrollView className="mt-4" keyboardShouldPersistTaps="handled">
              <Text className="text-[13px] font-bold" style={{ color: mutedText }}>
                PICK ME UP AT
              </Text>
              <View className="mt-2 gap-2">
                {options.map((option) => {
                  const active = option.stop_index === stopIndex;
                  return (
                    <TouchableOpacity
                      key={option.stop_index}
                      onPress={() => pickStop(option)}
                      className="flex-row items-center gap-3 rounded-2xl border px-4 py-3"
                      style={{ borderColor: active ? '#2A55D4' : border, backgroundColor: active ? (isDark ? '#172554' : '#E9F0FF') : inputBg }}>
                      <MapPin size={18} color={active ? '#2A55D4' : mutedText} />
                      <View className="flex-1">
                        <Text className="text-base font-semibold" style={{ color: active ? '#2A55D4' : primaryText }}>
                          {option.label}
                        </Text>
                        <Text className="text-xs" style={{ color: mutedText }}>
                          {option.stop_index === 0 ? 'Main pickup point' : `Stop ${option.stop_index} on the route`} · suggested {formatCurrency(option.suggested_amount)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selected ? (
                <>
                  <Text className="mt-5 text-[13px] font-bold" style={{ color: mutedText }}>
                    YOUR FUEL CONTRIBUTION
                  </Text>
                  <View className="mt-2 flex-row items-center gap-3">
                    <TouchableOpacity onPress={() => nudge(-STEP)} accessibilityLabel="Lower offer" className="h-12 w-12 items-center justify-center rounded-2xl border" style={{ borderColor: border }}>
                      <Minus size={18} color="#2A55D4" />
                    </TouchableOpacity>
                    <TextInput
                      className="flex-1 rounded-2xl border px-4 py-3 text-center text-headline-24 font-bold"
                      style={{ borderColor: offerValid ? border : '#E32727', backgroundColor: inputBg, color: primaryText }}
                      keyboardType="number-pad"
                      maxLength={5}
                      value={offerText}
                      onChangeText={(text) => setOfferText(text.replace(/\D/g, ''))}
                    />
                    <TouchableOpacity onPress={() => nudge(STEP)} accessibilityLabel="Raise offer" className="h-12 w-12 items-center justify-center rounded-2xl border" style={{ borderColor: border }}>
                      <Plus size={18} color="#2A55D4" />
                    </TouchableOpacity>
                  </View>
                  <Text className="mt-1.5 text-center text-xs" style={{ color: mutedText }}>
                    A small share of the driver&apos;s fuel, between {formatCurrency(selected.min_amount)} and {formatCurrency(selected.max_amount)}.
                  </Text>

                  <View className="mt-4 gap-1.5 rounded-2xl border px-4 py-3" style={{ borderColor: border }}>
                    <View className="flex-row justify-between">
                      <Text style={{ color: mutedText }}>Fuel contribution (to driver)</Text>
                      <Text style={{ color: primaryText }}>{offerValid ? formatCurrency(offer) : '—'}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text style={{ color: mutedText }}>PartyUp fee ({Math.round(selected.fee_rate * 100)}%)</Text>
                      <Text style={{ color: primaryText }}>{offerValid ? formatCurrency(fee) : '—'}</Text>
                    </View>
                    <View className="mt-1 flex-row justify-between border-t pt-1.5" style={{ borderColor: border }}>
                      <Text className="font-bold" style={{ color: primaryText }}>You pay if accepted</Text>
                      <Text className="font-extrabold text-[#2A55D4]">{offerValid ? formatCurrency(offer + fee) : '—'}</Text>
                    </View>
                  </View>
                </>
              ) : null}

              {errorMessage ? (
                <View className="mt-4 rounded-xl bg-[#FEE2E2] px-4 py-3">
                  <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
                </View>
              ) : null}

              <TouchableOpacity onPress={handleSubmit} disabled={submitting || !selected} className="mt-5 rounded-2xl bg-[#2A55D4] py-4">
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Send request to driver</Text>}
              </TouchableOpacity>
              <Text className="mt-2 text-center text-xs" style={{ color: mutedText }}>
                The driver accepts or declines. You only pay once accepted.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
