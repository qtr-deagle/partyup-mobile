import { medalColors, RankMedal } from '@/components/guild/RankMedal';
import { Confetti, Rays } from '@/components/guild/RankUpCelebration';
import { riseIn } from '@/components/ui/motion';
import { feedback } from '@/lib/sounds';
import { Sparkles } from 'lucide-react-native';
import { useEffect } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

const GOLD = '#EAB308';

// Full-screen moment for reaching a 100 trust score: the Trusted Traveler
// medal rises in over spinning rays while gold confetti falls.
export default function TrustAwardCelebration({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  useEffect(() => {
    if (visible) feedback.success();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-[#050A19]/90 px-6">
        {visible ? <Confetti key="trust-confetti" colors={medalColors('Gold')} /> : null}

        <View className="h-64 w-64 items-center justify-center">
          <Rays key="trust-rays" color={GOLD} />
          <Animated.View key="trust-medal" entering={riseIn(100, 600)}>
            <RankMedal rank="Gold" size={150} animated />
          </Animated.View>
        </View>

        <Animated.View key="trust-copy" entering={riseIn(450)} className="items-center">
          <View className="flex-row items-center gap-1.5">
            <Sparkles size={16} color="#FDE68A" />
            <Text className="text-sm font-black uppercase tracking-[4px] text-[#FDE68A]">Award unlocked</Text>
            <Sparkles size={16} color="#FDE68A" />
          </View>
          <Text className="mt-2 text-center text-[32px] font-black text-white">Trusted Traveler</Text>
          <Text className="mt-1 text-center text-sm text-white/70">You reached a 100 trust score. Travelers can count on you.</Text>
        </Animated.View>

        <Animated.View key="trust-actions" entering={FadeIn.delay(900)} className="mt-6 w-full max-w-[360px]">
          <Pressable onPress={onClose} className="items-center rounded-2xl py-3.5" style={{ backgroundColor: GOLD }}>
            <Text className="font-black text-white">Nice!</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
