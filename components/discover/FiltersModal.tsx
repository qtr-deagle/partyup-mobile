import { BULACAN_MUNICIPALITIES, type BulacanMunicipality } from '@/lib/bulacan';
import { type BudgetTier, type Purpose } from '@/lib/discover-mock';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Check, ChevronDown, MapPin, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View, type GestureResponderEvent } from 'react-native';

const BUDGET_OPTIONS: BudgetTier[] = ['Budget', 'Mid-range', 'Luxury'];
const PURPOSE_OPTIONS: Purpose[] = ['Vacation', 'Business', 'Backpacking', 'Study'];

export type FiltersValue = {
  // Bulacan municipalities matched against the traveler's residence; empty = anywhere in Bulacan.
  locations: BulacanMunicipality[];
  dateStart: Date | null;
  dateEnd: Date | null;
  budget: BudgetTier | null;
  // Empty = any purpose; otherwise the trip must match one of the selected purposes.
  purposes: Purpose[];
  minCompatibility: number;
  // Only travelers with an approved vehicle (owned or borrowed) -- i.e. people who can drive.
  hasVehicleOnly: boolean;
};

// Starts at 0 (show everyone) rather than a pre-filled floor: real compatibility scores can
// legitimately land anywhere, so defaulting to a high bar would silently hide candidates before
// the user ever touches the filter. The user raises this deliberately if they want tighter matches.
export const DEFAULT_FILTERS: FiltersValue = {
  locations: [],
  dateStart: null,
  dateEnd: null,
  budget: null,
  purposes: [],
  minCompatibility: 0,
  hasVehicleOnly: false,
};

export function countActiveFilters(value: FiltersValue) {
  let count = 0;
  if (value.locations.length > 0) count += 1;
  if (value.dateStart || value.dateEnd) count += 1;
  if (value.budget) count += 1;
  if (value.purposes.length > 0) count += 1;
  if (value.minCompatibility !== DEFAULT_FILTERS.minCompatibility) count += 1;
  if (value.hasVehicleOnly) count += 1;
  return count;
}

function formatDateInput(date: Date | null) {
  if (!date) return 'mm/dd/yyyy';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

const THUMB_SIZE = 22;
const SLIDER_HEIGHT = 40;

// Built on the plain RN responder system instead of react-native-gesture-handler: RNGH gestures
// never activated inside this Modal + ScrollView + Pressable stack (even with a modal-local
// GestureHandlerRootView), while the responder system is what the working Pressables here use.
function CompatibilitySlider({
  value,
  onChange,
  onDraggingChange,
  isDark,
}: {
  value: number;
  onChange: (next: number) => void;
  onDraggingChange: (dragging: boolean) => void;
  isDark: boolean;
}) {
  const [width, setWidth] = useState(0);
  // Screen x of the slider's left edge, captured at touch start so moves can use pageX
  // (locationX is unreliable mid-drag on Android once the finger leaves the view).
  const originX = useRef(0);
  const travel = Math.max(0, width - THUMB_SIZE);
  const thumbX = (value / 100) * travel;

  function update(pageX: number) {
    if (travel <= 0) return;
    const x = Math.max(0, Math.min(travel, pageX - originX.current - THUMB_SIZE / 2));
    const next = Math.round(((x / travel) * 100) / 5) * 5;
    if (next !== value) onChange(next);
  }

  function end() {
    onDraggingChange(false);
  }

  return (
    <View
      style={{ height: SLIDER_HEIGHT, justifyContent: 'center' }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event: GestureResponderEvent) => {
        originX.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
        onDraggingChange(true);
        update(event.nativeEvent.pageX);
      }}
      onResponderMove={(event: GestureResponderEvent) => update(event.nativeEvent.pageX)}
      onResponderRelease={end}
      onResponderTerminate={end}
    >
      <View pointerEvents="none" className={`h-1.5 w-full justify-center rounded-full ${isDark ? 'bg-[#22324B]' : 'bg-[#E7EAF2]'}`}>
        <View style={{ width: thumbX + THUMB_SIZE / 2, height: 6, borderRadius: 999, backgroundColor: '#284BD6' }} />
        <View style={{ position: 'absolute', left: thumbX, width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2, backgroundColor: '#284BD6', borderWidth: 3, borderColor: 'white' }} />
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
  const [showLocations, setShowLocations] = useState(false);
  const [sliderDragging, setSliderDragging] = useState(false);

  const background = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const inputBorder = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#D8E0EE] bg-white';
  const chipInactive = isDark ? 'border-[#22324B] bg-[#18253C]' : 'border-[#E4EAF2] bg-white';

  const today = startOfToday();

  function handleOpen() {
    setDraft(value);
    setShowLocations(false);
  }

  function handleStartDateChange(_event: DateTimePickerEvent, selected?: Date) {
    setShowStartPicker(false);
    if (!selected || selected < today) return;
    // Picking a start after the current end clears the end rather than leaving an inverted range.
    setDraft((current) => ({ ...current, dateStart: selected, dateEnd: current.dateEnd && current.dateEnd < selected ? null : current.dateEnd }));
  }

  function handleEndDateChange(_event: DateTimePickerEvent, selected?: Date) {
    setShowEndPicker(false);
    if (!selected || selected < today) return;
    setDraft((current) => (current.dateStart && selected < current.dateStart ? current : { ...current, dateEnd: selected }));
  }

  // "Anywhere" clears the list; tapping a municipality adds or removes it.
  function toggleLocation(option: BulacanMunicipality | null) {
    setDraft((current) => ({
      ...current,
      locations: option === null ? [] : current.locations.includes(option) ? current.locations.filter((city) => city !== option) : [...current.locations, option],
    }));
  }

  function togglePurpose(option: Purpose) {
    setDraft((current) => ({
      ...current,
      purposes: current.purposes.includes(option) ? current.purposes.filter((purpose) => purpose !== option) : [...current.purposes, option],
    }));
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onShow={handleOpen} onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-4" onPress={onClose}>
        <Pressable onPress={() => {}} className={`max-h-[85%] w-full max-w-[420px] rounded-[28px] ${background}`}>
          <View className="flex-row items-center justify-between px-5 pb-2 pt-5">
            <Text className={`text-headline-20 font-bold ${textPrimary}`}>Filters</Text>
            <TouchableOpacity onPress={onClose}><X size={22} color={isDark ? '#E2E8F0' : '#182847'} /></TouchableOpacity>
          </View>

          <View className="px-5 pb-2">
            <View className="self-start rounded-full bg-[#E9F0FF] px-3 py-1"><Text className="text-xs font-bold text-[#2A55D4]">{countActiveFilters(draft)} active</Text></View>
          </View>

          <ScrollView className="px-5" scrollEnabled={!sliderDragging} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12, gap: 18 }}>
            <View>
              <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Location</Text>
              <TouchableOpacity onPress={() => setShowLocations((open) => !open)} className={`flex-row items-center gap-2 rounded-2xl border px-4 py-3 ${inputBorder}`}>
                <MapPin size={18} color="#7A859D" />
                <Text numberOfLines={1} className={`flex-1 text-[15px] ${draft.locations.length ? textPrimary : 'text-[#8A93A8]'}`}>{draft.locations.length ? draft.locations.join(', ') : 'Anywhere in Bulacan'}</Text>
                <ChevronDown size={18} color="#7A859D" style={{ transform: [{ rotate: showLocations ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>
              {showLocations ? (
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {[null, ...BULACAN_MUNICIPALITIES].map((option) => {
                    const active = option === null ? draft.locations.length === 0 : draft.locations.includes(option);
                    return (
                      <TouchableOpacity
                        key={option ?? 'any'}
                        onPress={() => toggleLocation(option)}
                        className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${active ? 'border-[#284BD6] bg-[#284BD6]' : chipInactive}`}
                      >
                        {active && option !== null ? <Check size={12} color="#FFFFFF" /> : null}
                        <Text className={`text-[13px] font-semibold ${active ? 'text-white' : textPrimary}`}>{option ?? 'Anywhere'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
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
              {showStartPicker ? <DateTimePicker value={draft.dateStart ?? today} minimumDate={today} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={handleStartDateChange} /> : null}
              {showEndPicker ? <DateTimePicker value={draft.dateEnd ?? draft.dateStart ?? today} minimumDate={draft.dateStart ?? today} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={handleEndDateChange} /> : null}
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
                  const active = draft.purposes.includes(option);
                  return (
                    <TouchableOpacity key={option} onPress={() => togglePurpose(option)} className={`flex-row items-center gap-1.5 rounded-full border px-4 py-2 ${active ? 'border-[#284BD6] bg-[#284BD6]' : chipInactive}`}>
                      {active ? <Check size={14} color="#FFFFFF" /> : null}
                      <Text className={`text-sm font-semibold ${active ? 'text-white' : textPrimary}`}>{option}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View>
              <View className="mb-1 flex-row items-center justify-between">
                <Text className={`text-xs font-bold uppercase tracking-wide ${textSecondary}`}>Compatibility</Text>
                <Text className="text-sm font-bold text-[#284BD6]">{draft.minCompatibility}%+</Text>
              </View>
              <CompatibilitySlider
                value={draft.minCompatibility}
                onChange={(next) => setDraft((current) => ({ ...current, minCompatibility: next }))}
                onDraggingChange={setSliderDragging}
                isDark={isDark}
              />
            </View>

            <TouchableOpacity onPress={() => setDraft((current) => ({ ...current, hasVehicleOnly: !current.hasVehicleOnly }))} className={`flex-row items-center gap-3 rounded-2xl px-4 py-3 ${isDark ? 'bg-[#18253C]' : 'bg-[#F6F7FB]'}`}>
              <View className={`h-5 w-5 items-center justify-center rounded-md border-2 ${draft.hasVehicleOnly ? 'border-[#284BD6] bg-[#284BD6]' : isDark ? 'border-[#3A4A66]' : 'border-[#C6CEDD]'}`}>
                {draft.hasVehicleOnly ? <Check size={13} color="#FFFFFF" /> : null}
              </View>
              <View className="flex-1">
                <Text className={`text-[15px] font-semibold ${textPrimary}`}>Has a vehicle</Text>
                <Text className={`mt-0.5 text-xs ${textSecondary}`}>Only travelers with a verified vehicle who can drive</Text>
              </View>
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
