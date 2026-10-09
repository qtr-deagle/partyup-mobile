import type { GroupMember } from '@/components/chat/GroupInfoSheet';
import { riseIn } from '@/components/ui/motion';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { showAlert } from '@/lib/dialog';
const SIZE = 14;
const MAX_SHOWN = 5;

// Messenger-style "seen by" heads under the last message each member read.
export function SeenByRow({ readers, mine, isDark }: { readers: GroupMember[]; mine: boolean; isDark: boolean }) {
  const shown = readers.slice(0, MAX_SHOWN);
  const extra = readers.length - shown.length;
  const ring = isDark ? '#0F172A' : '#FFFFFF';

  return (
    <Animated.View key={readers.map((reader) => reader.userId).join(',')} entering={riseIn(0, 260)} className={`mt-1 ${mine ? 'self-end' : 'self-start ml-1'}`}>
      <Pressable
        onPress={() => showAlert('Seen by', readers.map((reader) => reader.name).join('\n'))}
        hitSlop={8}
        accessibilityLabel={`Seen by ${readers.map((reader) => reader.name).join(', ')}`}
      >
        <View className="flex-row items-center">
          {shown.map((reader, index) => (
            <View
              key={reader.userId}
              style={{ width: SIZE + 2, height: SIZE + 2, borderRadius: (SIZE + 2) / 2, borderWidth: 1, borderColor: ring, marginLeft: index === 0 ? 0 : -4, backgroundColor: '#B7C4EC' }}
              className="items-center justify-center overflow-hidden"
            >
              {reader.avatarUrl ? (
                <Image source={{ uri: reader.avatarUrl }} style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2 }} />
              ) : (
                <Text style={{ fontSize: 8 }} className="font-bold text-[#24314A]">{reader.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
          ))}
          {extra > 0 ? <Text className={`ml-1 text-[10px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>+{extra}</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}
