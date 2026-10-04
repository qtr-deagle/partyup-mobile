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
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const canSend = value.trim().length > 0;

  return (
    <View>
      {reply ? (
        <Animated.View key="reply-bar" entering={riseIn(0, 200)} className="mx-3 mt-2 flex-row items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ backgroundColor: isDark ? '#18253C' : '#F0F2F7' }}>
          <View className="flex-1 border-l-2 pl-3" style={{ borderColor: accent }}>
            <Text className="text-xs font-semibold" style={{ color: accent }}>{reply.label}</Text>
            <Text numberOfLines={1} className={`text-sm ${textSecondary}`}>{reply.summary}</Text>
          </View>
          <TouchableOpacity onPress={onCancelReply} accessibilityLabel="Cancel reply" hitSlop={10}>
            <X size={18} color={isDark ? '#94A3B8' : '#67748D'} />
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      <View className="flex-row items-end gap-2 px-3 pt-2.5" style={{ paddingBottom: bottomPadding, backgroundColor: isDark ? '#0B1220' : '#FFFFFF' }}>
        <View className="min-h-[44px] flex-1 flex-row items-end rounded-[24px] pl-1.5 pr-3" style={{ backgroundColor: isDark ? '#18253C' : '#F0F2F7' }}>
          <TouchableOpacity onPress={() => onPhoto('camera')} accessibilityLabel="Take a photo" hitSlop={6} className="h-11 w-9 items-center justify-center">
            <Camera size={21} color={accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onPhoto('library')} accessibilityLabel="Send a photo from gallery" hitSlop={6} className="h-11 w-8 items-center justify-center">
            <ImageIcon size={21} color={accent} />
          </TouchableOpacity>
          <View className="flex-1 justify-center">
            {/* Multiline inputs wrap their placeholder, so a long chat name
                ("Message San Jose del Monte Convoy") would grow the box to two
                lines. Draw the hint ourselves, clipped to one line. */}
            {value ? null : (
              <Text
                pointerEvents="none"
                numberOfLines={1}
                className="absolute left-0 right-0 pl-1.5 text-[15px]"
                style={{ color: isDark ? '#64748B' : '#94A3B8' }}>
                {placeholder}
              </Text>
            )}
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              accessibilityLabel={placeholder}
              multiline
              maxLength={1000}
              className="max-h-28 py-3 pl-1.5 text-[15px]"
              style={{ color: isDark ? '#FFFFFF' : '#182847' }}
            />
          </View>
        </View>
        {canSend ? (
          <Animated.View key="send-button" entering={FadeIn.duration(150)}>
            <TouchableOpacity onPress={onSend} accessibilityLabel="Send" className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
              <Send size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <Animated.View key="like-button" entering={FadeIn.duration(150)}>
            <TouchableOpacity onPress={onQuickReaction} accessibilityLabel="Send a thumbs up" className="h-11 w-11 items-center justify-center">
              <Text style={{ fontSize: 26 }}>{QUICK_REACTION}</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
}
