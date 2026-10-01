import { riseIn } from '@/components/ui/motion';
import { Image } from 'expo-image';
import { Bell, BellOff, ChevronRight, ExternalLink, Pin, PinOff } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type GroupMember = { userId: string; name: string; avatarUrl?: string | null; label?: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  avatar: ReactNode;
  title: string;
  subtitle: string;
  members: GroupMember[];
  photos: { key: string; url: string }[];
  muted: boolean;
  pinned: boolean;
  pinnable: boolean;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onOpenPhoto: (url: string) => void;
  onOpenMember: (member: GroupMember) => void;
  // e.g. "View trip details" / "View guild".
  link?: { label: string; onPress: () => void };
};

// "Chat info" for a guild or trip group chat.
export function GroupInfoSheet({ visible, onClose, isDark, avatar, title, subtitle, members, photos, muted, pinned, pinnable, onToggleMute, onTogglePin, onOpenPhoto, onOpenMember, link }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const tile = Math.floor((windowWidth - 32 - 8) / 3);
  const group = isDark ? 'bg-[#18253C]' : 'bg-[#F3F5FA]';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const iconColor = isDark ? '#E2E8F0' : '#182847';
  const divider = isDark ? 'border-[#22324B]' : 'border-[#E4E8F0]';
  const heading = `mb-2 ml-1 mt-4 text-[11px] font-bold uppercase tracking-wider ${secondary}`;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {visible ? (
          <Animated.View key="group-info-sheet" entering={riseIn(0, 360)} className="px-4 pt-2.5" style={{ paddingBottom: insets.bottom + 12, backgroundColor: isDark ? '#111B2E' : '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: windowHeight * 0.88 }}>
            <View className={`mb-3 h-1 w-9 self-center rounded-full ${isDark ? 'bg-[#334155]' : 'bg-[#D5DBE6]'}`} />
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <Pressable onPress={() => undefined}>
                <View className="items-center">
                  {avatar}
                  <Text numberOfLines={2} className={`mt-2.5 text-center text-lg font-bold ${primary}`}>{title}</Text>
                  <Text className={`mt-0.5 text-sm ${secondary}`}>{subtitle}</Text>
                </View>

                {photos.length ? (
                  <>
                    <Text className={heading}>Shared photos</Text>
                    <View className="flex-row flex-wrap" style={{ gap: 4 }}>
                      {photos.slice(0, 6).map((photo) => (
                        <TouchableOpacity key={photo.key} onPress={() => onOpenPhoto(photo.url)} accessibilityLabel="Open shared photo" activeOpacity={0.8}>
                          <Image source={{ uri: photo.url }} style={{ width: tile, height: tile, borderRadius: 10 }} contentFit="cover" transition={200} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : null}

                <Text className={heading}>Actions</Text>
                <View className={`overflow-hidden rounded-2xl ${group}`}>
                  <Row icon={muted ? <Bell size={18} color={iconColor} /> : <BellOff size={18} color={iconColor} />} label={muted ? 'Unmute notifications' : 'Mute notifications'} textClass={primary} divider={divider} onPress={onToggleMute} last={!pinnable && !link} />
                  {pinnable ? <Row icon={pinned ? <PinOff size={18} color={iconColor} /> : <Pin size={18} color={iconColor} />} label={pinned ? 'Unpin chat' : 'Pin chat'} textClass={primary} divider={divider} onPress={onTogglePin} last={!link} /> : null}
                  {link ? <Row icon={<ExternalLink size={18} color={iconColor} />} label={link.label} textClass={primary} divider={divider} onPress={link.onPress} last /> : null}
                </View>

                <Text className={heading}>{members.length} {members.length === 1 ? 'member' : 'members'}</Text>
                <View className={`overflow-hidden rounded-2xl ${group}`}>
                  {members.map((member, index) => (
                    <TouchableOpacity key={member.userId} onPress={() => onOpenMember(member)} activeOpacity={0.6} className={`flex-row items-center gap-3 px-4 py-2.5 ${index === members.length - 1 ? '' : `border-b ${divider}`}`}>
                      {member.avatarUrl ? (
                        <Image source={{ uri: member.avatarUrl }} style={{ width: 34, height: 34, borderRadius: 17 }} transition={200} />
                      ) : (
                        <View className="items-center justify-center rounded-full bg-[#B7C4EC]" style={{ width: 34, height: 34 }}>
                          <Text className="text-sm font-bold text-[#24314A]">{member.name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text numberOfLines={1} className={`flex-1 text-sm font-medium ${primary}`}>{member.name}</Text>
                      {member.label ? <Text className={`text-xs font-semibold ${secondary}`}>{member.label}</Text> : null}
                      <ChevronRight size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ))}
                </View>
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

function Row({ icon, label, textClass, divider, onPress, last }: { icon: ReactNode; label: string; textClass: string; divider: string; onPress: () => void; last?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} className={`flex-row items-center gap-3 px-4 py-3 ${last ? '' : `border-b ${divider}`}`}>
      {icon}
      <Text className={`flex-1 text-sm font-medium ${textClass}`}>{label}</Text>
      <ChevronRight size={18} color="#94A3B8" />
    </TouchableOpacity>
  );
}
