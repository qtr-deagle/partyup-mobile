import { parseTimestamp } from '@/lib/datetime';
import { Text, View } from 'react-native';

// Calendar-style "OCT / 12" block used at the top-left of trip and tour cards.
export function DateTile({ value, isDark, muted = false }: { value: string | null; isDark: boolean; muted?: boolean }) {
  const date = value ? parseTimestamp(value) : null;
  const valid = date !== null && !Number.isNaN(date.getTime());
  const accent = muted ? (isDark ? '#94A3B8' : '#6A758F') : '#2A55D4';

  return (
    <View className="h-[58px] w-[54px] items-center justify-center rounded-2xl" style={{ backgroundColor: muted ? (isDark ? '#18253C' : '#EEF1F7') : isDark ? '#1A2850' : '#EAF0FF' }}>
      {valid ? (
        <>
          <Text className="text-[11px] font-black uppercase tracking-[1px]" style={{ color: accent }}>
            {date.toLocaleDateString('en-US', { month: 'short' })}
          </Text>
          <Text className="text-[22px] font-black leading-[26px]" style={{ color: isDark ? '#FFFFFF' : '#1D2746' }}>
            {date.getDate()}
          </Text>
        </>
      ) : (
        <Text className="text-[12px] font-black" style={{ color: accent }}>TBD</Text>
      )}
    </View>
  );
}
