import { TOUR_ACTIVITIES } from '@/lib/tours';
import { Plus, Trash2 } from 'lucide-react-native';
import { Text, TouchableOpacity, View } from 'react-native';

export type ItineraryDayInput = {
  dayNumber: number;
  activities: string[];
};

// Saved as the day's description, e.g. "Travel · Hiking · Food stop".
export function describeItineraryDay(day: ItineraryDayInput) {
  return day.activities.join(' · ');
}

type Props = {
  days: ItineraryDayInput[];
  onChange: (days: ItineraryDayInput[]) => void;
  isDark: boolean;
};

export function ItineraryDayBuilder({ days, onChange, isDark }: Props) {
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const inputBg = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const chipText = isDark ? 'text-[#E2E8F0]' : 'text-[#24314A]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';

  function addDay() {
    onChange([...days, { dayNumber: days.length + 1, activities: [] }]);
  }

  function toggleActivity(index: number, activity: string) {
    onChange(
      days.map((day, i) =>
        i === index
          ? {
              ...day,
              activities: day.activities.includes(activity)
                ? day.activities.filter((a) => a !== activity)
                : // Keep the TOUR_ACTIVITIES order so days read consistently.
                  TOUR_ACTIVITIES.filter((a) => a === activity || day.activities.includes(a)),
            }
          : day
      )
    );
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
          <View className="mb-2.5 flex-row items-center justify-between">
            <Text className={`text-[13px] font-bold ${secondary}`}>DAY {day.dayNumber}</Text>
            <TouchableOpacity onPress={() => removeDay(index)} accessibilityLabel={`Remove day ${day.dayNumber}`}>
              <Trash2 size={16} color="#B91C1C" />
            </TouchableOpacity>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {TOUR_ACTIVITIES.map((activity) => {
              const selected = day.activities.includes(activity);
              return (
                <TouchableOpacity
                  key={activity}
                  onPress={() => toggleActivity(index, activity)}
                  className={`rounded-full border px-3 py-1.5 ${selected ? 'border-[#2A55D4] bg-[#2A55D4]' : border}`}>
                  <Text className={`text-[13px] font-semibold ${selected ? 'text-white' : chipText}`}>{activity}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
