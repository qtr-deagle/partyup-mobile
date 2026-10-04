import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RankMedal } from '@/components/guild/RankMedal';
import { enterFromBelow } from '@/components/ui/motion';
import { getTrustBreakdown, trustItems, type TrustBreakdown, type TrustItem } from '@/lib/homeDashboard';
import { getTheme } from '@/lib/theme';
import { useRouter } from 'expo-router';
import { Check, Circle, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

const GOLD = '#EAB308';

// Explains what makes up the Home tab's trust score and links each missing
// item to the screen where the user can earn it. Fixed card, no scrolling;
// reaching 100 unlocks the Trusted Traveler medal.
export default function TrustScoreModal({ visible, onClose, isDark }: { visible: boolean; onClose: () => void; isDark: boolean }) {
  const router = useRouter();
  const { accentColor, primaryColor, panelBackground, mutedPanel, mutedText, primaryText } = getTheme(isDark);
  const [breakdown, setBreakdown] = useState<TrustBreakdown | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reload on every open so it reflects anything the user just completed.
  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    setErrorMessage(null);
    void (async () => {
      const { data, error } = await getTrustBreakdown();
      if (cancelled) {
        return;
      }
      if (error) {
        setErrorMessage(error.message);
      } else {
        setBreakdown(data);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const items = breakdown ? trustItems(breakdown) : [];
  const score = breakdown?.trust_score ?? 0;
  const remaining = Math.max(0, 100 - score);
  const earnedAward = breakdown !== null && score >= 100;

  function handleAction(item: TrustItem) {
    if (!item.route) {
      return;
    }
    onClose();
    router.push(item.route);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 px-4">
        <View className={`w-full max-w-[440px] overflow-hidden rounded-[28px] p-5 shadow-lg shadow-black/25 ${panelBackground}`}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" className={`absolute right-4 top-4 z-10 h-9 w-9 items-center justify-center rounded-full ${mutedPanel}`}>
            <X size={18} color={isDark ? '#CBD5E1' : '#6B7590'} />
          </TouchableOpacity>

          <View className="flex-row items-center gap-4 pr-10">
            <RankMedal key={earnedAward ? 'medal-earned' : 'medal-locked'} rank="Gold" size={64} locked={!earnedAward} showLock={!earnedAward} animated={earnedAward} />
            <View className="flex-1">
              <Text className={`text-xs font-medium uppercase tracking-wide ${mutedText}`}>{earnedAward ? 'Trusted Traveler' : 'Your trust score'}</Text>
              <Text className={`text-3xl font-bold ${primaryText}`}>
                {breakdown ? score : '–'}
                <Text className={`text-base font-semibold ${mutedText}`}> / 100</Text>
              </Text>
            </View>
          </View>

          <View className={`mt-3 h-2 overflow-hidden rounded-full ${isDark ? 'bg-[#1E2A40]' : 'bg-[#E6EDF5]'}`}>
            <View className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: earnedAward ? GOLD : accentColor }} />
          </View>
          <Text className={`mt-2 text-sm ${mutedText}`}>
            {!breakdown ? 'Loading your progress…' : earnedAward ? 'You earned the Trusted Traveler medal.' : `${remaining} more points to earn the Trusted Traveler medal.`}
          </Text>

          {!breakdown && !errorMessage ? (
            <View key="trust-loading" className="items-center py-8">
              <ActivityIndicator color={primaryColor} />
            </View>
          ) : null}

          {errorMessage && !breakdown ? <Text key="trust-error" className={`mt-4 text-sm ${mutedText}`}>{errorMessage}</Text> : null}

          {breakdown ? (
            <View key="trust-rows" className="mt-4 gap-1.5">
              {items.map((item, index) => (
                <Animated.View key={item.key} entering={enterFromBelow(index)} className={`flex-row items-center gap-3 rounded-2xl px-3 py-2.5 ${mutedPanel}`}>
                  {item.done ? (
                    <View key="done" className="h-[22px] w-[22px] items-center justify-center rounded-full" style={{ backgroundColor: accentColor }}>
                      <Check size={13} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  ) : (
                    <View key="todo" className="h-[22px] w-[22px] items-center justify-center">
                      <Circle size={20} color={isDark ? '#475569' : '#B7C1D3'} />
                    </View>
                  )}
                  <View className="flex-1">
                    <Text numberOfLines={1} className={`text-sm font-semibold ${primaryText}`}>{item.label}</Text>
                    <Text numberOfLines={1} className={`text-xs ${mutedText}`}>{item.detail}</Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs font-semibold" style={{ color: item.done ? accentColor : isDark ? '#CBD5E1' : '#6D7A96' }}>
                      {item.earned}/{item.max}
                    </Text>
                    {item.actionLabel ? (
                      <AnimatedPressable key="action" onPress={() => handleAction(item)} className="rounded-full px-3 py-1.5" style={{ backgroundColor: primaryColor }}>
                        <Text className="text-xs font-semibold text-white">{item.actionLabel}</Text>
                      </AnimatedPressable>
                    ) : null}
                  </View>
                </Animated.View>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
