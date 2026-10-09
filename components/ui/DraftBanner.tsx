import { NotebookPen } from 'lucide-react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { riseIn } from '@/components/ui/motion';
import { formatTimeAgo } from '@/lib/datetime';

// "Continue your draft?" card shown at the top of a form that has a saved,
// unsent draft (see useDraft in hooks/use-unsaved-changes.ts).
export function DraftBanner({
  savedAt,
  preview,
  isDark,
  onContinue,
  onStartFresh,
}: {
  savedAt: string;
  /** A hint of what's in the draft, e.g. the title. */
  preview?: string | null;
  isDark: boolean;
  onContinue: () => void;
  onStartFresh: () => void;
}) {
  return (
    <Animated.View key="draft-banner" entering={riseIn(0, 380)}>
      <View
        className="gap-3 rounded-[22px] border p-4"
        style={{ borderColor: isDark ? '#2B3F66' : '#C9D6FB', backgroundColor: isDark ? '#14213A' : '#F2F6FF' }}>
        <View className="flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: isDark ? '#1E2F52' : '#FFFFFF' }}>
            <NotebookPen size={18} color="#2A55D4" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-extrabold" style={{ color: isDark ? '#FFFFFF' : '#16203A' }}>
              Continue your draft?
            </Text>
            <Text className="mt-0.5 text-[13px]" style={{ color: isDark ? '#94A3B8' : '#6A758F' }} numberOfLines={1}>
              {preview ? `"${preview}" · ` : ''}saved {formatTimeAgo(savedAt)}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity onPress={onStartFresh} activeOpacity={0.85} className="flex-1">
            <View className="items-center rounded-2xl py-3" style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }}>
              <Text className="text-[14px] font-bold" style={{ color: isDark ? '#E2E8F0' : '#16203A' }}>
                Start fresh
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={onContinue} activeOpacity={0.85} className="flex-1">
            <View className="items-center rounded-2xl bg-[#2A55D4] py-3">
              <Text className="text-[14px] font-extrabold text-white">Continue</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}
