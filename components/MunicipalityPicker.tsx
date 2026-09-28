import { useColorScheme } from '@/hooks/use-color-scheme';
import { BULACAN_MUNICIPALITIES, type BulacanMunicipality } from '@/lib/bulacan';
import { Check, Search } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props<T extends string = BulacanMunicipality> = {
  visible: boolean;
  selected: string | null;
  onSelect: (city: NoInfer<T>) => void;
  onClose: () => void;
  // Defaults are the residency picker; the meetup picker overrides them.
  title?: string;
  subtitle?: string;
  options?: readonly T[];
};

export default function MunicipalityPicker<T extends string = BulacanMunicipality>({
  visible,
  selected,
  onSelect,
  onClose,
  title = 'Where in Bulacan do you live?',
  subtitle = 'Must match the address on your ID.',
  options: allOptions = BULACAN_MUNICIPALITIES as unknown as readonly T[],
}: Props<T>) {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === 'dark';
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();
  const options = needle ? allOptions.filter((city) => city.toLowerCase().includes(needle)) : allOptions;

  function close() {
    setQuery('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View className={`flex-1 ${isDark ? 'bg-[#0B1220]' : 'bg-[#F8FAFD]'}`} style={{ paddingTop: 16, paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between px-4 pb-3">
          <View className="flex-1">
            <Text className={`text-xl font-bold ${isDark ? 'text-white' : 'text-[#182A4D]'}`}>{title}</Text>
            <Text className={`mt-1 text-sm ${isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]'}`}>{subtitle}</Text>
          </View>
          <TouchableOpacity onPress={close} className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shadow-black/10">
            <Text className="text-[22px] text-[#6B7590]">×</Text>
          </TouchableOpacity>
        </View>

        <View className={`mx-4 mb-2 h-11 flex-row items-center rounded-xl border px-3 ${isDark ? 'border-[#22324B] bg-[#0F172A]' : 'border-[#E2E5E9] bg-white'}`}>
          <Search size={16} color="#7C8798" />
          <TextInput
            className={`ml-2 flex-1 text-base ${isDark ? 'text-white' : 'text-[#273142]'}`}
            placeholder="Search city or municipality"
            placeholderTextColor="#9AA3B1"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>

        <FlatList
          data={options}
          keyExtractor={(city) => city}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 pb-6"
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                onSelect(item);
                close();
              }}
              className={`flex-row items-center justify-between border-b py-3.5 ${isDark ? 'border-[#1E293B]' : 'border-[#EEF1F5]'}`}
            >
              <Text className={`text-base ${item === selected ? 'font-bold text-[#2747C7]' : isDark ? 'text-white' : 'text-[#17233F]'}`}>{item}</Text>
              {item === selected ? <Check size={18} color="#2747C7" /> : null}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text className="py-6 text-center text-sm text-[#6C7A95]">PartyUp is only available to Bulacan residents for now.</Text>}
        />
      </View>
    </Modal>
  );
}
