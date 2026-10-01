import type { BadgeIcon } from '@/lib/guilds';
import { BadgeCheck, Car, ClipboardCheck, Crown, Lock, Route, Shield, UserPlus, Users, type LucideIcon } from 'lucide-react-native';
import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';

type Metal = { light: string; base: string; dark: string };

// Bronze, silver, gold for tiered badges and season places.
export const PLACE_METALS: Metal[] = [
  { light: '#FEF3C7', base: '#EAB308', dark: '#92400E' },
  { light: '#FFFFFF', base: '#B4BFCC', dark: '#5B6778' },
  { light: '#FCD3B0', base: '#C2703A', dark: '#7C3A12' },
];
const TIER_METALS: Metal[] = [PLACE_METALS[2], PLACE_METALS[1], PLACE_METALS[0]];
// Single-goal badges: one emerald finish.
const SINGLE_METAL: Metal = { light: '#D1FAE5', base: '#10B981', dark: '#065F46' };
const LOCKED_METAL: Metal = { light: '#E5E7EB', base: '#9CA3AF', dark: '#4B5563' };

const BADGE_ICONS: Record<BadgeIcon, LucideIcon> = {
  verified: BadgeCheck,
  guild: Shield,
  car: Car,
  road: Route,
  host: Users,
  crown: Crown,
  gate: ClipboardCheck,
  recruit: UserPlus,
};

function hexagon(cx: number, cy: number, r: number) {
  return [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
    })
    .join(' ');
}

type BadgeMedalProps = {
  icon: BadgeIcon;
  // 0 = locked.
  tier: number;
  // How many tiers this badge has (1 for single-goal badges).
  maxTier: number;
  size?: number;
};

// Hexagonal badge medal. Tiered badges climb bronze → silver → gold with
// pips underneath; single-goal badges are emerald once earned.
export function BadgeMedal({ icon, tier, maxTier, size = 44 }: BadgeMedalProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const locked = tier <= 0;
  const metal = locked ? LOCKED_METAL : maxTier === 1 ? SINGLE_METAL : TIER_METALS[Math.min(tier, 3) - 1];
  const Icon = locked ? Lock : BADGE_ICONS[icon];
  const rim = `bm-rim${raw}`;
  const face = `bm-face${raw}`;
  const height = maxTier > 1 ? size * 1.18 : size;

  return (
    <View style={{ width: size, height, alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={metal.light} />
              <Stop offset="0.5" stopColor={metal.base} />
              <Stop offset="1" stopColor={metal.dark} />
            </LinearGradient>
            <RadialGradient id={face} cx="38%" cy="30%" r="80%">
              <Stop offset="0" stopColor={metal.light} />
              <Stop offset="0.6" stopColor={metal.base} />
              <Stop offset="1" stopColor={metal.dark} />
            </RadialGradient>
          </Defs>
          <Polygon points={hexagon(50, 50, 48)} fill={`url(#${rim})`} stroke={metal.dark} strokeWidth={1.5} strokeLinejoin="round" />
          <Polygon points={hexagon(50, 50, 38)} fill={`url(#${face})`} stroke={metal.dark} strokeWidth={1.5} strokeLinejoin="round" />
          <Path d="M24 34 L50 19 L76 34" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={size * 0.36} color="#FFFFFF" strokeWidth={2.4} />
        </View>
      </View>
      {maxTier > 1 ? (
        <View style={{ flexDirection: 'row', gap: size * 0.06, marginTop: size * 0.05 }}>
          {Array.from({ length: maxTier }).map((_, index) => (
            <View
              key={index}
              style={{
                width: size * 0.11,
                height: size * 0.11,
                borderRadius: size,
                backgroundColor: index < tier ? metal.base : LOCKED_METAL.light,
                borderWidth: 1,
                borderColor: index < tier ? metal.dark : LOCKED_METAL.base,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

type SeasonMedalProps = {
  place: 1 | 2 | 3;
  board: 'player' | 'guild';
  size?: number;
};

function rosettePoints(cx: number, cy: number, outer: number, inner: number, points: number) {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    coords.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return coords.join(' ');
}

// Season medal: a ribbon rosette (blue for players, purple for guilds) around
// a gold / silver / bronze coin stamped with the place.
export function SeasonMedal({ place, board, size = 52 }: SeasonMedalProps) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const metal = PLACE_METALS[place - 1];
  const ribbon = board === 'player' ? { base: '#2563EB', dark: '#1E3A8A' } : { base: '#7C3AED', dark: '#4C1D95' };
  const coin = `sm-coin${raw}`;

  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 100 125">
      <Defs>
        <RadialGradient id={coin} cx="38%" cy="30%" r="80%">
          <Stop offset="0" stopColor={metal.light} />
          <Stop offset="0.55" stopColor={metal.base} />
          <Stop offset="1" stopColor={metal.dark} />
        </RadialGradient>
      </Defs>
      {/* Tails */}
      <Polygon points="30,70 46,76 36,122 28,112 18,118" fill={ribbon.dark} />
      <Polygon points="70,70 54,76 64,122 72,112 82,118" fill={ribbon.dark} />
      {/* Pleated rosette */}
      <Polygon points={rosettePoints(50, 50, 48, 41, 24)} fill={ribbon.base} stroke={ribbon.dark} strokeWidth={1} strokeLinejoin="round" />
      <Circle cx={50} cy={50} r={38} fill="none" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="3 3" />
      {/* Coin */}
      <Circle cx={50} cy={50} r={31} fill={`url(#${coin})`} stroke={metal.dark} strokeWidth={1.5} />
      <Circle cx={50} cy={50} r={26} fill="none" stroke={metal.light} strokeOpacity={0.7} strokeWidth={1} />
      <SvgText x={50} y={63} fontSize={38} fontWeight="900" fill={metal.dark} fillOpacity={0.45} textAnchor="middle">
        {place}
      </SvgText>
      <SvgText x={50} y={61} fontSize={38} fontWeight="900" fill="#FFFFFF" textAnchor="middle">
        {place}
      </SvgText>
    </Svg>
  );
}
