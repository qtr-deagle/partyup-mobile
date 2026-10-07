import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export const TAB_BAR_RADIUS = 26;

// Tab bar colors follow the app theme: a shade lighter than the dark screen
// (#0B1220) in dark mode and a shade darker than the light screen (#F8FAFC)
// in light mode, so the pill reads as its own surface either way.
export function tabBarColors(isDark: boolean) {
  return isDark
    ? {
        active: '#93C5FD',
        inactive: '#7C8BA5',
        activePill: 'rgba(59,130,246,0.24)',
        fillTop: '#24324F',
        fillBottom: '#1A253D',
        sheen: 0.08,
        edgeEnds: '#93C5FD',
        edgeMiddle: '#284BD6',
        edgeOpacity: 0.7,
      }
    : {
        active: '#284BD6',
        inactive: '#7B8AA3',
        activePill: 'rgba(40,75,214,0.12)',
        fillTop: '#E9EEF7',
        fillBottom: '#DFE6F3',
        sheen: 0.45,
        edgeEnds: '#284BD6',
        edgeMiddle: '#93C5FD',
        edgeOpacity: 0.45,
      };
}

// Drawn behind the tab items: a gradient pill, a soft glass sheen on the top
// half and a thin blue edge that catches the light at the ends.
export function TabBarBackground({ isDark }: { isDark: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const colors = tabBarColors(isDark);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={(event) => setSize(event.nativeEvent.layout)}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="tabFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.fillTop} />
              <Stop offset="1" stopColor={colors.fillBottom} />
            </LinearGradient>
            <LinearGradient id="tabSheen" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={colors.sheen} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
            <LinearGradient id="tabEdge" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.edgeEnds} stopOpacity={colors.edgeOpacity} />
              <Stop offset="0.5" stopColor={colors.edgeMiddle} stopOpacity={colors.edgeOpacity * 0.5} />
              <Stop offset="1" stopColor={colors.edgeEnds} stopOpacity={colors.edgeOpacity} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} rx={TAB_BAR_RADIUS} fill="url(#tabFill)" />
          <Rect x={1} y={1} width={width - 2} height={height / 2} rx={TAB_BAR_RADIUS - 1} fill="url(#tabSheen)" />
          <Rect x={0.75} y={0.75} width={width - 1.5} height={height - 1.5} rx={TAB_BAR_RADIUS - 0.75} fill="none" stroke="url(#tabEdge)" strokeWidth={1.5} />
        </Svg>
      ) : null}
    </View>
  );
}
