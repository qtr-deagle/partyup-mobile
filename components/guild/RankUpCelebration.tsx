import { MedalShareCard, shareMedalCard } from '@/components/guild/MedalShareCard';
import { medalColors, RankMedal } from '@/components/guild/RankMedal';
import { RANK_PERKS, rankFor } from '@/lib/guilds';
import { feedback } from '@/lib/sounds';
import { Share2, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

export type Celebration = {
  points: number;
  // True when the rank itself changed (Silver → Gold), false for a tier step.
  major: boolean;
};

type Props = {
  celebration: Celebration | null;
  role: string | null | undefined;
  displayName: string;
  guildName?: string | null;
  onClose: () => void;
};

const CONFETTI_COUNT = 30;

// Full-screen rank-up moment: rays spin behind the new medal, which drops in
// with a spin, while confetti in the rank's colors falls and the phone buzzes.
export function RankUpCelebration({ celebration, role, displayName, guildName, onClose }: Props) {
  const cardRef = useRef<View>(null);
  const visible = celebration !== null;
  const points = celebration?.points ?? 0;
  const { rank, tier, tierLabel } = rankFor(points);

  useEffect(() => {
    if (visible) feedback.success();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-[#050A19]/90 px-6">
        {visible ? <Confetti key={`confetti-${points}`} colors={medalColors(rank.name)} /> : null}

        <View className="h-64 w-64 items-center justify-center">
          <Rays key="rays" color={rank.color} />
          <SpinningMedal key={`medal-${points}`} rank={rank.name} tier={tier} />
        </View>

        <Animated.View key="copy" entering={FadeInDown.delay(500).duration(450)} className="items-center">
          <View className="flex-row items-center gap-1.5">
            <Sparkles size={16} color="#FDE68A" />
            <Text className="text-sm font-black uppercase tracking-[4px] text-[#FDE68A]">{celebration?.major ? 'Rank up!' : 'Tier up!'}</Text>
            <Sparkles size={16} color="#FDE68A" />
          </View>
          <Text className="mt-2 text-center text-[32px] font-black text-white">
            {rank.name} {tierLabel}
          </Text>
          <Text className="mt-1 text-center text-sm text-white/70">{points} lifetime pts</Text>

          {celebration?.major ? (
            <View className="mt-4 w-full gap-1.5 rounded-2xl bg-white/10 px-4 py-3">
              <Text className="text-xs font-bold uppercase tracking-wide text-white/60">Unlocked</Text>
              {(RANK_PERKS[rank.name] ?? []).map((perk) => (
                <Text key={perk} className="text-sm font-semibold text-white">
                  • {perk}
                </Text>
              ))}
            </View>
          ) : null}
        </Animated.View>

        <Animated.View key="actions" entering={FadeIn.delay(900)} className="mt-6 w-full max-w-[360px] flex-row gap-3">
          <Pressable
            onPress={() => void shareMedalCard(cardRef, points, role)}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-white/30 py-3.5">
            <Share2 size={16} color="#FFFFFF" />
            <Text className="font-bold text-white">Share</Text>
          </Pressable>
          <Pressable onPress={onClose} className="flex-1 items-center rounded-2xl py-3.5" style={{ backgroundColor: rank.color }}>
            <Text className="font-black text-white">Awesome!</Text>
          </Pressable>
        </Animated.View>

        {/* Off-screen copy of the share card, so Share can capture it. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: -2000, top: 0 }}>
          <MedalShareCard ref={cardRef} points={points} role={role} displayName={displayName} guildName={guildName} />
        </View>
      </View>
    </Modal>
  );
}

function SpinningMedal({ rank, tier }: { rank: string; tier: number }) {
  const spin = useSharedValue(0);
  const scale = useSharedValue(0.2);

  useEffect(() => {
    scale.set(withDelay(100, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })));
    spin.set(withDelay(100, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) })));
  }, [scale, spin]);

  const style = useAnimatedStyle(() => ({
    transform: [{ perspective: 800 }, { rotateY: `${spin.get() * 720}deg` }, { scale: scale.get() }],
  }));

  return (
    <Animated.View style={style}>
      <RankMedal rank={rank} tier={tier} size={150} animated />
    </Animated.View>
  );
}

function Rays({ color }: { color: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.set(withRepeat(withTiming(360, { duration: 14000, easing: Easing.linear }), -1));
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
  const rays = Array.from({ length: 12 }).map((_, i) => {
    const a1 = (i * 30 - 5) * (Math.PI / 180);
    const a2 = (i * 30 + 5) * (Math.PI / 180);
    return `50,50 ${50 + 60 * Math.cos(a1)},${50 + 60 * Math.sin(a1)} ${50 + 60 * Math.cos(a2)},${50 + 60 * Math.sin(a2)}`;
  });

  return (
    <Animated.View entering={ZoomIn.duration(600)} style={{ position: 'absolute', width: 300, height: 300 }}>
      <Animated.View style={[{ width: 300, height: 300 }, style]}>
        <Svg width={300} height={300} viewBox="0 0 100 100">
          {rays.map((points) => (
            <Polygon key={points} points={points} fill={color} opacity={0.35} />
          ))}
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

// Deterministic 0..1 scatter per (piece, property), so render stays pure but
// the confetti still looks random.
function scatter(i: number, k: number) {
  const n = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function Confetti({ colors }: { colors: string[] }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }).map((_, i) => ({
        id: i,
        x: scatter(i, 1) * width,
        delay: scatter(i, 2) * 600,
        duration: 2200 + scatter(i, 3) * 1600,
        drift: (scatter(i, 4) - 0.5) * 120,
        spin: (scatter(i, 5) - 0.5) * 900,
        color: colors[i % colors.length],
        w: 6 + scatter(i, 6) * 6,
        h: 10 + scatter(i, 7) * 8,
      })),
    [colors, width]
  );

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      {pieces.map((piece) => (
        <ConfettiPiece key={piece.id} {...piece} fall={height + 40} />
      ))}
    </View>
  );
}

function ConfettiPiece({ x, delay, duration, drift, spin, color, w, h, fall }: { id: number; x: number; delay: number; duration: number; drift: number; spin: number; color: string; w: number; h: number; fall: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withDelay(delay, withSequence(withTiming(1, { duration, easing: Easing.in(Easing.quad) }))));
    return () => cancelAnimation(progress);
  }, [delay, duration, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: p === 0 ? 0 : 1 - Math.max(0, p - 0.85) / 0.15,
      transform: [{ translateX: x + Math.sin(p * Math.PI * 2) * drift }, { translateY: -40 + p * fall }, { rotate: `${p * spin}deg` }],
    };
  });

  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: 2, backgroundColor: color }, style]} />;
}
