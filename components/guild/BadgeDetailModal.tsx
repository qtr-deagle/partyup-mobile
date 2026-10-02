import { BadgeMedal } from '@/components/guild/TrophyMedals';
import { riseIn } from '@/components/ui/motion';
import type { Badge } from '@/lib/guilds';
import { Check, Lock, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

const TIER_NAMES = ['Bronze', 'Silver', 'Gold'];

type Props = {
  badge: Badge | null;
  isDark: boolean;
  // Whose badge it is; changes "you have" to their name on someone else's profile.
  ownerName?: string;
  onClose: () => void;
};

// Tapping an achievement: every tier's requirement, which are done, and
// progress toward the next one.
export function BadgeDetailModal({ badge, isDark, ownerName, onClose }: Props) {
  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  const tiered = (badge?.thresholds.length ?? 0) > 1;
  const status = !badge ? '' : !badge.earned ? 'Locked' : tiered ? `${TIER_NAMES[badge.tier - 1]} earned` : 'Earned';

  return (
    <Modal visible={!!badge} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Close badge details" />
        {badge ? (
          <Animated.View key={badge.id} entering={riseIn(0, 340)} className={`max-h-[85%] w-full max-w-[420px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
            <View className="flex-row items-start gap-3">
              <BadgeMedal icon={badge.icon} tier={badge.tier} maxTier={badge.thresholds.length} size={60} />
              <View className="flex-1">
                <Text className={`text-xl font-black ${primary}`}>{badge.name}</Text>
                <Text className={`mt-0.5 text-sm font-bold ${badge.earned ? 'text-[#179B67]' : secondary}`}>{status}</Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
                <X size={22} color={isDark ? '#94A3B8' : '#67748D'} />
              </TouchableOpacity>
            </View>

            <ScrollView className="mt-4 shrink" contentContainerClassName="gap-2" showsVerticalScrollIndicator={false}>
              <Text className={`text-xs font-bold uppercase tracking-wide ${secondary}`}>Requirements</Text>
              {badge.requirements.map((requirement, index) => {
                const target = badge.thresholds[index];
                const done = badge.count >= target;
                const isNext = index === badge.tier;
                const progress = Math.min(1, badge.count / target);
                return (
                  <View key={requirement} className={`rounded-2xl p-3 ${mutedFill}`} style={{ borderWidth: 2, borderColor: isNext ? '#284BD6' : 'transparent' }}>
                    <View className="flex-row items-center gap-2.5">
                      <View className={`h-7 w-7 items-center justify-center rounded-full ${done ? 'bg-[#179B67]' : isDark ? 'bg-[#22324B]' : 'bg-[#E2E6EF]'}`}>
                        {done ? <Check size={15} color="#FFFFFF" /> : <Lock size={13} color={isDark ? '#94A3B8' : '#67748D'} />}
                      </View>
                      <View className="flex-1">
                        {tiered ? <Text className={`text-[11px] font-bold uppercase ${secondary}`}>{TIER_NAMES[index]}</Text> : null}
                        <Text className={`text-sm font-bold ${primary}`}>{requirement}</Text>
                      </View>
                      {target > 1 ? <Text className={`text-xs font-bold ${done ? 'text-[#179B67]' : secondary}`}>{Math.min(badge.count, target)}/{target}</Text> : null}
                    </View>
                    {!done && target > 1 ? (
                      <View className={`mt-2 h-1.5 overflow-hidden rounded-full ${isDark ? 'bg-[#22324B]' : 'bg-[#E2E6EF]'}`}>
                        <View className="h-full rounded-full bg-[#284BD6]" style={{ width: `${progress * 100}%` }} />
                      </View>
                    ) : null}
                  </View>
                );
              })}

              <Text className={`mt-2 text-xs font-bold uppercase tracking-wide ${secondary}`}>How to get it</Text>
              <Text className={`text-sm leading-5 ${primary}`}>{badge.how}</Text>
              {tiered ? <Text className={`text-xs ${secondary}`}>{ownerName ? `${ownerName} has` : 'You have'} {badge.count} so far.</Text> : null}
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
