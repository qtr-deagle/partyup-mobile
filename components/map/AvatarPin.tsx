import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { AnimatedRegion, Marker, MarkerAnimated } from 'react-native-maps';

const GLIDE_MS = 900;

// Android re-renders custom marker views every frame while tracksViewChanges
// is on, so it's switched off shortly after the view has what it needs.
// (Turning it off immediately can leave the marker blank on Android.)
function useTracksViewChanges(ready: boolean, key: string) {
  // The view version that has finished drawing; anything else is still tracked.
  const [settledKey, setSettledKey] = useState<string | null>(null);
  useEffect(() => {
    if (!ready) {
      return;
    }
    const timer = setTimeout(() => setSettledKey(key), 400);
    return () => clearTimeout(timer);
  }, [ready, key]);
  return !ready || settledKey !== key;
}

type AvatarPinProps = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  color: string;
  avatarUrl?: string | null;
  selected: boolean;
  isDark: boolean;
  onPress: (id: string) => void;
};

// Native map pin: profile photo in a colored ring with the name under it,
// matching the Leaflet pins. Glides to new positions instead of jumping.
export default function AvatarPin({ id, latitude, longitude, name, color, avatarUrl, selected, isDark, onPress }: AvatarPinProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const tracksViewChanges = useTracksViewChanges(!avatarUrl || loadedUrl === avatarUrl, `${avatarUrl}|${selected}|${isDark}|${name}`);
  const size = selected ? 46 : 38;

  const [coordinate] = useState(() => new AnimatedRegion({ latitude, longitude, latitudeDelta: 0, longitudeDelta: 0 }));
  useEffect(() => {
    coordinate.timing({ latitude, longitude, latitudeDelta: 0, longitudeDelta: 0, duration: GLIDE_MS, useNativeDriver: false, toValue: 0 }).start();
  }, [coordinate, latitude, longitude]);

  return (
    <MarkerAnimated
      // AnimatedRegion is the documented coordinate source for MarkerAnimated, but its type isn't LatLng.
      coordinate={coordinate as unknown as { latitude: number; longitude: number }}
      anchor={{ x: 0.5, y: 0.35 }}
      zIndex={selected ? 1000 : 1}
      tracksViewChanges={tracksViewChanges}
      onPress={() => onPress(id)}>
      <View className="items-center" style={{ width: 96 }}>
        <View
          className="items-center justify-center overflow-hidden rounded-full"
          style={{ width: size, height: size, borderWidth: 3, borderColor: color, backgroundColor: avatarUrl ? '#CBD5E1' : color }}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: size - 6, height: size - 6 }}
              onLoad={() => setLoadedUrl(avatarUrl)}
              onError={() => setLoadedUrl(avatarUrl)}
            />
          ) : (
            <Text className="text-[14px] font-bold text-white">{name.trim().charAt(0).toUpperCase() || '?'}</Text>
          )}
        </View>
        <View className={`mt-0.5 max-w-[96px] rounded-lg px-1.5 ${isDark ? 'bg-[#111B2E]/90' : 'bg-white/90'}`}>
          <Text numberOfLines={1} className={`text-[11px] font-semibold ${isDark ? 'text-white' : 'text-[#17233F]'}`}>
            {name}
          </Text>
        </View>
      </View>
    </MarkerAnimated>
  );
}

// "+3" bubble standing in for people too close together to tell apart.
export function ClusterPin({ latitude, longitude, count, onPress }: { latitude: number; longitude: number; count: number; onPress: () => void }) {
  const tracksViewChanges = useTracksViewChanges(true, String(count));
  return (
    <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.5 }} zIndex={500} tracksViewChanges={tracksViewChanges} onPress={onPress}>
      <View className="h-[54px] w-[54px] items-center justify-center rounded-full bg-[#2246C7]/25">
        <View className="h-11 w-11 items-center justify-center rounded-full border-[3px] border-white bg-[#2246C7]">
          <Text className="text-[14px] font-black text-white">+{count}</Text>
        </View>
      </View>
    </Marker>
  );
}

// The active trip's meetup point.
export function MeetupPin({ latitude, longitude, label, isDark, onPress }: { latitude: number; longitude: number; label: string; isDark: boolean; onPress: () => void }) {
  const tracksViewChanges = useTracksViewChanges(true, `${label}|${isDark}`);
  return (
    <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.55 }} zIndex={400} tracksViewChanges={tracksViewChanges} onPress={onPress}>
      <View className="items-center" style={{ width: 110 }}>
        <View
          className="h-[34px] w-[34px] items-center justify-center border-[3px] border-white bg-[#F97316]"
          style={{ borderRadius: 17, borderBottomLeftRadius: 0, transform: [{ rotate: '-45deg' }] }}>
          <Text className="text-[13px] font-black text-white" style={{ transform: [{ rotate: '45deg' }] }}>
            M
          </Text>
        </View>
        <View className={`mt-1 max-w-[110px] rounded-lg px-1.5 ${isDark ? 'bg-[#111B2E]/90' : 'bg-white/90'}`}>
          <Text numberOfLines={1} className={`text-[11px] font-semibold ${isDark ? 'text-white' : 'text-[#17233F]'}`}>
            {label}
          </Text>
        </View>
      </View>
    </Marker>
  );
}
