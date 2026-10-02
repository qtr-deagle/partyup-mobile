import { Segmented } from '@/components/guild/LeaderboardPanel';
import { EmptyState, enterFromBelow } from '@/components/ui/motion';
import { parseTimestamp } from '@/lib/datetime';
import {
  escalateGuildReport,
  ESCALATION_REASON_LABELS,
  getGuildReportPhotoUrls,
  GUILD_REPORT_CATEGORY_LABELS,
  listGuildReports,
  resolveGuildReport,
  type GuildReport,
} from '@/lib/guildReports';
import { getTheme } from '@/lib/theme';
import { Image } from 'expo-image';
import { CheckCircle2, Flag, Send, X, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
  guildId: string;
  // Lets the panel refresh its open-report count.
  onChanged: (openCount: number) => void;
};

type Action = 'resolved' | 'dismissed' | 'escalate';

const ACTION_COPY: Record<Action, { title: string; placeholder: string; confirm: string }> = {
  resolved: { title: 'Mark as resolved', placeholder: 'What did you do? (optional, the reporter sees this)', confirm: 'Resolve' },
  dismissed: { title: 'Dismiss report', placeholder: 'Why? (optional, the reporter sees this)', confirm: 'Dismiss' },
  escalate: { title: 'Escalate to PartyUp admins', placeholder: 'Anything admins should know? (optional)', confirm: 'Escalate' },
};

// The Guild Leader's list of guild reports: resolve, dismiss or escalate.
export function GuildReportsInbox({ visible, onClose, isDark, guildId, onChanged }: Props) {
  const insets = useSafeAreaInsets();
  const { primaryColor, primaryText, mutedText, mutedPanel, softBorder } = getTheme(isDark);
  const [reports, setReports] = useState<GuildReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<'open' | 'handled'>('open');
  const [acting, setActing] = useState<{ id: string; action: Action } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // A ref so an inline onChanged from the parent doesn't re-trigger loading.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });

  // Fresh state each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setLoading(true);
      setActing(null);
    }
  }

  const applyResult = useCallback(({ data, error }: Awaited<ReturnType<typeof listGuildReports>>) => {
    setErrorMessage(error?.message ?? null);
    setReports(data);
    setLoading(false);
    if (!error) onChangedRef.current(data.filter((report) => report.status === 'open').length);
  }, []);

  async function load() {
    applyResult(await listGuildReports(guildId));
  }

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void listGuildReports(guildId).then((result) => {
      if (!cancelled) applyResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, guildId, applyResult]);

  async function confirmAction() {
    if (!acting) return;
    setBusy(true);
    const { error } = acting.action === 'escalate' ? await escalateGuildReport(acting.id, note) : await resolveGuildReport(acting.id, acting.action, note);
    setBusy(false);
    if (error) {
      Alert.alert('Could not update the report', error.message);
      return;
    }
    setActing(null);
    setNote('');
    await load();
  }

  const shown = reports.filter((report) => (tab === 'open' ? report.status === 'open' : report.status !== 'open'));
  const openCount = reports.filter((report) => report.status === 'open').length;

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} className="bg-black/55" onPress={onClose} />
        <View style={{ backgroundColor: isDark ? '#0F172A' : '#FFFFFF', paddingBottom: insets.bottom + 16, height: '88%' }} className="rounded-t-[32px] px-5 pt-5">
          <View className="flex-row items-center justify-between">
            <Text className={`text-headline-24 font-bold ${primaryText}`}>Guild Reports</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" className={`h-9 w-9 items-center justify-center rounded-full ${mutedPanel}`}>
              <X size={18} color={isDark ? '#94A3B8' : '#6C7A95'} />
            </TouchableOpacity>
          </View>
          <Text className={`mt-1 text-xs ${mutedText}`}>
            Members report problems here. Problems with you as leader go to PartyUp support instead.
          </Text>
          <View className="mt-3">
            <Segmented
              isDark={isDark}
              options={[
                { id: 'open', label: openCount > 0 ? `Open • ${openCount}` : 'Open' },
                { id: 'handled', label: 'Handled' },
              ]}
              value={tab}
              onChange={(value) => setTab(value as 'open' | 'handled')}
              small
            />
          </View>

          {errorMessage ? (
            <View className="mt-3 rounded-xl bg-[#FEE2E2] px-4 py-3">
              <Text className="text-sm text-[#B91C1C]">{errorMessage}</Text>
            </View>
          ) : null}

          {loading ? (
            <View key="loading" className="flex-1 items-center justify-center">
              <ActivityIndicator color={primaryColor} />
            </View>
          ) : shown.length === 0 ? (
            <View key="empty" className="flex-1 justify-center">
              <EmptyState
                icon={<Flag size={34} color={primaryColor} />}
                title={tab === 'open' ? 'No open reports' : 'Nothing handled yet'}
                message={tab === 'open' ? 'When a member reports a problem, it shows up here.' : 'Resolved, dismissed and escalated reports show up here.'}
              />
            </View>
          ) : (
            <ScrollView key="list" className="mt-3 flex-1" contentContainerClassName="gap-3 pb-4" keyboardShouldPersistTaps="handled">
              {shown.map((report, index) => (
                <Animated.View key={report.id} entering={enterFromBelow(index)} className={`rounded-2xl border p-4 ${softBorder}`}>
                  <View className="flex-row items-center gap-2">
                    <View className={`rounded-full px-2.5 py-1 ${report.category === 'safety' ? 'bg-[#FEE2E2]' : mutedPanel}`}>
                      <Text className={`text-[11px] font-black ${report.category === 'safety' ? 'text-[#B91C1C]' : primaryText}`}>
                        {GUILD_REPORT_CATEGORY_LABELS[report.category].toUpperCase()}
                      </Text>
                    </View>
                    <Text className={`flex-1 text-right text-xs ${mutedText}`}>{parseTimestamp(report.created_at).toLocaleString()}</Text>
                  </View>

                  <Text className={`mt-2 text-xs ${mutedText}`}>
                    From {report.anonymous ? 'Anonymous' : (report.reporter_name ?? 'a member')}
                    {report.reported_user_id ? ` · About ${report.reported_name ?? 'a former member'}` : ''}
                  </Text>
                  <Text className={`mt-1.5 text-sm ${primaryText}`}>{report.details}</Text>

                  {report.message_excerpt ? (
                    <View className={`mt-2 rounded-xl px-3 py-2 ${mutedPanel}`}>
                      <Text className={`text-[11px] font-bold ${mutedText}`}>REPORTED MESSAGE</Text>
                      <Text className={`text-sm ${primaryText}`} numberOfLines={4}>
                        {report.message_excerpt || 'Photo or removed message'}
                      </Text>
                    </View>
                  ) : null}

                  <EvidencePhotos paths={report.evidence_paths} />

                  {report.status !== 'open' ? (
                    <View className={`mt-3 rounded-xl px-3 py-2 ${mutedPanel}`}>
                      <Text className={`text-xs font-bold ${primaryText}`}>
                        {report.status === 'escalated'
                          ? report.escalation_reason
                            ? ESCALATION_REASON_LABELS[report.escalation_reason]
                            : 'Sent to admins'
                          : `${report.status === 'resolved' ? 'Resolved' : 'Dismissed'}${report.handled_by_name ? ` by ${report.handled_by_name}` : ''}`}
                      </Text>
                      {report.resolution_note ? <Text className={`mt-0.5 text-xs ${mutedText}`}>{report.resolution_note}</Text> : null}
                    </View>
                  ) : acting?.id === report.id ? (
                    <View key="acting" className="mt-3">
                      <Text className={`text-sm font-bold ${primaryText}`}>{ACTION_COPY[acting.action].title}</Text>
                      <TextInput
                        className={`mt-2 min-h-[64px] rounded-xl border px-3 py-2 text-sm ${softBorder} ${primaryText}`}
                        placeholder={ACTION_COPY[acting.action].placeholder}
                        placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                        multiline
                        maxLength={500}
                        value={note}
                        onChangeText={setNote}
                      />
                      <View className="mt-2 flex-row gap-2">
                        <TouchableOpacity onPress={() => setActing(null)} disabled={busy} className={`flex-1 items-center rounded-xl border py-2.5 ${softBorder}`}>
                          <Text className={`text-sm font-bold ${primaryText}`}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => void confirmAction()}
                          disabled={busy}
                          className="flex-1 items-center rounded-xl py-2.5"
                          style={{ backgroundColor: acting.action === 'escalate' ? '#E32727' : '#284BD6' }}>
                          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-sm font-bold text-white">{ACTION_COPY[acting.action].confirm}</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View key="actions" className="mt-3 flex-row gap-2">
                      <ActionButton label="Resolve" icon={<CheckCircle2 size={14} color="#059669" />} border={softBorder} textClass={primaryText} onPress={() => { setNote(''); setActing({ id: report.id, action: 'resolved' }); }} />
                      <ActionButton label="Dismiss" icon={<XCircle size={14} color={isDark ? '#94A3B8' : '#64748B'} />} border={softBorder} textClass={primaryText} onPress={() => { setNote(''); setActing({ id: report.id, action: 'dismissed' }); }} />
                      <ActionButton label="Escalate" icon={<Send size={14} color="#DC2626" />} border={softBorder} textClass="text-[#DC2626]" onPress={() => { setNote(''); setActing({ id: report.id, action: 'escalate' }); }} />
                    </View>
                  )}
                </Animated.View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({ label, icon, border, textClass, onPress }: { label: string; icon: ReactNode; border: string; textClass: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2.5 ${border}`}>
      {icon}
      <Text className={`text-xs font-bold ${textClass}`}>{label}</Text>
    </TouchableOpacity>
  );
}

function EvidencePhotos({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const key = paths.join('|');

  useEffect(() => {
    let cancelled = false;
    if (!key) return;
    void getGuildReportPhotoUrls(key.split('|')).then((result) => {
      if (!cancelled) setUrls(result);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  if (urls.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2" contentContainerClassName="gap-2">
      {urls.map((url) => (
        <Image key={url} source={{ uri: url }} style={{ width: 72, height: 72, borderRadius: 12 }} contentFit="cover" />
      ))}
    </ScrollView>
  );
}
