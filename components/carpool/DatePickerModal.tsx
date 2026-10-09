import { ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Calendar, type DateData } from 'react-native-calendars';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// How far ahead the year picker reaches (registrations run several years).
const YEARS_AHEAD = 10;
const YEAR_CHIP_WIDTH = 78;

function monthStart(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
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
  const insets = useSafeAreaInsets();
  const selectedString = value ? toDateString(value) : undefined;
  const minString = minDate ? toDateString(minDate) : undefined;

  const sheetBackground = isDark ? '#0F172A' : '#FFFFFF';
  const primaryText = isDark ? '#FFFFFF' : '#1B2340';
  const mutedText = isDark ? '#94A3B8' : '#6C7A95';
  const closeButtonBg = isDark ? '#1E293B' : '#F3F4F8';
  const gridBackground = isDark ? '#111B2E' : '#FBFCFE';
  const disabledText = isDark ? '#334155' : '#D3D8E2';
  const chipFill = isDark ? '#1E293B' : '#EEF2FF';

  // The month on screen. Tapping the title swaps the day grid for a
  // month/year picker, so far-off dates don't take dozens of arrow taps.
  const initial = value ?? minDate ?? new Date();
  const [shown, setShown] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const [mode, setMode] = useState<'days' | 'months'>('days');
  // Remounts the calendar on a jump; swipes keep the same instance.
  const [jumpKey, setJumpKey] = useState(0);
  const yearScroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    const start = value ?? minDate ?? new Date();
    setShown({ year: start.getFullYear(), month: start.getMonth() });
    setMode('days');
    setJumpKey((key) => key + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const thisYear = new Date().getFullYear();
  const minYear = minDate ? minDate.getFullYear() : thisYear - 1;
  const minMonth = minDate ? minDate.getMonth() : 0;
  const years = Array.from({ length: thisYear + YEARS_AHEAD - minYear + 1 }, (_, i) => minYear + i);
  const atFirstMonth = !!minDate && shown.year === minYear && shown.month <= minMonth;

  function jumpTo(year: number, month: number) {
    setShown({ year, month });
    setJumpKey((key) => key + 1);
    setMode('days');
  }

  function stepMonth(delta: number) {
    const next = new Date(shown.year, shown.month + delta, 1);
    if (minDate && (next.getFullYear() < minYear || (next.getFullYear() === minYear && next.getMonth() < minMonth))) return;
    jumpTo(next.getFullYear(), next.getMonth());
  }

  function pickYear(year: number) {
    // Keep the month, unless it would fall before minDate.
    setShown((current) => ({ year, month: minDate && year === minYear && current.month < minMonth ? minMonth : current.month }));
  }

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
          <Pressable style={StyleSheet.absoluteFill} className="bg-black/55" onPress={onClose} />
          <View style={{ backgroundColor: sheetBackground, paddingBottom: insets.bottom + 36 }} className="rounded-t-[32px] px-5 pt-5 shadow-2xl">
            <View className="mb-1 items-center">
              <View className="h-1.5 w-12 rounded-full" style={{ backgroundColor: isDark ? '#334155' : '#E2E7F0' }} />
            </View>

            <View className="mt-4 flex-row items-center justify-between">
              <Text className="text-headline-24 font-bold" style={{ color: primaryText }}>
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
              {/* Own header: arrows step a month, the title opens the month/year picker. */}
              <View className="flex-row items-center justify-between px-1 pb-1 pt-2">
                <TouchableOpacity
                  onPress={() => stepMonth(-1)}
                  disabled={mode === 'months' || atFirstMonth}
                  accessibilityLabel="Previous month"
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ opacity: mode === 'months' || atFirstMonth ? 0.3 : 1 }}>
                  <ChevronLeft size={22} color="#2A55D4" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode((current) => (current === 'days' ? 'months' : 'days'))}
                  accessibilityLabel="Choose month and year"
                  activeOpacity={0.7}>
                  <View className="flex-row items-center gap-1.5 rounded-full px-4 py-2" style={{ backgroundColor: chipFill }}>
                    <Text className="text-[17px] font-black" style={{ color: primaryText }}>
                      {MONTH_NAMES[shown.month]} {shown.year}
                    </Text>
                    <View style={{ transform: [{ rotate: mode === 'months' ? '180deg' : '0deg' }] }}>
                      <ChevronDown size={16} color="#2A55D4" />
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => stepMonth(1)}
                  disabled={mode === 'months'}
                  accessibilityLabel="Next month"
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ opacity: mode === 'months' ? 0.3 : 1 }}>
                  <ChevronRight size={22} color="#2A55D4" />
                </TouchableOpacity>
              </View>

              {mode === 'months' ? (
                <View key="month-picker" className="px-1 pb-3 pt-2">
                  <ScrollView
                    ref={yearScroll}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
                    onContentSizeChange={() => {
                      const index = years.indexOf(shown.year);
                      yearScroll.current?.scrollTo({ x: Math.max(0, index * YEAR_CHIP_WIDTH - YEAR_CHIP_WIDTH * 1.5), animated: false });
                    }}>
                    {years.map((year) => {
                      const active = year === shown.year;
                      return (
                        <TouchableOpacity key={year} onPress={() => pickYear(year)} activeOpacity={0.8}>
                          <View className="items-center rounded-full py-2.5" style={{ width: YEAR_CHIP_WIDTH - 8, backgroundColor: active ? '#2A55D4' : chipFill }}>
                            <Text className="text-[15px] font-black" style={{ color: active ? '#FFFFFF' : primaryText }}>
                              {year}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View className="mt-4 flex-row flex-wrap">
                    {MONTHS.map((label, month) => {
                      const disabled = !!minDate && shown.year === minYear && month < minMonth;
                      const active = month === shown.month;
                      return (
                        <View key={label} className="w-1/3 p-1.5">
                          <TouchableOpacity onPress={() => jumpTo(shown.year, month)} disabled={disabled} activeOpacity={0.8}>
                            <View
                              className="items-center rounded-2xl py-3.5"
                              style={{
                                backgroundColor: active ? '#2A55D4' : isDark ? '#18253C' : '#FFFFFF',
                                borderWidth: 1,
                                borderColor: active ? '#2A55D4' : isDark ? '#22324B' : '#E4EAF2',
                              }}>
                              <Text className="text-[15px] font-bold" style={{ color: disabled ? disabledText : active ? '#FFFFFF' : primaryText }}>
                                {label}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : (
                <Calendar
                  key={`days-${jumpKey}`}
                  current={monthStart(shown.year, shown.month)}
                  minDate={minString}
                  onDayPress={handleDayPress}
                  onMonthChange={(month: DateData) => setShown({ year: month.year, month: month.month - 1 })}
                  enableSwipeMonths
                  hideArrows
                  renderHeader={() => null}
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
                  }}
                  style={{ paddingBottom: 6 }}
                />
              )}
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
