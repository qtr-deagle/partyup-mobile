import { X } from 'lucide-react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type Props = {
  visible: boolean;
  title: string;
  value: Date | null;
  minDate?: Date | null;
  isDark: boolean;
  onClose: () => void;
  onSelect: (date: Date) => void;
};

export function DatePickerModal({ visible, title, value, minDate, isDark, onClose, onSelect }: Props) {
  const selectedString = value ? toDateString(value) : undefined;
  const minString = minDate ? toDateString(minDate) : undefined;

  const sheetBackground = isDark ? '#0F172A' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const closeButtonBg = isDark ? '#1E293B' : '#F3F4F8';
  const gridBackground = isDark ? '#111B2E' : '#FBFCFE';
  const disabledText = isDark ? '#334155' : '#D3D8E2';

  function handleDayPress(day: DateData) {
    const [year, month, dayOfMonth] = day.dateString.split('-').map(Number);
    const next = value ? new Date(value) : new Date();
    next.setFullYear(year, month - 1, dayOfMonth);
    onSelect(next);
    onClose();
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* Modal renders on its own native surface, outside the app-level GestureHandlerRootView
          in app/_layout.tsx, so gesture-driven children (calendar swipe, etc.) need their own
          root here. */}
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

            <View className="mt-5 overflow-hidden rounded-[26px] p-2" style={{ backgroundColor: gridBackground }}>
              <Calendar
                current={selectedString}
                minDate={minString}
                onDayPress={handleDayPress}
                enableSwipeMonths
                markedDates={selectedString ? { [selectedString]: { selected: true, selectedColor: '#2A55D4' } } : {}}
                theme={{
                  backgroundColor: 'transparent',
                  calendarBackground: 'transparent',
                  textSectionTitleColor: mutedText,
                  selectedDayBackgroundColor: '#2A55D4',
                  selectedDayTextColor: '#FFFFFF',
                  todayTextColor: '#2A55D4',
                  dayTextColor: primaryText,
                  textDisabledColor: disabledText,
                  monthTextColor: primaryText,
                  arrowColor: '#2A55D4',
                  indicatorColor: '#2A55D4',
                  textDayFontWeight: '600',
                  textMonthFontWeight: '900',
                  textDayHeaderFontWeight: '700',
                  textMonthFontSize: 17,
                  textDayFontSize: 15,
                  textDayHeaderFontSize: 12,
                  arrowStyle: { marginHorizontal: 4 },
                }}
                style={{ paddingBottom: 6 }}
              />
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
