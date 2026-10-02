import { frameStyle } from '@/lib/cosmetics';
import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type Props = {
  frameKey: string | null | undefined;
  // Diameter of the avatar inside the ring.
  size: number;
  children: ReactNode;
};

// A gradient ring around an avatar in the user's equipped frame. The ring
// sits outside the avatar without changing layout, so screens look the same
// with or without one.
export function AvatarFrame({ frameKey, size, children }: Props) {
  const style = frameStyle(frameKey);
  const gradientId = `frame${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!style) return <>{children}</>;

  const ring = Math.max(3, Math.round(size * 0.05));
  const outer = size + ring * 2;

  return (
    <View style={{ width: outer, height: outer, margin: -ring, padding: ring }}>
      <Svg width={outer} height={outer} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={style.colors[0]} />
            <Stop offset="1" stopColor={style.colors[1]} />
          </LinearGradient>
        </Defs>
        <Circle cx={outer / 2} cy={outer / 2} r={(outer - ring) / 2} stroke={`url(#${gradientId})`} strokeWidth={ring} fill="none" />
      </Svg>
      {children}
    </View>
  );
}
