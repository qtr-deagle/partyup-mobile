import { EmptyState } from '@/components/ui/motion';
import { formatClockTime, parseTimestamp } from '@/lib/datetime';
import { AUDIT_PAGE_SIZE, auditEventKind, describeAuditEvent, getGuildAuditLog, type GuildAuditEvent } from '@/lib/guildReports';
import { getTheme } from '@/lib/theme';
import { Flag, MessageSquareX, ScrollText, Settings2, Shield, Users, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  guildId: string;
};

const KIND_ICONS = { member: Users, role: Shield, settings: Settings2, chat: MessageSquareX, report: Flag };

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

// The Guild Leader's view of everything that happened in the guild. Written by
// the database, so nobody in the guild can edit it.
export function GuildAuditLogModal({ visible, onClose, isDark, guildId }: Props) {
  const insets = useSafeAreaInsets();
  const { primaryColor, primaryText, mutedText, mutedPanel } = getTheme(isDark);
  const [events, setEvents] = useState<GuildAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Show the spinner again each time it opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setLoading(true);
  }

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void getGuildAuditLog(guildId).then(({ data, error }) => {
      if (cancelled) return;
      setErrorMessage(error?.message ?? null);
      setEvents(data);
      setHasMore(data.length === AUDIT_PAGE_SIZE);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, guildId]);

  async function loadMore() {
    const oldest = events[events.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    const { data, error } = await getGuildAuditLog(guildId, oldest.created_at);
    setLoadingMore(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setEvents((current) => [...current, ...data]);
    setHasMore(data.length === AUDIT_PAGE_SIZE);
  }

  // Consecutive events on the same day share a heading.
  const groups: { label: string; items: GuildAuditEvent[] }[] = [];
  for (const event of events) {
    const label = dayLabel(parseTimestamp(event.created_at));
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(event);
    else groups.push({ label, items: [event] });
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} className="bg-black/55" onPress={onClose} />
        <View style={{ backgroundColor: isDark ? '#0F172A' : '#FFFFFF', paddingBottom: insets.bottom + 16, height: '88%' }} className="rounded-t-[32px] px-5 pt-5">
          <View className="flex-row items-center justify-between">
            <Text className={`text-headline-24 font-bold ${primaryText}`}>Audit Log</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" className={`h-9 w-9 items-center justify-center rounded-full ${mutedPanel}`}>
              <X size={18} color={isDark ? '#94A3B8' : '#6C7A95'} />
            </TouchableOpacity>
          </View>
          <Text className={`mt-1 text-xs ${mutedText}`}>Recorded automatically. Nobody in the guild can edit or delete it.</Text>

          {errorMessage ? (
            <View className="mt-3 rounded-xl bg-[#FEE2E2] px-4 py-3">
              <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
            </View>
          ) : null}

          {loading ? (
            <View key="loading" className="flex-1 items-center justify-center">
              <ActivityIndicator color={primaryColor} />
            </View>
          ) : events.length === 0 ? (
            <View key="empty" className="flex-1 justify-center">
              <EmptyState icon={<ScrollText size={34} color={primaryColor} />} title="Nothing logged yet" message="Joins, role changes, settings edits and reports will show up here." />
            </View>
          ) : (
            <ScrollView key="list" className="mt-3 flex-1" contentContainerClassName="pb-4">
              {groups.map((group) => (
                <View key={group.label} className="mb-4">
                  <Text className={`mb-2 text-xs font-bold uppercase tracking-wide ${mutedText}`}>{group.label}</Text>
                  <View className={`overflow-hidden rounded-2xl ${mutedPanel}`}>
                    {group.items.map((event, index) => {
                      const Icon = KIND_ICONS[auditEventKind(event.action)];
                      const excerpt = typeof event.metadata?.excerpt === 'string' && event.metadata.excerpt ? event.metadata.excerpt : null;
                      return (
                        <View key={event.id} className={`flex-row gap-3 px-3.5 py-3 ${index > 0 ? (isDark ? 'border-t border-[#22324B]' : 'border-t border-[#E4E8F0]') : ''}`}>
                          <View className="mt-0.5">
                            <Icon size={16} color={event.action.startsWith('report_') || event.action === 'member_removed' ? '#DC2626' : primaryColor} />
                          </View>
                          <View className="flex-1">
                            <Text className={`text-sm ${primaryText}`}>{describeAuditEvent(event)}</Text>
                            {excerpt ? (
                              <Text className={`mt-0.5 text-xs italic ${mutedText}`} numberOfLines={2}>
                                “{excerpt}”
                              </Text>
                            ) : null}
                            <Text className={`mt-0.5 text-[11px] ${mutedText}`}>
                              {formatClockTime(event.created_at)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
              {hasMore ? (
                <TouchableOpacity onPress={() => void loadMore()} disabled={loadingMore} className="items-center py-3">
                  {loadingMore ? <ActivityIndicator color={primaryColor} /> : <Text className="text-sm font-bold" style={{ color: primaryColor }}>Load older</Text>}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
