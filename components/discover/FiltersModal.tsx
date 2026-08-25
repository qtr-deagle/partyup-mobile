import { type BudgetTier, type Purpose } from '@/lib/discover-mock';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Check, MapPin, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

const BUDGET_OPTIONS: BudgetTier[] = ['Budget', 'Mid-range', 'Luxury'];
const PURPOSE_OPTIONS: Purpose[] = ['Vacation', 'Business', 'Backpacking', 'Study'];

export type FiltersValue = {
  location: string;
  dateStart: Date | null;
  dateEnd: Date | null;
  budget: BudgetTier | null;
  purpose: Purpose | null;
  minCompatibility: number;
  carpoolOnly: boolean;
};

// Starts at 0 (show everyone) rather than a pre-filled floor: real compatibility scores can
// legitimately land anywhere, so defaulting to a high bar would silently hide candidates before
// the user ever touches the filter. The user raises this deliberately if they want tighter matches.
export const DEFAULT_FILTERS: FiltersValue = {
  location: '',
  dateStart: null,
  dateEnd: null,
  budget: null,
  purpose: null,
  minCompatibility: 0,
  carpoolOnly: false,
};

export function countActiveFilters(value: FiltersValue) {
  let count = 0;
  if (value.location.trim()) count += 1;
  if (value.dateStart || value.dateEnd) count += 1;
  if (value.budget) count += 1;
  if (value.purpose) count += 1;
  if (value.minCompatibility !== DEFAULT_FILTERS.minCompatibility) count += 1;
  if (value.carpoolOnly) count += 1;
  return count;
}

function formatDateInput(date: Date | null) {
  if (!date) return 'mm/dd/yyyy';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

const THUMB_SIZE = 22;

function CompatibilitySlider({ value, onChange, isDark }: { value: number; onChange: (next: number) => void; isDark: boolean }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const position = useSharedValue(0);

  function commit(next: number) {
    if (trackWidth <= 0) return;
    const rounded = Math.max(0, Math.min(100, Math.round((next / trackWidth) * 100 / 5) * 5));
    onChange(rounded);
  }

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      if (trackWidth <= 0) return;
      const start = (value / 100) * trackWidth;
      position.value = Math.max(0, Math.min(trackWidth, start + event.translationX));
    })
    .onEnd(() => {
      runOnJS(commit)(position.value);
    });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: position.value + THUMB_SIZE / 2 }));

  return (
    <View
      className="w-full"
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width - THUMB_SIZE;
        setTrackWidth(width);
        position.value = (value / 100) * width;
      }}
    >
      <View className={`h-1.5 w-full justify-center rounded-full ${isDark ? 'bg-[#22324B]' : 'bg-[#E7EAF2]'}`}>
        <Animated.View style={[fillStyle, { height: 6, borderRadius: 999, backgroundColor: '#284BD6' }]} />
        <GestureDetector gesture={pan}>
          <Animated.View style={[thumbStyle, { position: 'absolute', width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2, backgroundColor: '#284BD6', borderWidth: 3, borderColor: 'white' }]} />
        </GestureDetector>
      </View>
    </View>
  );
}

type FiltersModalProps = {
  visible: boolean;
  value: FiltersValue;
  isDark: boolean;
  onApply: (value: FiltersValue) => void;
  onClose: () => void;
};

export function FiltersModal({ visible, value, isDark, onApply, onClose }: FiltersModalProps) {
  const [draft, setDraft] = useState<FiltersValue>(value);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const background = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const inputBorder = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D8E0EE] bg-white';
  const chipInactive = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E4EAF2] bg-white';

  function handleOpen() {
    setDraft(value);
  }

  function handleStartDateChange(_event: DateTimePickerEvent, selected?: Date) {
    setShowStartPicker(false);
    if (selected) setDraft((current) => ({ ...current, dateStart: selected }));
  }

  function handleEndDateChange(_event: DateTimePickerEvent, selected?: Date) {
    setShowEndPicker(false);
    if (selected) setDraft((current) => ({ ...current, dateEnd: selected }));
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onShow={handleOpen} onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-4" onPress={onClose}>
        <Pressable onPress={() => {}} className={`max-h-[85%] w-full max-w-[420px] rounded-[28px] ${background}`}>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-5">
            <Text className={`text-xl font-black ${textPrimary}`}>Filters</Text>
            <TouchableOpacity onPress={onClose}><X size={22} color={isDark ? '#E2E8F0' : '#182847'} /></TouchableOpacity>
          </View>

          <View className="px-5 pb-2">
            <View className="self-start rounded-full bg-[#E9F0FF] px-3 py-1"><Text className="text-xs font-bold text-[#2A55D4]">{countActiveFilters(draft)} active</Text></View>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 12, gap: 18 }}>
            <View>
              <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Location</Text>
              <View className={`flex-row items-center gap-2 rounded-2xl border px-4 py-3 ${inputBorder}`}>
                <MapPin size={18} color="#7A859D" />
                <TextInput value={draft.location} onChangeText={(text) => setDraft((current) => ({ ...current, location: text }))} placeholder="Paris, Tokyo, NYC..." placeholderTextColor="#8A93A8" className={`flex-1 text-[15px] ${textPrimary}`} />
              </View>
            </View>

            <View>
              <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Travel Dates</Text>
              <View className="flex-row gap-3">
                <TouchableOpacity onPress={() => setShowStartPicker(true)} className={`flex-1 rounded-2xl border px-4 py-3 ${inputBorder}`}>
                  <Text className={draft.dateStart ? textPrimary : 'text-[#8A93A8]'}>{formatDateInput(draft.dateStart)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowEndPicker(true)} className={`flex-1 rounded-2xl border px-4 py-3 ${inputBorder}`}>
                  <Text className={draft.dateEnd ? textPrimary : 'text-[#8A93A8]'}>{formatDateInput(draft.dateEnd)}</Text>
                </TouchableOpacity>
              </View>
              {showStartPicker ? <DateTimePicker value={draft.dateStart ?? new Date()} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={handleStartDateChange} /> : null}
              {showEndPicker ? <DateTimePicker value={draft.dateEnd ?? new Date()} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={handleEndDateChange} /> : null}
            </View>

            <View>
              <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Budget</Text>
              <View className="flex-row flex-wrap gap-2">
                {BUDGET_OPTIONS.map((option) => {
                  const active = draft.budget === option;
                  return (
                    <TouchableOpacity key={option} onPress={() => setDraft((current) => ({ ...current, budget: current.budget === option ? null : option }))} className={`rounded-full border px-4 py-2 ${active ? 'border-[#284BD6] bg-[#284BD6]' : chipInactive}`}>
                      <Text className={`text-sm font-semibold ${active ? 'text-white' : textPrimary}`}>{option}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Purpose</Text>
              <View className="flex-row flex-wrap gap-2">
                {PURPOSE_OPTIONS.map((option) => {
                  const active = draft.purpose === option;
                  return (
                    <TouchableOpacity key={option} onPress={() => setDraft((current) => ({ ...current, purpose: current.purpose === option ? null : option }))} className={`rounded-full border px-4 py-2 ${active ? 'border-[#284BD6] bg-[#284BD6]' : chipInactive}`}>
                      <Text className={`text-sm font-semibold ${active ? 'text-white' : textPrimary}`}>{option}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className={`text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Compatibility</Text>
                <Text className="text-sm font-bold text-[#284BD6]">{draft.minCompatibility}%+</Text>
              </View>
              <CompatibilitySlider value={draft.minCompatibility} onChange={(next) => setDraft((current) => ({ ...current, minCompatibility: next }))} isDark={isDark} />
            </View>

            <TouchableOpacity onPress={() => setDraft((current) => ({ ...current, carpoolOnly: !current.carpoolOnly }))} className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F6F7FB]'}`}>
              <View className={`h-5 w-5 items-center justify-center rounded-md border-2 ${draft.carpoolOnly ? 'border-[#284BD6] bg-[#284BD6]' : isDark ? 'border-[#3A4A66]' : 'border-[#C6CEDD]'}`}>
                {draft.carpoolOnly ? <Check size={13} color="#FFFFFF" /> : null}
              </View>
              <Text className={`text-[15px] font-semibold ${textPrimary}`}>Carpool available</Text>
            </TouchableOpacity>
          </ScrollView>

          <View className="flex-row gap-3 px-5 pb-5 pt-3">
            <TouchableOpacity onPress={() => setDraft(DEFAULT_FILTERS)} className={`flex-1 items-center justify-center rounded-2xl border py-3 ${isDark ? 'border-[#22324B]' : 'border-[#D8E0EE]'}`}>
              <Text className={`font-bold ${textPrimary}`}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onApply(draft)} className="flex-1 items-center justify-center rounded-2xl bg-[#284BD6] py-3">
              <Text className="font-bold text-white">Apply</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
