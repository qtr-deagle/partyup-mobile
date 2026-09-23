import { Plus, Trash2 } from 'lucide-react-native';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

export type ItineraryDayInput = {
  dayNumber: number;
  description: string;
};

type Props = {
  days: ItineraryDayInput[];
  onChange: (days: ItineraryDayInput[]) => void;
  isDark: boolean;
};

export function ItineraryDayBuilder({ days, onChange, isDark }: Props) {
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const inputBg = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const inputText = isDark ? 'text-white' : 'text-[#17233F]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';

  function addDay() {
    onChange([...days, { dayNumber: days.length + 1, description: '' }]);
  }

  function updateDescription(index: number, description: string) {
    onChange(days.map((day, i) => (i === index ? { ...day, description } : day)));
  }

  function removeDay(index: number) {
    onChange(
      days
        .filter((_, i) => i !== index)
        .map((day, i) => ({ ...day, dayNumber: i + 1 }))
    );
  }

  return (
    <View className="gap-3">
      {days.map((day, index) => (
        <View key={index} className={`rounded-2xl border p-3.5 ${border} ${inputBg}`}>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className={`text-[13px] font-bold ${secondary}`}>DAY {day.dayNumber}</Text>
            <TouchableOpacity onPress={() => removeDay(index)} accessibilityLabel={`Remove day ${day.dayNumber}`}>
              <Trash2 size={16} color="#B91C1C" />
            </TouchableOpacity>
          </View>
          <TextInput
            className={`min-h-[64px] text-base ${inputText}`}
            placeholder="Describe activities for this day..."
            placeholderTextColor={placeholderColor}
            multiline
            value={day.description}
            onChangeText={(value) => updateDescription(index, value)}
          />
        </View>
      ))}

      <TouchableOpacity
        onPress={addDay}
        className={`flex-row items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3.5 ${border}`}
      >
        <Plus size={16} color="#2A55D4" />
        <Text className="text-sm font-bold text-[#2A55D4]">Add Day</Text>
      </TouchableOpacity>
    </View>
  );
}
