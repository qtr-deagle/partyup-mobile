import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { EmptyState, SkeletonRow } from '@/components/ui/motion';
import { Card, ScreenHeader } from '@/components/ui/screen-header';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { parseTimestamp } from '@/lib/datetime';
import { listMyTickets, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS, type SupportTicket, type TicketStatus } from '@/lib/support';
import { getTheme } from '@/lib/theme';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, LifeBuoy, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_STYLES: Record<TicketStatus, { bg: string; text: string }> = {
  open: { bg: 'bg-[#FEF3C7]', text: 'text-[#92400E]' },
  answered: { bg: 'bg-[#DBEAFE]', text: 'text-[#1E40AF]' },
  closed: { bg: 'bg-[#E5E7EB]', text: 'text-[#4B5563]' },
};

// Help & Reports: the traveler's support tickets, and a way to open one.
export default function SupportScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { primaryColor, screenBackground, primaryText, mutedText } = getTheme(isDark);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await listMyTickets();
    setErrorMessage(error?.message ?? null);
    setTickets(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View className={`flex-1 ${screenBackground}`}>
      <ScreenHeader title="Help & Reports" subtitle="Questions, problems and reports for the PartyUp team" />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-4 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={primaryColor} />}>
        <AnimatedPressable
          onPress={() => router.push('/support/new')}
          className="flex-row items-center justify-center gap-2 rounded-2xl bg-[#284BD6] py-4">
          <Plus size={18} color="#FFFFFF" />
          <Text className="text-base font-bold text-white">New ticket</Text>
        </AnimatedPressable>
        <Text className={`px-1 text-xs ${mutedText}`}>
          For an emergency, use SOS instead. Tickets are answered by the PartyUp team, usually within a day.
        </Text>

        {errorMessage ? (
          <View className="rounded-xl bg-[#FEE2E2] px-4 py-3">
            <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
          </View>
        ) : null}

        {loading ? (
          <Card key="loading">
            {[0, 1, 2].map((index) => (
              <SkeletonRow key={index} />
            ))}
          </Card>
        ) : tickets.length === 0 ? (
          <EmptyState
            key="empty"
            icon={<LifeBuoy size={34} color="#2A55D4" />}
            title="No tickets yet"
            message="Report a problem, ask about your account or payments, or tell us about a bug."
          />
        ) : (
          tickets.map((ticket, index) => {
            const status = STATUS_STYLES[ticket.status];
            return (
              <Card key={ticket.id} index={index}>
                <AnimatedPressable
                  onPress={() => router.push({ pathname: '/support/[id]', params: { id: ticket.id } })}
                  scaleTo={0.98}
                  className="flex-row items-center gap-3"
                  accessibilityLabel={`Open ticket ${ticket.subject}`}>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      {ticket.user_unread ? <View className="h-2 w-2 rounded-full bg-[#DC2626]" /> : null}
                      <Text className={`shrink text-base font-bold ${primaryText}`} numberOfLines={1}>
                        {ticket.subject}
                      </Text>
                    </View>
                    <Text className={`mt-0.5 text-xs ${mutedText}`}>
                      {TICKET_CATEGORY_LABELS[ticket.category]} · {parseTimestamp(ticket.last_message_at).toLocaleDateString()}
                    </Text>
                    <View className={`mt-2 self-start rounded-full px-2.5 py-1 ${status.bg}`}>
                      <Text className={`text-[11px] font-bold ${status.text}`}>{TICKET_STATUS_LABELS[ticket.status]}</Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={isDark ? '#64748B' : '#94A3B8'} />
                </AnimatedPressable>
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
