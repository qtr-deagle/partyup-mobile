import { Lock } from 'lucide-react-native';
import { useEffect, useId, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';

type Symbol = 'chevron' | 'double-chevron' | 'star' | 'laurel-star' | 'gem' | 'crown';

type MedalStyle = {
  // Metal: highlight, body, shadow.
  light: string;
  base: string;
  dark: string;
  // Ribbon tails and their center stripe.
  ribbon: string;
  ribbonDark: string;
  stripe: string;
  symbol: Symbol;
  // Gold and up get a sunburst rim; the top two sparkle.
  burst: boolean;
  sparkle: boolean;
};

const MEDALS: Record<string, MedalStyle> = {
  Rookie: { light: '#E2E8F0', base: '#94A3B8', dark: '#475569', ribbon: '#3B82F6', ribbonDark: '#1E40AF', stripe: '#BFDBFE', symbol: 'chevron', burst: false, sparkle: false },
  Bronze: { light: '#FCD3B0', base: '#C2703A', dark: '#7C3A12', ribbon: '#DC2626', ribbonDark: '#7F1D1D', stripe: '#FECACA', symbol: 'double-chevron', burst: false, sparkle: false },
  Silver: { light: '#FFFFFF', base: '#B4BFCC', dark: '#5B6778', ribbon: '#2563EB', ribbonDark: '#1E3A8A', stripe: '#F8FAFC', symbol: 'star', burst: false, sparkle: false },
  Gold: { light: '#FEF3C7', base: '#EAB308', dark: '#92400E', ribbon: '#059669', ribbonDark: '#064E3B', stripe: '#FDE68A', symbol: 'laurel-star', burst: true, sparkle: false },
  Platinum: { light: '#ECFEFF', base: '#5ED3E6', dark: '#0E7490', ribbon: '#1E293B', ribbonDark: '#020617', stripe: '#67E8F9', symbol: 'gem', burst: true, sparkle: true },
  Legend: { light: '#FAE8FF', base: '#A855F7', dark: '#4C1D95', ribbon: '#F59E0B', ribbonDark: '#92400E', stripe: '#FEF3C7', symbol: 'crown', burst: true, sparkle: true },
};

// A rank's palette, for confetti and accents around its medal.
export function medalColors(rank: string) {
  const style = MEDALS[rank] ?? MEDALS.Rookie;
  return [style.light, style.base, style.dark, style.ribbon, style.stripe];
}

const LOCKED: MedalStyle = {
  light: '#E5E7EB',
  base: '#9CA3AF',
  dark: '#4B5563',
  ribbon: '#9CA3AF',
  ribbonDark: '#4B5563',
  stripe: '#E5E7EB',
  symbol: 'chevron',
  burst: false,
  sparkle: false,
};

// Medal sits at (CX, CY) in a 100 x 120 viewBox, ribbon tails above it.
const CX = 50;
const CY = 74;

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number) {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    coords.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return coords.join(' ');
}

// Leaves along an arc for the Gold laurel wreath; side = -1 left, 1 right.
function laurel(side: -1 | 1, fill: string) {
  // Angles on the left half (SVG y-down: 90 = bottom, 180 = left); the right
  // side mirrors them across the vertical axis.
  return [112, 134, 156, 178, 200].map((left) => {
    const deg = side === -1 ? left : 180 - left;
    const rad = (deg * Math.PI) / 180;
    const x = CX + 21 * Math.cos(rad);
    const y = CY + 21 * Math.sin(rad);
    // Lie along the arc.
    const tilt = deg + 90;
    return <Ellipse key={`${side}-${left}`} cx={x} cy={y} rx={4.2} ry={1.9} fill={fill} rotation={tilt} origin={`${x}, ${y}`} />;
  });
}

function MedalSymbol({ symbol, fill, stroke }: { symbol: Symbol; fill: string; stroke: string }) {
  switch (symbol) {
    case 'chevron':
      return <Path d="M38 70 L50 80 L62 70" stroke={fill} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
    case 'double-chevron':
      return (
        <G stroke={fill} strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M38 64 L50 73 L62 64" />
          <Path d="M38 75 L50 84 L62 75" />
        </G>
      );
    case 'star':
      return <Polygon points={starPoints(CX, CY + 1, 16, 7, 5)} fill={fill} strokeLinejoin="round" />;
    case 'laurel-star':
      return (
        <G>
          {laurel(-1, fill)}
          {laurel(1, fill)}
          <Polygon points={starPoints(CX, CY + 1, 12, 5.2, 5)} fill={fill} />
        </G>
      );
    case 'gem':
      return (
        <G>
          <Polygon points="50,59 63,69 50,90 37,69" fill={fill} />
          <G stroke={stroke} strokeWidth={1.1} strokeOpacity={0.55} fill="none">
            <Path d="M37 69 H63" />
            <Path d="M43.5 69 L50 59 L56.5 69" />
            <Path d="M43.5 69 L50 90 L56.5 69" />
          </G>
        </G>
      );
    case 'crown':
      return (
        <G fill={fill}>
          <Path d="M35 84 L33 64 L43 73 L50 60 L57 73 L67 64 L65 84 Z" strokeLinejoin="round" />
          <Path d="M35 86.5 H65 V90 H35 Z" />
          <Circle cx={33} cy={63} r={2.6} />
          <Circle cx={50} cy={58.5} r={2.8} />
          <Circle cx={67} cy={63} r={2.6} />
          <Circle cx={50} cy={78} r={2.4} fill={stroke} fillOpacity={0.5} />
        </G>
      );
  }
}

function Sparkle({ x, y, s }: { x: number; y: number; s: number }) {
  return <Path d={`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`} fill="#FFFFFF" />;
}

type Props = {
  rank: string;
  size?: number;
  // Shows the medal in gray with a lock, for ranks not reached yet.
  locked?: boolean;
  // Keeps the real colors but adds the lock pin, for previews that should
  // make a locked rank look worth chasing.
  showLock?: boolean;
  // 1-3: stars on the ribbon for the sub-tier (Gold I / II / III).
  tier?: number;
  // Idle shine sweep (and a gentle float for Legend). Use on the one medal
  // that's the focus of a screen, not in long lists.
  animated?: boolean;
};

// Tier stars sit on the ribbon: one per tail, the third where they cross.
const TIER_STARS = [
  { x: 31, y: 9 },
  { x: 69, y: 9 },
  { x: 50, y: 24 },
];

// A ribboned medal for a guild rank. Each rank has its own metal, ribbon and
// center symbol, getting fancier as you climb (sunburst rim from Gold up,
// sparkles on Platinum and Legend).
export function RankMedal({ rank, size = 48, locked = false, showLock = false, tier, animated = false }: Props) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const style = locked ? { ...LOCKED, symbol: (MEDALS[rank] ?? MEDALS.Rookie).symbol } : (MEDALS[rank] ?? MEDALS.Rookie);
  const metal = `metal${raw}`;
  const face = `face${raw}`;
  const ribbon = `ribbon${raw}`;
  const live = animated && !locked;

  return (
    <MedalMotion float={live && rank === 'Legend'} size={size}>
      <Svg width={size} height={size * 1.2} viewBox="0 0 100 120">
        <Defs>
          <LinearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={style.light} />
            <Stop offset="0.45" stopColor={style.base} />
            <Stop offset="1" stopColor={style.dark} />
          </LinearGradient>
          <RadialGradient id={face} cx="38%" cy="32%" r="75%">
            <Stop offset="0" stopColor={style.light} />
            <Stop offset="0.55" stopColor={style.base} />
            <Stop offset="1" stopColor={style.dark} />
          </RadialGradient>
          <LinearGradient id={ribbon} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={style.ribbon} />
            <Stop offset="1" stopColor={style.ribbonDark} />
          </LinearGradient>
        </Defs>

        {/* Ribbon tails, crossing behind the medal */}
        <Polygon points="20,0 42,0 60,50 40,56" fill={`url(#${ribbon})`} />
        <Line x1={31} y1={0} x2={50} y2={53} stroke={style.stripe} strokeWidth={3} />
        <Polygon points="80,0 58,0 40,50 60,56" fill={`url(#${ribbon})`} />
        <Line x1={69} y1={0} x2={50} y2={53} stroke={style.stripe} strokeWidth={3} />
        <Polygon points="80,0 58,0 54,11 76,11" fill={style.ribbonDark} opacity={0.35} />
        {tier && !locked
          ? TIER_STARS.slice(0, Math.min(3, Math.max(1, tier))).map((star) => (
              <Polygon key={`${star.x}-${star.y}`} points={starPoints(star.x, star.y, 5.5, 2.4, 5)} fill="#FFFFFF" stroke={style.ribbonDark} strokeWidth={0.8} />
            ))
          : null}

        {/* Rim: sunburst for higher ranks, smooth coin edge otherwise */}
        {style.burst ? (
          <Polygon points={starPoints(CX, CY, 39, 34.5, 18)} fill={`url(#${metal})`} stroke={style.dark} strokeWidth={1} strokeLinejoin="round" />
        ) : (
          <Circle cx={CX} cy={CY} r={36} fill={`url(#${metal})`} stroke={style.dark} strokeWidth={1} />
        )}

        {/* Face with an inset ring and a beaded border */}
        <Circle cx={CX} cy={CY} r={29} fill={`url(#${face})`} stroke={style.dark} strokeWidth={1.5} />
        <Circle cx={CX} cy={CY} r={25.5} fill="none" stroke={style.light} strokeOpacity={0.6} strokeWidth={0.8} strokeDasharray="1.2 2.4" />

        {/* Center symbol, embossed: dark offset shadow, then the light face */}
        <G translate="0, 1.6" opacity={0.45}>
          <MedalSymbol symbol={style.symbol} fill={style.dark} stroke={style.dark} />
        </G>
        <MedalSymbol symbol={style.symbol} fill="#FFFFFF" stroke={style.dark} />

        {/* Shine */}
        <Ellipse cx={38} cy={58} rx={13} ry={5.5} fill="#FFFFFF" opacity={0.35} rotation={-35} origin="38, 58" />

        {style.sparkle && !locked ? (
          <G>
            <Sparkle x={84} y={46} s={6} />
            <Sparkle x={17} y={98} s={4.5} />
            <Sparkle x={80} y={104} s={3.5} />
          </G>
        ) : null}
      </Svg>

      {live ? <ShineSweep key="shine" size={size} /> : null}

      {locked || showLock ? (
        <View
          className="absolute items-center justify-center rounded-full bg-[#4B5563]"
          style={{ width: size * 0.36, height: size * 0.36, right: 0, bottom: 0, borderWidth: 2, borderColor: '#FFFFFF' }}>
          <Lock size={size * 0.18} color="#FFFFFF" />
        </View>
      ) : null}
    </MedalMotion>
  );
}

// Wrapper that bobs the medal up and down when `float` is on.
function MedalMotion({ float, size, children }: { float: boolean; size: number; children: ReactNode }) {
  const offset = useSharedValue(0);

  useEffect(() => {
    if (!float) {
      offset.set(0);
      return;
    }
    const amplitude = Math.max(2, size * 0.05);
    offset.set(
      withRepeat(
        withSequence(
          withTiming(-amplitude, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.sin) })
        ),
        -1
      )
    );
    return () => cancelAnimation(offset);
  }, [float, offset, size]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  return <Animated.View style={[{ width: size, height: size * 1.2 }, style]}>{children}</Animated.View>;
}

// A soft white band that glides across the medal face every few seconds.
// Clipped to the rim circle so it only lights the metal.
function ShineSweep({ size }: { size: number }) {
  const scale = size / 100;
  const radius = 37 * scale;
  const travel = useSharedValue(0);

  useEffect(() => {
    travel.set(
      withRepeat(
        withSequence(withTiming(0, { duration: 0 }), withDelay(2600, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }))),
        -1
      )
    );
    return () => cancelAnimation(travel);
  }, [travel]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -radius * 1.6 + travel.get() * radius * 3.2 }, { rotate: '24deg' }],
  }));

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: CX * scale - radius, top: CY * scale - radius, width: radius * 2, height: radius * 2, borderRadius: radius, overflow: 'hidden' }}>
      <Animated.View
        style={[
          { position: 'absolute', top: -radius * 0.5, left: radius - radius * 0.18, width: radius * 0.36, height: radius * 3, backgroundColor: 'rgba(255,255,255,0.45)' },
          bandStyle,
        ]}
      />
    </View>
  );
}
