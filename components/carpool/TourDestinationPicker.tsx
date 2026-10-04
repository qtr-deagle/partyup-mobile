import { formatTourDestination, TOUR_DESTINATIONS, type TourDestination } from '@/lib/tours';
import { ChevronDown, MapPin, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  value: TourDestination | null;
  onChange: (destination: TourDestination) => void;
  isDark: boolean;
};

// Searchable list of preset tour spots (no free-text destinations).
export function TourDestinationPicker({ value, onChange, isDark }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const inputBg = isDark ? 'bg-[#18253C]' : 'bg-[#F7F8FC]';
  const primary = isDark ? 'text-white' : 'text-[#17233F]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';
  const sheetBackground = isDark ? '#0F172A' : '#FFFFFF';

  const needle = query.trim().toLowerCase();
  const results = needle
    ? TOUR_DESTINATIONS.filter((d) => d.name.toLowerCase().includes(needle) || d.area.toLowerCase().includes(needle))
    : TOUR_DESTINATIONS;

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} className={`flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}>
        <MapPin size={18} color={value ? '#2A55D4' : placeholderColor} />
        <Text className={`flex-1 text-base ${value ? primary : ''}`} style={!value ? { color: placeholderColor } : undefined} numberOfLines={1}>
          {value ? formatTourDestination(value) : 'Choose a destination'}
        </Text>
        <ChevronDown size={18} color={placeholderColor} />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="slide" onRequestClose={close}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} className="bg-black/55" onPress={close} />
          <View style={{ backgroundColor: sheetBackground, paddingBottom: insets.bottom + 16, maxHeight: '80%' }} className="rounded-t-[32px] px-5 pt-5">
            <View className="flex-row items-center justify-between">
              <Text className={`text-headline-24 font-bold ${primary}`}>Destination</Text>
              <TouchableOpacity onPress={close} accessibilityLabel="Close" className="h-9 w-9 items-center justify-center rounded-full">
                <X size={18} color={placeholderColor} />
              </TouchableOpacity>
            </View>
            <View className={`mt-3 flex-row items-center gap-2 rounded-2xl border px-4 ${border} ${inputBg}`}>
              <Search size={16} color={placeholderColor} />
              <TextInput
                className={`flex-1 py-3 text-base ${primary}`}
                placeholder="Search spots or towns"
                placeholderTextColor={placeholderColor}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            </View>
            <FlatList
              className="mt-3"
              data={results}
              keyExtractor={(item) => item.name}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text className={`py-6 text-center ${secondary}`}>No matching destination.</Text>}
              renderItem={({ item }) => {
                const selected = value?.name === item.name;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      onChange(item);
                      close();
                    }}
                    className={`border-b py-3 ${border}`}>
                    <Text className={`text-base font-semibold ${selected ? 'text-[#2A55D4]' : primary}`}>{item.name}</Text>
                    <Text className={`text-sm ${secondary}`}>{item.area}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
