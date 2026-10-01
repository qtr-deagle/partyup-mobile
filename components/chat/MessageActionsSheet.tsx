import { riseIn } from '@/components/ui/motion';
import { REACTION_EMOJIS, type ReactionEmoji } from '@/lib/social';
import { Reply, Trash2, Undo2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  isDark: boolean;
  preview: string;
  mine: boolean;
  myReaction: ReactionEmoji | null;
  onClose: () => void;
  onReact: (emoji: ReactionEmoji | null) => void;
  onReply: () => void;
  onUnsend: () => void;
  // Guild leaders/officers can remove other people's messages.
  onRemove?: () => void;
};

// Long-press menu for a message: a reaction row plus Reply / Unsend.
export function MessageActionsSheet({ visible, isDark, preview, mine, myReaction, onClose, onReact, onReply, onUnsend, onRemove }: Props) {
  const insets = useSafeAreaInsets();
  const group = isDark ? 'bg-[#18253C]' : 'bg-[#F3F5FA]';
  const primary = isDark ? 'text-white' : 'text-[#182847]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const iconColor = isDark ? '#E2E8F0' : '#182847';
  const divider = isDark ? 'border-[#22324B]' : 'border-[#E4E8F0]';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {visible ? (
          <Animated.View key="message-actions" entering={riseIn(0, 300)} className="px-4 pt-2.5" style={{ paddingBottom: insets.bottom + 12, backgroundColor: isDark ? '#111B2E' : '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <Pressable onPress={() => undefined}>
              <View className={`mb-3 h-1 w-9 self-center rounded-full ${isDark ? 'bg-[#334155]' : 'bg-[#D5DBE6]'}`} />
              <Text numberOfLines={2} className={`mb-3 px-1 text-center text-sm ${secondary}`}>{preview}</Text>

              <View className={`flex-row justify-between rounded-full px-3 py-2 ${group}`}>
                {REACTION_EMOJIS.map((emoji) => {
                  const chosen = myReaction === emoji;
                  return (
                    <TouchableOpacity
                      key={emoji}
                      onPress={() => onReact(chosen ? null : emoji)}
                      accessibilityLabel={chosen ? `Remove ${emoji} reaction` : `React with ${emoji}`}
                      className={`h-11 w-11 items-center justify-center rounded-full ${chosen ? (isDark ? 'bg-[#2A3B5C]' : 'bg-[#DCE3F5]') : ''}`}>
                      <Text style={{ fontSize: 26 }}>{emoji}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View className={`mt-3 overflow-hidden rounded-2xl ${group}`}>
                <ActionRow icon={<Reply size={18} color={iconColor} />} label="Reply" textClass={primary} divider={divider} onPress={onReply} last={!mine && !onRemove} />
                {mine ? <ActionRow icon={<Undo2 size={18} color="#DC2626" />} label="Unsend" textClass="text-[#DC2626]" divider={divider} onPress={onUnsend} last /> : null}
                {!mine && onRemove ? <ActionRow icon={<Trash2 size={18} color="#DC2626" />} label="Remove for everyone" textClass="text-[#DC2626]" divider={divider} onPress={onRemove} last /> : null}
              </View>
            </Pressable>
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

function ActionRow({ icon, label, textClass, divider, onPress, last }: { icon: ReactNode; label: string; textClass: string; divider: string; onPress: () => void; last?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} className={`flex-row items-center gap-3 px-4 py-3.5 ${last ? '' : `border-b ${divider}`}`}>
      {icon}
      <Text className={`flex-1 text-sm font-medium ${textClass}`}>{label}</Text>
    </TouchableOpacity>
  );
}
