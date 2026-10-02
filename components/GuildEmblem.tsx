import type { GuildEmblem as Emblem } from '@/lib/guilds';
import { Anchor, Bike, Camera, Car, Compass, Crown, Flame, Heart, Leaf, Mountain, Plane, Shield, Star, Sun, Tent, TreePalm, Trees, Utensils, Waves, Zap } from 'lucide-react-native';
import { View } from 'react-native';

const ICONS = {
  shield: Shield,
  flame: Flame,
  mountain: Mountain,
  compass: Compass,
  star: Star,
  wave: Waves,
  leaf: Leaf,
  crown: Crown,
  car: Car,
  bike: Bike,
  tent: Tent,
  trees: Trees,
  sun: Sun,
  palm: TreePalm,
  anchor: Anchor,
  plane: Plane,
  camera: Camera,
  utensils: Utensils,
  heart: Heart,
  bolt: Zap,
} as const;

// Round guild crest: the guild's color as the background, its emblem in white.
export function GuildEmblem({ emblem, color, size = 44 }: { emblem: Emblem; color: string; size?: number }) {
  const Icon = ICONS[emblem] ?? Shield;
  return (
    <View className="items-center justify-center rounded-full" style={{ width: size, height: size, backgroundColor: color }}>
      <Icon size={Math.round(size * 0.5)} color="#FFFFFF" />
    </View>
  );
}
