import { bannerStyle, type BannerPattern } from '@/lib/cosmetics';
import { useId, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

type Props = {
  bannerKey: string | null | undefined;
  height: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

// A profile header in the user's equipped banner (classic blue when none).
// Drawn on a 400x160 canvas that's cropped to fill, so it works at any size.
export function ProfileBanner({ bannerKey, height, className = '', style, children }: Props) {
  const { colors, pattern } = bannerStyle(bannerKey);
  const gradientId = `banner${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View className={`overflow-hidden ${className}`} style={[{ height, backgroundColor: colors[0] }, style]}>
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="400" height="160" fill={`url(#${gradientId})`} />
        <Pattern pattern={pattern} />
      </Svg>
      {children}
    </View>
  );
}

const STARS: [number, number, number][] = [
  [30, 30, 1.6], [70, 70, 1.1], [110, 22, 2], [150, 55, 1.2], [190, 18, 1.5], [230, 75, 1], [255, 35, 1.8],
  [290, 95, 1.2], [380, 80, 1.5], [55, 120, 1.3], [130, 105, 1.8], [205, 130, 1.1], [360, 135, 1.6], [12, 85, 1],
];

function Pattern({ pattern }: { pattern: BannerPattern }) {
  switch (pattern) {
    case 'hills':
      return (
        <>
          <Circle cx="305" cy="58" r="30" fill="#FFFFFF" opacity={0.25} />
          <Path d="M0 118 Q100 78 200 112 T400 100 V160 H0Z" fill="#FFFFFF" opacity={0.16} />
          <Path d="M0 140 Q120 104 240 136 T400 128 V160 H0Z" fill="#FFFFFF" opacity={0.14} />
        </>
      );
    case 'waves':
      return (
        <>
          {[92, 114, 136].map((y) => (
            <Path key={y} d={`M0 ${y} Q50 ${y - 12} 100 ${y} T200 ${y} T300 ${y} T400 ${y} V160 H0Z`} fill="#FFFFFF" opacity={0.1} />
          ))}
        </>
      );
    case 'peaks':
      return (
        <>
          <Polygon points="0,160 70,78 130,128 205,52 285,132 345,86 400,124 400,160" fill="#FFFFFF" opacity={0.16} />
          <Polygon points="190,66 205,52 220,66 212,62 205,68 198,62" fill="#FFFFFF" opacity={0.6} />
          <Polygon points="0,160 55,118 125,152 230,108 320,150 400,120 400,160" fill="#000000" opacity={0.14} />
        </>
      );
    case 'stars':
      return (
        <>
          {STARS.map(([cx, cy, r]) => (
            <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#FFFFFF" opacity={0.8} />
          ))}
          <Path d="M332 24 A24 24 0 1 0 352 62 A19 19 0 1 1 332 24Z" fill="#FDE68A" opacity={0.9} />
        </>
      );
    case 'rays':
      return (
        <>
          {Array.from({ length: 9 }, (_, index) => {
            const a = Math.PI + (index + 0.5) * (Math.PI / 9);
            const b = a + Math.PI / 30;
            const point = (angle: number) => `${200 + Math.cos(angle) * 320},${170 + Math.sin(angle) * 320}`;
            return <Polygon key={index} points={`200,170 ${point(a - Math.PI / 30)} ${point(b)}`} fill="#FFFFFF" opacity={0.1} />;
          })}
          <Circle cx="200" cy="170" r="46" fill="#FDE68A" opacity={0.35} />
        </>
      );
    case 'road':
      return (
        <>
          <Rect x="0" y="62" width="400" height="98" fill="#000000" opacity={0.18} />
          <Polygon points="186,62 214,62 340,160 60,160" fill="#000000" opacity={0.3} />
          {[[198, 68, 4, 8], [196, 86, 8, 13], [193, 110, 14, 20], [189, 140, 22, 20]].map(([x, y, w, h]) => (
            <Rect key={y} x={x} y={y} width={w} height={h} fill="#FDE68A" opacity={0.8} />
          ))}
          <Circle cx="200" cy="58" r="16" fill="#FDE68A" opacity={0.4} />
        </>
      );
    case 'shield':
      return (
        <>
          <Path d="M310 16 L370 36 V80 Q370 126 310 150 Q250 126 250 80 V36 Z" fill="#FFFFFF" opacity={0.14} />
          <Path d="M310 40 L346 52 V80 Q346 108 310 124 Q274 108 274 80 V52 Z" fill="#FFFFFF" opacity={0.12} />
          <Path d="M0 120 L40 100 L80 120 L120 100 L160 120 V136 L120 116 L80 136 L40 116 L0 136Z" fill="#FFFFFF" opacity={0.08} />
        </>
      );
    case 'crown':
      return (
        <>
          <Path d="M250 112 L262 50 L294 84 L320 34 L346 84 L378 50 L390 112 Z" fill="#FDE68A" opacity={0.3} />
          <Rect x="250" y="116" width="140" height="12" rx="4" fill="#FDE68A" opacity={0.3} />
          {[[60, 40, 3], [120, 90, 2], [30, 120, 2.5], [180, 30, 2], [210, 120, 3]].map(([cx, cy, r]) => (
            <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#FFFFFF" opacity={0.7} />
          ))}
        </>
      );
    case 'orbs':
    default:
      return (
        <>
          <Circle cx="350" cy="12" r="96" fill="#FFFFFF" opacity={0.1} />
          <Circle cx="20" cy="150" r="80" fill="#FFFFFF" opacity={0.05} />
        </>
      );
  }
}
