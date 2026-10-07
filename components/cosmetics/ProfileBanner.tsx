import { bannerStyle, type BannerPattern } from '@/lib/cosmetics';
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';

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
  const { colors, pattern, trim, sheen } = bannerStyle(bannerKey);
  const gradientId = `banner${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const sheenId = `${gradientId}sheen`;
  const accent = trim ?? '#E9C46A';

  return (
    <View className={`overflow-hidden ${className}`} style={[{ height, backgroundColor: colors[0] }, style]}>
      {/* The wrapper fills the whole banner (insets ignore the banner's padding);
          a bare absolute Svg with width="100%" resolves against the padded content
          box and stops short of the right edge when className adds px-*. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              {colors.map((color, index) => (
                <Stop key={index} offset={colors.length === 1 ? 0 : index / (colors.length - 1)} stopColor={color} />
              ))}
            </LinearGradient>
            <LinearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.75" stopColor="#FFFFFF" stopOpacity={0.06} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="400" height="160" fill={`url(#${gradientId})`} />
          <Pattern pattern={pattern} accent={accent} />
          {sheen ? <Rect key="sheen" x="0" y="0" width="400" height="160" fill={`url(#${sheenId})`} /> : null}
          {trim ? (
            <>
              <Rect key="trimTop" x="0" y="0" width="400" height="3" fill={trim} opacity={0.95} />
              <Rect key="trimTopFine" x="0" y="6" width="400" height="0.8" fill={trim} opacity={0.6} />
              <Rect key="trimBottomFine" x="0" y="153.2" width="400" height="0.8" fill={trim} opacity={0.6} />
              <Rect key="trimBottom" x="0" y="157" width="400" height="3" fill={trim} opacity={0.95} />
            </>
          ) : null}
        </Svg>
      </View>
      {children}
    </View>
  );
}

const STARS: [number, number, number][] = [
  [30, 30, 1.6], [70, 70, 1.1], [110, 22, 2], [150, 55, 1.2], [190, 18, 1.5], [230, 75, 1], [255, 35, 1.8],
  [290, 95, 1.2], [380, 80, 1.5], [55, 120, 1.3], [130, 105, 1.8], [205, 130, 1.1], [360, 135, 1.6], [12, 85, 1],
];

// Deterministic 0..1 noise so patterns look hand-placed but never change.
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function Pattern({ pattern, accent }: { pattern: BannerPattern; accent: string }) {
  switch (pattern) {
    case 'deco':
      // Art Deco sunburst fan with stepped arches.
      return (
        <>
          {Array.from({ length: 19 }, (_, index) => {
            const angle = Math.PI + (index * Math.PI) / 18;
            return (
              <Line key={index} x1="200" y1="160" x2={200 + Math.cos(angle) * 260} y2={160 + Math.sin(angle) * 260} stroke={accent} strokeWidth={1} opacity={0.35} />
            );
          })}
          {[38, 62, 86, 110].map((r, index) => (
            <Path key={r} d={`M${200 - r} 160 A${r} ${r} 0 0 1 ${200 + r} 160`} stroke={accent} strokeWidth={index === 0 ? 2.5 : 1.2} fill="none" opacity={0.75} />
          ))}
          <Circle cx="200" cy="160" r="22" fill={accent} opacity={0.85} />
          <Path d="M14 20 H54 M14 20 V60 M22 28 H46 M22 28 V52" stroke={accent} strokeWidth={1.4} fill="none" opacity={0.7} />
          <Path d="M386 20 H346 M386 20 V60 M378 28 H354 M378 28 V52" stroke={accent} strokeWidth={1.4} fill="none" opacity={0.7} />
        </>
      );
    case 'damask':
      // Repeating jewel lattice, like brocade wallpaper.
      return (
        <>
          {Array.from({ length: 5 }, (_, row) =>
            Array.from({ length: 11 }, (_, col) => {
              const x = col * 40 + (row % 2 ? 20 : 0);
              const y = row * 40;
              return [
                <Polygon key={`d${row}-${col}`} points={`${x},${y - 15} ${x + 11},${y} ${x},${y + 15} ${x - 11},${y}`} stroke={accent} strokeWidth={0.9} fill="none" opacity={0.4} />,
                <Polygon key={`i${row}-${col}`} points={`${x},${y - 6} ${x + 4},${y} ${x},${y + 6} ${x - 4},${y}`} fill={accent} opacity={0.45} />,
              ];
            })
          )}
          <Rect x="0" y="0" width="400" height="160" fill="#000000" opacity={0.18} />
        </>
      );
    case 'aurora':
      return (
        <>
          {STARS.map(([cx, cy, r]) => (
            <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r * 0.8} fill="#FFFFFF" opacity={0.6} />
          ))}
          <Path d="M0 96 C80 40 150 120 230 60 S360 30 400 70 V110 C330 80 280 130 200 110 S60 140 0 128Z" fill="#5EEAD4" opacity={0.28} />
          <Path d="M0 70 C90 20 170 90 250 40 S370 10 400 40 V64 C340 50 290 90 220 82 S70 100 0 100Z" fill="#A78BFA" opacity={0.25} />
          <Path d="M0 120 C100 90 180 150 270 110 S380 96 400 112 V136 C340 120 290 160 210 146 S70 156 0 150Z" fill="#F0ABFC" opacity={0.16} />
        </>
      );
    case 'facets':
      // Cut-gem facets: a triangle mesh in varying light, plus a few glints.
      return (
        <>
          {Array.from({ length: 4 }, (_, row) =>
            Array.from({ length: 9 }, (_, col) => {
              const x = col * 50 - (row % 2 ? 25 : 0);
              const y = row * 40;
              const seed = row * 9 + col;
              return [
                <Polygon key={`a${seed}`} points={`${x},${y} ${x + 50},${y} ${x + 25},${y + 40}`} fill="#FFFFFF" opacity={0.03 + noise(seed) * 0.12} />,
                <Polygon key={`b${seed}`} points={`${x + 50},${y} ${x + 75},${y + 40} ${x + 25},${y + 40}`} fill="#FFFFFF" opacity={0.02 + noise(seed + 50) * 0.08} />,
              ];
            })
          )}
          {[[320, 40], [86, 118], [250, 128]].map(([x, y]) => (
            <Path
              key={`${x}-${y}`}
              d={`M${x} ${y - 9} L${x + 2} ${y - 2} L${x + 9} ${y} L${x + 2} ${y + 2} L${x} ${y + 9} L${x - 2} ${y + 2} L${x - 9} ${y} L${x - 2} ${y - 2}Z`}
              fill="#FFFFFF"
              opacity={0.85}
            />
          ))}
        </>
      );
    case 'marble':
      // Black marble with gold veining.
      return (
        <>
          <Path d="M-10 40 C60 60 90 20 160 50 S260 110 330 70 S390 40 420 60" stroke="#FFFFFF" strokeWidth={6} fill="none" opacity={0.05} />
          <Path d="M-10 120 C50 100 120 140 190 110 S300 150 420 120" stroke="#FFFFFF" strokeWidth={8} fill="none" opacity={0.04} />
          <Path d="M-10 52 C50 70 100 28 165 58 S255 118 330 80 S395 50 420 66" stroke={accent} strokeWidth={1.6} fill="none" opacity={0.85} />
          <Path d="M120 44 C140 70 130 96 170 120 S220 150 240 170" stroke={accent} strokeWidth={0.9} fill="none" opacity={0.6} />
          <Path d="M-10 130 C60 110 110 150 200 118 S310 140 420 112" stroke={accent} strokeWidth={1.1} fill="none" opacity={0.55} />
          <Path d="M300 -10 C290 30 320 50 300 84" stroke={accent} strokeWidth={0.7} fill="none" opacity={0.5} />
        </>
      );
    case 'silk':
      return (
        <>
          <Path d="M0 30 C100 0 150 90 260 50 S380 20 400 40 V90 C330 70 280 120 180 100 S50 90 0 120Z" fill="#FFFFFF" opacity={0.1} />
          <Path d="M0 90 C90 60 170 140 270 100 S370 80 400 96 V160 H0Z" fill="#FFFFFF" opacity={0.08} />
          <Path d="M0 38 C100 8 150 98 260 58 S380 28 400 48" stroke={accent} strokeWidth={0.9} fill="none" opacity={0.55} />
          <Path d="M0 98 C90 68 170 148 270 108 S370 88 400 104" stroke={accent} strokeWidth={0.9} fill="none" opacity={0.45} />
        </>
      );
    case 'laurel': {
      // A gold laurel wreath around a star, set to the right.
      const cx = 318;
      const cy = 84;
      const radius = 50;
      const leaves = [];
      for (let side = 0; side < 2; side++) {
        for (let index = 0; index < 8; index++) {
          const deg = side === 0 ? 112 + index * 18 : 68 - index * 18;
          const rad = (deg * Math.PI) / 180;
          const x = cx + Math.cos(rad) * radius;
          const y = cy + Math.sin(rad) * radius;
          leaves.push(
            <Ellipse key={`${side}-${index}`} cx={x} cy={y} rx={9} ry={3.6} fill={accent} opacity={0.8} transform={`rotate(${deg + (side === 0 ? 60 : -60)} ${x} ${y})`} />
          );
        }
      }
      return (
        <>
          {leaves}
          <Path
            d={`M${cx} ${cy - 18} L${cx + 5} ${cy - 6} L${cx + 18} ${cy - 6} L${cx + 8} ${cy + 2} L${cx + 12} ${cy + 15} L${cx} ${cy + 7} L${cx - 12} ${cy + 15} L${cx - 8} ${cy + 2} L${cx - 18} ${cy - 6} L${cx - 5} ${cy - 6}Z`}
            fill={accent}
            opacity={0.9}
          />
          {[[60, 40, 1.8], [130, 110, 1.4], [30, 120, 1.6], [200, 36, 1.2]].map(([x, y, r]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={accent} opacity={0.6} />
          ))}
        </>
      );
    }
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
