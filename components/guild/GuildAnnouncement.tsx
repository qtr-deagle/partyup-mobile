import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { riseIn } from '@/components/ui/motion';
import { setGuildAnnouncement, type Guild } from '@/lib/guilds';
import { Megaphone, Pencil, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';

type Props = {
  guild: Guild;
  isDark: boolean;
  // Leader or officer.
  canEdit: boolean;
  onSaved: () => void;
};

function postedAgo(iso: string | null) {
  if (!iso) return '';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Pinned guild announcement. Leaders and officers can post, edit or clear it;
// posting notifies every member.
export function GuildAnnouncement({ guild, isDark, canEdit, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!guild.announcement && !canEdit) return null;

  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';

  function open() {
    setText(guild.announcement ?? '');
    setError(null);
    setEditing(true);
  }

  async function save(next: string) {
    setBusy(true);
    setError(null);
    const { error: saveError } = await setGuildAnnouncement(guild.id, next);
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <>
      {guild.announcement ? (
        <Animated.View
          key="announcement"
          entering={riseIn(0, 380)}
          className="overflow-hidden rounded-[20px] border-l-4 p-4"
          style={{ borderLeftColor: guild.color, backgroundColor: isDark ? '#18253C' : `${guild.color}12` }}>
          <View className="flex-row items-center gap-2">
            <Megaphone size={16} color={guild.color} />
            <Text className="flex-1 text-xs font-black uppercase tracking-[2px]" style={{ color: guild.color }}>
              Announcement
            </Text>
            <Text className={`text-[11px] ${secondary}`}>{postedAgo(guild.announcement_at)}</Text>
            {canEdit ? (
              <AnimatedPressable onPress={open} className="ml-1 h-7 w-7 items-center justify-center rounded-full" accessibilityLabel="Edit announcement">
                <Pencil size={14} color={guild.color} />
              </AnimatedPressable>
            ) : null}
          </View>
          <Text className={`mt-2 text-[15px] leading-6 ${primary}`}>{guild.announcement}</Text>
        </Animated.View>
      ) : (
        <AnimatedPressable
          key="post"
          onPress={open}
          className="flex-row items-center gap-3 rounded-[20px] border-2 border-dashed p-4"
          style={{ borderColor: `${guild.color}55` }}>
          <Megaphone size={18} color={guild.color} />
          <Text className={`flex-1 text-sm font-bold ${secondary}`}>Post an announcement to your guild</Text>
        </AnimatedPressable>
      )}

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 items-center justify-center bg-black/45 px-4">
          <Animated.View entering={riseIn(0, 350)} className={`w-full max-w-[440px] rounded-[28px] p-5 ${isDark ? 'bg-[#111B2E]' : 'bg-white'}`}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Megaphone size={20} color={guild.color} />
                <Text className={`text-lg font-black ${primary}`}>Guild announcement</Text>
              </View>
              <TouchableOpacity onPress={() => setEditing(false)} accessibilityLabel="Close" hitSlop={10}>
                <X size={20} color={isDark ? '#94A3B8' : '#67748D'} />
              </TouchableOpacity>
            </View>
            <Text className={`mt-1 text-xs ${secondary}`}>Pinned at the top of your guild. Every member gets a notification.</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              maxLength={280}
              multiline
              placeholder="e.g. Sunday sunrise hike, meet 4AM at the plaza!"
              placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
              className={`mt-3 min-h-[110px] rounded-xl border px-4 py-3 text-[15px] ${isDark ? 'border-[#22324B] bg-[#18253C] text-white' : 'border-[#DCE3EF] bg-[#F4F6FA] text-[#1B2340]'}`}
              style={{ textAlignVertical: 'top' }}
            />
            <Text className={`mt-1 text-right text-[11px] ${secondary}`}>{text.length}/280</Text>
            {error ? <Text className="mt-1 text-sm text-[#B91C1C]">{error}</Text> : null}
            <View className="mt-3 flex-row gap-2">
              {guild.announcement ? (
                <AnimatedPressable
                  onPress={() => void save('')}
                  disabled={busy}
                  className={`flex-1 items-center rounded-2xl border py-3 ${isDark ? 'border-[#334155]' : 'border-[#CBD5E1]'}`}>
                  <Text className={`font-bold ${secondary}`}>Clear</Text>
                </AnimatedPressable>
              ) : null}
              <AnimatedPressable
                onPress={() => void save(text)}
                disabled={busy || text.trim().length === 0}
                className="flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3"
                style={{ flex: guild.announcement ? 2 : 1, backgroundColor: text.trim() ? guild.color : '#94A3B8' }}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Megaphone size={16} color="#FFFFFF" />}
                <Text className="font-black text-white">Post</Text>
              </AnimatedPressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
