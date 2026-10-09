import { ToggleSwitch } from '@/components/ChatInfoSheet';
import { riseIn } from '@/components/ui/motion';
import { mutedUntilLabel } from '@/lib/chatMute';
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
  /** When a timed mute ends; null while muted means until turned back on. */
  mutedUntil?: string | null;
  pinned: boolean;
  pinnable: boolean;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onOpenPhoto: (url: string) => void;
  onOpenMember: (member: GroupMember) => void;
  // e.g. "View trip details" / "View guild".
  link?: { label: string; onPress: () => void };
  // Extra rows, e.g. friend groups: Edit group, Add people, Leave group.
  extraActions?: InfoAction[];
};

export type InfoAction = { key: string; icon: ReactNode; label: string; onPress: () => void; destructive?: boolean };

// "Chat info" for a guild or trip group chat.
export function GroupInfoSheet({ visible, onClose, isDark, avatar, title, subtitle, members, photos, muted, mutedUntil, pinned, pinnable, onToggleMute, onTogglePin, onOpenPhoto, onOpenMember, link, extraActions = [] }: Props) {
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

                {extraActions.filter((action) => !action.destructive).length ? (
                  <>
                    <Text className={heading}>Group</Text>
                    <View className={`overflow-hidden rounded-2xl ${group}`}>
                      {extraActions.filter((action) => !action.destructive).map((action, index, list) => (
                        <Row key={action.key} icon={action.icon} label={action.label} textClass={primary} divider={divider} onPress={action.onPress} chevron last={index === list.length - 1} />
                      ))}
                    </View>
                  </>
                ) : null}

                <Text className={heading}>Actions</Text>
                <View className={`overflow-hidden rounded-2xl ${group}`}>
                  <Row
                    icon={muted ? <BellOff size={18} color={iconColor} /> : <Bell size={18} color={iconColor} />}
                    label="Mute notifications"
                    detail={muted ? mutedUntilLabel(mutedUntil) : undefined}
                    secondaryClass={secondary}
                    textClass={primary}
                    divider={divider}
                    onPress={onToggleMute}
                    trailing={<ToggleSwitch value={muted} onChange={onToggleMute} isDark={isDark} />}
                    last={!pinnable && !link}
                  />
                  {pinnable ? (
                    <Row
                      icon={pinned ? <Pin size={18} color={iconColor} /> : <PinOff size={18} color={iconColor} />}
                      label="Pin chat"
                      detail={pinned ? 'Kept at the top of your chats' : undefined}
                      secondaryClass={secondary}
                      textClass={primary}
                      divider={divider}
                      onPress={onTogglePin}
                      trailing={<ToggleSwitch value={pinned} onChange={onTogglePin} isDark={isDark} />}
                      last={!link}
                    />
                  ) : null}
                  {link ? <Row icon={<ExternalLink size={18} color={iconColor} />} label={link.label} textClass={primary} divider={divider} onPress={link.onPress} chevron last /> : null}
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

                {extraActions.filter((action) => action.destructive).length ? (
                  <View className={`mt-4 overflow-hidden rounded-2xl ${group}`}>
                    {extraActions.filter((action) => action.destructive).map((action, index, list) => (
                      <Row key={action.key} icon={action.icon} label={action.label} textClass="text-[#E32727]" divider={divider} onPress={action.onPress} last={index === list.length - 1} />
                    ))}
                  </View>
                ) : null}
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

// A chevron only on rows that open something (a screen or sheet); toggles
// show a switch, one-off actions (Leave group) show nothing.
function Row({
  icon,
  label,
  detail,
  textClass,
  secondaryClass,
  divider,
  onPress,
  trailing,
  chevron,
  last,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  textClass: string;
  secondaryClass?: string;
  divider: string;
  onPress: () => void;
  trailing?: ReactNode;
  chevron?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} className={`flex-row items-center gap-3 px-4 py-3 ${last ? '' : `border-b ${divider}`}`}>
      {icon}
      <View className="flex-1">
        <Text className={`text-sm font-medium ${textClass}`}>{label}</Text>
        {detail ? <Text className={`mt-0.5 text-xs ${secondaryClass ?? ''}`}>{detail}</Text> : null}
      </View>
      {trailing}
      {chevron ? <ChevronRight size={18} color="#94A3B8" /> : null}
    </TouchableOpacity>
  );
}
