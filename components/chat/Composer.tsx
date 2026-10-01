import { riseIn } from '@/components/ui/motion';
import { Camera, ImageIcon, Send, X } from 'lucide-react-native';
import type { Ref } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

export const QUICK_REACTION = '👍';

type Props = {
  isDark: boolean;
  accent: string;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onQuickReaction: () => void;
  onPhoto: (source: 'camera' | 'library') => void;
  placeholder?: string;
  // "Replying to …" bar above the input.
  reply: { label: string; summary: string } | null;
  onCancelReply: () => void;
  inputRef?: Ref<TextInput>;
  bottomPadding?: number;
};

// Message box shared by direct, guild and trip chats: camera + gallery on the
// left, and a 👍 that turns into Send once there's text, like Messenger.
export function Composer({ isDark, accent, value, onChangeText, onSend, onQuickReaction, onPhoto, placeholder = 'Message', reply, onCancelReply, inputRef, bottomPadding = 12 }: Props) {
  const borderColor = isDark ? 'border-[#22324B]' : 'border-[#E7EAF2]';
  const panelBackground = isDark ? 'bg-[#111B2E]' : 'bg-[#F6F7FB]';
  const textPrimary = isDark ? 'text-white' : 'text-[#182847]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const canSend = value.trim().length > 0;

  return (
    <View>
      {reply ? (
        <Animated.View key="reply-bar" entering={riseIn(0, 200)} className={`flex-row items-center gap-3 border-t px-4 py-2 ${borderColor} ${panelBackground}`}>
          <View className="flex-1 border-l-2 pl-3" style={{ borderColor: accent }}>
            <Text className="text-xs font-semibold" style={{ color: accent }}>{reply.label}</Text>
            <Text numberOfLines={1} className={`text-sm ${textSecondary}`}>{reply.summary}</Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} accessibilityLabel="Cancel reply" hitSlop={10}>
            <X size={18} color={isDark ? '#94A3B8' : '#67748D'} />
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      <View className={`flex-row items-end gap-1 border-t px-3 pt-3 ${borderColor}`} style={{ paddingBottom: bottomPadding }}>
        <TouchableOpacity onPress={() => onPhoto('camera')} accessibilityLabel="Take a photo" hitSlop={6} className="h-11 w-9 items-center justify-center">
          <Camera size={23} color={accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onPhoto('library')} accessibilityLabel="Send a photo from gallery" hitSlop={6} className="mr-1 h-11 w-9 items-center justify-center">
          <ImageIcon size={23} color={accent} />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={1000}
          className={`max-h-28 flex-1 rounded-3xl border px-4 py-2.5 text-[15px] ${borderColor} ${panelBackground} ${textPrimary}`}
        />
        {canSend ? (
          <Animated.View key="send-button" entering={FadeIn.duration(150)}>
            <TouchableOpacity onPress={onSend} accessibilityLabel="Send" className="ml-1 h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: accent }}>
              <Send size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View key="like-button" entering={FadeIn.duration(150)}>
            <TouchableOpacity onPress={onQuickReaction} accessibilityLabel="Send a thumbs up" className="ml-1 h-11 w-11 items-center justify-center">
              <Text style={{ fontSize: 28 }}>{QUICK_REACTION}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}
