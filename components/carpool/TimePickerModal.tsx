import WheelPicker from '@quidone/react-native-wheel-picker';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEM_COUNT = 5;

type Period = 'AM' | 'PM';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

const HOUR_ITEMS = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: String(index + 1) }));
const MINUTE_ITEMS = Array.from({ length: 60 }, (_, index) => ({ value: index, label: pad(index) }));
const PERIOD_ITEMS: { value: Period; label: string }[] = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
];

type Props = {
  visible: boolean;
  title: string;
  value: Date | null;
  isDark: boolean;
  onClose: () => void;
  onSelect: (date: Date) => void;
};

export function TimePickerModal({ visible, title, value, isDark, onClose, onSelect }: Props) {
  const [hourValue, setHourValue] = useState(1);
  const [minuteValue, setMinuteValue] = useState(0);
  const [periodValue, setPeriodValue] = useState<Period>('AM');

  useEffect(() => {
    if (!visible) {
      return;
    }
    const base = value ?? new Date();
    const hour24 = base.getHours();
    setHourValue(((hour24 + 11) % 12) + 1);
    setMinuteValue(base.getMinutes());
    setPeriodValue(hour24 >= 12 ? 'PM' : 'AM');
  }, [visible, value]);

  const sheetBackground = isDark ? '#0F172A' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const closeButtonBg = isDark ? '#1E293B' : '#F3F4F8';
  const overlayColor = { backgroundColor: '#2A55D4', opacity: isDark ? 0.2 : 0.08, borderRadius: 16 };
  const itemTextStyle = { color: primaryText, fontSize: 20, fontWeight: '700' as const };

  function handleDone() {
    const hour24Result = periodValue === 'PM' ? (hourValue % 12) + 12 : hourValue % 12;
    const next = value ? new Date(value) : new Date();
    next.setHours(hour24Result, minuteValue, 0, 0);
    onSelect(next);
    onClose();
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Modal renders on its own native surface, outside the app-level GestureHandlerRootView
          in app/_layout.tsx, so react-native-gesture-handler (which WheelPicker relies on for
          drag detection) needs its own root here or the wheels never receive drag gestures. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFillObject} className="bg-black/55" onPress={onClose} />
          <View style={{ backgroundColor: sheetBackground }} className="rounded-t-[32px] px-5 pb-9 pt-5 shadow-2xl">
            <View className="mb-1 items-center">
              <View className="h-1.5 w-12 rounded-full" style={{ backgroundColor: isDark ? '#334155' : '#E2E7F0' }} />
            </View>

            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-[22px] font-black" style={{ color: primaryText }}>
                {title}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityLabel="Close"
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: closeButtonBg }}
              >
                <X size={18} color={mutedText} />
              </TouchableOpacity>
            </View>

            <View className="mt-5 flex-row items-center justify-center">
              <WheelPicker
                data={HOUR_ITEMS}
                value={hourValue}
                onValueChanged={({ item }) => setHourValue(item.value)}
                itemHeight={ITEM_HEIGHT}
                visibleItemCount={VISIBLE_ITEM_COUNT}
                width={64}
                itemTextStyle={itemTextStyle}
                overlayItemStyle={overlayColor}
              />
              <Text style={{ fontSize: 22, fontWeight: '900', color: primaryText, marginHorizontal: 2 }}>:</Text>
              <WheelPicker
                data={MINUTE_ITEMS}
                value={minuteValue}
                onValueChanged={({ item }) => setMinuteValue(item.value)}
                itemHeight={ITEM_HEIGHT}
                visibleItemCount={VISIBLE_ITEM_COUNT}
                width={64}
                itemTextStyle={itemTextStyle}
                overlayItemStyle={overlayColor}
              />
              <View style={{ width: 20 }} />
              <WheelPicker
                data={PERIOD_ITEMS}
                value={periodValue}
                onValueChanged={({ item }) => setPeriodValue(item.value)}
                itemHeight={ITEM_HEIGHT}
                visibleItemCount={VISIBLE_ITEM_COUNT}
                width={64}
                itemTextStyle={itemTextStyle}
                overlayItemStyle={overlayColor}
              />
            </View>

            <TouchableOpacity onPress={handleDone} className="mt-6 rounded-2xl bg-[#2A55D4] py-4">
              <Text className="text-center text-base font-bold text-white">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
