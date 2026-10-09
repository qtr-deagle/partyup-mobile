import { Text, View } from 'react-native';

import { parseTimestamp } from '@/lib/datetime';

// Timeline pieces shared by the DM and group chat screens.

const MANILA_TZ = 'Asia/Manila';

/** Calendar day in Manila, e.g. "2026-10-09", to tell when a new day starts. */
export function dayKey(value: string) {
  return parseTimestamp(value).toLocaleDateString('en-CA', { timeZone: MANILA_TZ });
}

/** "Today", "Yesterday", "Monday" (this week) or "Mon, Oct 6" / "Oct 6, 2025". */
export function dayLabel(value: string) {
  const date = parseTimestamp(value);
  const key = dayKey(value);
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: MANILA_TZ });
  const yesterday = new Date(now.getTime() - 86_400_000).toLocaleDateString('en-CA', { timeZone: MANILA_TZ });
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays < 6) return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: MANILA_TZ });
  const sameYear = date.toLocaleDateString('en-US', { year: 'numeric', timeZone: MANILA_TZ }) === now.toLocaleDateString('en-US', { year: 'numeric', timeZone: MANILA_TZ });
  return date.toLocaleDateString('en-US', sameYear ? { weekday: 'short', month: 'short', day: 'numeric', timeZone: MANILA_TZ } : { month: 'short', day: 'numeric', year: 'numeric', timeZone: MANILA_TZ });
}

export function DaySeparator({ value, isDark }: { value: string; isDark: boolean }) {
  return (
    <View className="my-3 flex-row items-center justify-center">
      <View className="rounded-full px-3 py-1" style={{ backgroundColor: isDark ? '#16213A' : '#EEF1F7' }}>
        <Text className="text-[11.5px] font-bold" style={{ color: isDark ? '#94A3B8' : '#67748D' }}>
          {dayLabel(value)}
        </Text>
      </View>
    </View>
  );
}

/** Centered note such as "Maria added Jo" or "Ben left the group". */
export function SystemNote({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <View className="my-2 items-center px-6">
      <Text className="text-center text-[12.5px]" style={{ color: isDark ? '#94A3B8' : '#67748D' }}>
        {text}
      </Text>
    </View>
  );
}
