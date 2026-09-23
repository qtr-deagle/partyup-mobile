import { TOUR_INTEREST_TAGS } from '@/lib/tours';
import { Text, TouchableOpacity, View } from 'react-native';

type Props = {
  selected: string[];
  onToggle: (tag: string) => void;
  isDark: boolean;
};

export function InterestTagPicker({ selected, onToggle, isDark }: Props) {
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const inputBg = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const text = isDark ? 'text-[#E2E8F0]' : 'text-[#24314A]';

  return (
    <View className="flex-row flex-wrap gap-2">
      {TOUR_INTEREST_TAGS.map((tag) => {
        const isSelected = selected.includes(tag);
        return (
          <TouchableOpacity
            key={tag}
            onPress={() => onToggle(tag)}
            className={`rounded-full border px-4 py-2 ${isSelected ? 'border-[#2A55D4] bg-[#2A55D4]' : `${border} ${inputBg}`}`}
          >
            <Text className={`text-sm font-bold ${isSelected ? 'text-white' : text}`}>{tag}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
