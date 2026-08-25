import { type MyTrip } from '@/lib/compatibility';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { MapPin, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';

function formatDateInput(value: string | null) {
  if (!value) return 'mm/dd/yyyy';
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

type MyTripModalProps = {
  visible: boolean;
  value: MyTrip;
  isDark: boolean;
  onSave: (value: MyTrip) => void;
  onClose: () => void;
};

export function MyTripModal({ visible, value, isDark, onSave, onClose }: MyTripModalProps) {
  const [draft, setDraft] = useState<MyTrip>(value);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const background = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const inputBorder = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D8E0EE] bg-white';

  function handleStartDateChange(_event: DateTimePickerEvent, selected?: Date) {
    setShowStartPicker(false);
    if (selected) setDraft((current) => ({ ...current, startDate: selected.toISOString() }));
  }

  function handleEndDateChange(_event: DateTimePickerEvent, selected?: Date) {
    setShowEndPicker(false);
    if (selected) setDraft((current) => ({ ...current, endDate: selected.toISOString() }));
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onShow={() => setDraft(value)} onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-4" onPress={onClose}>
        <Pressable onPress={() => {}} className={`w-full max-w-[420px] rounded-[28px] px-5 pb-5 pt-5 ${background}`}>
          <View className="flex-row items-center justify-between pb-4">
            <View>
              <Text className={`text-xl font-black ${textPrimary}`}>Your trip</Text>
              <Text className={`mt-1 text-sm ${textSecondary}`}>Used to score how well travelers match your plans</Text>
            </View>
            <TouchableOpacity onPress={onClose}><X size={22} color={isDark ? '#E2E8F0' : '#182847'} /></TouchableOpacity>
          </View>

          <View className="gap-4">
            <View>
              <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>From</Text>
              <View className={`flex-row items-center gap-2 rounded-2xl border px-4 py-3 ${inputBorder}`}>
                <MapPin size={18} color="#7A859D" />
                <TextInput value={draft.origin} onChangeText={(text) => setDraft((current) => ({ ...current, origin: text }))} placeholder="Makati" placeholderTextColor="#8A93A8" className={`flex-1 text-[15px] ${textPrimary}`} />
              </View>
            </View>

            <View>
              <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>To</Text>
              <View className={`flex-row items-center gap-2 rounded-2xl border px-4 py-3 ${inputBorder}`}>
                <MapPin size={18} color="#7A859D" />
                <TextInput value={draft.destination} onChangeText={(text) => setDraft((current) => ({ ...current, destination: text }))} placeholder="Batangas" placeholderTextColor="#8A93A8" className={`flex-1 text-[15px] ${textPrimary}`} />
              </View>
            </View>

            <View>
              <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Travel Dates</Text>
              <View className="flex-row gap-3">
                <TouchableOpacity onPress={() => setShowStartPicker(true)} className={`flex-1 rounded-2xl border px-4 py-3 ${inputBorder}`}>
                  <Text className={draft.startDate ? textPrimary : 'text-[#8A93A8]'}>{formatDateInput(draft.startDate)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowEndPicker(true)} className={`flex-1 rounded-2xl border px-4 py-3 ${inputBorder}`}>
                  <Text className={draft.endDate ? textPrimary : 'text-[#8A93A8]'}>{formatDateInput(draft.endDate)}</Text>
                </TouchableOpacity>
              </View>
              {showStartPicker ? <DateTimePicker value={draft.startDate ? new Date(draft.startDate) : new Date()} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={handleStartDateChange} /> : null}
              {showEndPicker ? <DateTimePicker value={draft.endDate ? new Date(draft.endDate) : new Date()} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={handleEndDateChange} /> : null}
            </View>
          </View>

          <View className="mt-5 flex-row gap-3">
            <TouchableOpacity onPress={() => onSave({ origin: '', destination: '', startDate: null, endDate: null })} className={`flex-1 items-center justify-center rounded-2xl border py-3 ${isDark ? 'border-[#22324B]' : 'border-[#D8E0EE]'}`}>
              <Text className={`font-bold ${textPrimary}`}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onSave(draft)} className="flex-1 items-center justify-center rounded-2xl bg-[#284BD6] py-3">
              <Text className="font-bold text-white">Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
