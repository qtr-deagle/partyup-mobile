import { riseIn } from '@/components/ui/motion';
import { mutedUntilLabel } from '@/lib/chatMute';
import { parseTimestamp } from '@/lib/datetime';
import { Image } from 'expo-image';
import { Bell, BellOff, Calendar, ChevronRight, Flag, MessageCircle, Pin, PinOff, Search, Shield, Trash2, UserMinus, UserRound } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  name: string;
  avatarUrl: string | null;
  status: 'typing' | 'here' | 'idle';
  messageCount: number;
  firstMessageAt: string | null;
  muted: boolean;
  /** When a timed mute ends; null while muted means until turned back on. */
  mutedUntil?: string | null;
  pinned: boolean;
  // Newest first; only the first six are shown.
  photos: { key: string; url: string }[];
  onViewProfile: () => void;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onOpenPhoto: (url: string) => void;
  onDelete: () => void;
  onSearch: () => void;
  onReport: () => void;
  onUnfriend: () => void;
  onBlock: () => void;
};

// Messenger-style "chat info" sheet for a direct conversation.
export function ChatInfoSheet({ visible, onClose, isDark, name, avatarUrl, status, messageCount, firstMessageAt, muted, mutedUntil, pinned, photos, onViewProfile, onToggleMute, onTogglePin, onOpenPhoto, onDelete, onSearch, onReport, onUnfriend, onBlock }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // Three across, inside the sheet's 16px padding with 4px gaps.
  const tile = Math.floor((windowWidth - 32 - 8) / 3);
  const group = isDark ? 'bg-[#18253C]' : 'bg-[#F3F5FA]';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const iconColor = isDark ? '#E2E8F0' : '#182847';
  const divider = isDark ? 'border-[#22324B]' : 'border-[#E4E8F0]';

  const since = firstMessageAt
    ? parseTimestamp(firstMessageAt).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
    : null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {visible ? (
          <Animated.View key="chat-info-sheet" entering={riseIn(0, 360)} className="px-4 pt-2.5" style={{ paddingBottom: insets.bottom + 12, backgroundColor: isDark ? '#111B2E' : '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: isDark ? 1 : 0, borderColor: '#22324B', maxHeight: windowHeight * 0.88 }}>
            <View className={`mb-3 h-1 w-9 self-center rounded-full ${isDark ? 'bg-[#334155]' : 'bg-[#D5DBE6]'}`} />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Swallow taps so only the backdrop closes the sheet. */}
            <Pressable onPress={() => undefined}>

              <View className="items-center">
                <View>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={{ width: 72, height: 72, borderRadius: 36 }} transition={200} />
                  ) : (
                    <View className="items-center justify-center bg-[#B7C4EC]" style={{ width: 72, height: 72, borderRadius: 36 }}>
                      <Text className="text-[28px] font-bold text-[#24314A]">{name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  {status !== 'idle' ? (
                    <Animated.View key="online-dot" entering={FadeIn.duration(200)} style={{ width: 18, height: 18, borderRadius: 9 }} className={`absolute bottom-0.5 right-0.5 border-[3px] bg-[#10B981] ${isDark ? 'border-[#111B2E]' : 'border-white'}`} />
                  ) : null}
                </View>
                <Text numberOfLines={1} className={`mt-2.5 text-lg font-bold ${primary}`}>{name}</Text>
                <Text className={`mt-0.5 text-sm ${status === 'typing' ? 'font-semibold text-[#284BD6]' : secondary}`}>
                  {status === 'typing' ? 'typing…' : status === 'here' ? 'In this chat now' : 'Friends on PartyUp'}
                </Text>
              </View>

              <View className="mt-4 flex-row justify-center">
                <QuickAction label="Profile" onPress={onViewProfile} isDark={isDark} icon={<UserRound size={20} color={iconColor} />} />
                <QuickAction label={muted ? 'Unmute' : 'Mute'} onPress={onToggleMute} isDark={isDark} icon={muted ? <Bell size={20} color={iconColor} /> : <BellOff size={20} color={iconColor} />} />
                <QuickAction label="Search" onPress={onSearch} isDark={isDark} icon={<Search size={20} color={iconColor} />} />
              </View>

              <Text className={`mb-2 ml-1 mt-5 text-[11px] font-bold uppercase tracking-wider ${secondary}`}>Chat info</Text>
              {photos.length ? (
                <View className="mb-2 flex-row flex-wrap" style={{ gap: 4 }}>
                  {photos.slice(0, 6).map((photo) => (
                    <TouchableOpacity key={photo.key} onPress={() => onOpenPhoto(photo.url)} accessibilityLabel="Open shared photo" activeOpacity={0.8}>
                      <Image source={{ uri: photo.url }} style={{ width: tile, height: tile, borderRadius: 10 }} contentFit="cover" transition={200} />
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <View className={`overflow-hidden rounded-2xl ${group}`}>
                <InfoRow icon={<MessageCircle size={18} color={iconColor} />} label={`${messageCount} ${messageCount === 1 ? 'message' : 'messages'}`} textClass={primary} divider={divider} />
                <InfoRow icon={<Calendar size={18} color={iconColor} />} label={since ? `Chatting since ${since}` : 'No messages yet'} textClass={primary} divider={divider} last />
              </View>

              <Text className={`mb-2 ml-1 mt-4 text-[11px] font-bold uppercase tracking-wider ${secondary}`}>Actions</Text>
              <View className={`overflow-hidden rounded-2xl ${group}`}>
                <InfoRow
                  icon={muted ? <BellOff size={18} color={iconColor} /> : <Bell size={18} color={iconColor} />}
                  label="Mute notifications"
                  detail={muted ? mutedUntilLabel(mutedUntil) : undefined}
                  textClass={primary}
                  secondaryClass={secondary}
                  divider={divider}
                  onPress={onToggleMute}
                  trailing={<ToggleSwitch value={muted} onChange={onToggleMute} isDark={isDark} />}
                />
                <InfoRow
                  icon={pinned ? <Pin size={18} color={iconColor} /> : <PinOff size={18} color={iconColor} />}
                  label="Pin chat"
                  detail={pinned ? 'Kept at the top of your chats' : undefined}
                  textClass={primary}
                  secondaryClass={secondary}
                  divider={divider}
                  onPress={onTogglePin}
                  trailing={<ToggleSwitch value={pinned} onChange={onTogglePin} isDark={isDark} />}
                  last
                />
              </View>

              <Text className={`mb-2 ml-1 mt-4 text-[11px] font-bold uppercase tracking-wider ${secondary}`}>Privacy & support</Text>
              <View className={`overflow-hidden rounded-2xl ${group}`}>
                <InfoRow icon={<UserMinus size={18} color={iconColor} />} label="Unfriend" textClass={primary} divider={divider} onPress={onUnfriend} />
                <InfoRow icon={<Flag size={18} color="#DC2626" />} label="Report" textClass="text-[#DC2626]" divider={divider} onPress={onReport} />
                <InfoRow icon={<Shield size={18} color="#DC2626" />} label="Block" textClass="text-[#DC2626]" divider={divider} onPress={onBlock} />
                <InfoRow icon={<Trash2 size={18} color="#DC2626" />} label="Delete chat" textClass="text-[#DC2626]" divider={divider} onPress={onDelete} last />
              </View>
            </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

function QuickAction({ label, icon, onPress, isDark }: { label: string; icon: ReactNode; onPress: () => void; isDark: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} className="items-center" style={{ width: 84 }} accessibilityLabel={label}>
      <View className={`items-center justify-center ${isDark ? 'bg-[#22324B]' : 'bg-[#EEF1F7]'}`} style={{ width: 46, height: 46, borderRadius: 23 }}>{icon}</View>
      <Text className={`mt-1.5 text-xs font-medium ${isDark ? 'text-[#CBD5E1]' : 'text-[#3B4763]'}`}>{label}</Text>
    </TouchableOpacity>
  );
}

// No chevron: none of these rows opens another screen. Toggles show a switch.
function InfoRow({
  icon,
  label,
  detail,
  textClass,
  secondaryClass,
  divider,
  onPress,
  trailing,
  last,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  textClass: string;
  secondaryClass?: string;
  divider: string;
  onPress?: () => void;
  trailing?: ReactNode;
  last?: boolean;
}) {
  return (
    <TouchableOpacity disabled={!onPress} onPress={onPress} activeOpacity={0.6} className={`flex-row items-center gap-3 px-4 py-3 ${last ? '' : `border-b ${divider}`}`}>
      {icon}
      <View className="flex-1">
        <Text className={`text-sm font-medium ${textClass}`}>{label}</Text>
        {detail ? <Text className={`mt-0.5 text-xs ${secondaryClass ?? ''}`}>{detail}</Text> : null}
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

export function ToggleSwitch({ value, onChange, isDark }: { value: boolean; onChange: () => void; isDark: boolean }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: isDark ? '#334155' : '#D0D5DD', true: '#93B4FF' }}
      thumbColor={value ? '#284BD6' : '#FFFFFF'}
      ios_backgroundColor={isDark ? '#334155' : '#D0D5DD'}
    />
  );
}
