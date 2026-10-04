import { parseTimestamp } from '@/lib/datetime';
import type { ChatMessage, MessageStatus } from '@/lib/social';
import { Image } from 'expo-image';
import { AlertCircle, Check, CheckCheck, Clock3, Reply } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export const SEEN_COLOR = '#7DD3FC';
const PHOTO_WIDTH = 220;

export function formatTime(value: string | null) {
  return value ? parseTimestamp(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : '';
}

// One-line text for a message when quoted, previewed or listed.
export function messageSummary(message: Pick<ChatMessage, 'message_type' | 'body' | 'deleted_at'>) {
  if (message.deleted_at) return 'Unsent message';
  if (message.message_type === 'image') return '📷 Photo';
  if (message.message_type === 'location') return '📍 Location';
  return message.body;
}

export function StatusTick({ status, color, size = 14 }: { status: MessageStatus; color: string; size?: number }) {
  if (status === 'sending') return <Clock3 size={size - 2} color={color} />;
  if (status === 'failed') return <AlertCircle size={size} color="#FCA5A5" />;
  if (status === 'sent') return <Check size={size} color={color} strokeWidth={2.5} />;
  return <CheckCheck size={size} color={status === 'seen' ? SEEN_COLOR : color} strokeWidth={2.5} />;
}

// Sent on its own, these render big with no bubble, like Messenger's 👍.
const BIG_EMOJI = new Set(['👍', '❤️', '😆', '😮', '😢', '😡']);

type Props = {
  message: ChatMessage;
  mine: boolean;
  isDark: boolean;
  // My bubble color; guild chats use the guild's color.
  accent?: string;
  status: MessageStatus | null;
  // Pending photos show the local file until the upload finishes.
  photoUri?: string;
  replyTo: ChatMessage | null;
  replyLabel: string | null;
  reactions: { emoji: string; count: number }[];
  onLongPress: () => void;
  onPress: () => void;
  onPressReply: () => void;
};

export function MessageBubble({ message, mine, isDark, accent = '#284BD6', status, photoUri, replyTo, replyLabel, reactions, onLongPress, onPress, onPressReply }: Props) {
  const failed = status === 'failed';
  const unsent = Boolean(message.deleted_at);
  const isPhoto = message.message_type === 'image' && !unsent;
  const bigEmoji = !unsent && message.message_type === 'text' && BIG_EMOJI.has(message.body.trim());
  const borderColor = isDark ? 'border-[#22324B]' : 'border-[#E7EAF2]';
  const textSecondary = isDark ? 'text-[#94A3B8]' : 'text-[#67748D]';
  const plain = isPhoto || bigEmoji || unsent;

  const aspect = message.image_width && message.image_height ? message.image_height / message.image_width : 1;
  const photoHeight = Math.min(Math.max(PHOTO_WIDTH * aspect, 120), 320);

  const time = (
    <View className={`mt-1 flex-row items-center gap-1 ${mine ? 'justify-end' : ''}`}>
      <Text className={`text-[11px] ${mine && !plain ? 'text-white/70' : textSecondary}`}>{formatTime(message.created_at)}</Text>
      {status ? <StatusTick status={status} color={mine && !plain ? 'rgba(255,255,255,0.7)' : isDark ? '#94A3B8' : '#67748D'} /> : null}
    </View>
  );

  return (
    <View className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'}`}>
      {replyTo && replyLabel ? (
        <Pressable onPress={onPressReply} className={`mb-0.5 ${mine ? 'items-end' : 'items-start'}`}>
          <View className="mb-1 flex-row items-center gap-1 px-1">
            <Reply size={12} color={isDark ? '#94A3B8' : '#67748D'} />
            <Text className={`text-[11px] ${textSecondary}`}>{replyLabel}</Text>
          </View>
          <View className="rounded-[18px] px-3.5 py-2" style={{ backgroundColor: isDark ? '#152033' : '#E9ECF3', opacity: 0.75 }}>
            <Text numberOfLines={2} className={`text-sm ${textSecondary}`}>{messageSummary(replyTo)}</Text>
          </View>
        </Pressable>
      ) : null}

      <Pressable onLongPress={unsent ? undefined : onLongPress} onPress={onPress} delayLongPress={300}>
        {unsent ? (
          <View className={`rounded-[22px] border px-4 py-2.5 ${borderColor}`}>
            <Text className={`text-sm italic ${textSecondary}`}>
              {message.deleted_by && message.deleted_by !== message.sender_id ? 'Message removed' : mine ? 'You unsent a message' : 'Message unsent'}
            </Text>
          </View>
        ) : isPhoto ? (
          <View className="overflow-hidden rounded-[22px]" style={{ width: PHOTO_WIDTH, height: photoHeight, opacity: failed ? 0.6 : 1, backgroundColor: isDark ? '#1E2A40' : '#E9ECF3' }}>
            {photoUri ? <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} /> : null}
            {status === 'sending' ? (
              <View className="absolute inset-0 items-center justify-center bg-black/30">
                <ActivityIndicator color="#FFFFFF" />
              </View>
            ) : null}
          </View>
        ) : bigEmoji ? (
          <Text style={{ fontSize: 44, lineHeight: 52, opacity: failed ? 0.6 : 1 }}>{message.body.trim()}</Text>
        ) : (
          <View
            className="px-4 py-2.5"
            style={{
              backgroundColor: mine ? accent : isDark ? '#1A2539' : '#F0F2F7',
              opacity: failed ? 0.6 : 1,
              borderRadius: 22,
              ...(mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }),
            }}>
            <Text className="text-[15.5px] leading-[21px]" style={{ color: mine ? '#FFFFFF' : isDark ? '#F1F5F9' : '#182847' }}>{message.body}</Text>
            {time}
          </View>
        )}
        {reactions.length ? (
          <View className={`-mt-2 flex-row items-center gap-0.5 self-end rounded-full border px-1.5 py-0.5 ${isDark ? 'border-[#0B1220] bg-[#22324B]' : 'border-white bg-[#EEF1F7]'}`} style={{ borderWidth: 2 }}>
            {reactions.map((reaction) => <Text key={reaction.emoji} style={{ fontSize: 13 }}>{reaction.emoji}</Text>)}
            {reactions.reduce((sum, reaction) => sum + reaction.count, 0) > 1 ? (
              <Text className={`ml-0.5 text-[11px] font-semibold ${textSecondary}`}>{reactions.reduce((sum, reaction) => sum + reaction.count, 0)}</Text>
            ) : null}
          </View>
        ) : null}
        {plain && !unsent ? time : null}
      </Pressable>
    </View>
  );
}
