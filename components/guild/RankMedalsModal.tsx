import { RankMedal } from '@/components/guild/RankMedal';
import { EARNING_GUIDE, RANK_PERKS, RANKS, rankFor, tierStarts } from '@/lib/guilds';
import { Check, ChevronDown, X } from 'lucide-react-native';
import { useState } from 'react';
import { LayoutAnimation, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  isDark: boolean;
  lifetimePoints: number;
  role: string | null | undefined;
  onClose: () => void;
};

// Preview of every rank medal: earned ones in full color, the current one
// highlighted, locked ones in gray. Tap a medal for its tiers, what it
// unlocks, and the fastest way to get there.
export function RankMedalsModal({ visible, isDark, lifetimePoints, role, onClose }: Props) {
  const { index: currentIndex, tier: currentTier } = rankFor(lifetimePoints);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const card = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const mutedFill = isDark ? 'bg-[#18253C]' : 'bg-[#F3F4F8]';
  const insetFill = isDark ? 'bg-[#0F1A2D]' : 'bg-white';

  // Repeatable earning actions for this role, biggest first. One-time awards
  // (ID verified, joining a guild) can't be done "60×", so they're left out.
  // Leaders travel too, so they also get the traveler actions.
  const actions = EARNING_GUIDE.filter((item) => !item.once && (role === 'admin' || role === 'guild_leader' || item.role === role)).sort(
    (a, b) => b.points - a.points
  );

  function toggle(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex((current) => (current === index ? null : index));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Open on the next rank to chase (or the current one at the top).
      onShow={() => setOpenIndex(Math.min(currentIndex + 1, RANKS.length - 1))}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        {/* Backdrop tap closes. It's a sibling behind the card (not a
            wrapper), so it can't steal the list's scroll gestures. */}
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Close rank medals" />
        <View className={`max-h-[85%] w-full max-w-[420px] rounded-[28px] px-5 py-6 shadow-lg shadow-black/25 ${card}`}>
          <View className="flex-row items-center justify-between">
            <Text className={`text-xl font-black ${primary}`}>Rank Medals</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
              <X size={22} color={isDark ? '#94A3B8' : '#67748D'} />
            </TouchableOpacity>
          </View>
          <Text className={`mt-1 text-sm ${secondary}`}>You have {lifetimePoints} lifetime pts. Tap a medal to see what it unlocks.</Text>

          <ScrollView className="mt-4 shrink" contentContainerClassName="gap-2 pb-1" showsVerticalScrollIndicator nestedScrollEnabled>
            {RANKS.map((rank, index) => {
              const earned = index <= currentIndex;
              const isCurrent = index === currentIndex;
              const open = openIndex === index;
              const remaining = Math.max(0, rank.min - lifetimePoints);
              const starts = tierStarts(index);
              return (
                <View
                  key={rank.name}
                  className={`rounded-2xl border-2 p-3 ${mutedFill}`}
                  style={{ borderColor: isCurrent ? rank.color : 'transparent' }}>
                  <Pressable onPress={() => toggle(index)} className="flex-row items-center gap-3" accessibilityLabel={`${rank.name} medal details`}>
                    <RankMedal rank={rank.name} size={52} showLock={!earned} tier={isCurrent ? currentTier : earned ? 3 : undefined} animated={isCurrent} />
                    <View className="flex-1">
                      <Text className={`text-base font-black ${primary}`}>{rank.name}</Text>
                      <Text className={`text-xs ${secondary}`}>{earned ? `${rank.min}+ pts` : `${rank.min} pts · ${remaining} to go`}</Text>
                    </View>
                    {isCurrent ? (
                      <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: rank.color }}>
                        <Text className="text-[11px] font-black text-white">YOU</Text>
                      </View>
                    ) : earned ? (
                      <Check size={18} color={rank.color} />
                    ) : null}
                    <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
                      <ChevronDown size={18} color={isDark ? '#94A3B8' : '#67748D'} />
                    </View>
                  </Pressable>

                  {open ? (
                    <View className={`mt-3 gap-3 rounded-xl p-3 ${insetFill}`}>
                      <View>
                        <Text className={`text-[11px] font-bold uppercase tracking-wide ${secondary}`}>Tiers</Text>
                        <View className="mt-1.5 flex-row gap-2">
                          {starts.map((start, tierIndex) => {
                            const reached = lifetimePoints >= start;
                            return (
                              <View
                                key={start}
                                className={`flex-1 items-center rounded-lg py-1.5 ${reached ? '' : mutedFill}`}
                                style={reached ? { backgroundColor: rank.color } : undefined}>
                                <Text className={`text-xs font-black ${reached ? 'text-white' : primary}`}>{['I', 'II', 'III'][tierIndex]}</Text>
                                <Text className={`text-[10px] ${reached ? 'text-white/80' : secondary}`}>{start} pts</Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>

                      <View>
                        <Text className={`text-[11px] font-bold uppercase tracking-wide ${secondary}`}>Unlocks</Text>
                        {(RANK_PERKS[rank.name] ?? []).map((perk) => (
                          <Text key={perk} className={`mt-1 text-sm ${primary}`}>
                            • {perk}
                          </Text>
                        ))}
                      </View>

                      {!earned && actions.length > 0 ? (
                        <View>
                          <Text className={`text-[11px] font-bold uppercase tracking-wide ${secondary}`}>Fastest way there</Text>
                          {actions.slice(0, 3).map((action) => (
                            <Text key={action.label} className={`mt-1 text-sm ${primary}`}>
                              • {action.label}: about {Math.ceil(remaining / action.points)}× <Text className={secondary}>(+{action.points} each)</Text>
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
