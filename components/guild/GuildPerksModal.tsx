import { riseIn } from '@/components/ui/motion';
import { GUILD_PERKS, type GuildPerkKind } from '@/lib/guilds';
import { Check, Lock, Percent, Sparkles, Users, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

type Props = {
  visible: boolean;
  isDark: boolean;
  level: number;
  onClose: () => void;
};

const KIND_ICON: Record<GuildPerkKind, typeof Users> = { members: Users, missions: Sparkles, discount: Percent };
const KIND_COLOR: Record<GuildPerkKind, string> = { members: '#284BD6', missions: '#7C3AED', discount: '#179B67' };

// Clash-of-Clans style perk ladder: every guild level that unlocks something,
// unlocked ones in color, the rest locked.
export function GuildPerksModal({ visible, isDark, level, onClose }: Props) {
  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';

  const levels = [...new Set(GUILD_PERKS.map((perk) => perk.level))];
  const nextLevel = levels.find((lvl) => lvl > level);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Close guild perks" />
        <Animated.View entering={riseIn(0, 340)} className={`max-h-[85%] w-full max-w-[420px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
          <View className="flex-row items-center justify-between">
            <Text className={`text-xl font-black ${primary}`}>Guild Perks</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
              <X size={22} color={isDark ? '#94A3B8' : '#67748D'} />
            </TouchableOpacity>
          </View>
          <Text className={`mt-1 text-sm ${secondary}`}>Level up the guild to unlock perks for every member. Your guild is Level {level}.</Text>

          <ScrollView className="mt-4 shrink" contentContainerClassName="gap-2 pb-1" showsVerticalScrollIndicator>
            {levels.map((lvl) => {
              const unlocked = lvl <= level;
              const isNext = lvl === nextLevel;
              return (
                <View key={lvl} className={`flex-row gap-3 rounded-2xl p-3 ${mutedFill}`} style={{ borderWidth: 2, borderColor: isNext ? '#284BD6' : 'transparent', opacity: unlocked || isNext ? 1 : 0.55 }}>
                  <View className={`h-11 w-11 items-center justify-center rounded-xl ${unlocked ? 'bg-[#284BD6]' : isDark ? 'bg-[#22324B]' : 'bg-[#E2E6EF]'}`}>
                    <Text className={`text-[10px] font-bold ${unlocked ? 'text-white/80' : secondary}`}>LV</Text>
                    <Text className={`-mt-1 text-base font-black ${unlocked ? 'text-white' : primary}`}>{lvl}</Text>
                  </View>
                  <View className="flex-1 justify-center gap-1">
                    {GUILD_PERKS.filter((perk) => perk.level === lvl).map((perk) => {
                      const Icon = KIND_ICON[perk.kind];
                      return (
                        <View key={perk.kind} className="flex-row items-center gap-1.5">
                          <Icon size={14} color={unlocked ? KIND_COLOR[perk.kind] : isDark ? '#94A3B8' : '#67748D'} />
                          <Text className={`text-sm font-bold ${primary}`}>{perk.label}</Text>
                        </View>
                      );
                    })}
                    {isNext ? <Text className="text-[11px] font-bold text-[#284BD6]">Next unlock</Text> : null}
                  </View>
                  <View className="justify-center">{unlocked ? <Check size={18} color="#179B67" /> : <Lock size={15} color={isDark ? '#94A3B8' : '#67748D'} />}</View>
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
