import { Image } from 'expo-image';
import { Check, Search, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { GROUP_COLORS, GROUP_EMOJIS, type FriendConnection } from '@/lib/social';

// Pieces shared by "New group", the group screen and its settings sheets.

/** Emoji on the group's color; falls back to a people icon. */
export function GroupAvatar({ emoji, color, size = 48 }: { emoji: string | null; color: string | null; size?: number }) {
  const fill = color ?? GROUP_COLORS[0];
  return (
    <View className="items-center justify-center" style={{ width: size, height: size, borderRadius: size * 0.36, backgroundColor: fill }}>
      {emoji ? <Text style={{ fontSize: size * 0.48, lineHeight: size * 0.62 }}>{emoji}</Text> : <Users size={size * 0.46} color="#FFFFFF" />}
    </View>
  );
}

export function PersonAvatar({ name, url, size = 40 }: { name: string; url: string | null | undefined; size?: number }) {
  return url ? (
    <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} transition={200} />
  ) : (
    <View className="items-center justify-center rounded-full bg-[#B7C4EC]" style={{ width: size, height: size }}>
      <Text className="font-bold text-[#24314A]" style={{ fontSize: size * 0.4 }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

/**
 * Searchable friend list. `multiple` shows checkboxes and picked chips;
 * otherwise tapping a row picks it right away.
 */
export function FriendPicker({
  friends,
  loading,
  isDark,
  multiple,
  selected,
  onToggle,
  excludeIds,
  emptyText = 'Add friends first to chat with them.',
}: {
  friends: FriendConnection[];
  loading: boolean;
  isDark: boolean;
  multiple: boolean;
  selected: string[];
  onToggle: (friend: FriendConnection) => void;
  excludeIds?: Set<string>;
  emptyText?: string;
}) {
  const [query, setQuery] = useState('');
  const primary = isDark ? '#FFFFFF' : '#182847';
  const muted = isDark ? '#94A3B8' : '#67748D';
  const soft = isDark ? '#18253C' : '#F0F2F7';

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return friends
      .filter((friend) => !excludeIds?.has(friend.user_id))
      .filter((friend) => !needle || friend.display_name.toLowerCase().includes(needle));
  }, [friends, query, excludeIds]);
  const picked = friends.filter((friend) => selected.includes(friend.user_id));

  return (
    <View className="flex-1">
      <View className="flex-row items-center gap-2.5 rounded-2xl px-4 py-3" style={{ backgroundColor: soft }}>
        <Search size={18} color="#7A859D" />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search friends" placeholderTextColor="#94A3B8" className="flex-1 py-0 text-[15px]" style={{ color: primary }} autoCorrect={false} />
      </View>

      {multiple && picked.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 max-h-[78px] grow-0" contentContainerStyle={{ gap: 12, paddingHorizontal: 2 }}>
          {picked.map((friend) => (
            <TouchableOpacity key={friend.user_id} onPress={() => onToggle(friend)} activeOpacity={0.8} className="w-14 items-center" accessibilityLabel={`Remove ${friend.display_name}`}>
              <View>
                <PersonAvatar name={friend.display_name} url={friend.avatar_url} size={48} />
                <View className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-[#64748B]" style={{ borderWidth: 2, borderColor: isDark ? '#111B2E' : '#FFFFFF' }}>
                  <Text className="text-[11px] font-black leading-[13px] text-white">×</Text>
                </View>
              </View>
              <Text numberOfLines={1} className="mt-1 text-[11px] font-semibold" style={{ color: primary }}>
                {friend.display_name.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <View className="items-center py-10">
          <ActivityIndicator color="#284BD6" />
        </View>
      ) : shown.length === 0 ? (
        <Text className="py-10 text-center text-[14px]" style={{ color: muted }}>
          {query ? 'No friends match that name.' : emptyText}
        </Text>
      ) : (
        <ScrollView className="mt-2" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {shown.map((friend) => {
            const isPicked = selected.includes(friend.user_id);
            return (
              <TouchableOpacity key={friend.user_id} onPress={() => onToggle(friend)} activeOpacity={0.7}>
                <View className="flex-row items-center gap-3 rounded-2xl px-2 py-2.5">
                  <PersonAvatar name={friend.display_name} url={friend.avatar_url} size={44} />
                  <Text numberOfLines={1} className="flex-1 text-[15px] font-semibold" style={{ color: primary }}>
                    {friend.display_name}
                  </Text>
                  {multiple ? (
                    <View
                      className="h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: isPicked ? '#284BD6' : 'transparent', borderWidth: isPicked ? 0 : 2, borderColor: isDark ? '#475569' : '#C3CBD9' }}>
                      {isPicked ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

/** Name, emoji and color for a group, with a live preview. */
export function GroupLookFields({
  isDark,
  title,
  emoji,
  color,
  onChange,
}: {
  isDark: boolean;
  title: string;
  emoji: string | null;
  color: string;
  onChange: (next: { title?: string; emoji?: string | null; color?: string }) => void;
}) {
  const primary = isDark ? '#FFFFFF' : '#182847';
  const muted = isDark ? '#94A3B8' : '#67748D';
  const soft = isDark ? '#18253C' : '#F0F2F7';
  return (
    <View className="gap-5">
      <View className="items-center">
        <GroupAvatar emoji={emoji} color={color} size={84} />
      </View>
      <View>
        <Text className="text-[12px] font-bold uppercase tracking-wider" style={{ color: muted }}>Group name</Text>
        <TextInput
          value={title}
          onChangeText={(text) => onChange({ title: text })}
          placeholder="e.g. Baguio Squad"
          placeholderTextColor="#94A3B8"
          maxLength={40}
          className="mt-2 rounded-2xl px-4 py-3.5 text-[16px] font-semibold"
          style={{ backgroundColor: soft, color: primary }}
        />
      </View>
      <View>
        <Text className="text-[12px] font-bold uppercase tracking-wider" style={{ color: muted }}>Icon</Text>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {GROUP_EMOJIS.map((option) => {
            const active = emoji === option;
            return (
              <TouchableOpacity key={option} onPress={() => onChange({ emoji: active ? null : option })} activeOpacity={0.8}>
                <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: active ? `${color}33` : soft, borderWidth: 2, borderColor: active ? color : 'transparent' }}>
                  <Text style={{ fontSize: 21 }}>{option}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View>
        <Text className="text-[12px] font-bold uppercase tracking-wider" style={{ color: muted }}>Color</Text>
        <View className="mt-2 flex-row flex-wrap gap-2.5">
          {GROUP_COLORS.map((option) => (
            <TouchableOpacity key={option} onPress={() => onChange({ color: option })} activeOpacity={0.8} accessibilityLabel={`Color ${option}`}>
              <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: option, borderWidth: 3, borderColor: color === option ? (isDark ? '#FFFFFF' : '#182847') : 'transparent' }}>
                {color === option ? <Check size={16} color="#FFFFFF" strokeWidth={3} /> : null}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}
