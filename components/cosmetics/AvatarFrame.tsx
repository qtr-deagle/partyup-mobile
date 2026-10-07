import { frameStyle } from '@/lib/cosmetics';
import { useId, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';

type Props = {
  frameKey: string | null | undefined;
  // Diameter of the avatar inside the ring.
  size: number;
  children: ReactNode;
};

// A metallic ring around an avatar in the user's equipped frame. The ring
// sits outside the avatar without changing layout, so screens look the same
// with or without one.
export function AvatarFrame({ frameKey, size, children }: Props) {
  const style = frameStyle(frameKey);
  const gradientId = `frame${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // The avatar's real rendered width. `size` is only the first-frame guess:
  // NativeWind's native rem is 14px, so e.g. `h-24 w-24` renders at 84px, not
  // 96px, and a ring sized from the prop would sit off-center.
  const [measured, setMeasured] = useState<number | null>(null);
  if (!style) return <>{children}</>;

  const diameter = measured ?? size;
  const weight = style.weight ?? 1;
  const ring = Math.max(Math.round(3 * weight), Math.round(diameter * 0.05 * weight));
  const outer = diameter + ring * 2;
  const center = outer / 2;
  const mid = (outer - ring) / 2;
  const inner = diameter / 2;
  const stops = style.colors;

  const gems = style.gems && ring >= 4 ? style.gems : null;
  const gemSize = ring * 0.62;

  return (
    <View style={{ margin: -ring, padding: ring }}>
      {/* Anchored to the avatar itself (not the padded wrapper), so a parent
          that stretches the wrapper can't pull the ring off-center. */}
      <View
        style={{ alignSelf: 'center' }}
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          if (width > 0 && width !== measured) setMeasured(width);
        }}>
        <Svg width={outer} height={outer} style={{ position: 'absolute', top: -ring, left: -ring }}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              {stops.map((color, index) => (
                <Stop key={index} offset={stops.length === 1 ? 0 : index / (stops.length - 1)} stopColor={color} />
              ))}
            </LinearGradient>
          </Defs>
          <Circle cx={center} cy={center} r={mid} stroke={`url(#${gradientId})`} strokeWidth={ring} fill="none" />
          {/* Bevel: light inner lip, dark outer lip, so the ring reads as polished metal. */}
          <Circle cx={center} cy={center} r={inner + ring * 0.12} stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={Math.max(0.6, ring * 0.2)} fill="none" />
          <Circle cx={center} cy={center} r={inner + ring * 0.9} stroke="#000000" strokeOpacity={0.28} strokeWidth={Math.max(0.6, ring * 0.18)} fill="none" />
          {gems
            ? Array.from({ length: gems.count }, (_, index) => {
                const angle = -Math.PI / 2 + (index * 2 * Math.PI) / gems.count;
                const x = center + Math.cos(angle) * mid;
                const y = center + Math.sin(angle) * mid;
                const g = gemSize;
                return [
                  <Polygon
                    key={`gem${index}`}
                    points={`${x},${y - g} ${x + g * 0.75},${y} ${x},${y + g} ${x - g * 0.75},${y}`}
                    fill={gems.color}
                    stroke="#FFFFFF"
                    strokeOpacity={0.85}
                    strokeWidth={0.6}
                  />,
                  <Circle key={`glint${index}`} cx={x - g * 0.2} cy={y - g * 0.3} r={g * 0.22} fill="#FFFFFF" opacity={0.9} />,
                ];
              })
            : null}
        </Svg>
        {children}
      </View>
    </View>
  );
}
