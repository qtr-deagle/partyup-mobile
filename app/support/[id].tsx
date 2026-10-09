import { ScreenHeader } from '@/components/ui/screen-header';
import { usePersistentText } from '@/hooks/use-unsaved-changes';
import { enterFromBelow } from '@/components/ui/motion';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';
import { formatDateTime, parseTimestamp } from '@/lib/datetime';
import {
  closeTicket,
  getTicket,
  getTicketPhotoUrls,
  markTicketRead,
  replyToTicket,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  type SupportTicket,
  type TicketMessage,
} from '@/lib/support';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { getTheme } from '@/lib/theme';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { LifeBuoy, Send } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
// One support ticket: the conversation with the PartyUp team, live.
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { primaryColor, screenBackground, primaryText, mutedText, mutedPanel, softBorder } = getTheme(isDark);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Unsent reply is kept per ticket.
  const [draft, setDraft] = usePersistentText(id ? `ticket-reply:${id}` : null);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const apply = useCallback((result: Awaited<ReturnType<typeof getTicket>>) => {
    setErrorMessage(result.error?.message ?? null);
    setTicket(result.ticket);
    setMessages(result.messages);
    setLoading(false);
    if (result.ticket?.user_unread) void markTicketRead(result.ticket.id);
  }, []);

  const reload = useCallback(async () => {
    if (id) apply(await getTicket(id));
  }, [id, apply]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void getTicket(id).then((result) => {
      if (cancelled) return;
      apply(result);
      void getTicketPhotoUrls(result.ticket?.evidence_paths ?? []).then((urls) => {
        if (!cancelled) setPhotos(urls);
      });
    });
    const channel = supabase
      .channel(uniqueChannelName(`support-ticket:${id}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages', filter: `ticket_id=eq.${id}` }, () => void reload())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets', filter: `id=eq.${id}` }, () => void reload())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [id, apply, reload]);

  async function send() {
    if (!ticket || !draft.trim()) return;
    setSending(true);
    const { error } = await replyToTicket(ticket.id, draft);
    setSending(false);
    if (error) {
      showAlert('Could not send', error.message);
      return;
    }
    setDraft('');
    await reload();
  }

  function confirmClose() {
    if (!ticket) return;
    showAlert('Close this ticket?', 'You can reply later to reopen it.', [
      { text: 'Keep open', style: 'cancel' },
      {
        text: 'Close ticket',
        style: 'destructive',
        onPress: async () => {
          const { error } = await closeTicket(ticket.id);
          if (error) showAlert('Could not close', error.message);
          else await reload();
        },
      },
    ]);
  }

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScreenHeader
        title={ticket?.subject ?? 'Ticket'}
        subtitle={ticket ? `${TICKET_CATEGORY_LABELS[ticket.category]} · ${TICKET_STATUS_LABELS[ticket.status]}` : undefined}
        right={
          ticket && ticket.status !== 'closed' ? (
            <TouchableOpacity onPress={confirmClose} className={`rounded-full border px-3 py-1.5 ${softBorder}`}>
              <Text className={`text-xs font-bold ${primaryText}`}>Close</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {loading ? (
        <View key="loading" className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : !ticket ? (
        <View key="missing" className="flex-1 items-center justify-center px-6">
          <Text className={`text-center text-sm ${mutedText}`}>{errorMessage ?? 'This ticket could not be found.'}</Text>
        </View>
      ) : (
        <View key="thread" className="flex-1">
          <ScrollView
            ref={scrollRef}
            className="flex-1"
            contentContainerClassName="gap-3 px-4 pt-4 pb-4"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {photos.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {photos.map((url) => (
                  <Image key={url} source={{ uri: url }} style={{ width: 72, height: 72, borderRadius: 12 }} contentFit="cover" />
                ))}
              </ScrollView>
            ) : null}
            {messages.map((message, index) => (
              <Animated.View
                key={message.id}
                entering={enterFromBelow(index)}
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${message.from_staff ? `self-start ${mutedPanel}` : 'self-end bg-[#284BD6]'}`}>
                {message.from_staff ? (
                  <View className="mb-1 flex-row items-center gap-1">
                    <LifeBuoy size={12} color={primaryColor} />
                    <Text className="text-[11px] font-bold" style={{ color: primaryColor }}>
                      PartyUp support
                    </Text>
                  </View>
                ) : null}
                <Text className={`text-[15px] leading-5 ${message.from_staff ? primaryText : 'text-white'}`}>{message.body}</Text>
                <Text className={`mt-1 text-[10px] ${message.from_staff ? mutedText : 'text-white/70'}`}>{formatDateTime(message.created_at)}</Text>
              </Animated.View>
            ))}
            {ticket.status === 'open' && !messages.some((message) => message.from_staff) ? (
              <Text className={`text-center text-xs ${mutedText}`}>The PartyUp team will reply here. We&apos;ll notify you.</Text>
            ) : null}
          </ScrollView>

          <View
            className={`flex-row items-end gap-2 border-t px-3 pt-2 ${softBorder}`}
            style={{ paddingBottom: keyboardHeight > 0 ? keyboardHeight + 8 : insets.bottom + 8 }}>
            <TextInput
              className={`max-h-32 flex-1 rounded-2xl border px-4 py-2.5 text-base ${softBorder} ${primaryText}`}
              placeholder={ticket.status === 'closed' ? 'Reply to reopen this ticket' : 'Write a reply'}
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
              multiline
              maxLength={2000}
              value={draft}
              onChangeText={setDraft}
            />
            <TouchableOpacity
              onPress={() => void send()}
              disabled={sending || !draft.trim()}
              accessibilityLabel="Send reply"
              className="h-11 w-11 items-center justify-center rounded-full bg-[#284BD6]"
              style={{ opacity: sending || !draft.trim() ? 0.5 : 1 }}>
              {sending ? <ActivityIndicator color="#FFFFFF" /> : <Send size={18} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
